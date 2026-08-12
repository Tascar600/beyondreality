@echo off
title Beyond Reality - Restart API
cd /d "%~dp0"

echo Stopping old API on port 4040...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4040" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting API with latest code...
cd server
call npm install >nul 2>&1
start "Beyond Reality API" cmd /k "cd /d %~dp0server && npm start"

timeout /t 4 /nobreak >nul
echo.
echo Check the API window shows:
echo   [api] version 2026-08-12-email-v2
echo.
echo Open http://localhost:5180 and try Email Setup again.
pause
