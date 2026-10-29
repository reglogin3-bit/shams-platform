"""Zaxira nusxalar: SQLite backup API, kunlik nusxa va tozalash."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta

import db

DIR = os.path.abspath(os.path.join(os.path.dirname(db.DB_PATH), "backups"))


def make_backup(tag: str = "auto") -> dict:
    os.makedirs(DIR, exist_ok=True)
    stamp = db.now_local().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(DIR, f"shams-{stamp}-{tag}.db")
    source = sqlite3.connect(os.path.abspath(db.DB_PATH))
    try:
        target = sqlite3.connect(path)
        try:
            source.backup(target)
            target.execute("PRAGMA integrity_check").fetchone()
        finally:
            target.close()
    finally:
        source.close()
    prune()
    return {"ok": True, "file": os.path.basename(path), "size": os.path.getsize(path)}


def prune() -> int:
    conn = db.connect()
    try:
        keep_days = db.int_setting(conn, "backup_keep_days", 30)
    finally:
        conn.close()
    if not os.path.isdir(DIR):
        return 0
    limit = datetime.now() - timedelta(days=max(1, keep_days))
    removed = 0
    for name in os.listdir(DIR):
        if not name.startswith("shams-") or not name.endswith(".db"):
            continue
        path = os.path.join(DIR, name)
        try:
            if datetime.fromtimestamp(os.path.getmtime(path)) < limit:
                os.remove(path)
                removed += 1
        except OSError:
            continue
    return removed


def list_backups() -> list[dict]:
    if not os.path.isdir(DIR):
        return []
    items = []
    for name in sorted(os.listdir(DIR), reverse=True):
        if not name.startswith("shams-") or not name.endswith(".db"):
            continue
        path = os.path.join(DIR, name)
        stat = os.stat(path)
        items.append({"file": name, "size": stat.st_size,
                      "at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")})
    return items[:60]


def path_of(name: str) -> str | None:
    if "/" in name or ".." in name or not name.endswith(".db"):
        return None
    path = os.path.join(DIR, name)
    return path if os.path.exists(path) else None


def maybe_daily() -> None:
    """Kuniga bir marta avtomatik nusxa."""
    os.makedirs(DIR, exist_ok=True)
    stamp = db.now_local().strftime("%Y%m%d")
    if any(name.startswith(f"shams-{stamp}") for name in os.listdir(DIR)):
        return
    try:
        make_backup("kunlik")
    except Exception:
        pass
