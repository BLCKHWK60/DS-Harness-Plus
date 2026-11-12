/**
 * The text of every page of a PDF, read with the part of macOS that opens PDFs (PDFKit).
 * Run by `osascript -l JavaScript pdftext.jxa.js '<path>'`; prints one JSON object:
 * `{pages: [text, ...]}` or `{error}`. Nothing leaves the Mac.
 */
ObjC.import('Quartz');
ObjC.import('Foundation');

function run(argv) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(String(argv[0] || '')));
  if (doc.isNil()) return JSON.stringify({ error: 'not a PDF that can be opened' });
  if (doc.isLocked) return JSON.stringify({ error: 'protected by a password' });
  const pages = [];
  const count = Number(doc.pageCount);
  for (let i = 0; i < count; i += 1) {
    const value = doc.pageAtIndex(i).string;
    pages.push(value.isNil() ? '' : ObjC.unwrap(value));
  }
  return JSON.stringify({ pages });
}
