#!/bin/bash
# CendovaPlan — lokaler Test-Launcher (macOS). Pendant zu start-local.ps1.
# Doppelklick (oder Aufruf durch die Desktop-Verknüpfung des Installers):
# holt den aktuellen Stand, installiert Abhängigkeiten, startet den
# Dev-Server und ÖFFNET DEN BROWSER (http://localhost:5173).
set -u
cd "$(dirname "$0")/.." || exit 1

# Vom Installer ggf. lokal abgelegtes Node (ohne Admin-Rechte) in den PATH.
if [ -x ".node/current/bin/node" ]; then
  export PATH="$PWD/.node/current/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "FEHLER: Node.js nicht gefunden. Bitte installer/install-mac.command (erneut) ausführen."
  read -r -p "Enter zum Schließen "
  exit 1
fi

echo "== CendovaPlan lokaler Teststart =="

# Läuft bereits eine CendovaPlan-Instanz? Dann NUR den Browser öffnen.
# (Ein zweiter Server landete früher still auf Port 5174 — andere Browser-
# Herkunft mit leerem Speicher; Paket/Profil schienen „verschwunden".
# Port ist jetzt fest [strictPort]; fremde Belegung → klare Meldung.)
PROBE="$(curl -fsS --max-time 3 http://localhost:5173/ 2>/dev/null || true)"
if printf '%s' "$PROBE" | grep -q 'CendovaPlan'; then
  echo "CendovaPlan läuft bereits — öffne nur den Browser (kein zweiter Server)."
  open "http://localhost:5173/"
  exit 0
elif [ -n "$PROBE" ]; then
  echo "FEHLER: Port 5173 ist durch eine ANDERE Anwendung belegt."
  echo "CendovaPlan braucht genau diesen Port (Browser-Speicher hängt daran)."
  read -r -p "Enter zum Schließen "
  exit 1
fi

# Aktuellen Stand holen — nur wenn der Branch einen Upstream hat.
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  echo "Hole aktuellen Stand ..."
  if git fetch origin; then
    if ! git merge --ff-only '@{u}'; then
      # Upstream divergiert (z. B. nach der History-Bereinigung in Stufe C2):
      # ohne lokale Aenderungen einfach auf den Server-Stand zuruecksetzen.
      if [ -z "$(git status --porcelain)" ]; then
        echo "Upstream divergiert — setze auf Server-Stand zurueck (git reset --hard) ..."
        git reset --hard '@{u}' || echo "WARNUNG: Reset fehlgeschlagen — starte mit vorhandenem Stand."
      else
        echo "WARNUNG: Lokale Aenderungen vorhanden — Update uebersprungen."
      fi
    fi
  else
    echo "WARNUNG: git fetch fehlgeschlagen (offline?) — starte mit vorhandenem Stand."
  fi
else
  echo "Kein Upstream gesetzt — überspringe git pull."
fi

echo "npm install ..."
if ! npm install; then
  echo "npm install fehlgeschlagen — Abbruch."
  read -r -p "Enter zum Schließen "
  exit 1
fi

echo "Starte Dev-Server und öffne Browser (Ctrl+C beendet) ..."
npm run dev -- --open
