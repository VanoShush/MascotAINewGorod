"""
extensions.py — общие Flask-расширения.

Создаём экземпляры расширений без привязки к app (паттерн Application Factory).
Инициализация через .init_app(app) выполняется в app.py.
"""

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Limiter для upload_faq (единственный роут где нужен flask-limiter декоратор).
# key_func будет переопределён в init_app через get_real_ip из security.py.
limiter = Limiter(key_func=get_remote_address)
