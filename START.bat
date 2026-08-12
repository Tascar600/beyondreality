@echo off
title Beyond Reality Housing Portal
cd /d "%~dp0"

echo Stopping old processes on ports 4040 and 5180...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4040" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo Installing dependencies...
cd server
call npm install
call npm install xlsx
cd ..\client
call npm install
cd ..

echo Starting API on http://localhost:4040 ...
start "Beyond Reality API" cmd /k "cd /d %~dp0server && npm start"

timeout /t 3 /nobreak >nul

echo Starting web app on http://localhost:5180 ...
start "Beyond Reality Web" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo ========================================
echo  Beyond Reality Portal is starting
echo  Open: http://localhost:5180
echo  Finance: finance / finance123
echo  API must show: [email] SMTP configured OR needs App Password
echo  Email sender: zimhungar@gmail.com
echo ========================================
pause
