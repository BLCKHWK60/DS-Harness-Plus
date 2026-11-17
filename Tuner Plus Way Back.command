#!/bin/bash
# Double-click this file in Finder to put back Tuner Plus 0.1.0 (before skills were added).
# Your Tuner Plus data, your settings and every other add-on stay as they are.
cd "$(dirname "$0")" || exit 1
bash scripts/tuner-way-back.sh "$@"
status=$?
echo
read -n 1 -s -r -p "Press any key to close this window."
echo
exit $status
