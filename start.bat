@echo off
setlocal
title MLBB Overlay
chcp 65001 >nul
cd /d "%~dp0"

rem Optional overrides: set PORT=9000 / set HOST=0.0.0.0 before running this file.
if not defined PORT set "PORT=8765"
if not defined HOST set "HOST=127.0.0.1"
set "URL=http://localhost:%PORT%"

rem Keep the Python banner readable on Windows.
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

rem Find a real Python 3.8+ install. "py -3" is the python.org launcher.
set "PY="
py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 set "PY=python3"
)
if not defined PY (
  echo.
  echo   Python 3.8+ was not found.
  echo.
  echo   Install it from https://www.python.org/downloads/windows/
  echo   and tick "Add python.exe to PATH" during setup, then run this file again.
  echo.
  pause
  exit /b 1
)

rem Reuse a copy that is already running.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health'; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo MLBB overlay server is already running at %URL%
  start "" "%URL%/control.html"
  exit /b 0
)

echo Starting MLBB overlay server on %URL% ...
echo.
%PY% server.py --port %PORT% --host %HOST% --open

echo.
echo Server stopped. You can close this window.
pause
