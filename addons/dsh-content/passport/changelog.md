# Changelog: @local/dsh-content

- 2026-11-23 Item 4A, stage 6b, Part D (unit-tested only): the comment at the `defaultMode` reset says what it is for now (D14): it matters only without the Cowork sidebar or with spaces off; with spaces, Modes keeps the space's start mode while this add-on is off and gives it back when it is on (lib/spaces.js draftStartMode, startModeGone). No code change. README: "your start-mode choice is kept". Test: dsh-modes test/start-mode-kept.test.mjs (the reset stays guarded and writes no spaceSettings).
- 2026-11-22 Item 4A, round 2 (lab only): the Settings page's intro says mode, not tab; README updated.
- 2026-11-22 Item 4A, fix round (lab only): the 'Offer the Content mode' switch, its group, description and the notes after a flip come from the add-on's locale dictionary in English and Chinese and name the Mode list, never a tab; the how-to says to pick Content in the Mode list. Test offer-words.test.mjs
- 2026-11-22 Item 4A, stage 5: the switch "Show the Content tab" is now "Offer the Content mode" (same setting `enabled`, same on and off), with words that name the Mode list instead of the tab.
- 2026-11-17 The rest of the Content and Bench plan: Web levels, Ultra Code and the work loop, the Recon export door, the Voice Library, and Bench's network, server, phone and Bluetooth doors
- 2026-11-16 Content steps C2-C7, C9, C11-C13, C15 and Bench B3-B5, B7, B9, with both reviews fixed
- 2026-11-16 Content and Bench tabs; Long run checks in Bench and Recon; a run that has ended stops cleanly
