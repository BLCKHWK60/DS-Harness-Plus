#!/bin/bash
# For maintainers: check this folder before a release, without touching your real app data.
#   1. runs every add-on's automated tests (with the Node.js inside the app)
#   2. installs, re-installs and uninstalls into a throwaway app-data folder, and after the
#      install checks that the app can compose its setup with all add-ons loaded
# Usage: bash scripts/check.sh
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
. "$HERE/scripts/common.sh"
find_app
check_version
failed=0

step "Add-on tests"
for dir in "$HERE"/addons/*/; do
  set -- "$dir"test/*.test.mjs
  [ -e "$1" ] || continue
  name=$(basename "$dir")
  if (cd "$dir" && app_node --test test/*.test.mjs >/tmp/plus-check-$$.log 2>&1); then
    say "ok    $name ($(grep -E '^(# |ℹ )pass' /tmp/plus-check-$$.log | awk '{print $NF}') passed)"
  else
    say "FAIL  $name"; tail -30 /tmp/plus-check-$$.log; failed=1
  fi
done
rm -f /tmp/plus-check-$$.log

step "Pages"
# A hook after an early return takes a whole page down (the blank Data settings page of 0.33.0).
if app_node "$HERE/scripts/dev-hook-scan.mjs" "$HERE"/addons/*/client.js; then
  say "ok    no page calls a hook after an early return"
else
  say "FAIL  a page calls a hook after an early return (see the lines above)"; failed=1
fi

step "Install rehearsal in a throwaway folder"
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export DSH_HOME="$home"
# A throwaway profile from the app's own web template (it has the left sidebar the Cowork sidebar replaces).
"$DSH" --profile check --from-default-profile web --dump-config >"$home/init.log" 2>&1 || { cat "$home/init.log"; fail "could not create a throwaway setup"; }
run() { bash "$HERE/scripts/$1.sh" --profile check --yes >"$home/$1.log" 2>&1; }
if run install && "$DSH" --profile check --dump-config >"$home/dump.yml" 2>"$home/dump.err"; then
  n=$(grep -c '^# == @local/dsh-' "$home/dump.yml")
  say "ok    install: $n add-on layers composed"
  [ -s "$home/dump.err" ] && { say "warnings:"; cat "$home/dump.err"; failed=1; }
  # The Cowork sidebar rule: the app's own sidebar is switched off, and the Cowork row carries its guard.
  if awk '/^- id: ui-sidebar$/{f=1;next} f&&/^- /{exit} f&&/disabled: true/{ok=1} END{exit !ok}' "$home/dump.yml" \
     && grep -A3 '^- id: cowork-shell$' "$home/dump.yml" | grep -q 'disabled: !!js'; then
    say "ok    sidebar rule: app sidebar off, Cowork sidebar guarded"
  else
    say "FAIL  sidebar rule missing from the composed setup"; failed=1
  fi
else
  say "FAIL  install"; cat "$home/install.log" "$home/dump.err" 2>/dev/null | tail -30; failed=1
fi
run install && say "ok    re-install (update)" || { say "FAIL  re-install"; tail -20 "$home/install.log"; failed=1; }
# An add-on the owner switched off in the app (still linked, no longer in the list the app loads)
# must not stop an update, and must stay off.
off_pkg="$home/profiles/check/package.json"
bundled() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/$APP_NAME" -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(((p.dsh||{}).profile||{}).bundles.includes(process.argv[2])?0:1)' "$off_pkg" "$1"; }
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/$APP_NAME" -e 'const fs=require("fs");const f=process.argv[1];const p=JSON.parse(fs.readFileSync(f,"utf8"));p.dsh.profile.bundles=p.dsh.profile.bundles.filter((n)=>n!=="@local/dsh-notify");fs.writeFileSync(f,JSON.stringify(p,null,2));' "$off_pkg"
if run install && ! bundled @local/dsh-notify && bundled @local/dsh-modes && grep -q '^off @local/dsh-notify' "$home/install.log" && grep -q '1 of them switched off by you' "$home/install.log"; then
  say "ok    an add-on switched off in the app stays off, and the update goes through"
else
  say "FAIL  update with an add-on switched off"; tail -20 "$home/install.log"; failed=1
fi
# Shared settings: --settings records a folder (with a space in its name, as iCloud Drive has); --no-settings clears it.
shared="$home/Shared Plus"
record="$home/shared-settings/folder.txt"
if bash "$HERE/scripts/install.sh" --profile check --yes --settings "$shared/" >"$home/shared.log" 2>&1 \
   && [ -d "$shared" ] && [ "$(cat "$record")" = "$shared" ] \
   && bash "$HERE/scripts/install.sh" --profile check --yes --no-settings >>"$home/shared.log" 2>&1 \
   && [ ! -f "$record" ]; then
  say "ok    shared settings folder: recorded and cleared"
else
  say "FAIL  shared settings folder"; tail -20 "$home/shared.log"; failed=1
fi
if run uninstall && [ ! -d "$home/addons/deepseek-harness-plus" ] && ! grep -q '"@local/dsh-' "$home/profiles/check/package.json"; then
  say "ok    uninstall"
else
  say "FAIL  uninstall"; tail -20 "$home/uninstall.log"; failed=1
fi

[ "$failed" = 0 ] && { step "All checks passed"; exit 0; } || { step "SOME CHECKS FAILED"; exit 1; }
