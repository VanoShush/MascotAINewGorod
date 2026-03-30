"""
cache.py — Redis-клиент для всего приложения.

Redis теперь ОБЯЗАТЕЛЕН. Без него приложение не запустится.
Причины:
  - Rate limiting между воркерами Gunicorn (иначе каждый воркер считает отдельно)
  - Job-статусы загрузки документов (иначе теряются при запросе на другой воркер)
  - RAG-кэш матриц эмбеддингов (иначе каждый воркер строит свою копию)
  - Usage tracking счётчики (атомарные инкременты)

Импорт:
    from cache import redis_client
"""

import os
import redis as redis_lib

REDIS_URL = os.getenv("REDIS_URL")

if not REDIS_URL:
    raise RuntimeError(
        "❌ REDIS_URL не задан!\n"
        "Redis обязателен для корректной работы при нескольких воркерах Gunicorn.\n"
        "Добавьте REDIS_URL в переменные окружения (например: redis://localhost:6379/0)."
    )

try:
    redis_client = redis_lib.from_url(
        REDIS_URL,
        decode_responses=False,   # bytes — нужно для numpy матриц
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    redis_client.ping()
    print("✅ Redis подключён:", REDIS_URL.split("@")[-1])
except Exception as e:
    raise RuntimeError(
        f"❌ Redis недоступен: {e}\n"
        f"Проверьте REDIS_URL и доступность Redis-сервера."
    ) from e
