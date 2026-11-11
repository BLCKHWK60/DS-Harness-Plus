/**
 * Reads a PDF with the parts that come with macOS: PDFKit for text, outline and
 * page images, Vision for text recognition on scanned pages. Run by
 * `osascript -l JavaScript pdfkit.jxa.js '<json>'`; prints one JSON object.
 *
 * Nothing leaves the Mac: both frameworks work on the device.
 */
ObjC.import('Quartz');
ObjC.import('Foundation');
ObjC.import('AppKit');

function fail(message) {
  return JSON.stringify({ error: message });
}

function open(path) {
  const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(path));
  if (doc.isNil()) return { error: 'This file could not be opened as a PDF.' };
  if (doc.isLocked) return { error: 'This PDF is protected by a password.' };
  return { doc };
}

function attribute(doc, key) {
  const all = doc.documentAttributes;
  if (all.isNil()) return '';
  const value = all.objectForKey(key);
  if (value.isNil()) return '';
  const plain = ObjC.unwrap(value);
  return typeof plain === 'string' ? plain.slice(0, 300) : '';
}

function outline(doc) {
  const rows = [];
  const root = doc.outlineRoot;
  if (root.isNil()) return rows;
  const walk = (node, level) => {
    const count = Number(node.numberOfChildren);
    for (let i = 0; i < count && rows.length < 400; i += 1) {
      const child = node.childAtIndex(i);
      const label = child.label.isNil() ? '' : String(ObjC.unwrap(child.label)).slice(0, 160);
      let page = 0;
      const destination = child.destination;
      if (!destination.isNil() && !destination.page.isNil()) page = Number(doc.indexForPage(destination.page)) + 1;
      rows.push({ title: label, page, level });
      if (level < 4) walk(child, level + 1);
    }
  };
  walk(root, 1);
  return rows;
}

/** A page as a bitmap, `scale` times its size in points. */
function bitmap(page, scale) {
  const box = page.boundsForBox($.kPDFDisplayBoxCropBox);
  const size = $.NSMakeSize(box.size.width * scale, box.size.height * scale);
  const image = page.thumbnailOfSizeForBox(size, $.kPDFDisplayBoxCropBox);
  return $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
}

function run(argv) {
  let args;
  try {
    args = JSON.parse(argv[0]);
  } catch (error) {
    return fail('Bad request.');
  }
  const opened = open(args.path);
  if (opened.error) return fail(opened.error);
  const doc = opened.doc;
  const count = Number(doc.pageCount);
  const pageAt = (number) => (number >= 1 && number <= count ? doc.pageAtIndex(number - 1) : null);

  if (args.op === 'load') {
    const text = [];
    for (let i = 0; i < count; i += 1) {
      const value = doc.pageAtIndex(i).string;
      text.push(value.isNil() ? '' : ObjC.unwrap(value));
    }
    const first = count > 0 ? doc.pageAtIndex(0).boundsForBox($.kPDFDisplayBoxCropBox) : null;
    return JSON.stringify({
      pages: count,
      title: attribute(doc, 'Title'),
      author: attribute(doc, 'Author'),
      encrypted: Boolean(doc.isEncrypted),
      width: first ? Math.round(first.size.width) : 0,
      height: first ? Math.round(first.size.height) : 0,
      outline: outline(doc),
      text,
    });
  }

  if (args.op === 'layout') {
    // Each run of text with its place on the page, so columns can be kept apart.
    const pages = [];
    for (const number of args.pages) {
      const page = pageAt(number);
      if (!page) continue;
      const whole = page.selectionForRect(page.boundsForBox($.kPDFDisplayBoxMediaBox));
      const runs = [];
      const lines = whole.isNil() ? null : whole.selectionsByLine;
      const total = lines === null || lines.isNil() ? 0 : Math.min(Number(lines.count), 4000);
      const whole_text = page.string.isNil() ? '' : ObjC.unwrap(page.string);
      let cursor = 0;
      const push = (t, b) => runs.push({ t, x: Math.round(b.origin.x * 10) / 10, y: Math.round(b.origin.y * 10) / 10, w: Math.round(b.size.width * 10) / 10, h: Math.round(b.size.height * 10) / 10 });
      for (let i = 0; i < total; i += 1) {
        const line = lines.objectAtIndex(i);
        const value = line.string;
        if (value.isNil()) continue;
        const text = ObjC.unwrap(value);
        const lineBox = line.boundsForPage(page);
        // Find this line in the page's text, then place each word by itself.
        const at = text.trim() === '' ? -1 : whole_text.indexOf(text.trim(), cursor);
        if (at < 0 || runs.length > 6000) {
          push(text, lineBox);
          continue;
        }
        const trimmed = text.trim();
        const word = /\S+/g;
        let placed = 0;
        for (let m = word.exec(trimmed); m !== null; m = word.exec(trimmed)) {
          const piece = page.selectionForRange($.NSMakeRange(at + m.index, m[0].length));
          if (piece.isNil()) continue;
          const b = piece.boundsForPage(page);
          if (b.size.width <= 0) continue;
          // Keep the line's own height and baseline, so words of one line stay on one row.
          runs.push({ t: m[0], x: Math.round(b.origin.x * 10) / 10, y: Math.round(lineBox.origin.y * 10) / 10, w: Math.round(b.size.width * 10) / 10, h: Math.round(lineBox.size.height * 10) / 10 });
          placed += 1;
        }
        if (placed === 0) push(text, lineBox);
        cursor = at + trimmed.length;
      }
      pages.push({ page: number, runs });
    }
    return JSON.stringify({ pages });
  }

  if (args.op === 'image' || args.op === 'ocr') {
    const page = pageAt(args.page);
    if (!page) return fail(`There is no page ${args.page}; the PDF has ${count} pages.`);
    const rep = bitmap(page, Math.min(4, Math.max(1, Number(args.scale) || 2)));
    if (rep.isNil()) return fail('The page could not be drawn.');
    if (args.op === 'image') {
      const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
      if (!png.writeToFileAtomically(args.out, true)) return fail('The image could not be saved.');
      return JSON.stringify({ out: args.out, width: Number(rep.pixelsWide), height: Number(rep.pixelsHigh) });
    }
    ObjC.import('Vision');
    const request = $.VNRecognizeTextRequest.alloc.init;
    request.recognitionLevel = 0;
    request.usesLanguageCorrection = true;
    const handler = $.VNImageRequestHandler.alloc.initWithCGImageOptions(rep.CGImage, $());
    const problem = $();
    if (!handler.performRequestsError($.NSArray.arrayWithObject(request), problem)) return fail('Text recognition failed on this page.');
    const lines = [];
    const results = request.results;
    const found = results.isNil() ? 0 : Number(results.count);
    for (let i = 0; i < found; i += 1) {
      const item = results.objectAtIndex(i);
      const best = item.topCandidates(1);
      if (Number(best.count) === 0) continue;
      const box = item.boundingBox;
      lines.push({
        text: ObjC.unwrap(best.objectAtIndex(0).string),
        confidence: Math.round(Number(best.objectAtIndex(0).confidence) * 100) / 100,
        x: Math.round(box.origin.x * 1000) / 1000,
        y: Math.round(box.origin.y * 1000) / 1000,
        w: Math.round(box.size.width * 1000) / 1000,
        h: Math.round(box.size.height * 1000) / 1000,
      });
    }
    return JSON.stringify({ lines });
  }

  return fail('Unknown request.');
}
