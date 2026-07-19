# Lokaler Launcher (Windows / PowerShell) — CendovaPlan
#
# Ein Schritt zum nahtlosen Testen: holt den aktuellen Branch-Stand,
# installiert Abhängigkeiten, startet den Dev-Server und ÖFFNET DEN BROWSER.
#
# Nutzung:
#   - Doppelklick auf scripts\start-local.cmd   (empfohlen), oder
#   - Rechtsklick auf diese Datei -> "Mit PowerShell ausführen", oder
#   - pwsh -File scripts\start-local.ps1
#
# Kein $ErrorActionPreference='Stop' (würde native git/npm-Aufrufe stören);
# Fehler werden über $LASTEXITCODE geprüft.

Set-Location (Join-Path $PSScriptRoot '..')

# Vom Installer ggf. lokal abgelegte Node.js-Kopie (ohne Admin) nutzen -
# gleiches Muster wie start-local-mac.command (.node/current).
$localNode = Join-Path (Get-Location) '.node\current'
if (Test-Path (Join-Path $localNode 'node.exe')) {
  $env:PATH = "$localNode;$env:PATH"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FEHLER: Node.js nicht gefunden. Bitte Installieren.cmd (erneut) ausfuehren.' -ForegroundColor Red
  Read-Host 'Enter zum Schliessen'
  exit 1
}

Write-Host '== CendovaPlan lokaler Start ==' -ForegroundColor Cyan

# Läuft bereits eine CendovaPlan-Instanz? Dann NUR den Browser öffnen.
# Wichtig: Ein zweiter Server landete früher still auf Port 5174 — für den
# Browser eine ANDERE Herkunft mit leerem Speicher; importiertes Paket/
# Profil schienen dann „verschwunden" (klinischer Befund). Der Port ist
# jetzt fest (strictPort); belegt eine FREMDE Anwendung 5173, brechen wir
# mit klarer Meldung ab statt auszuweichen.
try {
  $probe = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/' -TimeoutSec 3
  if ($probe.Content -match 'CendovaPlan') {
    Write-Host 'CendovaPlan laeuft bereits - oeffne nur den Browser (kein zweiter Server).' -ForegroundColor Green
    Start-Process 'http://localhost:5173/'
    exit 0
  } else {
    Write-Host 'FEHLER: Port 5173 ist durch eine ANDERE Anwendung belegt.' -ForegroundColor Red
    Write-Host 'CendovaPlan braucht genau diesen Port (Browser-Speicher haengt daran).' -ForegroundColor Red
    Write-Host 'Bitte die andere Anwendung beenden und erneut starten.' -ForegroundColor Red
    Read-Host 'Enter zum Schliessen'
    exit 1
  }
} catch {
  # Port frei - normaler Start.
}

# Einmalige Migration: liegt irgendwo noch eine veraltete Verknuepfung
# ("CendovaPlan starten" auf Benutzer-, OneDrive- oder oeffentlichem
# Desktop — in Kliniken oft umgeleitet), ersetzt create-desktop-shortcut
# sie durch "CendovaPlan" — ohne weiteres Zutun beim Start.
$legacyDesktops = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('DesktopDirectory'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Desktop' }),
  $(if ($env:OneDriveCommercial) { Join-Path $env:OneDriveCommercial 'Desktop' }),
  [Environment]::GetFolderPath('CommonDesktopDirectory')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$legacyFound = $legacyDesktops |
  ForEach-Object {
    Get-ChildItem -Path $_ -Filter 'CendovaPlan starten.lnk' -ErrorAction SilentlyContinue
  } |
  Select-Object -First 1
if ($legacyFound) {
  Write-Host 'Benenne Desktop-Verknuepfung um (-> "CendovaPlan") ...' -ForegroundColor DarkGray
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'create-desktop-shortcut.ps1')
}

# Icon-Nachruestung: bestehende "CendovaPlan"-Verknuepfung einmalig
# auf das Marken-Icon umstellen (aeltere Staende erzeugten sie ohne Icon).
$curLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'CendovaPlan.lnk'
$brandIcon = Join-Path $PSScriptRoot '..\public\favicon.ico'
if ((Test-Path $curLink) -and (Test-Path $brandIcon)) {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($curLink)
  if ($lnk.IconLocation -notlike '*favicon.ico*') {
    Write-Host 'Aktualisiere Verknuepfungs-Icon (Cendova-Design) ...' -ForegroundColor DarkGray
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'create-desktop-shortcut.ps1')
  }
}

# Aktuellen Stand holen — nur wenn der Branch einen Upstream hat.
git rev-parse --abbrev-ref '@{u}' *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host 'Hole aktuellen Stand ...' -ForegroundColor DarkGray
  git fetch origin
  if ($LASTEXITCODE -eq 0) {
    git merge --ff-only '@{u}'
    if ($LASTEXITCODE -ne 0) {
      # Upstream divergiert (z. B. nach der History-Bereinigung in Stufe C2):
      # ohne lokale Aenderungen auf den Server-Stand zuruecksetzen.
      $dirty = git status --porcelain
      if (-not $dirty) {
        Write-Host 'Upstream divergiert - setze auf Server-Stand zurueck (git reset --hard) ...' -ForegroundColor Yellow
        git reset --hard '@{u}'
      } else {
        Write-Host 'WARNUNG: Lokale Aenderungen vorhanden - Update uebersprungen.' -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host 'WARNUNG: git fetch fehlgeschlagen (offline?) - starte mit vorhandenem Stand.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Kein Upstream gesetzt - ueberspringe git pull.' -ForegroundColor Yellow
}

Write-Host 'npm install ...' -ForegroundColor DarkGray
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host 'npm install fehlgeschlagen - Abbruch.' -ForegroundColor Red
  exit 1
}

Write-Host 'Starte Dev-Server und oeffne Browser (Strg+C beendet) ...' -ForegroundColor Green
npm run dev -- --open
