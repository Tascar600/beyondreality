@echo off
title Beyond Reality Portal (Production)
cd /d "%~dp0"

echo Building client...
cd client
call npm install
call npm run build
if errorlevel 1 exit /b 1
cd ..

echo Starting production server on port 4040...
cd server
call npm install
set NODE_ENV=production
set PORT=4040
node index.js
