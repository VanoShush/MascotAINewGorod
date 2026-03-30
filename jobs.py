"""
jobs.py — управление статусами фоновых задач.

Использует Redis если доступен (общий для всех воркеров Gunicorn).
Иначе — in-memory dict (теряется при рестарте, работает только с 1 воркером).
"""

import json
from cache import redis_client

_local_jobs: dict = {}
_JOB_TTL = 3600  # 1 час


def _job_key(job_id: str) -> str:
    return f"mascot:job:{job_id}"


def get_job_status(job_id: str) -> dict | None:
    if redis_client:
        raw = redis_client.get(_job_key(job_id))
        return json.loads(raw.decode()) if raw else None
    return _local_jobs.get(job_id)


def set_job_status(job_id: str, status: dict) -> None:
    if redis_client:
        redis_client.set(
            _job_key(job_id),
            json.dumps(status, ensure_ascii=False).encode(),
            ex=_JOB_TTL,
        )
    else:
        _local_jobs[job_id] = status
