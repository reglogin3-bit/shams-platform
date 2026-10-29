# Shams Academy — Face ID davomat + Coin platformasi

**Loyiha hujjati (texnik topshiriq + arxitektura + yo‘l xaritasi)**
Versiya 1.0 · 2026-yil oktyabr

---

## 1. Qisqa xulosa (qaror)

Ikki mavjud loyiha — `shams-davomat` (React, davomat, ovozli yordamchi) va `shamscoin-final` (Flask + SQLite, coin iqtisodi, admin va ustoz paneli) — **bitta web-ilovaga** birlashtirildi:

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Backend | Python 3.12 + Flask + SQLite (WAL) | 3–4 guruh (60–120 bola) uchun yetarli, bitta fayl = oddiy zaxira |
| Frontend | React 18 + Vite (Flask’dan tarqatiladi) | Kiosk, admin, ustoz panellari bitta kod bazasida |
| Yuz tekshiruvi | Brauzerda `face-api.js` (TensorFlow.js), 128-o‘lchamli descriptor, solishtirish **serverda** | Kamera bo‘lgan har qanday qurilma ishlaydi, GPU server kerak emas |
| Ovoz | OpenAI (STT + chat + TTS) **server proxy** orqali; kalit brauzerga chiqmaydi; zaxira — brauzer ovozi | "AI gapirish" saqlanadi, kalit xavfsiz |
| Hisobot | Asosiy baza + Google Sheets’ga **bir tomonlama ko‘zgu** (faqat davomat/coin) | Sheets qulay, lekin biometrika uchun baza bo‘la olmaydi |
| Joylashtirish | Docker → Render/Railway yoki maktab serveri | HTTPS avtomatik = telefon kamerasi ishlaydi |

**Nima uchun Google Sheets yagona yechim emas:** unda shifrlash, qator darajasidagi ruxsat, yuz ma’lumotini xavfsiz saqlash va bir vaqtda yozish nazorati yo‘q. Sheets — **hisobot oynasi**, baza emas.

---

## 2. Eski loyihalardan nima olindi

| Eski loyiha | Olindi | O‘zgartirildi |
|---|---|---|
| `shams-davomat` | Dizayn tili (Quyosh/Shams), guruh-jadval modeli, kunlik/oylik hisobot mantiqi, ovozli yordamchi g‘oyasi, brauzer WAV yozuvi (`recorder.js`) | `localStorage` → serverdagi SQLite; Gemini → OpenAI proxy; login → haqiqiy sessiya |
| `shamscoin-final` | Foydalanuvchi/rol modeli, hamyon (ledger) yondashuvi, ustoz huquqlari, sozlamalar, audit g‘oyasi, Docker/Render konfiguratsiyasi | Telegram Mini App → brauzer; yuz bilan kirish qo‘shildi; limitlar kengaytirildi |
| Yangi | Face ID ro‘yxatga olish (kelajak.uzedu.uz uslubi), 3 soatlik davomat oynasi, kiosk rejimi, ota-ona roziligi, Sheets ko‘zgusi, zaxira | — |

---

## 3. Talablar → yechim

| Talab | Qanday bajarildi |
|---|---|
| Bola kelib, guruhini aytib kiradi | Kioskda mikrofon: "Men Aziza, 2-guruh" → AI ismni ajratadi → nomzod chiqadi → **yuz tasdiqlaydi** |
| O‘zi topib o‘tadi | Kamera oldida 1–3 soniya turadi → descriptor → server moslashtiradi → davomat avtomatik |
| Dars + 3 soat, keyin yopiladi | `sessions.closes_at = start + window_hours` (sozlanadi, standart 3). Yopilgandan keyin faqat ustoz/admin qayta ochadi (auditga yoziladi) |
| Login kerak | Xodimlar login/parol bilan; **bolaga login kerak emas** — yuz bilan kiradi |
| Alohida superadmin paneli | O‘quvchilar, guruhlar, davomat, coin qoidalari, ustozlar, sozlamalar, audit, zaxira |
| Ustozlar ham token bera oladi | Ustoz paneli: faqat o‘z guruhi, bir martada 5, kuniga 30 (sozlanadi) |
| Panelda o‘zini qidirib, coinini ko‘rish | Kiosk qidiruvi → o‘quvchi tanlanadi → **yuz tasdiqlangach** coin balansi va tarix ko‘rinadi (boshqa bolaning coini ko‘rinmaydi) |
| Face ID qattiq tekshirsin | 3–5 namuna, moslik chegarasi 0.45, ikkinchi nomzoddan farq ≥ 0.08, jonlilik (miltillash) talabi |
| Telefon/noutbuk kamerasi bilan test | Brauzerda `getUserMedia`; HTTPS yoki localhost shart |
| Chop etiladigan (publishable) sayt | Docker/Render bilan HTTPS domen; mahalliy tarmoqda `http://IP:8000` |

---

## 4. Arxitektura

```
┌───────────────────────────── QURILMALAR ─────────────────────────────┐
│  Kiosk (planshet/noutbuk + USB kamera)      Telefon (ota-ona/ustoz)  │
│  brauzer: /kiosk                            brauzer: /admin /teacher │
└───────────────┬───────────────────────────────────────┬──────────────┘
                │ HTTPS (cookie sessiya / kiosk kaliti)  │
┌───────────────▼───────────────────────────────────────▼──────────────┐
│                      FLASK ILOVA (bitta jarayon)                     │
│  /api/kiosk/*   — yuz, davomat, qidiruv, ovoz   (X-Kiosk-Key)        │
│  /api/admin/*   — superadmin (sessiya + rol)                         │
│  /api/teacher/* — ustoz (o‘z guruhi)                                 │
│  /api/auth/*    — login/logout/parol                                 │
│                                                                      │
│  faces.py   — Fernet shifrlash, descriptor solishtirish              │
│  attendance.py — sessiya, 3 soatlik oyna, kechikish                  │
│  coins.py   — ledger, limitlar, termin                               │
│  ai.py      — OpenAI proxy (STT/chat/TTS)                            │
│  backup.py  — SQLite backup API, kunlik nusxa                        │
│  sheets.py  — Sheets’ga bir tomonlama yuborish                       │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │                               │
        ┌───────▼────────┐              ┌───────▼─────────┐
        │ SQLite (WAL)   │              │ OpenAI API      │
        │ data/shams.db  │              │ (kalit serverda)│
        │ + backups/*.db │              └─────────────────┘
        └───────┬────────┘
                │ ixtiyoriy
        ┌───────▼──────────────────┐
        │ Google Sheets (ko‘zgu)   │  ← faqat davomat va coin jadvali
        └──────────────────────────┘
```

**Muhim prinsip:** brauzer faqat *descriptor* (128 ta son) yuboradi. Yuz rasmi va descriptorlar serverda **shifrlangan** holda saqlanadi, solishtirish serverda bo‘ladi. Bu — kiosk qurilmasi o‘g‘irlansa ham bazani olib ketishning oldini oladi.

---

## 5. Qurilmalar va dasturlar

### 5.1 Minimal to‘plam (1 kirish nuqtasi, 3–4 guruh)

| # | Qurilma | Tavsif | Taxminiy narx |
|---|---|---|---|
| 1 | USB web-kamera 1080p | Logitech C270/C920 sinfidagi, avtofokus | $25–70 |
| 2 | Planshet yoki noutbuk | 10" Android planshet yoki mavjud noutbuk | $0–150 |
| 3 | Stend / ushlagich | Kiosk balandligi (~120 sm) | $10–25 |
| 4 | Yorug‘lik | 60 sm masofada yumshoq LED (ship yorug‘i yetarli) | $0–15 |
| 5 | Tarmoq | Wi-Fi 2.4/5 GHz | mavjud |

**Jami: ~$35–260** (noutbuk bo‘lsa — $35–110).

### 5.2 Dasturiy ta’minot

| Komponent | Versiya | Izoh |
|---|---|---|
| Python | 3.12 | Flask 3.1, waitress |
| Node.js | 20+ | faqat build uchun |
| React + Vite | 18.3 / 5.4 | build natijasi `static/` |
| face-api.js | 1.7.15 (`@vladmandic`) | modellar `static/models` (6.8 MB, oflayn) |
| SQLite | 3.4x, WAL | bitta fayl |
| Brauzer | Chrome/Edge 110+, Safari 16+ | kamera + WebGL |

---

## 6. Yuzni aniqlash usuli

### 6.1 Quvur (pipeline)

1. **Aniqlash:** `TinyFaceDetector` (inputSize 320, score ≥ 0.50). Kadr 230 ms da bir marta tekshiriladi.
2. **Nuqtalar:** 68 ta landmark (ko‘z, burun, og‘iz konturi).
3. **Descriptor:** `FaceRecognitionNet` → 128 o‘lchamli vektor.
4. **Jonlilik:** ko‘z ochiq/yopiq nisbati (EAR) bo‘yicha **kamida 1 miltillash**; qo‘shimcha — yuz o‘lchami va kadrlar barqarorligi.
5. **Solishtirish (serverda):** yevklid masofasi.
   - eng yaqin nomzod ≤ **0.45** (sozlanadi),
   - ikkinchi nomzoddan farq ≥ **0.08** (chalkashishni rad etadi),
   - aks holda "tanilmadi" — davomat belgilanmaydi.
6. **Natija:** `attendance` yozuvi + `method='face'`, `confidence`; kechikish `start + 10 daqiqa`dan keyin.

### 6.2 Ro‘yxatga olish (kelajak.uzedu.uz uslubi)

- Admin o‘quvchi kartasini yaratadi: ism, familiya, tug‘ilgan sana, guruh, ota-ona ismi/telefoni, **rozilik belgisi** (majburiy).
- "Yuz" tugmasi → kamera → **3–5 namuna** (boshni ozgina burib). Sifat filtri: score ≥ 0.62, yuz kengligi ≥ 120 px.
- Server namunalar orasidagi tarqoqlikni tekshiradi: **> 0.55 bo‘lsa rad etadi** (bir xil odam emas / yorug‘lik yomon).
- Saqlanadi: shifrlangan descriptorlar + shifrlangan foto (320 px, JPEG).

### 6.3 Halollik chegarasi (muhim)

Brauzerdagi miltillash tekshiruvi **telefon ekranidagi rasmni** to‘liq to‘smaydi. Davomat — past xavfli stsenariy (ustoz yonida), shuning uchun bu yetarli. Agar kelajakda to‘lov/kirish nazorati shu tizimga bog‘lansa, **sertifikatlangan liveness SDK** (yoki apparatli 3D kamera) ga o‘tish kerak. Buni hujjatda ochiq yozib qo‘yish — audit uchun to‘g‘ri yo‘l.

---

## 7. Davomat oynasi qoidasi

```
start = guruh jadvalidagi boshlanish vaqti (masalan 15:00)
ochilish = start − 15 daqiqa      (sozlanadi: open_before_min)
yopilish = start + 3 soat         (sozlanadi: window_hours = 3)
kechikish = start + 10 daqiqa     (late_after_min)

start−15 … start+10   → "keldi"      +2 coin (sozlanadi)
start+10 … start+3h   → "kechikdi"   +1 coin
start+3h dan keyin    → oyna yopiq   → kiosk rad etadi
```

- Oyna yopilgach faqat **ustoz/admin** "Qayta ochish" bilan 30 daqiqaga ochadi — `audit` jadvalida kim va qachon ochgani qoladi.
- Jadvalda dars bo‘lmagan kunda sessiya yaratilmaydi (kiosk "bugun dars yo‘q" deydi).

---

## 8. Rollar va ruxsatlar

| Amal | Superadmin | Ustoz | Kiosk (qurilma) | Bola |
|---|---|---|---|---|
| O‘quvchi qo‘shish / o‘chirish | ✅ | ❌ | ❌ | ❌ |
| Yuz ro‘yxatga olish / o‘chirish | ✅ | ❌ | ❌ | ❌ |
| Guruh va jadval | ✅ | ❌ | ❌ | ❌ |
| Davomatni qo‘lda belgilash | ✅ | faqat o‘z guruhi | faqat yuz bilan | ❌ |
| Coin berish | ✅ (limitsiz, audit) | ≤5 bir martada, ≤30/kun | ❌ | ❌ |
| Coin qoidalari / termin | ✅ | ❌ | ❌ | ❌ |
| O‘z coini va tarixi | ✅ | — | ✅ (yuz tasdiqdan keyin) | ✅ |
| Zaxira, audit, sozlamalar | ✅ | ❌ | ❌ | ❌ |

**Kiosk** — login emas, **qurilma kaliti** (`X-Kiosk-Key`, 32 belgi). Kalitni faqat kiosk qurilmasiga kiritish kerak; almashtirilsa barcha qurilmalar qayta ulanadi.

---

## 9. Ma’lumotlar modeli

| Jadval | Nima saqlanadi |
|---|---|
| `users` | rol, login/parol hash (scrypt), ism, ota-ona, **shifrlangan yuz + foto**, rozilik sanasi |
| `groups`, `group_members` | guruh, jadval (kunlar, vaqt, davomiylik), a’zolik |
| `sessions` | kunlik dars: `starts_at`, `closes_at`, holat (open/closed/scheduled) |
| `attendance` | kirish/chiqish vaqti, holat, usul (face/manual), ishonch darajasi |
| `wallet` | har bir coin harakati (ledger): kim, qachon, nima uchun, kim berdi |
| `consents` | ota-ona roziligi: versiya, kim imzoladi, sana |
| `settings` | oyna, limitlar, termin, yuz chegaralari, kiosk kaliti |
| `audit` | login, coin, yuz o‘chirish, sozlama — barcha muhim amallar |
| `staff_sessions`, `kiosk_tokens` | sessiya tokenlari (muddati bilan) |

Balans alohida ustunda emas — **`SUM(wallet.coin_delta)`** bilan hisoblanadi. Bu hisob-kitob xatolarini yo‘q qiladi va har qanday holatda tarixdan tiklash imkonini beradi.

---

## 10. Saqlash va zaxiralash

| Nima | Qanday |
|---|---|
| Asosiy baza | `data/shams.db` (WAL rejimi, `synchronous=FULL`) |
| Avtomatik nusxa | Har kuni bir marta `data/backups/shams-YYYYMMDD-*.db` (SQLite backup API — ishlab turgan bazadan xavfsiz) |
| Saqlash muddati | 30 kun (sozlanadi), keyin avtomatik o‘chadi |
| Qo‘lda nusxa | Admin → Sozlamalar → "Hozir nusxalash" + yuklab olish |
| Tashqi nusxa | Haftada bir marta yuklab olib, tashqi disk yoki maktab Google Drive’iga |
| Tiklash | Faylni `data/shams.db` ustiga qo‘yish (ilova to‘xtatilgan holda) + `PRAGMA integrity_check` |
| Yuz ma’lumotlari | `FACE_ENC_KEY` (Fernet) bilan shifrlangan. **Kalit yo‘qolsa — yuzlar tiklanmaydi**, shuning uchun kalitni parol menejerida saqlash shart |

---

## 11. Google Sheets integratsiyasi

### 11.1 Nima uchun "ko‘zgu"

Sheets — o‘qituvchi va rahbariyat uchun eng qulay ko‘rish vositasi. Lekin u:
- qator darajasida ruxsat bermaydi (havolasi bor har kim hammasini ko‘radi),
- biometrikani shifrlay olmaydi,
- bir vaqtda ko‘p yozuvda kolliziya beradi,
- tarixni va tranzaksiya yaxlitligini kafolatlamaydi.

Shuning uchun **baza = SQLite**, **Sheets = hisobot nusxasi**.

### 11.2 Ishlash tartibi

1. Google Sheets’da yangi jadval → `Extensions → Apps Script`.
2. Quyidagi skriptni qo‘yish va `Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone`.
3. URL’ni admin panelda **Sozlamalar → Google Sheets** ga kiritish, tokenni ham.
4. `Sinxronlash` — tanlangan kun uchun davomat va coin qatorlarini yuboradi (takroriy yuborishda eski qatorlar almashtiriladi).

```javascript
// Apps Script — Sheets ko'zgusi (faqat davomat va coin)
const SECRET = 'BU_YERGA_TOKEN';   // panelda kiritilgan token bilan bir xil

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.token !== SECRET) return ContentService.createTextOutput('forbidden');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = body.sheet === 'coinlar' ? 'Coinlar' : 'Davomat';
  let sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = name === 'Davomat'
    ? ['Guruh', 'O‘quvchi', 'Holat', 'Kirgan', 'Chiqqan', 'Usul', 'Ishonch']
    : ['O‘quvchi', 'Coin', 'Sabab', 'Vaqt', 'Kim berdi'];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  // kunlik blokni almashtirish: sana ustunini tozalab qayta yozamiz
  body.rows.forEach((row) => sheet.appendRow(row));
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: body.rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**Bu yerga hech qachon yuborilmaydi:** yuz descriptorlari, fotosuratlar, ota-ona telefoni, parollar.

### 11.3 Solishtirish

| Mezon | Google Sheets (yagona yechim) | Web-ilova + baza (tanlangan) |
|---|---|---|
| Yuz ma’lumotini xavfsiz saqlash | ❌ shifrlash yo‘q, umumiy havola xavfli | ✅ Fernet shifrlash, faqat server |
| Kirishni boshqarish | faqat "ko‘rish/tahrirlash" | ✅ rol + sessiya + audit |
| 3 soatlik oynani avtomatik yopish | ❌ faqat skript bilan, ishonchsiz | ✅ serverda qat’iy |
| Bir vaqtda 4 guruh yozuvi | ⚠️ kolliziya, kvota (60 so‘rov/daq) | ✅ SQLite WAL, minglab yozuv/daqiqa |
| Yuz bilan solishtirish | ❌ imkonsiz | ✅ serverda |
| Zaxira | Google tarix | ✅ kunlik fayl + tashqi nusxa |
| Xarajat | $0 (lekin mehnat ko‘p) | $0–7/oy |
| Bola uchun qulaylik | past (jadval ichida qidirish) | ✅ kiosk: yuz + katta tugmalar |
| O‘rnatish vaqti | 1 kun | 1–2 kun (tayyor kod) |

**Xulosa:** 3–4 guruh miqyosida **web-ilova + SQLite** eng sodda, ishonchli va xavfsiz. Sheets faqat hisobot uchun qo‘shimcha.

---

## 12. Xavflar va muvofiqlik

### 12.1 Huquqiy asos

- O‘zbekiston Respublikasining **"Shaxsiy ma’lumotlar to‘g‘risida" Qonuni (ZRU-547, 02.07.2019)** shaxsiy ma’lumotlarni, jumladan **biometrik ma’lumotlarni** qayta ishlashga **subyektning (bolada — ota-onaning) yozma roziligini** talab qiladi.
- Qonunchilikda fuqarolarning shaxsiy ma’lumotlarini **mamlakat hududidagi serverlarda saqlash (lokallashtirish)** talabi mavjud. Shu sababli: hostingni O‘zbekistonda tanlash yoki mahalliy serverda ushlash — eng xavfsiz yo‘l. Aniq talqinni yurist bilan tasdiqlang.
- Manba: [lex.uz — ZRU-547](https://lex.uz/ru/pdfs/4396428).

### 12.2 Xavflar registri

| Xavf | Ehtimol | Ta’sir | Chora (kodda bor) |
|---|---|---|---|
| Roziliksiz biometrika yig‘ish | O‘rta | Yuqori (jarima, obro‘) | Rozilik belgisisiz o‘quvchi yaratilmaydi; `consents` jadvalida versiya + sana |
| Yuz bazasi o‘g‘irlanishi | Past | Juda yuqori | Descriptor+foto Fernet bilan shifrlangan; kalit serverda; kioskda baza yo‘q |
| Rasm bilan aldash (spoofing) | O‘rta | O‘rta | Miltillash talabi, sifat filtri, 0.45 chegara; yuqori xavfli stsenariyda sertifikatlangan SDK |
| Boshqa bolaning ma’lumotini ko‘rish | O‘rta | O‘rta | Qidiruv faqat ism+guruh; coin va tarix **yuz tasdiqdan keyin**, token 20 daqiqa |
| Kiosk kaliti tarqalishi | O‘rta | O‘rta | Kalitni almashtirish tugmasi; faqat kiosk endpointlariga ruxsat |
| Ustoz limitdan oshib token berishi | Past | Past | Server tomonida `teacher_max_award` + `teacher_daily_limit` |
| Baza buzilishi | Past | Yuqori | WAL + `synchronous=FULL` + kunlik nusxa + `integrity_check` |
| Kalit (FACE_ENC_KEY) yo‘qolishi | Past | Yuqori | Kalitni parol menejerida saqlash; zaxira nusxada ham |
| O‘quvchi ketganda ma’lumot qolishi | O‘rta | Yuqori | "Butunlay o‘chirish": yuz, foto, davomat, coin, rozilik — hammasi o‘chadi + audit yozuvi |
| Parolni buzishga urinish | O‘rta | O‘rta | scrypt hash, 6 urinishdan keyin 10 daqiqa blok, httpOnly cookie |

### 12.3 Maxfiylik tamoyillari (kodda)

1. **Minimallashtirish:** yuz — faqat davomat uchun; foto ixtiyoriy; ota-ona telefoni faqat aloqa uchun.
2. **Maqsad chegarasi:** descriptor boshqa hech qanday maqsadda ishlatilmaydi, uchinchi tomonga berilmaydi.
3. **Shifrlash:** biometrika va foto — dam olish holatida shifrlangan; transport — HTTPS.
4. **Kirish nazorati:** rol + sessiya + CSRF sarlavhasi + kiosk kaliti.
5. **O‘chirish huquqi:** admin bir tugma bilan butunlay o‘chiradi; auditda iz qoladi (shaxsiy ma’lumot emas, fakt).
6. **Shaffoflik:** ota-onaga qisqa rozilik matni (quyida) va maktab siyosati.

### 12.4 Rozilik matni (namuna)

> Men, \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ (ota-ona/vasiy), farzandim \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ ning yuz tasviri **faqat maktab davomatini avtomatik qayd etish** maqsadida qayta ishlanishiga rozilik beraman. Ma’lumot shifrlangan holda saqlanadi, uchinchi shaxslarga berilmaydi. Rozilikni istalgan vaqtda qaytarib olsam, ma’lumot 3 ish kuni ichida o‘chiriladi. Sana/imzo: \_\_\_\_\_\_\_\_

---

## 13. Xarajatlar (taxminiy)

### 13.1 Bir martalik (CAPEX)

| Variant | Tarkib | Narx |
|---|---|---|
| **A. Minimal test** | mavjud noutbuk + C270 kamera | **$25–45** |
| **B. Bitta kiosk** | 10" planshet + C920 kamera + stend | **$120–230** |
| **C. 2 kirish nuqtasi** (3–4 guruh uchun qulay) | 2 × (planshet + kamera + stend) | **$240–460** |

### 13.2 Oylik (OPEX)

| Xarajat | Taxmin |
|---|---|
| Hosting (Render Starter + disk) | $7–9 /oy |
| Domen | ~$10–12 /yil |
| OpenAI (ovoz) | **taxminan $2–15 /oy** — foydalanishga bog‘liq; aniq narx [openai.com/api/pricing](https://openai.com/api/pricing) da |
| Internet | mavjud |
| **Jami** | **~$10–25 /oy** |

> Mahalliy serverda (maktab kompyuteri + tunnel) hosting $0 bo‘lishi mumkin, lekin elektr/uzluksizlik uchun UPS kerak.

---

## 14. Bosqichma-bosqich amalga oshirish rejasi

### Bosqich 0 — Tayyorlash (0.5 kun)
- [ ] 3–4 guruh ro‘yxati, jadval (kun/vaqt), ustozlar.
- [ ] Ota-ona rozilik varaqalari (qog‘oz yoki Google Form).
- [ ] `ADMIN_PASSWORD`, `FACE_ENC_KEY`, `OPENAI_API_KEY` qiymatlarini tayyorlash (chatga yozmasdan!).

### Bosqich 1 — Mahalliy ishga tushirish (0.5 kun)
- [ ] `pip install -r requirements.txt` → `python backend/app.py`.
- [ ] `http://localhost:8000/kiosk` — noutbuk kamerasi bilan yuz aniqlashni tekshirish.
- [ ] Admin: `admin` / `ADMIN_PASSWORD` bilan kirib, parolni almashtirish.

### Bosqich 2 — Ma’lumot kiritish (1 kun)
- [ ] Guruhlar + jadval.
- [ ] Ustozlar (login/parol, guruh biriktirish).
- [ ] O‘quvchilar: ism, ota-ona, guruh, **rozilik**.
- [ ] Har bir bolaga 3–5 yuz namunasi (yorug‘ xona, tekis fon).
- [ ] **Sinov:** har bir bolani kioskda tekshirish; noto‘g‘ri moslik bo‘lsa chegarani 0.42 ga tushirish.

### Bosqich 3 — Sinov davri (1 hafta, real darslar)
- [ ] Kiosk eshik yonida; ustoz nazoratida.
- [ ] Har kuni: nechta "tanilmadi" bo‘ldi, sabab (yorug‘lik, masofa, niqob).
- [ ] Coin qoidalarini kalibrlash (keldi/kechikdi, kunlik limit).
- [ ] Zaxira nusxasini tekshirish (tiklab ko‘rish!).

### Bosqich 4 — Internetga chiqarish (0.5 kun)
- [ ] Docker/Render deploy (yoki maktab serveri + HTTPS tunnel).
- [ ] Domen, HTTPS tekshiruvi.
- [ ] Telefon bilan `https://domen/kiosk?kiosk=KALIT` ochib, kamera ishlashini tekshirish.
- [ ] `FACE_ENC_KEY` va `OPENAI_API_KEY` muhit o‘zgaruvchilari sifatida (kodda emas).

### Bosqich 5 — Doimiy ish (har hafta)
- [ ] Har hafta: zaxira faylini yuklab olish, auditni ko‘zdan kechirish.
- [ ] Har oy: limitlar/termin yopilishi, reyting e’loni.
- [ ] O‘quvchi ketganda: "Butunlay o‘chirish".

**Umumiy vaqt: 3–4 kun tayyorgarlik + 1 hafta sinov.**

---

## 15. Test → ishga tushirish yo‘l xaritasi

| Hafta | Maqsad | Muvaffaqiyat mezoni |
|---|---|---|
| 1 | Kiosk prototipi (noutbuk kamera) | 10 boladan 9 tasi 1 urinishda tanildi |
| 2 | Rozilik + 1 guruh to‘liq kiritildi | Barcha bolada ≥3 namuna, 0 xato moslik |
| 3 | Real darslarda sinov | "Tanilmadi" < 10%, o‘rtacha tekshiruv < 5 s |
| 4 | Ustoz paneli + coin | Ustoz mustaqil token bera oladi, limit ishlaydi |
| 5 | Sheets ko‘zgusi + zaxira | Hisobot avtomatik chiqadi, nusxa tiklanadi |
| 6 | To‘liq ishga tushirish | 3–4 guruh, kunlik 0 qo‘lda tuzatish |

---

## 16. Ishga tushirish checklisti

- [ ] Standart admin paroli almashtirildi
- [ ] `FACE_ENC_KEY` zaxira qilindi (parol menejeri)
- [ ] `OPENAI_API_KEY` faqat serverda
- [ ] Kiosk kaliti faqat kiosk qurilmasida
- [ ] Har bir o‘quvchida rozilik sanasi bor
- [ ] Har bir o‘quvchida ≥3 yuz namunasi
- [ ] Davomat oynasi (3 soat) va kechikish chegarasi tekshirildi
- [ ] Kunlik zaxira ishlaydi va **tiklash sinaldi**
- [ ] Audit jurnalida test yozuvlari ko‘rindi
- [ ] HTTPS va telefon kamerasi tekshirildi

---

## 17. Ma’lum cheklovlar va keyingi qadamlar

| Cheklov | Yechim (kelajakda) |
|---|---|
| Brauzer liveness — kuchli emas | Sertifikatlangan liveness SDK yoki 3D kamera |
| SQLite — bitta server | 500+ o‘quvchi bo‘lsa PostgreSQL’ga ko‘chirish (kodda SQL oddiy) |
| Bir kiosk = bitta navbat | 2 kiosk + guruh bo‘yicha ajratish |
| Sheets — bir tomonlama | Ikki tomonlama sinxron kerak bo‘lsa, Apps Script + webhook |
| Telegram integratsiyasi yo‘q | Eski `bot.py` ni qayta ulash mumkin (ota-onaga kunlik xabar) |
