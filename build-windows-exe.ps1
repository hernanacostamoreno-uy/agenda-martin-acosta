$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$iexpress = Join-Path $env:SystemRoot "System32\iexpress.exe"

if (!(Test-Path $iexpress)) {
  throw "No se encontro IExpress en Windows para crear los ejecutables."
}

function New-CleanDirectory {
  param([string]$Path)

  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Write-TextFile {
  param(
    [string]$Path,
    [string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.Encoding]::ASCII)
}

function Invoke-IExpress {
  param([string]$SedPath)

  & $iexpress /N $SedPath | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "IExpress no pudo generar el ejecutable definido en $SedPath"
  }
}

$buildDir = Join-Path $root "build"
$launcherSourceDir = Join-Path $buildDir "launcher"
$payloadDir = Join-Path $buildDir "payload"
$setupSourceDir = Join-Path $buildDir "setup"

New-CleanDirectory $buildDir
New-Item -ItemType Directory -Force -Path $launcherSourceDir, $payloadDir, $setupSourceDir | Out-Null

$launcherBat = Join-Path $launcherSourceDir "launch-installed.bat"
Write-TextFile $launcherBat @"
@echo off
setlocal
set "AGENDA_APP=%LOCALAPPDATA%\Programs\AgendaMartinAcosta\Agenda-Martin-Acosta.bat"
if exist "%AGENDA_APP%" (
  call "%AGENDA_APP%"
  exit /b %ERRORLEVEL%
)
echo No se encontro la instalacion de Agenda Martin Acosta.
echo Vuelva a ejecutar Agenda-Martin-Acosta-Setup.exe.
pause
exit /b 1
"@

$launcherSed = Join-Path $buildDir "launcher.sed"
Write-TextFile $launcherSed @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$root\Agenda-Martin-Acosta.exe
FriendlyName=Agenda Martin Acosta
AppLaunched=cmd.exe /c launch-installed.bat
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="launch-installed.bat"
[SourceFiles]
SourceFiles0=$launcherSourceDir\
[SourceFiles0]
%FILE0%=
"@

Invoke-IExpress $launcherSed

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
  "Instalar-Agenda-Martin-Acosta.bat",
  "Instalar-Agenda-Martin-Acosta.ps1",
  "Desinstalar-Agenda-Martin-Acosta.bat",
  "Desinstalar-Agenda-Martin-Acosta.ps1",
  "instalar-acceso-directo.bat",
  "iniciar-agenda.bat"
)

foreach ($item in $items) {
  $from = Join-Path $root $item
  if (Test-Path $from) {
    Copy-Item -LiteralPath $from -Destination (Join-Path $payloadDir $item) -Recurse -Force
  }
}

$payloadZip = Join-Path $root "Agenda-Martin-Acosta-Payload.zip"
if (Test-Path $payloadZip) {
  Remove-Item -LiteralPath $payloadZip -Force
}
Compress-Archive -Path (Join-Path $payloadDir "*") -DestinationPath $payloadZip -Force

Copy-Item -LiteralPath (Join-Path $root "setup-bootstrap.bat") -Destination (Join-Path $setupSourceDir "setup-bootstrap.bat") -Force
Copy-Item -LiteralPath $payloadZip -Destination (Join-Path $setupSourceDir "Agenda-Martin-Acosta-Payload.zip") -Force

$setupSed = Join-Path $buildDir "setup.sed"
Write-TextFile $setupSed @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$root\Agenda-Martin-Acosta-Setup.exe
FriendlyName=Agenda Martin Acosta Setup
AppLaunched=cmd.exe /c setup-bootstrap.bat
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
FILE0="setup-bootstrap.bat"
FILE1="Agenda-Martin-Acosta-Payload.zip"
[SourceFiles]
SourceFiles0=$setupSourceDir\
[SourceFiles0]
%FILE0%=
%FILE1%=
"@

Invoke-IExpress $setupSed

Compress-Archive -Path (Join-Path $payloadDir "*") -DestinationPath (Join-Path $root "Agenda-Martin-Acosta-Instalable.zip") -Force

Get-Item -LiteralPath (Join-Path $root "Agenda-Martin-Acosta.exe"), (Join-Path $root "Agenda-Martin-Acosta-Setup.exe"), (Join-Path $root "Agenda-Martin-Acosta-Instalable.zip") |
  Select-Object Name, Length, LastWriteTime
