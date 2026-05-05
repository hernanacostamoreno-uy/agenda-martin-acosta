$ErrorActionPreference = "Stop"

$installDir = if ($env:AGENDA_INSTALL_DIR) { $env:AGENDA_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\AgendaMartinAcosta" }
$dataRoot = if ($env:AGENDA_DATA_HOME) { $env:AGENDA_DATA_HOME } else { Join-Path $env:LOCALAPPDATA "AgendaMartinAcosta" }
$desktopDir = if ($env:AGENDA_DESKTOP_DIR) { $env:AGENDA_DESKTOP_DIR } else { [Environment]::GetFolderPath("Desktop") }
$desktopShortcut = Join-Path $desktopDir "Agenda Martin Acosta.lnk"
$startMenuDir = if ($env:AGENDA_START_MENU_DIR) { $env:AGENDA_START_MENU_DIR } else { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Agenda Martin Acosta" }

Write-Host "Desinstalando Agenda Martin Acosta..."

if (Test-Path $desktopShortcut) {
  Remove-Item $desktopShortcut -Force
}

if (Test-Path $startMenuDir) {
  Remove-Item $startMenuDir -Recurse -Force
}

if (Test-Path $installDir) {
  Remove-Item $installDir -Recurse -Force
}

Write-Host ""
Write-Host "Programa desinstalado."
Write-Host "Los datos NO fueron borrados."
Write-Host "Siguen en: $dataRoot"
