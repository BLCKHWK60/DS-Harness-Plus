# Changelog: @local/dsh-diagram

- 2026-11-23 Item 4A, stage 7 (words only, unit-tested): English only: the Chinese Settings name and SEALED_NOT_SAVED_ZH are gone. "Conversation" is "thread" in the page and notes.
- 2026-11-22 Item 4A, stage 6a fix round (lab only): a sealed thread's SVG is saved under its own run folder in Recon's room (`recon.roomFolderOf(id)` + diagrams/, deleted by End and wipe), no longer in the shared room root; no run folder (Recon off or older, an error) saves nothing. Tests: test/space-6a.test.mjs (diagram-run-folder).
- 2026-11-22 Item 4A, stage 6a (lab only): a sealed thread (any mode in Recon) keeps its drawings in memory only (never in diagrams/index.json, also through the `diagrams.show` service) and saves the SVG only inside Recon's room; elsewhere the answer says "Not saved as a file: this Recon thread is not in Recon's room." A Modes that throws counts as sealed; no Modes saves as before. Tests: test/space-6a.test.mjs.
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-13 0.33.0: projects, Python and charts in Data, market tools in Finance, tabs in rows
- 2026-11-11 Release 0.18.0: diagram builder add-on
