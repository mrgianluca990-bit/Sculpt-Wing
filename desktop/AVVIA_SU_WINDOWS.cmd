@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Per avviare dal codice serve Node.js 22 o successivo. L'app compilata non richiede Node.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm start
