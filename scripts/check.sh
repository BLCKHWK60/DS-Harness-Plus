#!/bin/bash
# For maintainers: check this folder before a release, without touching your real app data.
#   1. runs every add-on's automated tests (with the Node.js inside the app)
#   2. installs, re-installs and uninstalls into a throwaway app-data folder, and after the
#      install checks that the app can compose its setup with all add-ons loaded
#   3. rehearses the Tuner Plus way back (Tuner Plus Way Back.command) in that throwaway folder
#   4. rehearses the Core set / Everything choice, the app-version check, the two download folders
#      (main without Recon; Plus Recon), adding and removing Recon, and the honest uninstall
#      with its optional data removal, all in throwaway folders
# Usage: bash scripts/check.sh
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd -P)
. "$HERE/scripts/common.sh"
find_app
# Even `dsh --version` may create files in the app's data folder, so it is asked inside a throwaway one.
version_home=$(mktemp -d)
DSH_HOME="$version_home" check_version
rm -rf "$version_home"
failed=0

step "Add-on tests"
# Each test file runs on its own with a time limit (DSH_TEST_FILE_LIMIT seconds, default 120; inside it one test may take
# 60 s at most), so one test that never ends stops that file, says which one, and does not hang the whole check.
limit=${DSH_TEST_FILE_LIMIT:-120}
for dir in "$HERE"/addons/*/; do
  set -- "$dir"test/*.test.mjs
  [ -e "$1" ] || continue
  name=$(basename "$dir")
  passed=0; bad=0
  for file in "$dir"test/*.test.mjs; do
    base=$(basename "$file")
    code=0
    (cd "$dir" && run_limited "$limit" app_node --test --test-timeout=60000 "test/$base" >/tmp/plus-check-$$.log 2>&1) || code=$?
    if [ "$code" = 0 ]; then
      passed=$((passed + $(grep -E '^(# |ℹ )pass' /tmp/plus-check-$$.log | awk '{print $NF}')))
    elif [ "$code" = 124 ]; then
      say "FAIL  $name: test/$base did not finish within $limit seconds and was stopped"; tail -15 /tmp/plus-check-$$.log; bad=1
    else
      say "FAIL  $name: test/$base"; tail -30 /tmp/plus-check-$$.log; bad=1
    fi
  done
  if [ "$bad" = 0 ]; then say "ok    $name ($passed passed)"; else failed=1; fi
done
rm -f /tmp/plus-check-$$.log
if (cd "$HERE" && app_node --test scripts/plus-lib.test.mjs >/tmp/plus-lib-$$.log 2>&1); then
  say "ok    installer helpers: supported version range, add-on tiers ($(grep -E '^(# |ℹ )pass' /tmp/plus-lib-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  installer helpers"; tail -30 /tmp/plus-lib-$$.log; failed=1
fi
rm -f /tmp/plus-lib-$$.log
if (cd "$HERE" && app_node --test scripts/new-install-defaults.test.mjs >/tmp/plus-nid-$$.log 2>&1); then
  say "ok    safer starting values for a new install ($(grep -E '^(# |ℹ )pass' /tmp/plus-nid-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  safer starting values"; tail -30 /tmp/plus-nid-$$.log; failed=1
fi
rm -f /tmp/plus-nid-$$.log
if (cd "$HERE" && app_node --test scripts/docs.test.mjs >/tmp/plus-docs-$$.log 2>&1); then
  say "ok    user documents: add-on count, add-on list and tiers, glossary, chat box guide ($(grep -E '^(# |ℹ )pass' /tmp/plus-docs-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  user documents"; tail -30 /tmp/plus-docs-$$.log; failed=1
fi
rm -f /tmp/plus-docs-$$.log
# The shared Settings copy and the pause-while-hidden polling loop (docs/shared/dsh-poll.js) and the pages that use them.
if (cd "$HERE" && app_node --test scripts/dsh-poll.test.mjs >/tmp/plus-poll-$$.log 2>&1); then
  say "ok    page polling: one shared Settings copy, loops that stop while hidden ($(grep -E '^(# |ℹ )pass' /tmp/plus-poll-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  page polling"; tail -30 /tmp/plus-poll-$$.log; failed=1
fi
rm -f /tmp/plus-poll-$$.log
# The master copy of the shared JSON-store helper (docs/shared/json-store.js).
if (cd "$HERE" && app_node --test scripts/json-store.test.mjs >/tmp/plus-jstore-$$.log 2>&1); then
  say "ok    shared JSON-store helper: damaged files kept for good ($(grep -E '^(# |ℹ )pass' /tmp/plus-jstore-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  shared JSON-store helper"; tail -30 /tmp/plus-jstore-$$.log; failed=1
fi
rm -f /tmp/plus-jstore-$$.log
# The merge block copied into ten client files (how a partner's settings part joins its host's page) must stay the same everywhere.
if (cd "$HERE" && app_node --test scripts/dsh-merge.test.mjs >/tmp/plus-merge-$$.log 2>&1); then
  say "ok    merge block: ten copies the same ($(grep -E '^(# |ℹ )pass' /tmp/plus-merge-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  merge block copies differ"; tail -30 /tmp/plus-merge-$$.log; failed=1
fi
rm -f /tmp/plus-merge-$$.log
# Wording slips found in text people read must not come back.
if (cd "$HERE" && app_node --test scripts/text-typos.test.mjs >/tmp/plus-typos-$$.log 2>&1); then
  say "ok    wording slips ($(grep -E '^(# |ℹ )pass' /tmp/plus-typos-$$.log | awk '{print $NF}') passed)"
else
  say "FAIL  wording slips"; tail -30 /tmp/plus-typos-$$.log; failed=1
fi
rm -f /tmp/plus-typos-$$.log

step "Pages"
# Page code that does not parse never loads, and every button it adds goes with it (the Modes
# buttons in a 0.59.0 build: an apostrophe inside a quoted text).
parsed=0
for page in "$HERE"/addons/*/client.js; do
  if ! app_node --check "$page" >/tmp/plus-parse-$$.log 2>&1; then
    say "FAIL  $(basename "$(dirname "$page")")/client.js does not parse"; head -8 /tmp/plus-parse-$$.log; parsed=1
  fi
done
rm -f /tmp/plus-parse-$$.log
[ "$parsed" = 0 ] && say "ok    every page's code parses" || failed=1
# A hook after an early return takes a whole page down (the blank Data settings page of 0.33.0).
if app_node "$HERE/scripts/dev-hook-scan.mjs" "$HERE"/addons/*/client.js; then
  say "ok    no page calls a hook after an early return"
else
  say "FAIL  a page calls a hook after an early return (see the lines above)"; failed=1
fi

# The shared helpers (docs/shared/dsh-kit.js) are copied into pages; a copy that drifted is a bug.
if app_node "$HERE/scripts/sync-kit.mjs" --check; then
  say "ok    shared page helpers match the master copy"
else
  say "FAIL  a shared page helper copy has drifted (run: node scripts/sync-kit.mjs)"; failed=1
fi
# Pages must not restyle each other: one prefix per add-on, no class created by two add-ons, no bare ".title" rule
# (docs/UI-STYLE.md "CSS names"; scripts/css-class-allowlist.json lists the explained exceptions).
if app_node "$HERE/scripts/check-css-classes.mjs" >/tmp/plus-css-$$.log 2>&1 && app_node --test "$HERE/scripts/check-css-classes.test.mjs" "$HERE/scripts/dsh-ui.test.mjs" >>/tmp/plus-css-$$.log 2>&1; then
  say "ok    page CSS names: one prefix per add-on, no class shared by two add-ons; shared page parts"
else
  say "FAIL  page CSS names clash (details below)"; tail -30 /tmp/plus-css-$$.log; failed=1
fi
rm -f /tmp/plus-css-$$.log
# The add-on table in README.md is made from addon-tiers.json.
if app_node "$HERE/scripts/dev-tiers.mjs" --check; then
  say "ok    README add-on table matches addon-tiers.json"
else
  say "FAIL  README add-on table is out of date (run: node scripts/dev-tiers.mjs)"; failed=1
fi
# window.prompt does nothing in the desktop app, and the native confirm/alert cannot be styled or checked there:
# a page uses the in-page question box (dshKit.ask) instead.
if grep -nE "window\.(prompt|confirm|alert)\(" "$HERE"/addons/*/client.js | grep -v "^[^:]*:[0-9]*:[[:space:]]*(//|\*)"; then
  say "FAIL  a page calls window.prompt, confirm or alert (use dshKit.ask)"; failed=1
else
  say "ok    no page calls window.prompt, confirm or alert"
fi

step "Install rehearsal in a throwaway folder"
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export DSH_HOME="$home"
# A throwaway profile from the app's own web template (it has the left sidebar the Cowork sidebar replaces).
"$DSH" --profile check --from-default-profile web --dump-config >"$home/init.log" 2>&1 || { cat "$home/init.log"; fail "could not create a throwaway setup"; }
run() { bash "$HERE/scripts/$1.sh" --profile check --yes "${@:2}" >"$home/$1.log" 2>&1 </dev/null; }
pkg="$home/profiles/check/package.json"
node_p() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/$APP_NAME" -e "$@"; }
# bundled <name>: the add-on is in the list the app loads. linked <name>: it is installed (registered).
bundled() { node_p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(((p.dsh||{}).profile||{}).bundles.includes(process.argv[2])?0:1)' "$pkg" "$1"; }
linked() { node_p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(process.argv[2] in (p.dependencies||{})?0:1)' "$pkg" "$1"; }
# The only warning that is fine: a starting-value row for Budget, Activity or Model Tiers while that add-on is switched off
# (the app treats a missing target as a warning and the row works again when the add-on is switched on).
composes() {
  "$DSH" --profile check --dump-config >"$home/dump.yml" 2>"$home/dump.err" || return 1
  grep -vE 'patch: entry "(budget|activity|model-tiers)" not found$' "$home/dump.err" >"$home/dump.err.rest"; mv "$home/dump.err.rest" "$home/dump.err"
  [ ! -s "$home/dump.err" ]
}
plus="$home/addons/deepseek-harness-plus"
fingerprints() { (cd "$1" && find . -type f -not -name .DS_Store -print0 | xargs -0 shasum -a 256 | sort -k2); }

# 1. First install, no choice given: the Core set. Experimental add-ons are not copied, Beta ones are copied but off,
#    and Recon (its own download) is not there. The app can still compose its setup.
if run install && composes; then
  n=$(grep -c '^# == @local/dsh-' "$home/dump.yml")
  say "ok    install (Core set): $n add-on layers composed"
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
if [ ! -e "$plus/dsh-bench" ] && [ ! -e "$plus/dsh-recon" ] && [ -e "$plus/dsh-modes" ] && linked @local/dsh-content && ! bundled @local/dsh-content \
   && bundled @local/dsh-modes && ! linked @local/dsh-bench && ! linked @local/dsh-recon && [ -f "$plus/addon-tiers.json" ] \
   && grep -q '^off @local/dsh-content (Beta' "$home/install.log"; then
  say "ok    Core set: Experimental add-ons and Recon not installed; Beta ones installed but off; the rest on"
else
  say "FAIL  Core set contents"; tail -25 "$home/install.log"; failed=1
fi
# New-install defaults: written on the first install only, into the person's own setup file.
if "$DSH" --profile check --dump-config 2>/dev/null | grep -q 'maxTokens: 5000000' && grep -q 'Safer starting values set' "$home/install.log"; then
  say "ok    first install: the safer starting values (budget maxTokens 5000000) are in the composed setup"
else
  say "FAIL  first install: safer starting values missing"; tail -15 "$home/install.log"; failed=1
fi
if ! grep -rIl 'dsh-recon' "$home/profiles/check/cordis.patch.yml" >/dev/null 2>&1; then
  say "ok    with Recon absent, the setup file does not mention Recon (no leftover row or reference)"
else
  say "FAIL  the setup file mentions Recon on a Core install"; failed=1
fi

# 2. Everything: the Experimental add-ons are added, off; what was on stays on.
if run install --everything && composes && [ -e "$plus/dsh-bench" ] && linked @local/dsh-bench && ! bundled @local/dsh-bench \
   && ! bundled @local/dsh-split-plus && bundled @local/dsh-modes && ! [ -e "$plus/dsh-recon" ] && grep -q '^off @local/dsh-bench (Experimental' "$home/install.log"; then
  say "ok    Everything: the Experimental add-ons are added and switched off; nothing else changed"
else
  say "FAIL  Everything"; tail -25 "$home/install.log" "$home/dump.err" 2>/dev/null; failed=1
fi

# 3. An update keeps exactly what the owner has: an Experimental add-on switched ON stays on, a Core add-on
#    switched OFF stays off, and a plain update (no flag) adds nothing, switches nothing.
node_p 'const fs=require("fs");const f=process.argv[1];const p=JSON.parse(fs.readFileSync(f,"utf8"));const b=p.dsh.profile.bundles;p.dsh.profile.bundles=b.filter((n)=>n!=="@local/dsh-balance").concat(["@local/dsh-split-plus"]);fs.writeFileSync(f,JSON.stringify(p,null,2));' "$pkg"
before=$(node_p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(p.dsh.profile.bundles.slice().sort().join(","))' "$pkg")
if run install && composes && [ "$(node_p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(p.dsh.profile.bundles.slice().sort().join(","))' "$pkg")" = "$before" ] \
   && grep -q '^off @local/dsh-balance' "$home/install.log" && grep -q 'This is an update' "$home/install.log"; then
  say "ok    an update changes no switch: Core add-on you switched off stays off, Experimental one you switched on stays on"
else
  say "FAIL  update keeps the owner's switches"; tail -25 "$home/install.log"; failed=1
fi
# A value the person saved stays on an update (and an update writes no starting values).
sed -i '' 's/maxTokens: 5000000/maxTokens: 7777777/' "$home/profiles/check/cordis.patch.yml"
if run install && grep -q 'maxTokens: 7777777' "$home/profiles/check/cordis.patch.yml" && ! grep -q 'Safer starting values' "$home/install.log" \
   && ! grep -q 'maxTokens: 5000000' "$home/profiles/check/cordis.patch.yml"; then
  say "ok    an update keeps a saved value and writes no starting values"
else
  say "FAIL  update changed a saved value"; tail -15 "$home/install.log"; failed=1
fi
# Re-running with --core on an install that has Experimental add-ons does not remove or switch them.
if run install --core && [ -e "$plus/dsh-bench" ] && linked @local/dsh-bench && bundled @local/dsh-split-plus; then
  say "ok    --core on an existing install removes nothing"
else
  say "FAIL  --core on an existing install"; tail -20 "$home/install.log"; failed=1
fi

# 4. The app version check: a newer or older app than the supported range is refused, with nothing changed.
fake="$home/fake-app/$APP_NAME.app"
mkdir -p "$fake/Contents/MacOS" "$fake/Contents/Resources/runtime/cli/bin"
printf '#!/bin/bash\nexec "%s/Contents/MacOS/%s" "$@"\n' "$APP" "$APP_NAME" >"$fake/Contents/MacOS/$APP_NAME"
chmod +x "$fake/Contents/MacOS/$APP_NAME"
shas=$(shasum <"$pkg")
for fakeversion in 0.3.0 0.3.7 1.0.0 0.2.1; do
  printf '#!/bin/bash\nif [ "$1" = --version ]; then echo %s; else exec "%s" "$@"; fi\n' "$fakeversion" "$DSH" >"$fake/Contents/Resources/runtime/cli/bin/dsh"
  chmod +x "$fake/Contents/Resources/runtime/cli/bin/dsh"
  if DSH_APP="$fake" bash "$HERE/scripts/install.sh" --profile check --yes >"$home/version.log" 2>&1; then
    say "FAIL  app version $fakeversion was accepted"; failed=1
  elif grep -q "version '$fakeversion'" "$home/version.log" && grep -q "0.2.2 up to, but not including, 0.3.0" "$home/version.log" && [ "$(shasum <"$pkg")" = "$shas" ]; then
    :
  else
    say "FAIL  app version $fakeversion: wrong message or something changed"; tail -12 "$home/version.log"; failed=1
  fi
done
grep -q 'NEWER' "$home/version.log" || true
printf '#!/bin/bash\nif [ "$1" = --version ]; then echo 0.2.9; else exec "%s" "$@"; fi\n' "$DSH" >"$fake/Contents/Resources/runtime/cli/bin/dsh"
if DSH_APP="$fake" bash "$HERE/scripts/install.sh" --profile check --yes >"$home/version.log" 2>&1 && grep -q 'Works with DeepSeek Harness versions 0.2.2 up to, but not including, 0.3.0. Yours is 0.2.9.' "$home/version.log"; then
  say "ok    app version check: 0.2.9 accepted and shown with the range; 0.2.1, 0.3.0, 0.3.7 and 1.0.0 refused, nothing changed"
else
  say "FAIL  app version 0.2.9"; tail -12 "$home/version.log"; failed=1
fi
# An app version that cannot be read is not "older": it gets its own message, and nothing changes.
for fakeversion in garbage ""; do
  printf '#!/bin/bash\nif [ "$1" = --version ]; then echo "%s"; else exec "%s" "$@"; fi\n' "$fakeversion" "$DSH" >"$fake/Contents/Resources/runtime/cli/bin/dsh"
  if DSH_APP="$fake" bash "$HERE/scripts/install.sh" --profile check --yes >"$home/version.log" 2>&1; then
    say "FAIL  an unreadable app version ('$fakeversion') was accepted"; failed=1
  elif grep -q 'Could not read the version' "$home/version.log" && ! grep -q 'OLDER' "$home/version.log" && [ "$(shasum <"$pkg")" = "$shas" ]; then
    :
  else
    say "FAIL  unreadable app version ('$fakeversion'): wrong message or something changed"; tail -8 "$home/version.log"; failed=1
  fi
done
say "ok    app version check: an unreadable version says so (not 'older') and changes nothing"
run install >/dev/null 2>&1 || true

# 5. The two download folders (built from a committed copy of this folder, as build-dmg.sh does), then Recon.
copy="$home/stage-src"
mkdir -p "$copy"
ditto "$HERE" "$copy/repo" && rm -rf "$copy/repo/.git" "$copy/repo/dist"
if (cd "$copy/repo" && git init -q && git add -A && git -c user.name=check -c user.email=check@example.invalid commit -q -m check) \
   && (cd "$copy/repo" && DSH_DMG_STAGE_ONLY="$copy/out" bash scripts/build-dmg.sh >"$home/stage.log" 2>&1); then
  main="$copy/out/main/DeepSeek Harness Plus"; reconkit="$copy/out/recon/DeepSeek Harness Plus Recon"
  if [ ! -e "$main/addons/dsh-recon" ] && [ ! -e "$main/recon-kit" ] && [ -f "$reconkit/addons/dsh-recon/package.json" ] && [ -f "$reconkit/scripts/recon-install.sh" ] \
     && [ ! -e "$reconkit/addons/dsh-modes" ] && [ ! -e "$main/scripts/plus-lib.test.mjs" ] \
     && [ -f "$main/new-install-defaults.json" ] && [ -f "$main/scripts/new-install-defaults.mjs" ] \
     && [ -z "$(find "$main" "$reconkit" \( -name '*.test.mjs' -o -path '*/test/*' \) -not -path '*/node_modules/*' | head -1)" ]; then
    say "ok    download folders: main has no Recon; Plus Recon has Recon and its installer; no maintainer files in either"
  else
    say "FAIL  download folders have the wrong contents"; failed=1
  fi
else
  say "FAIL  building the download folders"; tail -15 "$home/stage.log"; failed=1
fi
# The main folder is the one that gets installed from here on: Core set without Recon works from it.
rr() { bash "$reconkit/scripts/$1.sh" --profile check --yes "${@:2}" >"$home/$1.log" 2>&1 </dev/null; }
if [ -n "${reconkit:-}" ] && [ -d "$reconkit" ]; then
  # Recon: without agreeing, nothing happens.
  if bash "$reconkit/scripts/recon-install.sh" --profile check --yes </dev/null >"$home/recon-no.log" 2>&1; then
    say "FAIL  Recon was added without agreeing to the warning"; failed=1
  elif ! linked @local/dsh-recon && [ ! -e "$plus/dsh-recon" ] && grep -q 'Recon reaches the Tor network' "$home/recon-no.log"; then
    say "ok    Recon: shows the warning, and nothing is added without agreeing"
  else
    say "FAIL  Recon refusal"; tail -10 "$home/recon-no.log"; failed=1
  fi
  # A Recon from another Plus version is refused.
  cp "$plus/VERSION" "$home/plus-version.keep"; echo 0.0.1 >"$plus/VERSION"
  if rr recon-install --accept; then say "FAIL  Recon accepted a Plus of another version"; failed=1; else say "ok    Recon: refused when the installed Plus has another version"; fi
  cp "$home/plus-version.keep" "$plus/VERSION"
  if rr recon-install --accept && linked @local/dsh-recon && ! bundled @local/dsh-recon && [ -f "$plus/dsh-recon/package.json" ] && [ ! -d "$plus/dsh-recon/test" ] && composes && grep -q 'dsh-recon' "$plus/.installed-files"; then
    say "ok    Recon install: added next to Plus, switched off, the setup still composes"
  else
    say "FAIL  Recon install"; tail -20 "$home/recon-install.log"; failed=1
  fi
  # The owner has switched Recon on. A Plus update from the main folder keeps it exactly: on, and its files unchanged.
  node_p 'const fs=require("fs");const f=process.argv[1];const p=JSON.parse(fs.readFileSync(f,"utf8"));p.dsh.profile.bundles.push("@local/dsh-recon");fs.writeFileSync(f,JSON.stringify(p,null,2));' "$pkg"
  recon_before=$(fingerprints "$plus/dsh-recon" | shasum)
  if bash "$main/scripts/install.sh" --profile check --yes >"$home/install-main.log" 2>&1 && linked @local/dsh-recon && bundled @local/dsh-recon \
     && [ "$(fingerprints "$plus/dsh-recon" | shasum)" = "$recon_before" ] && grep -q 'Kept dsh-recon as it is' "$home/install-main.log" && composes; then
    say "ok    updating Plus from the main download keeps an installed Recon: still installed, still on, files unchanged"
  else
    say "FAIL  update with Recon installed"; tail -20 "$home/install-main.log"; failed=1
  fi
  # Recon uninstall: Recon goes, the rest of Plus stays, Recon's data folder stays unless it is asked twice.
  mkdir -p "$home/recon/exports" && echo x >"$home/recon/exports/a.txt"
  if rr recon-uninstall && ! linked @local/dsh-recon && [ ! -e "$plus/dsh-recon" ] && linked @local/dsh-modes && bundled @local/dsh-modes && [ -f "$home/recon/exports/a.txt" ] \
     && grep -q 'What stays' "$home/recon-uninstall.log" && grep -q 'dsh-recon-' "$home/recon-uninstall.log" && composes; then
    say "ok    Recon uninstall: Recon removed, the rest of Plus and Recon's data stay, Keychain note printed"
  else
    say "FAIL  Recon uninstall"; tail -20 "$home/recon-uninstall.log"; failed=1
  fi
  if printf 'y\nno\n' | bash "$reconkit/scripts/recon-uninstall.sh" --profile check --yes --remove-data >"$home/recon-data.log" 2>&1 && [ -f "$home/recon/exports/a.txt" ] \
     && printf 'y\nDELETE\n' | bash "$reconkit/scripts/recon-uninstall.sh" --profile check --yes --remove-data >>"$home/recon-data.log" 2>&1 && [ ! -e "$home/recon" ]; then
    say "ok    Recon data removal: needs y and then DELETE; anything else keeps it"
  else
    say "FAIL  Recon data removal"; tail -20 "$home/recon-data.log"; failed=1
  fi
fi

# Shared settings: --settings records a folder (with a space in its name, as iCloud Drive has); --no-settings clears it.
shared="$home/Shared Plus"
record="$home/shared-settings/folder.txt"
if bash "$HERE/scripts/install.sh" --profile check --yes --everything --settings "$shared/" >"$home/shared.log" 2>&1 \
   && [ -d "$shared" ] && [ "$(cat "$record")" = "$shared" ] \
   && bash "$HERE/scripts/install.sh" --profile check --yes --no-settings >>"$home/shared.log" 2>&1 \
   && [ ! -f "$record" ]; then
  say "ok    shared settings folder: recorded and cleared"
else
  say "FAIL  shared settings folder"; tail -20 "$home/shared.log"; failed=1
fi
# The Tuner Plus way back: over a newer Tuner Plus it puts back exactly the saved 0.1.0, leaves
# Tuner Plus's data and the setup alone, and keeps the installer's record right for the other add-ons.
plus="$home/addons/deepseek-harness-plus"
wayback() { bash "$HERE/scripts/tuner-way-back.sh" --profile check --yes >"$home/wayback.log" 2>&1; }
mkdir -p "$home/tuning/rows" && echo '{"id":"r1"}' >"$home/tuning/rows/code.jsonl" && echo '{"entries":[]}' >"$home/tuning/shelf.json"
data_before=$(fingerprints "$home/tuning" | shasum); setup_before=$(shasum <"$home/profiles/check/package.json")
sed -i '' 's/"version": "[^"]*"/"version": "99.0.0"/' "$plus/dsh-tuning/package.json" && echo '// newer' >>"$plus/dsh-tuning/index.js"
others_before=$(grep -v '  ./dsh-tuning/' "$plus/.installed-files" | sort | shasum)
if wayback && fingerprints "$plus/dsh-tuning" | diff -q - <(sort -k2 "$HERE/extras/way-back/dsh-tuning-0.1.0.sha256") >/dev/null \
   && (cd "$plus" && find ./dsh-tuning -type f -not -path "*/node_modules/*" -print0 | xargs -0 shasum -a 256 | sort -k2) | diff -q - <(grep -F '  ./dsh-tuning/' "$plus/.installed-files" | sort -k2) >/dev/null \
   && [ "$(fingerprints "$home/tuning" | shasum)" = "$data_before" ] && [ "$(shasum <"$home/profiles/check/package.json")" = "$setup_before" ] \
   && [ "$(grep -v '  ./dsh-tuning/' "$plus/.installed-files" | sort | shasum)" = "$others_before" ] \
   && grep -q '99.0.0' "$(ls -d "$home"/backups/deepseek-harness-plus/*-tuner-way-back | tail -1)/dsh-tuning-before/package.json" \
   && wayback && grep -q 'already in place' "$home/wayback.log"; then
  say "ok    Tuner Plus way back: 0.1.0 put back, its data and the setup untouched, the newer one kept in the backup"
else
  say "FAIL  Tuner Plus way back"; tail -20 "$home/wayback.log"; failed=1
fi
run install --everything >/dev/null 2>&1 || true
# Honest uninstall: it says what stays; it removes no data unless asked twice; it never touches the app's
# own folders; and a plain uninstall (with --yes) leaves every data folder alone.
mkdir -p "$home/cowork-shell" "$home/trash/conversations/session-x" "$home/arena" "$home/benchmarks" "$home/skill-architect/skills" "$home/plugins/mine" "$home/devices" "$home/tuning" "$home/sessions" "$home/skills" "$home/shared-settings" "$home/elsewhere"
# The Cowork trash is $DSH_HOME/trash/conversations (where Cowork sidebar really puts it), not a folder inside cowork-shell.
echo '{"conversation":1}' >"$home/trash/conversations/session-x/c.json"; echo r >"$home/tuning/row.jsonl"; echo keep >"$home/sessions/s.json"; echo keep >"$home/skills/k.md"
echo a >"$home/arena/a.json"; echo b >"$home/benchmarks/b.json"; echo learned >"$home/skill-architect/skills/s.md"; echo p >"$home/plugins/mine/p.js"; echo d >"$home/devices/d"; echo x >"$home/cowork-shell/x"
echo keep >"$home/elsewhere/precious.txt"; ln -s "$home/elsewhere" "$home/mission"
echo "$home/Shared Plus" >"$home/shared-settings/folder.txt"
if run uninstall && [ ! -d "$plus" ] && ! grep -q '"@local/dsh-' "$pkg" \
   && grep -q 'What stays on this Mac' "$home/uninstall.log" && grep -q 'cowork-shell (' "$home/uninstall.log" && grep -q 'trash/conversations' "$home/uninstall.log" && grep -q 'skill-architect: the learned skills you approved' "$home/uninstall.log" \
   && grep -q 'arena (' "$home/uninstall.log" && grep -q 'benchmarks (' "$home/uninstall.log" && ! grep -q 'devices (' "$home/uninstall.log" \
   && grep -q 'Keychain' "$home/uninstall.log" && grep -q 'Shared Plus/settings.json' "$home/uninstall.log" \
   && [ -f "$home/trash/conversations/session-x/c.json" ] && [ -f "$home/tuning/row.jsonl" ] && grep -q -- '--remove-data' "$home/uninstall.log"; then
  say "ok    uninstall: add-ons removed; the output says what stays; every data folder is still there"
else
  say "FAIL  uninstall"; tail -30 "$home/uninstall.log"; failed=1
fi
ask() { printf "$1" | bash "$HERE/scripts/uninstall.sh" --profile check --yes --remove-data >"$home/data.log" 2>&1; }
if ask '\n' && [ -f "$home/tuning/row.jsonl" ] && ask 'n\n' && [ -f "$home/tuning/row.jsonl" ] && ask 'y\n\n' && [ -f "$home/tuning/row.jsonl" ] \
   && ask 'y\ndelete\n' && [ -f "$home/tuning/row.jsonl" ] && ask '' && [ -f "$home/tuning/row.jsonl" ] && [ -f "$home/trash/conversations/session-x/c.json" ]; then
  say "ok    data removal: the default is No; a plain y, 'n', 'delete' in lower case or no answer removes nothing"
else
  say "FAIL  data removal removed something it should not"; tail -20 "$home/data.log"; failed=1
fi
if ask 'y\nDELETE\n' && grep -q 'tuning' "$home/data.log" && grep -q 'WARNING: this includes the left panel' "$home/data.log" \
   && [ ! -e "$home/tuning" ] && [ ! -e "$home/cowork-shell" ] && [ ! -e "$home/trash" ] && [ ! -e "$home/arena" ] && [ ! -e "$home/benchmarks" ] \
   && [ -f "$home/skill-architect/skills/s.md" ] && [ -f "$home/plugins/mine/p.js" ] && [ -f "$home/devices/d" ] && [ -f "$home/sessions/s.json" ] && [ -f "$home/skills/k.md" ] && [ -d "$home/backups/deepseek-harness-plus" ] \
   && [ -f "$home/elsewhere/precious.txt" ] && [ -L "$home/mission" ] && [ -f "$home/profiles/check/package.json" ]; then
  say "ok    data removal: after y and DELETE the Plus folders are gone; conversations, skills, backups, the setup and a linked folder are untouched"
else
  say "FAIL  data removal (y then DELETE)"; tail -25 "$home/data.log"; failed=1
fi

# A person who had Plus before (an uninstall left its marker, or only data folders remain) is not a first install:
# no safer starting values, no setup card, no Simple view. A true first install in another folder still gets them.
step "Returning user, Shared settings question, kept Recon"
ret="$home/ret"; mkdir -p "$ret"
mkdir -p "$ret/home"
DSH_HOME="$ret/home" "$DSH" --profile check --from-default-profile web --dump-config >/dev/null 2>&1
cp "$ret/home/profiles/check/cordis.patch.yml" "$ret/patch.pristine"
rrun() { DSH_HOME="$ret/home" bash "$HERE/scripts/$1.sh" --profile check --yes "${@:2}" >"$ret/$1.log" 2>&1 </dev/null; }
rpkg="$ret/home/profiles/check/package.json"
if rrun install && grep -q 'Safer starting values set' "$ret/install.log" && rrun uninstall && [ -f "$ret/home/backups/deepseek-harness-plus/uninstalled.txt" ]; then
  cp "$ret/patch.pristine" "$ret/home/profiles/check/cordis.patch.yml"   # as a pre-1.0 setup that never had the starting values
  if rrun install && grep -q 'Plus was installed on this Mac before' "$ret/install.log" && ! grep -q 'Safer starting values set' "$ret/install.log" \
     && ! grep -q 'setupPending: true' "$ret/home/profiles/check/cordis.patch.yml" && ! grep -q 'maxTokens: 5000000' "$ret/home/profiles/check/cordis.patch.yml"; then
    say "ok    reinstall after an uninstall counts as an update: no starting values, no setup card, no Simple view"
  else
    say "FAIL  reinstall after an uninstall was treated as a first install"; tail -20 "$ret/install.log"; failed=1
  fi
  # Without the marker (an older uninstaller), a Plus data folder tells the same story.
  rrun uninstall; rm -f "$ret/home/backups/deepseek-harness-plus/uninstalled.txt"; mkdir -p "$ret/home/memory"
  cp "$ret/patch.pristine" "$ret/home/profiles/check/cordis.patch.yml"
  if rrun install && grep -q 'Plus was installed on this Mac before' "$ret/install.log" && ! grep -q 'Safer starting values set' "$ret/install.log"; then
    say "ok    returning user found through a Plus data folder alone"
  else
    say "FAIL  returning user without the marker"; tail -10 "$ret/install.log"; failed=1
  fi
else
  say "FAIL  returning-user rehearsal setup"; tail -15 "$ret/install.log"; failed=1
fi
rrun uninstall; rm -rf "$ret/home/memory" "$ret/home/backups"
# Shared settings: --settings with a Core install (the add-on is not installed) saves nothing and says why.
sf="$ret/Shared X"
if rrun install --core --settings "$sf" && [ ! -f "$ret/home/shared-settings/folder.txt" ] && [ ! -d "$sf" ] && grep -q 'Settings sharing was NOT set up' "$ret/install.log"; then
  say "ok    Shared settings: a Core install saves no folder and says Shared settings is not part of it"
else
  say "FAIL  --settings with a Core install saved a folder or stayed silent"; tail -10 "$ret/install.log"; failed=1
fi
if rrun install --everything --settings "$sf" && [ "$(cat "$ret/home/shared-settings/folder.txt" 2>/dev/null)" = "$sf" ] && grep -q 'copied switched OFF' "$ret/install.log"; then
  say "ok    Shared settings: with Everything the folder is saved and the install says it must be switched on"
else
  say "FAIL  --settings with Everything"; tail -10 "$ret/install.log"; failed=1
fi
# The kit also installs from a git clone (the project folder, where the shared files are one level up).
if [ -n "${reconkit:-}" ] && [ -d "$copy/repo/recon-kit" ]; then
  if (cd "$copy/repo" && DSH_HOME="$ret/home" bash recon-kit/scripts/recon-install.sh --profile check --accept </dev/null >"$ret/clone-recon.log" 2>&1) \
     && grep -q '"@local/dsh-recon"' "$rpkg" && [ -f "$ret/home/addons/deepseek-harness-plus/dsh-recon/package.json" ]; then
    say "ok    Recon kit installs from a git clone"
  else
    say "FAIL  Recon kit from a git clone"; tail -12 "$ret/clone-recon.log"; failed=1
  fi
  # An older Recon kept by a newer Plus is called out, with the download to get.
  # (run from the download folder: a git clone carries Recon itself and would update it)
  echo 0.0.1 >"$ret/home/addons/deepseek-harness-plus/VERSION"
  rrun() { DSH_HOME="$ret/home" bash "$main/scripts/$1.sh" --profile check --yes "${@:2}" >"$ret/$1.log" 2>&1 </dev/null; }
  if rrun install && grep -q 'IMPORTANT: your Recon is still the OLD one' "$ret/install.log" && grep -q 'DS-Harness-Plus-Recon-' "$ret/install.log" \
     && grep -q '"@local/dsh-recon"' "$rpkg"; then
    rrun install
    if ! grep -q 'IMPORTANT: your Recon' "$ret/install.log"; then
      say "ok    a kept older Recon ends the install with a clear warning naming the Recon download; none when it is current"
    else
      say "FAIL  the Recon warning shows although Recon is current"; failed=1
    fi
  else
    say "FAIL  no warning for an older kept Recon"; tail -15 "$ret/install.log"; failed=1
  fi
fi

[ "$failed" = 0 ] && { step "All checks passed"; exit 0; } || { step "SOME CHECKS FAILED"; exit 1; }
