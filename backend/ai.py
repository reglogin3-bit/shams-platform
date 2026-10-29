"""Quyoshvoy — OpenAI orqali ishlaydigan ovozli yordamchi.

Kalit faqat serverda (OPENAI_API_KEY). Brauzer hech qachon kalitni ko'rmaydi.
AI hech narsani to'g'ridan-to'g'ri yozmaydi: u faqat "taklif" qaytaradi,
yozish serverdagi tekshiruvlar (yuz tasdiqlash, limitlar, rol) orqali bo'ladi.
"""

from __future__ import annotations

import json
import os

import requests

API_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
TIMEOUT = 45


def api_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


def enabled() -> bool:
    return bool(api_key())


def _headers() -> dict:
    return {"Authorization": f"Bearer {api_key()}"}


def stt(audio_bytes: bytes, filename: str = "audio.wav", language: str = "uz") -> str:
    if not enabled():
        raise RuntimeError("OPENAI_API_KEY sozlanmagan")
    files = {"file": (filename, audio_bytes, "audio/wav")}
    data = {"model": os.environ.get("OPENAI_STT_MODEL", "whisper-1"), "language": language,
            "response_format": "json",
            "prompt": "Maktab davomati. O‘zbekcha ismlar, guruh nomlari, davomat, coin."}
    response = requests.post(f"{API_BASE}/audio/transcriptions", headers=_headers(),
                             files=files, data=data, timeout=TIMEOUT)
    response.raise_for_status()
    return (response.json().get("text") or "").strip()


def tts(text: str, voice: str = "alloy") -> bytes:
    if not enabled():
        raise RuntimeError("OPENAI_API_KEY sozlanmagan")
    payload = {
        "model": os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
        "voice": voice,
        "input": text[:900],
        "response_format": "mp3",
        "instructions": "O‘zbek tilida, iliq va xushmuomala ohangda, bolalar bilan gaplashgandek "
                        "sekin va aniq gapir.",
    }
    response = requests.post(f"{API_BASE}/audio/speech", headers={**_headers(),
                             "Content-Type": "application/json"},
                             data=json.dumps(payload), timeout=TIMEOUT)
    response.raise_for_status()
    return response.content


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "davomat_taklif",
            "description": "Bola ismini aytganda davomatni belgilash uchun taklif qiladi. "
                           "Faqat bola o‘z ismini aytganda ishlatiladi.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ism": {"type": "string", "description": "Bola ismi yoki familiyasi"},
                    "guruh": {"type": "string", "description": "Guruh nomi yoki raqami"},
                },
                "required": ["ism"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "coin_taklif",
            "description": "O‘quvchiga token/coin berish taklifi (faqat ustoz va admin).",
            "parameters": {
                "type": "object",
                "properties": {
                    "ism": {"type": "string"},
                    "miqdor": {"type": "integer"},
                    "sabab": {"type": "string"},
                },
                "required": ["ism", "miqdor"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "holat_ayt",
            "description": "Bugungi davomat yoki o‘quvchi coini haqida ma’lumot berish.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nima": {"type": "string", "enum": ["davomat", "coin", "guruhlar"]},
                    "ism": {"type": "string"},
                },
                "required": ["nima"],
            },
        },
    },
]

SYSTEM_KIOSK = (
    "Sen — Quyoshvoy, Shams Academy maktabining ovozli yordamchisisan. "
    "Bolalar bilan o‘zbek tilida, qisqa (1–2 gap), iliq va sodda gaplashasan. "
    "Vazifang: bolaning ismini eshitib davomatni belgilashga yordam berish. "
    "Yuz tasdiqlanmaguncha davomat belgilangan deb aytma — 'yuzingizni ko‘rsating' deb ayt. "
    "Hech qachon coin berma, ma’lumot o‘chirma, boshqa bolalar haqida ma’lumot aytma."
)

SYSTEM_STAFF = (
    "Sen — Quyoshvoy, Shams Academy platformasining ovozli yordamchisisan. "
    "Ustoz va admin bilan o‘zbek tilida, qisqa va aniq gaplashasan. "
    "Davomat, guruhlar, coin/token haqida yordam berasan. "
    "Har qanday yozish amali faqat taklif sifatida qaytariladi — foydalanuvchi tasdiqlaydi."
)


def chat(messages: list[dict], role: str = "kiosk", extra: str = "") -> dict:
    if not enabled():
        raise RuntimeError("OPENAI_API_KEY sozlanmagan")
    system = SYSTEM_KIOSK if role == "kiosk" else SYSTEM_STAFF
    if extra:
        system = system + "\n\nKontekst:\n" + extra
    payload = {
        "model": os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o-mini"),
        "messages": [{"role": "system", "content": system}] + messages[-8:],
        "tools": TOOLS,
        "tool_choice": "auto",
        "temperature": 0.4,
        "max_tokens": 300,
    }
    response = requests.post(f"{API_BASE}/chat/completions",
                             headers={**_headers(), "Content-Type": "application/json"},
                             data=json.dumps(payload), timeout=TIMEOUT)
    response.raise_for_status()
    message = response.json()["choices"][0]["message"]
    calls = message.get("tool_calls") or []
    proposals = []
    for call in calls:
        try:
            args = json.loads(call["function"].get("arguments") or "{}")
        except ValueError:
            args = {}
        proposals.append({"name": call["function"]["name"], "args": args})
    return {"reply": (message.get("content") or "").strip(), "proposals": proposals}
