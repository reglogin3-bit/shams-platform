"""Google Sheets — faqat hisobot oynasi (mirror), baza emas.

Apps Script Web App (deploy: "Anyone" + token) URL manziliga yoziladi.
Biometrik ma'lumot, telefon, ota-ona ma'lumoti bu yerga hech qachon ketmaydi.
"""

from __future__ import annotations

import json

import requests

TIMEOUT = 15


def configured(conn) -> bool:
    import db
    return db.get_setting(conn, "sheets_enabled") == "1" and bool(
        db.get_setting(conn, "sheets_webhook"))


def push(conn, rows: list[list], sheet: str = "davomat") -> dict:
    import db
    url = db.get_setting(conn, "sheets_webhook")
    if not url:
        return {"ok": False, "error": "Webhook manzil kiritilmagan"}
    payload = {"token": db.get_setting(conn, "sheets_token", ""), "sheet": sheet, "rows": rows}
    try:
        response = requests.post(url, data=json.dumps(payload),
                                 headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        if response.status_code >= 400:
            return {"ok": False, "error": f"Sheets {response.status_code}"}
        return {"ok": True, "sent": len(rows)}
    except requests.RequestException as error:
        return {"ok": False, "error": str(error)[:200]}


def attendance_rows(conn, date_str: str) -> list[list]:
    rows = conn.execute(
        "SELECT g.name, u.full_name, a.status, a.check_in, a.check_out, a.method, a.confidence"
        " FROM attendance a JOIN sessions s ON s.id = a.session_id"
        " JOIN groups g ON g.id = s.group_id JOIN users u ON u.id = a.user_id"
        " WHERE s.date = ? ORDER BY g.name, u.full_name", (date_str,)).fetchall()
    return [[r["name"], r["full_name"], r["status"], r["check_in"] or "",
             r["check_out"] or "", r["method"], r["confidence"] or ""] for r in rows]


def coin_rows(conn, date_str: str) -> list[list]:
    rows = conn.execute(
        "SELECT u.full_name, w.coin_delta, w.reason, w.created_at, a.full_name AS actor"
        " FROM wallet w JOIN users u ON u.id = w.user_id"
        " LEFT JOIN users a ON a.id = w.granted_by"
        " WHERE substr(w.created_at,1,10) = ? ORDER BY w.id", (date_str,)).fetchall()
    return [[r["full_name"], r["coin_delta"], r["reason"], r["created_at"], r["actor"] or ""]
            for r in rows]
