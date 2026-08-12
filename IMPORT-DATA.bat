@echo off
title Beyond Reality - Import COMBINED Excel
cd /d "%~dp0scripts"
echo.
echo Importing COMBINED SCUSTOMER STATEMENTS_042427.xlsx
echo This REPLACES all clients and payments in the database.
echo.
node run-full-import.js "%USERPROFILE%\Desktop\COMBINED SCUSTOMER STATEMENTS_042427.xlsx"
echo.
pause
