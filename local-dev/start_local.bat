@echo off
call "%~dp0_common.bat"
call "%~dp0start_redis.bat"
start "Backend :8000" cmd /k ""%~dp0start_back.bat""
start "Frontend :5173" cmd /k ""%~dp0start_front.bat""
echo Waiting for the servers...
timeout /t 8 >nul
start "" https://localhost:5173
