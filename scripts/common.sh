#!/bin/bash
# Shared helpers for install.sh and uninstall.sh. Not meant to be run on its own.

PLUS_NAME="DeepSeek Harness Plus"
APP_NAME="DeepSeek Harness"

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

# Ask a yes/no question. Default answer is yes. With --yes, always yes.
ask_yes() {
  [ "${ASSUME_YES:-0}" = 1 ] && return 0
  [ -t 0 ] || return 1
  printf '%s [Y/n] ' "$1"
  read -r answer
  case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

find_app() {
  if [ -n "${DSH_APP:-}" ]; then APP="$DSH_APP"
  elif [ -d "/Applications/$APP_NAME.app" ]; then APP="/Applications/$APP_NAME.app"
  elif [ -d "$HOME/Applications/$APP_NAME.app" ]; then APP="$HOME/Applications/$APP_NAME.app"
  else
    fail "$APP_NAME is not installed. Install the app first (drag it into Applications), open it once, then run this again."
  fi
  DSH="$APP/Contents/Resources/runtime/cli/bin/dsh"
  [ -x "$DSH" ] || fail "Could not find the command-line tool inside $APP. Is this the official $APP_NAME app?"
}

# Run JavaScript with the Node.js that ships inside the app (no separate install needed).
app_node() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/$APP_NAME" "$@"; }

# Stop a process and everything it started (children first). Only by process number, never by name.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

# run_limited SECONDS COMMAND...: run a command; if it is still running after SECONDS, stop it (and what it started)
# and return 124. Used so one test that never ends cannot hang scripts/check.sh. Otherwise returns the command's own result.
run_limited() {
  local limit=$1; shift
  local flag; flag=$(mktemp)
  "$@" & local pid=$!
  ( sleep "$limit"; if kill -0 "$pid" 2>/dev/null; then echo stopped >"$flag"; kill_tree "$pid"; fi ) >/dev/null 2>&1 &
  local dog=$!
  local code=0
  wait "$pid" || code=$?
  kill "$dog" 2>/dev/null || true
  wait "$dog" 2>/dev/null || true
  if [ -s "$flag" ]; then rm -f "$flag"; return 124; fi
  rm -f "$flag"
  return "$code"
}

# Run one of the helper commands in plus-lib.mjs (the supported app range, the add-on plan).
plus_lib() { app_node "$HERE/scripts/plus-lib.mjs" "$@"; }

# The supported app range is written once, in addon-tiers.json (the add-ons' own "engines" say the same).
supported_range() { app_node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).supportedApp;console.log(r.min+" up to, but not including, "+r.below)' "$HERE/addon-tiers.json"; }

# The add-ons were written for one range of app versions. A version outside it is refused here, in plain words.
check_version() {
  VERSION=$("$DSH" --version 2>/dev/null | tail -1)
  RANGE=$(supported_range)
  if ! plus_lib range "$VERSION" "$HERE/addon-tiers.json"; then
    if [ "$(plus_lib version-state "$VERSION")" = unreadable ]; then
      say "Could not read the version of your $APP_NAME (the app answered '$VERSION')."
      say "This release of $PLUS_NAME is written for versions $RANGE."
      say ""
      say "Nothing was changed. Is this the official $APP_NAME app, installed from its own download? Open it once, quit it, then run this again."
      fail "The app version could not be read (nothing was changed)."
    fi
    say "Your $APP_NAME is version '$VERSION'."
    say "This release of $PLUS_NAME is written for versions $RANGE."
    say ""
    case "$VERSION" in
      0.[3-9]*|0.[1-9][0-9]*|[1-9]*)
        say "Your app is NEWER than this release knows. Nothing was changed. Do not install over it:"
        say "  - The add-ons have not been tested with this app version, and the app may switch them off."
        say "  - If you already updated the app and the add-ons are off, your conversations and settings are still there."
        say "  - Look for a newer $PLUS_NAME release made for your app version. See \"When the app updates\" in the README." ;;
      *)
        say "Your app is OLDER than this release needs. Update $APP_NAME, then run this again." ;;
    esac
    fail "The app version is not supported (nothing was changed)."
  fi
}

# Where the app keeps its data. Only the default location is the one the app itself uses.
pick_home() {
  # The real data folder in any spelling ("~/.dsh/", a link to it): compared by the real path.
  local usual="$HOME/.dsh" here=""
  [ -n "${DSH_HOME:-}" ] && here=$(cd "$DSH_HOME" 2>/dev/null && pwd -P)
  if [ -z "${DSH_HOME:-}" ] || [ "$DSH_HOME" = "$usual" ] || { [ -n "$here" ] && [ "$here" = "$(cd "$usual" 2>/dev/null && pwd -P)" ]; }; then
    DSH_HOME="$usual"; REAL_HOME=1
  else
    REAL_HOME=0
  fi
  export DSH_HOME
  PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
  ADDONS_DIR="$DSH_HOME/addons/deepseek-harness-plus"
  [ -f "$PROFILE_DIR/package.json" ] || fail "No '$PROFILE' setup found in $DSH_HOME. Open $APP_NAME once (so it creates its settings), quit it, then run this again."
}

app_running() { [ "$(osascript -e "application \"$APP_NAME\" is running" 2>/dev/null)" = "true" ]; }

# The app must be closed while add-ons change. Only matters for the real app data folder.
make_sure_app_is_closed() {
  [ "$REAL_HOME" = 1 ] || return 0
  app_running || return 0
  say "$APP_NAME is open. It has to be closed while add-ons are changed."
  ask_yes "Quit $APP_NAME now?" || fail "Quit $APP_NAME, then run this again."
  osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1
  for _ in $(seq 1 30); do app_running || return 0; sleep 1; done
  fail "$APP_NAME did not quit. Quit it yourself, then run this again."
}

# Copy the setup files that will change, so any step can be undone.
backup_profile() {
  BACKUP_DIR="$DSH_HOME/backups/deepseek-harness-plus/$(date +%Y%m%d-%H%M%S)-$1"
  mkdir -p "$BACKUP_DIR" || fail "Could not create the backup folder $BACKUP_DIR"
  chmod 700 "$DSH_HOME/backups" "$DSH_HOME/backups/deepseek-harness-plus" "$BACKUP_DIR"
  for f in package.json pnpm-lock.yaml pnpm-workspace.yaml cordis.patch.yml cordis.yml; do
    [ -f "$PROFILE_DIR/$f" ] && cp -p "$PROFILE_DIR/$f" "$BACKUP_DIR/$f"
  done
  LOG="$BACKUP_DIR/log.txt"
  : >"$LOG"
}

# Put the backed-up setup files back and let the app's package tool re-sync.
restore_profile() {
  for f in package.json pnpm-lock.yaml; do
    if [ -f "$BACKUP_DIR/$f" ]; then cp -p "$BACKUP_DIR/$f" "$PROFILE_DIR/$f"; else rm -f "$PROFILE_DIR/$f"; fi
  done
  "$DSH" plugin --profile "$PROFILE" install >>"$LOG" 2>&1 || true
}

# Package name of every add-on folder in a directory, one "name<TAB>folder" per line.
list_addons() {
  app_node -e '
    const fs = require("fs"), path = require("path");
    const dir = process.argv[1];
    for (const entry of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, entry, "package.json");
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      if (pkg.dsh && pkg.dsh.bundle) console.log(pkg.name + "\t" + path.join(dir, entry));
    }' "$1"
}

# Plus add-ons the setup lists (linked into the Plus folder) that are not in the given list.
# Args: package.json, Plus add-on folder, "name<TAB>folder" lines. Prints one name per line.
stale_addons() {
  app_node -e '
    const fs = require("fs"), path = require("path");
    const [file, dir, list] = process.argv.slice(1);
    const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
    const keep = new Set(list.split("\n").filter(Boolean).map((line) => line.split("\t")[0]));
    const root = real(dir) + path.sep;
    const deps = JSON.parse(fs.readFileSync(file, "utf8")).dependencies || {};
    for (const [name, spec] of Object.entries(deps)) {
      const linked = String(spec).startsWith("link:") ? String(spec).slice(5) : "";
      if (!linked || keep.has(name)) continue;
      const parent = real(path.dirname(linked)) + path.sep;
      if (parent === root || real(linked).startsWith(root)) console.log(name);
    }' "$1" "$2" "$3"
}

# Ask a yes/no question whose default answer is no. --yes does not answer it.
ask_no() {
  [ -t 0 ] || return 1
  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# Shared settings: where the folder choice is recorded for the Shared settings add-on.
ICLOUD_DRIVE="$HOME/Library/Mobile Documents/com~apple~CloudDocs"

# Settle SHARE (from --settings / --no-settings, or by asking once) before anything changes.
# SHARE ends up empty (leave as is), "-" (switch off) or an absolute folder.
# SHARED_WILL_INSTALL is 1 only when the Shared settings add-on is part of this install (already installed, or
# chosen with Everything). Otherwise nothing is asked and a folder is never saved: the add-on would not be there to use it.
choose_shared_folder() {
  SHARED_RECORD="$DSH_HOME/shared-settings/folder.txt"
  [ "$SHARE" = - ] && return 0
  if [ -z "$SHARE" ]; then
    # Ask only when someone is at the keyboard, the add-on will be installed, nothing is set up yet and iCloud Drive is on.
    [ "${ASSUME_YES:-0}" = 1 ] && return 0
    [ "${SHARED_WILL_INSTALL:-0}" = 1 ] || return 0
    [ -t 0 ] && [ ! -f "$SHARED_RECORD" ] && [ -d "$ICLOUD_DRIVE" ] || return 0
    say ""
    say "Optional, Experimental (tried only on one Mac so far): keep your Plus settings (modes, tiers, tabs, colours) the same on your other Mac,"
    say "through a file in iCloud Drive. Secrets such as API keys are never put in it."
    say "The Shared settings add-on is copied but switched off: it only works once you switch it on in $APP_NAME under Plugins."
    ask_no "Share settings through iCloud Drive?" || return 0
    SHARE="$ICLOUD_DRIVE/DeepSeek Harness Plus"
  fi
  if [ "${SHARED_WILL_INSTALL:-0}" != 1 ]; then
    say ""
    say "Settings sharing was NOT set up: the Shared settings add-on (Experimental) is not part of this install, so nothing would use the folder."
    say "To use it, run the installer again with --everything and --settings, then switch Shared settings on in $APP_NAME under Plugins."
    SHARE=
    return 0
  fi
  case "$SHARE" in "~"|"~/"*) SHARE="$HOME${SHARE#\~}" ;; esac
  case "$SHARE" in /*) ;; *) fail "--settings needs a full folder path (starting with / or ~/), not '$SHARE'." ;; esac
  while [ "${SHARE%/}" != "$SHARE" ] && [ "$SHARE" != / ]; do SHARE=${SHARE%/}; done
  say "Shared settings folder: $SHARE"
}

# After a successful install: record (or clear) the folder. A problem here only warns.
record_shared_folder() {
  [ -n "$SHARE" ] || return 0
  if [ "$SHARE" = - ]; then
    rm -f "$SHARED_RECORD"
    say "Settings sharing is off on this Mac. The shared file itself was left alone."
    return 0
  fi
  if ! mkdir -p "$SHARE" || ! mkdir -p "$(dirname "$SHARED_RECORD")" || ! printf '%s\n' "$SHARE" >"$SHARED_RECORD"; then
    say "WARNING: could not set up $SHARE; settings sharing was not switched on."
    return 0
  fi
  if [ -f "$SHARE/settings.json" ]; then
    say "Shared settings is Experimental and copied switched OFF: switch it on in $APP_NAME under Plugins first."
    say "Shared settings: once it is on and $APP_NAME opens, this Mac takes the settings in"
    say "  $SHARE/settings.json"
    say "  (its own current settings are backed up first, in $DSH_HOME/shared-settings/backups)."
  else
    say "Shared settings is Experimental and copied switched OFF: switch it on in $APP_NAME under Plugins first."
    say "Shared settings: once it is on and $APP_NAME opens, this Mac's settings are written to"
    say "  $SHARE/settings.json"
    say "  On your other Mac, run the installer with the same folder."
  fi
}

# ---- What an uninstall leaves behind, and the optional "also remove my Plus data" step -------------

# The size of a folder, as a short text such as "12M".
folder_size() { du -sh "$1" 2>/dev/null | cut -f1 | tr -d ' '; }

# Print what stays on this Mac after an uninstall, and why. Nothing here is deleted.
# Args: the Plus data folders that exist, as "folder<TAB>what" lines (may be empty).
print_what_stays() {
  say ""
  say "What stays on this Mac, and why:"
  say "  - Your conversations and your models. They belong to $APP_NAME, not to Plus."
  say "  - Your skills ($DSH_HOME/skills)."
  local kept; kept=$(plus_lib kept "$HERE/addon-tiers.json" "$DSH_HOME" 2>/dev/null)
  if [ -n "$kept" ]; then
    printf '%s\n' "$kept" | while IFS="$(printf '\t')" read -r folder what; do
      [ -n "$folder" ] && say "  - $DSH_HOME/$folder: $what."
    done
  fi
  say "  - Settings you wrote into the setup file ($PROFILE_DIR/cordis.patch.yml). They do nothing now;"
  say "    installing Plus again brings them back into effect."
  if [ -n "${1:-}" ]; then
    say "  - Plus's own data folders in $DSH_HOME. They hold your work with the add-ons, so a later install picks it up:"
    printf '%s\n' "$1" | while IFS="$(printf '\t')" read -r folder what; do
      [ -n "$folder" ] && say "      $folder ($(folder_size "$DSH_HOME/$folder")): $what"
    done
    if printf '%s\n' "$1" | cut -f1 | grep -qx 'trash'; then
      say "    The conversations you deleted in the Cowork sidebar are kept in $DSH_HOME/trash/conversations."
      say "    The app cannot show them without Plus. To get one back, install Plus again and use the Trash."
    fi
  else
    say "  - Plus's own data folders: none found."
  fi
  say "  - The saved copies of your setup in $DSH_HOME/backups/deepseek-harness-plus. They let you undo."
  if [ -f "$DSH_HOME/shared-settings/folder.txt" ]; then
    say "  - The settings file you share between Macs: $(head -1 "$DSH_HOME/shared-settings/folder.txt")/settings.json"
    say "    It lives outside the app's folder (for example in iCloud Drive) and other Macs may still use it. Delete it yourself if you want it gone."
  fi
  say "  - Passwords in the macOS Keychain. Plus never deletes Keychain items. Recon's logins are named"
  say "    \"dsh-recon-...\"; Devices may keep device passwords there too. To remove one, open the Keychain Access"
  say "    app and search for its name, or in Terminal: security delete-generic-password -s <name>"
  say "  - Files that add-ons made in your own project folders (for example Mission checkpoints, Artifacts, Content drafts)."
}

# Ask a question that is answered from the keyboard (or, only when --remove-data was given, from
# standard input, which is how the self-check answers it). No answer means no.
data_answer() {
  local answer=
  if [ -t 0 ] || [ "${REMOVE_DATA:-0}" = 1 ]; then printf '%s ' "$1" >&2; read -r answer || answer=; fi
  printf '%s' "$answer"
}

# The optional last step: remove Plus's own data folders. Asks twice, names every folder with its size,
# and the default is No. --yes never answers it. Only folders that sit directly in the app data folder,
# are real folders (not links) and are on the list in addon-tiers.json are ever removed.
# Args: the folders, as "folder<TAB>what" lines.
offer_data_removal() {
  local list="$1"
  [ -n "$list" ] || return 0
  [ -n "${DSH_HOME:-}" ] || return 0
  if ! [ -t 0 ] && [ "${REMOVE_DATA:-0}" != 1 ]; then
    say ""
    say "Your Plus data folders were left in place. To remove them later, run:  bash scripts/uninstall.sh --remove-data"
    return 0
  fi
  step "Optional: also remove my Plus data"
  say "These folders hold your work with the add-ons. Removing them CANNOT be undone:"
  printf '%s\n' "$list" | while IFS="$(printf '\t')" read -r folder what; do
    [ -n "$folder" ] && say "  $(folder_size "$DSH_HOME/$folder")  $DSH_HOME/$folder"
  done
  say "Not removed in any case: your conversations, skills (learned skills you approved too), plugins, models, the saved setup copies, the Keychain, and files outside the app's folder."
  if printf '%s\n' "$list" | cut -f1 | grep -qx 'trash'; then
    say "WARNING: this includes the Cowork trash ($DSH_HOME/trash), so conversations you deleted there are gone for good."
  fi
  local one two
  one=$(data_answer "Remove these folders? [y/N]")
  case "$one" in [yY]|[yY][eE][sS]) ;; *) say "Nothing was removed. Your data is untouched."; return 0 ;; esac
  two=$(data_answer "Are you sure? Type DELETE (capital letters) to remove them, anything else cancels:")
  if [ "$two" != DELETE ]; then say "Nothing was removed. Your data is untouched."; return 0; fi
  printf '%s\n' "$list" | while IFS="$(printf '\t')" read -r folder _what; do
    case "$folder" in ""|*[!a-z0-9-]*) continue ;; esac
    if [ -d "$DSH_HOME/$folder" ] && [ ! -L "$DSH_HOME/$folder" ]; then
      rm -rf "${DSH_HOME:?}/$folder" && say "Removed $DSH_HOME/$folder"
    fi
  done
}
