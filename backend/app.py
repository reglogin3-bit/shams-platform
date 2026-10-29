"""Shams Platform — Flask API (davomat + coin + yuz + ovoz).

Ishga tushirish:  python app.py   (yoki waitress-serve --port=8000 app:app)
"""

from __future__ import annotations

import csv
import io
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta

from flask import Flask, g, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

import ai
import attendance as att
import auth
import backup
import coins
import db
import faces
import sheets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "static"))

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
app.config["JSON_AS_ASCII"] = False
app.config["JSON_SORT_KEYS"] = False


# ── yordamchi ───────────────────────────────────────────────────────────────

def body() -> dict:
    return request.get_json(silent=True) or {}


def clean(value, limit: int = 120) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def normalize_name(value: str) -> str:
    text = clean(value, 120).lower().replace("ʻ", "'").replace("ʼ", "'").replace("’", "'")
    return re.sub(r"\s+", " ", text)


def student_public(conn, row, with_photo: bool = False) -> dict:
    balance = db.coin_balance(conn, row["id"])
    groups = [dict(r) for r in conn.execute(
        "SELECT g.id, g.name FROM groups g JOIN group_members m ON m.group_id = g.id"
        " WHERE m.user_id = ? ORDER BY g.name", (row["id"],))]
    data = {
        "id": row["id"],
        "full_name": row["full_name"],
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "birth_date": row["birth_date"],
        "parent_name": row["parent_name"],
        "parent_phone": row["parent_phone"],
        "groups": groups,
        "group_names": ", ".join(item["name"] for item in groups),
        "coins": balance,
        "face_count": row["face_count"],
        "has_face": bool(row["face_count"]),
        "consent_at": row["consent_at"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }
    if with_photo:
        data["photo_digest"] = faces.photo_digest(row["photo_enc"])
        data["has_photo"] = bool(row["photo_enc"])
    return data


def staff_public(row) -> dict:
    return {"id": row["id"], "role": row["role"], "username": row["username"],
            "full_name": row["full_name"], "created_at": row["created_at"]}


def teacher_groups(conn, teacher_id: int):
    return conn.execute("SELECT * FROM groups WHERE teacher_id = ? AND is_active = 1"
                        " ORDER BY name", (teacher_id,)).fetchall()


def can_manage_group(user, group_id: str, conn) -> bool:
    if user["role"] == "superadmin":
        return True
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    return bool(group and group["teacher_id"] == user["id"])


# ── xatolar ────────────────────────────────────────────────────────────────

@app.errorhandler(RequestEntityTooLarge)
def too_large(_error):
    return jsonify({"error": "Fayl juda katta (8 MB gacha)"}), 413


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Topilmadi"}), 404
    return send_from_directory(STATIC_DIR, "index.html")


@app.errorhandler(500)
def server_error(error):
    app.logger.exception(error)
    return jsonify({"error": "Server xatosi"}), 500


# ── meta ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "time": db.iso(), "ai": ai.enabled()})


@app.get("/api/meta")
def meta():
    conn = db.connect()
    try:
        settings = db.settings_map(conn)
        groups = [{"id": r["id"], "name": r["name"]} for r in conn.execute(
            "SELECT id, name FROM groups WHERE is_active = 1 ORDER BY name")]
        return jsonify({
            "school_name": settings.get("school_name", "Shams Academy"),
            "ai_enabled": ai.enabled(),
            "voice": settings.get("ai_voice", "alloy"),
            "greeting": settings.get("ai_greeting", ""),
            "window_hours": db.int_setting(conn, "window_hours", 3),
            "groups": groups,
            "default_password": settings.get("default_password_warning", "0") == "1",
        })
    finally:
        conn.close()


# ── autentifikatsiya ───────────────────────────────────────────────────────

@app.post("/api/auth/login")
def login():
    data = body()
    username = clean(data.get("username"), 60).lower()
    password = str(data.get("password") or "")
    ip = auth._client_ip()
    key = f"{ip}:{username}"
    if auth.throttled(key):
        return jsonify({"error": "Juda ko‘p urinish. 10 daqiqadan keyin qayta urinib ko‘ring."}), 429
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE lower(username) = ? AND is_active = 1",
                           (username,)).fetchone()
        if row is None or not auth.verify_password(row["password_hash"], password):
            auth.note_fail(key)
            return jsonify({"error": "Login yoki parol xato"}), 401
        auth.clear_fails(key)
        token = auth.create_session(conn, row["id"])
        db.audit(conn, row, "login", ip=ip)
        conn.commit()
        response = jsonify({"ok": True, "user": staff_public(row)})
        response.set_cookie(auth.SESSION_COOKIE, token, httponly=True, samesite="Lax",
                            secure=request.is_secure, max_age=auth.SESSION_DAYS * 86400,
                            path="/")
        return response
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout():
    conn = db.connect()
    try:
        auth.destroy_session(conn, request.cookies.get(auth.SESSION_COOKIE, ""))
        conn.commit()
        response = jsonify({"ok": True})
        response.delete_cookie(auth.SESSION_COOKIE, path="/")
        return response
    finally:
        conn.close()


@app.get("/api/auth/me")
def me():
    conn = db.connect()
    try:
        user = auth.current_user(conn)
        if not user:
            return jsonify({"user": None}), 200
        data = staff_public(user)
        if user["role"] == "teacher":
            data["groups"] = [dict(r) for r in teacher_groups(conn, user["id"])]
        return jsonify({"user": data, "settings": {
            "teacher_max_award": db.int_setting(conn, "teacher_max_award", 5),
            "teacher_daily_limit": db.int_setting(conn, "teacher_daily_limit", 30),
        }})
    finally:
        conn.close()


@app.post("/api/auth/password")
@auth.login_required("superadmin", "teacher")
def change_password():
    data = body()
    old = str(data.get("old") or "")
    new = str(data.get("new") or "")
    if len(new) < 8:
        return jsonify({"error": "Yangi parol kamida 8 belgidan iborat bo‘lsin"}), 400
    if not auth.verify_password(g.user["password_hash"], old):
        return jsonify({"error": "Eski parol xato"}), 400
    g.conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                   (auth.hash_password(new), g.user["id"]))
    g.conn.execute("DELETE FROM staff_sessions WHERE user_id = ? AND token != ?",
                   (g.user["id"], request.cookies.get(auth.SESSION_COOKIE, "")))
    if g.user["role"] == "superadmin":
        db.set_setting(g.conn, "default_password_warning", "0")
    db.audit(g.conn, g.user, "password_change")
    g.conn.commit()
    return jsonify({"ok": True})


# ── kiosk ──────────────────────────────────────────────────────────────────

@app.get("/api/kiosk/bootstrap")
@auth.kiosk_required
def kiosk_bootstrap():
    conn = g.conn
    groups = conn.execute("SELECT * FROM groups WHERE is_active = 1 ORDER BY name").fetchall()
    payload = []
    for group in groups:
        session = att.ensure_session(conn, group)
        payload.append({
            "id": group["id"], "name": group["name"], "start_time": group["start_time"],
            "weekdays": group["weekdays"], "duration_min": group["duration_min"],
            "session": dict(session) if session else None,
            "window_open": bool(session and session["status"] == "open"),
            "members": len(att.member_ids(conn, group["id"])),
        })
    conn.commit()
    return jsonify({
        "school_name": db.get_setting(conn, "school_name", "Shams Academy"),
        "greeting": db.get_setting(conn, "ai_greeting", ""),
        "ai_enabled": ai.enabled(),
        "require_liveness": db.get_setting(conn, "require_liveness", "1") == "1",
        "threshold": db.float_setting(conn, "face_threshold", 0.45),
        "date": db.today(),
        "groups": payload,
        "coin_present": db.int_setting(conn, "coin_present", 0),
    })


def _session_for(conn, group_id: str):
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not group:
        return None, None
    session = att.ensure_session(conn, group)
    return group, session


@app.post("/api/kiosk/identify")
@auth.kiosk_required
def kiosk_identify():
    data = body()
    descriptor = data.get("descriptor")
    group_id = clean(data.get("groupId"), 40) or None
    if not faces.valid_descriptor(descriptor):
        return jsonify({"error": "Yuz ma’lumoti noto‘g‘ri"}), 400

    conn = g.conn
    threshold = db.float_setting(conn, "face_threshold", 0.45)
    margin = db.float_setting(conn, "face_margin", 0.08)

    if group_id:
        rows = conn.execute(
            "SELECT u.* FROM users u JOIN group_members m ON m.user_id = u.id"
            " WHERE m.group_id = ? AND u.role = 'student' AND u.is_active = 1"
            " AND u.face_count > 0", (group_id,)).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND is_active = 1 AND face_count > 0"
        ).fetchall()

    candidates = [(row["id"], faces.load_descriptors(row["face_enc"])) for row in rows]
    result = faces.match(faces.normalize_descriptor(descriptor), candidates, threshold, margin)

    if not result.get("ok"):
        conn.commit()
        return jsonify({"matched": False, "reason": result.get("reason"),
                        "distance": result.get("distance")}), 200

    student = conn.execute("SELECT * FROM users WHERE id = ?", (result["user_id"],)).fetchone()
    session = None
    primary = conn.execute(
        "SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id"
        " WHERE m.user_id = ? AND g.is_active = 1"
        " ORDER BY CASE WHEN g.id = (SELECT group_id FROM group_members WHERE user_id = ?"
        " LIMIT 1) THEN 0 ELSE 1 END LIMIT 1", (student["id"], student["id"])).fetchone()
    if primary:
        session = att.ensure_session(conn, primary)

    token = auth.make_kiosk_token(conn, student["id"])
    db.audit(conn, None, "kiosk_identify", f"user:{student['id']}",
             f"d={result['distance']}")
    conn.commit()
    return jsonify({
        "matched": True,
        "token": token,
        "student": {
            "id": student["id"], "full_name": student["full_name"],
            "first_name": student["first_name"], "coins": db.coin_balance(conn, student["id"]),
            "groups": [r["name"] for r in conn.execute(
                "SELECT g.name FROM groups g JOIN group_members m ON m.group_id = g.id"
                " WHERE m.user_id = ?", (student["id"],))],
        },
        "confidence": result["confidence"],
        "distance": result["distance"],
        "session": dict(session) if session else None,
        "window_open": bool(session and session["status"] == "open"),
    })


@app.post("/api/kiosk/search")
@auth.kiosk_required
def kiosk_search():
    data = body()
    query = normalize_name(data.get("q"))
    group_id = clean(data.get("groupId"), 40) or None
    if len(query) < 2:
        return jsonify({"results": []})
    conn = g.conn
    like = f"%{query}%"
    if group_id:
        rows = conn.execute(
            "SELECT u.* FROM users u JOIN group_members m ON m.user_id = u.id"
            " WHERE m.group_id = ? AND u.role = 'student' AND u.is_active = 1"
            " AND (lower(u.full_name) LIKE ? OR lower(u.first_name) LIKE ?)"
            " ORDER BY u.full_name LIMIT 12", (group_id, like, like)).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM users WHERE role = 'student' AND is_active = 1"
            " AND (lower(full_name) LIKE ? OR lower(first_name) LIKE ?)"
            " ORDER BY full_name LIMIT 12", (like, like)).fetchall()
    return jsonify({"results": [{
        "id": row["id"], "full_name": row["full_name"],
        "groups": [r["name"] for r in conn.execute(
            "SELECT g.name FROM groups g JOIN group_members m ON m.group_id = g.id"
            " WHERE m.user_id = ?", (row["id"],))],
        "has_face": bool(row["face_count"]),
    } for row in rows]})


@app.post("/api/kiosk/verify")
@auth.kiosk_required
def kiosk_verify():
    """Tanlangan o'quvchini yuz bilan tasdiqlash (qidiruv / ovozli tanlov uchun)."""
    data = body()
    conn = g.conn
    student = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'student' AND is_active = 1",
                           (int(data.get("studentId") or 0),)).fetchone()
    if not student:
        return jsonify({"error": "O‘quvchi topilmadi"}), 404
    if not student["face_count"]:
        return jsonify({"error": "Bu o‘quvchining yuzi ro‘yxatga olinmagan. Admin bilan bog‘laning.",
                        "code": "no_face"}), 400
    descriptor = data.get("descriptor")
    if not faces.valid_descriptor(descriptor):
        return jsonify({"error": "Yuz aniqlanmadi"}), 400
    threshold = db.float_setting(conn, "face_threshold", 0.45)
    own = faces.load_descriptors(student["face_enc"])
    best = min((faces.distance(faces.normalize_descriptor(descriptor), item) for item in own),
               default=9.9)
    if best > threshold:
        db.audit(conn, None, "kiosk_verify_fail", f"user:{student['id']}", f"d={best:.3f}")
        conn.commit()
        return jsonify({"ok": False, "error": "Yuz mos kelmadi — qayta urinib ko‘ring",
                        "distance": round(best, 3)}), 200
    token = auth.make_kiosk_token(conn, student["id"])
    db.audit(conn, None, "kiosk_verify", f"user:{student['id']}", f"d={best:.3f}")
    conn.commit()
    return jsonify({"ok": True, "token": token, "distance": round(best, 3),
                    "student": {"id": student["id"], "full_name": student["full_name"],
                                "coins": db.coin_balance(conn, student["id"])}})


@app.post("/api/kiosk/checkin")
@auth.kiosk_required
def kiosk_checkin():
    data = body()
    token = clean(data.get("token"), 80)
    group_id = clean(data.get("groupId"), 40) or None
    conn = g.conn
    student = auth.kiosk_token_user(conn, token)
    if not student:
        return jsonify({"error": "Sessiya eskirgan — yuzni qayta ko‘rsating", "code": "token"}), 401

    if db.get_setting(conn, "require_liveness", "1") == "1" and not data.get("liveness"):
        return jsonify({"error": "Jonli yuz tasdiqlanmadi", "code": "liveness"}), 400

    if group_id:
        if not att.is_member(conn, group_id, student["id"]):
            return jsonify({"error": "Bu guruhda bunday o‘quvchi yo‘q"}), 400
        group, session = _session_for(conn, group_id)
    else:
        group = conn.execute(
            "SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id"
            " WHERE m.user_id = ? AND g.is_active = 1 ORDER BY g.start_time LIMIT 1",
            (student["id"],)).fetchone()
        session = att.ensure_session(conn, group) if group else None

    if not group or not session:
        return jsonify({"error": "Bugun bu o‘quvchi uchun dars yo‘q", "code": "no_session"}), 400

    result = att.checkin(conn, session, student, method="face",
                         confidence=float(data.get("confidence") or 0),
                         actor_id=None)
    if not result.get("ok"):
        conn.commit()
        return jsonify({"error": result.get("error"), "code": result.get("code"),
                        "session": dict(session)}), 400
    conn.commit()
    return jsonify({
        "ok": True, "status": result.get("status"), "late": result.get("late"),
        "at": result.get("at"), "reward": result.get("reward", 0),
        "duplicate": result.get("duplicate", False),
        "group": group["name"],
        "student": {"id": student["id"], "full_name": student["full_name"],
                    "coins": db.coin_balance(conn, student["id"])},
        "closes_at": session["closes_at"],
    })


@app.post("/api/kiosk/checkout")
@auth.kiosk_required
def kiosk_checkout():
    data = body()
    conn = g.conn
    student = auth.kiosk_token_user(conn, clean(data.get("token"), 80))
    if not student:
        return jsonify({"error": "Sessiya eskirgan", "code": "token"}), 401
    row = conn.execute(
        "SELECT s.* FROM sessions s JOIN attendance a ON a.session_id = s.id"
        " WHERE a.user_id = ? AND a.check_out IS NULL ORDER BY s.date DESC LIMIT 1",
        (student["id"],)).fetchone()
    if not row:
        return jsonify({"error": "Ochiq kirish topilmadi"}), 400
    result = att.checkout(conn, row, student)
    conn.commit()
    return jsonify(result)


@app.get("/api/kiosk/profile/<int:student_id>")
@auth.kiosk_required
def kiosk_profile(student_id: int):
    conn = g.conn
    token = request.args.get("token", "")
    owner = auth.kiosk_token_user(conn, token)
    # Faqat o'z profilini yoki yuz bilan tasdiqlangan profilni ko'rish mumkin
    if not owner or owner["id"] != student_id:
        return jsonify({"error": "Ruxsat yo‘q", "code": "forbidden"}), 403
    row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'student'",
                       (student_id,)).fetchone()
    if not row:
        return jsonify({"error": "Topilmadi"}), 404
    attendance_rows = conn.execute(
        "SELECT s.date, a.status, a.check_in, a.check_out, g.name AS group_name"
        " FROM attendance a JOIN sessions s ON s.id = a.session_id"
        " JOIN groups g ON g.id = s.group_id WHERE a.user_id = ?"
        " ORDER BY s.date DESC LIMIT 30", (student_id,)).fetchall()
    return jsonify({
        "student": student_public(conn, row),
        "coins": coins.term_summary(conn, student_id),
        "history": coins.history(conn, student_id, 20),
        "attendance": [dict(r) for r in attendance_rows],
    })


# ── ovoz (OpenAI proxy) ────────────────────────────────────────────────────

@app.post("/api/kiosk/voice/stt")
@auth.kiosk_required
def voice_stt():
    upload = request.files.get("audio")
    if upload is None:
        return jsonify({"error": "Audio yuborilmadi"}), 400
    try:
        text = ai.stt(upload.read(), upload.filename or "audio.wav")
        return jsonify({"text": text})
    except Exception as error:  # noqa: BLE001
        app.logger.warning("STT: %s", error)
        return jsonify({"error": "Nutqni tanish ishlamadi", "detail": str(error)[:120]}), 502


@app.post("/api/kiosk/voice/tts")
@auth.kiosk_required
def voice_tts():
    data = body()
    text = clean(data.get("text"), 600)
    if not text:
        return jsonify({"error": "Matn bo‘sh"}), 400
    conn = g.conn
    try:
        audio = ai.tts(text, db.get_setting(conn, "ai_voice", "alloy"))
        return send_file(io.BytesIO(audio), mimetype="audio/mpeg", max_age=0)
    except Exception as error:  # noqa: BLE001
        app.logger.warning("TTS: %s", error)
        return jsonify({"error": "Ovoz yaratilmadi", "detail": str(error)[:120]}), 502


@app.post("/api/kiosk/voice/chat")
@auth.kiosk_required
def voice_chat():
    data = body()
    messages = data.get("messages") or []
    if not isinstance(messages, list):
        return jsonify({"error": "Xabar formati xato"}), 400
    conn = g.conn
    group_id = clean(data.get("groupId"), 40) or None
    context = f"Bugun: {db.today()}. Guruh: {group_id or 'aniqlanmagan'}."
    try:
        result = ai.chat(messages, role="kiosk", extra=context)
    except Exception as error:  # noqa: BLE001
        app.logger.warning("Chat: %s", error)
        return jsonify({"error": "AI javob bermadi", "detail": str(error)[:120]}), 502

    proposal = None
    for item in result.get("proposals") or []:
        if item["name"] == "davomat_taklif":
            name = item["args"].get("ism") or ""
            rows = conn.execute(
                "SELECT DISTINCT u.* FROM users u"
                " LEFT JOIN group_members m ON m.user_id = u.id"
                " WHERE u.role = 'student' AND u.is_active = 1 AND (m.group_id = ? OR ? IS NULL)"
                " AND lower(u.full_name) LIKE ? ORDER BY u.full_name LIMIT 5",
                (group_id, group_id, f"%{normalize_name(name).split(' ')[0]}%")).fetchall()
            proposal = {"type": "attendance", "name": name,
                        "candidates": [{"id": r["id"], "full_name": r["full_name"],
                                        "groups": [x["name"] for x in conn.execute(
                                            "SELECT g.name FROM groups g JOIN group_members m"
                                            " ON m.group_id = g.id WHERE m.user_id = ?", (r["id"],))]}
                                       for r in rows]}
    return jsonify({"reply": result.get("reply", ""), "proposal": proposal})


# ── admin ──────────────────────────────────────────────────────────────────

@app.get("/api/admin/overview")
@auth.login_required("superadmin")
def admin_overview():
    conn = g.conn
    today_str = db.today()
    students = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'student'"
                            " AND is_active = 1").fetchone()["n"]
    without_face = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'student'"
                                " AND is_active = 1 AND face_count = 0").fetchone()["n"]
    groups = conn.execute("SELECT COUNT(*) AS n FROM groups WHERE is_active = 1").fetchone()["n"]
    today_att = conn.execute(
        "SELECT COUNT(*) AS n, SUM(CASE WHEN a.status = 'kechikdi' THEN 1 ELSE 0 END) AS late"
        " FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.date = ?",
        (today_str,)).fetchone()
    sessions = conn.execute(
        "SELECT s.*, g.name AS group_name,"
        " (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS present,"
        " (SELECT COUNT(*) FROM group_members m WHERE m.group_id = s.group_id) AS total"
        " FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.date = ?"
        " ORDER BY s.starts_at", (today_str,)).fetchall()
    return jsonify({
        "students": students, "without_face": without_face, "groups": groups,
        "today_present": today_att["n"] or 0, "today_late": today_att["late"] or 0,
        "sessions": [dict(row) for row in sessions],
        "coins": coins.totals(conn),
        "term": dict(zip(("start", "end"), db.term_range(conn))),
        "leaderboard": coins.leaderboard(conn, 5),
        "ai_enabled": ai.enabled(),
    })


@app.get("/api/admin/students")
@auth.login_required("superadmin")
def admin_students():
    conn = g.conn
    query = normalize_name(request.args.get("q", ""))
    group_id = request.args.get("group") or None
    sql = ("SELECT DISTINCT u.* FROM users u"
           " LEFT JOIN group_members m ON m.user_id = u.id WHERE u.role = 'student'")
    params: list = []
    if query:
        sql += " AND lower(u.full_name) LIKE ?"
        params.append(f"%{query}%")
    if group_id:
        sql += " AND m.group_id = ?"
        params.append(group_id)
    sql += " ORDER BY u.full_name LIMIT 500"
    rows = conn.execute(sql, params).fetchall()
    return jsonify({"students": [student_public(conn, row, with_photo=True) for row in rows]})


@app.post("/api/admin/students")
@auth.login_required("superadmin")
def admin_create_student():
    data = body()
    full_name = clean(data.get("full_name"), 120)
    if len(full_name.split()) < 2:
        return jsonify({"error": "Ism va familiyani to‘liq kiriting"}), 400
    if not data.get("consent"):
        return jsonify({"error": "Ota-ona roziligi tasdiqlanishi shart"}), 400
    conn = g.conn
    parts = full_name.split()
    first, last = parts[0], " ".join(parts[1:])
    existing = conn.execute(
        "SELECT id FROM users WHERE role = 'student' AND lower(full_name) = ?",
        (normalize_name(full_name),)).fetchone()
    if existing:
        return jsonify({"error": "Bu ismli o‘quvchi allaqachon mavjud",
                        "student_id": existing["id"]}), 409
    user_id = conn.execute(
        "INSERT INTO users (role, full_name, first_name, last_name, birth_date, parent_name,"
        " parent_phone, phone, consent_at, consent_version, created_at, created_by)"
        " VALUES ('student', ?, ?, ?, ?, ?, ?, ?, ?, 'v1', ?, ?)",
        (full_name, first, last, clean(data.get("birth_date"), 10),
         clean(data.get("parent_name"), 120), clean(data.get("parent_phone"), 24),
         clean(data.get("phone"), 24), db.iso(), db.iso(), g.user["id"])).lastrowid
    conn.execute("INSERT INTO consents (user_id, version, signed_by, relation, accepted, created_at)"
                 " VALUES (?, 'v1', ?, 'ota-ona', 1, ?)",
                 (user_id, clean(data.get("parent_name"), 120), db.iso()))
    group_ids = data.get("groups") or []
    if data.get("group_id"):
        group_ids.append(data["group_id"])
    for group_id in dict.fromkeys(group_ids):
        conn.execute("INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at)"
                     " VALUES (?, ?, ?, ?)", ("gm-" + uuid.uuid4().hex[:10], group_id, user_id,
                                              db.iso()))
    db.audit(conn, g.user, "student_create", f"user:{user_id}", full_name)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify({"ok": True, "student": student_public(conn, row)}), 201


@app.patch("/api/admin/students/<int:student_id>")
@auth.login_required("superadmin")
def admin_update_student(student_id: int):
    data = body()
    conn = g.conn
    row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'student'",
                       (student_id,)).fetchone()
    if not row:
        return jsonify({"error": "O‘quvchi topilmadi"}), 404
    fields = {}
    for key in ("birth_date", "parent_name", "parent_phone", "phone"):
        if key in data:
            fields[key] = clean(data.get(key), 120)
    if "full_name" in data:
        full_name = clean(data["full_name"], 120)
        if len(full_name.split()) < 2:
            return jsonify({"error": "Ism va familiyani to‘liq kiriting"}), 400
        parts = full_name.split()
        fields.update({"full_name": full_name, "first_name": parts[0],
                       "last_name": " ".join(parts[1:])})
    if "is_active" in data:
        fields["is_active"] = 1 if data["is_active"] else 0
    if fields:
        assignments = ", ".join(f"{key} = ?" for key in fields)
        conn.execute(f"UPDATE users SET {assignments} WHERE id = ?",
                     (*fields.values(), student_id))
    if "groups" in data:
        conn.execute("DELETE FROM group_members WHERE user_id = ?", (student_id,))
        for group_id in data["groups"] or []:
            conn.execute("INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at)"
                         " VALUES (?, ?, ?, ?)", ("gm-" + uuid.uuid4().hex[:10], group_id,
                                                  student_id, db.iso()))
    db.audit(conn, g.user, "student_update", f"user:{student_id}", str(list(fields)))
    conn.commit()
    return jsonify({"ok": True, "student": student_public(conn, conn.execute(
        "SELECT * FROM users WHERE id = ?", (student_id,)).fetchone())})


@app.delete("/api/admin/students/<int:student_id>")
@auth.login_required("superadmin")
def admin_delete_student(student_id: int):
    """Ma'lumotni o'chirish: biometriya va shaxsiy ma'lumot butunlay o'chadi."""
    conn = g.conn
    row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'student'",
                       (student_id,)).fetchone()
    if not row:
        return jsonify({"error": "Topilmadi"}), 404
    conn.execute("DELETE FROM attendance WHERE user_id = ?", (student_id,))
    conn.execute("DELETE FROM group_members WHERE user_id = ?", (student_id,))
    conn.execute("DELETE FROM wallet WHERE user_id = ?", (student_id,))
    conn.execute("DELETE FROM kiosk_tokens WHERE user_id = ?", (student_id,))
    conn.execute("DELETE FROM consents WHERE user_id = ?", (student_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (student_id,))
    db.audit(conn, g.user, "student_delete", f"user:{student_id}",
             f"{row['full_name']} — barcha ma’lumot o‘chirildi")
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/students/<int:student_id>/face")
@auth.login_required("superadmin")
def admin_enroll_face(student_id: int):
    data = body()
    descriptors = data.get("descriptors") or []
    conn = g.conn
    row = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'student'",
                       (student_id,)).fetchone()
    if not row:
        return jsonify({"error": "O‘quvchi topilmadi"}), 404
    if not isinstance(descriptors, list) or not descriptors:
        return jsonify({"error": "Yuz namunalari yuborilmadi"}), 400
    valid = [faces.normalize_descriptor(item) for item in descriptors
             if faces.valid_descriptor(item)]
    if len(valid) < db.int_setting(conn, "face_min_samples", 3):
        return jsonify({"error": "Kamida 3 ta sifatli namuna kerak"}), 400
    spread = faces.consistency(valid)
    if spread > 0.55:
        return jsonify({"error": f"Namunalar bir-biriga mos emas ({spread:.2f}). "
                                 "Yorug‘likni tekshiring va qayta oling."}), 400
    photo = data.get("photo") or ""
    photo_enc = row["photo_enc"]
    if photo.startswith("data:image/"):
        import base64
        raw = photo.split(",", 1)[1] if "," in photo else ""
        try:
            blob = base64.b64decode(raw)
            if len(blob) > 1_500_000:
                return jsonify({"error": "Rasm juda katta"}), 400
            photo_enc = faces.encrypt_bytes(blob)
        except ValueError:
            return jsonify({"error": "Rasm formati xato"}), 400
    conn.execute("UPDATE users SET face_enc = ?, face_count = ?, photo_enc = ? WHERE id = ?",
                 (faces.save_descriptors(valid), len(valid), photo_enc, student_id))
    db.audit(conn, g.user, "face_enroll", f"user:{student_id}",
             f"{len(valid)} namuna, spread={spread:.3f}")
    conn.commit()
    return jsonify({"ok": True, "samples": len(valid), "spread": round(spread, 3)})


@app.delete("/api/admin/students/<int:student_id>/face")
@auth.login_required("superadmin")
def admin_reset_face(student_id: int):
    g.conn.execute("UPDATE users SET face_enc = NULL, face_count = 0 WHERE id = ?", (student_id,))
    db.audit(g.conn, g.user, "face_delete", f"user:{student_id}", "biometriya o‘chirildi")
    g.conn.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/students/<int:student_id>/photo")
@auth.login_required("superadmin", "teacher")
def admin_photo(student_id: int):
    conn = g.conn
    row = conn.execute("SELECT photo_enc FROM users WHERE id = ?", (student_id,)).fetchone()
    if not row or not row["photo_enc"]:
        return jsonify({"error": "Rasm yo‘q"}), 404
    blob = faces.decrypt_bytes(row["photo_enc"])
    if not blob:
        return jsonify({"error": "Rasm ochilmadi"}), 404
    return send_file(io.BytesIO(blob), mimetype="image/jpeg", max_age=0)


@app.post("/api/admin/students/<int:student_id>/coins")
@auth.login_required("superadmin")
def admin_grant_coins(student_id: int):
    data = body()
    amount = int(data.get("amount") or 0)
    cash = int(data.get("cash") or 0)
    result = coins.grant(g.conn, student_id, amount, reason=clean(data.get("reason"), 120)
                         or "Admin tomonidan", actor_id=g.user["id"], cash=cash)
    g.conn.commit()
    if not result.get("ok"):
        return jsonify({"error": result.get("error")}), 400
    return jsonify(result)


@app.get("/api/admin/students/<int:student_id>/history")
@auth.login_required("superadmin")
def admin_history(student_id: int):
    conn = g.conn
    row = conn.execute("SELECT * FROM users WHERE id = ?", (student_id,)).fetchone()
    if not row:
        return jsonify({"error": "Topilmadi"}), 404
    return jsonify({
        "student": student_public(conn, row),
        "coins": coins.term_summary(conn, student_id),
        "wallet": coins.history(conn, student_id, 100),
        "attendance": [dict(r) for r in conn.execute(
            "SELECT s.date, a.status, a.check_in, a.check_out, g.name AS group_name"
            " FROM attendance a JOIN sessions s ON s.id = a.session_id"
            " JOIN groups g ON g.id = s.group_id WHERE a.user_id = ?"
            " ORDER BY s.date DESC LIMIT 60", (student_id,))],
    })


# ── guruhlar ───────────────────────────────────────────────────────────────

@app.get("/api/admin/groups")
@auth.login_required("superadmin")
def admin_groups():
    conn = g.conn
    rows = conn.execute(
        "SELECT g.*, u.full_name AS teacher_name,"
        " (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members"
        " FROM groups g LEFT JOIN users u ON u.id = g.teacher_id ORDER BY g.name").fetchall()
    return jsonify({"groups": [dict(r) for r in rows]})


@app.post("/api/admin/groups")
@auth.login_required("superadmin")
def admin_create_group():
    data = body()
    name = clean(data.get("name"), 60)
    if not name:
        return jsonify({"error": "Guruh nomi kerak"}), 400
    conn = g.conn
    group_id = "grp-" + uuid.uuid4().hex[:8]
    conn.execute(
        "INSERT INTO groups (id, name, teacher_id, weekdays, start_time, duration_min, room,"
        " created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (group_id, name, data.get("teacher_id"), clean(data.get("weekdays"), 20),
         clean(data.get("start_time"), 5) or "09:00", int(data.get("duration_min") or 90),
         clean(data.get("room"), 40), db.iso()))
    db.audit(conn, g.user, "group_create", group_id, name)
    conn.commit()
    return jsonify({"ok": True, "id": group_id}), 201


@app.patch("/api/admin/groups/<group_id>")
@auth.login_required("superadmin")
def admin_update_group(group_id: str):
    data = body()
    fields = {}
    for key in ("name", "weekdays", "start_time", "room"):
        if key in data:
            fields[key] = clean(data.get(key), 60)
    if "duration_min" in data:
        fields["duration_min"] = int(data["duration_min"])
    if "teacher_id" in data:
        fields["teacher_id"] = data["teacher_id"]
    if "is_active" in data:
        fields["is_active"] = 1 if data["is_active"] else 0
    if fields:
        assignments = ", ".join(f"{key} = ?" for key in fields)
        g.conn.execute(f"UPDATE groups SET {assignments} WHERE id = ?",
                       (*fields.values(), group_id))
    db.audit(g.conn, g.user, "group_update", group_id)
    g.conn.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/groups/<group_id>/members")
@auth.login_required("superadmin")
def admin_add_member(group_id: str):
    data = body()
    user_id = int(data.get("user_id") or 0)
    if not user_id:
        return jsonify({"error": "O‘quvchi tanlanmadi"}), 400
    g.conn.execute("INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at)"
                   " VALUES (?, ?, ?, ?)",
                   ("gm-" + uuid.uuid4().hex[:10], group_id, user_id, db.iso()))
    db.audit(g.conn, g.user, "group_member_add", group_id, str(user_id))
    g.conn.commit()
    return jsonify({"ok": True})


@app.delete("/api/admin/groups/<group_id>/members/<int:user_id>")
@auth.login_required("superadmin")
def admin_remove_member(group_id: str, user_id: int):
    g.conn.execute("DELETE FROM group_members WHERE group_id = ? AND user_id = ?",
                   (group_id, user_id))
    db.audit(g.conn, g.user, "group_member_remove", group_id, str(user_id))
    g.conn.commit()
    return jsonify({"ok": True})


# ── sessiyalar / davomat ───────────────────────────────────────────────────

@app.get("/api/admin/sessions")
@auth.login_required("superadmin", "teacher")
def admin_sessions():
    conn = g.conn
    date_str = request.args.get("date") or db.today()
    if g.user["role"] == "teacher":
        groups = teacher_groups(conn, g.user["id"])
        for group in groups:
            att.ensure_session(conn, group, date_str, force=True)
        conn.commit()
        ids = [group["id"] for group in groups]
    else:
        ids = None
    sql = ("SELECT s.*, g.name AS group_name,"
           " (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS present,"
           " (SELECT COUNT(*) FROM group_members m WHERE m.group_id = s.group_id) AS total"
           " FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.date = ?")
    params: list = [date_str]
    if ids is not None:
        if not ids:
            return jsonify({"sessions": []})
        sql += f" AND s.group_id IN ({','.join('?' * len(ids))})"
        params.extend(ids)
    sql += " ORDER BY s.starts_at"
    rows = conn.execute(sql, params).fetchall()
    return jsonify({"date": date_str, "sessions": [dict(row) for row in rows]})


@app.get("/api/admin/sessions/<session_id>/attendance")
@auth.login_required("superadmin", "teacher")
def session_attendance(session_id: str):
    conn = g.conn
    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session:
        return jsonify({"error": "Sessiya topilmadi"}), 404
    if not can_manage_group(g.user, session["group_id"], conn):
        return jsonify({"error": "Ruxsat yo‘q"}), 403
    rows = conn.execute(
        "SELECT u.id, u.full_name, u.face_count, a.status, a.check_in, a.check_out, a.method"
        " FROM group_members m JOIN users u ON u.id = m.user_id"
        " LEFT JOIN attendance a ON a.user_id = u.id AND a.session_id = ?"
        " WHERE m.group_id = ? ORDER BY u.full_name", (session_id, session["group_id"])).fetchall()
    return jsonify({"session": dict(session), "rows": [dict(row) for row in rows]})


@app.post("/api/admin/sessions/<session_id>/reopen")
@auth.login_required("superadmin", "teacher")
def session_reopen(session_id: str):
    conn = g.conn
    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session or not can_manage_group(g.user, session["group_id"], conn):
        return jsonify({"error": "Ruxsat yo‘q"}), 403
    att.reopen(conn, session_id, g.user["id"])
    conn.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/attendance/manual")
@auth.login_required("superadmin", "teacher")
def manual_attendance():
    data = body()
    conn = g.conn
    session = conn.execute("SELECT * FROM sessions WHERE id = ?",
                           (clean(data.get("sessionId"), 40),)).fetchone()
    if not session:
        return jsonify({"error": "Sessiya topilmadi"}), 404
    if not can_manage_group(g.user, session["group_id"], conn):
        return jsonify({"error": "Ruxsat yo‘q"}), 403
    user_id = int(data.get("userId") or 0)
    status = clean(data.get("status"), 20)
    if status not in ("keldi", "kechikdi", "kelmadi", "sababli"):
        return jsonify({"error": "Holat noto‘g‘ri"}), 400
    existing = conn.execute("SELECT * FROM attendance WHERE session_id = ? AND user_id = ?",
                            (session["id"], user_id)).fetchone()
    if existing:
        conn.execute("UPDATE attendance SET status = ?, method = 'manual', created_by = ?"
                     " WHERE id = ?", (status, g.user["id"], existing["id"]))
    else:
        conn.execute(
            "INSERT INTO attendance (id, session_id, user_id, check_in, status, method,"
            " created_by, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)",
            ("att-" + uuid.uuid4().hex[:12], session["id"], user_id,
             db.iso() if status in ("keldi", "kechikdi") else None, status,
             g.user["id"], db.iso()))
    db.audit(conn, g.user, "attendance_manual", session["id"], f"user:{user_id} {status}")
    conn.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/attendance")
@auth.login_required("superadmin", "teacher")
def attendance_report():
    conn = g.conn
    date_from = request.args.get("from") or db.today()
    date_to = request.args.get("to") or date_from
    group_id = request.args.get("group") or None
    sql = ("SELECT s.date, g.name AS group_name, u.full_name, a.status, a.check_in,"
           " a.check_out, a.method FROM attendance a"
           " JOIN sessions s ON s.id = a.session_id JOIN groups g ON g.id = s.group_id"
           " JOIN users u ON u.id = a.user_id WHERE s.date BETWEEN ? AND ?")
    params: list = [date_from, date_to]
    if group_id:
        sql += " AND s.group_id = ?"
        params.append(group_id)
    sql += " ORDER BY s.date DESC, g.name, u.full_name LIMIT 2000"
    rows = conn.execute(sql, params).fetchall()
    return jsonify({"from": date_from, "to": date_to,
                    "rows": [dict(row) for row in rows]})


# ── sozlamalar / ustozlar / audit ──────────────────────────────────────────

EDITABLE = {"school_name", "open_before_min", "window_hours", "late_after_min",
            "checkout_enabled", "coin_present", "coin_late", "daily_limit_student",
            "teacher_daily_limit", "teacher_max_award", "award_cooldown_min",
            "term_start", "term_end", "term_name", "face_threshold", "face_margin",
            "face_min_samples", "require_liveness", "kiosk_group_id", "ai_model",
            "ai_voice", "ai_greeting", "sheets_webhook", "sheets_enabled", "sheets_token",
            "backup_keep_days"}


@app.get("/api/admin/settings")
@auth.login_required("superadmin")
def admin_settings():
    conn = g.conn
    data = db.settings_map(conn)
    data["kiosk_key"] = db.get_setting(conn, "kiosk_key")
    data["ai_key_set"] = ai.enabled()
    return jsonify({"settings": data, "term": dict(zip(("start", "end"), db.term_range(conn)))})


@app.patch("/api/admin/settings")
@auth.login_required("superadmin")
def admin_save_settings():
    data = body()
    conn = g.conn
    changed = []
    for key, value in data.items():
        if key in EDITABLE:
            db.set_setting(conn, key, value)
            changed.append(key)
    if changed:
        db.audit(conn, g.user, "settings_update", "", ",".join(changed))
    conn.commit()
    return jsonify({"ok": True, "changed": changed})


@app.post("/api/admin/kiosk-key")
@auth.login_required("superadmin")
def rotate_kiosk_key():
    key = secrets.token_urlsafe(24)
    db.set_setting(g.conn, "kiosk_key", key)
    db.audit(g.conn, g.user, "kiosk_key_rotate")
    g.conn.commit()
    return jsonify({"ok": True, "kiosk_key": key})


@app.get("/api/admin/teachers")
@auth.login_required("superadmin")
def admin_teachers():
    conn = g.conn
    rows = conn.execute("SELECT * FROM users WHERE role = 'teacher' ORDER BY full_name").fetchall()
    result = []
    for row in rows:
        groups = [r["name"] for r in conn.execute(
            "SELECT name FROM groups WHERE teacher_id = ?", (row["id"],))]
        result.append({**staff_public(row), "groups": groups,
                       "given_today": db.awarded_by_today(conn, row["id"]),
                       "is_active": bool(row["is_active"])})
    return jsonify({"teachers": result,
                    "limits": {"max_award": db.int_setting(conn, "teacher_max_award", 5),
                               "daily": db.int_setting(conn, "teacher_daily_limit", 30)}})


@app.post("/api/admin/teachers")
@auth.login_required("superadmin")
def admin_create_teacher():
    data = body()
    username = clean(data.get("username"), 40).lower()
    password = str(data.get("password") or "")
    full_name = clean(data.get("full_name"), 120)
    if not username or len(password) < 8 or len(full_name.split()) < 2:
        return jsonify({"error": "Login, to‘liq ism va kamida 8 belgili parol kerak"}), 400
    conn = g.conn
    if conn.execute("SELECT 1 FROM users WHERE lower(username) = ?", (username,)).fetchone():
        return jsonify({"error": "Bu login band"}), 409
    user_id = conn.execute(
        "INSERT INTO users (role, username, password_hash, full_name, first_name, last_name,"
        " created_at, created_by) VALUES ('teacher', ?, ?, ?, ?, ?, ?, ?)",
        (username, auth.hash_password(password), full_name, full_name.split()[0],
         " ".join(full_name.split()[1:]), db.iso(), g.user["id"])).lastrowid
    for group_id in data.get("groups") or []:
        conn.execute("UPDATE groups SET teacher_id = ? WHERE id = ?", (user_id, group_id))
    db.audit(conn, g.user, "teacher_create", f"user:{user_id}", username)
    conn.commit()
    return jsonify({"ok": True, "id": user_id}), 201


@app.patch("/api/admin/teachers/<int:teacher_id>")
@auth.login_required("superadmin")
def admin_update_teacher(teacher_id: int):
    data = body()
    conn = g.conn
    if "password" in data and data["password"]:
        if len(str(data["password"])) < 8:
            return jsonify({"error": "Parol kamida 8 belgi"}), 400
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'teacher'",
                     (auth.hash_password(str(data["password"])), teacher_id))
        conn.execute("DELETE FROM staff_sessions WHERE user_id = ?", (teacher_id,))
    if "is_active" in data:
        conn.execute("UPDATE users SET is_active = ? WHERE id = ? AND role = 'teacher'",
                     (1 if data["is_active"] else 0, teacher_id))
    if "groups" in data:
        conn.execute("UPDATE groups SET teacher_id = NULL WHERE teacher_id = ?", (teacher_id,))
        for group_id in data["groups"] or []:
            conn.execute("UPDATE groups SET teacher_id = ? WHERE id = ?", (teacher_id, group_id))
    db.audit(conn, g.user, "teacher_update", f"user:{teacher_id}")
    conn.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/audit")
@auth.login_required("superadmin")
def admin_audit():
    rows = g.conn.execute(
        "SELECT a.*, u.full_name AS actor_name FROM audit a"
        " LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 300").fetchall()
    return jsonify({"rows": [dict(row) for row in rows]})


# ── zaxira / eksport / sheets ──────────────────────────────────────────────

@app.get("/api/admin/backups")
@auth.login_required("superadmin")
def admin_backups():
    return jsonify({"backups": backup.list_backups()})


@app.post("/api/admin/backups")
@auth.login_required("superadmin")
def admin_backup_now():
    result = backup.make_backup("qolda")
    db.audit(g.conn, g.user, "backup", result.get("file", ""))
    g.conn.commit()
    return jsonify(result)


@app.get("/api/admin/backups/<name>")
@auth.login_required("superadmin")
def admin_backup_download(name: str):
    path = backup.path_of(name)
    if not path:
        return jsonify({"error": "Fayl topilmadi"}), 404
    db.audit(g.conn, g.user, "backup_download", name)
    g.conn.commit()
    return send_file(path, as_attachment=True, download_name=name)


@app.get("/api/admin/export")
@auth.login_required("superadmin")
def admin_export():
    conn = g.conn
    kind = request.args.get("type", "attendance")
    date_from = request.args.get("from") or db.today()
    date_to = request.args.get("to") or date_from
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    if kind == "coins":
        writer.writerow(["Sana", "O‘quvchi", "Coin", "Sabab", "Kim berdi"])
        rows = conn.execute(
            "SELECT w.created_at, u.full_name, w.coin_delta, w.reason, a.full_name"
            " FROM wallet w JOIN users u ON u.id = w.user_id"
            " LEFT JOIN users a ON a.id = w.granted_by"
            " WHERE substr(w.created_at,1,10) BETWEEN ? AND ? ORDER BY w.id",
            (date_from, date_to)).fetchall()
        for row in rows:
            writer.writerow([row[0], row[1], row[2], row[3], row[4] or ""])
        name = f"coinlar-{date_from}_{date_to}.csv"
    else:
        writer.writerow(["Sana", "Guruh", "O‘quvchi", "Holat", "Kirgan", "Chiqqan", "Usul"])
        rows = conn.execute(
            "SELECT s.date, g.name, u.full_name, a.status, a.check_in, a.check_out, a.method"
            " FROM attendance a JOIN sessions s ON s.id = a.session_id"
            " JOIN groups g ON g.id = s.group_id JOIN users u ON u.id = a.user_id"
            " WHERE s.date BETWEEN ? AND ? ORDER BY s.date, g.name, u.full_name",
            (date_from, date_to)).fetchall()
        for row in rows:
            writer.writerow(list(row))
        name = f"davomat-{date_from}_{date_to}.csv"
    data = "\ufeff" + buffer.getvalue()
    return send_file(io.BytesIO(data.encode("utf-8")), mimetype="text/csv",
                     as_attachment=True, download_name=name)


@app.post("/api/admin/sheets/sync")
@auth.login_required("superadmin")
def admin_sheets_sync():
    conn = g.conn
    data = body()
    date_str = clean(data.get("date"), 10) or db.today()
    result_a = sheets.push(conn, sheets.attendance_rows(conn, date_str), "davomat")
    result_c = sheets.push(conn, sheets.coin_rows(conn, date_str), "coinlar")
    db.audit(conn, g.user, "sheets_sync", date_str,
             f"davomat={result_a.get('ok')} coin={result_c.get('ok')}")
    conn.commit()
    return jsonify({"ok": result_a.get("ok") and result_c.get("ok"),
                    "attendance": result_a, "coins": result_c}), 200


# ── ustoz paneli ───────────────────────────────────────────────────────────

@app.get("/api/teacher/overview")
@auth.login_required("teacher")
def teacher_overview():
    conn = g.conn
    groups = teacher_groups(conn, g.user["id"])
    result = []
    for group in groups:
        session = att.ensure_session(conn, group, force=True)
        present = conn.execute("SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?",
                               (session["id"],)).fetchone()["n"] if session else 0
        result.append({**dict(group), "session": dict(session) if session else None,
                       "present": present, "members": len(att.member_ids(conn, group["id"]))})
    conn.commit()
    return jsonify({
        "groups": result,
        "given_today": db.awarded_by_today(conn, g.user["id"]),
        "max_award": db.int_setting(conn, "teacher_max_award", 5),
        "daily_limit": db.int_setting(conn, "teacher_daily_limit", 30),
        "coins": coins.totals(conn),
        "leaderboard": coins.leaderboard(conn, 5),
    })


@app.get("/api/teacher/students")
@auth.login_required("teacher")
def teacher_students():
    conn = g.conn
    group_id = request.args.get("group") or ""
    query = normalize_name(request.args.get("q", ""))
    groups = teacher_groups(conn, g.user["id"])
    ids = [group["id"] for group in groups if not group_id or group["id"] == group_id]
    if not ids:
        return jsonify({"students": []})
    placeholders = ",".join("?" * len(ids))
    sql = ("SELECT DISTINCT u.* FROM users u JOIN group_members m ON m.user_id = u.id"
           f" WHERE m.group_id IN ({placeholders}) AND u.is_active = 1")
    params: list = list(ids)
    if query:
        sql += " AND lower(u.full_name) LIKE ?"
        params.append(f"%{query}%")
    sql += " ORDER BY u.full_name LIMIT 300"
    rows = conn.execute(sql, params).fetchall()
    return jsonify({"students": [student_public(conn, row) for row in rows]})


@app.post("/api/teacher/coins")
@auth.login_required("teacher")
def teacher_grant():
    data = body()
    conn = g.conn
    student_id = int(data.get("studentId") or 0)
    groups = [group["id"] for group in teacher_groups(conn, g.user["id"])]
    allowed = conn.execute(
        f"SELECT 1 FROM group_members WHERE user_id = ? AND group_id IN"
        f" ({','.join('?' * len(groups))})", (student_id, *groups)).fetchone() if groups else None
    if not allowed:
        return jsonify({"error": "Bu o‘quvchi sizning guruhingizda emas"}), 403
    result = coins.grant(conn, student_id, int(data.get("amount") or 0),
                         reason=clean(data.get("reason"), 120) or "Ustoz tokeni",
                         actor_id=g.user["id"])
    conn.commit()
    if not result.get("ok"):
        return jsonify({"error": result.get("error")}), 400
    return jsonify(result)


@app.get("/api/teacher/session/<session_id>")
@auth.login_required("teacher")
def teacher_session(session_id: str):
    conn = g.conn
    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session or not can_manage_group(g.user, session["group_id"], conn):
        return jsonify({"error": "Ruxsat yo‘q"}), 403
    rows = conn.execute(
        "SELECT u.id, u.full_name, a.status, a.check_in, a.check_out, a.method"
        " FROM group_members m JOIN users u ON u.id = m.user_id"
        " LEFT JOIN attendance a ON a.user_id = u.id AND a.session_id = ?"
        " WHERE m.group_id = ? ORDER BY u.full_name", (session_id, session["group_id"])).fetchall()
    return jsonify({"session": dict(session), "rows": [dict(row) for row in rows]})


# ── SPA ────────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    target = os.path.join(STATIC_DIR, path)
    if os.path.isfile(target):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


def bootstrap() -> None:
    db.init_db()
    conn = db.connect()
    try:
        count = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'").fetchone()
        if count["n"] == 0:
            password = os.environ.get("ADMIN_PASSWORD") or "shams2026"
            conn.execute(
                "INSERT INTO users (role, username, password_hash, full_name, first_name,"
                " last_name, created_at) VALUES ('superadmin', ?, ?, ?, 'Bosh', 'Admin', ?)",
                (os.environ.get("ADMIN_USERNAME", "admin"), auth.hash_password(password),
                 "Bosh administrator", db.iso()))
            if not os.environ.get("ADMIN_PASSWORD"):
                db.set_setting(conn, "default_password_warning", "1")
            conn.commit()
    finally:
        conn.close()
    backup.maybe_daily()


bootstrap()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=bool(os.environ.get("DEBUG")))
