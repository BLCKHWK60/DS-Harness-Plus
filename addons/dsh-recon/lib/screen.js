/**
 * The filters that keep Recon away from sexual material involving minors. Three layers, each of
 * which only ever drops:
 *   1. the search engine is one that filters its index;
 *   2. the engine's published blocklist of banned sites, checked before every address is opened;
 *   3. a screen of words on what the user asks for, on result titles, descriptions and addresses,
 *      on page titles and text, and on newsgroup names.
 * A match is dropped where it is found: not handed to the model, not kept, not tried again. Only
 * the count is reported. No filter is perfect; these make such material unlikely to be met and
 * impossible to fetch as a picture, since Recon never asks for anything but text.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Words that are about this and little else. One is enough. */
const HARD = [
  'pedo', 'paedo', 'pedophil', 'paedophil', 'pthc', 'ptsc', 'preteen', 'pre-teen', 'jailbait', 'lolita', 'lolicon', 'shotacon', 'hebephil',
  'childporn', 'child porn', 'child-porn', 'kiddie porn', 'kiddy porn', 'kidporn', 'kinderporn', 'kinderporno', 'child sex', 'childsex', 'child abuse material', 'child exploitation material',
  'csam', 'cp link', 'cp links', 'cp video', 'cp videos', 'cp pack', 'cp collection', 'cp forum', 'underage sex', 'underage porn', 'underage nude', 'minor sex', 'minors sex', 'incest kid', 'toddlercon', 'babyj', 'hurtcore', 'boylover', 'girllover', 'boy lover', 'girl lover', 'boylove', 'nepi',
];
/** Words about the young, and words about sex. One of each, close together, counts. */
const YOUNG = ['child', 'children', 'kid', 'kids', 'kiddie', 'minor', 'minors', 'underage', 'under-age', 'teen', 'teens', 'schoolgirl', 'schoolboy', 'young girl', 'young boy', 'little girl', 'little boy', 'toddler', 'infant', 'baby', 'tween', 'boys', 'girls', 'yo girl', 'yo boy', 'jb', 'loli', 'shota', 'kinder', 'enfant', 'niña', 'niño'];
const SEXUAL = ['porn', 'porno', 'sex', 'sexual', 'nude', 'nudes', 'naked', 'xxx', 'erotic', 'erotica', 'rape', 'molest', 'fuck', 'hardcore', 'nsfw', 'onlyfans', 'webcam', 'cam girl', 'lust', 'hentai', 'fetish', 'incest'];

const flat = (text) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();
// Letters written apart ("p-t-h-c") are read as the word they spell.
const fold = (text) => flat(text).replace(/(?:^| )((?:[a-z] ){2,}[a-z])(?= |$)/g, (whole) => ` ${whole.replace(/ /g, '')}`).trim();
const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordList = (words) => new RegExp(`(?:^| )(?:${words.map((word) => escape(fold(word))).join('|')})(?= |$)`, 'g');
const HARD_RE = new RegExp(`(?:^| )(?:${HARD.map((word) => escape(fold(word))).join('|')})`, 'g');
const YOUNG_RE = wordList(YOUNG);
const SEXUAL_RE = wordList(SEXUAL);

/**
 * How strongly a piece of text points at such material.
 * @param {unknown} text - a query, a title, an address, a page.
 * @returns {{hard: number, pairs: number}} hard words found, and places where a word about the young stands within a few words of a word about sex.
 */
export function measure(text) {
  const flat = fold(text);
  if (!flat) return { hard: 0, pairs: 0 };
  const hard = (flat.match(HARD_RE) ?? []).length;
  let pairs = 0;
  const young = [...flat.matchAll(YOUNG_RE)].map((match) => match.index);
  if (young.length > 0) {
    const sexual = [...flat.matchAll(SEXUAL_RE)].map((match) => match.index);
    for (const at of young) if (sexual.some((other) => Math.abs(other - at) <= 60)) pairs += 1;
  }
  return { hard, pairs };
}

/** @returns {boolean} whether a short piece (a query, a title, an address, a group name) is dropped. Short text gets no benefit of the doubt. */
export function dropsShort(text) {
  const { hard, pairs } = measure(text);
  return hard > 0 || pairs > 0;
}

/** @returns {boolean} whether a whole page is dropped: its title as a short piece, its text when the words keep coming. */
export function dropsPage(title, text) {
  if (dropsShort(title)) return true;
  const { hard, pairs } = measure(String(text ?? '').slice(0, 200_000));
  return hard >= 2 || pairs >= 3 || (hard >= 1 && pairs >= 1);
}

/** The registered part of an .onion name: the 56 characters and ".onion", without names in front. */
export function onionDomain(host) {
  return /([a-z2-7]{56}\.onion)$/.exec(String(host ?? '').toLowerCase())?.[1] ?? '';
}

/** The fingerprint a blocklist holds for a site: the MD5 sum of its name. */
export const fingerprint = (host) => createHash('md5').update(onionDomain(host)).digest('hex');

/**
 * The engine's blocklist of banned sites, kept as fingerprints. It is fetched through Tor, kept
 * in one small file, and fetched again when it is older than a day. Without a list, nothing is read.
 * @param {string} file - where it is kept; '' keeps it in memory.
 * @param {number} [maxAgeMs] - how old it may be.
 * @returns {object} the list.
 */
export function openBlocklist(file, maxAgeMs = 24 * 3600_000) {
  let set = new Set();
  let at = 0;
  let from = '';
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(read?.hashes) && Number.isFinite(read.at)) {
        set = new Set(read.hashes.filter((hash) => /^[0-9a-f]{32}$/.test(hash)));
        at = read.at;
        from = String(read.from ?? '');
      }
    } catch {
      set = new Set();
    }
  }
  return {
    /** @returns {boolean} whether there is a list at all. */
    ready: () => set.size > 0,
    /** @returns {boolean} whether it should be fetched again. `source` is the engine it must come from. */
    stale: (source, now = Date.now()) => set.size === 0 || now - at > maxAgeMs || from !== String(source ?? ''),
    /** Take a freshly fetched list. A list that is far too short is not believed. */
    take(hashes, source, now = Date.now()) {
      const clean = [...new Set((hashes ?? []).filter((hash) => /^[0-9a-f]{32}$/.test(hash)))];
      if (clean.length < 1000) throw new Error('The blocklist that arrived is too short to be the real one.');
      set = new Set(clean);
      at = now;
      from = String(source ?? '');
      if (file) {
        mkdirSync(dirname(file), { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify({ at, from, hashes: clean }));
        renameSync(temp, file);
      }
    },
    /** @returns {boolean} whether the site is banned. */
    bans: (host) => set.has(fingerprint(host)),
    info: () => ({ size: set.size, at, from }),
  };
}
