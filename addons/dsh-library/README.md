# Library

Plugin `@local/dsh-library` (dsh 0.2.2-rc.2). The assistant can search your own documents and quote them with the file and the page, so you can check what it says.

You add folders of readings, papers, notes or slides. Their documents are read once into an index on this Mac. Nothing is installed and nothing is sent anywhere to do it.

## What you do

**Settings → Library.**

- **Add a folder:** type its path or press **Choose…**. Its documents are read in the background; the page shows the progress.
- **Check now** looks for new and changed files at once. It also happens by itself every 10 minutes and when the app starts.
- **Try a search** shows what the assistant would get for a few words.
- **Could not be searched** lists documents with no words (scans) or that could not be opened, with the reason.
- **Remove** takes a folder out of the Library. The folder and its files are not touched.

A folder must be inside your home folder (or on another drive), not the home folder itself or the whole disk, and not the app's own data folder. A folder inside one that is already added is refused as already covered.

## What it reads

| Kind | Endings | Quoted by |
| --- | --- | --- |
| Plain text | `.txt` `.md` `.markdown` `.text` `.rst` `.org` `.tex` `.csv` | line |
| PDF | `.pdf` | page |
| Word and similar | `.docx` `.doc` `.rtf` `.odt` `.html` `.htm` | part (these have no fixed pages) |
| PowerPoint | `.pptx` | slide |

Left out: hidden files and folders, links, programs (`.app` and similar), `node_modules`, text files over 2 MB, other files over 150 MB, and anything past 20,000 documents in one folder.

## What the assistant gets

Two tools, present only while the Library has at least one folder:

- `library_search`: a few words in, up to 20 passages out, best match first, at most three from one document. Each has the file, the page (or slide, line, part) and a position.
- `library_read`: more of one document from a position on, about 6,000 characters at a time, with page marks.

Both say that the text is material from files, not instructions. The assistant can use them in tabs where tools are on.

## How search works

- Word search, using the full-text index (FTS5) of the SQLite built into the app's runtime. No AI index and no embeddings.
- Words match by their stem: "cars" finds "car", "running" finds "run". Accents are ignored: "economie" finds "économie".
- Text in double quotes is an exact phrase.
- All words must be in the same passage. If no passage has them all, passages with any of them are returned and the answer says so.
- It does not know meaning: "cars" does not find "automobile". The tool tells the assistant to try other words.

## How reading works

- PDF: the part of macOS that opens PDFs (PDFKit), through `osascript`. One page at a time.
- Word and similar: macOS's `textutil`.
- PowerPoint: `unzip`, then the words of each slide.
- Each document is cut into pieces of about 1,200 characters at paragraph ends.
- A document is read again only when its size or its date changes. One that failed is not tried again until it changes.

## Settings

```yaml
- id: library
  config:
    enabled: true
    rescanMinutes: 10   # 0 = only when you press Check now
```

The folders are kept in the index, not in the settings.

## Good to know

- The index is `<app data folder>/library/index.sqlite`. It holds the text of your documents. It never leaves the Mac; text reaches a model only as the passages a search returns.
- A scanned PDF with no text layer has no words to search. The PDF reader add-on can recognise text on such pages when you ask about that file.
- Reading many PDFs takes a while (well under a second each, one after another). Search works on what has been read so far and says when the reading is still going.
- Slides are numbered in the order of their files inside the `.pptx`, which is normally the order you see.

## Code

`lib/extract.js` (kinds, cutting into pieces, the three readers), `lib/pdftext.jxa.js` (the PDF script), `lib/scan.js` (walking a folder, what changed), `lib/store.js` (the index, search, reading on, folder checks), `index.js` (the background reader, the tools, the `GET/POST /dsh-library/data` route), `client.js` (the page). Tests: `test/library.test.mjs`.

## Tested

In the lab (web version, stand-in model), on a folder with a real two-page PDF, a real `.docx`, a `.pptx` and text files: the page refused the whole disk and the app's own folder, added the folder, showed the reading and then "4 documents"; Try a search found the right PDF page; `library_search` and `library_read` called by the model returned the passage with its file, page and position, and the document page by page; a new file was found and a deleted one forgotten after Check now; Remove cleared the folder's passages and adding it again read them back.

Not tested: the **Choose…** button (it opens a macOS dialog); a large folder; `.doc`, `.rtf`, `.odt` and `.html` files (`.docx` only); a PDF with a password or without a text layer in the running app (unit tests only); the 10-minute check (Check now only); a real model. In the Mac desktop app the owner confirmed that the page works; nothing more detailed was checked there.
