# Legt eine Desktop-Verknuepfung zum lokalen Launcher (start-local.cmd) an.
# Einmal ausfuehren: Doppelklick auf scripts\create-desktop-shortcut.cmd
#   oder: pwsh -File scripts\create-desktop-shortcut.ps1
#
# Ersetzt dabei aeltere Verknuepfungen (z. B.
# "CendovaPlan starten") durch den finalen Namen "CendovaPlan".

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target   = Join-Path $repoRoot 'scripts\start-local.cmd'
$desktop  = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'CendovaPlan.lnk'

if (-not (Test-Path $target)) {
  Write-Host "Launcher nicht gefunden: $target" -ForegroundColor Red
  exit 1
}

# Veraltete Verknuepfungen (fruehere Namen) entfernen - auf ALLEN ueblichen
# Desktop-Orten. In Kliniken ist der Desktop oft auf OneDrive umgeleitet,
# oder die Verknuepfung liegt auf dem OEFFENTLICHEN Desktop (fuer alle
# Benutzer) - dort braucht Loeschen Admin-Rechte; dann geben wir den
# exakten Pfad + Kommando fuer die IT aus, statt still zu scheitern.
$desktops = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('DesktopDirectory'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  $(if ($env:OneDrive) { Join-Path $env:OneDrive 'Desktop' }),
  $(if ($env:OneDriveCommercial) { Join-Path $env:OneDriveCommercial 'Desktop' }),
  [Environment]::GetFolderPath('CommonDesktopDirectory')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
foreach ($d in $desktops) {
  $legacyLinks = @(Get-ChildItem -Path $d -Filter 'CendovaPlan starten.lnk' -ErrorAction SilentlyContinue)
  $legacyLinks | ForEach-Object {
    try {
      Remove-Item $_.FullName -Force -ErrorAction Stop
      Write-Host "Alte Verknuepfung entfernt: $($_.FullName)" -ForegroundColor DarkGray
    } catch {
      Write-Host 'Alte Verknuepfung konnte NICHT entfernt werden (Admin-Rechte noetig?):' -ForegroundColor Yellow
      Write-Host "  $($_.FullName)" -ForegroundColor Yellow
      Write-Host '  Loesung: Rechtsklick -> Loeschen mit Admin-Freigabe (IT), oder als Admin:' -ForegroundColor Yellow
      Write-Host "  Remove-Item '$($_.FullName)' -Force" -ForegroundColor Yellow
    }
  }
}

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath       = $target
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle      = 1
$shortcut.Description      = 'CendovaPlan lokal starten (Dev-Server + Browser)'
# Marken-Icon aus dem Repo (Cendova-Design-System). Faellt bei aelteren
# Staenden ohne die Datei stumm auf das Standard-Icon zurueck.
$icon = Join-Path $repoRoot 'public\favicon.ico'
if (Test-Path $icon) { $shortcut.IconLocation = "$icon,0" }
$shortcut.Save()

Write-Host "Verknuepfung erstellt: $linkPath" -ForegroundColor Green
