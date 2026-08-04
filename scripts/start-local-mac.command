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

# ---------------------------------------------------------------------------
# Aktuellen Stand holen.
#
# WICHTIG — die Falle, die das hier verhindert: Früher wurde ohne `--prune`
# geholt und stumpf gegen `@{u}` gemergt. Wurde der eingestellte Branch auf
# dem Server GELÖSCHT (z. B. ein Test-Branch nach dem Merge), blieb die
# veraltete Fernreferenz lokal bestehen, der Merge meldete „bereits aktuell"
# — und die Installation blieb für immer auf dem alten Stand stehen, ohne
# jede Fehlermeldung. Genau so verpasste eine Installation das komplette
# Schultermodul.
#
# Jetzt: mit --prune holen, verschwundenen Upstream erkennen und in dem Fall
# auf main zurückfallen. Am Ende wird IMMER ausgegeben, welcher Stand nun
# läuft — sonst ist „welche Version habe ich eigentlich?" nicht beantwortbar.
# ---------------------------------------------------------------------------
HAUPT_BRANCH=main
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Hole aktuellen Stand (Branch: $BRANCH) ..."
  # --prune räumt Fernreferenzen gelöschter Branches weg.
  if git fetch --prune origin; then
    # Gibt es den eigenen Branch auf dem Server überhaupt noch?
    if ! git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null; then
      echo
      echo "HINWEIS: Der Branch „$BRANCH\" existiert auf dem Server nicht mehr"
      echo "         (üblicherweise nach dem Zusammenführen gelöscht)."
      echo "         Wechsle auf „$HAUPT_BRANCH\" — sonst bliebe diese"
      echo "         Installation dauerhaft auf einem alten Stand stehen."
      echo
      if [ -n "$(git status --porcelain)" ]; then
        echo "WARNUNG: Lokale Änderungen vorhanden — Wechsel übersprungen."
        echo "         Betroffen:"
        git status --short | head -5
      elif git checkout "$HAUPT_BRANCH" 2>/dev/null || git checkout -b "$HAUPT_BRANCH" "origin/$HAUPT_BRANCH" 2>/dev/null; then
        git reset --hard "origin/$HAUPT_BRANCH" >/dev/null 2>&1
        BRANCH="$HAUPT_BRANCH"
        echo "  → jetzt auf $HAUPT_BRANCH."
      else
        echo "WARNUNG: Wechsel auf $HAUPT_BRANCH fehlgeschlagen — starte mit vorhandenem Stand."
      fi
    elif ! git merge --ff-only "origin/$BRANCH" >/dev/null 2>&1; then
      # Divergiert (z. B. nach einer History-Bereinigung): ohne lokale
      # Änderungen einfach auf den Server-Stand zurücksetzen.
      if [ -z "$(git status --porcelain)" ]; then
        echo "Stand divergiert — setze auf Server-Stand zurück ..."
        git reset --hard "origin/$BRANCH" >/dev/null 2>&1 \
          || echo "WARNUNG: Zurücksetzen fehlgeschlagen — starte mit vorhandenem Stand."
      else
        echo "WARNUNG: Lokale Änderungen vorhanden — Update übersprungen."
        echo "         Betroffen:"
        git status --short | head -5
      fi
    fi
  else
    echo "WARNUNG: git fetch fehlgeschlagen (offline?) — starte mit vorhandenem Stand."
  fi
else
  echo "Kein Server hinterlegt — überspringe Update."
fi

# Welcher Stand läuft jetzt wirklich? Bewusst IMMER ausgeben.
echo
echo "  Stand: $(git rev-parse --abbrev-ref HEAD 2>/dev/null) · $(git log -1 --format='%h vom %ad' --date=format:'%d.%m.%Y %H:%M' 2>/dev/null)"
if [ -f "src/lib/shoulder/shoulderCatalog.ts" ]; then
  echo "  Module: Hüfte · Knie · Schulter"
else
  echo "  Module: Hüfte · Knie   (Schultermodul NICHT enthalten — Stand ist alt)"
fi
echo

echo "npm install ..."
if ! npm install; then
  echo "npm install fehlgeschlagen — Abbruch."
  read -r -p "Enter zum Schließen "
  exit 1
fi

# ---------------------------------------------------------------------------
# Browser: Chrome bevorzugen.
#
# CendovaPlan rendert über WebGL und dekodiert komprimierte DICOMs über
# WASM-Codecs in Web-Workern. Safari — auf dem Mac der Standardbrowser —
# ist dabei erfahrungsgemäß die anfälligste Engine (schwarzes Bild oder
# „Codec nicht unterstützt", obwohl dieselbe Datei anderswo lädt). Darum
# wird Chrome genommen, wenn es installiert ist.
# ---------------------------------------------------------------------------
URL="http://localhost:5173/"
BROWSER_APP=""
for kandidat in "Google Chrome" "Microsoft Edge" "Firefox"; do
  if [ -d "/Applications/$kandidat.app" ] || [ -d "$HOME/Applications/$kandidat.app" ]; then
    BROWSER_APP="$kandidat"
    break
  fi
done

if [ -n "$BROWSER_APP" ]; then
  echo "Starte Dev-Server, öffne $BROWSER_APP (Ctrl+C beendet) ..."
  ( until curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; do sleep 0.5; done
    open -a "$BROWSER_APP" "$URL" ) &
  npm run dev
else
  echo "Starte Dev-Server und öffne den Standardbrowser (Ctrl+C beendet) ..."
  echo "HINWEIS: Chrome nicht gefunden. Falls Bilder schwarz bleiben oder eine"
  echo "         Codec-Meldung erscheint, bitte Chrome installieren und die"
  echo "         Adresse $URL dort öffnen."
  npm run dev -- --open
fi
