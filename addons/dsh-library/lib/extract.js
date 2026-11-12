/**
 * Getting the words out of a document, in pieces small enough to quote.
 *
 * Everything is done with what macOS ships: PDFKit for PDFs, `textutil` for Word and similar
 * documents, `unzip` for slides. Nothing is installed and nothing leaves the Mac. Kept apart from
 * the plugin so it can be tested without the app.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PDF_SCRIPT = fileURLToPath(new URL('./pdftext.jxa.js', import.meta.url));

/** File endings the Library reads, by kind. */
export const KINDS = {
  text: ['.txt', '.md', '.markdown', '.text', '.rst', '.org', '.tex', '.csv'],
  doc: ['.docx', '.doc', '.rtf', '.odt', '.html', '.htm'],
  slides: ['.pptx'],
  pdf: ['.pdf'],
};
/** Biggest plain-text file read, and biggest file of any other kind. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 150 * 1024 * 1024;
/** About how long one piece is, in characters. */
export const PIECE = 1200;

/**
 * What kind of document a file is.
 * @param {string} path - the file.
 * @returns {'text' | 'doc' | 'slides' | 'pdf' | undefined} its kind; undefined when the Library does not read it.
 */
export function kindOf(path) {
  const ending = extname(String(path)).toLowerCase();
  return Object.keys(KINDS).find((kind) => KINDS[kind].includes(ending));
}

function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Cut text into pieces of about `PIECE` characters, at paragraph ends where it can.
 * @param {string} text - the text.
 * @returns {{line: number, text: string}[]} the pieces, each with the line it starts on.
 */
export function pieces(text) {
  const lines = tidy(text).split('\n');
  const out = [];
  let buffer = [];
  let size = 0;
  let start = 1;
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) out.push({ line: start, text: body });
    buffer = [];
    size = 0;
  };
  lines.forEach((line, index) => {
    // One very long line (a paragraph with no line breaks) is cut at spaces.
    let rest = line;
    while (rest.length > PIECE) {
      let cut = rest.lastIndexOf(' ', PIECE);
      if (cut < PIECE / 2) cut = PIECE;
      if (size > 0) flush();
      start = index + 1;
      out.push({ line: index + 1, text: rest.slice(0, cut).trim() });
      rest = rest.slice(cut);
    }
    if (size === 0) start = index + 1;
    buffer.push(rest);
    size += rest.length + 1;
    const paragraphEnd = rest.trim() === '';
    if (size >= PIECE && (paragraphEnd || size >= PIECE * 1.5)) flush();
  });
  flush();
  return out.filter((piece) => /[\p{L}\p{N}]/u.test(piece.text));
}

/** The programs that read each kind; replaceable by tests. */
export const hooks = {
  /**
   * @param {string} path - a PDF.
   * @returns {Promise<string[]>} the text of each page.
   */
  pdf(path) {
    return new Promise((done, fail) => {
      execFile('/usr/bin/osascript', ['-l', 'JavaScript', PDF_SCRIPT, path], { timeout: 120_000, maxBuffer: 512 * 1024 * 1024 }, (error, stdout) => {
        if (error) return fail(new Error(error.killed ? 'reading it took too long' : 'macOS could not read this PDF'));
        try {
          const answer = JSON.parse(String(stdout).trim());
          if (answer?.error) return fail(new Error(String(answer.error)));
          return done(Array.isArray(answer?.pages) ? answer.pages.map(String) : []);
        } catch {
          return fail(new Error('macOS gave an answer that could not be read'));
        }
      });
    });
  },

  /**
   * @param {string} path - a Word, RTF, OpenDocument or HTML file.
   * @returns {Promise<string>} its text.
   */
  convert(path) {
    return new Promise((done, fail) => {
      execFile('/usr/bin/textutil', ['-convert', 'txt', '-stdout', path], { timeout: 60_000, maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => {
        if (error) return fail(new Error(error.killed ? 'converting it took too long' : 'macOS could not convert this document'));
        return done(String(stdout));
      });
    });
  },

  /**
   * @param {string} path - a PowerPoint file.
   * @returns {Promise<string[]>} the text of each slide, in order.
   */
  async slides(path) {
    const unzip = (args) => new Promise((done, fail) => {
      execFile('/usr/bin/unzip', args, { timeout: 60_000, maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => (error ? fail(new Error('this file could not be opened as slides')) : done(String(stdout))));
    });
    const names = (await unzip(['-Z1', path])).split('\n')
      .map((name) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(name.trim()))
      .filter(Boolean)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .slice(0, 500);
    const out = [];
    for (const match of names) out.push(slideText(await unzip(['-p', path, match[0]])));
    return out;
  },
};

/**
 * The words on one slide, from its XML.
 * @param {string} xml - the slide's XML.
 * @returns {string} one line per paragraph.
 */
export function slideText(xml) {
  const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
  return String(xml).split(/<\/a:p>/)
    .map((paragraph) => [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((match) => unescape(match[1])).join(''))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * A document as pieces, each with where it is in the document.
 * @param {string} path - the file.
 * @param {string} [kind] - from `kindOf`.
 * @returns {Promise<{where: string, text: string}[]>} the pieces; empty when the document has no words (a scan).
 */
export async function extract(path, kind = kindOf(path)) {
  if (kind === 'text') return pieces(readFileSync(path, 'utf8')).map((piece) => ({ where: `line ${piece.line}`, text: piece.text }));
  if (kind === 'doc') return pieces(await hooks.convert(path)).map((piece, index) => ({ where: `part ${index + 1}`, text: piece.text }));
  if (kind === 'pdf' || kind === 'slides') {
    const word = kind === 'pdf' ? 'page' : 'slide';
    const parts = kind === 'pdf' ? await hooks.pdf(path) : await hooks.slides(path);
    return parts.flatMap((part, index) => pieces(part).map((piece) => ({ where: `${word} ${index + 1}`, text: piece.text })));
  }
  throw new Error('not a kind of document the Library reads');
}
