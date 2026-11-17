#!/bin/bash
# Put back Tuner Plus 0.1.0, the version of 17 November 2026 before skills were added, in one action.
#
# What it does, in order:
#   1. checks the saved copy (extras/way-back/dsh-tuning-0.1.0) against its list of fingerprints
#   2. asks to quit the app if it is open
#   3. backs up the app's setup files and the Tuner Plus that is installed now
#   4. puts the saved Tuner Plus in place of the installed one (on any failure it puts the old one back)
#   5. updates the installer's record of installed files, for Tuner Plus only
#
# It never touches Tuner Plus's data (<app data>/tuning: rows, exam, sets, shelf, cards, skill records),
# your settings, or any other add-on. Skill files Tuner Plus wrote keep working: the app reads them by
# itself. To undo this, run Install.command again.
#
# Options:
#   --yes              answer yes to every question (quit the app)
#   --profile <name>   another app profile (default: desktop, the one the app uses)
#   --help             show this text
set -u

HERE=$(cd "$(dirname "$0")/.." && pwd -P)
. "$HERE/scripts/common.sh"

PROFILE=desktop
ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --help|-h) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

SAVED="$HERE/extras/way-back/dsh-tuning-0.1.0"
LIST="$HERE/extras/way-back/dsh-tuning-0.1.0.sha256"
# Fingerprints of every file in a folder, one "hash  ./path" line per file, sorted by path (Finder's
# .DS_Store files are left out: opening a folder in Finder must not count as a change).
fingerprints() { (cd "$1" && find . -type f -not -name .DS_Store -print0 | xargs -0 shasum -a 256 | sort -k2); }
# Whether a folder holds exactly the saved files. Both lists are sorted here, in this run's language,
# so the language of the Terminal does not matter (the saved list was written in another one).
matches_saved() { fingerprints "$1" | diff -q - <(sort -k2 "$LIST") >/dev/null; }

say "Tuner Plus way back: back to version 0.1.0"

step "Checking"
find_app
pick_home
say "App data: $DSH_HOME (setup: $PROFILE)"
[ -d "$SAVED" ] && [ -f "$LIST" ] || fail "The saved Tuner Plus 0.1.0 is missing from $HERE/extras/way-back."
matches_saved "$SAVED" || fail "The saved Tuner Plus 0.1.0 in $SAVED is not complete or was changed. Nothing was done."
TARGET="$ADDONS_DIR/dsh-tuning"
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || fail "Tuner Plus is not installed in $ADDONS_DIR. Nothing to put back."
if matches_saved "$TARGET"; then
  say "Tuner Plus 0.1.0 is already in place. Nothing was changed."
  exit 0
fi
make_sure_app_is_closed

step "Backing up"
backup_profile tuner-way-back
ditto "$TARGET" "$BACKUP_DIR/dsh-tuning-before" || fail "Could not back up the installed Tuner Plus. Nothing was changed."
say "Saved to $BACKUP_DIR"
# Installed files changed in place since the last install (by you, or by the app's creator mode):
# they are in the backup above, and are named here so they are not lost by surprise.
RECORD="$ADDONS_DIR/.installed-files"
if [ -f "$RECORD" ]; then
  cp -p "$RECORD" "$BACKUP_DIR/installed-files" || fail "Could not back up the record of installed files. Nothing was changed."
  EDITED=$( (cd "$ADDONS_DIR" && find ./dsh-tuning -type f -not -path "*/node_modules/*" -print0 | xargs -0 shasum -a 256 | sort -k2) | diff - <(grep -F '  ./dsh-tuning/' "$RECORD" | sort -k2) | sed -n 's/^< [0-9a-f]*  //p')
  if [ -n "$EDITED" ]; then
    say "These Tuner Plus files were changed since the last install (by you, or by the app's creator mode):"
    printf '%s\n' "$EDITED" | sed 's/^\.\//  /'
    say "A copy of each is in $BACKUP_DIR/dsh-tuning-before"
  fi
fi

step "Putting back Tuner Plus 0.1.0"
NEW="$ADDONS_DIR/.dsh-tuning.new"
OLD="$ADDONS_DIR/.dsh-tuning.old"
rm -rf "$NEW" "$OLD" || fail "Could not prepare $ADDONS_DIR. Nothing was changed."
ditto "$SAVED" "$NEW" || { rm -rf "$NEW"; fail "Could not copy the saved Tuner Plus. Nothing was changed."; }
# Undo: the installed Tuner Plus comes back from where it was moved aside (only then is the folder in
# its place removed: an interruption before the move leaves it where it is), and the record as it was.
put_back() {
  if [ -d "$OLD" ]; then rm -rf "$TARGET" && mv "$OLD" "$TARGET"; fi
  rm -rf "$NEW"
  [ -f "$BACKUP_DIR/installed-files" ] && cp -p "$BACKUP_DIR/installed-files" "$RECORD"
  return 0
}
trap 'say ""; say "Interrupted. Putting the installed Tuner Plus back..."; put_back; exit 1' INT TERM HUP
mv "$TARGET" "$OLD" || { rm -rf "$NEW"; fail "Could not move the installed Tuner Plus aside. Nothing was changed."; }
mv "$NEW" "$TARGET" || { put_back; fail "Could not move the saved Tuner Plus into place. Nothing was changed."; }
if ! matches_saved "$TARGET"; then
  put_back
  fail "The copied Tuner Plus did not match the saved one. The installed Tuner Plus was put back; nothing was changed."
fi
# The installer's record: the Tuner Plus lines now describe 0.1.0, every other line stays as it was,
# so the next install still sees any change you made to another add-on.
if [ -f "$RECORD" ]; then
  { grep -vF '  ./dsh-tuning/' "$RECORD"; (cd "$ADDONS_DIR" && find ./dsh-tuning -type f -not -path "*/node_modules/*" -print0 | xargs -0 shasum -a 256); } | sort -k2 >"$RECORD.new" \
    && mv "$RECORD.new" "$RECORD" || say "Note: the record of installed files could not be updated; the next install may list Tuner Plus's files as changed by you."
fi
trap - INT TERM HUP
rm -rf "$OLD"

step "Done"
say "Tuner Plus 0.1.0 is back in place."
say "Not touched: its data in $DSH_HOME/tuning, your settings, and every other add-on."
say "Skill files Tuner Plus made keep working; the app reads them by itself."
say "To undo this, run Install.command again. The Tuner Plus you had is saved in:"
say "  $BACKUP_DIR/dsh-tuning-before"
if [ "$REAL_HOME" = 1 ] && ask_yes "Open $APP_NAME now?"; then open -a "$APP"; fi
exit 0
