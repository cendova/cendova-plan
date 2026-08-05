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

# ---------------------------------------------------------------------------
# Aktuellen Stand holen.
#
# WICHTIG - die Falle, die das hier verhindert: Frueher wurde ohne --prune
# geholt und stumpf gegen @{u} gemergt. Wurde der eingestellte Branch auf dem
# Server GELOESCHT (z. B. ein Test-Branch nach dem Merge), blieb die veraltete
# Fernreferenz lokal bestehen, der Merge meldete "bereits aktuell" - und die
# Installation blieb fuer immer auf dem alten Stand stehen, ohne jede
# Fehlermeldung. Genau so verpasste eine Installation das Schultermodul.
#
# Jetzt: mit --prune holen, verschwundenen Upstream erkennen, auf main
# zurueckfallen - und am Ende IMMER ausgeben, welcher Stand nun laeuft.
# ---------------------------------------------------------------------------
# Anwender-Installationen folgen dem FREIGABE-Branch "stable", nicht main:
# main erreicht Anwender erst nach Test auf einem echten Mac und Freigabe
# per `git push origin main:stable` (Cornerstone-5-Lektion 08/2026 — die
# Regression war weder in Tests noch in der CI sichtbar). Tester bleiben
# per .cendova-branch-pin bewusst auf main.
$hauptBranch = 'stable'
$branch = (git rev-parse --abbrev-ref HEAD 2>$null)

# ERZEUGTE Dateien zuruecksetzen, bevor irgendetwas mit git passiert.
# `npm install` schreibt die package-lock.json plattformabhaengig um; damit
# gilt das Verzeichnis nach JEDEM Start als geaendert und jede Update-Logik,
# die bei lokalen Aenderungen abbricht, blockiert dauerhaft. Genau daran
# scheiterte der Branch-Wechsel auf einem Anwender-Mac. Die Datei ist
# maschinell erzeugt - sie zu verwerfen ist gefahrlos.
if (git status --porcelain -- package-lock.json) {
  Write-Host 'Setze erzeugte package-lock.json zurueck (wird von npm neu geschrieben) ...' -ForegroundColor DarkGray
  git checkout -- package-lock.json *> $null
}

# Auf einem NEBENBRANCH gelandet? Dann zurueck auf stable. Der Installer fragt
# beim Einrichten nach einem Branch; ein dort eingetragener Test-Branch wird
# sonst dauerhaft brav aktualisiert, bekommt aber nie wieder etwas Neues -
# eine Installation hing so wochenlang fest, waehrend git "Already up to
# date" meldete. Wer bewusst auf einem Branch bleiben will, legt die Datei
# .cendova-branch-pin an.
if ($branch -ne $hauptBranch -and -not (Test-Path '.cendova-branch-pin')) {
  Write-Host ''
  Write-Host "HINWEIS: Diese Installation steht auf dem Branch `"$branch`", nicht" -ForegroundColor Yellow
  Write-Host "         auf `"$hauptBranch`" - dort kommen keine Aktualisierungen an." -ForegroundColor Yellow
  $dirty = git status --porcelain
  if ($dirty) {
    Write-Host 'WARNUNG: Lokale Aenderungen vorhanden - Wechsel uebersprungen.' -ForegroundColor Yellow
    git status --short | Select-Object -First 5
  } else {
    Write-Host "         Wechsle auf $hauptBranch ..." -ForegroundColor Yellow
    git fetch --prune origin *> $null
    git checkout -B $hauptBranch "origin/$hauptBranch" *> $null
    if ($LASTEXITCODE -eq 0) {
      $branch = $hauptBranch
      Write-Host "  -> jetzt auf $hauptBranch." -ForegroundColor Green
    } else {
      Write-Host 'WARNUNG: Wechsel fehlgeschlagen - starte mit vorhandenem Stand.' -ForegroundColor Yellow
    }
  }
  Write-Host ''
}

git remote get-url origin *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Hole aktuellen Stand (Branch: $branch) ..." -ForegroundColor DarkGray
  git fetch --prune origin
  if ($LASTEXITCODE -eq 0) {
    git rev-parse --verify --quiet "origin/$branch" *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Host ''
      Write-Host "HINWEIS: Der Branch `"$branch`" existiert auf dem Server nicht mehr" -ForegroundColor Yellow
      Write-Host "         (ueblicherweise nach dem Zusammenfuehren geloescht)." -ForegroundColor Yellow
      Write-Host "         Wechsle auf `"$hauptBranch`" - sonst bliebe diese" -ForegroundColor Yellow
      Write-Host "         Installation dauerhaft auf einem alten Stand stehen." -ForegroundColor Yellow
      Write-Host ''
      $dirty = git status --porcelain
      if ($dirty) {
        Write-Host 'WARNUNG: Lokale Aenderungen vorhanden - Wechsel uebersprungen.' -ForegroundColor Yellow
        git status --short | Select-Object -First 5
      } else {
        git checkout $hauptBranch *> $null
        if ($LASTEXITCODE -ne 0) { git checkout -b $hauptBranch "origin/$hauptBranch" *> $null }
        git reset --hard "origin/$hauptBranch" *> $null
        $branch = $hauptBranch
        Write-Host "  -> jetzt auf $hauptBranch." -ForegroundColor Green
      }
    } else {
      git merge --ff-only "origin/$branch" *> $null
      if ($LASTEXITCODE -ne 0) {
        $dirty = git status --porcelain
        if (-not $dirty) {
          Write-Host 'Stand divergiert - setze auf Server-Stand zurueck ...' -ForegroundColor Yellow
          git reset --hard "origin/$branch" *> $null
        } else {
          Write-Host 'WARNUNG: Lokale Aenderungen vorhanden - Update uebersprungen.' -ForegroundColor Yellow
          git status --short | Select-Object -First 5
        }
      }
    }
  } else {
    Write-Host 'WARNUNG: git fetch fehlgeschlagen (offline?) - starte mit vorhandenem Stand.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Kein Server hinterlegt - ueberspringe Update.' -ForegroundColor Yellow
}

# Welcher Stand laeuft jetzt wirklich? Bewusst IMMER ausgeben.
$stand = git log -1 --format='%h vom %ad' --date=format:'%d.%m.%Y %H:%M' 2>$null
Write-Host ''
Write-Host "  Stand: $(git rev-parse --abbrev-ref HEAD 2>$null) - $stand" -ForegroundColor Cyan
if (Test-Path 'src/lib/shoulder/shoulderCatalog.ts') {
  Write-Host '  Module: Huefte - Knie - Schulter' -ForegroundColor Cyan
} else {
  Write-Host '  Module: Huefte - Knie   (Schultermodul NICHT enthalten - Stand ist alt)' -ForegroundColor Yellow
}
Write-Host ''

Write-Host 'npm install ...' -ForegroundColor DarkGray
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host 'npm install fehlgeschlagen - Abbruch.' -ForegroundColor Red
  exit 1
}

# dist/ mitziehen: CendovaView liefert genau diesen Ordner unter /plan aus.
# Frueher startete dieser Launcher nur den Dev-Server - wer "nur CendovaPlan"
# startete, hatte danach zwar eine aktuelle 5173-Seite, aber der Planen-Knopf
# in CendovaView lief weiter auf einem alten Build (Realtest 05.08.: die
# Meldung "Build ist aelter und kennt kein zweites Bildfenster"). Gebaut wird
# nur, wenn noetig - die Pruefung steckt in scripts/plan-dist.mjs.
node scripts/plan-dist.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Hinweis: dist/ konnte nicht aktualisiert werden - der Dev-Server (5173) ist trotzdem aktuell.' -ForegroundColor Yellow
}

Write-Host 'Starte Dev-Server und oeffne Browser (Strg+C beendet) ...' -ForegroundColor Green
npm run dev -- --open
