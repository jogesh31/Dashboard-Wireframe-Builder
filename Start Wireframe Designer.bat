@echo off
rem Opens the installed Wireframe Designer desktop app. If it isn't installed,
rem falls back to the browser version, with its local server running hidden
rem (no PowerShell window to keep open).
set "APP=%LOCALAPPDATA%\Programs\Wireframe Designer\Wireframe Designer.exe"
if exist "%APP%" (
  start "" "%APP%"
  exit /b
)
cd /d "%~dp0"
start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "serve.ps1" -Port 5500
timeout /t 2 /nobreak >nul
start "" http://localhost:5500/
