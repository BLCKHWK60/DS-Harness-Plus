#!/bin/bash
# Double-click this file in Finder to install DeepSeek Harness Plus.
cd "$(dirname "$0")" || exit 1
bash scripts/install.sh "$@"
status=$?
echo
read -n 1 -s -r -p "Press any key to close this window."
echo
exit $status
