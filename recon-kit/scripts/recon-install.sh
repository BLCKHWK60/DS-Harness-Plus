#!/bin/bash
# Add Recon (Tor and Usenet research) to an existing DeepSeek Harness Plus install.
#
# It: checks the app and the installed Plus version, shows a warning that you must agree to,
# quits the app if open, backs up the setup, copies Recon next to the other add-ons, registers it,
# leaves it switched OFF, and checks. If any step fails it puts everything back.
#
# Options:
#   --accept     you have read the warning and agree (needed when nothing can be typed, for example in a test)
#   --yes        answer yes to the other questions (it does not accept the warning for you)
#   --profile <name>   another app profile (default: desktop)
#   --help       show this text
set -u

# In the Recon download this folder holds scripts/common.sh. In a git clone the kit sits in recon-kit/ and the shared files
# are one level up, in the project folder (the same layout the Plus installer uses), so both work.
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
[ -f "$HERE/scripts/common.sh" ] || HERE=$(cd "$HERE/.." && pwd -P)
. "$HERE/scripts/common.sh"

PROFILE=desktop
ASSUME_YES=0
ACCEPT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --accept) ACCEPT=1 ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --help|-h) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

FOLDER=dsh-recon
NAME=@local/dsh-recon
KIT_VERSION=$(cat "$HERE/VERSION" 2>/dev/null || echo unknown)
say "$PLUS_NAME: add Recon ($KIT_VERSION)"

step "Checking $APP_NAME and $PLUS_NAME"
find_app
check_version
pick_home
say "App: $APP (version $VERSION; supported $(supported_range))"
[ -f "$ADDONS_DIR/VERSION" ] || fail "$PLUS_NAME is not installed here. Install the main $PLUS_NAME download first, then run this."
PLUS_HAVE=$(cat "$ADDONS_DIR/VERSION")
[ "$PLUS_HAVE" = "$KIT_VERSION" ] || fail "This Recon download is for $PLUS_NAME $KIT_VERSION, and $PLUS_HAVE is installed. Update $PLUS_NAME (or get the matching Recon download) first. Nothing was changed."
[ -f "$HERE/addons/$FOLDER/package.json" ] || fail "This download has no Recon in it."

step "Please read this before you go on"
cat <<'WARN'
Recon reaches the Tor network (.onion sites) and Usenet.
  * Those networks hold material that is illegal or harmful in many countries.
  * You are responsible for what you do with Recon, and for following the laws and the rules that apply
    to you. The makers of Plus are not responsible for how you use it.
  * Recon does not make you anonymous or safe.
  * Privacy: a Recon thread is kept apart from the rest of the app. Logins and VPN files are kept
    in the macOS Keychain, not in a file and not shown to the model. Searches go out through Tor, Usenet
    or the Internet Archive. With a cloud model, what Recon finds is held back until you type /recon cloud.
  * Recon needs the "tor" program (brew install tor). Plus does not install it.
  * Recon is added switched OFF. You switch it on yourself.
WARN
if [ "$ACCEPT" != 1 ]; then
  [ -t 0 ] || fail "Recon can only be added after you agree to the warning. Run this in a Terminal window (double-click Install Recon.command)."
  printf '\nType I AGREE to add Recon, or anything else to stop: '
  read -r answer
  [ "$answer" = "I AGREE" ] || fail "You did not agree, so Recon was not added. Nothing was changed."
fi

make_sure_app_is_closed
step "Backing up your current setup"
backup_profile recon-install
say "Saved to $BACKUP_DIR"

step "Copying Recon"
NEW="$ADDONS_DIR/.dsh-recon.new"
OLD="$ADDONS_DIR/.dsh-recon.old"
rm -rf "$NEW" "$OLD"
ditto "$HERE/addons/$FOLDER" "$NEW" || fail "Could not copy Recon"
find "$NEW" -type d -name test -prune -exec rm -rf {} + 2>/dev/null
WAS_THERE=0
grep -q "\"$NAME\"" "$PROFILE_DIR/package.json" 2>/dev/null && WAS_THERE=1
roll_back() { rm -rf "$ADDONS_DIR/$FOLDER" "$NEW"; [ -d "$OLD" ] && mv "$OLD" "$ADDONS_DIR/$FOLDER"; restore_profile; }
trap 'say ""; say "Interrupted. Putting everything back..."; roll_back; exit 1' INT TERM HUP
[ -d "$ADDONS_DIR/$FOLDER" ] && mv "$ADDONS_DIR/$FOLDER" "$OLD"
mv "$NEW" "$ADDONS_DIR/$FOLDER" || { roll_back; fail "Could not move Recon into place"; }

step "Registering Recon with $APP_NAME"
if ! "$DSH" plugin --profile "$PROFILE" add "$ADDONS_DIR/$FOLDER" >>"$LOG" 2>&1; then
  say "The app's add-on tool reported a problem. Putting everything back..."
  roll_back; tail -15 "$LOG"; fail "Nothing was changed. The full log is in $LOG"
fi
# A new Recon starts switched off. An update keeps whatever it was (on or off).
if [ "$WAS_THERE" = 0 ]; then
  app_node -e '
    const fs = require("fs");
    const [file, name] = process.argv.slice(1);
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles || []).filter((n) => n !== name);
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PROFILE_DIR/package.json" "$NAME" >>"$LOG" 2>&1 || { roll_back; fail "Could not switch Recon off. Nothing was changed."; }
fi
LINKED=$(app_node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const real=(x)=>{try{return fs.realpathSync(x)}catch{return x}};console.log(real(String((p.dependencies||{})[process.argv[2]]||"").replace(/^link:/,""))===real(process.argv[3])?"yes":"no")' "$PROFILE_DIR/package.json" "$NAME" "$ADDONS_DIR/$FOLDER")
[ "$LINKED" = yes ] || { say "Recon did not register."; roll_back; fail "Nothing was changed. The log is in $LOG"; }
trap - INT TERM HUP
rm -rf "$OLD"
# Keep the installer's list of installed files right, so the next Plus update can tell what was changed in place.
if [ -f "$ADDONS_DIR/.installed-files" ]; then
  (cd "$ADDONS_DIR" && { grep -vF "  ./$FOLDER/" .installed-files; find "./$FOLDER" -type f -not -path "*/node_modules/*" -print0 | xargs -0 shasum -a 256; } | sort -k2 >.installed-files.new && mv .installed-files.new .installed-files) 2>/dev/null || true
fi

step "Done"
if [ "$WAS_THERE" = 1 ]; then say "Recon is updated. It is still switched on or off as you had it."
else say "Recon is added and switched OFF."; fi
say ""
say "Next: open $APP_NAME, switch Recon on under Plugins, then set it up in Settings > Recon (click Advanced at the top of Settings first: the Simple view does not list it)."
say "To remove it again: run Uninstall Recon.command. Your setup before this step is saved in:"
say "  $BACKUP_DIR"
if [ "$REAL_HOME" = 1 ] && ask_yes "Open $APP_NAME now?"; then open -a "$APP"; fi
exit 0
