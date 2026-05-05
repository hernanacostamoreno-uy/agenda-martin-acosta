@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-Agenda-Martin-Acosta.ps1"
pause
