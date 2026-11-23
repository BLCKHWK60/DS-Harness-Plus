# Changelog: @local/dsh-search

- 2026-11-23 Item 4A, stage 6b, Part C (stand-ins only): with spaces on, ⌘K groups results under space headings (Chat, Code, Devices, Workshop; the sidebar's space order; hidden and unavailable spaces too), each row tagged with its mode; no Recon heading ever, and a thread in Recon or whose space cannot be read is hidden (with a note when it would have matched); at most 60 per space with an "and N more" line; "Nothing found in any space."; Chinese for the new lines. Without Modes' spaces: the tab grouping as before. Tests: test/space-groups.test.mjs.
- 2026-11-22 Item 4A, stage 6a (lab only, belt): a thread recorded in the Recon space (any mode) is never shown, nor one whose folder Recon says is its room (the page now sends each thread's folder). Tests: hidden-by-space, hidden-by-room-folder in test/search.test.mjs.
- 2026-11-15 Thorough's check before finishing (0.59.1)
- 2026-11-15 Trash per tab, Delete permanently, Empty trash, own tab order (0.58.0)
- 2026-11-15 Build the owner's 26 decisions and Scout step 3 (0.57.0)
- 2026-11-14 0.47.1: Global Search, search in each tab, right-click and multi-select
