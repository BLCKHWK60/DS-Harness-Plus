#!/bin/bash
# Double-click this file in Finder to remove Recon from DeepSeek Harness Plus (the rest of Plus stays).
cd "$(dirname "$0")" || exit 1
bash scripts/recon-uninstall.sh "$@"
status=$?
echo
read -n 1 -s -r -p "Press any key to close this window."
echo
exit $status
