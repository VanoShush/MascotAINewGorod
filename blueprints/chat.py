"""
blueprints/chat.py — публичный API чата маскота (/api/chat).

Single-tenant изменения:
  - Убран api_key из ChatRequestSchema (нет lookup по секрету)
  - Вместо ClientConfig читаем AppConfig.query.first()
  - check_domain(request) без config
  - check_client_rate_limit(ip) без tier/client_id
  - Убраны вызовы track_embedding из usage.py
  - _log_chat без client_id
"""

import json
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, Response, stream_with_context
from pydantic import BaseModel, Field, ValidationError, field_validator
from typing import List, Any

from models import db, ChatLog
from security import check_domain, get_real_ip
from rate_limiting import check_client_rate_limit
from rag import get_relevant_context
from gemini_logic import (
    get_gemini_action,
    get_gemini_action_stream,
    extract_search_params,
    fetch_catalog_results,
    _build_catalog_context,
)

chat_bp = Blueprint("chat", __name__)

# ---------------------------------------------------------------------------
# Pydantic схемы валидации
# ---------------------------------------------------------------------------

MAX_MESSAGE_LENGTH = 1000
MAX_HISTORY_ITEMS  = 5
MAX_CONTEXT_ITEMS  = 100


class ChatMessageSchema(BaseModel):
    role: str
    content: str = Field(max_length=2000)


class ChatRequestSchema(BaseModel):
    user_message: str            = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    page_context: List[Any]      = Field(default=[])
    chat_history: List[ChatMessageSchema] = Field(default=[])
    session_id: str              = Field(default="", max_length=64)
    page_url: str                = Field(default="", max_length=500)

    @field_validator("page_context")
    @classmethod
    def limit_context(cls, v):
        return v[:MAX_CONTEXT_ITEMS]

    @field_validator("chat_history")
    @classmethod
    def limit_history(cls, v):
        return v[-MAX_HISTORY_ITEMS:]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _log_chat(session_id, page_url, user_message, bot_response, action):
    """Записать диалог в ChatLog. Не бросает исключений."""
    try:
        action_type = None
        if isinstance(action, dict):
            action_type = action.get("type")
        log = ChatLog(
            session_id=session_id or None,
            page_url=page_url or None,
            user_message=user_message,
            bot_response=bot_response,
            action_type=action_type,
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"⚠️  Ошибка записи в ChatLog: {e}", flush=True)


# ---------------------------------------------------------------------------
# Роут
# ---------------------------------------------------------------------------

@chat_bp.route("/api/chat", methods=["POST"])
def chat_endpoint():
    raw_data = request.get_json(silent=True)
    if not raw_data:
        return jsonify({"error": "Невалидный JSON."}), 400

    try:
        payload = ChatRequestSchema.model_validate(raw_data)
    except ValidationError as e:
        return jsonify({"error": "Ошибка валидации.", "details": e.errors()}), 422

    # Единственная конфигурация приложения
    from models import AppConfig
    config = AppConfig.query.first()
    if not config:
        return jsonify({"error": "Конфигурация приложения не найдена."}), 500

    if not check_domain(request):
        return jsonify({"error": "Доступ с этого домена запрещён."}), 403

    user_ip = get_real_ip()
    allowed, reason = check_client_rate_limit(user_ip)
    if not allowed:
        return jsonify({"error": reason}), 429

    knowledge_context = get_relevant_context(payload.user_message)
    history_dicts = [{"role": m.role, "content": m.content} for m in payload.chat_history]

    catalog_context = ""
    if config.catalog_api_url and config.catalog_api_url.strip():
        params = extract_search_params(payload.user_message, config.catalog_api_params or "")
        if params:
            results = fetch_catalog_results(config.catalog_api_url, params)
            catalog_context = _build_catalog_context(results, config.catalog_api_response or "")

    wants_stream = request.headers.get("Accept") == "text/event-stream"

    if wants_stream:
        def generate():
            full_text = ""
            final_action = None
            try:
                for chunk_str in get_gemini_action_stream(
                    user_message=payload.user_message,
                    page_context_data=payload.page_context,
                    chat_history=history_dicts,
                    knowledge_context=knowledge_context,
                    system_prompt=config.system_prompt,
                    catalog_context=catalog_context,
                ):
                    yield chunk_str
                    try:
                        chunk_data = json.loads(chunk_str.strip())
                        if "chunk" in chunk_data:
                            full_text += chunk_data["chunk"]
                        if chunk_data.get("done"):
                            final_action = chunk_data.get("action")
                    except Exception:
                        pass
            finally:
                _log_chat(
                    session_id=payload.session_id,
                    page_url=payload.page_url,
                    user_message=payload.user_message,
                    bot_response=full_text,
                    action=final_action,
                )

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    ai_response = get_gemini_action(
        user_message=payload.user_message,
        page_context_data=payload.page_context,
        chat_history=history_dicts,
        knowledge_context=knowledge_context,
        system_prompt=config.system_prompt,
        catalog_context=catalog_context,
    )

    _log_chat(
        session_id=payload.session_id,
        page_url=payload.page_url,
        user_message=payload.user_message,
        bot_response=ai_response.get("response_text", ""),
        action=ai_response.get("action"),
    )

    return jsonify(ai_response)