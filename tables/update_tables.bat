@echo off
chcp 65001 > nul
echo Updating tables...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0update_tables.ps1"
echo Done! tables.js updated successfully!
pause
