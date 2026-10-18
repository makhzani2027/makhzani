#!/usr/bin/env bash
# Raqeem: run the store app on your phone with Expo Go (macOS / Linux)
# macOS: double-click this file (first time: right-click ← Open). Installs Node.js if missing,
# downloads the project, installs packages and shows a QR code to scan with Expo Go.
set -euo pipefail
REPO="https://github.com/makhzani2027/makhzani.git"
BRANCH="claude/happy-rubin-s67gcc"
DIR="$HOME/raqeem"
fail() { echo; echo "Something failed. Take a screenshot of this window and send it."; read -r -p "Press Enter to close"; exit 1; }
trap fail ERR

echo "===== Raqeem / Expo Go ====="
node_ok() { command -v node >/dev/null && node -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)"; }
if ! node_ok; then
  echo "[1/4] Installing Node.js LTS..."
  if command -v brew >/dev/null; then brew install node
  elif [[ "$(uname)" == "Darwin" ]]; then
    pkg="/tmp/node-lts.pkg"
    ver=$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c "import json,sys; print(next(r['version'] for r in json.load(sys.stdin) if r['lts']))")
    curl -fsSL "https://nodejs.org/dist/$ver/node-$ver.pkg" -o "$pkg"
    echo "      (macOS will ask for your password to install Node.js)"
    sudo installer -pkg "$pkg" -target /
  else
    echo "Install Node.js 20+ (https://nodejs.org) then run again."; fail
  fi
fi
command -v git >/dev/null || { echo "Git is missing: on macOS run 'xcode-select --install', then run this again."; fail; }

echo "[2/4] Downloading the project to $DIR ..."
echo "      (private repository: sign in to GitHub if asked; for the password use a GitHub token)"
if [[ -d "$DIR/.git" ]]; then
  cd "$DIR" && git fetch origin "$BRANCH" && git checkout "$BRANCH" && git pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

echo "[3/4] Installing packages (first time takes a few minutes)..."
npm install --no-audit --no-fund

echo
echo "[4/4] How is your phone connected?"
echo "   1 = Same Wi-Fi as this computer (recommended)"
echo "   2 = Different network (needs a free account from expo.dev)"
read -r -t 15 -p "Choose 1 or 2 (default 1): " mode || true
cd "$DIR/apps/mobile"
echo
echo " - Open Expo Go on your phone and scan the QR code below. Ctrl+C to stop."
trap - ERR
if [[ "${mode:-1}" == "2" ]]; then npx expo login; npx expo start --tunnel; else npx expo start --lan; fi
