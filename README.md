# Shams Academy — Face ID davomat + Coin

Bitta ilova: **kiosk** (yuz bilan davomat), **superadmin paneli**, **ustoz paneli**, **coin tizimi**, **ovozli yordamchi (Quyoshvoy)**.

To‘liq loyiha hujjati: [`docs/LOYIHA.md`](docs/LOYIHA.md)

---

## 1. Tez ishga tushirish (5 daqiqa)

Kerak: **Python 3.10+** va **Chrome/Edge** brauzeri. Node.js shart emas — interfeys allaqachon yig‘ilgan (`static/`).

```bash
cd shams-platform
pip install -r requirements.txt
python backend/app.py
```

Brauzerda oching:

| Sahifa | Manzil |
|---|---|
| Kiosk (bola uchun) | http://localhost:8000/kiosk |
| Xodimlar kirishi | http://localhost:8000/login |

**Birinchi kirish:** login `admin`, parol `shams2026` → darhol **Sozlamalar → Parolni o‘zgartirish** dan almashtiring.

Windows’da: `start.bat` ni ikki marta bosing.
Linux/macOS’da: `./start.sh`

---

## 2. Kioskni ulash

1. Admin bilan kiring → **Sozlamalar → Kiosk** → kalitni nusxalang.
2. Kiosk qurilmasida havolani oching:
   `http://localhost:8000/kiosk?kiosk=KALIT`
   (havola orqali kirilsa, kalit o‘sha qurilmada saqlanadi).
3. Kamera ruxsatini bering.

**Telefon bilan sinash (bir Wi-Fi’da):**
- Kompyuterning IP manzilini oling (`ipconfig` / `ifconfig`), masalan `192.168.1.20`.
- Telefonda: `http://192.168.1.20:8000/kiosk?kiosk=KALIT`
- ⚠️ iPhone/Safari va Android Chrome telefon kamerasi uchun **HTTPS** talab qiladi. `http://` bilan ishlamasa — 4-bo‘limdagi internetga chiqarish usulini ishlating (u avtomatik HTTPS beradi), yoki kompyuterda `cloudflared tunnel --url http://localhost:8000` bilan vaqtinchalik HTTPS havola oling.

---

## 3. Birinchi sozlash tartibi

1. **Guruhlar** → yangi guruh: nom, kunlar, boshlanish vaqti, davomiylik.
2. **Ustozlar** → login/parol, guruh biriktirish.
3. **O‘quvchilar** → yangi o‘quvchi (ism, ota-ona, guruh) + **rozilik belgisi**.
4. Har bir o‘quvchi qatorida **«Yuz»** → 3–5 namuna → Saqlash.
5. Kioskda sinab ko‘ring: bola kamera oldida turadi → davomat avtomatik.
6. **Coin qoidalari** → keldi/kechikdi coini, kunlik limit, termin.

Davomat oynasi: dars boshlanishidan **15 daqiqa oldin** ochiladi, **3 soatdan keyin** yopiladi (Sozlamalar → Davomat oynasi).

---

## 4. Internetga chiqarish (HTTPS bilan)

**Variant A — Render.com (eng oson):**
1. Loyihani GitHub’ga yuklang (yoki zipni Render’ga bering).
2. Render → New → **Web Service** → Docker → `render.yaml` avtomatik o‘qiladi.
3. Environment: `OPENAI_API_KEY`, `ADMIN_PASSWORD`, `FACE_ENC_KEY`.
   `FACE_ENC_KEY` yarating:
   `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`
4. Disk: `/app/data` (1 GB) — baza va zaxiralar saqlanadi.
5. Deploy → `https://....onrender.com` → kiosk havolasi tayyor.

**Variant B — maktab kompyuteri + tunnel:**
```bash
python backend/app.py
cloudflared tunnel --url http://localhost:8000
```
Vaqtinchalik HTTPS havola beradi (doimiy ish uchun domen bilan sozlash kerak).

**Muhim:** `data/` papkasini zaxiralang; `FACE_ENC_KEY` yo‘qolsa yuz ma’lumotlari tiklanmaydi.

---

## 5. Ovozli yordamchi (OpenAI)

`.env` fayli yoki muhit o‘zgaruvchisi:

```
OPENAI_API_KEY=sk-...
```

Kalit **faqat serverda** turadi, brauzerga chiqmaydi. Kalit bo‘lmasa ham tizim ishlaydi — ovoz brauzerdagi TTS bilan aytiladi, faqat nutqni tanish (STT) ishlamaydi.

---

## 6. Tuzilma

```
backend/    app.py (API), db.py, auth.py, faces.py, attendance.py,
            coins.py, ai.py, backup.py, sheets.py
frontend/   React manba (o‘zgartirsangiz: npm install && npm run build)
static/     yig‘ilgan interfeys + face-api modellari + shriftlar
docs/       LOYIHA.md — to‘liq texnik hujjat
data/       baza va zaxiralar (birinchi ishga tushishda yaratiladi)
```

Interfeysni o‘zgartirish:
```bash
cd frontend && npm install && npm run build   # natija ../static ga tushadi
```

---

## 7. Tez-tez uchraydigan muammolar

| Muammo | Sabab / yechim |
|---|---|
| «Kamera topilmadi» | Boshqa dastur kamerani band qilgan; brauzerda ruxsat berilmagan |
| Telefonda kamera ochilmaydi | HTTPS yo‘q — 4-bo‘lim |
| «Yuz mos kelmadi» | Yorug‘lik kam, bola yaqin emas; yuzni qayta ro‘yxatga oling |
| «Davomat oynasi yopilgan» | Dars + 3 soat o‘tgan; ustoz/admin «Qayta ochish» bilan ochadi |
| Kiosk 401 | Kiosk kaliti noto‘g‘ri — Sozlamalar → Kiosk, havolani qayta nusxalang |
| Ovoz eshitilmaydi | `OPENAI_API_KEY` yo‘q (brauzer ovozi ishlaydi) yoki brauzer ovozni bloklagan — sahifani bir marta bosing |
