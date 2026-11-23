#!/bin/bash
# Remove the DeepSeek Harness Plus add-ons from the DeepSeek Harness app.
#
# What it does, in order:
#   1. asks to quit the app if it is open
#   2. backs up the app's add-on list and settings files
#   3. unregisters every Plus add-on with the app's own tool (dsh plugin remove)
#   4. deletes <app data>/addons/deepseek-harness-plus
#
# It removes the add-ons only. What stays is printed at the end: your threads, the add-ons'
# own data folders, Keychain passwords, a shared settings file, trashed threads and the saved
# setup copies. An optional last step ("also remove my Plus data") can remove the data folders; it
# lists each folder with its size, asks twice and the default is No.
#
# Options:
#   --yes              answer yes to every question (it never answers the data step)
#   --profile <name>   remove from another app profile (default: desktop)
#   --remove-data      go straight to the optional data step (also when no add-ons are left to remove)
#   --help             show this text
set -u

HERE=$(cd "$(dirname "$0")/.." && pwd -P)
. "$HERE/scripts/common.sh"

PROFILE=desktop
ASSUME_YES=0
REMOVE_DATA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --remove-data) REMOVE_DATA=1 ;;
    --help|-h) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

say "$PLUS_NAME uninstaller"

step "Checking $APP_NAME"
find_app
pick_home

# Every package name this release ships, taken from this folder.
NAMES=$(list_addons "$HERE/addons" | cut -f1)
# Only the ones the setup actually lists.
INSTALLED=$(app_node -e '
  const fs = require("fs");
  const [file, names] = process.argv.slice(1);
  const deps = JSON.parse(fs.readFileSync(file, "utf8")).dependencies || {};
  for (const n of names.split("\n").filter(Boolean)) if (n in deps) console.log(n);
  ' "$PROFILE_DIR/package.json" "$NAMES")
# Plus add-ons an older release installed that this folder no longer lists.
EXTRA=$(stale_addons "$PROFILE_DIR/package.json" "$ADDONS_DIR" "$INSTALLED")
[ -n "$EXTRA" ] && INSTALLED=$(printf '%s\n%s\n' "$INSTALLED" "$EXTRA" | grep . | sort -u)

DATA=$(plus_lib data "$HERE/addon-tiers.json" "$DSH_HOME")

if [ -z "$INSTALLED" ] && [ ! -d "$ADDONS_DIR" ]; then
  say "Nothing to remove: no $PLUS_NAME add-ons are installed."
  if [ "$REMOVE_DATA" = 1 ]; then
    make_sure_app_is_closed
    print_what_stays "$DATA"
    offer_data_removal "$DATA"
  fi
  exit 0
fi
make_sure_app_is_closed
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
# A marker, so a later install knows this person had Plus before: it is then an update (no new-install defaults, no
# setup card, no Simple view), whatever happens to the data folders. Written after the add-ons are gone.
printf 'Plus was uninstalled here on %s. A later install treats this as an update, not a first install.\n' "$(date '+%Y-%m-%d %H:%M')" >"$DSH_HOME/backups/deepseek-harness-plus/uninstalled.txt" 2>/dev/null || true

step "Done"
say "The $PLUS_NAME add-ons are removed (every add-on in the Plus folder, Recon too if you had it)."
say "Your setup from before this step is saved in:"
say "  $BACKUP_DIR"
print_what_stays "$DATA"
offer_data_removal "$DATA"
exit 0
