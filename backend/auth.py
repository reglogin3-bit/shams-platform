"""Autentifikatsiya: sessiya tokenlari, rollar, ruxsatlar, oddiy rate limit."""

from __future__ import annotations

import os
import secrets
import time
from datetime import timedelta
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

import db

SESSION_COOKIE = "shams_session"
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "14"))
MAX_FAILS = 6
BLOCK_MIN = 10

_fails: dict[str, list] = {}


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        return False
    return check_password_hash(password_hash, password)


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or ""


def throttled(key: str) -> bool:
    entry = _fails.get(key)
    if not entry:
        return False
    count, ts = entry
    if time.time() - ts > BLOCK_MIN * 60:
        _fails.pop(key, None)
        return False
    return count >= MAX_FAILS


def note_fail(key: str) -> None:
    count, _ = _fails.get(key, (0, 0))
    _fails[key] = (count + 1, time.time())


def clear_fails(key: str) -> None:
    _fails.pop(key, None)


def create_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    created = db.now_local()
    expires = created + timedelta(days=SESSION_DAYS)
    conn.execute(
        "INSERT INTO staff_sessions (token, user_id, created_at, expires_at, ip, ua)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (token, user_id, db.iso(created), db.iso(expires), _client_ip(),
         (request.headers.get("User-Agent") or "")[:250]),
    )
    return token


def destroy_session(conn, token: str) -> None:
    if token:
        conn.execute("DELETE FROM staff_sessions WHERE token = ?", (token,))


def current_user(conn):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = conn.execute(
        "SELECT u.* FROM staff_sessions s JOIN users u ON u.id = s.user_id"
        " WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1",
        (token, db.iso()),
    ).fetchone()
    return row


def login_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            conn = db.connect()
            try:
                user = current_user(conn)
                if user is None:
                    return jsonify({"error": "Avval tizimga kiring", "code": "auth"}), 401
                if roles and user["role"] not in roles:
                    db.audit(conn, user, "denied", request.path, ip=_client_ip())
                    conn.commit()
                    return jsonify({"error": "Bu amal uchun ruxsat yo‘q", "code": "forbidden"}), 403
                g.user = user
                g.conn = conn
                # CSRF: holatni o'zgartiruvchi so'rovlarda maxsus sarlavha talab qilinadi
                if request.method in ("POST", "PATCH", "PUT", "DELETE"):
                    if request.headers.get("X-Requested-With") != "shams":
                        return jsonify({"error": "So‘rov rad etildi", "code": "csrf"}), 403
                return fn(*args, **kwargs)
            finally:
                conn.close()
        return wrapper
    return decorator


def kiosk_key_ok(conn) -> bool:
    expected = db.get_setting(conn, "kiosk_key")
    provided = request.headers.get("X-Kiosk-Key") or request.args.get("kiosk") or ""
    return bool(expected) and secrets.compare_digest(str(expected), str(provided))


def kiosk_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        conn = db.connect()
        try:
            if not kiosk_key_ok(conn):
                return jsonify({"error": "Kiosk kaliti noto‘g‘ri", "code": "kiosk"}), 401
            g.conn = conn
            return fn(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


def make_kiosk_token(conn, user_id: int, minutes: int = 20) -> str:
    token = secrets.token_urlsafe(24)
    created = db.now_local()
    conn.execute(
        "INSERT INTO kiosk_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, db.iso(created), db.iso(created + timedelta(minutes=minutes))),
    )
    conn.execute("DELETE FROM kiosk_tokens WHERE expires_at < ?", (db.iso(),))
    return token


def kiosk_token_user(conn, token: str):
    if not token:
        return None
    return conn.execute(
        "SELECT u.* FROM kiosk_tokens k JOIN users u ON u.id = k.user_id"
        " WHERE k.token = ? AND k.expires_at > ?",
        (token, db.iso()),
    ).fetchone()
