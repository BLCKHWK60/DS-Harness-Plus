#!/bin/bash
# Build the disk image that people download: every add-on, the installer and the docs
# in one folder. It holds only files that are committed, so nothing local slips in.
#
#   bash scripts/build-dmg.sh        -> dist/DS-Harness-Plus-<version>.dmg
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(tr -d '[:space:]' < VERSION)"
NAME="DS-Harness-Plus-${VERSION}"
OUT="$ROOT/dist/${NAME}.dmg"

if [ -n "$(git status --porcelain)" ]; then
  echo "There are changes that are not committed. Commit them first, so the image matches a commit." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
FOLDER="$STAGE/DeepSeek Harness Plus"
mkdir -p "$FOLDER" "$ROOT/dist"

git archive HEAD | tar -x -C "$FOLDER"
chmod +x "$FOLDER/Install.command" "$FOLDER/Uninstall.command"

rm -f "$OUT"
hdiutil create -quiet -volname "DeepSeek Harness Plus ${VERSION}" -srcfolder "$FOLDER" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$OUT"

echo "Built $OUT"
echo "Size:   $(du -h "$OUT" | cut -f1)"
echo "SHA256: $(shasum -a 256 "$OUT" | cut -d' ' -f1)"
