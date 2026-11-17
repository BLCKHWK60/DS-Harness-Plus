# The way back to Tuner Plus 0.1.0

`dsh-tuning-0.1.0/` is Tuner Plus exactly as it was on 17 November 2026, before skills were added (taken from commit `2743522`, without its tests, the way the installer copies an add-on). `dsh-tuning-0.1.0.sha256` lists a fingerprint of every one of its files.

**Tuner Plus Way Back.command** (in the Plus folder) puts this copy back in place of the installed Tuner Plus in one action:

- it checks this copy against its fingerprints first, and refuses a damaged copy (lists are compared in one fixed order, so the language of the Terminal does not matter);
- it asks to quit the app, backs up the setup files and the Tuner Plus installed now (`<app data>/backups/deepseek-harness-plus/<time>-tuner-way-back/dsh-tuning-before`);
- it swaps the folder, checks the result, and puts the old one back on any failure or interruption (with the installer's record as it was);
- it updates the installer's record of installed files for Tuner Plus only, so the next install still sees any change you made to another add-on.

It never touches Tuner Plus's data (`<app data>/tuning`), your settings, or any other add-on. Skill files Tuner Plus made keep working, because the app reads them by itself. Today's Tuner Plus ignores settings fields it does not know, so the newer version's settings can stay. To undo the way back, run Install.command again.

The full check (`bash scripts/check.sh`) rehearses it in a throwaway folder on every run. Do not edit or delete this folder.
