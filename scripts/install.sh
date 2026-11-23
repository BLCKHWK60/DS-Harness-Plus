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
# The first time, it asks which add-ons you want: the Core set (the finished ones, switched on) or
# Everything (also the Experimental ones, copied but switched off until you switch them on). Beta
# add-ons are copied but off in both. An update never switches an add-on you already have on or off.
#
# Options:
#   --yes              answer yes to every question (quit the app, open it at the end)
#   --core             first install: the Core set (the default with --yes)
#   --everything       also copy the Experimental add-ons (off until you switch them on); on an
#                      existing install this only adds the ones that are missing
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
CHOICE=
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --core) CHOICE=core ;;
    --everything) CHOICE=everything ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --settings) shift; SHARE=${1:?--settings needs a folder} ;;
    --no-settings) SHARE=- ;;
    --help|-h) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
say "App: $APP (version $VERSION; this release supports versions $(supported_range))"
say "App data: $DSH_HOME (setup: $PROFILE)"
make_sure_app_is_closed

TIERS="$HERE/addon-tiers.json"
# Which add-ons are already installed decides whether this is a first install (the question below) or an update.
INSTALLED_BEFORE=$(plus_lib plan "$HERE/addons" "$TIERS" "$PROFILE_DIR/package.json" core | awk -F'\t' '$4==1' | wc -l | tr -d ' ')
N_CORE=$(plus_lib plan "$HERE/addons" "$TIERS" "$PROFILE_DIR/package.json" core | awk -F'\t' '$3=="core"' | wc -l | tr -d ' ')
N_BETA=$(plus_lib plan "$HERE/addons" "$TIERS" "$PROFILE_DIR/package.json" core | awk -F'\t' '$3=="beta"' | wc -l | tr -d ' ')
N_EXP=$(plus_lib plan "$HERE/addons" "$TIERS" "$PROFILE_DIR/package.json" core | awk -F'\t' '$3=="experimental"' | wc -l | tr -d ' ')
# A returning person (Plus was uninstalled here before: a marker, or Plus data folders) is treated like an update, not a first install.
RETURNING=0
if [ "$INSTALLED_BEFORE" = 0 ] && plus_lib returning "$TIERS" "$DSH_HOME"; then RETURNING=1; fi
if [ "$INSTALLED_BEFORE" -gt 0 ]; then
  say ""
  say "This is an update: the add-ons you already have stay exactly as they are (switched on or off)."
  [ "$CHOICE" = everything ] && say "You chose Everything: the Experimental add-ons you do not have yet are added, switched off."
  [ -n "$CHOICE" ] || CHOICE=core
else
  if [ -z "$CHOICE" ] && [ "$ASSUME_YES" != 1 ] && [ -t 0 ]; then
    say ""
    say "Which add-ons do you want?"
    say "  1) Core set (recommended): the $N_CORE finished add-ons, switched on. $N_BETA Beta add-ons are copied too but stay off."
    say "  2) Everything: the Core set, the Beta ones, and the $N_EXP Experimental add-ons (little tested; each is"
    say "     labelled Experimental and stays off until you switch it on in $APP_NAME under Plugins)."
    printf 'Type 1 or 2 [1]: '
    read -r pick
    case "$pick" in 2) CHOICE=everything ;; *) CHOICE=core ;; esac
  fi
  [ -n "$CHOICE" ] || CHOICE=core
fi
PLAN=$(plus_lib plan "$HERE/addons" "$TIERS" "$PROFILE_DIR/package.json" "$CHOICE")
if [ "$RETURNING" = 1 ]; then
  say ""
  say "Plus was installed on this Mac before. This counts as an update: your saved settings stay, the safer starting values are NOT applied again,"
  say "and the first-run card and the Simple settings view do not come back."
fi
# Shared settings is only asked about (and its folder only saved) when that add-on is part of this install.
SHARED_WILL_INSTALL=0
printf '%s\n' "$PLAN" | awk -F'\t' '$1=="dsh-shared-settings" && $5==1 {found=1} END {exit !found}' && SHARED_WILL_INSTALL=1
choose_shared_folder
[ "$CHOICE" = everything ] && say "Add-on set: Everything" || say "Add-on set: Core set"

step "Backing up your current setup"
backup_profile install
say "Saved to $BACKUP_DIR"

# The installed add-on files can be changed in place, by you or by the app's creator mode. This
# install replaces them all, so anything changed since the last install is kept first: the changed
# and added files are copied into the backup, where they can be picked up again.
ADDONS_NOW="$DSH_HOME/addons/deepseek-harness-plus"
PRIOR_VERSION=$(cat "$ADDONS_NOW/VERSION" 2>/dev/null || true)  # the Plus version that was installed (a kept Recon is that old)
KEPT_SEPARATE=
if [ -f "$ADDONS_NOW/.installed-files" ]; then
  EDITED=$(cd "$ADDONS_NOW" && find . -type f -not -path "*/node_modules/*" -not -name ".installed-files" -not -name "VERSION" -print0 2>/dev/null | xargs -0 shasum -a 256 2>/dev/null | sort -k2 | diff - <(sort -k2 .installed-files) 2>/dev/null | sed -n 's/^< [0-9a-f]*  //p')
  if [ -n "$EDITED" ]; then
    mkdir -p "$BACKUP_DIR/files-you-changed"
    printf '%s\n' "$EDITED" | while IFS= read -r file; do
      mkdir -p "$BACKUP_DIR/files-you-changed/$(dirname "$file")" && cp -p "$ADDONS_NOW/$file" "$BACKUP_DIR/files-you-changed/$file"
    done
    say ""
    say "These installed add-on files were changed since the last install (by you, or by the app's creator mode):"
    printf '%s\n' "$EDITED" | sed 's/^\.\//  /'
    say "This install replaces them. A copy of each is kept in:"
    say "  $BACKUP_DIR/files-you-changed"
    say ""
  fi
fi

step "Copying the add-ons"
PARENT=$(dirname "$ADDONS_DIR")
NEW="$PARENT/.deepseek-harness-plus.new"
OLD="$PARENT/.deepseek-harness-plus.old"
mkdir -p "$PARENT" && rm -rf "$NEW" "$OLD" || fail "Could not prepare $PARENT"
ditto "$HERE/addons" "$NEW" || fail "Could not copy the add-ons to $NEW"
find "$NEW" -type d -name test -prune -exec rm -rf {} + 2>/dev/null
# Only the add-ons of the chosen set (and the ones already installed) are kept in the copy.
printf '%s\n' "$PLAN" | while IFS="$(printf '\t')" read -r folder _n _t _i include _w _o; do
  [ "$include" = 1 ] || rm -rf "${NEW:?}/$folder"
done
# An add-on that is its own download (Recon) is not in this folder. If it is installed, it stays: its
# files are carried over untouched into the new copy, so this update neither removes nor changes it.
for folder in $(plus_lib separate "$TIERS"); do
  if [ -d "$ADDONS_NOW/$folder" ] && [ ! -e "$NEW/$folder" ] && grep -q "\"@local/$folder\"" "$PROFILE_DIR/package.json" 2>/dev/null; then
    ditto "$ADDONS_NOW/$folder" "$NEW/$folder" || fail "Could not keep the installed $folder"
    say "Kept $folder as it is (it is a separate download; update it with its own installer)."
    KEPT_SEPARATE="$KEPT_SEPARATE $folder"
  fi
done

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
cp "$TIERS" "$ADDONS_DIR/addon-tiers.json"  # which add-on is Core, Beta or Experimental: read by Settings
[ -f "$HERE/new-install-defaults.json" ] && cp "$HERE/new-install-defaults.json" "$ADDONS_DIR/new-install-defaults.json"  # the first-run card reads the suggested daily limit from it
# What was installed, file by file, so the next install can tell what was changed in place since.
(cd "$ADDONS_DIR" && find . -type f -not -path "*/node_modules/*" -not -name ".installed-files" -not -name "VERSION" -print0 | xargs -0 shasum -a 256 | sort -k2 >.installed-files) 2>/dev/null || true

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

# New add-ons that are Beta or Experimental start switched off: taken out of the list the app loads, but
# still installed (linked), so a switch in the app's Plugins page turns them on. Add-ons already installed
# are never touched. This is the same state the app itself puts an add-on in when you switch it off.
NEW_OFF=$(printf '%s\n' "$PLAN" | awk -F'\t' '$7==1 {print $2}')
if [ -n "$NEW_OFF" ]; then
  app_node -e '
    const fs = require("fs");
    const [file, list] = process.argv.slice(1);
    const off = new Set(list.split("\n").filter(Boolean));
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const profile = pkg.dsh.profile;
    profile.bundles = (profile.bundles || []).filter((name) => !off.has(name));
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PROFILE_DIR/package.json" "$NEW_OFF" >>"$LOG" 2>&1 || { say "Could not switch the new Beta and Experimental add-ons off. Putting everything back..."; roll_back; fail "Nothing was changed. The log is in $LOG"; }
  SWITCHED_OFF=$(printf '%s\n%s\n' "$SWITCHED_OFF" "$NEW_OFF" | grep .)
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
# Safer starting values (a lower per-task token limit, words in Activity, Code review at High): written into
# the person's own setup file on a FIRST install only. An update never writes them; an id already in the file is left alone.
if [ "$INSTALLED_BEFORE" = 0 ] && [ "$RETURNING" = 0 ] && [ -f "$HERE/new-install-defaults.json" ]; then
  WROTE=$(app_node "$HERE/scripts/new-install-defaults.mjs" apply "$PROFILE_DIR/cordis.patch.yml" "$HERE/new-install-defaults.json" 2>>"$LOG" | tr '\n' ' ') || true
  if [ -n "$WROTE" ]; then
    NICE=
    for id in $WROTE; do
      case "$id" in
        budget) NICE="$NICE a lower limit per task (Budget);" ;;
        activity) NICE="$NICE words instead of codes in Activity;" ;;
        model-tiers) NICE="$NICE Code review at High effort (Model tiers);" ;;
        modes) NICE="$NICE the code guides off in Chat and Cowork (Modes);" ;;
        settings-plus) NICE="$NICE the Simple settings view and a first-run card;" ;;
        *) NICE="$NICE $id;" ;;
      esac
    done
    say "Safer starting values set:$NICE"
    say "  To change them, open Settings, switch from Simple to Advanced at the top, and use the page named in brackets."
  fi
fi
# Which of those are still off now (the app may have switched one back on while registering).
STILL_OFF=$(app_node -e '
  const fs = require("fs");
  const [file, off] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  for (const name of String(off || "").split("\n").filter(Boolean)) if (!bundles.includes(name)) console.log(name);
  ' "$PROFILE_DIR/package.json" "$SWITCHED_OFF" 2>/dev/null)
LABELS=$(plus_lib labels "$TIERS")
tier_of() { printf '%s\n' "$LABELS" | awk -F'\t' -v f="${1#@local/}" '$1==f {print $2}'; }
printf '%s\n' "$ADDON_LIST" | while IFS="$(printf '\t')" read -r name _folder; do
  tier=$(tier_of "$name")
  if printf '%s\n' "$NEW_OFF" | grep -qxF "$name"; then say "off $name ($tier: copied, switched off until you switch it on)"
  elif printf '%s\n' "$STILL_OFF" | grep -qxF "$name"; then
    if [ -n "$tier" ]; then say "off $name ($tier: switched off; updated and left off)"
    else say "off $name (you switched it off in the app; updated and left off)"; fi
  elif [ -n "$tier" ]; then say "ok  $name ($tier)"
  else say "ok  $name"; fi
done
# Off add-ons that are not Beta or Experimental were switched off by the person; the others are off by design.
OFF_COUNT=$(printf '%s\n' "$STILL_OFF" | grep . | while IFS= read -r n; do [ -z "$(tier_of "$n")" ] && echo x; done | wc -l | tr -d ' ')
NEW_OFF_COUNT=$(printf '%s\n' "$NEW_OFF" | grep -c . || true)
record_shared_folder

step "Done"
if [ "$NEW_OFF_COUNT" -gt 0 ]; then
  say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons; $NEW_OFF_COUNT Beta or Experimental ones are switched off until you switch them on)."
  say "Switch one on in $APP_NAME under Plugins. Beta and Experimental add-ons are labelled as such there."
elif [ "$OFF_COUNT" -gt 0 ]; then
  say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons, $OFF_COUNT of them switched off by you)."
  say "Switch one back on in $APP_NAME under Plugins."
else
  say "$PLUS_NAME $PLUS_VERSION is installed ($COUNT add-ons)."
fi
say "Works with $APP_NAME versions $(supported_range). Yours is $VERSION."
say "Recon (Tor and Usenet research) is a separate download and is not part of this install."
for folder in $KEPT_SEPARATE; do
  if [ "$PRIOR_VERSION" != "$PLUS_VERSION" ]; then
    say ""
    say "IMPORTANT: your Recon is still the OLD one (from Plus ${PRIOR_VERSION:-an earlier release}). This install did not update it."
    say "  It does not have the privacy fixes of Plus $PLUS_VERSION. Until you update it, use it with that in mind."
    say "  To update it: download DS-Harness-Plus-Recon-$PLUS_VERSION.dmg from the Releases page and double-click Install Recon.command in it."
    say "  Its switch (on or off) stays as you had it."
  fi
done
say ""
say "Next:"
say "  1. Open $APP_NAME."
say "  2. Add your models in Settings > Models (API keys or your own server)."
say "  3. Settings opens in a Simple view with a few pages (Start here, Models, Built-in plugins, Agent presets, About Plus)."
say "     For every page of every add-on, click Advanced at the top of Settings. The README's 'First steps' names the pages it means."
say "  4. Read 'First steps' in the README to switch on the add-ons you want."
say ""
say "To undo: run Uninstall.command. Your previous setup is saved in:"
say "  $BACKUP_DIR"

if [ "$REAL_HOME" = 1 ] && ask_yes "Open $APP_NAME now?"; then open -a "$APP"; fi
exit 0
