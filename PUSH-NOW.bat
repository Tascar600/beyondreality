@echo off
title Push Beyond Reality to GitHub - AUTO
cd /d "%~dp0"

echo Pushing to https://github.com/Tascar600/beyondreality.git ...
echo.

where git >nul 2>&1 || (echo ERROR: Install Git from https://git-scm.com/download/win & pause & exit /b 1)

if not exist ".git" (
  git init
)

git branch -M main 2>nul
git remote remove origin 2>nul
git remote add origin https://github.com/Tascar600/beyondreality.git

git add -A
git status

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Beyond Reality Housing Portal - ready for Render deployment"
) else (
  echo No new changes to commit.
)

echo.
echo Pushing...
git push -u origin main
if errorlevel 1 (
  echo First push failed, trying pull then push...
  git pull origin main --rebase --allow-unrelated-histories 2>nul
  git push -u origin main
)
if errorlevel 1 (
  echo Trying force push to empty repo...
  git push -u origin main --force
)

echo.
git remote -v
git log -1 --oneline
echo.
echo DONE. Check https://github.com/Tascar600/beyondreality
pause
