#!/bin/bash
# SessionStart-Hook für Claude Code on the web.
# Installiert die npm-Abhängigkeiten, damit Typecheck/Build (und optional der
# Screenshot-Smoke-Test) in der Cloud-Session sofort laufen.
#
# ASYNC: Die Session startet SOFORT; npm install läuft im Hintergrund weiter
# (schneller Sessionstart). Trade-off: unmittelbar nach Start ist node_modules
# evtl. noch nicht fertig — vor cloud-seitigen npm-Befehlen ggf. kurz warten.
#
# Hinweis: Läuft NUR im Container. Den lokalen Browser-Test des Nutzers kann ein
# Hook nicht starten — dafür gibt es scripts/start-local.{ps1,cmd}.
set -euo pipefail

# Nur in der Remote-/Cloud-Umgebung laufen. Lokal (eigener Rechner) nichts tun.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Async-Direktive MUSS die erste Ausgabe sein.
echo '{"async": true, "asyncTimeout": 300000}'

cd "$CLAUDE_PROJECT_DIR"

# Idempotent und cache-freundlich (npm install, nicht ci).
npm install --no-audit --no-fund
