#!/bin/bash
# CendovaPlan - Installer fuer macOS (Doppelklick oder `bash install-mac.command`).
#
# Pendant zum Windows-Installer (install.ps1). Richtet alles in einem Schritt
# ein - OHNE Admin-Rechte:
#   1. prueft Git (installiert bei Bedarf Apples Command Line Tools per Dialog),
#   2. holt CendovaPlan nach ~/CendovaPlan bzw. AKTUALISIERT eine bestehende
#      Installation (oeffentliches Repository, kein Zugang noetig),
#   3. prueft Node.js - fehlt es, wird eine LOKALE Kopie in den Projektordner
#      gelegt (kein System-Installer, kein sudo),
#   4. installiert die Programmbibliotheken (npm install) und erzeugt das
#      private Schablonen-Paket (cendova-schablonen-*.zip),
#   5. legt die Desktop-Verknuepfung "CendovaPlan.command" an
#      (Start = Doppelklick; holt bei jedem Start die neueste Version).
#
# Idempotent: erneutes Ausfuehren aktualisiert nur.
#
# Datenschutz: CendovaPlan laeuft danach rein LOKAL im Browser; es werden
# keine Patientendaten uebertragen. Die einzige Netzverbindung dient dem
# Laden/Aktualisieren des Programmcodes (GitHub) und der Bibliotheken (npm).
set -u

REPO_HTTPS="https://github.com/cendova/cendova-plan.git"
INSTALL_DIR="$HOME/CendovaPlan"
NODE_VERSION="v22.22.2"   # LTS; gleiche Reihe wie die Referenzumgebung

info() { printf '\033[36m%s\033[0m\n' "$*"; }
step() { printf '\033[90m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mFEHLER: %s\033[0m\n' "$*"; read -r -p 'Enter zum Schliessen '; exit 1; }

echo
info '====================================================='
info '  CendovaPlan - Installation / Update (macOS)'
info '====================================================='
echo "  Quelle : $REPO_HTTPS"
echo "  Ziel   : $INSTALL_DIR"
echo
# Branch waehlbar (Enter = main). Fuer Test-Staende den Branch-Namen eingeben.
read -r -p 'Branch [main]: ' BRANCH
BRANCH=${BRANCH:-main}
echo "  Branch : $BRANCH"
echo

# ---------------------------------------------------------------------------
info '[1/5] Git pruefen ...'
if xcode-select -p >/dev/null 2>&1; then
  ok '  Git (Command Line Tools) gefunden.'
else
  warn '  Git fehlt - Apple installiert es ueber die "Command Line Tools".'
  step '  Es oeffnet sich gleich ein Dialog - dort "Installieren" klicken.'
  xcode-select --install >/dev/null 2>&1 || true
  until xcode-select -p >/dev/null 2>&1; do
    read -r -p '  Wenn die Installation abgeschlossen ist: Enter druecken ... '
  done
  ok '  Command Line Tools installiert.'
fi

# ---------------------------------------------------------------------------
info '[2/5] CendovaPlan holen / aktualisieren ...'
if [ -d "$INSTALL_DIR/.git" ]; then
  step "  Vorhandene Installation gefunden - aktualisiere auf '$BRANCH' ..."
  cd "$INSTALL_DIR" || die "Kann nicht nach $INSTALL_DIR wechseln."
  git fetch origin "$BRANCH" || die 'git fetch fehlgeschlagen (Internet? Firewall?).'
  git checkout "$BRANCH"     || die 'git checkout fehlgeschlagen.'
  if ! git merge --ff-only "origin/$BRANCH"; then
    # Upstream divergiert (z. B. nach der History-Bereinigung in Stufe C2).
    if [ -z "$(git status --porcelain)" ]; then
      warn '  Upstream divergiert - setze auf Server-Stand zurueck ...'
      git reset --hard "origin/$BRANCH" || die 'git reset fehlgeschlagen.'
    else
      die 'Lokale Aenderungen im Installationsordner - bitte manuell pruefen.'
    fi
  fi
else
  if git ls-remote "$REPO_HTTPS" HEAD >/dev/null 2>&1; then
    step '  Zugriff ok.'
  else
    die 'Repository nicht erreichbar (Internet? Firewall? URL korrekt?).'
  fi
  step "  Klone nach $INSTALL_DIR ..."
  git clone --branch "$BRANCH" "$REPO_HTTPS" "$INSTALL_DIR" \
    || die 'git clone fehlgeschlagen (Internet? Branch-Name?).'
  cd "$INSTALL_DIR" || die "Kann nicht nach $INSTALL_DIR wechseln."
fi
ok '  Code aktuell.'

# ---------------------------------------------------------------------------
info '[3/5] Node.js pruefen ...'
if [ -x "$INSTALL_DIR/.node/current/bin/node" ]; then
  export PATH="$INSTALL_DIR/.node/current/bin:$PATH"
fi
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
  if [ "${MAJOR:-0}" -ge 20 ]; then
    ok "  Node.js $(node -v) gefunden."
    NEED_NODE=0
  else
    warn "  Node.js $(node -v) ist zu alt (benoetigt: >= 20)."
  fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH="x64"
  [ "$ARCH" = "arm64" ] || [ "$ARCH" = "x64" ] || die "Unbekannte Architektur: $(uname -m)"
  NODE_PKG="node-$NODE_VERSION-darwin-$ARCH"
  step "  Lade $NODE_PKG (lokale Kopie, kein Admin noetig) ..."
  mkdir -p "$INSTALL_DIR/.node"
  curl -fL --progress-bar "https://nodejs.org/dist/$NODE_VERSION/$NODE_PKG.tar.gz" \
    | tar -xz -C "$INSTALL_DIR/.node" || die 'Node-Download fehlgeschlagen (Internet?).'
  ln -sfn "$INSTALL_DIR/.node/$NODE_PKG" "$INSTALL_DIR/.node/current"
  export PATH="$INSTALL_DIR/.node/current/bin:$PATH"
  command -v node >/dev/null 2>&1 || die 'Node.js nach Download nicht auffindbar.'
  ok "  Node.js $(node -v) eingerichtet (in $INSTALL_DIR/.node)."
fi

# ---------------------------------------------------------------------------
info '[4/5] Programmbibliotheken installieren (npm install) ...'
npm install || die 'npm install fehlgeschlagen (Internet / registry.npmjs.org?).'
ok '  Bibliotheken installiert.'

step '  Erzeuge privates Schablonen-Paket (falls Vorlagen im Repo liegen) ...'
if node scripts/export-template-package.mjs; then
  ok '  Schablonen-Paket liegt im Projektordner - PRIVAT halten!'
else
  warn '  Schablonen-Paket uebersprungen (nach Stufe C2 normal - dann per Import laden).'
fi

# ---------------------------------------------------------------------------
info '[5/5] Desktop-Verknuepfung anlegen ...'
LAUNCHER="$HOME/Desktop/CendovaPlan.command"
# Alte Verknuepfung aus frueheren Installationen entfernen.
rm -f "$HOME/Desktop/CendovaPlan starten.command"
printf '#!/bin/bash\nexec /bin/bash "%s/scripts/start-local-mac.command"\n' "$INSTALL_DIR" > "$LAUNCHER"
chmod +x "$LAUNCHER" "$INSTALL_DIR/scripts/start-local-mac.command" 2>/dev/null
ok "  Verknuepfung erstellt: $LAUNCHER"

echo
ok '====================================================='
ok '  Fertig - CendovaPlan ist eingerichtet.'
ok '====================================================='
echo "  Installiert in : $INSTALL_DIR (Branch: $BRANCH)"
echo '  Starten        : Doppelklick auf "CendovaPlan" (Desktop).'
echo '  Update         : passiert beim Start automatisch (git pull).'
echo
echo '  Hinweis: CendovaPlan laeuft rein lokal im Browser (localhost) -'
echo '           es verlassen KEINE Patientendaten den Rechner.'
echo
read -r -p 'Enter zum Schliessen '
