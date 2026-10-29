#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m pip install -q -r requirements.txt
echo "Server: http://localhost:8000  (kiosk: /kiosk, panel: /login)"
python3 backend/app.py
