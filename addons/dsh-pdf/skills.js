/**
 * The "read a PDF properly" skill. It is loaded into the model's context only
 * when used, so it is kept short.
 */
export const SKILLS = [
  {
    name: 'read-pdf',
    description: 'Read, summarise or answer questions about a PDF accurately, with a page number for every claim, using the pdf_ tools.',
    whenToUse: 'The user gives a PDF or asks about one: to summarise it, find something in it, check a claim against it, pull out figures or a table, or study from it.',
    content: `# Read a PDF properly

Goal: an answer the user can check, page by page. Never answer about a PDF from memory or from its title.

## 1. Look before reading
Call \`pdf_info\` first. Note the number of pages, the contents list, and which pages have no text layer.
- A short PDF (up to about 15 pages): read all of it.
- A long PDF: do not read it front to back. Use the contents list and \`pdf_search\` to find the pages that matter, then read those.

## 2. Read in ranges
Call \`pdf_read\` with \`from\` and \`to\`. If the answer stops early it says where to continue; continue from there.
- A table, a form, columns of numbers, or text in two columns: read that page again with \`layout: true\`, which keeps columns apart.
- A page with no text layer: call \`pdf_ocr\` for it. If the result is marked as hard to read, or the page holds a chart, a diagram, a formula or handwriting, call \`pdf_page_image\` and open the picture it saves with \`read_image\`. If this model cannot see images, say that the page needs a look by eye and give its number.
- A formula read as text is often wrong (lost superscripts, fractions flattened). Say so, or check it on the page image.

## 3. Find, do not guess
For any specific fact (a number, a name, a date, a definition, a quote), call \`pdf_search\` for its key words and read the page it is on. If a search finds nothing, try another wording, then say plainly that the PDF does not contain it.

## 4. Answer so it can be checked
- Put the page after every claim: \`(p. 12)\`, or \`(pp. 12-14)\`.
- Quote exactly, in quotation marks, only what you have read with a tool in this conversation. Do not tidy a quote.
- Copy numbers digit for digit, with their unit and what they refer to. For a table, give the row and column names as printed.
- Keep apart what the PDF says and what you conclude from it. Mark your own conclusions as yours.
- If pages could not be read (scans that would not recognise, a password, pages you skipped), list them at the end under "Not read".

## 5. Summaries
Follow the document's own structure: one short paragraph or a few points per section, each with its pages. State the main claim, the evidence given for it, and the limits the authors admit. Do not add facts that are not in the PDF.`,
  },
];
