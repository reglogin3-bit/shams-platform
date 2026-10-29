@echo off
cd /d "%~dp0"
python -m pip install -q -r requirements.txt
echo Server: http://localhost:8000   kiosk: /kiosk   panel: /login
python backend\app.py
pause
