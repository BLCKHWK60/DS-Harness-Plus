/**
 * The PDF reader: page-numbered text, search, page images and text recognition,
 * on top of a runner that talks to macOS. Extracted text is kept in memory for a
 * few documents and never written to disk.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layoutText, ocrText } from './layout.js';

const SCRIPT = fileURLToPath(new URL('./pdfkit.jxa.js', import.meta.url));
const KEEP_DOCUMENTS = 4;
/** A page with fewer letters and digits than this is treated as having no text layer (a bare page number does not count as text). */
const SCANNED_BELOW = 6;

/**
 * Ask macOS. Resolves with the parsed answer; rejects with a plain message.
 * @param {object} request - `{op, path, ...}`.
 * @param {{timeoutMs?: number, signal?: AbortSignal}} [options] - limits.
 * @returns {Promise<object>} the answer.
 */
export function runMac(request, options = {}) {
  return new Promise((done, fail) => {
    if (process.platform !== 'darwin') return fail(new Error('The PDF reader needs macOS.'));
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', SCRIPT, JSON.stringify(request)], { timeout: options.timeoutMs ?? 90_000, maxBuffer: 256 * 1024 * 1024, signal: options.signal }, (error, stdout) => {
      if (error) return fail(new Error(error.killed ? 'Reading the PDF took too long.' : 'macOS could not read this PDF.'));
      try {
        const answer = JSON.parse(String(stdout).trim());
        if (answer?.error) return fail(new Error(String(answer.error)));
        done(answer);
      } catch {
        fail(new Error('macOS gave an answer that could not be read.'));
      }
    });
  });
}

const letters = (text) => (String(text).match(/[\p{L}\p{N}]/gu) ?? []).length;

/**
 * Tidy a page's text: join words split by a hyphen at a line end, drop trailing spaces.
 * @param {string} text - raw page text.
 * @returns {string} tidied text.
 */
export function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A page range from what the model asked for.
 * @param {unknown} from - first page, 1-based.
 * @param {unknown} to - last page.
 * @param {number} pages - pages in the document.
 * @returns {{from: number, to: number}} a valid range.
 */
export function pageRange(from, to, pages) {
  const first = Math.min(Math.max(1, Math.round(Number(from) || 1)), Math.max(1, pages));
  const lastAsked = Math.round(Number(to) || 0);
  const last = Math.min(Math.max(first, lastAsked >= first ? lastAsked : pages), Math.max(1, pages));
  return { from: first, to: last };
}

/**
 * Find a phrase. Upper and lower case, line breaks and hyphens at line ends do not matter.
 * @param {string[]} pages - text per page.
 * @param {string} query - words to find.
 * @param {number} [limit] - most hits.
 * @returns {{hits: Array<{page: number, snippet: string}>, total: number, pages: number[]}} hits with their page numbers.
 */
export function searchPages(pages, query, limit = 20) {
  // A word split by a hyphen at a line end is tried both ways: "cross-\nchecked" matches
  // "cross-checked" (a real hyphen) and "crosschecked" (a split word).
  const flat = (text, keepHyphen) => String(text).replace(/-\n(?=\p{Ll})/gu, keepHyphen ? '-' : '').replace(/\s+/g, ' ');
  const needle = flat(query ?? '', true).trim().toLowerCase();
  const hits = [];
  const found = new Set();
  let total = 0;
  if (needle.length < 2) return { hits, total, pages: [] };
  pages.forEach((raw, index) => {
    for (const keepHyphen of [true, false]) {
      const text = flat(raw, keepHyphen);
      const lower = text.toLowerCase();
      let here = 0;
      for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
        here += 1;
        if (hits.length < limit) {
          const start = Math.max(0, at - 90);
          const end = Math.min(text.length, at + needle.length + 90);
          hits.push({ page: index + 1, snippet: `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}` });
        }
      }
      if (here > 0) {
        total += here;
        found.add(index + 1);
        break;
      }
    }
  });
  return { hits, total, pages: [...found] };
}

/**
 * @param {{run?: typeof runMac}} [options] - `run` replaces the macOS runner in tests.
 * @returns {object} the reader.
 */
export function createReader(options = {}) {
  const run = options.run ?? runMac;
  /** @type {Map<string, object>} */
  const cache = new Map();

  /** Load a document's text once; `ref` is `{file, size, mtime}` from `resolvePdf`. */
  async function load(ref, signal) {
    const key = `${ref.file}|${ref.size}|${ref.mtime}`;
    const kept = cache.get(key);
    if (kept) {
      cache.delete(key);
      cache.set(key, kept);
      return kept;
    }
    const raw = await run({ op: 'load', path: ref.file }, { signal });
    const text = (raw.text ?? []).map(tidy);
    const doc = {
      file: ref.file,
      pages: Number(raw.pages) || text.length,
      title: String(raw.title ?? ''),
      author: String(raw.author ?? ''),
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0,
      outline: Array.isArray(raw.outline) ? raw.outline : [],
      text,
      scanned: text.map((page, index) => (letters(page) < SCANNED_BELOW ? index + 1 : 0)).filter(Boolean),
    };
    cache.set(key, doc);
    while (cache.size > KEEP_DOCUMENTS) cache.delete(cache.keys().next().value);
    return doc;
  }

  return {
    load,

    /** Facts about the document, as text for the model. */
    async info(ref, signal) {
      const doc = await load(ref, signal);
      const words = doc.text.reduce((total, page) => total + (page.match(/\S+/g) ?? []).length, 0);
      const lines = [
        `PDF: ${doc.file}`,
        `Pages: ${doc.pages}${doc.width ? ` (${doc.width} × ${doc.height} points)` : ''}`,
        doc.title ? `Title: ${doc.title}` : '',
        doc.author ? `Author: ${doc.author}` : '',
        `Words in the text layer: about ${words.toLocaleString('en-US')}`,
      ];
      if (doc.scanned.length === doc.pages) lines.push('No page has a text layer: this is a scan. Use pdf_ocr page by page.');
      else if (doc.scanned.length > 0) lines.push(`Pages without a text layer (scans or pictures; use pdf_ocr or pdf_page_image): ${shortList(doc.scanned)}`);
      else lines.push('Every page has a text layer.');
      if (doc.outline.length > 0) {
        lines.push('', 'Contents:');
        for (const row of doc.outline.slice(0, 120)) lines.push(`${'  '.repeat(Math.max(0, row.level - 1))}- ${row.title}${row.page ? ` (page ${row.page})` : ''}`);
        if (doc.outline.length > 120) lines.push(`… and ${doc.outline.length - 120} more entries`);
      } else lines.push('The PDF has no table of contents of its own.');
      return lines.filter((line) => line !== '').join('\n');
    },

    /**
     * Pages as text, each under its page number.
     * @param {object} ref - from `resolvePdf`.
     * @param {{from?: number, to?: number, layout?: boolean, maxChars?: number}} [want] - what to read.
     * @param {AbortSignal} [signal] - stops the read.
     * @returns {Promise<string>} the text.
     */
    async read(ref, want = {}, signal) {
      const doc = await load(ref, signal);
      const range = pageRange(want.from, want.to, doc.pages);
      const budget = Math.max(2000, Number(want.maxChars) || 30000);
      let laid = null;
      if (want.layout === true) {
        const numbers = [];
        for (let page = range.from; page <= range.to && numbers.length < 12; page += 1) numbers.push(page);
        const answer = await run({ op: 'layout', path: ref.file, pages: numbers }, { signal });
        laid = new Map((answer.pages ?? []).map((page) => [page.page, layoutText(page.runs ?? [])]));
      }
      const parts = [];
      let used = 0;
      let next = 0;
      for (let page = range.from; page <= range.to; page += 1) {
        let body = laid ? laid.get(page) : doc.text[page - 1];
        if (laid && body === undefined) {
          next = page;
          break;
        }
        body = body ?? '';
        if (doc.scanned.includes(page)) body = body ? `${body}\n[Almost no text on this page: it may be a scan or a picture. Try pdf_ocr or pdf_page_image.]` : '[No text layer on this page: it is a scan or a picture. Use pdf_ocr or pdf_page_image.]';
        if (used > 0 && used + body.length > budget) {
          next = page;
          break;
        }
        if (body.length > budget) body = `${body.slice(0, budget)}\n[This page is longer than one answer can hold; the rest was left out.]`;
        parts.push(`--- page ${page} of ${doc.pages} ---\n${body}`);
        used += body.length;
      }
      if (next > 0) parts.push(`[Stopped before page ${next} to keep this answer short. Call pdf_read again with from=${next}.]`);
      return parts.join('\n\n');
    },

    /** Find a phrase; the answer lists page numbers and the words around each hit. */
    async search(ref, query, limit, signal) {
      const doc = await load(ref, signal);
      const result = searchPages(doc.text, query, Math.min(50, Math.max(1, Math.round(Number(limit) || 20))));
      if (String(query ?? '').trim().length < 2) return 'Give at least two characters to search for.';
      if (result.total === 0) {
        return `"${query}" does not appear in the text of this PDF.${doc.scanned.length > 0 ? ` ${doc.scanned.length} page(s) have no text layer and were not searched (${shortList(doc.scanned)}).` : ''}`;
      }
      const lines = [`"${query}": ${result.total} hit${result.total === 1 ? '' : 's'} on page${result.pages.length === 1 ? '' : 's'} ${shortList(result.pages)}.`];
      for (const hit of result.hits) lines.push(`p.${hit.page}: ${hit.snippet}`);
      if (result.total > result.hits.length) lines.push(`… ${result.total - result.hits.length} more hits not shown.`);
      return lines.join('\n');
    },

    /** Save one page as a PNG file. */
    async image(ref, page, scale, out, signal) {
      const doc = await load(ref, signal);
      const number = Math.round(Number(page) || 0);
      if (number < 1 || number > doc.pages) throw new Error(`There is no page ${page}; the PDF has ${doc.pages} pages.`);
      return run({ op: 'image', path: ref.file, page: number, scale: Math.min(4, Math.max(1, Number(scale) || 2)), out }, { signal });
    },

    /** Recognise the text on one page from its picture. */
    async ocr(ref, page, signal) {
      const doc = await load(ref, signal);
      const number = Math.round(Number(page) || 0);
      if (number < 1 || number > doc.pages) throw new Error(`There is no page ${page}; the PDF has ${doc.pages} pages.`);
      const answer = await run({ op: 'ocr', path: ref.file, page: number, scale: 3 }, { signal, timeoutMs: 180_000 });
      const lines = answer.lines ?? [];
      const text = ocrText(lines);
      const unsure = lines.filter((line) => Number(line.confidence) < 0.5).length;
      if (!text) return `--- page ${number} of ${doc.pages}, recognised from the picture ---\n[No text was recognised on this page. Look at it with pdf_page_image.]`;
      return `--- page ${number} of ${doc.pages}, recognised from the picture ---\n${text}${unsure > 0 ? `\n[${unsure} of ${lines.length} lines were hard to read; check them against pdf_page_image before quoting.]` : ''}`;
    },

    /** How many documents are held in memory (for tests). */
    size() {
      return cache.size;
    },
  };
}

/**
 * Page numbers in short form: 1-3, 7, 9-12.
 * @param {number[]} pages - sorted page numbers.
 * @returns {string} short form.
 */
export function shortList(pages) {
  const parts = [];
  for (let i = 0; i < pages.length; i += 1) {
    let end = i;
    while (end + 1 < pages.length && pages[end + 1] === pages[end] + 1) end += 1;
    parts.push(end > i ? `${pages[i]}-${pages[end]}` : String(pages[i]));
    i = end;
  }
  return parts.length > 14 ? `${parts.slice(0, 14).join(', ')}, …` : parts.join(', ');
}
