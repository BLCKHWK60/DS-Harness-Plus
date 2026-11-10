#!/bin/sh
# Check a filled-in provider patch against the installed dsh WITHOUT touching ~/.dsh:
# it composes the headless profile in a throwaway DSH_HOME and reports unfilled placeholders.
# Usage: check.sh <filled-patch.yml> [path-to-dsh]
set -eu
patch=${1:?usage: check.sh <filled-patch.yml> [path-to-dsh]}
dsh=${2:-"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"}
if grep -n '<[A-Z_]*>' "$patch" | grep -v '^[0-9]*:[[:space:]]*#' ; then
  echo "unfilled placeholders above" >&2; exit 1
fi
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
DSH_HOME="$home" "$dsh" headless --patch "$patch" --dump-config >"$home/dump.yml"
grep -q 'dsh-llm-pi-ai' "$home/dump.yml" && echo "ok: profile composes with $patch"
