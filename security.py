"""
security.py — централизованный модуль безопасности.

Изменения single-tenant:
  - CORS читает домены из таблицы AllowedDomain (вместо ClientDomain)
  - check_domain() не принимает config — читает AllowedDomain напрямую
  - Остальное (get_real_ip, validate_catalog_url) без изменений
"""

import ipaddress
import time
from urllib.parse import urlparse

from flask import request, Response

# ---------------------------------------------------------------------------
# Приватные IP-сети (для SSRF-защиты)
# ---------------------------------------------------------------------------

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # link-local / AWS metadata endpoint
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_BLOCKED_HOSTNAMES = {
    "localhost",
    "0.0.0.0",
    "metadata.google.internal",   # GCP metadata
    "169.254.169.254",            # AWS/Azure metadata
}


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# 1. Исправление IP-спуфинга через X-Forwarded-For
# ---------------------------------------------------------------------------

def get_real_ip() -> str:
    """
    Возвращает реальный IP клиента, устойчивый к X-Forwarded-For спуфингу.

    Render/nginx добавляет реальный IP в конец цепочки.
    Берём последний публичный IP — он добавлен доверенным прокси.
    """
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        ips = [ip.strip() for ip in forwarded_for.split(",")]
        for ip in reversed(ips):
            try:
                addr = ipaddress.ip_address(ip)
                if not addr.is_private and not addr.is_loopback and not addr.is_link_local:
                    return ip
            except ValueError:
                continue
        if ips:
            return ips[0]
    return request.remote_addr or "0.0.0.0"


# ---------------------------------------------------------------------------
# 2. SSRF-защита для catalog_api_url
# ---------------------------------------------------------------------------

def validate_catalog_url(url: str) -> tuple[bool, str]:
    """
    Проверяет URL каталога на безопасность (SSRF-защита).
    Пустой URL считается валидным.
    """
    if not url or not url.strip():
        return True, ""

    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False, "Невалидный URL"

    if parsed.scheme not in ("http", "https"):
        return False, "URL должен начинаться с http:// или https://"

    hostname = parsed.hostname
    if not hostname:
        return False, "URL не содержит hostname"

    if hostname.lower() in _BLOCKED_HOSTNAMES:
        return False, f"Hostname '{hostname}' недопустим"

    if hostname.lower().endswith((".local", ".internal", ".localhost")):
        return False, f"Hostname '{hostname}' указывает на внутреннюю сеть"

    if _is_private_ip(hostname):
        return False, f"IP '{hostname}' указывает на внутреннюю или зарезервированную сеть"

    return True, ""


# ---------------------------------------------------------------------------
# 3. Проверка домена запроса
# ---------------------------------------------------------------------------

def _normalize_host(raw: str) -> str:
    host = raw.lower().strip()
    host = host.replace("www.", "")
    host = host.split(":")[0]
    return host


def is_domain_allowed(origin: str, allowed_domain: str) -> bool:
    if not origin or not allowed_domain:
        return False
    parsed = urlparse(origin)
    origin_host = _normalize_host(parsed.netloc or parsed.path)
    allowed_host = _normalize_host(allowed_domain)
    return origin_host == allowed_host


def check_domain(req) -> bool:
    """
    Возвращает True если запрос разрешён.

    Домены читаются из таблицы AllowedDomain (без client_id).
    Нет доменов в БД → запрет (безопасный дефолт).
    Прямые запросы без Origin и localhost — разрешены.
    """
    origin = req.headers.get("Origin") or req.headers.get("Referer", "")

    if not origin:
        return True  # прямой запрос без браузера

    if "localhost" in origin or "127.0.0.1" in origin:
        return True

    from models import AllowedDomain
    allowed_domains = [d.domain for d in AllowedDomain.query.all()]

    if not allowed_domains:
        # Нет доменов = запрет (не пускать всех)
        return False

    return any(is_domain_allowed(origin, d) for d in allowed_domains)


# ---------------------------------------------------------------------------
# 4. Динамический CORS (читает из AllowedDomain)
# ---------------------------------------------------------------------------

_cors_cache: dict = {"origins": set(), "expires_at": 0.0}
_CORS_CACHE_TTL = 60  # секунд


def _refresh_cors_origins() -> None:
    from models import AllowedDomain
    try:
        domains = [d.domain for d in AllowedDomain.query.all()]
        origins: set[str] = set()
        for d in domains:
            origins.add(f"https://{d}")
            origins.add(f"https://www.{d}")
            origins.add(f"http://{d}")
            origins.add(f"http://www.{d}")
        _cors_cache["origins"] = origins
        _cors_cache["expires_at"] = time.time() + _CORS_CACHE_TTL
    except Exception:
        pass  # при ошибке БД используем устаревший кэш


def _is_cors_allowed(origin: str) -> bool:
    if not origin:
        return False
    if "localhost" in origin or "127.0.0.1" in origin:
        return True
    if time.time() >= _cors_cache["expires_at"]:
        _refresh_cors_origins()
    return origin in _cors_cache["origins"]


def configure_cors(app) -> None:
    """
    Настраивает динамический CORS.
    Admin-роуты: CORS отключён.
    Публичные API: Origin проверяется по таблице AllowedDomain из БД.
    """

    @app.before_request
    def handle_cors_preflight():
        if request.method != "OPTIONS":
            return None
        if request.path.startswith("/api/admin") or request.path == "/admin":
            return None
        origin = request.headers.get("Origin", "")
        if not _is_cors_allowed(origin):
            return Response(status=403)
        resp = app.make_default_options_response()
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Admin-Secret"
        resp.headers["Access-Control-Max-Age"] = "3600"
        resp.headers["Vary"] = "Origin"
        return resp

    @app.after_request
    def set_cors_headers(response):
        if request.path.startswith("/api/admin") or request.path == "/admin":
            return response
        origin = request.headers.get("Origin", "")
        if _is_cors_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response