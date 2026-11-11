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

# The add-ons were written for app version 0.2.x (0.2.2 or newer).
check_version() {
  VERSION=$("$DSH" --version 2>/dev/null | tail -1)
  case "$VERSION" in
    0.2.[2-9]*|0.2.[1-9][0-9]*) ;;
    *) fail "Your $APP_NAME is version '$VERSION'. This release of $PLUS_NAME works with version 0.2.2 up to (not including) 0.3. Check for a newer $PLUS_NAME release." ;;
  esac
}

# Where the app keeps its data. Only the default location is the one the app itself uses.
pick_home() {
  if [ -z "${DSH_HOME:-}" ] || [ "$DSH_HOME" = "$HOME/.dsh" ]; then
    DSH_HOME="$HOME/.dsh"; REAL_HOME=1
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
choose_shared_folder() {
  SHARED_RECORD="$DSH_HOME/shared-settings/folder.txt"
  [ "$SHARE" = - ] && return 0
  if [ -z "$SHARE" ]; then
    # Ask only when someone is at the keyboard, nothing is set up yet and iCloud Drive is on.
    [ "${ASSUME_YES:-0}" = 1 ] && return 0
    [ -t 0 ] && [ ! -f "$SHARED_RECORD" ] && [ -d "$ICLOUD_DRIVE" ] || return 0
    say ""
    say "Optional: keep your Plus settings (modes, tiers, tabs, colours) the same on your other Mac,"
    say "through a file in iCloud Drive. Secrets such as API keys are never put in it."
    ask_no "Share settings through iCloud Drive?" || return 0
    SHARE="$ICLOUD_DRIVE/DeepSeek Harness Plus"
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
    say "Shared settings: when $APP_NAME opens, this Mac takes the settings in"
    say "  $SHARE/settings.json"
    say "  (its own current settings are backed up first, in $DSH_HOME/shared-settings/backups)."
  else
    say "Shared settings: when $APP_NAME opens, this Mac's settings are written to"
    say "  $SHARE/settings.json"
    say "  On your other Mac, run the installer with the same folder."
  fi
}
