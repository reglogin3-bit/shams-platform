"""Yuz ma'lumotlari: shifrlash, saqlash va solishtirish.

Model brauzerda ishlaydi (face-api.js, 128-o'lchamli descriptor).
Server faqat descriptorlarni qabul qiladi, shifrlab saqlaydi va solishtiradi —
xom yuz ma'lumoti hech qachon ochiq holda saqlanmaydi.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import struct

from cryptography.fernet import Fernet, InvalidToken

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_FILE = os.path.join(BASE_DIR, "..", "data", ".facekey")
DIM = 128


def _load_key() -> bytes:
    env = os.environ.get("FACE_ENC_KEY", "").strip()
    if env:
        return env.encode()
    # Kalit fayldan (birinchi ishga tushishda yaratiladi). Production'da env ishlatilsin.
    path = os.path.abspath(KEY_FILE)
    if os.path.exists(path):
        with open(path, "rb") as fh:
            return fh.read().strip()
    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(key)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


_cipher: Fernet | None = None


def cipher() -> Fernet:
    global _cipher
    if _cipher is None:
        _cipher = Fernet(_load_key())
    return _cipher


def encrypt_bytes(data: bytes) -> bytes:
    return cipher().encrypt(data)


def decrypt_bytes(blob: bytes | None) -> bytes:
    if not blob:
        return b""
    try:
        return cipher().decrypt(blob)
    except InvalidToken:
        return b""


def encrypt_text(text: str) -> bytes:
    return encrypt_bytes(text.encode("utf-8"))


def decrypt_text(blob: bytes | None) -> str:
    return decrypt_bytes(blob).decode("utf-8", "ignore")


# ── descriptorlar ───────────────────────────────────────────────────────────

def valid_descriptor(value) -> bool:
    if not isinstance(value, list) or len(value) != DIM:
        return False
    for item in value:
        if not isinstance(item, (int, float)) or not math.isfinite(float(item)):
            return False
    return True


def normalize_descriptor(value) -> list[float]:
    return [round(float(item), 6) for item in value]


def save_descriptors(descriptors: list[list[float]]) -> bytes:
    payload = json.dumps({"v": 1, "d": descriptors}, separators=(",", ":"))
    return encrypt_text(payload)


def load_descriptors(blob: bytes | None) -> list[list[float]]:
    raw = decrypt_text(blob)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        items = data.get("d") if isinstance(data, dict) else data
        return [normalize_descriptor(item) for item in items if valid_descriptor(item)]
    except (ValueError, TypeError):
        return []


def distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def consistency(descriptors: list[list[float]]) -> float:
    """Namunalar orasidagi eng katta masofa — bir xil odam ekanini tekshiradi."""
    if len(descriptors) < 2:
        return 0.0
    worst = 0.0
    for i in range(len(descriptors)):
        for j in range(i + 1, len(descriptors)):
            worst = max(worst, distance(descriptors[i], descriptors[j]))
    return worst


def match(query: list[float], candidates: list[tuple[int, list[list[float]]]],
          threshold: float, margin: float) -> dict:
    """Eng yaqin nomzodni topadi. Ishonchsiz bo'lsa — rad etadi.

    candidates: [(user_id, [descriptor, ...]), ...]
    """
    scored = []
    for user_id, descriptors in candidates:
        if not descriptors:
            continue
        best = min(distance(query, item) for item in descriptors)
        scored.append((best, user_id))
    if not scored:
        return {"ok": False, "reason": "empty"}
    scored.sort()
    best_distance, best_id = scored[0]
    second = scored[1][0] if len(scored) > 1 else 1.0
    if best_distance > threshold:
        return {"ok": False, "reason": "far", "distance": round(best_distance, 4)}
    if second - best_distance < margin:
        return {"ok": False, "reason": "ambiguous", "distance": round(best_distance, 4),
                "runner_up": round(second, 4)}
    confidence = max(0.0, min(1.0, 1.0 - (best_distance / max(threshold, 0.001)) * 0.6))
    return {"ok": True, "user_id": best_id, "distance": round(best_distance, 4),
            "confidence": round(confidence, 3)}


def photo_digest(blob: bytes | None) -> str:
    if not blob:
        return ""
    return hashlib.sha256(blob).hexdigest()[:12]
