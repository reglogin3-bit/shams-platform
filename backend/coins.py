"""Coin/token iqtisodi: berish qoidalari, limitlar, tarix, reyting."""

from __future__ import annotations

from datetime import datetime, timedelta

import db


def _actor(conn, actor_id):
    if not actor_id:
        return None
    return conn.execute("SELECT * FROM users WHERE id = ?", (actor_id,)).fetchone()


def can_grant(conn, user_id: int, amount: int, actor_id: int | None, manual: bool = True) -> dict:
    """Limitlarni tekshiradi. Qaytaradi: {ok, granted, error, capped}."""
    if amount <= 0:
        return {"ok": False, "error": "Miqdor 0 dan katta bo‘lishi kerak"}
    student = conn.execute(
        "SELECT id, full_name, is_active FROM users WHERE id = ? AND role = 'student'",
        (user_id,),
    ).fetchone()
    if not student or not student["is_active"]:
        return {"ok": False, "error": "O‘quvchi topilmadi yoki arxivlangan"}

    actor = _actor(conn, actor_id)
    role = actor["role"] if actor else "system"
    amount = int(amount)
    capped = False

    if role == "teacher":
        per_award = db.int_setting(conn, "teacher_max_award", 5)
        if per_award and amount > per_award:
            amount = per_award
            capped = True
        day_limit = db.int_setting(conn, "teacher_daily_limit", 30)
        if day_limit:
            used = db.awarded_by_today(conn, actor_id)
            if used >= day_limit:
                return {"ok": False, "error": f"Kunlik limitingiz tugadi ({day_limit} token)"}
            amount = min(amount, day_limit - used)

    if manual:
        cooldown = db.int_setting(conn, "award_cooldown_min", 2)
        if cooldown:
            last = conn.execute(
                "SELECT created_at FROM wallet WHERE user_id = ? AND coin_delta > 0"
                " ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
            if last:
                last_at = datetime.strptime(last["created_at"], "%Y-%m-%d %H:%M:%S")
                if db.now_local() - last_at < timedelta(minutes=cooldown):
                    return {"ok": False, "error": f"Qayta berish uchun {cooldown} daqiqa kuting"}

    student_limit = db.int_setting(conn, "daily_limit_student", 12)
    if student_limit:
        used = db.awarded_today(conn, user_id)
        left = max(0, student_limit - used)
        if left == 0:
            return {"ok": False, "error": f"Bugungi limit tugadi ({student_limit} coin)"}
        if amount > left:
            amount = left
            capped = True

    if amount <= 0:
        return {"ok": False, "error": "Limit tugagan"}
    return {"ok": True, "granted": amount, "capped": capped}


def grant(conn, user_id: int, amount: int, reason: str = "", actor_id: int | None = None,
          ref_type: str = "", ref_id: str | None = None, ignore_caps: bool = False,
          cash: int = 0) -> dict:
    if ignore_caps:
        check = {"ok": True, "granted": int(amount), "capped": False}
    else:
        check = can_grant(conn, user_id, int(amount), actor_id, manual=True)
    if not check.get("ok"):
        return check
    amount = int(check["granted"])
    conn.execute(
        "INSERT INTO wallet (user_id, coin_delta, cash_delta, reason, ref_type, ref_id,"
        " granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, amount, int(cash), reason[:200], ref_type, ref_id, actor_id, db.iso()),
    )
    db.audit(conn, actor_id, "coin_grant", f"user:{user_id}", f"+{amount} {reason}")
    return {"ok": True, "granted": amount, "capped": check.get("capped", False),
            "balance": db.coin_balance(conn, user_id)}


def spend(conn, user_id: int, amount: int, reason: str = "", actor_id: int | None = None) -> dict:
    amount = abs(int(amount))
    balance = db.coin_balance(conn, user_id)
    if balance < amount:
        return {"ok": False, "error": f"Coin yetarli emas: {amount - balance} kerak"}
    conn.execute(
        "INSERT INTO wallet (user_id, coin_delta, cash_delta, reason, ref_type, granted_by, created_at)"
        " VALUES (?, ?, 0, ?, 'redeem', ?, ?)",
        (user_id, -amount, reason[:200], actor_id, db.iso()),
    )
    db.audit(conn, actor_id, "coin_spend", f"user:{user_id}", f"-{amount} {reason}")
    return {"ok": True, "balance": balance - amount}


def history(conn, user_id: int, limit: int = 100) -> list[dict]:
    rows = conn.execute(
        "SELECT w.*, u.full_name AS actor_name FROM wallet w"
        " LEFT JOIN users u ON u.id = w.granted_by"
        " WHERE w.user_id = ? ORDER BY w.id DESC LIMIT ?", (user_id, limit)).fetchall()
    return [dict(row) for row in rows]


def term_summary(conn, user_id: int) -> dict:
    start, end = db.term_range(conn)
    row = conn.execute(
        "SELECT COALESCE(SUM(coin_delta), 0) AS total, COUNT(*) AS entries FROM wallet"
        " WHERE user_id = ? AND coin_delta > 0 AND substr(created_at,1,10) BETWEEN ? AND ?",
        (user_id, start, end)).fetchone()
    return {"term_start": start, "term_end": end, "earned": int(row["total"]),
            "entries": int(row["entries"]), "balance": db.coin_balance(conn, user_id)}


def leaderboard(conn, limit: int = 10) -> list[dict]:
    start, end = db.term_range(conn)
    rows = conn.execute(
        "SELECT u.id, u.full_name, COALESCE(SUM(w.coin_delta), 0) AS earned FROM users u"
        " JOIN wallet w ON w.user_id = u.id AND w.coin_delta > 0"
        " WHERE u.role = 'student' AND substr(w.created_at,1,10) BETWEEN ? AND ?"
        " GROUP BY u.id ORDER BY earned DESC LIMIT ?", (start, end, limit)).fetchall()
    return [dict(row) for row in rows]


def totals(conn) -> dict:
    row = conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN coin_delta > 0 THEN coin_delta ELSE 0 END), 0) AS issued,"
        " COALESCE(SUM(CASE WHEN coin_delta < 0 THEN -coin_delta ELSE 0 END), 0) AS spent,"
        " COALESCE(SUM(coin_delta), 0) AS balance FROM wallet").fetchone()
    return {"issued": int(row["issued"]), "spent": int(row["spent"]),
            "balance": int(row["balance"])}
