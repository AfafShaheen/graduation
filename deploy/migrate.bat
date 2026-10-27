@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   Run DATABASE MIGRATIONS on the server now
echo ================================================
python deploy.py migrate
echo.
pause
