/**
 * Writes a small, real PDF for the tests: plain text placed at chosen spots on
 * each page, in Helvetica. No library is used.
 */
import { writeFileSync } from 'node:fs';

const escape = (text) => text.replace(/([\\()])/g, '\\$1');

/**
 * @param {string} file - where to write the PDF.
 * @param {Array<Array<{x: number, y: number, text: string, size?: number}>>} pages - per page, the pieces of text and where they go (points, from the bottom left).
 * @param {{title?: string}} [info] - document facts.
 */
export function makePdf(file, pages, info = {}) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const tree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const items of pages) {
    const stream = items.map((item) => `BT /F1 ${item.size ?? 11} Tf ${item.x} ${item.y} Td (${escape(item.text)}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] >>`;
  const facts = add(`<< /Title (${escape(info.title ?? '')}) >>`);

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${facts} 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  writeFileSync(file, out);
}
