"""Davomat: dars sessiyalari, vaqt oynasi (dars + 3 soat) va belgilash."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import db

STATUS_LABEL = {
    "keldi": "Keldi",
    "kechikdi": "Kechikdi",
    "kelmadi": "Kelmadi",
    "sababli": "Sababli",
}


def group_start(group, date_str: str) -> datetime:
    hour, minute = (group["start_time"] or "09:00").split(":")[:2]
    day = datetime.strptime(date_str, "%Y-%m-%d")
    return day.replace(hour=int(hour), minute=int(minute), second=0)


def scheduled_today(group, date_str: str | None = None) -> bool:
    weekdays = [item.strip() for item in (group["weekdays"] or "").split(",") if item.strip()]
    if not weekdays:
        return True
    date_str = date_str or db.today()
    index = datetime.strptime(date_str, "%Y-%m-%d").weekday()
    return str(index) in weekdays


def window(conn, group, date_str: str) -> tuple[datetime, datetime]:
    start = group_start(group, date_str)
    before = db.int_setting(conn, "open_before_min", 15)
    hours = db.int_setting(conn, "window_hours", 3)
    return start - timedelta(minutes=before), start + timedelta(hours=hours)


def status_for(conn, starts_at: str, closes_at: str, moment: datetime | None = None) -> str:
    moment = moment or db.now_local()
    if moment < datetime.strptime(starts_at, "%Y-%m-%d %H:%M:%S"):
        return "scheduled"
    if moment > datetime.strptime(closes_at, "%Y-%m-%d %H:%M:%S"):
        return "closed"
    return "open"


def ensure_session(conn, group, date_str: str | None = None, force: bool = False,
                   actor_id: int | None = None):
    """Guruh uchun kunlik sessiya. Yo'q bo'lsa yaratiladi (jadval bo'yicha)."""
    date_str = date_str or db.today()
    row = conn.execute(
        "SELECT * FROM sessions WHERE group_id = ? AND date = ?", (group["id"], date_str)
    ).fetchone()
    if row:
        st = status_for(conn, row["starts_at"], row["closes_at"])
        if st != row["status"]:
            conn.execute("UPDATE sessions SET status = ? WHERE id = ?", (st, row["id"]))
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (row["id"],)).fetchone()
        return row
    if not force and not scheduled_today(group, date_str):
        return None
    opens, closes = window(conn, group, date_str)
    session_id = "ses-" + uuid.uuid4().hex[:12]
    status = status_for(conn, db.iso(opens), db.iso(closes))
    conn.execute(
        "INSERT INTO sessions (id, group_id, date, starts_at, closes_at, status, opened_by, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (session_id, group["id"], date_str, db.iso(opens), db.iso(closes), status,
         actor_id, db.iso()),
    )
    return conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()


def reopen(conn, session_id: str, actor_id: int) -> bool:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not row:
        return False
    _, closes = window(conn, _group(conn, row["group_id"]), row["date"])
    conn.execute(
        "UPDATE sessions SET closes_at = ?, status = 'open' WHERE id = ?",
        (db.iso(max(closes, db.now_local() + timedelta(minutes=30))), session_id),
    )
    db.audit(conn, actor_id, "session_reopen", session_id)
    return True


def _group(conn, group_id: str):
    return conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()


def member_ids(conn, group_id: str) -> list[int]:
    return [row["user_id"] for row in conn.execute(
        "SELECT user_id FROM group_members WHERE group_id = ?", (group_id,))]


def is_member(conn, group_id: str, user_id: int) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?",
        (group_id, user_id)).fetchone())


def checkin(conn, session, user, method: str = "face", confidence: float | None = None,
            actor_id: int | None = None, note: str = "") -> dict:
    """Bola kirganini qayd etadi. Oyna yopilgan bo'lsa — rad etadi."""
    status = status_for(conn, session["starts_at"], session["closes_at"])
    if status != "open":
        return {"ok": False, "error": "Davomat oynasi yopilgan" if status == "closed"
                else "Davomat hali ochilmagan", "code": status}

    existing = conn.execute(
        "SELECT * FROM attendance WHERE session_id = ? AND user_id = ?",
        (session["id"], user["id"]),
    ).fetchone()
    if existing and existing["check_in"]:
        return {"ok": True, "duplicate": True, "attendance": dict(existing),
                "status": existing["status"], "at": existing["check_in"],
                "late": existing["status"] == "kechikdi", "reward": 0,
                "message": "Allaqachon belgilangan"}

    start = datetime.strptime(session["starts_at"], "%Y-%m-%d %H:%M:%S")
    late_after = db.int_setting(conn, "late_after_min", 10)
    moment = db.now_local()
    late = moment > start + timedelta(minutes=late_after)
    mark = "kechikdi" if late else "keldi"

    if existing:
        conn.execute(
            "UPDATE attendance SET check_in = ?, status = ?, method = ?, confidence = ? WHERE id = ?",
            (db.iso(moment), mark, method, confidence, existing["id"]),
        )
        att_id = existing["id"]
    else:
        att_id = "att-" + uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO attendance (id, session_id, user_id, check_in, status, method,"
            " confidence, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (att_id, session["id"], user["id"], db.iso(moment), mark, method, confidence,
             note, actor_id, db.iso()),
        )

    reward = 0
    if db.get_setting(conn, "coin_present", "0") != "0":
        import coins
        amount = db.int_setting(conn, "coin_present" if mark == "keldi" else "coin_late", 0)
        if amount:
            result = coins.grant(conn, user["id"], amount, reason="Davomat: " + mark,
                                 actor_id=actor_id, ref_type="attendance", ref_id=att_id,
                                 ignore_caps=True)
            reward = result.get("granted", 0)
    return {"ok": True, "status": mark, "at": db.iso(moment), "late": late,
            "reward": reward, "attendance_id": att_id}


def checkout(conn, session, user) -> dict:
    if db.get_setting(conn, "checkout_enabled", "1") != "1":
        return {"ok": False, "error": "Chiqish qayd etish o‘chirilgan"}
    row = conn.execute(
        "SELECT * FROM attendance WHERE session_id = ? AND user_id = ?",
        (session["id"], user["id"]),
    ).fetchone()
    if not row:
        return {"ok": False, "error": "Avval kirish belgilanmagan"}
    if row["check_out"]:
        return {"ok": True, "duplicate": True, "at": row["check_out"]}
    conn.execute("UPDATE attendance SET check_out = ? WHERE id = ?", (db.iso(), row["id"]))
    return {"ok": True, "at": db.iso()}


def summary(conn, session_id: str) -> dict:
    rows = conn.execute(
        "SELECT a.*, u.full_name, u.first_name, u.last_name FROM attendance a"
        " JOIN users u ON u.id = a.user_id WHERE a.session_id = ? ORDER BY a.check_in",
        (session_id,),
    ).fetchall()
    counts = {"keldi": 0, "kechikdi": 0, "kelmadi": 0}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    total = len(member_ids(conn, conn.execute(
        "SELECT group_id FROM sessions WHERE id = ?", (session_id,)).fetchone()["group_id"]))
    return {"total_members": total, "present": len(rows), "counts": counts,
            "rows": [dict(row) for row in rows]}
