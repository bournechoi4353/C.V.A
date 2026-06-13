#!/usr/bin/env bash
# C.V.A installer — the voice console for Claude.
#   curl -fsSL https://raw.githubusercontent.com/bournechoi4353/C.V.A/main/scripts/install.sh | bash
set -euo pipefail

REPO="bournechoi4353/C.V.A"
APP="/Applications/CVA.app"
DMG_URL="https://github.com/$REPO/releases/latest/download/CVA-arm64.dmg"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

bold "C.V.A — the voice console for Claude"
echo "  Local ears. Local voice. Claude brain."
echo

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "✗ C.V.A currently requires an Apple Silicon Mac." >&2
  exit 1
fi

TMP=$(mktemp -d)
MOUNT=""
cleanup() {
  [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" -quiet 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "▸ Downloading the latest release (~470MB — speech models included)…"
curl -fSL --progress-bar -o "$TMP/CVA.dmg" "$DMG_URL"

echo "▸ Installing to /Applications…"
MOUNT=$(hdiutil attach -nobrowse -readonly "$TMP/CVA.dmg" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
rm -rf "$APP"
cp -R "$MOUNT/CVA.app" /Applications/
hdiutil detach "$MOUNT" -quiet && MOUNT=""

# Release builds are not yet notarized — clear quarantine so Gatekeeper allows launch.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "✓ Installed: $APP"
echo

if ! command -v claude >/dev/null 2>&1 && [ ! -d "$HOME/.claude" ]; then
  bold "One more thing: C.V.A runs on your Claude subscription."
  echo "  Install Claude Code and log in once (Pro or Max plan):"
  echo "    npm install -g @anthropic-ai/claude-code   # or: brew install claude"
  echo "    claude   # then /login"
  echo
fi

bold "Launching. Allow microphone access, toggle hands-free, and say \"Claude.\""
open "$APP"
