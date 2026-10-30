@echo off
setlocal
chcp 65001 >nul
call "%~dp0_common.bat"
echo === Graduation system: local setup (no Docker) ===
echo Repo: %ROOT%
echo.

rem 1) local.env
if not exist "%LOCAL_ENV%" (
  copy "%ROOT%\local-dev\local.env.example" "%LOCAL_ENV%" >nul
  echo Created local-dev\local.env
  echo Put your PostgreSQL password in DATABASE_URL, save, close Notepad, then run setup_local.bat again.
  notepad "%LOCAL_ENV%"
  goto :end
)
findstr /c:"CHANGE_ME@" "%LOCAL_ENV%" >nul && (
  echo [X] local-dev\local.env still has CHANGE_ME in DATABASE_URL. Edit it first.
  notepad "%LOCAL_ENV%"
  goto :end
)

rem 2) tools
set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY ( echo [X] Python 3.11+ not found. Install it from python.org and tick "Add to PATH". & goto :end )
where npm >nul 2>nul || ( echo [X] Node.js not found. Install Node 20+ LTS from nodejs.org. & goto :end )
if not exist "%REDIS_DIR%\redis-server.exe" (
  echo [X] redis-server.exe not found in %REDIS_DIR%
  echo     Download Redis-x64-5.0.14.1.zip and extract it to %REDIS_DIR% ^(see README^).
  goto :end
)

rem 3) backend venv + packages
if not exist "%VENV_PY%" (
  echo --- Creating Python venv in back\.venv
  %PY% -m venv "%ROOT%\back\.venv" || goto :fail
)
echo --- Installing backend packages
"%VENV_PY%" -m pip install --upgrade pip -q
"%VENV_PY%" -m pip install -r "%ROOT%\back\requirements.txt" || goto :fail

rem 4) Redis must run for the seed (refresh tokens use it)
call "%~dp0start_redis.bat"

rem 5) database: create + migrate + demo data
echo --- Creating database, running migrations and demo data
pushd "%ROOT%\back"
"%VENV_PY%" scripts\seed_data.py --env-file "%LOCAL_ENV%" --create-db --quiet
if errorlevel 1 ( popd & goto :fail )
popd

rem 6) frontend packages
echo --- Installing frontend packages
pushd "%ROOT%\front"
call npm install || ( popd & goto :fail )
popd

echo.
echo ===== SETUP DONE =====
echo Now run start_local.bat
goto :end

:fail
echo.
echo [X] Setup FAILED - read the error above.
:end
pause
