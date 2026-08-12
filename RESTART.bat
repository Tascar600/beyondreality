@echo off
title Beyond Reality Portal - Restart
cd /d "%~dp0"

echo Stopping old servers on ports 4000, 4040, 5173, 5180...
for %%P in (4000 4040 5173 5180) do (
  for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%%P" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
)

cd server
call npm install
call npm install xlsx
cd ..
cd client
call npm install
cd ..

echo Starting API on http://localhost:4040
start "Beyond Reality API" cmd /k "cd /d "%~dp0server" && node index.js"

timeout /t 5 /nobreak >nul

echo Starting website on http://localhost:5180
start "Beyond Reality Web" cmd /k "cd /d "%~dp0client" && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5180/reports

echo.
echo ========================================
echo  http://localhost:5180
echo  finance / finance123
echo ========================================
pause
