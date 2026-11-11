/**
 * Shared drawing helpers: measuring and wrapping text, colours, and the SVG
 * document around a drawing. Text is measured by estimate, a little on the wide
 * side, so that a box sized from it always holds its label.
 */

export const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Colours a box may take. `gray` is the default. */
export const COLORS = ['gray', 'purple', 'teal', 'coral', 'blue', 'amber', 'green'];

const NARROW = new Set([...'iIjl.,:;\'|!()[]{}ft1 ']);
const WIDE = new Set([...'mwMW@%']);

/**
 * Estimated width of a line of text in pixels.
 * @param {string} text - one line.
 * @param {number} [size] - font size.
 * @param {boolean} [bold] - bold text is a little wider.
 * @returns {number} width.
 */
export function textWidth(text, size = 13, bold = false) {
  let units = 0;
  for (const ch of String(text)) {
    if (NARROW.has(ch)) units += 0.32;
    else if (WIDE.has(ch)) units += 0.9;
    else if (ch >= 'A' && ch <= 'Z') units += 0.7;
    else if (ch >= '0' && ch <= '9') units += 0.58;
    else if (ch.codePointAt(0) > 0x2e80) units += 1.02;
    else units += 0.55;
  }
  return units * size * (bold ? 1.07 : 1.03);
}

/**
 * Break text into lines that fit a width. A single word that is too long is cut.
 * @param {string} text - the text.
 * @param {number} maxWidth - widest line in pixels.
 * @param {number} [size] - font size.
 * @param {number} [maxLines] - most lines; the last one ends in "…" if text is left over.
 * @returns {string[]} lines (at least one).
 */
export function wrap(text, maxWidth, size = 13, maxLines = 5) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  const push = (value) => lines.push(value);
  for (let word of words) {
    while (textWidth(word, size) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && textWidth(`${word.slice(0, cut)}-`, size) > maxWidth) cut -= 1;
      if (line) {
        push(line);
        line = '';
      }
      push(`${word.slice(0, cut)}-`);
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) <= maxWidth) line = next;
    else {
      push(line);
      line = word;
    }
  }
  if (line || lines.length === 0) push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && textWidth(`${last}…`, size) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/**
 * Make text safe to put in SVG.
 * @param {unknown} text - any text.
 * @returns {string} escaped text.
 */
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/**
 * Lines of text, centred on a point or starting at it.
 * @param {string[]} lines - the lines.
 * @param {number} x - anchor x.
 * @param {number} y - centre y of the whole block.
 * @param {{size?: number, cls?: string, anchor?: string, bold?: boolean, lineHeight?: number}} [options] - look.
 * @returns {string} SVG.
 */
export function textBlock(lines, x, y, options = {}) {
  const size = options.size ?? 13;
  const lineHeight = options.lineHeight ?? Math.round(size * 1.35);
  const first = y - ((lines.length - 1) * lineHeight) / 2;
  return lines
    .map((line, index) => `<text x="${round(x)}" y="${round(first + index * lineHeight)}" class="${options.cls ?? 'ink'}" font-size="${size}" text-anchor="${options.anchor ?? 'middle'}" dominant-baseline="central"${options.bold ? ' font-weight="600"' : ''}>${esc(line)}</text>`)
    .join('');
}

export const round = (value) => Math.round(value * 10) / 10;

const LIGHT = {
  bg: '#ffffff', ink: '#1f1f1d', sub: '#5f5e5a', line: '#6b6a66', grid: '#e3e1d9',
  gray: ['#f4f3ee', '#8a8880', '#2c2c2a'], purple: ['#eeedfe', '#534ab7', '#3c3489'], teal: ['#e1f5ee', '#0f6e56', '#085041'],
  coral: ['#faece7', '#993c1d', '#712b13'], blue: ['#e6f1fb', '#185fa5', '#0c447c'], amber: ['#faeeda', '#854f0b', '#633806'], green: ['#eaf3de', '#3b6d11', '#27500a'],
  series: ['#534ab7', '#0f6e56', '#d85a30', '#185fa5', '#ba7517', '#3b6d11'],
};
const DARK = {
  bg: '#1c1c1a', ink: '#ececea', sub: '#b4b2a9', line: '#a3a199', grid: '#3a3a37',
  gray: ['#2b2b29', '#77756d', '#ececea'], purple: ['#3c3489', '#afa9ec', '#e4e2fb'], teal: ['#085041', '#5dcaa5', '#c8efe2'],
  coral: ['#712b13', '#f0997b', '#f9d9cd'], blue: ['#0c447c', '#85b7eb', '#d2e5f8'], amber: ['#633806', '#ef9f27', '#fbdcab'], green: ['#27500a', '#97c459', '#d7eabd'],
  series: ['#afa9ec', '#5dcaa5', '#f0997b', '#85b7eb', '#ef9f27', '#97c459'],
};

function rules(p) {
  const out = [
    `.bg{fill:${p.bg}}`, `.ink{fill:${p.ink}}`, `.sub{fill:${p.sub}}`, `.line{stroke:${p.line};fill:none}`, `.head{fill:${p.line}}`, `.grid{stroke:${p.grid};fill:none}`,
    `.label-bg{fill:${p.bg}}`, `.group{fill:none;stroke:${p.line};stroke-dasharray:5 4}`,
  ];
  for (const name of COLORS) out.push(`.c-${name}{fill:${p[name][0]};stroke:${p[name][1]}}`, `.t-${name}{fill:${p[name][2]}}`);
  p.series.forEach((color, index) => out.push(`.s${index + 1}{stroke:${color};fill:none}`, `.f${index + 1}{fill:${color}}`));
  return out.join('');
}

/**
 * Wrap a drawing in an SVG document.
 * @param {{width: number, height: number, title: string, desc?: string, body: string}} drawing - what was drawn.
 * @param {{theme?: 'auto' | 'light' | 'dark', background?: boolean}} [options] - `auto` follows the viewer's light or dark mode.
 * @returns {string} the SVG file's text.
 */
export function document(drawing, options = {}) {
  const theme = options.theme ?? 'auto';
  const style = theme === 'light' ? rules(LIGHT) : theme === 'dark' ? rules(DARK) : `${rules(LIGHT)}@media (prefers-color-scheme: dark){${rules(DARK)}}`;
  const width = Math.ceil(drawing.width);
  const height = Math.ceil(drawing.height);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" font-family='${FONT}'>`,
    '<!-- dsh-diagram -->',
    `<title>${esc(drawing.title)}</title>`,
    drawing.desc ? `<desc>${esc(drawing.desc)}</desc>` : '',
    `<style>${style}text{stroke:none}</style>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="head"/></marker></defs>',
    options.background === false ? '' : `<rect class="bg" width="${width}" height="${height}"/>`,
    drawing.body,
    '</svg>',
  ].join('');
}

/**
 * A title line above a drawing: shifts the drawing down and returns the new size.
 * @param {{width: number, height: number, body: string, boxes: object[]}} drawing - the laid-out drawing.
 * @param {string} title - the title; empty adds nothing.
 * @returns {{width: number, height: number, body: string, boxes: object[]}} the drawing with its title.
 */
export function withTitle(drawing, title) {
  if (!title) return drawing;
  const lines = wrap(title, Math.max(260, drawing.width - 40), 16, 2);
  const extra = lines.length * 22 + 14;
  const width = Math.max(drawing.width, Math.max(...lines.map((line) => textWidth(line, 16, true))) + 40);
  const shift = (width - drawing.width) / 2;
  return {
    width,
    height: drawing.height + extra,
    body: `${textBlock(lines, width / 2, 10 + (lines.length * 22) / 2, { size: 16, bold: true })}<g transform="translate(${round(shift)} ${extra})">${drawing.body}</g>`,
    boxes: drawing.boxes.map((box) => ({ ...box, x: box.x + shift, y: box.y + extra })),
  };
}
