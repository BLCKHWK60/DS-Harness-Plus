/**
 * Split Plus: the rules for a set of panes, kept apart from the page that draws them (the tiling) so the
 * tiling can be replaced without touching them. Pure functions: the server half, the page and the tests
 * use the same ones.
 */

/** The most panes one Split page holds (the owner's prompt: two or more; the app's own dock stops at 4). */
export const MAX_PANES = 4;

/** A pane id: short, made of letters, digits and dashes. */
const PANE_ID = /^[a-z0-9-]{1,40}$/i;
/** A conversation id as the app writes them. */
const SESSION_ID = /^[A-Za-z0-9._:-]{1,200}$/;
/** Names no conversation has, which mean something else to a JavaScript object. */
const NOT_IDS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Whether a value can be a conversation id (letters, digits, `.`, `_`, `:`, `-`; at most 200).
 * @param {unknown} value - from a request.
 * @returns {boolean}
 */
export function isSessionId(value) {
  const text = String(value ?? '');
  return SESSION_ID.test(text) && !NOT_IDS.has(text);
}

/**
 * Clean a list of panes read from storage or a request: unknown fields dropped, bad rows left out,
 * a conversation shown at most once, at most MAX_PANES.
 * @param {unknown} value - the stored list.
 * @returns {{id: string, sessionId: string}[]} the panes, in order.
 */
export function cleanPanes(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const panes = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id ?? '');
    const sessionId = String(row.sessionId ?? '');
    if (!PANE_ID.test(id) || !isSessionId(sessionId) || seen.has(sessionId) || panes.some((pane) => pane.id === id)) continue;
    seen.add(sessionId);
    panes.push({ id, sessionId });
    if (panes.length === MAX_PANES) break;
  }
  return panes;
}

/**
 * Whether a path names a folder of Recon's: one of its parts starts "dsh-recon", in any capitals (the
 * room, a test room, Recon's export folders). The server also checks the real path (lib/files.js).
 * @param {string} path - a path.
 * @returns {boolean}
 */
export function reconNamed(path) {
  return String(path ?? '').split('/').some((part) => part.toLowerCase().startsWith('dsh-recon'));
}

/**
 * Where a new pane opens, from the pane it is split from (the owner's rule: the same folder).
 * Recon never shares a folder: a Recon pane opens in Recon's own room, and a pane split from a Recon
 * pane never opens in that room.
 * @param {{from?: {cwd?: string, sealed?: boolean}, choice: 'same'|'scratch'|'folder', folder?: string, sealedMode: boolean, room?: string, rooms?: string[]}} input
 *   `room`: the new pane's own room when its tab is sealed; `rooms`: every sealed tab's room, where no other pane may open.
 * @returns {{kind: 'cwd', cwd: string} | {kind: 'scratch'} | {kind: 'refused', why: string}} where to start it.
 */
export function placeOfNewPane({ from, choice, folder = '', sealedMode, room = '', rooms = [] }) {
  const sealedRooms = [room, ...(Array.isArray(rooms) ? rooms : [])].map((one) => String(one ?? '')).filter(Boolean);
  const inARoom = (path) => reconNamed(path) || sealedRooms.some((one) => sameFolder(path, one) || String(path).replace(/^\/private(?=\/(tmp|var)\/)/, '').startsWith(`${one.replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '')}/`));
  if (sealedMode) {
    if (!room) return { kind: 'refused', why: 'Recon\'s own room is not known (is the Recon add-on on?), and a sealed mode never works in a shared folder.' };
    if (!reconNamed(room)) return { kind: 'refused', why: 'That is not Recon\'s room: a sealed mode works only in its own room.' };
    return { kind: 'cwd', cwd: room };
  }
  if (choice === 'scratch') return { kind: 'scratch' };
  if (choice === 'folder') {
    const path = String(folder ?? '').trim();
    if (!path.startsWith('/')) return { kind: 'refused', why: 'Pick a folder with a full path.' };
    if (inARoom(path)) return { kind: 'refused', why: 'Recon\'s room belongs to Recon alone.' };
    return { kind: 'cwd', cwd: path };
  }
  if (from?.sealed) return { kind: 'scratch' };
  const cwd = String(from?.cwd ?? '');
  if (!cwd) return { kind: 'scratch' };
  if (inARoom(cwd)) return { kind: 'scratch' };
  return { kind: 'cwd', cwd };
}

/**
 * Whether two paths name the same folder, ignoring a trailing slash and macOS's /private prefix for /tmp.
 * @param {string} a - a path.
 * @param {string} b - a path.
 * @returns {boolean}
 */
export function sameFolder(a, b) {
  const plain = (path) => String(path ?? '').replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '');
  return plain(a) !== '' && plain(a) === plain(b);
}

/**
 * A short name for a folder: its last part, or "Scratch" for a Scratch folder.
 * @param {string} cwd - the folder.
 * @param {string} [scratchRoot] - the Scratch folder, when known.
 * @returns {string}
 */
export function folderLabel(cwd, scratchRoot = '') {
  const path = String(cwd ?? '').replace(/\/+$/, '');
  if (!path) return '';
  if (scratchRoot && (path === scratchRoot.replace(/\/+$/, '') || path.startsWith(`${scratchRoot.replace(/\/+$/, '')}/`))) return 'Scratch';
  if (/\/scratch\/[^/]+$/.test(path)) return 'Scratch';
  return path.split('/').pop() || path;
}

/**
 * The few letters a narrow pane shows for its mode: the first three letters of a one-word name (Code is
 * "Cod", Content "Con", Research "Res", Recon "Rec"), or the first letters of its words, at most 3.
 * @param {string} label - the mode's name.
 * @returns {string}
 */
export function abbreviation(label) {
  const words = String(label ?? '').trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 3).replace(/^./, (c) => c.toUpperCase());
  return words.slice(0, 3).map((word) => word[0].toUpperCase()).join('');
}

/**
 * A pane's state in words: working, waiting for you, or done.
 * @param {{running?: boolean, waiting?: boolean, blank?: boolean}} facts
 * @returns {'working'|'waiting'|'done'|'new'}
 */
export function paneState({ running = false, waiting = false, blank = false }) {
  if (waiting) return 'waiting';
  if (running) return 'working';
  if (blank) return 'new';
  return 'done';
}
