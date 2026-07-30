@echo off
cd /d "%~dp0"
start "Wireframe Designer Server - close this window to stop" powershell -NoProfile -ExecutionPolicy Bypass -File "serve.ps1" -Port 5500
timeout /t 2 /nobreak >nul
start "" http://localhost:5500/
