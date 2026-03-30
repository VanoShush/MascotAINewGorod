"""
rag.py — модуль RAG (Retrieval-Augmented Generation).

Single-tenant изменения:
  - Убран client_id из всех функций и ключей кэша
  - Единый кэш матрицы эмбеддингов для одной базы знаний
  - Единый _mem_cache (не словарь по client_id, а одна запись)
"""

import io
import json
import re
import time
from typing import Dict, List, Optional, Tuple

import numpy as np

from cache import redis_client

SIMILARITY_THRESHOLD = 0.62
TOP_K               = 5      # максимум чанков в контекст
CACHE_TTL           = 3600   # 1 час

_KEY_MATRIX = "mascot:rag_matrix"
_KEY_DATA   = "mascot:rag_data"
_mem_cache: Optional[Dict] = None   # одна запись {matrix, items, ts}


# ---------------------------------------------------------------------------
# Чанкинг текста
# ---------------------------------------------------------------------------

def chunk_text(text: str, max_words: int = 300, overlap_words: int = 40) -> List[str]:
    """
    Нарезает произвольный текст на семантические чанки.

    Стратегия:
      1. Делим по двойным переносам строк (абзацы).
      2. Короткие абзацы склеиваем со следующим.
      3. Длинные абзацы делим по предложениям.
      4. Добавляем overlap: конец предыдущего чанка перекрывается с началом следующего.
    """
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[ \t]+', ' ', text)

    paragraphs = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]

    def wc(s: str) -> int:
        return len(s.split())

    # Склеиваем короткие абзацы
    merged: List[str] = []
    buf = ""
    for para in paragraphs:
        if buf:
            candidate = buf + "\n\n" + para
            if wc(candidate) <= max_words:
                buf = candidate
                continue
            merged.append(buf)
        buf = para
    if buf:
        merged.append(buf)

    # Разбиваем длинные блоки по предложениям
    sentence_end = re.compile(r'(?<=[.!?])\s+')
    raw_chunks: List[str] = []
    for block in merged:
        if wc(block) <= max_words:
            raw_chunks.append(block)
        else:
            sentences = sentence_end.split(block)
            current = ""
            for sent in sentences:
                candidate = (current + " " + sent).strip()
                if wc(candidate) <= max_words:
                    current = candidate
                else:
                    if current:
                        raw_chunks.append(current)
                    current = sent
            if current:
                raw_chunks.append(current)

    if overlap_words <= 0 or len(raw_chunks) <= 1:
        return [c for c in raw_chunks if c.strip()]

    # Добавляем overlap
    final: List[str] = [raw_chunks[0]]
    for i in range(1, len(raw_chunks)):
        prev_words   = raw_chunks[i - 1].split()
        overlap_text = " ".join(prev_words[-overlap_words:]) if len(prev_words) > overlap_words else raw_chunks[i - 1]
        final.append(overlap_text + "\n" + raw_chunks[i])

    return [c.strip() for c in final if c.strip()]


# ---------------------------------------------------------------------------
# Кэш
# ---------------------------------------------------------------------------

def invalidate_rag_cache() -> None:
    """Инвалидировать кэш после загрузки или удаления документа."""
    global _mem_cache
    if redis_client:
        redis_client.delete(_KEY_MATRIX)
        redis_client.delete(_KEY_DATA)
    _mem_cache = None


def _get_cache() -> Optional[Dict]:
    global _mem_cache
    if redis_client:
        try:
            raw_m = redis_client.get(_KEY_MATRIX)
            raw_d = redis_client.get(_KEY_DATA)
            if raw_m and raw_d:
                matrix = np.load(io.BytesIO(raw_m), allow_pickle=False)
                data   = json.loads(raw_d.decode('utf-8'))
                return {"matrix": matrix, "items": data}
        except Exception as e:
            print(f"⚠️  RAG Redis read error: {e}")
    return _mem_cache


def _set_cache(items: List[Dict], matrix: np.ndarray) -> None:
    global _mem_cache
    if redis_client:
        try:
            buf = io.BytesIO()
            np.save(buf, matrix)
            redis_client.set(_KEY_MATRIX, buf.getvalue(), ex=CACHE_TTL)
            redis_client.set(_KEY_DATA,
                             json.dumps(items, ensure_ascii=False).encode(), ex=CACHE_TTL)
            return
        except Exception as e:
            print(f"⚠️  RAG Redis write error: {e}")
    _mem_cache = {"matrix": matrix, "items": items, "ts": time.time()}


# ---------------------------------------------------------------------------
# Загрузка чанков из БД
# ---------------------------------------------------------------------------

def _load_chunks() -> Tuple[List[Dict], np.ndarray]:
    """
    Загружает все knowledge-чанки из БД.
    Возвращает список метаданных и нормализованную матрицу эмбеддингов.
    """
    from models import ClientKnowledgeChunk

    chunks = ClientKnowledgeChunk.query.all()
    valid  = [c for c in chunks if c.embedding]

    if not valid:
        return [], np.empty((0,), dtype=np.float32)

    items = [{"text": c.chunk_text, "source": c.source_filename} for c in valid]

    raw   = np.array([c.embedding for c in valid], dtype=np.float32)
    norms = np.linalg.norm(raw, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1e-9, norms)
    matrix = (raw / norms).astype(np.float32)

    return items, matrix


# ---------------------------------------------------------------------------
# Публичный API поиска
# ---------------------------------------------------------------------------

def get_relevant_context(user_message: str) -> str:
    """
    Найти TOP_K наиболее релевантных чанков из базы знаний.

    Возвращает отформатированную строку для подстановки в промпт.
    Пустая строка — если база знаний не заполнена.
    """
    from gemini_logic import get_embedding

    cached = _get_cache()
    if cached is None:
        items, matrix = _load_chunks()
        if not items:
            return ""
        _set_cache(items, matrix)
        cached = {"matrix": matrix, "items": items}

    items: List[Dict]  = cached["items"]
    matrix: np.ndarray = cached["matrix"]

    if not items:
        return ""

    try:
        user_vec = np.array(get_embedding(user_message), dtype=np.float32)
    except Exception as e:
        print(f"⚠️  RAG embedding error: {e}")
        return ""

    norm = np.linalg.norm(user_vec)
    if norm == 0:
        return ""
    user_vec = user_vec / norm

    similarities = matrix.dot(user_vec)
    top_indices  = np.argsort(similarities)[::-1]

    results: List[str] = []
    for idx in top_indices:
        if similarities[idx] < SIMILARITY_THRESHOLD:
            break
        results.append(items[idx]["text"])
        if len(results) >= TOP_K:
            break

    return "\n\n---\n\n".join(results) if results else ""