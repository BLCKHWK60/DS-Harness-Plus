#!/bin/sh
# Test dsh-backup.sh on a made-up dsh home in a temp folder. Never touches ~/.dsh.
# Usage: check.sh        (exit 0 when every check passes)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
script="$here/dsh-backup.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
check() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc"; fi; }
nocheck() { desc=$1; shift; if "$@" >/dev/null 2>&1; then bad "$desc"; else ok "$desc"; fi; }

src="$tmp/home"; dest="$tmp/out"
mkdir -p "$src/sessions" "$src/storages" "$src/attachments" "$src/dsh-runtimes/x" "$src/profiles/desktop/node_modules/pkg" "$src/profiles/desktop/sub/node_modules/deep"
echo "log" >"$src/sessions/a.jsonl"
echo "{}" >"$src/storages/workspace.json"
echo "small" >"$src/attachments/small.bin"
dd if=/dev/zero of="$src/attachments/big[1].bin" bs=1048576 count=3 2>/dev/null
echo "runtime" >"$src/dsh-runtimes/x/r"
echo "mod" >"$src/profiles/desktop/node_modules/pkg/i.js"
echo "mod" >"$src/profiles/desktop/sub/node_modules/deep/i.js"
echo "token: FAKE-SECRET-VALUE" >"$src/profiles/desktop/cordis.patch.yml"
echo "x: 1" >"$src/profiles/desktop/cordis.yml"
echo "{}" >"$src/profiles/desktop/package.json"
echo "lock" >"$src/profiles/desktop/pnpm-lock.yaml"
before=$(cd "$src" && find . -type f -exec cksum {} + | sort | cksum)

DSH_BACKUP_DATE=2026-01-05 sh "$script" --source "$src" --dest "$dest" --keep 3 --max-attachment-mb 1 >"$tmp/run1.txt" 2>&1 || { cat "$tmp/run1.txt"; bad "first run"; }
b="$dest/dsh-2026-01-05"
check "creates dsh-YYYY-MM-DD" test -d "$b"
check "copies sessions and storages" test -f "$b/sessions/a.jsonl" -a -f "$b/storages/workspace.json"
check "copies small attachment" test -f "$b/attachments/small.bin"
nocheck "leaves out attachment over the limit (name with brackets)" test -e "$b/attachments/big[1].bin"
nocheck "leaves out dsh-runtimes" test -e "$b/dsh-runtimes"
nocheck "leaves out node_modules (top and nested)" sh -c "find '$b' -name node_modules | grep -q ."
nocheck "leaves out profile config files" sh -c "test -e '$b/profiles/desktop/cordis.patch.yml' -o -e '$b/profiles/desktop/cordis.yml' -o -e '$b/profiles/desktop/package.json'"
nocheck "the fake secret is nowhere in the backup" sh -c "grep -rq FAKE-SECRET-VALUE '$b'"
check "keeps non-secret profile files" test -f "$b/profiles/desktop/pnpm-lock.yaml"
check "writes BACKUP-INFO.txt" grep -q "profile config files" "$b/BACKUP-INFO.txt"
check "no partial or lock left" sh -c "test -z \"\$(ls -A '$dest' | grep -E 'partial|lock')\""
after=$(cd "$src" && find . -type f -exec cksum {} + | sort | cksum)
[ "$before" = "$after" ] && ok "source unchanged" || bad "source unchanged"

# pruning to --keep, same-day rerun, unrelated folders untouched
for d in 2026-01-01 2026-01-02 2026-01-03 2026-01-04; do mkdir -p "$dest/dsh-$d"; done
mkdir -p "$dest/dsh-notes" "$dest/other"; echo keep >"$dest/other/file"
DSH_BACKUP_DATE=2026-01-06 sh "$script" --source "$src" --dest "$dest" --keep 3 --max-attachment-mb 1 >/dev/null 2>&1
left=$(ls -1 "$dest" | grep -E '^dsh-[0-9]{4}-[0-9]{2}-[0-9]{2}$' | tr '\n' ' ')
[ "$left" = "dsh-2026-01-04 dsh-2026-01-05 dsh-2026-01-06 " ] && ok "prunes to the newest 3" || bad "prunes to the newest 3 (got: $left)"
check "does not touch other folders" test -f "$dest/other/file" -a -d "$dest/dsh-notes"
echo marker >"$dest/dsh-2026-01-06/marker"
DSH_BACKUP_DATE=2026-01-06 sh "$script" --source "$src" --dest "$dest" --keep 3 --max-attachment-mb 1 >/dev/null 2>&1
nocheck "same-day rerun replaces that day's folder" test -e "$dest/dsh-2026-01-06/marker"

# options
DSH_BACKUP_DATE=2026-01-07 sh "$script" --source "$src" --dest "$dest" --keep 9 --include-profile-config >"$tmp/inc.txt" 2>&1
check "--include-profile-config copies them" test -f "$dest/dsh-2026-01-07/profiles/desktop/cordis.patch.yml"
check "--include-profile-config warns" grep -q WARNING "$tmp/inc.txt"
out=$(DSH_BACKUP_DATE=2026-01-08 sh "$script" --source "$src" --dest "$dest" --dry-run 2>&1)
case $out in *"dry run"*) ok "dry run prints a plan" ;; *) bad "dry run prints a plan" ;; esac
nocheck "dry run writes nothing" test -e "$dest/dsh-2026-01-08"

# refusals
nocheck "requires --dest" sh "$script" --source "$src"
nocheck "refuses dest inside source" sh "$script" --source "$src" --dest "$src/backups"
nocheck "refuses source inside dest" sh "$script" --source "$src" --dest "$tmp"
nocheck "refuses relative dest" sh "$script" --source "$src" --dest relative/dir
nocheck "refuses --keep 0" sh "$script" --source "$src" --dest "$dest" --keep 0
nocheck "refuses a missing source" sh "$script" --source "$tmp/nope" --dest "$dest"
mkdir "$dest/.dsh-backup.lock"
nocheck "refuses while another backup holds the lock" sh "$script" --source "$src" --dest "$dest"
rmdir "$dest/.dsh-backup.lock"
[ "$fail" = 0 ] && echo "all checks passed" || { echo "SOME CHECKS FAILED"; exit 1; }
