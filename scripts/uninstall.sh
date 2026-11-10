#!/bin/bash
# Remove the DeepSeek Harness Plus add-ons from the DeepSeek Harness app.
#
# What it does, in order:
#   1. asks to quit the app if it is open
#   2. backs up the app's add-on list and settings files
#   3. unregisters every Plus add-on with the app's own tool (dsh plugin remove)
#   4. deletes <app data>/addons/deepseek-harness-plus
#
# Your own settings for these add-ons (if you added any) stay in place and do nothing;
# installing again picks them up.
#
# Options:
#   --yes              answer yes to every question
#   --profile <name>   remove from another app profile (default: desktop)
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
    --help|-h) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

say "$PLUS_NAME uninstaller"

step "Checking $APP_NAME"
find_app
pick_home
make_sure_app_is_closed

# Every package name this release ships, taken from this folder.
NAMES=$(list_addons "$HERE/addons" | cut -f1)
# Only the ones the setup actually lists.
INSTALLED=$(app_node -e '
  const fs = require("fs");
  const [file, names] = process.argv.slice(1);
  const deps = JSON.parse(fs.readFileSync(file, "utf8")).dependencies || {};
  for (const n of names.split("\n").filter(Boolean)) if (n in deps) console.log(n);
  ' "$PROFILE_DIR/package.json" "$NAMES")

if [ -z "$INSTALLED" ] && [ ! -d "$ADDONS_DIR" ]; then
  say "Nothing to remove: no $PLUS_NAME add-ons are installed."
  exit 0
fi
ask_yes "Remove $(printf '%s\n' "$INSTALLED" | grep -c .) add-ons from $APP_NAME?" || fail "Nothing was changed."

step "Backing up your current setup"
backup_profile uninstall
say "Saved to $BACKUP_DIR"


if [ -n "$INSTALLED" ]; then
  step "Unregistering the add-ons (this can take a minute)"
  set --
  while read -r n; do [ -n "$n" ] && set -- "$@" "$n"; done <<EOF
$INSTALLED
EOF
  if ! "$DSH" plugin --profile "$PROFILE" remove "$@" >>"$LOG" 2>&1; then
    say "The app's add-on tool reported a problem. Putting everything back..."
    restore_profile
    tail -15 "$LOG"
    fail "Nothing was changed. The full log is in $LOG"
  fi
fi

step "Deleting the add-on files"
rm -rf "$ADDONS_DIR"
say "Removed $ADDONS_DIR"

step "Done"
say "$PLUS_NAME is removed. Your conversations are untouched."
say "Your setup from before this step is saved in:"
say "  $BACKUP_DIR"
exit 0
