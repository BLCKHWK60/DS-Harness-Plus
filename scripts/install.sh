#!/bin/bash
# Install (or update) the DeepSeek Harness Plus add-ons into the DeepSeek Harness app.
#
# What it does, in order:
#   1. checks the app is installed and is a supported version
#   2. asks to quit the app if it is open
#   3. backs up the app's add-on list and settings files
#   4. copies the add-ons to <app data>/addons/deepseek-harness-plus
#      (so this download folder can be deleted afterwards)
#   5. registers them with the app's own add-on tool (dsh plugin add)
#   6. checks every add-on is registered; on any failure it puts everything back
#
# Running it again updates the add-ons to the version in this folder. Your settings stay.
#
# Options:
#   --yes              answer yes to every question (quit the app, open it at the end)
#   --profile <name>   install into another app profile (default: desktop, the one the app uses)
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

PLUS_VERSION=$(cat "$HERE/VERSION" 2>/dev/null || echo unknown)
say "$PLUS_NAME $PLUS_VERSION installer"

step "Checking $APP_NAME"
find_app
check_version
pick_home
say "App: $APP (version $VERSION)"
say "App data: $DSH_HOME (setup: $PROFILE)"
make_sure_app_is_closed

step "Backing up your current setup"
backup_profile install
say "Saved to $BACKUP_DIR"

step "Copying the add-ons"
PARENT=$(dirname "$ADDONS_DIR")
NEW="$PARENT/.deepseek-harness-plus.new"
OLD="$PARENT/.deepseek-harness-plus.old"
mkdir -p "$PARENT" && rm -rf "$NEW" "$OLD" || fail "Could not prepare $PARENT"
ditto "$HERE/addons" "$NEW" || fail "Could not copy the add-ons to $NEW"
find "$NEW" -type d -name test -prune -exec rm -rf {} + 2>/dev/null
[ -d "$ADDONS_DIR" ] && { mv "$ADDONS_DIR" "$OLD" || fail "Could not move the previous add-ons aside"; }
mv "$NEW" "$ADDONS_DIR" || fail "Could not move the add-ons into place"
printf '%s\n' "$PLUS_VERSION" >"$ADDONS_DIR/VERSION"

undo_copy() {
  rm -rf "$ADDONS_DIR"
  [ -d "$OLD" ] && mv "$OLD" "$ADDONS_DIR"
}

ADDON_LIST=$(list_addons "$ADDONS_DIR")
[ -n "$ADDON_LIST" ] || { undo_copy; fail "No add-ons found in $HERE/addons"; }
COUNT=$(printf '%s\n' "$ADDON_LIST" | wc -l | tr -d ' ')
say "$COUNT add-ons copied to $ADDONS_DIR"

step "Registering the add-ons with $APP_NAME (this can take a minute)"
set --
while IFS="$(printf '\t')" read -r _name folder; do set -- "$@" "$folder"; done <<EOF
$ADDON_LIST
EOF
if ! "$DSH" plugin --profile "$PROFILE" add "$@" >>"$LOG" 2>&1; then
  say "The app's add-on tool reported a problem. Putting everything back..."
  restore_profile; undo_copy
  say "Last lines of the log ($LOG):"; tail -15 "$LOG"
  fail "Nothing was changed. The full log is in $LOG"
fi

step "Checking"
MISSING=$(app_node -e '
  const fs = require("fs");
  const [file, dir, list] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const deps = pkg.dependencies || {}, bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  for (const line of list.split("\n").filter(Boolean)) {
    const [name, folder] = line.split("\t");
    const linked = String(deps[name] || "").replace(/^link:/, "");
    if (linked !== folder || !bundles.includes(name)) console.log(name);
  }' "$PROFILE_DIR/package.json" "$ADDONS_DIR" "$ADDON_LIST")
if [ -n "$MISSING" ]; then
  say "These add-ons did not register: $MISSING"
  say "Putting everything back..."
  restore_profile; undo_copy
  fail "Nothing was changed. The log is in $LOG"
fi
rm -rf "$OLD"
printf '%s\n' "$ADDON_LIST" | while IFS="$(printf '\t')" read -r name _folder; do say "ok  $name"; done

step "Done"
say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons)."
say ""
say "Next:"
say "  1. Open $APP_NAME."
say "  2. Add your models in Settings > Models (API keys or your own server)."
say "  3. Read 'First steps' in the README to switch on the add-ons you want."
say ""
say "To undo: run Uninstall.command. Your previous setup is saved in:"
say "  $BACKUP_DIR"

if [ "$REAL_HOME" = 1 ] && ask_yes "Open $APP_NAME now?"; then open -a "$APP"; fi
exit 0
