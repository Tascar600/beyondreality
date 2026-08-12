@echo off
title Push Beyond Reality to GitHub
cd /d "%~dp0"

echo ========================================
echo  Push to GitHub: beyondreality
echo  https://github.com/Tascar600/beyondreality.git
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed. Install from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Initializing git repository...
  git init
  git branch -M main
)

git remote remove origin 2>nul
git remote add origin https://github.com/Tascar600/beyondreality.git

echo.
echo Staging all files...
git add -A

echo.
git status

echo.
set /p CONFIRM=Commit and push to GitHub? (Y/N): 
if /i not "%CONFIRM%"=="Y" (
  echo Cancelled.
  pause
  exit /b 0
)

git commit -m "Beyond Reality Housing Portal - ready for Render deployment"
if errorlevel 1 (
  echo Nothing new to commit, or commit failed. Trying push anyway...
)

echo.
echo Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed. If the repo already has commits, try:
  echo   git pull origin main --rebase
  echo   git push -u origin main
  echo.
  echo Or if you need to force first push ^(only if repo is empty^):
  echo   git push -u origin main --force
  pause
  exit /b 1
)

echo.
echo ========================================
echo  SUCCESS! Code pushed to GitHub.
echo.
echo  Next: Deploy on Render
echo  1. Go to https://dashboard.render.com
echo  2. New + ^> Blueprint
echo  3. Connect GitHub repo: Tascar600/beyondreality
echo  4. Render will read render.yaml automatically
echo  5. Add SMTP env vars in Render dashboard for email
echo  6. After deploy, import Excel via Excel Import page
echo ========================================
pause
