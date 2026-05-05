@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dataRoot=Join-Path $env:LOCALAPPDATA 'AgendaMartinAcosta'; $db=Join-Path $dataRoot 'datos\agenda_martin_acosta.db'; $backups=Join-Path $dataRoot 'backups'; if(!(Test-Path $db)){ throw 'No existe la base de datos todavia.' }; New-Item -ItemType Directory -Force -Path $backups | Out-Null; $ts=Get-Date -Format 'yyyy-MM-dd_HHmmss'; Copy-Item -LiteralPath $db -Destination (Join-Path $backups ('agenda_manual_' + $ts + '.db'))"
echo Backup creado en la carpeta backups.
pause
