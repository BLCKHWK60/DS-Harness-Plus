/**
 * After the app restarts, Recon's record of a conversation (lib/sources.js) and the addresses it
 * was shown (lib/address.js) start empty, since both are kept in memory only. The saved
 * conversation still holds every recon tool answer. This reads those answers back: the numbered
 * sources with their addresses, titles and dates, and the addresses the conversation was shown, so
 * earlier [S#] citations and links keep working and new sources get new numbers. Nothing is
 * written anywhere.
 *
 * Only what Recon itself showed counts as shown: search results, links on pages Recon read, a
 * redirect Recon reported, and addresses in the user's own messages. What the assistant wrote and
 * the text of a page never count, as when the conversation ran. A page can write anything between
 * the marks, also a sentence or a list that looks like Recon's own, so a redirect counts only when
 * it is the whole answer, and a page's links only when the list is surely the one Recon put after
 * the page's text (linksIn). In doubt, an address is left out: it can still be found again.
 */
import { createHash } from 'node:crypto';
import { onionAddress, onionAddressesIn } from './address.js';
import { webAddress } from './clearnet.js';
import { PART } from './sources.js';
import { SUMMARY_MARK, answersOf } from './tools.js';

const OPEN = '<<<UNTRUSTED SOURCE TEXT\n';
const CLOSE = '\nUNTRUSTED SOURCE TEXT>>>';
/** What a part shows in place of an empty text. */
const EMPTY = ['(the page has no text)', '(the article has no text)'];
const KIND = { recon_onion_read: 'onion', recon_web_read: 'web', recon_board_read: 'web', recon_archive_read: 'archive', recon_usenet_read: 'usenet' };
/**
 * A number only the assistant or a condensed summary mentions counts up to this far above the
 * highest number in Recon's own answers: a page can make the assistant write any [S#], and a far
 * higher one would only push new numbers up. One run reads at most 400 sources.
 */
const MENTION_MARGIN = 500;
/**
 * And never above this: sources are found by numbers of up to four digits (lib/sources.js), so
 * new numbers must stay below 10000.
 */
const MENTION_CAP = 9000;
/** The answer of recon_onion_read when a page sends visitors to another site (lib/onion.js), and nothing else. */
const REDIRECT = /^(\S+) sends visitors on to another site: (\S+)\nIt was not followed\. Read that address if it matters\.\s*$/;
/**
 * What follows the page's text in a recon_onion_read answer with links (lib/onion.js): Recon's
 * heading with how many links it shows, the marked list, and at most Recon's note that an older
 * blocklist was used.
 */
const LINKS_AFTER_TEXT = /^\nLinks on the page to \.onion addresses \(untrusted; (\d{1,3}) shown\):\n<<<UNTRUSTED SOURCE TEXT\n([\s\S]*)\nUNTRUSTED SOURCE TEXT>>>(?:\nNote: the blocklist of banned sites could not be refreshed; an older copy was used\.)?\s*$/;
/** One link as Recon lists it: "- label: address". The label is the page's; the address is the last thing on the line. */
const LINK = /^- .*: (https?:\/\/\S+)$/;

/** @returns {string[]} the fenced blocks of a tool answer, in order. */
function fences(text) {
  const out = [];
  let at = 0;
  for (;;) {
    const start = text.indexOf(OPEN, at);
    if (start < 0) return out;
    const end = text.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) return out;
    out.push(text.slice(start + OPEN.length, end));
    at = end + CLOSE.length;
  }
}

const textOf = (message) => {
  const content = Array.isArray(message?.content) ? message.content : [{ type: 'text', text: message?.content }];
  return content.map((block) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('\n');
};
const sha = (text) => createHash('sha256').update(text).digest('hex');

/**
 * One part of a source as a read tool showed it.
 * @param {string} name - the tool.
 * @param {string} text - its answer.
 * @returns {object | undefined} the source's fields and the part, or undefined when it is not a part.
 */
export function partOf(name, text) {
  const kind = KIND[name];
  const lines = String(text).split('\n');
  const head = /^\[S(\d{1,4})\] (.+)$/.exec(lines[0] ?? '');
  if (!kind || !head) return undefined;
  const n = Number(head[1]);
  const before = String(text).split(OPEN)[0];
  const shown = /^Part (\d{1,3}) of (\d{1,3})\./m.exec(before);
  const piece = shown ? Number(shown[1]) : 1;
  const parts = shown ? Number(shown[2]) : 1;
  const block = fences(String(text))[0];
  const source = { n, kind, part: piece, parts, body: block, title: '', author: '', date: '', group: '', messageId: '', original: '', captured: '', status: 0, cut: false, via: '' };
  if (kind === 'onion') {
    const retrieved = /^Retrieved (\S+) \(UTC\) through Tor\. Text fingerprint \(SHA-256\) ([0-9a-f]{16})…(.*)$/m.exec(before);
    const address = onionAddress(head[2].trim());
    if (!retrieved || !address.ok) return undefined;
    Object.assign(source, { url: address.url, retrieved: retrieved[1], prefix: retrieved[2], via: 'Tor', cut: retrieved[3].includes('only its first part was read'), status: Number(/answered with status (\d{3})/.exec(retrieved[3])?.[1]) || 200 });
  } else if (kind === 'archive') {
    const retrieved = /^Retrieved (\S+) \(UTC\) (through Tor|through WireGuard|directly) from (\S+)\. Text fingerprint \(SHA-256\) ([0-9a-f]{16})…(.*)$/m.exec(before);
    const copy = retrieved ? /^https:\/\/web\.archive\.org\/web\/(\d{4,14})\/(https?:\/\/.+)$/.exec(retrieved[3]) : undefined;
    if (!retrieved || !copy) return undefined;
    Object.assign(source, { url: retrieved[3], original: copy[2], captured: copy[1], retrieved: retrieved[1], prefix: retrieved[4], via: retrieved[2] === 'directly' ? 'direct' : retrieved[2] === 'through WireGuard' ? 'wireguard' : 'Tor', cut: retrieved[5].includes('only its first part was read') });
  } else if (kind === 'web') {
    // The ordinary web (16 November 2026): read through WireGuard, or directly where the user allowed it.
    const retrieved = /^Retrieved (\S+) \(UTC\) (through WireGuard|directly)\. Text fingerprint \(SHA-256\) ([0-9a-f]{16})…(.*)$/m.exec(before);
    const address = webAddress(head[2].trim());
    if (!retrieved || !address.ok) return undefined;
    Object.assign(source, { url: address.url, retrieved: retrieved[1], prefix: retrieved[3], via: retrieved[2] === 'through WireGuard' ? 'wireguard' : 'web-direct', cut: retrieved[4].includes('only its first part was read'), status: Number(/answered with status (\d{3})/.exec(retrieved[4])?.[1]) || 200 });
  } else {
    const article = /^Usenet article (<[^<>\s]{3,250}>) in (\S+)$/.exec(head[2]);
    const retrieved = /^Retrieved (\S+) \(UTC\) through Usenet\. Text fingerprint \(SHA-256\) ([0-9a-f]{16})…(.*)$/m.exec(before);
    if (!article || !retrieved) return undefined;
    Object.assign(source, { url: `news:${article[1].slice(1, -1)}`, messageId: article[1], group: article[2], retrieved: retrieved[1], prefix: retrieved[2], via: 'Usenet', cut: retrieved[3].includes('only its first part was read') });
    // The article's header lines sit inside the marks, before its text.
    const inside = block === undefined ? undefined : /^Subject as shown: (.*)\nAuthor as shown: (.*)\nDate as shown: (.*)\n\n([\s\S]*)$/.exec(block);
    if (inside) {
      const value = (shown2) => (shown2 === '(none)' ? '' : shown2);
      Object.assign(source, { title: value(inside[1]), author: value(inside[2]), date: value(inside[3]), body: inside[4] });
    } else source.body = undefined;
  }
  if (kind !== 'usenet') {
    const title = /^Title as shown: (.*)$/m.exec(before)?.[1] ?? '';
    source.title = title === '(none)' ? '' : title;
  }
  return source;
}

/**
 * The .onion addresses a page links to, from a recon_onion_read answer, as Recon listed them after
 * the page's text. Fails closed: any doubt gives none.
 *
 * A page writes the text between the first marks, and before 0.57.0 also titles and link labels
 * that could span lines, so it could write marks and a links heading of its own. So the list is
 * taken only when (1) the first marked block is surely the page's text Recon showed: for a page of
 * one part its fingerprint matches, for the first of several parts it has exactly a part's length,
 * which a title of at most 300 characters cannot fake; (2) after that block comes exactly Recon's
 * heading and one more marked block, and nothing else but Recon's note about the blocklist; (3)
 * that block has exactly as many lines as the heading says, each "- label: address" (a label over
 * several lines adds lines; a page cannot take any away); and (4) it is not the page's text again.
 * A page whose text held the marks themselves fails (1), as its text was changed to show it.
 * @param {string} text - the answer.
 * @param {object} part - the answer taken apart (partOf).
 * @returns {string[]} the addresses, or none.
 */
export function linksIn(text, part) {
  const answer = String(text);
  const body = part?.body;
  if (part?.kind !== 'onion' || part.part !== 1 || typeof body !== 'string') return [];
  const genuine = part.parts === 1
    ? [body, ...(EMPTY.includes(body) ? [''] : [])].some((candidate) => sha(candidate).startsWith(part.prefix))
    : body.length === PART;
  if (!genuine) return [];
  // Text Recon showed never holds a mark (fence() takes them out), so a page text that does was
  // written to look like Recon's own blocks: take no links from it.
  if (/<<<UNTRUSTED SOURCE TEXT|UNTRUSTED SOURCE TEXT>>>/.test(body)) return [];
  const blocks = fences(answer);
  if (blocks.length !== 2 || blocks[1] === body) return [];
  const shape = LINKS_AFTER_TEXT.exec(answer.slice(answer.indexOf(CLOSE, answer.indexOf(OPEN) + OPEN.length) + CLOSE.length));
  if (!shape || shape[2] !== blocks[1]) return [];
  const lines = blocks[1].split('\n');
  if (lines.length !== Number(shape[1])) return [];
  const out = [];
  for (const line of lines) {
    const address = LINK.exec(line)?.[1];
    if (!address) return [];
    out.push(address);
  }
  return out;
}

/**
 * Everything Recon showed a conversation, read back from its saved history.
 * @param {object[] | undefined} messages - the conversation's messages, as the app derives them.
 * @returns {{sources: object[], shown: string[], floor: number, notes: string[]}} the sources
 *   (ordered by number, as lib/sources.js keeps them; `partial` when their whole text could not be
 *   put back and checked against its fingerprint), the addresses the conversation was shown, the
 *   number new sources are numbered above (the highest in Recon's own answers, or one the assistant
 *   or a summary mentions within MENTION_MARGIN of it and not above MENTION_CAP), and what the
 *   assistant wrote, oldest first, for the export.
 */
export function findingsIn(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const shown = new Set();
  const byKey = new Map();
  const fullPrint = new Map();
  // The highest number in Recon's own answers, and every number only mentioned.
  let floor = 0;
  const mentioned = new Set();
  const seeNumbers = (text) => {
    for (const match of String(text).matchAll(/\[S(\d{1,4})\]/g)) mentioned.add(Number(match[1]));
  };
  const show = (url) => {
    const parsed = onionAddress(url);
    if (parsed.ok && shown.size < 5000) shown.add(parsed.url);
  };

  for (const { name, text } of answersOf(list)) {
    if (name === 'recon_onion_search') {
      // The results: a numbered title line, then the address on the first line indented by three spaces.
      for (const block of fences(text).slice(0, 1)) {
        let wanted = false;
        for (const line of block.split('\n')) {
          if (/^\d{1,3}\. /.test(line)) wanted = true;
          else if (wanted && /^ {3}\S/.test(line)) {
            show(line.trim());
            wanted = false;
          }
        }
      }
      continue;
    }
    if (name === 'recon_cite') {
      const head = /^\[S(\d{1,4})\] /.exec(text);
      // The last fingerprint line is Recon's: a title or an author as shown comes before it.
      const print = [...text.matchAll(/^Text fingerprint \(SHA-256\): ([0-9a-f]{64})/gm)].at(-1);
      if (head) floor = Math.max(floor, Number(head[1]));
      if (head && print) fullPrint.set(Number(head[1]), print[1]);
      continue;
    }
    if (name === 'recon_onion_read') {
      // Only when the whole answer is Recon's sentence: the same words in a page's text do not count.
      const redirect = REDIRECT.exec(text);
      if (redirect && onionAddress(redirect[1]).ok) show(redirect[2]);
    }
    const part = partOf(name, text);
    if (!part) continue;
    floor = Math.max(floor, part.n);
    if (part.kind === 'onion') {
      show(part.url);
      for (const address of linksIn(text, part)) show(address);
    }
    const key = `${part.kind} ${part.url}`;
    const known = byKey.get(key);
    // Read again later (another fetch, another fingerprint): the later reading counts.
    const entry = known && known.prefix === part.prefix ? known : { ...part, pieces: new Map() };
    if (part.body !== undefined) entry.pieces.set(part.part, part.body);
    Object.assign(entry, { n: part.n, parts: part.parts, retrieved: part.retrieved, title: part.title || entry.title, cut: part.cut, status: part.status });
    byKey.set(key, entry);
  }

  // A number the assistant or a condensed summary mentions: such a source may no longer be in the
  // history, and its number must not be given to another one. A page can make the assistant write
  // any number, so one far above Recon's own (or above MENTION_CAP) does not count.
  const notes = [];
  for (const message of list) {
    const condensed = message?.role === 'user' && (message?.source?.kind === 'compact-checkpoint' || textOf(message).includes(SUMMARY_MARK));
    if (message?.role === 'assistant' || condensed) seeNumbers(textOf(message));
    // What the assistant wrote, for the export, as the running app keeps it.
    if (message?.role === 'assistant' && textOf(message).trim()) notes.push(textOf(message).trim());
    // An address in the user's own words is one the conversation may open.
    if (message?.role === 'user' && message?.source?.kind === 'user') for (const url of onionAddressesIn(textOf(message))) show(url);
  }
  const ceiling = Math.min(floor + MENTION_MARGIN, MENTION_CAP);
  for (const n of mentioned) if (n <= ceiling) floor = Math.max(floor, n);

  const taken = new Map();
  for (const entry of byKey.values()) {
    const whole = entry.pieces.size === entry.parts && [...Array(entry.parts).keys()].every((index) => entry.pieces.has(index + 1));
    let text = '';
    let print = '';
    if (whole) {
      const joined = [...Array(entry.parts).keys()].map((index) => entry.pieces.get(index + 1)).join('');
      for (const candidate of EMPTY.includes(joined) ? [joined, ''] : [joined]) {
        if (sha(candidate).startsWith(entry.prefix)) {
          text = candidate;
          print = sha(candidate);
          break;
        }
      }
    }
    const partial = !print;
    if (partial) {
      text = [...Array(entry.parts).keys()].map((index) => (entry.pieces.has(index + 1) ? entry.pieces.get(index + 1) : `\n[Part ${index + 1} of ${entry.parts} was not read in this thread.]\n`)).join('');
      const cited = fullPrint.get(entry.n);
      if (cited?.startsWith(entry.prefix)) print = cited;
    }
    const at = Date.parse(entry.retrieved);
    const source = {
      n: entry.n, kind: entry.kind, url: entry.url, title: entry.title.slice(0, 300), text, bytes: 0, cut: entry.cut, author: entry.author, date: entry.date,
      group: entry.group, messageId: entry.messageId, original: entry.original, captured: entry.captured, at: Number.isFinite(at) ? at : 0, retrieved: entry.retrieved,
      sha256: print, prefix: entry.prefix, via: entry.via, status: entry.status, partial, restored: true,
    };
    // Two sources never share a number.
    taken.set(source.n, source);
  }
  return { sources: [...taken.values()].sort((a, b) => a.n - b.n), shown: [...shown], floor, notes };
}
