# Changelog: @local/dsh-finance

- 2026-11-23 Item 4A, stage 6b, Part D (unit-tested only): the comment at the `defaultMode` reset says what it is for now (D14): it matters only without the Cowork sidebar or with spaces off; with spaces, Modes keeps the space's start mode while this add-on is off and gives it back when it is on (lib/spaces.js draftStartMode, startModeGone). No code change. README: "your start-mode choice is kept". Test: dsh-modes test/start-mode-kept.test.mjs (the reset stays guarded and writes no spaceSettings).
- 2026-11-22 Item 4A, stage 6a (lab only): `finance_profile_save` refuses in a sealed thread (Recon, any mode; a Modes read error counts) with a sentence saying why; the profile is not changed. Test space.test.mjs
- 2026-11-22 Item 4A, round 2 (lab only): the Settings page's intro says mode (Chat's Mode list), not tab; README updated for spaces and modes (briefs and your own scheduled tasks run in the Finance mode).
- 2026-11-22 Item 4A, fix round (lab only): the 'Offer the Finance mode' switch, its group, description and the notes after a flip come from the add-on's locale dictionary in English and Chinese and name the Mode list, never a tab. Test offer-words.test.mjs
- 2026-11-22 Item 4A, stage 5: the switch "Show the Finance tab" is now "Offer the Finance mode" (same setting `enabled`, same on and off), with words that name the Mode list instead of the tab.
- 2026-11-18 Start page and started conversation: the selection is under the chat box in the one options area every mode shares (the strip above the box is gone); a started conversation's fields change only that conversation, from the next answer, as before
- 2026-11-18 A started Finance conversation shows its selection as a strip right above the chat box (all five parts from 1000 px wide, with "A change counts for this conversation, from the next answer."), while the chat box is the same in every mode; the in-box pill comes back with that switch off; hidden at once on another sidebar tab
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-14 0.43.1: Recon, an isolated tab for .onion research (steps 1 to 3 of 7)
- 2026-11-13 0.34.1: Finance adviser, fold the message box, Rerun
- 2026-11-13 0.33.0: projects, Python and charts in Data, market tools in Finance, tabs in rows
- 2026-11-12 Finance 0.29.2: your own scheduled tasks can run in Finance
- 2026-11-12 Finance 0.29.1: own data sources, scheduled briefs, briefs run in Finance
- 2026-11-12 Release 0.28.0: Finance data tools that need no key
- 2026-11-12 Release 0.27.2: Finance mode, and the activity line as part of the message box
