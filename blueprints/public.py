"""
blueprints/public.py — публичные эндпоинты: конфиг виджета и статические файлы.

Single-tenant изменения:
  - /api/config/<api_secret> → /api/config (без параметра)
  - Вместо поиска по api_secret — AppConfig.query.first()
  - Убрана проверка check_domain на этом роуте (конфиг публичный, без секретов)
"""

import os

from flask import Blueprint, jsonify, send_from_directory, current_app
from extensions import limiter

public_bp = Blueprint("public", __name__)


@public_bp.route("/sprites/<path:filename>")
def serve_sprite(filename):
    resp = send_from_directory(
        os.path.join(current_app.root_path, "sprites"), filename
    )
    # Спрайты меняются редко — кэшируем на 24 часа в браузере и 7 дней на CDN
    resp.headers["Cache-Control"] = "public, max-age=86400, s-maxage=604800"
    return resp


@public_bp.route("/mascot-widget.js")
def serve_widget_js():
    resp = send_from_directory(
        current_app.root_path, "mascot-widget.js", mimetype="application/javascript"
    )
    # Виджет версионируется деплоем — 1 час в браузере, 1 день на CDN
    resp.headers["Cache-Control"] = "public, max-age=3600, s-maxage=86400"
    return resp


@public_bp.route("/api/config", methods=["GET"])
@limiter.limit("60 per minute")
def get_client_config():
    """
    Публичный эндпоинт конфигурации виджета.
    Без ключа — конфиг единственный и не содержит секретов.
    """
    from models import AppConfig
    config = AppConfig.query.first()
    if not config:
        return jsonify({"error": "Конфигурация не найдена"}), 404

    return jsonify({
        "primary_color":   config.primary_color   or "#4CAF50",
        "sprite_url":      f"/sprites/{os.path.basename(config.sprite_url or 'AllSprites.png')}",
        "position_corner": config.position_corner  or "bottom-right",
        "position_bottom": config.position_bottom  if config.position_bottom is not None else 20,
        "position_side":   config.position_side    if config.position_side   is not None else 20,
        "auto_open":       config.auto_open        or "manual",
        "auto_open_delay": config.auto_open_delay  if config.auto_open_delay is not None else 5,
    })