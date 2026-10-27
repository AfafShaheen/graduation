@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   Deploy FRONTEND to https://sunion-homs-uni.sy/graduation/
echo ================================================
python deploy.py front
echo.
pause
