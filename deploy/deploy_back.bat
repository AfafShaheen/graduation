@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   Deploy BACKEND to https://sunion-homs-uni.sy/gradapi
echo ================================================
python deploy.py back
echo.
pause
