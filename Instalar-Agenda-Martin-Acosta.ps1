$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = if ($env:AGENDA_INSTALL_DIR) { $env:AGENDA_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\AgendaMartinAcosta" }
$dataRoot = if ($env:AGENDA_DATA_HOME) { $env:AGENDA_DATA_HOME } else { Join-Path $env:LOCALAPPDATA "AgendaMartinAcosta" }
$dataDir = Join-Path $dataRoot "datos"
$backupDir = Join-Path $dataRoot "backups"
$desktop = if ($env:AGENDA_DESKTOP_DIR) { $env:AGENDA_DESKTOP_DIR } else { [Environment]::GetFolderPath("Desktop") }
$startMenuDir = if ($env:AGENDA_START_MENU_DIR) { $env:AGENDA_START_MENU_DIR } else { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Agenda Martin Acosta" }

$items = @(
  "Agenda-Martin-Acosta.exe",
  "Agenda-Martin-Acosta.bat",
  "Agenda-Martin-Acosta.ps1",
  "index.html",
  "styles.css",
  "app.js",
  "server.js",
  "runtime",
  "assets",
  "hacer-backup.bat",
  "probar-app.bat",
  "test-app.js",
  "README.md",
  "INSTRUCCIONES-PARA-MARTIN.txt",
  "Desinstalar-Agenda-Martin-Acosta.bat",
  "Desinstalar-Agenda-Martin-Acosta.ps1"
)

Write-Host "Instalando Agenda Martin Acosta..."
New-Item -ItemType Directory -Force -Path $installDir, $dataDir, $backupDir, $startMenuDir | Out-Null

foreach ($item in $items) {
  $from = Join-Path $source $item
  if (Test-Path $from) {
    $to = Join-Path $installDir $item
    if (Test-Path $to) {
      Remove-Item $to -Recurse -Force
    }
    Copy-Item $from $to -Recurse -Force
  }
}

$targetDb = Join-Path $dataDir "agenda_martin_acosta.db"
$candidateDbs = @(
  (Join-Path $source "datos\agenda_martin_acosta.db"),
  (Join-Path $source "agenda_martin_acosta.db")
)

if (!(Test-Path $targetDb)) {
  foreach ($candidate in $candidateDbs) {
    if (Test-Path $candidate) {
      Copy-Item $candidate $targetDb -Force
      break
    }
  }
}

$wsh = New-Object -ComObject WScript.Shell
$targetExe = Join-Path $installDir "Agenda-Martin-Acosta.exe"
$targetBat = Join-Path $installDir "Agenda-Martin-Acosta.bat"
$target = if (Test-Path $targetExe) { $targetExe } else { $targetBat }
$icon = Join-Path $installDir "assets\agenda.ico"

foreach ($shortcutPath in @((Join-Path $desktop "Agenda Martin Acosta.lnk"), (Join-Path $startMenuDir "Agenda Martin Acosta.lnk"))) {
  $shortcut = $wsh.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $target
  $shortcut.WorkingDirectory = $installDir
  $shortcut.IconLocation = $icon
  $shortcut.Description = "Agenda del Escribano Martin Acosta"
  $shortcut.Save()
}

$uninstallShortcut = $wsh.CreateShortcut((Join-Path $startMenuDir "Desinstalar Agenda Martin Acosta.lnk"))
$uninstallShortcut.TargetPath = Join-Path $installDir "Desinstalar-Agenda-Martin-Acosta.bat"
$uninstallShortcut.WorkingDirectory = $installDir
$uninstallShortcut.IconLocation = $icon
$uninstallShortcut.Save()

Write-Host ""
Write-Host "Instalacion completa."
Write-Host "Acceso directo creado en el Escritorio."
Write-Host "Datos guardados en: $dataDir"
Write-Host ""
