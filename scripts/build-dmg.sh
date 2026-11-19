#!/bin/bash
# Build the two disk images that people download:
#   DS-Harness-Plus-<version>.dmg        the add-ons (without Recon), the installer and the docs
#   DS-Harness-Plus-Recon-<version>.dmg  Recon alone, with its own installer, warning and uninstaller
# Which add-on is its own download is written in addon-tiers.json (tier "separate"), and the
# files for the Recon image are in recon-kit/.
#
# Each image is one folder. It holds only files that are committed, so nothing local slips in, and
# only the files meant for users: .gitattributes marks maintainer notes, tests of the build and
# the Tuner Plus rollback with export-ignore, so `git archive` leaves them out.
#
#   bash scripts/build-dmg.sh                       -> dist/DS-Harness-Plus-<version>.dmg and dist/DS-Harness-Plus-Recon-<version>.dmg
#   DSH_DMG_OUT=/some/folder bash scripts/build-dmg.sh   -> the image goes there instead of dist/
#
#   DSH_DMG_STAGE_ONLY=<folder> bash scripts/build-dmg.sh   -> only the two folders (main/, recon/) in <folder>, no images (the self-check)
#
# The images are not signed with an Apple developer certificate, so macOS 15 and later block
# Install.command until the user clicks "Open Anyway" in System Settings > Privacy & Security.
# README.md ("Install") says so in plain words.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
HERE="$ROOT"
. "$ROOT/scripts/common.sh"
find_app   # the Node.js inside the app reads addon-tiers.json

VERSION="$(tr -d '[:space:]' < VERSION)"
OUT_DIR="${DSH_DMG_OUT:-$ROOT/dist}"
STAGE_ONLY="${DSH_DMG_STAGE_ONLY:-}"

if [ -n "$(git status --porcelain)" ]; then
  echo "There are changes that are not committed. Commit them first, so the image matches a commit." >&2
  exit 1
fi

if [ -n "$STAGE_ONLY" ]; then STAGE="$STAGE_ONLY"; mkdir -p "$STAGE"; else STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT; fi
FULL="$STAGE/full"
MAIN="$STAGE/main/DeepSeek Harness Plus"
RECON="$STAGE/recon/DeepSeek Harness Plus Recon"
mkdir -p "$FULL" "$MAIN" "$RECON" "$OUT_DIR"

git archive HEAD | tar -x -C "$FULL"
SEPARATE="$(plus_lib separate "$FULL/addon-tiers.json")"
[ -n "$SEPARATE" ] || { echo "addon-tiers.json lists no separate download." >&2; exit 1; }

# The main folder: everything except the separate add-ons and their kit.
ditto "$FULL" "$MAIN"
rm -rf "$MAIN/recon-kit"
for folder in $SEPARATE; do rm -rf "${MAIN:?}/addons/$folder"; done
chmod +x "$MAIN/Install.command" "$MAIN/Uninstall.command"

# The Recon folder: the kit, the shared helpers, and the separate add-ons.
mkdir -p "$RECON/scripts" "$RECON/addons"
cp "$FULL"/recon-kit/*.command "$FULL/recon-kit/README.md" "$RECON/"
cp "$FULL"/recon-kit/scripts/*.sh "$RECON/scripts/"
cp "$FULL/scripts/common.sh" "$FULL/scripts/plus-lib.mjs" "$RECON/scripts/"
cp "$FULL/addon-tiers.json" "$FULL/VERSION" "$FULL/LICENSE" "$RECON/"
for folder in $SEPARATE; do ditto "$FULL/addons/$folder" "$RECON/addons/$folder"; done
chmod +x "$RECON"/*.command

# What users get is the installer, the uninstaller, the add-ons and the guides. Stop if something meant
# for maintainers slipped in (a missing export-ignore line in .gitattributes).
for dir in "$MAIN" "$RECON"; do
  for left in "Tuner Plus Way Back.command" extras/way-back scripts/check.sh scripts/build-dmg.sh scripts/tuner-way-back.sh scripts/plus-lib.test.mjs scripts/new-install-defaults.test.mjs scripts/docs.test.mjs scripts/dsh-poll.test.mjs scripts/dsh-ui.test.mjs scripts/check-css-classes.test.mjs scripts/check-css-classes.mjs scripts/css-class-allowlist.json docs/HANDOFF.md docs/NEXT-SESSION-PROMPT.md; do
    if [ -e "$dir/$left" ]; then
      echo "$left is in an image but is not for users. Add it to .gitattributes with export-ignore." >&2
      exit 1
    fi
  done
done
# new-install-defaults.json and scripts/new-install-defaults.mjs are what the first-install values and the first-run card need: without them a fresh install quietly loses them.
for need in Install.command Uninstall.command README.md VERSION addon-tiers.json new-install-defaults.json scripts/install.sh scripts/uninstall.sh scripts/common.sh scripts/plus-lib.mjs scripts/new-install-defaults.mjs addons; do
  [ -e "$MAIN/$need" ] || { echo "$need is missing from the main image." >&2; exit 1; }
done
for need in "Install Recon.command" "Uninstall Recon.command" README.md VERSION addon-tiers.json scripts/recon-install.sh scripts/recon-uninstall.sh scripts/common.sh scripts/plus-lib.mjs; do
  [ -e "$RECON/$need" ] || { echo "$need is missing from the Recon image." >&2; exit 1; }
done
# No maintainer test file may ship: scripts/*.test.mjs and the add-ons' test folders stay in the repository.
for dir in "$MAIN" "$RECON"; do
  stray=$(find "$dir" \( -name '*.test.mjs' -o -path '*/test/*' \) -not -path '*/node_modules/*' | head -3)
  [ -z "$stray" ] || { echo "Maintainer test files are in an image (add them to .gitattributes with export-ignore): $stray" >&2; exit 1; }
done
# Recon must not be in the main image, and nothing but Recon may be in the Recon image.
for folder in $SEPARATE; do
  [ ! -e "$MAIN/addons/$folder" ] || { echo "$folder is in the main image but is a separate download." >&2; exit 1; }
  [ -f "$RECON/addons/$folder/package.json" ] || { echo "$folder is missing from the Recon image." >&2; exit 1; }
done
[ "$(ls "$RECON/addons" | wc -l | tr -d ' ')" = "$(printf '%s\n' $SEPARATE | wc -l | tr -d ' ')" ] || { echo "The Recon image holds an add-on that is not a separate download." >&2; exit 1; }
[ ! -e "$MAIN/recon-kit" ] || { echo "recon-kit is in the main image." >&2; exit 1; }

if [ -n "$STAGE_ONLY" ]; then
  rm -rf "$FULL"
  echo "Staged in $STAGE (main/ and recon/); no images were built."
  exit 0
fi

make_image() { # <folder> <volume name> <file>
  rm -f "$3"
  hdiutil create -quiet -volname "$2" -srcfolder "$1" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$3"
  echo "Built $3"
  echo "Size:   $(du -h "$3" | cut -f1)"
  echo "SHA256: $(shasum -a 256 "$3" | cut -d' ' -f1)"
}
make_image "$MAIN" "DeepSeek Harness Plus ${VERSION}" "$OUT_DIR/DS-Harness-Plus-${VERSION}.dmg"
make_image "$RECON" "DeepSeek Harness Plus Recon ${VERSION}" "$OUT_DIR/DS-Harness-Plus-Recon-${VERSION}.dmg"
