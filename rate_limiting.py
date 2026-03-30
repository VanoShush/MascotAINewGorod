"""
rate_limiting.py — rate limiting для чата и admin-эндпоинтов.

Single-tenant изменения:
  - Убраны RATE_LIMIT_TIERS и DEFAULT_TIER
  - Один плоский лимит из переменных окружения RATE_LIMIT_PER_HOUR / PER_MINUTE
  - check_client_rate_limit() принимает только ip (без client_id и tier)
  - check_admin_rate_limit() без изменений
"""

import os
import threading
import time
from typing import Dict

from cache import redis_client

# ---------------------------------------------------------------------------
# Лимиты из окружения
# ---------------------------------------------------------------------------

PER_HOUR   = int(os.getenv("RATE_LIMIT_PER_HOUR",   "100"))
PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))

# ---------------------------------------------------------------------------
# In-memory fallback (когда Redis недоступен)
# { key: {"count": int, "reset_at": float} }
# ---------------------------------------------------------------------------

_rl_mem: Dict[str, dict] = {}
_rl_lock = threading.Lock()


def _cleanup_rl_mem() -> None:
    """
    Удаляет устаревшие ключи из _rl_mem.
    Вызывается фоновым потоком раз в 5 минут.
    """
    while True:
        time.sleep(300)
        now = time.time()
        with _rl_lock:
            expired = [k for k, v in _rl_mem.items() if v.get("reset_at", 0) <= now]
            for k in expired:
                del _rl_mem[k]
        if expired:
            print(f"[rate_limiting] Очищено {len(expired)} устаревших RL-ключей", flush=True)


_cleanup_thread = threading.Thread(target=_cleanup_rl_mem, daemon=True)
_cleanup_thread.start()


# ---------------------------------------------------------------------------
# Клиентский rate limit (по IP, плоский лимит из .env)
# ---------------------------------------------------------------------------

def check_client_rate_limit(ip: str) -> tuple[bool, str]:
    """
    Проверяет скользящие лимиты для пользователя по IP.

    Два счётчика: минутный и часовой.
    Лимиты берутся из RATE_LIMIT_PER_MINUTE и RATE_LIMIT_PER_HOUR.
    При наличии Redis — атомарный pipeline (общий для всех воркеров Gunicorn).
    """
    now = time.time()
    current_minute = int(now // 60)
    current_hour   = int(now // 3600)

    key_min  = f"mascot:rl:min:{ip}:{current_minute}"
    key_hour = f"mascot:rl:hour:{ip}:{current_hour}"

    if redis_client:
        pipe = redis_client.pipeline()
        pipe.incr(key_min)
        pipe.expire(key_min, 90)
        pipe.incr(key_hour)
        pipe.expire(key_hour, 7200)
        results = pipe.execute()
        count_min, _, count_hour, _ = results

        if count_min > PER_MINUTE:
            return False, f"Слишком много сообщений. Подождите минуту ({PER_MINUTE} запросов/мин)."
        if count_hour > PER_HOUR:
            return False, f"Превышен часовой лимит ({PER_HOUR} запросов/час). Попробуйте позже."
        return True, ""

    # In-memory fallback
    with _rl_lock:
        for key, limit, ttl in [
            (key_min,  PER_MINUTE, 90),
            (key_hour, PER_HOUR,   7200),
        ]:
            entry = _rl_mem.get(key)
            if entry and entry["reset_at"] > now:
                entry["count"] += 1
            else:
                entry = {"count": 1, "reset_at": now + ttl}
                _rl_mem[key] = entry

            if entry["count"] > limit:
                label = "минуту" if ttl == 90 else "час"
                lim   = PER_MINUTE if ttl == 90 else PER_HOUR
                return False, f"Слишком много запросов. Подождите {label} ({lim} запросов)."
    return True, ""


# ---------------------------------------------------------------------------
# Admin rate limit (по IP, 30 запросов в минуту)
# ---------------------------------------------------------------------------

_ADMIN_LIMIT_PER_MINUTE = 30
_ADMIN_LIMIT_PER_HOUR   = 300


def check_admin_rate_limit(ip: str) -> tuple[bool, str]:
    """
    Проверяет лимиты для admin-эндпоинтов.
    30 запросов/мин, 300/час на один IP.
    """
    now = time.time()
    current_minute = int(now // 60)
    current_hour   = int(now // 3600)

    key_min  = f"mascot:admin_rl:min:{ip}:{current_minute}"
    key_hour = f"mascot:admin_rl:hour:{ip}:{current_hour}"

    if redis_client:
        pipe = redis_client.pipeline()
        pipe.incr(key_min);  pipe.expire(key_min, 90)
        pipe.incr(key_hour); pipe.expire(key_hour, 7200)
        results = pipe.execute()
        count_min, _, count_hour, _ = results

        if count_min > _ADMIN_LIMIT_PER_MINUTE:
            return False, "Слишком много запросов к admin API. Подождите минуту."
        if count_hour > _ADMIN_LIMIT_PER_HOUR:
            return False, "Превышен часовой лимит admin API."
        return True, ""

    with _rl_lock:
        for key, limit, ttl in [
            (key_min,  _ADMIN_LIMIT_PER_MINUTE, 90),
            (key_hour, _ADMIN_LIMIT_PER_HOUR,   7200),
        ]:
            entry = _rl_mem.get(key)
            if entry and entry["reset_at"] > now:
                entry["count"] += 1
            else:
                entry = {"count": 1, "reset_at": now + ttl}
                _rl_mem[key] = entry
            if entry["count"] > limit:
                return False, "Слишком много запросов к admin API. Попробуйте позже."
    return True, ""