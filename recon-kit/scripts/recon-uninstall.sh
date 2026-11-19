#!/bin/bash
# Remove Recon from DeepSeek Harness Plus. The rest of Plus is not touched.
#
# It prints what stays (Recon's data folder, Keychain logins) and can, as an optional last step,
# remove Recon's data folder: it shows the size, asks twice, and the default is No.
#
# Options:
#   --yes            answer yes to the questions (it never answers the data step)
#   --profile <name> another app profile (default: desktop)
#   --remove-data    go on to the optional data step (answers are read from the keyboard)
#   --help           show this text
set -u

# In the Recon download this folder holds scripts/common.sh. In a git clone the kit sits in recon-kit/ and the shared files
# are one level up, in the project folder (the same layout the Plus installer uses), so both work.
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
[ -f "$HERE/scripts/common.sh" ] || HERE=$(cd "$HERE/.." && pwd -P)
. "$HERE/scripts/common.sh"

PROFILE=desktop
ASSUME_YES=0
REMOVE_DATA=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --remove-data) REMOVE_DATA=1 ;;
    --profile) shift; PROFILE=${1:?--profile needs a name} ;;
    --help|-h) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

FOLDER=dsh-recon
NAME=@local/dsh-recon
say "$PLUS_NAME: remove Recon"
step "Checking $APP_NAME"
find_app
pick_home
REGISTERED=0
grep -q "\"$NAME\"" "$PROFILE_DIR/package.json" 2>/dev/null && REGISTERED=1
if [ "$REGISTERED" = 0 ] && [ ! -d "$ADDONS_DIR/$FOLDER" ]; then
  say "Recon is not installed."
else
  make_sure_app_is_closed
  ask_yes "Remove Recon from $APP_NAME?" || fail "Nothing was changed."
  step "Backing up your current setup"
  backup_profile recon-uninstall
  say "Saved to $BACKUP_DIR"
  if [ "$REGISTERED" = 1 ]; then
    step "Unregistering Recon"
    if ! "$DSH" plugin --profile "$PROFILE" remove "$NAME" >>"$LOG" 2>&1; then
      say "The app's add-on tool reported a problem. Putting everything back..."
      restore_profile; tail -15 "$LOG"; fail "Nothing was changed. The full log is in $LOG"
    fi
  fi
  step "Deleting Recon's files"
  rm -rf "${ADDONS_DIR:?}/$FOLDER"
  if [ -f "$ADDONS_DIR/.installed-files" ]; then
    (cd "$ADDONS_DIR" && grep -vF "  ./$FOLDER/" .installed-files | sort -k2 >.installed-files.new && mv .installed-files.new .installed-files) 2>/dev/null || true
  fi
  say "Recon is removed. The rest of $PLUS_NAME is untouched. Your setup from before is saved in:"
  say "  $BACKUP_DIR"
fi

say ""
say "What stays on this Mac, and why:"
[ -d "$DSH_HOME/recon" ] && say "  - Recon's data folder ($DSH_HOME/recon): your exports and notes. Installing Recon again picks them up."
say "  - Passwords in the macOS Keychain. This never deletes Keychain items. Recon's are named \"dsh-recon-...\" (Usenet logins)"
say "    and \"dsh-recon-wg-...\" (VPN files). Open the Keychain Access app and search for dsh-recon, or in Terminal:"
say "    security delete-generic-password -s <name>"
say "  - Recon's temporary room in /private/tmp (dsh-recon-room). The system clears the temporary folder by itself."
say "  - Anything you exported out of Recon into your own folders."
DATA=$(printf 'recon\tRecon exports, notes and settings\n')
[ -d "$DSH_HOME/recon" ] && [ ! -L "$DSH_HOME/recon" ] && offer_data_removal "$DATA"
exit 0
