@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$wsh=New-Object -ComObject WScript.Shell; $desktop=[Environment]::GetFolderPath('Desktop'); $root=(Get-Location).Path; $targetExe=Join-Path $root 'Agenda-Martin-Acosta.exe'; $targetBat=Join-Path $root 'Agenda-Martin-Acosta.bat'; $target=if(Test-Path $targetExe){$targetExe}else{$targetBat}; $shortcut=$wsh.CreateShortcut((Join-Path $desktop 'Agenda Martin Acosta.lnk')); $shortcut.TargetPath=$target; $shortcut.WorkingDirectory=$root; $shortcut.IconLocation=(Join-Path $root 'assets\agenda.ico'); $shortcut.Description='Agenda del Escribano Martin Acosta'; $shortcut.Save()"
echo Acceso directo creado en el Escritorio.
pause
