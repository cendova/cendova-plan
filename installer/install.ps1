# CendovaPlan - USB-Installer (Windows / PowerShell)
#
# WICHTIG: Diese Datei bewusst NUR in ASCII halten (keine Umlaute/typografischen
# Zeichen). Windows PowerShell 5.1 liest .ps1-Dateien ohne BOM als ANSI-Codepage
# - Sonderzeichen wuerden sonst den Parser zerschiessen.
#
# Vollstaendige Einrichtung auf einem Klinik-PC in einem Schritt - gemeinsam mit
# der IT ausfuehrbar (die IT installiert ggf. Node.js/Git und gibt den Netz-
# zugriff auf GitHub + npm frei). Das Skript:
#   1. prueft Git (installiert es bei Bedarf via winget),
#   2. holt CendovaPlan nach %USERPROFILE%\CendovaPlan bzw. AKTUALISIERT eine
#      bestehende Installation (Update-Funktion),
#   3. stellt Node.js sicher: System-Node -> winget -> LOKALE Kopie im
#      Programmordner (.node\current; kein Admin/winget noetig),
#   4. installiert die Programmbibliotheken (npm install),
#   5. legt eine 1-Klick-Desktop-Verknuepfung an (die beim Start jeweils
#      automatisch die neueste Version holt).
#
# Idempotent: erneutes Ausfuehren aktualisiert nur (holt neueste Version + npm).
#
# Aufruf (am einfachsten): Installieren.cmd doppelklicken. Oder:
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Branch main] [-RepoUrl ...]
#
# Datenschutz: CendovaPlan laeuft danach rein LOKAL im Browser; es werden keine
# Patientendaten uebertragen. Die einzige Netzverbindung dient dem Laden/
# Aktualisieren des Programmcodes (GitHub) und der Bibliotheken (npm).

param(
  [string]$RepoUrl = 'https://github.com/cendova/cendova-plan.git',
  [string]$Branch = 'main',
  [string]$InstallDir = (Join-Path $env:USERPROFILE 'CendovaPlan'),
  # Fuer die lokale Kopie ohne Admin/winget; gleiche Version wie am Mac.
  [string]$NodeVersion = 'v22.22.2'
)

function Info($m) { Write-Host $m -ForegroundColor Cyan }
function Step($m) { Write-Host $m -ForegroundColor DarkGray }
function Ok($m)   { Write-Host $m -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }
function Die($m)  { Write-Host ''; Write-Host "FEHLER: $m" -ForegroundColor Red; Read-Host 'Enter zum Schliessen'; exit 1 }

function Have($cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

# PATH neu aus Maschine+Benutzer lesen - noetig, damit frisch (per winget)
# installierte Tools in DIESER Sitzung gefunden werden.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:PATH = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

# Stellt ein Tool sicher: vorhanden? -> ok. Sonst via winget installieren.
function Ensure-Tool($cmd, $wingetId, $name) {
  if (Have $cmd) { Ok "  $name gefunden."; return }
  Warn "  $name fehlt."
  if (-not (Have 'winget')) {
    Die "$name fehlt und 'winget' ist nicht verfuegbar. Bitte $name manuell installieren (IT) und Installer erneut starten. Downloads: Node.js https://nodejs.org  -  Git https://git-scm.com"
  }
  Step "  Installiere $name via winget (ggf. IT-/UAC-Freigabe noetig) ..."
  winget install --id $wingetId -e --source winget --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Have $cmd)) {
    Die "$name wurde installiert, ist aber noch nicht im PATH dieser Sitzung. Bitte das Fenster schliessen und 'Installieren.cmd' ein zweites Mal starten (dann wird die Installation abgeschlossen)."
  }
  Ok "  $name installiert."
}

# Native Befehle: Exit-Code pruefen (PowerShell wirft bei git/npm nicht selbst).
function Invoke-Checked($exe, [string[]]$argv, $errMsg) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { Die "$errMsg (Exit-Code $LASTEXITCODE)" }
}

Write-Host ''
Info '====================================================='
Info '  CendovaPlan - Installation / Update'
Info '====================================================='
Write-Host "  Quelle : $RepoUrl"
Write-Host "  Branch : $Branch"
Write-Host "  Ziel   : $InstallDir"
Write-Host ''

# 1) Voraussetzung Git. Node.js folgt NACH dem Holen (Schritt 3) - fehlt
#    es und winget ist gesperrt, legt der Installer eine LOKALE Kopie in
#    den Programmordner (kein Admin noetig, gleiches Muster wie am Mac).
Info '[1/5] Voraussetzung pruefen (Git) ...'
Ensure-Tool 'git' 'Git.Git' 'Git'

# 2) Holen oder aktualisieren
Write-Host ''
if (Test-Path (Join-Path $InstallDir '.git')) {
  Info "[2/5] Vorhandene Installation gefunden - aktualisiere auf neueste Version ..."
  Push-Location $InstallDir
  try {
    Invoke-Checked 'git' @('fetch', 'origin', $Branch) 'git fetch fehlgeschlagen.'
    Invoke-Checked 'git' @('checkout', $Branch)        'git checkout fehlgeschlagen.'
    & git merge --ff-only "origin/$Branch"
    if ($LASTEXITCODE -ne 0) {
      # Upstream divergiert (z. B. nach der History-Bereinigung, Stufe C2):
      # ohne lokale Aenderungen auf den Server-Stand zuruecksetzen.
      $dirty = git status --porcelain
      if (-not $dirty) {
        Warn '  Upstream divergiert - setze auf Server-Stand zurueck ...'
        Invoke-Checked 'git' @('reset', '--hard', "origin/$Branch") 'git reset fehlgeschlagen.'
      } else {
        Die 'Lokale Aenderungen im Installationsordner - bitte mit der IT pruefen.'
      }
    }
  } finally { Pop-Location }
} else {
  Info "[2/5] Hole CendovaPlan nach $InstallDir ..."
  Invoke-Checked 'git' @('clone', '--branch', $Branch, $RepoUrl, $InstallDir) 'git clone fehlgeschlagen. Hat der PC Lese-Zugriff aufs Repository (Deploy-Key/Token) und Internet (GitHub)?'
}

# 3) Node.js sicherstellen - Reihenfolge: System-Node -> winget ->
#    LOKALE Kopie im Programmordner (.node\current, kein Admin noetig).
Write-Host ''
Info '[3/5] Node.js sicherstellen ...'
$localNodeDir = Join-Path $InstallDir '.node\current'
if (Test-Path (Join-Path $localNodeDir 'node.exe')) {
  $env:PATH = "$localNodeDir;$env:PATH"
}
if (Have 'node') {
  Ok '  Node.js gefunden.'
} else {
  Warn '  Node.js fehlt.'
  $nodeOk = $false
  if (Have 'winget') {
    Step '  Versuche Installation via winget (ggf. UAC-Freigabe) ...'
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    Refresh-Path
    if (Have 'node') { $nodeOk = $true; Ok '  Node.js installiert (winget).' }
  }
  if (-not $nodeOk) {
    Step "  Lade lokale Node.js-Kopie $NodeVersion (kein Admin noetig) ..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zipUrl  = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
    $zipPath = Join-Path $env:TEMP "cendova-node.zip"
    $oldPref = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    } catch {
      Die "Node.js-Download fehlgeschlagen ($zipUrl). Internetzugang/Firewall pruefen (nodejs.org freigeben, IT) - oder Node.js manuell installieren: https://nodejs.org"
    } finally {
      $ProgressPreference = $oldPref
    }
    $nodeRoot = Join-Path $InstallDir '.node'
    if (Test-Path $localNodeDir) { Remove-Item $localNodeDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $nodeRoot | Out-Null
    Step '  Entpacke ...'
    Expand-Archive -Path $zipPath -DestinationPath $nodeRoot -Force
    Move-Item (Join-Path $nodeRoot "node-$NodeVersion-win-x64") $localNodeDir
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    $env:PATH = "$localNodeDir;$env:PATH"
    if (-not (Have 'node')) { Die 'Lokale Node.js-Kopie konnte nicht eingerichtet werden.' }
    Ok "  Node.js $NodeVersion als lokale Kopie eingerichtet ($localNodeDir)."
  }
}
if (-not (Have 'npm')) { Die 'npm nicht gefunden (sollte mit Node.js kommen).' }

# 4) Abhaengigkeiten
Write-Host ''
Info '[4/5] Programmbibliotheken installieren (npm install) ...'
Push-Location $InstallDir
try {
  Invoke-Checked 'npm' @('install') 'npm install fehlgeschlagen. Hat der PC Zugriff auf registry.npmjs.org?'
} finally { Pop-Location }

# 4) Desktop-Verknuepfung (1-Klick-Start + Auto-Update)
Write-Host ''
Info '[5/5] Desktop-Verknuepfung anlegen ...'
$shortcut = Join-Path $InstallDir 'scripts\create-desktop-shortcut.ps1'
if (Test-Path $shortcut) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $shortcut
} else {
  Warn '  create-desktop-shortcut.ps1 nicht gefunden - Verknuepfung uebersprungen.'
}

Write-Host ''
Ok '====================================================='
Ok '  Fertig - CendovaPlan ist eingerichtet.'
Ok '====================================================='
Write-Host "  Installiert in : $InstallDir"
Write-Host '  Starten        : Desktop-Verknuepfung "CendovaPlan" doppelklicken.'
Write-Host '  Update         : passiert beim Start automatisch (git pull).'
Write-Host ''
Write-Host '  Schablonen     : einmalig in der App importieren (Paket-Symbol in der'
Write-Host '                   Kopfzeile). Die Datei cendova-schablonen-*.zip kommt'
Write-Host '                   per USB-Stick und ist bewusst NICHT im Repository.'
Write-Host ''
Write-Host '  Hinweis: CendovaPlan laeuft rein lokal im Browser (localhost) -'
Write-Host '           es verlassen KEINE Patientendaten den Rechner.'
Write-Host ''
Read-Host 'Enter zum Schliessen'
