#!/bin/sh
# Check a patch made from mcp-starter.example.yml WITHOUT touching ~/.dsh:
#  1. compose the headless profile with it in a throwaway home (structure and ids are valid);
#  2. for every ENABLED mcp row: no unfilled <PLACEHOLDER>, a pinned version, and its command exists.
# Usage: check.sh <patch.yml>   (env DSH_BIN overrides the dsh path)
set -eu
[ $# -eq 1 ] || { echo "usage: check.sh <patch.yml>" >&2; exit 2; }
dsh=${DSH_BIN:-"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"}
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
DSH_HOME="$home" "$dsh" headless --patch "$1" --dump-config >"$home/dump.yml"
python3 -I - "$1" <<'PY'
import re, shutil, sys
rows, cur = [], None
for line in open(sys.argv[1], encoding="utf-8"):
    if line.lstrip().startswith("#"):
        continue
    m = re.match(r"^\s+- id: (\S+)", line)
    if m:
        cur = {"id": m.group(1), "disabled": False, "text": []}
        rows.append(cur)
    elif cur is not None:
        cur["text"].append(line.rstrip("\n"))
        if re.match(r"^\s+disabled: true\s*$", line):
            cur["disabled"] = True
bad = 0
for r in rows:
    body = "\n".join(r["text"])
    if r["disabled"]:
        print(f"{r['id']}: disabled")
        continue
    problems = []
    if re.search(r"<[A-Z_]+>", body):
        problems.append("unfilled placeholder")
    cmd = re.search(r"command: (\S+)", body)
    args = re.search(r"args: \[(.*)\]", body)
    argtext = args.group(1) if args else ""
    if "@latest" in argtext:
        problems.append("unpinned (@latest)")
    elif cmd and cmd.group(1) == "npx" and not re.search(r"@\d", argtext):
        problems.append("npm package without an exact version")
    elif cmd and cmd.group(1) == "uvx" and "==" not in argtext:
        problems.append("python package without ==version")
    if cmd and shutil.which(cmd.group(1)) is None:
        problems.append(f"command {cmd.group(1)!r} not found on PATH")
    print(f"{r['id']}: ENABLED" + (" -- " + "; ".join(problems) if problems else " (ok)"))
    bad += bool(problems)
sys.exit(1 if bad else 0)
PY
