@echo off
rem Shared helpers. Called by the other scripts with: call "%~dp0_common.bat"
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "LOCAL_ENV=%ROOT%\local-dev\local.env"
set "VENV_PY=%ROOT%\back\.venv\Scripts\python.exe"
set "REDIS_DIR=C:\redis"
if exist "%LOCAL_ENV%" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%LOCAL_ENV%") do (
    if /i "%%a"=="REDIS_DIR" set "REDIS_DIR=%%b"
  )
)
exit /b 0
