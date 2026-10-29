"""Shams Platform — SQLite sxemasi va yordamchi funksiyalar.

Bitta fayl (SQLite + WAL) 3–4 guruh (≈60–120 bola) uchun yetarli va
zaxiralash uchun eng oddiy variant.
"""

from __future__ import annotations

import os
import sqlite3
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH") or os.path.join(BASE_DIR, "..", "data", "shams.db")
TZ = ZoneInfo(os.environ.get("APP_TZ", "Asia/Tashkent"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT NOT NULL DEFAULT 'student',
    username      TEXT UNIQUE,
    password_hash TEXT,
    full_name     TEXT NOT NULL,
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    birth_date    TEXT,
    parent_name   TEXT,
    parent_phone  TEXT,
    phone         TEXT,
    photo_enc     BLOB,
    face_enc      BLOB,
    face_count    INTEGER NOT NULL DEFAULT 0,
    consent_at    TEXT,
    consent_version TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    created_by    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, is_active);

CREATE TABLE IF NOT EXISTS groups (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    teacher_id   INTEGER,
    weekdays     TEXT NOT NULL DEFAULT '',   -- "1,3,5" (0=Dushanba)
    start_time   TEXT NOT NULL DEFAULT '09:00',
    duration_min INTEGER NOT NULL DEFAULT 90,
    room         TEXT NOT NULL DEFAULT '',
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
    id        TEXT PRIMARY KEY,
    group_id  TEXT NOT NULL,
    user_id   INTEGER NOT NULL,
    joined_at TEXT NOT NULL,
    UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    date       TEXT NOT NULL,
    starts_at  TEXT NOT NULL,
    closes_at  TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    opened_by  INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE (group_id, date)
);

CREATE TABLE IF NOT EXISTS attendance (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id    INTEGER NOT NULL,
    check_in   TEXT,
    check_out  TEXT,
    status     TEXT NOT NULL DEFAULT 'keldi',
    method     TEXT NOT NULL DEFAULT 'face',
    confidence REAL,
    note       TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id, id DESC);

CREATE TABLE IF NOT EXISTS wallet (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    coin_delta INTEGER NOT NULL DEFAULT 0,
    cash_delta INTEGER NOT NULL DEFAULT 0,
    reason     TEXT NOT NULL DEFAULT '',
    ref_type   TEXT NOT NULL DEFAULT '',
    ref_id     TEXT,
    granted_by INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_time ON wallet(created_at);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id   INTEGER,
    actor_role TEXT,
    action     TEXT NOT NULL,
    target     TEXT,
    meta       TEXT NOT NULL DEFAULT '',
    ip         TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit(id DESC);

CREATE TABLE IF NOT EXISTS staff_sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip         TEXT,
    ua         TEXT
);

CREATE TABLE IF NOT EXISTS kiosk_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    version    TEXT NOT NULL,
    signed_by  TEXT NOT NULL,
    relation   TEXT NOT NULL DEFAULT 'ota-ona',
    accepted   INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
"""

DEFAULT_SETTINGS = {
    "school_name": "Shams Academy",
    # Davomat oynasi
    "open_before_min": "15",
    "window_hours": "3",
    "late_after_min": "10",
    "checkout_enabled": "1",
    # Coin qoidalari (superadmin panelidan sozlanadi)
    "coin_present": "2",
    "coin_late": "1",
    "daily_limit_student": "12",
    "teacher_daily_limit": "30",
    "teacher_max_award": "5",
    "award_cooldown_min": "2",
    "term_start": "",
    "term_end": "",
    "term_name": "",
    # Yuz tekshiruvi
    "face_threshold": "0.45",
    "face_margin": "0.08",
    "face_min_samples": "3",
    "require_liveness": "1",
    # Kiosk
    "kiosk_key": "",
    "kiosk_group_id": "",
    # AI (OpenAI kaliti env orqali, bu yerda faqat model nomlari)
    "ai_model": "gpt-4o-mini",
    "ai_voice": "alloy",
    "ai_greeting": "Assalomu alaykum! Men Quyoshvoyman. Yuzingizni ko‘rsating yoki ismingizni ayting.",
    # Google Sheets mirror
    "sheets_webhook": "",
    "sheets_enabled": "0",
    # Zaxira
    "backup_keep_days": "30",
}


def now_local() -> datetime:
    return datetime.now(TZ).replace(tzinfo=None, microsecond=0)


def iso(dt: datetime | None = None) -> str:
    return (dt or now_local()).strftime("%Y-%m-%d %H:%M:%S")


def today() -> str:
    return now_local().strftime("%Y-%m-%d")


def connect() -> sqlite3.Connection:
    path = os.path.abspath(DB_PATH)
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    conn = sqlite3.connect(path, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@contextmanager
def tx():
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = FULL")
        conn.executescript(SCHEMA)
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))
        # kiosk kaliti bo'lmasa — generatsiya
        row = conn.execute("SELECT value FROM settings WHERE key = 'kiosk_key'").fetchone()
        if row is None or not row["value"]:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('kiosk_key', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (secrets.token_urlsafe(24),),
            )
        conn.commit()
    finally:
        conn.close()


# ── settings ────────────────────────────────────────────────────────────────

def get_setting(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn, key: str, value) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def settings_map(conn) -> dict:
    return {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM settings")}


def int_setting(conn, key: str, default: int = 0) -> int:
    try:
        return int(float(get_setting(conn, key, str(default)) or default))
    except (TypeError, ValueError):
        return default


def float_setting(conn, key: str, default: float = 0.0) -> float:
    try:
        return float(get_setting(conn, key, str(default)) or default)
    except (TypeError, ValueError):
        return default


# ── audit ───────────────────────────────────────────────────────────────────

def audit(conn, actor, action: str, target: str = "", meta: str = "", ip: str = "") -> None:
    actor_id = actor["id"] if isinstance(actor, sqlite3.Row) or isinstance(actor, dict) else actor
    role = actor["role"] if isinstance(actor, (sqlite3.Row, dict)) else ""
    conn.execute(
        "INSERT INTO audit (actor_id, actor_role, action, target, meta, ip, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (actor_id, role, action, target, meta[:2000], ip, iso()),
    )


# ── coins ───────────────────────────────────────────────────────────────────

def coin_balance(conn, user_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(coin_delta), 0) AS total FROM wallet WHERE user_id = ?", (user_id,)
    ).fetchone()
    return int(row["total"])


def awarded_today(conn, user_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(coin_delta), 0) AS total FROM wallet"
        " WHERE user_id = ? AND coin_delta > 0 AND substr(created_at, 1, 10) = ?",
        (user_id, today()),
    ).fetchone()
    return int(row["total"])


def awarded_by_today(conn, actor_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(coin_delta), 0) AS total FROM wallet"
        " WHERE granted_by = ? AND coin_delta > 0 AND substr(created_at, 1, 10) = ?",
        (actor_id, today()),
    ).fetchone()
    return int(row["total"])


def term_range(conn) -> tuple[str, str]:
    """Hisob davri (termin). Sozlanmagan bo'lsa — joriy oy."""
    start = get_setting(conn, "term_start")
    end = get_setting(conn, "term_end")
    if start and end:
        return start, end
    first = now_local().replace(day=1)
    nxt = (first + timedelta(days=32)).replace(day=1)
    return first.strftime("%Y-%m-%d"), (nxt - timedelta(days=1)).strftime("%Y-%m-%d")
