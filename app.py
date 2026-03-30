"""
app.py — точка входа. Application Factory паттерн.

Single-tenant изменения:
  - Удалены _ensure_api_secrets() и _run_migrations()
  - Удалён импорт и запуск start_flush_thread() из usage.py
  - Добавлена инициализация AppConfig по умолчанию при первом запуске
  - Убраны алиасы обратной совместимости (не нужны в новом деплое)
"""

import os

from dotenv import load_dotenv
from flask import Flask

from models import db
from extensions import limiter
from security import configure_cors, get_real_ip

load_dotenv("MyApiConstr.env")


def create_app() -> Flask:
    app = Flask(__name__)

    # ------------------------------------------------------------------
    # 1. Конфигурация БД
    # ------------------------------------------------------------------
    database_url = os.getenv("DATABASE_URL", "sqlite:///local_test.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle":  300,
        "pool_timeout":  30,
        "pool_size":     5,
        "max_overflow":  10,
        "connect_args": {
            "connect_timeout":    10,
            "keepalives":         1,
            "keepalives_idle":    30,
            "keepalives_interval":10,
            "keepalives_count":   5,
        },
    }

    # ------------------------------------------------------------------
    # 2. Обязательные переменные окружения
    # ------------------------------------------------------------------
    if not os.getenv("ADMIN_SECRET"):
        raise RuntimeError("❌ ADMIN_SECRET не задан в окружении!")
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("❌ GEMINI_API_KEY не задан в окружении!")

    # ------------------------------------------------------------------
    # 3. Инициализация расширений
    # ------------------------------------------------------------------
    db.init_app(app)

    limiter.init_app(app)
    limiter._key_func = get_real_ip
    app.config["RATELIMIT_STORAGE_URI"] = os.getenv("REDIS_URL")

    # ------------------------------------------------------------------
    # 4. Динамический CORS
    # ------------------------------------------------------------------
    configure_cors(app)

    # ------------------------------------------------------------------
    # 5. Регистрация blueprints
    # ------------------------------------------------------------------
    from blueprints.chat   import chat_bp
    from blueprints.public import public_bp
    from blueprints.admin  import admin_bp

    app.register_blueprint(chat_bp,   url_prefix="/api/v1")
    app.register_blueprint(public_bp, url_prefix="/api/v1")
    app.register_blueprint(admin_bp)

    # ------------------------------------------------------------------
    # 6. Создание таблиц и начальная запись AppConfig
    # ------------------------------------------------------------------
    with app.app_context():
        db.create_all()
        _ensure_app_config()

    # ------------------------------------------------------------------
    # 7. Фоновый поток: автоудаление старых записей ChatLog
    # ------------------------------------------------------------------
    _start_cleanup_thread(app)

    return app


def _ensure_app_config() -> None:
    """
    Создаёт запись AppConfig с дефолтными значениями при первом запуске.
    Безопасно запускать повторно — создаёт только если записи нет.
    """
    from models import AppConfig
    if not AppConfig.query.first():
        db.session.add(AppConfig())
        db.session.commit()
        print("✅ AppConfig создан с настройками по умолчанию", flush=True)


def _start_cleanup_thread(app) -> None:
    """
    Удаляет записи ChatLog старше CHAT_LOG_RETENTION_DAYS дней.
    Запускается раз в 24 часа.
    """
    import threading
    import time
    from datetime import datetime, timedelta, timezone

    retention_days = int(os.getenv("CHAT_LOG_RETENTION_DAYS", "90"))

    def cleanup():
        while True:
            time.sleep(86400)  # 24 часа
            try:
                with app.app_context():
                    from models import db, ChatLog
                    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
                    deleted = ChatLog.query.filter(
                        ChatLog.created_at < cutoff
                    ).delete(synchronize_session=False)
                    db.session.commit()
                    if deleted:
                        print(f"🗑️  Удалено {deleted} старых записей ChatLog (старше {retention_days} дней)", flush=True)
            except Exception as e:
                print(f"⚠️  ChatLog cleanup error: {e}", flush=True)

    t = threading.Thread(target=cleanup, daemon=True)
    t.start()
    print(f"✅ Cleanup thread started (каждые 24ч, хранение {retention_days} дней)", flush=True)


# ------------------------------------------------------------------
# Запуск напрямую (python app.py)
# ------------------------------------------------------------------
app = create_app()

if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 3000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"🚀 Mascot Backend на http://0.0.0.0:{port}  (debug={debug})")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)