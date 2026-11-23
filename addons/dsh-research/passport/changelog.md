# Changelog: @local/dsh-research

- 2026-11-23 Item 4A, stage 6b, Part D (unit-tested only): the comment at the `defaultMode` reset says what it is for now (D14): it matters only without the Cowork sidebar or with spaces off; with spaces, Modes keeps the space's start mode while this add-on is off and gives it back when it is on (lib/spaces.js draftStartMode, startModeGone). No code change. README: "your start-mode choice is kept". Test: dsh-modes test/start-mode-kept.test.mjs (the reset stays guarded and writes no spaceSettings).
- 2026-11-22 Item 4A, stage 6a (lab only): a sealed thread (Recon, any mode; a Modes read error counts) gets no saved report, no packet, no pin and no selection note (belt: Deep research is left out in Recon). No Modes: as before. Test sealed-save.test.mjs
- 2026-11-22 Item 4A, round 2 (lab only): the Settings page's intro and saved-reports line say mode, not tab; README updated. Test: research.test.mjs follows the new intro.
- 2026-11-22 Item 4A, fix round (lab only): the 'Offer the Research mode' switch, its group, description and the notes after a flip come from the add-on's locale dictionary in English and Chinese and name the Mode list, never a tab. Test offer-words.test.mjs
- 2026-11-22 Item 4A, stage 5: the switch "Show the Research tab" is now "Offer the Research mode" (same setting `enabled`, same on and off), with words that name the Mode list instead of the tab.
- 2026-11-18 Focus is the Web selector's ticks: the Focus dropdown left the chat box and the gear; each conversation's News or Academic focus and a starting focus were carried over once (now "only", the owner's choice); a run's focus words come from the ticks; nothing removed
- 2026-11-17 The rest of the Content and Bench plan: Web levels, Ultra Code and the work loop, the Recon export door, the Voice Library, and Bench's network, server, phone and Bluetooth doors
- 2026-11-16 Recon: WireGuard, the ordinary web, back channels; the map method; a stalled run fixed
- 2026-11-16 Long run in every tab with a Run button, and the overnight work
- 2026-11-15 Shared trash, Web On/Off and one Depth for every tab (0.59.0)
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-15 Web button, tool trimming, Research tab (0.51.2-0.55.2)
