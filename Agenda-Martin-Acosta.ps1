$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Step($message) {
  Write-Host "[Agenda] $message"
}

function Get-NodePath {
  $portableNode = Join-Path $root "runtime\node.exe"
  if (Test-Path $portableNode) {
    return $portableNode
  }

  $systemNode = Get-Command node -ErrorAction SilentlyContinue
  if ($systemNode) {
    return $systemNode.Source
  }

  throw "No se encontro Node.js ni el runtime incluido."
}

function Test-NodeVersion($nodePath) {
  $major = & $nodePath -p "Number(process.versions.node.split('.')[0])"
  if ([int]$major -lt 24) {
    throw "Esta agenda necesita Node.js 24 o superior."
  }
}

function Find-FreePort {
  param([int]$StartPort = 8000)

  for ($port = $StartPort; $port -lt ($StartPort + 100); $port++) {
    $client = New-Object Net.Sockets.TcpClient
    try {
      $client.Connect("127.0.0.1", $port)
      $client.Close()
    } catch {
      return $port
    }
  }

  throw "No encontre un puerto local libre para iniciar la agenda."
}

function Wait-Agenda {
  param([string]$Url)

  for ($i = 0; $i -lt 60; $i++) {
    try {
      Invoke-RestMethod -Uri "$Url/api/state" -TimeoutSec 1 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "El servidor local no respondio a tiempo."
}

function Get-BrowserPath {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Get-AppBrowserProcesses {
  param([string]$ProfilePath)

  $escaped = $ProfilePath.Replace("\", "\\")
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($ProfilePath) -or $_.CommandLine.Contains($escaped)) }
}

$serverProcess = $null

try {
  $nodePath = Get-NodePath
  Test-NodeVersion $nodePath

  $port = Find-FreePort
  $url = "http://127.0.0.1:$port"
  $dataRoot = if ($env:AGENDA_DATA_HOME) { $env:AGENDA_DATA_HOME } else { Join-Path $env:LOCALAPPDATA "AgendaMartinAcosta" }
  $dataDir = Join-Path $dataRoot "datos"
  $backupDir = Join-Path $dataRoot "backups"
  $dbPath = Join-Path $dataDir "agenda_martin_acosta.db"
  $profileDir = Join-Path $dataRoot "perfil-app"
  New-Item -ItemType Directory -Force -Path $dataDir, $backupDir | Out-Null
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

  $legacyDbCandidates = @(
    (Join-Path $root "datos\agenda_martin_acosta.db"),
    (Join-Path $root "agenda_martin_acosta.db")
  )
  if (!(Test-Path $dbPath)) {
    foreach ($legacyDb in $legacyDbCandidates) {
      if (Test-Path $legacyDb) {
        Copy-Item $legacyDb $dbPath -Force
        break
      }
    }
  }

  Write-Step "Iniciando motor local..."
  $env:PORT = [string]$port
  $env:APP_DATA_DIR = $dataDir
  $env:BACKUP_DIR = $backupDir
  $env:DB_PATH = $dbPath
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @("--no-warnings", "server.js") -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Wait-Agenda $url

  $browserPath = Get-BrowserPath
  if ($browserPath) {
    Write-Step "Abriendo ventana de escritorio..."
    Start-Process -FilePath $browserPath -ArgumentList @("--app=$url", "--user-data-dir=$profileDir", "--no-first-run") | Out-Null
    Start-Sleep -Seconds 2

    while (Get-AppBrowserProcesses $profileDir) {
      Start-Sleep -Seconds 2
    }
  } else {
    Write-Step "No encontre Edge/Chrome. Abriendo navegador predeterminado..."
    Start-Process $url
    Read-Host "Cuando termines de usar la agenda, presiona Enter para cerrar el motor local"
  }
} catch {
  Write-Host ""
  Write-Host "No pude iniciar la agenda: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Presiona Enter para cerrar"
  exit 1
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Write-Step "Cerrando motor local..."
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
