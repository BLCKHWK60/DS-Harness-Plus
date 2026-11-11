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
#   --settings <dir>   share your Plus settings through settings.json in this folder, for example
#                      a folder in iCloud Drive; run with the same folder on your other Mac
#   --no-settings      stop sharing settings on this Mac (the file itself is left alone)
#   --help             show this text
set -u

HERE=$(cd "$(dirname "$0")/.." && pwd -P)
. "$HERE/scripts/common.sh"

PROFILE=desktop
ASSUME_YES=0
SHARE=
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --settings) shift; SHARE=${1:?--settings needs a folder} ;;
    --no-settings) SHARE=- ;;
    --help|-h) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
choose_shared_folder
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

undo_copy() {
  rm -rf "$ADDONS_DIR" "$NEW"
  [ -d "$OLD" ] && mv "$OLD" "$ADDONS_DIR"
}
# Put everything back: the previous add-on files first, then the setup that points at them.
roll_back() {
  undo_copy
  restore_profile
}
# If the window is closed or Ctrl-C is pressed half-way, undo instead of leaving a broken setup.
trap 'say ""; say "Interrupted. Putting everything back..."; roll_back; exit 1' INT TERM HUP

[ -d "$ADDONS_DIR" ] && { mv "$ADDONS_DIR" "$OLD" || { rm -rf "$NEW"; fail "Could not move the previous add-ons aside"; }; }
mv "$NEW" "$ADDONS_DIR" || { undo_copy; fail "Could not move the add-ons into place"; }
printf '%s\n' "$PLUS_VERSION" >"$ADDONS_DIR/VERSION"

ADDON_LIST=$(list_addons "$ADDONS_DIR")
# Add-ons an older release installed that this one no longer ships: their folders are gone now,
# so they must be unregistered or the app would fail to load them.
STALE=$(stale_addons "$PROFILE_DIR/package.json" "$ADDONS_DIR" "$ADDON_LIST")
[ -n "$ADDON_LIST" ] || { undo_copy; fail "No add-ons found in $HERE/addons"; }
COUNT=$(printf '%s\n' "$ADDON_LIST" | wc -l | tr -d ' ')
say "$COUNT add-ons copied to $ADDONS_DIR"

# Add-ons the owner switched off in the app: still installed (linked), but taken out of the list the
# app loads. They are updated like the rest and left switched off; that is the owner's choice.
SWITCHED_OFF=$(app_node -e '
  const fs = require("fs");
  const [file, list] = process.argv.slice(1);
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(0); }
  const deps = pkg.dependencies || {}, bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  for (const line of list.split("\n").filter(Boolean)) {
    const name = line.split("\t")[0];
    if (deps[name] && !bundles.includes(name)) console.log(name);
  }' "$PROFILE_DIR/package.json" "$ADDON_LIST" 2>/dev/null)

step "Registering the add-ons with $APP_NAME (this can take a minute)"
set --
while IFS="$(printf '\t')" read -r _name folder; do set -- "$@" "$folder"; done <<EOF
$ADDON_LIST
EOF
if [ -n "$STALE" ]; then
  say "Removing add-ons this release no longer ships: $(printf '%s ' $STALE)"
  # shellcheck disable=SC2086
  if ! "$DSH" plugin --profile "$PROFILE" remove $STALE >>"$LOG" 2>&1; then
    say "The app's add-on tool reported a problem. Putting everything back..."
    roll_back
    say "Last lines of the log ($LOG):"; tail -15 "$LOG"
    fail "Nothing was changed. The full log is in $LOG"
  fi
fi
if ! "$DSH" plugin --profile "$PROFILE" add "$@" >>"$LOG" 2>&1; then
  say "The app's add-on tool reported a problem. Putting everything back..."
  roll_back
  say "Last lines of the log ($LOG):"; tail -15 "$LOG"
  fail "Nothing was changed. The full log is in $LOG"
fi

step "Checking"
MISSING=$(app_node -e '
  const fs = require("fs");
  const [file, dir, list, off] = process.argv.slice(1);
  const leftOff = new Set(String(off || "").split("\n").filter(Boolean));
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const deps = pkg.dependencies || {}, bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  for (const line of list.split("\n").filter(Boolean)) {
    const [name, folder] = line.split("\t");
    const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
    const linked = String(deps[name] || "").replace(/^link:/, "");
    // An add-on that was switched off before this install only has to be linked; it stays off.
    if (!linked || real(linked) !== real(folder) || (!bundles.includes(name) && !leftOff.has(name))) console.log(name);
  }' "$PROFILE_DIR/package.json" "$ADDONS_DIR" "$ADDON_LIST" "$SWITCHED_OFF")
if [ -n "$MISSING" ]; then
  say "These add-ons did not register: $MISSING"
  say "Putting everything back..."
  roll_back
  fail "Nothing was changed. The log is in $LOG"
fi
trap - INT TERM HUP
rm -rf "$OLD"
# Which of those are still off now (the app may have switched one back on while registering).
STILL_OFF=$(app_node -e '
  const fs = require("fs");
  const [file, off] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  for (const name of String(off || "").split("\n").filter(Boolean)) if (!bundles.includes(name)) console.log(name);
  ' "$PROFILE_DIR/package.json" "$SWITCHED_OFF" 2>/dev/null)
printf '%s\n' "$ADDON_LIST" | while IFS="$(printf '\t')" read -r name _folder; do
  if printf '%s\n' "$STILL_OFF" | grep -qxF "$name"; then say "off $name (you switched it off in the app; updated and left off)"; else say "ok  $name"; fi
done
OFF_COUNT=$(printf '%s\n' "$STILL_OFF" | grep -c . || true)
record_shared_folder

step "Done"
if [ "$OFF_COUNT" -gt 0 ]; then
  say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons, $OFF_COUNT of them switched off by you)."
  say "Switch one back on in $APP_NAME under Plugins."
else
  say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons)."
fi
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
