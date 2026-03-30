"""
gemini_logic.py — логика работы с Gemini AI.

Single-tenant изменения:
  - Убраны все вызовы track_chat() и track_embedding() из usage.py
  - Убраны блоки if client_id: ... вокруг трекинга
  - Параметр client_id убран из сигнатур публичных функций
  - Логика AI без изменений
"""

import json
import os
import time
from typing import Any, Dict, Generator, List

from dotenv import load_dotenv
from google import genai
from google.genai import types

from schemas import MascotResponse

load_dotenv('MyApiConstr.env')

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("❌ GEMINI_API_KEY не найден в переменных окружения!")

client = genai.Client(api_key=api_key)

MAX_HISTORY_MESSAGES = 10


def invalidate_faq_cache() -> None:
    """Обратная совместимость. Делегирует в rag.invalidate_rag_cache."""
    from rag import invalidate_rag_cache
    invalidate_rag_cache()


# ---------------------------------------------------------------------------
# Эмбеддинги
# ---------------------------------------------------------------------------

def get_embedding(text: str) -> list[float]:
    response = client.models.embed_content(model='gemini-embedding-001', contents=text)
    return response.embeddings[0].values


def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Батч эмбеддингов (до 100 текстов за запрос)."""
    BATCH_SIZE = 100
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i: i + BATCH_SIZE]
        response = client.models.embed_content(model='gemini-embedding-001', contents=batch)
        all_embeddings.extend([e.values for e in response.embeddings])
    return all_embeddings


def get_embeddings_batch_with_retry(texts: list[str], max_retries: int = 3) -> list[list[float]]:
    """
    Батч эмбеддингов с экспоненциальным retry (1s → 2s → 4s).
    Защищает от временных ошибок 429/503 при загрузке документов.
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return get_embeddings_batch(texts)
        except Exception as e:
            last_error = e
            error_str = str(e)
            is_retryable = any(c in error_str for c in ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE"))
            if not is_retryable:
                raise
            wait = 2 ** attempt
            print(f"⚠️  Retry {attempt+1}/{max_retries} через {wait}s... ({e})")
            time.sleep(wait)
    raise last_error


# ---------------------------------------------------------------------------
# Каталог API — двухшаговый поиск
# ---------------------------------------------------------------------------

def extract_search_params(user_message: str, params_description: str) -> dict | None:
    """
    ШАГ 1: Просим Gemini извлечь параметры поиска из сообщения пользователя.
    """
    prompt = f"""Ты — парсер поисковых запросов. Извлеки параметры поиска из сообщения пользователя.

API принимает следующие параметры:
{params_description}

Сообщение пользователя: "{user_message}"

Верни ТОЛЬКО валидный JSON объект с параметрами которые удалось извлечь.
Если параметр не упомянут — не включай его в JSON.
Если сообщение не является поисковым запросом — верни {{}}.
Никакого текста кроме JSON."""

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=300,
            )
        )
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"[extract_search_params] Ошибка: {e}")
        return None


def fetch_catalog_results(api_url: str, params: dict) -> list:
    """
    ШАГ 2: GET-запрос к API каталога с извлечёнными параметрами.
    Использует httpx с таймаутом 3с.
    """
    import httpx

    if not params:
        return []

    try:
        with httpx.Client(timeout=3.0) as http:
            response = http.get(api_url, params=params, headers={"Accept": "application/json"})
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list):
                return data[:10]
            if isinstance(data, dict):
                for key in ("results", "items", "data", "apartments", "products"):
                    if isinstance(data.get(key), list):
                        return data[key][:10]
        return []
    except httpx.TimeoutException:
        print(f"[fetch_catalog_results] Таймаут запроса к {api_url}")
        return []
    except Exception as e:
        print(f"[fetch_catalog_results] Ошибка запроса к {api_url}: {e}")
        return []


def _build_catalog_context(results: list, response_description: str) -> str:
    """Форматирует результаты каталога в текст для промпта."""
    if not results:
        return "РЕЗУЛЬТАТЫ ПОИСКА: Ничего не найдено по заданным критериям."
    desc = f"\n\nФормат результатов: {response_description}" if response_description else ""
    results_text = json.dumps(results, ensure_ascii=False, indent=2)
    return f"РЕЗУЛЬТАТЫ ПОИСКА ПО КАТАЛОГУ ({len(results)} шт.):{desc}\n{results_text}"


def _build_prompt(user_message, page_context_data, chat_history, knowledge_context, system_prompt, catalog_context=""):
    context_lines = []
    for item in page_context_data:
        context_lines.append(
            f"[{item.get('type','unknown')}] '{item.get('text','')[:60]}' (ID: {item.get('selector','no-id')})"
        )
    context_text = "\n".join(context_lines) if context_lines else "Контекст пуст."

    history_text = ""
    if chat_history:
        lines = [f"{'User' if m.get('role')=='user' else 'Assistant'}: {m.get('content','')}"
                 for m in chat_history]
        history_text = "ИСТОРИЯ ДИАЛОГА (последние сообщения):\n" + "\n".join(lines) + "\n\n"

    instruction = f"""
{system_prompt}

ПРАВИЛА ОТВЕТА:
1. БАЗА ЗНАНИЙ — ГЛАВНЫЙ ИСТОЧНИК: Раздел БАЗА ЗНАНИЙ содержит информацию о компании,
   услугах, ценах и правилах. Используй её для ответов на вопросы пользователя.
2. ПРИОРИТЕТ: База знаний > Контекст страницы > Общие знания.
3. ЕСЛИ В БАЗЕ ЗНАНИЙ НЕТ ОТВЕТА: Отвечай как вежливый ассистент, опираясь на контекст страницы.
   Не придумывай факты о компании — честно скажи, что не знаешь.

ЛОГИКА ДЕЙСТВИЙ (ACTION):
4. Нашёл ответ — найди подходящий элемент в КОНТЕКСТЕ СТРАНИЦЫ.
5. HIGHLIGHT: Показать элемент → type: "HIGHLIGHT", selector: "..."
   Затем спроси: "Хотите, я перейду туда?"
6. NAVIGATE: Пользователь просит перейти, или ответил "Да/Давай" →
   type: "NAVIGATE", selector: "..."
7. FILL_INPUT: Заполнить ОДНО поле →
   type: "FILL_INPUT", selector: "...", value: "..."
   Используй для строки поиска: запросы "найди", "поищи", "покажи".
   Составляй value кратко — только ключевые слова.
8. FILL_INPUTS: Заполнить НЕСКОЛЬКО полей одновременно →
   type: "FILL_INPUTS", fields: список объектов с полями selector и value.
   Заполняй только те поля, данные для которых явно есть в сообщении.
9. Подходящего элемента нет → action: null.

СТИЛЬ: Кратко, дружелюбно, 1–2 эмодзи.
ФОРМАТ: Только валидный JSON.
"""

    knowledge_section = f"\n\nБАЗА ЗНАНИЙ:\n{knowledge_context}" if knowledge_context else ""
    catalog_section   = f"\n\n{catalog_context}" if catalog_context else ""

    return (
        f"СИСТЕМНАЯ ИНСТРУКЦИЯ: {instruction}\n\n"
        f"КОНТЕКСТ СТРАНИЦЫ:\n{context_text}"
        f"{knowledge_section}"
        f"{catalog_section}\n\n"
        f"{history_text}"
        f"ВОПРОС ПОЛЬЗОВАТЕЛЯ: {user_message}"
    )


# ---------------------------------------------------------------------------
# Обычный ответ
# ---------------------------------------------------------------------------

def get_gemini_action(user_message, page_context_data, chat_history=None,
                      knowledge_context="", system_prompt="", catalog_context=""):
    if chat_history is None:
        chat_history = []
    prompt = _build_prompt(user_message, page_context_data,
                           chat_history[-MAX_HISTORY_MESSAGES:],
                           knowledge_context, system_prompt, catalog_context)
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=MascotResponse,
            ),
        )
        if not response.text:
            return {"response_text": "Пустой ответ от AI.", "action": None}
        return MascotResponse.model_validate_json(response.text).model_dump()
    except Exception as e:
        return _handle_gemini_error(e)


# ---------------------------------------------------------------------------
# Стриминговый ответ (NDJSON)
# ---------------------------------------------------------------------------

def get_gemini_action_stream(user_message, page_context_data, chat_history=None,
                             knowledge_context="", system_prompt="", catalog_context=""):
    """
    Генератор NDJSON-строк:
      {"chunk": "..."}              — кусок текста
      {"done": true, "action": ...} — конец, содержит action
      {"error": "..."}              — ошибка
    """
    if chat_history is None:
        chat_history = []
    prompt = _build_prompt(user_message, page_context_data,
                           chat_history[-MAX_HISTORY_MESSAGES:],
                           knowledge_context, system_prompt, catalog_context)
    full_text = ""
    try:
        stream = client.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=MascotResponse,
            ),
        )
        for chunk in stream:
            if chunk.text:
                full_text += chunk.text
                yield json.dumps({"chunk": chunk.text}, ensure_ascii=False) + "\n"

        if full_text:
            try:
                result = MascotResponse.model_validate_json(full_text).model_dump()
                yield json.dumps({"done": True, "action": result.get("action")}, ensure_ascii=False) + "\n"
            except Exception:
                yield json.dumps({"done": True, "action": None}, ensure_ascii=False) + "\n"
        else:
            yield json.dumps({"error": "Пустой ответ от AI."}, ensure_ascii=False) + "\n"

    except Exception as e:
        yield json.dumps({"error": _handle_gemini_error(e)["response_text"]}, ensure_ascii=False) + "\n"


# ---------------------------------------------------------------------------
# Ошибки
# ---------------------------------------------------------------------------

def _handle_gemini_error(e: Exception) -> Dict[str, Any]:
    error_str = str(e)
    print(f"🔥 Ошибка Gemini: {error_str}", flush=True)
    if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
        return {"response_text": "Ой! Я немного перегрелся. Попробуй чуть позже! ☕", "action": None}
    return {"response_text": "Извините, сервис временно недоступен.", "action": None}