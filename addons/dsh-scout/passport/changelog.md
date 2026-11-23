# Changelog: @local/dsh-scout

- 2026-11-23 Item 4A, stage 6b, Part D (unit-tested only): the comment at the `defaultMode` reset says what it is for now (D14): it matters only without the Cowork sidebar or with spaces off; with spaces, Modes keeps the space's start mode while this add-on is off and gives it back when it is on (lib/spaces.js draftStartMode, startModeGone). No code change. README: "your start-mode choice is kept". Test: dsh-modes test/start-mode-kept.test.mjs (the reset stays guarded and writes no spaceSettings).
- 2026-11-22 Item 4A, stage 6a (lab only): in a sealed thread (Recon, any mode) `scout_report` saves only into the thread's run folder in Recon's room (or says it was not saved), `scout_reports` reads only that folder, `scout_profile` and `scout_files` refuse with a sentence, and the thread's postings and selection stay in memory (no file written or read). Test space.test.mjs
- 2026-11-22 Item 4A, round 2 (lab only): the Settings page's intro says mode, not tab; README updated.
- 2026-11-22 Item 4A, fix round (lab only): the 'Offer the Scout mode' switch, its group, description and the notes after a flip come from the add-on's locale dictionary in English and Chinese and name the Mode list, never a tab. Test offer-words.test.mjs
- 2026-11-22 Item 4A, stage 5: the switch "Show the Scout tab" is now "Offer the Scout mode" (same setting `enabled`, same on and off), with words that name the Mode list instead of the tab.
- 2026-11-18 Its start-page fields are drawn in the one options area every mode shares (same place, same look); behaviour unchanged
- 2026-11-16 Long run in every tab with a Run button, and the overnight work
- 2026-11-15 Web label for Research and Scout, and the Lens (0.60.0)
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-15 Web button, tool trimming, Research tab (0.51.2-0.55.2)
- 2026-11-14 Scout: market research, step 2 of 5 (0.51.0)
- 2026-11-14 Scout: a mode for finding work, step 1 of 5 (0.50.0)
