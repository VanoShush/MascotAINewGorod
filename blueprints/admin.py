"""
blueprints/admin.py — все admin-роуты.

Single-tenant изменения:
  - Удалены роуты CRUD клиентов (list/save/delete/rotate-secret)
  - Удалены роуты usage (per-client и суммарный)
  - Добавлены GET/POST /api/admin/config → AppConfig
  - Домены переориентированы на AllowedDomain (без client_id)
  - Документы переориентированы без client_id в пути
  - Статистика без фильтра по client_id
"""

import json
import os
import threading
import time
import uuid
import re
from collections import Counter
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, send_from_directory, current_app
from sqlalchemy import func, distinct

from extensions import limiter
from models import db, AllowedDomain, ClientKnowledgeChunk, ChatLog
from security import get_real_ip, validate_catalog_url
from rate_limiting import check_admin_rate_limit
from jobs import get_job_status, set_job_status
from gemini_logic import get_embeddings_batch_with_retry
from rag import chunk_text, invalidate_rag_cache

admin_bp = Blueprint("admin", __name__)

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


# ---------------------------------------------------------------------------
# Хелперы
# ---------------------------------------------------------------------------

def require_admin(req) -> bool:
    return req.headers.get("X-Admin-Secret") == ADMIN_SECRET


@admin_bp.before_request
def admin_before_request():
    """
    /admin (HTML-страница) доступна без авторизации.
    Все /api/admin/* защищены: проверка секрета + rate limit.
    """
    if request.endpoint == "admin.admin_page":
        return None

    if not require_admin(request):
        return jsonify({"error": "Доступ запрещён"}), 403

    ip = get_real_ip()
    allowed, reason = check_admin_rate_limit(ip)
    if not allowed:
        return jsonify({"error": reason}), 429

    return None


# ---------------------------------------------------------------------------
# Admin UI
# ---------------------------------------------------------------------------

@admin_bp.route("/admin")
def admin_page():
    templates_dir = os.path.join(current_app.root_path, "templates")
    return send_from_directory(templates_dir, "admin.html")


# ---------------------------------------------------------------------------
# Конфигурация приложения (AppConfig)
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/config", methods=["GET"])
def get_config():
    from models import AppConfig
    config = AppConfig.query.first()
    if not config:
        return jsonify({"error": "Конфигурация не найдена"}), 404
    return jsonify({
        "primary_color":        config.primary_color        or "#4CAF50",
        "sprite_url":           config.sprite_url           or "AllSprites.png",
        "system_prompt":        config.system_prompt        or "",
        "position_corner":      config.position_corner      or "bottom-right",
        "position_bottom":      config.position_bottom      if config.position_bottom      is not None else 20,
        "position_side":        config.position_side        if config.position_side        is not None else 20,
        "auto_open":            config.auto_open            or "manual",
        "auto_open_delay":      config.auto_open_delay      if config.auto_open_delay      is not None else 5,
        "catalog_api_url":      config.catalog_api_url      or "",
        "catalog_api_params":   config.catalog_api_params   or "",
        "catalog_api_response": config.catalog_api_response or "",
    })


@admin_bp.route("/api/admin/config", methods=["POST"])
def update_config():
    from models import AppConfig
    data = request.get_json()
    if not data:
        return jsonify({"error": "Пустое тело запроса"}), 400

    catalog_url = data.get("catalog_api_url", "").strip()
    ok, err = validate_catalog_url(catalog_url)
    if not ok:
        return jsonify({"error": f"Невалидный catalog_api_url: {err}"}), 400

    config = AppConfig.query.first()
    if not config:
        config = AppConfig()
        db.session.add(config)

    config.primary_color        = data.get("primary_color",   "#4CAF50")
    config.sprite_url           = data.get("sprite_url",       "AllSprites.png")
    config.system_prompt        = data.get("system_prompt",    "Ты — ассистент.")
    config.position_corner      = data.get("position_corner",  "bottom-right")
    config.position_bottom      = int(data.get("position_bottom", 20))
    config.position_side        = int(data.get("position_side",   20))
    config.auto_open            = data.get("auto_open",        "manual")
    config.auto_open_delay      = int(data.get("auto_open_delay", 5))
    config.catalog_api_url      = catalog_url
    config.catalog_api_params   = data.get("catalog_api_params",   "").strip()
    config.catalog_api_response = data.get("catalog_api_response", "").strip()

    db.session.commit()
    return jsonify({"success": True, "message": "Настройки сохранены!"})


# ---------------------------------------------------------------------------
# Домены (AllowedDomain — без client_id)
# ---------------------------------------------------------------------------

@admin_bp.route("/api/admin/domains", methods=["GET"])
def get_domains():
    domains = AllowedDomain.query.all()
    return jsonify([{"id": d.id, "domain": d.domain} for d in domains])


@admin_bp.route("/api/admin/domains", methods=["POST"])
def add_domain():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Пустое тело запроса"}), 400

    raw = data.get("domain", "").strip().lower()
    raw = raw.replace("https://", "").replace("http://", "").replace("www.", "")
    domain = raw.rstrip("/").split("/")[0]

    if not domain:
        return jsonify({"error": "Укажите домен"}), 400

    exists = AllowedDomain.query.filter_by(domain=domain).first()
    if exists:
        return jsonify({"error": f"Домен {domain} уже добавлен"}), 409

    db.session.add(AllowedDomain(domain=domain))
    db.session.commit()
    return jsonify({"success": True, "domain": domain})


@admin_bp.route("/api/admin/domains/<int:domain_id>", methods=["DELETE"])
def delete_domain(domain_id):
    domain = db.session.get(AllowedDomain, domain_id)
    if not domain:
        return jsonify({"error": "Домен не найден"}), 404
    db.session.delete(domain)
    db.session.commit()
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# База знаний (документы без client_id)
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {".txt", ".md"}
MAX_DOC_SIZE_BYTES  = 2 * 1024 * 1024   # 2 MB


@admin_bp.route("/api/admin/upload_document", methods=["POST"])
@limiter.limit("5 per minute")
def upload_document():
    """
    Загрузить текстовый документ (.txt, .md) в базу знаний.
    Нарезается на чанки, генерируются эмбеддинги.
    Возвращает job_id для polling статуса.
    """
    import os as _os

    if "file" not in request.files:
        return jsonify({"error": "Файл не найден в запросе"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Файл не выбран"}), 400

    ext = _os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Допустимые форматы: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    raw_bytes = file.read()
    if len(raw_bytes) > MAX_DOC_SIZE_BYTES:
        return jsonify({"error": f"Файл слишком большой (максимум {MAX_DOC_SIZE_BYTES // 1024 // 1024} МБ)"}), 400

    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return jsonify({"error": "Файл должен быть в кодировке UTF-8"}), 400

    text = text.strip()
    if not text:
        return jsonify({"error": "Файл пустой"}), 400

    chunks = chunk_text(text)
    if not chunks:
        return jsonify({"error": "Не удалось разбить текст на чанки"}), 400

    job_id = str(uuid.uuid4())
    set_job_status(job_id, {"status": "running", "progress": 0, "total": len(chunks)})

    flask_app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_document_upload,
        args=(flask_app, file.filename, chunks, job_id),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "success": True,
        "job_id":  job_id,
        "total":   len(chunks),
        "message": f"Файл разбит на {len(chunks)} чанков, генерируем эмбеддинги...",
    })


def _run_document_upload(flask_app, filename: str, chunks: list, job_id: str):
    """Фоновая задача: генерирует эмбеддинги и сохраняет чанки в БД."""
    with flask_app.app_context():
        try:
            db.session.remove()

            set_job_status(job_id, {"status": "running", "progress": 0, "total": len(chunks)})

            embeddings = get_embeddings_batch_with_retry(chunks)

            set_job_status(job_id, {"status": "running", "progress": len(chunks), "total": len(chunks)})

            # Удаляем старые чанки этого же файла (если загружается повторно)
            ClientKnowledgeChunk.query.filter_by(
                source_filename=filename,
            ).delete(synchronize_session=False)

            for idx, (chunk_text_val, embedding) in enumerate(zip(chunks, embeddings)):
                db.session.add(ClientKnowledgeChunk(
                    source_filename=filename,
                    chunk_index=idx,
                    chunk_text=chunk_text_val,
                    embedding=embedding,
                ))

            db.session.commit()
            invalidate_rag_cache()
            set_job_status(job_id, {"status": "done", "count": len(chunks), "filename": filename})

        except Exception as e:
            db.session.rollback()
            print(f"🔥 Ошибка загрузки документа {filename}: {e}", flush=True)
            set_job_status(job_id, {"status": "error", "message": str(e)})


@admin_bp.route("/api/admin/documents/<path:filename>/chunks", methods=["GET"])
def get_document_chunks(filename):
    """Вернуть все чанки документа для просмотра в UI."""
    chunks = ClientKnowledgeChunk.query.filter_by(
        source_filename=filename,
    ).order_by(ClientKnowledgeChunk.chunk_index).all()

    return jsonify({
        "filename": filename,
        "chunks": [{"index": c.chunk_index, "text": c.chunk_text} for c in chunks],
    })


@admin_bp.route("/api/admin/documents", methods=["GET"])
def list_documents():
    """Список загруженных документов (группировка по имени файла)."""
    rows = db.session.query(
        ClientKnowledgeChunk.source_filename,
        func.count(ClientKnowledgeChunk.id).label("chunks"),
    ).group_by(ClientKnowledgeChunk.source_filename).all()

    return jsonify([{"filename": r.source_filename, "chunks": r.chunks} for r in rows])


@admin_bp.route("/api/admin/documents/<path:filename>", methods=["DELETE"])
def delete_document(filename):
    """Удалить все чанки документа по имени файла."""
    deleted = ClientKnowledgeChunk.query.filter_by(
        source_filename=filename,
    ).delete(synchronize_session=False)
    db.session.commit()
    invalidate_rag_cache()
    return jsonify({"success": True, "deleted_chunks": deleted})


@admin_bp.route("/api/admin/jobs/<job_id>", methods=["GET"])
def get_job_status_endpoint(job_id):
    status = get_job_status(job_id)
    if status is None:
        return jsonify({"error": "Задача не найдена"}), 404
    return jsonify(status)


# ---------------------------------------------------------------------------
# Статистика (без фильтра по client_id)
# ---------------------------------------------------------------------------

def _normalize_question(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


@admin_bp.route("/api/admin/stats", methods=["GET"])
def get_stats():
    try:
        days = min(int(request.args.get("days", 7)), 30)
    except ValueError:
        days = 7

    since = datetime.now(timezone.utc) - timedelta(days=days)
    base_filter = [ChatLog.created_at >= since]

    total = db.session.query(func.count(ChatLog.id)).filter(*base_filter).scalar() or 0

    unique_sessions = db.session.query(
        func.count(distinct(ChatLog.session_id))
    ).filter(*base_filter, ChatLog.session_id.isnot(None)).scalar() or 0

    action_rows = db.session.query(
        ChatLog.action_type,
        func.count(ChatLog.id),
    ).filter(*base_filter).group_by(ChatLog.action_type).all()

    actions = {"HIGHLIGHT": 0, "NAVIGATE": 0, "FILL_INPUT": 0, "FILL_INPUTS": 0, "none": 0}
    for action_type, count in action_rows:
        key = action_type if action_type in ("HIGHLIGHT", "NAVIGATE", "FILL_INPUT", "FILL_INPUTS") else "none"
        actions[key] += count

    day_rows = db.session.query(
        func.date(ChatLog.created_at),
        func.count(ChatLog.id),
    ).filter(*base_filter).group_by(func.date(ChatLog.created_at)).all()

    by_day_map = {str(d): c for d, c in day_rows}
    days_range = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        days_range.append({"date": d, "count": by_day_map.get(d, 0)})

    messages = db.session.query(ChatLog.user_message).filter(*base_filter).all()
    messages = [m[0] for m in messages if m[0]]

    first_occurrence: dict = {}
    for msg in messages:
        norm = _normalize_question(msg)
        if norm not in first_occurrence:
            first_occurrence[norm] = msg

    top_questions = [
        {"question": first_occurrence[q], "count": c}
        for q, c in Counter(_normalize_question(m) for m in messages).most_common(10)
    ]

    return jsonify({
        "period_days":     days,
        "total_messages":  total,
        "unique_sessions": unique_sessions,
        "actions":         actions,
        "top_questions":   top_questions,
        "by_day":          days_range,
    })


@admin_bp.route("/api/admin/stats", methods=["DELETE"])
def reset_stats():
    try:
        deleted = ChatLog.query.delete(synchronize_session=False)
        db.session.commit()
        return jsonify({"success": True, "deleted": deleted})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500