# Changelog: @local/dsh-data

- 2026-11-23 Item 4A, stage 7 (words only, unit-tested): English only: the Chinese locale dictionary and the Chinese twins of the sealed-thread refusals are gone. "Conversation" is "thread" in the page, tool descriptions, errors and the method; the old Data tab is the Data mode (Mode list, Chat and Code spaces); the Cowork sidebar is the Left panel add-on. No behaviour change.
- 2026-11-23 Item 4A, stage 6b, Part D (unit-tested only): the comment at the `defaultMode` reset says what it is for now (D14): it matters only without the Cowork sidebar or with spaces off; with spaces, Modes keeps the space's start mode while this add-on is off and gives it back when it is on (lib/spaces.js draftStartMode, startModeGone). No code change. README: "your start-mode choice is kept". Test: dsh-modes test/start-mode-kept.test.mjs (the reset stays guarded and writes no spaceSettings).
- 2026-11-22 Item 4A, stage 6a fix (lab only): in a sealed thread (Recon, any mode) `data_python` writes only into the thread's own run folder in Recon's room (`OUT_DIR` = `recon.roomFolderOf(conversation)/data-output`, deleted by End and wipe; it still reads the thread's folder), never the conversation folder's data-output in the room's shared root; with no run folder (or an older or failing Recon) the program does not run and the tool answers "Not saved: this Recon thread has no run folder in Recon's room." Test space.test.mjs (data-python-room-only)
- 2026-11-22 Item 4A, stage 6a integration (lab only): a sealed thread's `data_chart` file goes into its own run folder in Recon's room (`recon.roomFolderOf(conversation)/data-output`, deleted by End and wipe), never into the room's shared root; no run folder (or an older or failing Recon) saves nothing. Test space.test.mjs
- 2026-11-22 Item 4A, stage 6a fix (lab only): a sealed thread's (Recon, any mode) query log (`data_query`, `data_chart`, `data_python`: SQL text and file names) is kept in memory only, never in queries.json, and its Q ids still work in the thread; End and wipe (the `reconWipe` service: its list at start and each change) forgets a conversation's queries in memory and on disk. Test space.test.mjs
- 2026-11-22 Item 4A, stage 6a (lab only): in a sealed thread (Recon, any mode) `data_chart` keeps its file only when the thread's folder is Recon's room (else it says it was not saved), and `data_save_analysis` / `data_rerun_analysis` refuse with a sentence (saved analyses are a shared list). Test space.test.mjs
- 2026-11-22 Item 4A, round 2 (lab only): the Settings page's intro says mode (Mode list in Chat and Code), not tab; README updated.
- 2026-11-22 Item 4A, fix round (lab only): the 'Offer the Data mode' switch, its group, description and the notes after a flip come from the add-on's locale dictionary in English and Chinese and name the Mode list, never a tab. Test offer-words.test.mjs
- 2026-11-22 Item 4A, stage 5: the switch "Show the Data tab" is now "Offer the Data mode" (same setting `enabled`, same on and off), with words that name the Mode list instead of the tab.
- 2026-11-16 Long run in every tab with a Run button, and the overnight work
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-14 0.43.1: Recon, an isolated tab for .onion research (steps 1 to 3 of 7)
- 2026-11-13 0.36.0: Mission step 1 (permission modes, checkpoints), Data catches broken charts
- 2026-11-13 0.34.2: the Data settings page was blank
- 2026-11-13 0.33.0: projects, Python and charts in Data, market tools in Finance, tabs in rows
- 2026-11-13 0.32.0: Data mode, research in rounds with depth sliders, helper repair
