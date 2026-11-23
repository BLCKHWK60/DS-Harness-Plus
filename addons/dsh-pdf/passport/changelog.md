# Changelog: @local/dsh-pdf

- 2026-11-22 Item 4A, stage 6a fix round (lab only): `pdf_page_image` in a sealed thread (any mode in Recon; a Modes error counts as sealed) writes the picture only under its own run folder in Recon's room (`recon.roomFolderOf(id)`/pdf-pages, deleted by End and wipe), never the shared pdf-reader/pages; without a run folder it refuses with SEALED_NO_PAGE_IMAGE (EN/zh). pdf_ocr writes no file. Tests: test/space-6a.test.mjs.
- 2026-11-15 Full audit of every mode, grouped and searchable Settings (0.56.0)
- 2026-11-11 Release 0.17.0: PDF reader add-on
