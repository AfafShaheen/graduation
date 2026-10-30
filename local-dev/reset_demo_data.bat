@echo off
chcp 65001 >nul
call "%~dp0_common.bat"
echo This WIPES the LOCAL database (graduation_dev) and re-creates the demo data.
set /p OK=Type YES to continue: 
if /i not "%OK%"=="YES" exit /b 0
call "%~dp0start_redis.bat"
cd /d "%ROOT%\back"
"%VENV_PY%" scripts\seed_data.py --env-file "%LOCAL_ENV%" --wipe --quiet && "%VENV_PY%" scripts\seed_data.py --env-file "%LOCAL_ENV%" --quiet
pause
