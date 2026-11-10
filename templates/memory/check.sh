#!/bin/sh
# Compose the headless profile with your patch(es) in a THROWAWAY home (never ~/.dsh) and
# count enabled memory options. Fails when more than one is enabled.
# Usage: check.sh <patch.yml> [more-patch.yml ...]   (env DSH_BIN overrides the dsh path)
set -eu
[ $# -ge 1 ] || { echo "usage: check.sh <patch.yml> [...]" >&2; exit 2; }
dsh=${DSH_BIN:-"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"}
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
args=""
for f in "$@"; do args="$args --patch $f"; done
# shellcheck disable=SC2086
DSH_HOME="$home" "$dsh" headless $args --dump-config >"$home/dump.yml"
python3 -I - "$home/dump.yml" <<'PY'
import re, sys
ids = {"memory-mcp-reference", "memory-memorix", "memory-engram", "mnemon", "dsh-engram"}
rows, current = {}, None
for line in open(sys.argv[1], encoding="utf-8"):
    m = re.match(r"^- id: (\S+)", line)
    if m:
        current = m.group(1)
        rows.setdefault(current, {"disabled": False})
        continue
    if current and re.match(r"^  disabled: (true|!!js)", line):
        rows[current]["disabled"] = True
enabled = sorted(i for i in ids if i in rows and not rows[i]["disabled"])
present = sorted(i for i in ids if i in rows)
print("memory rows present:", present or "none")
print("memory rows enabled:", enabled or "none")
if len(enabled) > 1:
    print("ERROR: more than one memory option is enabled", file=sys.stderr)
    sys.exit(1)
PY
