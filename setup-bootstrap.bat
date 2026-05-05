@echo off
setlocal
set "SETUP_WORK=%TEMP%\AgendaMartinAcostaSetup-%RANDOM%%RANDOM%"
mkdir "%SETUP_WORK%" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0Agenda-Martin-Acosta-Payload.zip' -DestinationPath '%SETUP_WORK%' -Force"
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%SETUP_WORK%\Instalar-Agenda-Martin-Acosta.ps1"
set "SETUP_RESULT=%ERRORLEVEL%"

exit /b %SETUP_RESULT%
