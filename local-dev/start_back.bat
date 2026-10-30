@echo off
chcp 65001 >nul
call "%~dp0_common.bat"
title Backend :8000
if not exist "%VENV_PY%" ( echo Run setup_local.bat first. & pause & exit /b 1 )
call "%~dp0start_redis.bat"
cd /d "%ROOT%\back"
echo Applying any new migrations...
"%VENV_PY%" scripts\run_migrations.py --env-file "%LOCAL_ENV%"
echo.
echo Backend: http://localhost:8000/docs   (Ctrl+C to stop)
echo OTP codes appear in THIS window (SMTP is empty locally).
"%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --env-file "%LOCAL_ENV%"
pause
