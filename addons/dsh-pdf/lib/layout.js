/**
 * Turning positions into text. Two jobs:
 *  - `layoutText`: characters with their places on a page become lines in which
 *    columns stay apart, so a simple table still reads as a table;
 *  - `ocrText`: recognised lines from a scanned page are put in reading order.
 */

/**
 * @param {Array<{t: string, x: number, y: number, w: number, h: number}>} runs - runs of text with their
 *   place on the page in points; y is counted from the bottom.
 * @returns {string} the page as lines; runs on the same height are joined left to right, and a wide gap
 *   between two of them becomes at least three spaces.
 */
export function layoutText(runs) {
  const usable = (Array.isArray(runs) ? runs : [])
    .map((run) => ({ ...run, t: String(run?.t ?? '').replace(/\s+/g, ' ').trim() }))
    .filter((run) => run.t !== '' && Number.isFinite(run.x) && Number.isFinite(run.y));
  if (usable.length === 0) return '';
  const perChar = usable.filter((run) => run.w > 0 && run.t.length > 1).map((run) => run.w / run.t.length).sort((p, q) => p - q);
  const typical = perChar.length > 0 ? perChar[Math.floor(perChar.length / 2)] : 6;
  const left = Math.min(...usable.map((run) => run.x));

  const rows = [];
  for (const run of [...usable].sort((p, q) => q.y - p.y || p.x - q.x)) {
    const middle = run.y + run.h / 2;
    const row = rows.find((entry) => Math.abs(entry.middle - middle) <= Math.max(2, Math.min(entry.h, run.h) * 0.5));
    if (row) row.items.push(run);
    else rows.push({ middle, h: run.h, items: [run] });
  }
  return rows
    .map((row) => {
      row.items.sort((p, q) => p.x - q.x);
      let line = ' '.repeat(Math.max(0, Math.min(40, Math.round((row.items[0].x - left) / typical))));
      let right = row.items[0].x;
      row.items.forEach((item, index) => {
        if (index > 0) {
          const gap = item.x - right;
          line += gap > typical * 1.5 ? ' '.repeat(Math.max(3, Math.min(60, Math.round(gap / typical)))) : ' ';
        }
        line += item.t;
        right = item.x + item.w;
      });
      return line.replace(/\s+$/, '');
    })
    .join('\n');
}

/**
 * @param {Array<{text: string, x: number, y: number, w: number, h: number}>} lines - recognised lines; x and y are 0 to 1, y counted from the bottom.
 * @returns {string} the text, top to bottom, with pieces on the same height joined left to right.
 */
export function ocrText(lines) {
  const usable = (Array.isArray(lines) ? lines : []).filter((line) => line && typeof line.text === 'string' && line.text.trim() !== '');
  if (usable.length === 0) return '';
  const rows = [];
  for (const line of [...usable].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const middle = line.y + line.h / 2;
    const row = rows.find((entry) => Math.abs(entry.middle - middle) <= Math.max(entry.h, line.h) * 0.5);
    if (row) row.items.push(line);
    else rows.push({ middle, h: line.h, items: [line] });
  }
  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let text = '';
      let right = 0;
      for (const item of row.items) {
        if (text !== '') text += item.x - right > 0.04 ? '   ' : ' ';
        text += item.text.trim();
        right = item.x + item.w;
      }
      return text;
    })
    .join('\n');
}
