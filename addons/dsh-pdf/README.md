# PDF reader

Lets a model read PDF files properly, with a page number for everything. It uses the parts that come with macOS (PDFKit for text and pictures, Vision for text recognition), so there is nothing to install and nothing leaves the Mac. It works the moment it is installed.

## What the model gets

Five tools:

| Tool | What it does |
| --- | --- |
| `pdf_info` | Number of pages, title, the PDF's own contents list with page numbers, and which pages are scans |
| `pdf_read` | The text of a range of pages, each under `--- page N of M ---`. A long range stops at a size limit and says where to continue. `layout: true` keeps columns apart, for tables and forms |
| `pdf_search` | Where a word or phrase appears: page numbers and the words around each hit. Case, line breaks and words split by a hyphen at a line end do not matter |
| `pdf_page_image` | Saves one page as a PNG picture and returns its path, for charts, diagrams, formulas and handwriting. The model then opens it with the app's `read_image` tool, which needs a model that can see images |
| `pdf_ocr` | Recognises the text on a scanned page from its picture, on this Mac |

And one skill, `read-pdf`, loaded only when used. It makes the model look at the facts first, read in page ranges, search for specific facts, re-read tables in layout mode, send scans to text recognition, and put a page after every claim, such as `(p. 12)`. It also tells the model to list any pages it could not read.

## How to use it

- Put a PDF in the conversation's folder and ask about it by name: "Summarise report.pdf with page numbers."
- `/pdf report.pdf` in a chat shows the page count, contents list and which pages are scans.
- **Settings → PDF reader:** the master switch, more folders PDFs may be read from, "Allow any PDF on this Mac" (off by default), and how much text one read returns.

## Where it may read

These tools open files themselves, so they keep their own fence. A PDF can be read when it is:

- in the conversation's own folder (or a sub-folder), or
- in a folder you listed on the settings page, or
- anywhere, only if you switched on "Allow any PDF on this Mac".

Links that point out of an allowed folder are followed and refused. Only files ending in `.pdf` are opened, up to 500 MB.

## What it keeps

- The text of up to four PDFs is held in memory while the app runs, so repeated reads are instant. It is never written to disk.
- Page pictures are saved under the app's data folder (`pdf-reader/pages/`) and removed after a day.

## Limits

- **Tables:** layout mode separates columns by the gaps between words. That reads simple tables well. Merged cells, tables without clear gaps, and tables spread over pages can still come out wrong.
- **Formulas:** as text they lose superscripts and fractions. The skill tells the model to check them on the page picture.
- **Text recognition** can miss small or isolated characters (in one lab test it dropped a lone digit in a table cell). Lines it found hard to read are flagged in the answer.
- **Password-protected PDFs** cannot be read.
- **macOS only.** On another system the tools answer that they need macOS.
- No converter such as Docling or MinerU is used yet; that is a possible later step for complex tables and maths.

## For developers

- `lib/pdfkit.jxa.js`: a JavaScript-for-Automation script run with `/usr/bin/osascript -l JavaScript`. Requests: `load` (all text, outline, facts), `layout` (words with their places), `image`, `ocr`. One JSON request in, one JSON answer out.
- `lib/reader.js`: caching, page ranges, the size limit, search. `lib/layout.js`: columns from word positions, reading order for recognised lines. `lib/access.js`: the fence.
- Service `pdfReader` (apiVersion 1): `info(path, cwd?)`, `read(path, options?, cwd?)`, under the same fence. Meant for other add-ons.
- Route `GET /dsh-pdf/status`. Command `/pdf`.

## Checked

- **Unit tests:** 8 (`test/`): the fence (including links and `..`), page ranges and the size limit, facts, search across line breaks, columns and reading order, every tool refusing politely, settings, the skill, tidying up old pictures. One test builds a real two-page PDF and a scanned copy on this Mac and reads back the text, the table in columns, a page picture and the recognised scan.
- **By hand:** the 158-page Bash manual that ships with macOS: all text in about 0.4 s; layout mode on three pages in 0.6 s.
- **Live, in the throwaway web profile with a test model server:** the five tools and the skill are offered to the model; `pdf_read` with layout returned the table in columns; `pdf_ocr` read a scanned page; `pdf_page_image` saved a picture and the app's `read_image` reached that file; a PDF outside the allowed folders was refused; the settings page saved a folder.
- **Not checked:** a real model following the skill; `read_image` showing a page picture to a model that can see images (the lab model cannot); large scanned documents; PDFs in other scripts than Latin; the Mac desktop app (the lab is the web version).
