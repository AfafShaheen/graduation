@echo off
call "%~dp0_common.bat"
title Frontend :5173
cd /d "%ROOT%\front"
if not exist node_modules ( call npm install )
echo Frontend: https://localhost:5173   (accept the certificate warning once)
call npm run dev -- --port 5173
pause
