@echo off
call "%~dp0_common.bat"
tasklist /fi "imagename eq redis-server.exe" | find /i "redis-server.exe" >nul && (
  echo Redis already running.
  exit /b 0
)
if not exist "%REDIS_DIR%\redis-server.exe" (
  echo [X] redis-server.exe not found in %REDIS_DIR%
  exit /b 1
)
echo Starting Redis from %REDIS_DIR%
start "Redis" /min "%REDIS_DIR%\redis-server.exe" --port 6379
timeout /t 2 >nul
exit /b 0
