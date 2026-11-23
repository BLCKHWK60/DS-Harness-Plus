/**
 * Item 4A, stage 1: spaces underneath, nothing visible (ITEM4A-PLAN.md, appendix A1 and A4; the owner's answers of
 * 22 November 2026, REVIEW-REQUIREMENTS-1.md 1.5 point 24).
 *
 * A space is where a thread lives (Chat, Code, Devices, Recon, Workshop); a mode is how it works. Today a tab and a mode
 * are the same thing, so every thread's space is worked out from its mode with the map below. Every mode keeps its id,
 * so threads, automations (their `runTab`), preset locks, colours and Recon sealing keep working as they are.
 *
 * Stage 1 only adds the map, a space label per thread (`sessionSpaces`, filled from the mode) and read-through helpers
 * for what is already stored (tab order, last open thread, trash, projects, preset locks). Nothing stored is rewritten:
 * `tabOrder`, `maxTabs`, `lastOpen`, the stored tab and every mode-keyed setting stay exactly as they are.
 *
 * Pure, so it is tested without the app.
 *
 Stage 3a (live): `sessionSpaces` places every thread. The Cowork sidebar keeps a copy of `MODE_SPACE`, `SPACE_TAB`,
 * `spaceOrderFrom`, `lastOpenBySpace` and `spaceOfTrashItem` in its page file (its test checks the copy against this
 * one); `locksBySpace` is read by the preset lock (lib/presetlock.js lockInSpace).
 */

/** The five spaces, in their first order. */
export const SPACE_IDS = Object.freeze(['chat', 'code', 'devices', 'recon', 'workshop']);

/**
 * The space table (A1). `startMode`: the mode a new thread of the space starts in (Chat's is Plain chat since stage 4;
 * the owner's `spaceSettings` can name another). `requires`: what must be there for the space to show (Chat always; Code by default). `colour`: the
 * existing Recon red and Devices violet. `rulesId`: room for the space's own rules (Part B).
 */
export const SPACES = Object.freeze([
  Object.freeze({ id: 'chat', label: 'Chat', icon: 'chat', colour: '', startMode: 'plain', requires: Object.freeze({}), rulesId: 'chat' }),
  Object.freeze({ id: 'code', label: 'Code', icon: 'code', colour: '', startMode: 'code', requires: Object.freeze({}), rulesId: 'code' }),
  Object.freeze({ id: 'devices', label: 'Devices', icon: 'devices', colour: 'violet', startMode: 'bench', requires: Object.freeze({ modes: Object.freeze(['bench']) }), rulesId: 'devices' }),
  Object.freeze({ id: 'recon', label: 'Recon', icon: 'recon', colour: 'red', startMode: 'recon', requires: Object.freeze({ modes: Object.freeze(['recon']) }), rulesId: 'recon' }),
  Object.freeze({ id: 'workshop', label: 'Workshop', icon: 'workshop', colour: '', startMode: 'creator-plus', requires: Object.freeze({ modes: Object.freeze(['creator-plus']), addons: Object.freeze(['tuning']) }), rulesId: 'workshop' }),
]);

/**
 * The space of each known mode id (A1, section 2.2). Devices keeps its inner id `bench`. Every other mode, the owner's
 * own modes included, lives in Chat.
 */
export const MODE_SPACE = Object.freeze({
  plain: 'chat',
  chat: 'chat',
  cowork: 'chat',
  research: 'chat',
  scout: 'chat',
  finance: 'chat',
  data: 'chat',
  content: 'chat',
  automations: 'chat',
  code: 'code',
  bench: 'devices',
  recon: 'recon',
  'creator-plus': 'workshop',
});

/** Default ticks (A1): the spaces each mode is offered in. Code only, not stored; an owner's change goes into `modeSpaces`. */
export const DEFAULT_TICKS = Object.freeze({
  plain: Object.freeze(['chat', 'code']),
  chat: Object.freeze(['chat']),
  cowork: Object.freeze(['chat']),
  code: Object.freeze(['code']),
  research: Object.freeze(['chat', 'code']),
  data: Object.freeze(['chat', 'code']),
  scout: Object.freeze(['chat']),
  finance: Object.freeze(['chat']),
  content: Object.freeze(['chat']),
  automations: Object.freeze(['chat']),
  bench: Object.freeze(['devices']),
  recon: Object.freeze(['recon']),
  'creator-plus': Object.freeze(['workshop']),
});

/**
 * Spaces whose safety comes from their own mode today (Recon sealing, Devices guards, the Creator Plus guard). Until
 * the space carries those rules for any mode (stage 6a), only that mode runs there: other modes' ticks for these spaces
 * are shown greyed ("Available once this space's rules are built", the owner's answer) and never take effect.
 */
export const GUARDED = Object.freeze({ devices: 'bench', recon: 'recon', workshop: 'creator-plus' });
/** Fix round: the add-on whose "Offer the … mode" switch brings each guarded space's own mode (its Settings page id = the mode id). */
export const GUARDED_ADDON = Object.freeze({ bench: 'Devices', recon: 'Recon', 'creator-plus': 'Creator Plus' });
/**
 * Item 4A, stage 6a: on. A guarded space offers other modes too, each under the space's own rules (lib/spacerules.js);
 * at run time a non-home tick is open only while the space's guard is ready (`ready`, from Modes' guardReady): Recon
 * needs a Recon that knows its space (apiVersion 3), Devices a Bench that guards guests, Workshop the Creator Plus mode
 * and a Creator Plus that guards guests. Otherwise the tick is greyed with what to switch on or update (I25).
 */
export const GUARDED_OPEN = true;
/** The owner's words beside a greyed tick. */
export const GUARDED_REASON = "Available once this space's rules are built";

/**
 * Whether a thread's recorded space decides where it lives. Stage 1 had it off (tabs decided, and a thread moved to
 * another tab showed there, so its space followed its mode). Stage 3a switches it on: the five space buttons replace the
 * tabs (the owner's answer: no "Spaces or Tabs" setting), and one more fill with `refresh` (`spacesRefreshed`, once)
 * makes every recorded space match where the owner last put the thread. From then on a mode change never moves a thread.
 */
export const SPACES_LIVE = true;

/**
 * The one switch stages 2 to 5 read (item 4A): spaces are live. `SPACES_LIVE` above. In a lab or a test only, the
 * environment variable DSH_SPACES_LAB says otherwise: '1' turns it on, '0' off (to check that the old tab paths still
 * behave), as DSH_TOOL_ACCESS_LAB does for Tool access. Never set by a release.
 * @param {Record<string, string | undefined>} [env] - the environment (process.env).
 * @returns {boolean}
 */
export function spacesLive(env = globalThis.process?.env) {
  if (env?.DSH_SPACES_LAB === '0') return false;
  return SPACES_LIVE || env?.DSH_SPACES_LAB === '1';
}

/**
 * The tab id that stands for each space where a tab id is stored (a trash entry's `tab`, a project's `tab`, the preset
 * lock keys): read back with spaceOfTab, so stored files keep tab ids and the old layout still reads them.
 */
export const SPACE_TAB = Object.freeze({ chat: 'chat', code: 'code', devices: 'bench', recon: 'recon', workshop: 'creator-plus' });

/** Preset-lock keys that become space keys (A4); every other key stays per mode (the Automations mode keeps its own). */
export const LOCK_KEY_SPACE = Object.freeze({ recon: 'recon', bench: 'devices', 'creator-plus': 'workshop' });

const isText = (value) => typeof value === 'string' && value !== '';

/**
 * Item 4A, stage 6a: why a non-home tick of a guarded space is greyed now ('' when it is open).
 * @param {string} space - the space.
 * @param {Record<string, unknown> | undefined} ready - guardReady(): `true`, 'off' or 'old' per guarded space. Missing:
 *   not ready (fail closed; Modes always passes it).
 * @param {string} [lang]
 * @returns {string}
 */
export function guardedReason(space, ready, lang = 'en') {
  if (!Object.hasOwn(GUARDED, space)) return '';
  if (!GUARDED_OPEN) return GUARDED_REASON;
  const state = ready?.[space];
  if (state === true) return '';
  const words = SETTINGS_WORDS[langOf(lang)];
  return state === 'old' ? words.needsUpdate[space] : state === 'plugin' ? words.needsPlugin[space] : words.needsAddon[space];
}

/** @returns {boolean} whether the id is one of the five spaces. */
export function isSpace(id) {
  return SPACE_IDS.includes(id);
}

/**
 * The space a mode lives in: its own for the known modes, Chat for every other (add-on modes without an entry, your own).
 * @param {string} modeId - a mode id.
 * @returns {string} a space id.
 */
export function spaceOfMode(modeId) {
  return Object.hasOwn(MODE_SPACE, String(modeId ?? '')) ? MODE_SPACE[modeId] : 'chat';
}

/**
 * The space a tab id gives (a tab is a mode id today): the stored tab, `lastOpen` keys, trash `tab`, project `tab`,
 * an automation's `runTab`. Unknown or empty: undefined.
 * @param {unknown} tabId - the stored tab.
 * @returns {string | undefined}
 */
export function spaceOfTab(tabId) {
  return isText(tabId) ? spaceOfMode(tabId) : undefined;
}

/**
 * The spaces a mode is offered in: the owner's ticks (`modeSpaces`) when there are any, else the defaults; a mode with no
 * default (your own, an add-on's) is offered in Chat. A tick for a guarded space other than the mode's own is kept but
 * greyed until stage 6a.
 * @param {string} modeId - the mode.
 * @param {Record<string, unknown>} [modeSpaces] - the stored owner ticks `{ modeId: [{ space, adjust }] | [spaceId] }`.
 * @param {{ready?: object, lang?: string}} [options] - stage 6a: guardReady() and the language of the reason.
 * @returns {Array<{space: string, greyed: boolean, reason: string}>}
 */
export function ticksOfMode(modeId, modeSpaces = {}, { ready, lang = 'en' } = {}) {
  const id = String(modeId ?? '');
  // Stage 5: a stored list is the owner's choice, also an empty one (the mode is then offered in no space; its threads keep
  // it). A list with entries of which none is a space (a hand edit) counts as no choice: the defaults.
  const list = modeSpaces && Object.hasOwn(modeSpaces, id) && Array.isArray(modeSpaces[id]) ? modeSpaces[id] : null;
  const own = list ? list.map((tick) => (typeof tick === 'string' ? tick : tick?.space)).filter(isSpace) : [];
  const spaces = list && (list.length === 0 || own.length > 0) ? [...new Set(own)] : [...(DEFAULT_TICKS[id] ?? ['chat'])];
  // A mode that keeps a guarded space safe today stays only there (Creator Plus is not offered elsewhere: item 8).
  const home = Object.entries(GUARDED).find(([, mode]) => mode === id)?.[0];
  const kept = home ? [home] : spaces;
  return kept.map((space) => {
    const reason = Object.hasOwn(GUARDED, space) && GUARDED[space] !== id ? guardedReason(space, ready, lang) : '';
    return { space, greyed: reason !== '', reason };
  });
}

/**
 * @param {string} modeId - the mode.
 * @param {Record<string, unknown>} [modeSpaces] - the owner's ticks.
 * @returns {string[]} the spaces where the mode can be picked now (greyed ticks left out).
 */
export function spacesOfMode(modeId, modeSpaces = {}, options = {}) {
  return ticksOfMode(modeId, modeSpaces, options).filter((tick) => !tick.greyed).map((tick) => tick.space);
}

/**
 * The modes offered in a space, in the order given.
 * @param {string} spaceId - the space.
 * @param {Array<{id: string, label?: string}>} modes - the available modes.
 * @param {Record<string, unknown>} [modeSpaces] - the owner's ticks.
 * @param {{ready?: object, lang?: string}} [options] - stage 6a: guardReady() and the language of a greyed row's reason.
 * @returns {Array<{id: string, label: string, greyed: boolean, reason: string}>} `greyed`: ticked, but the space's guard is not ready.
 */
export function modesInSpace(spaceId, modes, modeSpaces = {}, options = {}) {
  if (!isSpace(spaceId)) return [];
  const out = [];
  for (const mode of modes ?? []) {
    const tick = ticksOfMode(mode?.id, modeSpaces, options).find((one) => one.space === spaceId);
    if (tick) out.push({ id: mode.id, label: String(mode.label ?? mode.id), greyed: tick.greyed, reason: tick.greyed ? tick.reason : '' });
  }
  return out;
}

/**
 * The space a thread's folder suggests, for a thread with no recorded mode (A1, as today's guess): no folder = Chat,
 * the default workspace = Chat (in that project), any other folder = Code.
 * @param {{path?: string, title?: string} | null | undefined} workspace - the thread's project.
 * @returns {string}
 */
export function guessSpace(workspace) {
  if (!workspace) return 'chat';
  if (/(^|\/)default-workspace\/?$/.test(String(workspace.path ?? '')) || workspace.title === 'default-workspace') return 'chat';
  return 'code';
}

/**
 * The space of a thread. While tabs decide (stage 1), its mode decides, as its tab does today; once spaces are live, its
 * recorded space (a thread never changes space). Either way: recorded space, else its mode's space, else its folder.
 * @param {string} sessionId - the thread.
 * @param {{sessionSpaces?: object, sessionModes?: object, workspace?: object | null, live?: boolean}} data - what is stored.
 * @returns {string} a space id.
 */
export function spaceOfThread(sessionId, { sessionSpaces = {}, sessionModes = {}, workspace = null, live = spacesLive() } = {}) {
  const recorded = sessionSpaces?.[sessionId];
  const mode = sessionModes?.[sessionId];
  if (!live && isText(mode)) return spaceOfMode(mode);
  if (isSpace(recorded)) return recorded;
  if (isText(mode)) return spaceOfMode(mode);
  return guessSpace(workspace);
}

/**
 * The one-time fill (A4): every thread with a recorded mode and no recorded space gets the space of its mode. Nothing
 * else changes: every entry already stored stays exactly as it is, also one that is not one of the five spaces (a hand
 * edit, or a later version's space after a downgrade; `spaceOfThread` passes over it). `refresh` (for the switch-over to
 * spaces, stage 3a) also corrects a recorded space that no longer matches the mode, because under tabs a move between
 * tabs is a move between spaces; it too leaves an unknown value alone.
 * @param {Record<string, unknown>} sessionModes - stored modes.
 * @param {Record<string, unknown>} sessionSpaces - stored spaces.
 * Stage 6a (I21): `keep` (threads marked sealed, or whose saved folder is Recon's room) are never moved by `refresh`,
 * nor is any thread recorded in a guarded space; in the add branch a `keep` thread gets Recon, unless its stored mode is
 * itself an owner's isolated mode (`isolatedModes`), which keeps that mode's own space.
 * @param {{refresh?: boolean, keep?: Set<string>, isolatedModes?: string[]}} [options]
 * @returns {{next: Record<string, unknown>, added: number, changed: number}}
 */
export function fillSpaces(sessionModes, sessionSpaces, { refresh = false, keep = new Set(), isolatedModes = [] } = {}) {
  const stored = sessionSpaces && typeof sessionSpaces === 'object' && !Array.isArray(sessionSpaces) ? sessionSpaces : {};
  const next = { ...stored };
  const has = (id) => Object.hasOwn(next, id) && next[id] !== undefined && next[id] !== null && next[id] !== '';
  let added = 0;
  let changed = 0;
  for (const [id, mode] of Object.entries(sessionModes ?? {})) {
    if (!isText(mode)) continue;
    const kept = keep?.has?.(id) === true;
    const space = kept && !(isolatedModes.includes(mode) && mode !== 'recon') ? 'recon' : spaceOfMode(mode);
    if (!has(id)) {
      next[id] = space;
      added += 1;
    } else if (refresh && (kept || Object.hasOwn(GUARDED, next[id]))) {
      continue;
    } else if (refresh && isSpace(next[id]) && next[id] !== space) {
      next[id] = space;
      changed += 1;
    }
  }
  return { next, added, changed };
}

/**
 * The space order, read from today's tab order without changing it (A4): the first time each space's tab appears, then
 * the spaces not named, in their first order.
 * @param {unknown} tabOrder - the stored `tabOrder`.
 * @returns {string[]}
 */
export function spaceOrderFrom(tabOrder) {
  const out = [];
  for (const tab of Array.isArray(tabOrder) ? tabOrder : []) {
    const space = spaceOfTab(tab);
    if (space && !out.includes(space)) out.push(space);
  }
  for (const space of SPACE_IDS) if (!out.includes(space)) out.push(space);
  return out;
}

/**
 * Each space's last open thread, read from the stored `lastOpen` (`{ tabId: sessionId }`) without changing it: the
 * space's own tab first (Chat for Chat, Devices' `bench`, …), then its other tabs in the tab order given.
 * @param {unknown} lastOpen - the stored value.
 * @param {unknown} [tabOrder] - the stored tab order.
 * @returns {Record<string, string>}
 */
export function lastOpenBySpace(lastOpen, tabOrder = []) {
  const stored = lastOpen && typeof lastOpen === 'object' && !Array.isArray(lastOpen) ? lastOpen : {};
  const order = [...Object.values(SPACE_TAB), ...(Array.isArray(tabOrder) ? tabOrder : []), ...Object.keys(stored)];
  const out = {};
  for (const tab of order) {
    const id = stored[tab];
    const space = spaceOfTab(tab);
    if (space && isText(id) && out[space] === undefined) out[space] = id;
  }
  return out;
}

/**
 * The space of a deleted thread in the trash (its `tab`, else `fallbackTab`), read without rewriting the file.
 * @param {{tab?: string, fallbackTab?: string, space?: string}} item - a trash entry.
 * @returns {string | undefined}
 */
export function spaceOfTrashItem(item) {
  if (isSpace(item?.space)) return item.space;
  return spaceOfTab(item?.tab) ?? spaceOfTab(item?.fallbackTab);
}

/**
 * The space of a project entry (`projects.json`): its `space` once one is saved, else the space of its `tab`.
 * @param {{tab?: string, space?: string}} entry - a project entry.
 * @returns {string | undefined}
 */
export function spaceOfProject(entry) {
  if (isSpace(entry?.space)) return entry.space;
  return spaceOfTab(entry?.tab);
}

/**
 * Today's preset locks read by space (A4): Recon, Devices (`bench`) and Creator Plus become their spaces' locks; every
 * other key (Automations above all) stays a per-mode lock. Only stored keys are read; defaults stay where they are.
 * @param {Record<string, unknown>} locks - the stored `presetLock` object.
 * @returns {{spaces: Record<string, string>, modes: Record<string, string>}}
 */
export function locksBySpace(locks) {
  const spaces = {};
  const modes = {};
  for (const [key, value] of Object.entries(locks && typeof locks === 'object' ? locks : {})) {
    if (!isText(value)) continue;
    if (Object.hasOwn(LOCK_KEY_SPACE, key)) spaces[LOCK_KEY_SPACE[key]] = value;
    else modes[key] = value;
  }
  return { spaces, modes };
}

/**
 * Which spaces are there now: Chat always; Code unless hidden; Devices, Recon and Workshop only while what they need is on.
 * @param {{modeIds?: string[], addons?: string[], spaceSettings?: object}} now - available mode ids, add-ons that are on,
 *   the stored `spaceSettings`.
 * @returns {Array<object>} the space rows with `available` and `shown`.
 */
export function spacesNow({ modeIds = [], addons = [], spaceSettings = {} } = {}) {
  return SPACES.map((space) => {
    const needModes = space.requires.modes ?? [];
    const needAddons = space.requires.addons ?? [];
    const available = (needModes.length === 0 && needAddons.length === 0) || needModes.some((id) => modeIds.includes(id)) || needAddons.some((id) => addons.includes(id));
    const hidden = space.id !== 'chat' && spaceSettings?.[space.id]?.shown === false;
    // `addonsOff`: the add-ons this space can show through that are off now (their Settings rows are left out).
    return { ...space, available, shown: available && !hidden, addonsOff: needAddons.filter((id) => !addons.includes(id)) };
  });
}

// ---- Stage 2: the Mode list in the chat box ------------------------------------------------------------------------

/**
 * One line per mode for the Mode list (the owner's mock-up, b-chat-box). A mode's own `description` (stage 5 adds the
 * field to the editor) wins; your own modes without one read "Your own mode."
 */
export const MODE_BLURBS = Object.freeze({
  en: Object.freeze({
    plain: 'No extra instructions. Uses the tools this space allows.',
    chat: 'Answers in one reply. Does not read or change files.',
    cowork: 'Plans the work, checks it, says what it changed.',
    code: 'Reads first, makes small changes, runs the tests.',
    research: 'Looks things up and cites its sources.',
    data: 'Reads tables and files and works out numbers.',
    finance: 'Money questions, briefs, your adviser setting.',
    scout: 'Searches for work across the markets you choose.',
    content: 'Writes posts, pages and other content.',
    automations: 'Talks about your automations and changes them.',
    bench: 'Works with your devices, inside Devices\' guards.',
    recon: 'Sealed research: what it reads stays in Recon.',
    'creator-plus': 'Builds and tunes add-ons, inside its own guard.',
    own: 'Your own mode.',
  }),
});

/** The shown names of the five spaces. Plus is English only; the `en` key stays because callers index by language. */
export const SPACE_NAMES = Object.freeze({
  en: Object.freeze({ chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' }),
});

// Plus is English only (decision 28): every language, Chinese included, gets the English words. Callers still pass `lang`.
const langOf = () => 'en';

/**
 * The built-in and add-on modes, each with the names it ships with (the first is its name now; the others are old names
 * the code still recognises). The keys tell a shipped mode from the owner's own. dsh-cowork-shell keeps a copy.
 */
export const SHIPPED_MODE_NAMES = Object.freeze({
  plain: Object.freeze({ en: Object.freeze(['Plain chat']) }),
  chat: Object.freeze({ en: Object.freeze(['Chat']) }),
  cowork: Object.freeze({ en: Object.freeze(['Cowork']) }),
  code: Object.freeze({ en: Object.freeze(['Code']) }),
  research: Object.freeze({ en: Object.freeze(['Research', 'Deep research']) }),
  data: Object.freeze({ en: Object.freeze(['Data']) }),
  finance: Object.freeze({ en: Object.freeze(['Finance']) }),
  scout: Object.freeze({ en: Object.freeze(['Scout']) }),
  content: Object.freeze({ en: Object.freeze(['Content']) }),
  automations: Object.freeze({ en: Object.freeze(['Automations']) }),
  bench: Object.freeze({ en: Object.freeze(['Devices', 'Bench', 'Bench Lab']) }),
  recon: Object.freeze({ en: Object.freeze(['Recon']) }),
  'creator-plus': Object.freeze({ en: Object.freeze(['Creator Plus']) }),
});

/**
 * A mode's shown name: its label as it is (Plus is English only; `lang` is accepted and ignored).
 * @param {{id?: string, label?: string}} mode
 * @param {string} [lang]
 * @returns {string}
 */
export function modeName(mode, lang = 'en') {
  const label = String(mode?.label ?? mode?.id ?? '');
  return label;
}

/**
 * @param {string} modeId - the mode.
 * @param {string} [lang] - the page's language (ignored: Plus is English only).
 * @param {unknown} [own] - the mode's own stored description.
 * @returns {string} its one line.
 */
export function modeBlurb(modeId, lang = 'en', own = undefined) {
  if (typeof own === 'string' && own.trim()) return own.trim().slice(0, 160);
  const words = MODE_BLURBS[langOf(lang)];
  return Object.hasOwn(words, String(modeId ?? '')) ? words[modeId] : words.own;
}

/**
 * The Mode list of a space, as the chat box shows it: Plain chat first, then the others in their order, greyed ones last;
 * each with its one line, a greyed one with its reason. Only modes ticked for the space are in it (modesInSpace).
 * @param {string} spaceId - the space.
 * @param {Array<{id: string, label?: string, description?: string}>} modes - the available modes.
 * @param {Record<string, unknown>} [modeSpaces] - the owner's ticks.
 * @param {string} [lang] - the page's language (ignored: Plus is English only).
 * @param {{ready?: object, lost?: Function}} [options] - stage 6a: guardReady(); `lost` (as for tickLines): what a mode
 *   loses in Devices or Workshop.
 * @returns {Array<{id: string, label: string, desc: string, greyed: boolean, reason: string, loses: string}>}
 */
export function modeList(spaceId, modes, modeSpaces = {}, lang = 'en', { ready, lost } = {}) {
  const byId = new Map((modes ?? []).map((mode) => [mode?.id, mode]));
  // Fix round (6a review): in a guarded space each guest row says what the space's rules take away (Devices, Workshop) or
  // that it is sealed (Recon), with the same words as Settings → Modes (tickLines).
  const losesOf = (row) => {
    if (row.greyed || !Object.hasOwn(GUARDED, spaceId) || GUARDED[spaceId] === row.id) return '';
    const lines = tickLines({ ...(byId.get(row.id) ?? {}), id: row.id, label: row.label }, spaceId, { lost, lang });
    return lines.warn || lines.note || '';
  };
  const rows = modesInSpace(spaceId, modes, modeSpaces, { ready, lang }).map((row) => ({ ...row, desc: modeBlurb(row.id, lang, byId.get(row.id)?.description), loses: losesOf(row) }));
  // Plain chat first, then the others in their order; a greyed one (waiting for its space's rules) at the end.
  const rank = (row) => (row.id === 'plain' && !row.greyed ? 0 : row.greyed ? 2 : 1);
  return [0, 1, 2].flatMap((step) => rows.filter((row) => rank(row) === step));
}

/**
 * The mode a new draft is claimed with as soon as it opens (A1): the one it already has (a reused draft, a pick made
 * before a restart) when the space offers it; else the mode of the tab it was opened from when the space offers that
 * (while the tabs are still on screen, stage 2); else the space's start mode (the owner's `spaceSettings`, else the
 * table's). Never a greyed mode.
 * @param {{space: string, stored?: string, tab?: string, offered: Array<{id: string, greyed?: boolean}>, spaceSettings?: object}} input
 * @returns {string | undefined} the mode; undefined when the space offers none.
 */
export function draftStartMode({ space, stored, tab, offered, spaceSettings = {} }) {
  const can = (id) => isText(id) && (offered ?? []).some((row) => row.id === id && row.greyed !== true);
  if (can(stored)) return stored;
  if (can(tab)) return tab;
  const own = spaceSettings?.[space]?.startMode;
  if (can(own)) return own;
  const table = SPACES.find((one) => one.id === space)?.startMode;
  if (can(table)) return table;
  return (offered ?? []).find((row) => row.greyed !== true)?.id;
}

/** The sentences a refused pick shows (the owner's rule: what went wrong and what to do next). */
const REFUSAL = Object.freeze({
  en: Object.freeze({
    unknown: 'There is no mode "{mode}". Pick one from the Mode list under the chat box.',
    notHere: '{mode} is not offered in {space}. Pick a mode from the list, or tick {space} for {mode} on Settings → Modes.',
    notHereGuarded: '{mode} is not offered in {space}: until this space\'s rules are built, {space} runs its own mode only. For {mode}, start a new thread in Chat or Code.',
    greyed: '{mode} cannot be used in {space} yet: {reason}.',
    greyedNow: '{mode} cannot be used in {space} now. {reason}',
    sealed: 'This thread is sealed (it ran in Recon), so its mode stays. To go on elsewhere, use Move to in its ⋯ menu in the left panel: it opens a new thread there and this one stays as it is.',
    toSealed: 'A thread that has already run cannot become sealed. Start a new thread in Recon instead.',
  }),
});

/** Fills the {name} gaps of a sentence; a gap with no value stays as written. */
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(values, key) ? String(values[key]) : all));

/**
 * Why a pick in the Mode list (or /mode) is refused, as a sentence; '' when it may go ahead. A thread never changes space:
 * only the modes ticked for its space can be picked, a greyed one not yet; and a sealed thread (Recon) keeps its mode.
 * @param {{space: string, modeId: string, modeLabel?: string, offered: Array<{id: string, greyed?: boolean}>, known: boolean,
 *   sealedRefusal?: string, lang?: string}} input - `sealedRefusal`: what Modes' own check said (lib/isolation.js), if anything.
 * @returns {string}
 */
export function modePickRefusal({ space, modeId, modeLabel, offered, known, sealedRefusal = '', lang = 'en' }) {
  const words = REFUSAL[langOf(lang)];
  const mode = isText(modeLabel) ? modeLabel : String(modeId ?? '');
  const spaceName = SPACE_NAMES[langOf(lang)][space] ?? String(space ?? '');
  if (!known) return fill(words.unknown, { mode });
  const row = (offered ?? []).find((one) => one.id === modeId);
  // A guarded space (Recon, Devices, Workshop) cannot be ticked for another mode before stage 6a: no tick is suggested.
  if (!row) return fill(!GUARDED_OPEN && Object.hasOwn(GUARDED, space) && GUARDED[space] !== modeId ? words.notHereGuarded : words.notHere, { mode, space: spaceName });
  // Stage 6a: a greyed row says why (the space's guard is off or too old, and where to switch it on).
  if (row.greyed && isText(row.reason) && GUARDED_OPEN) return fill(words.greyedNow, { mode, space: spaceName, reason: row.reason });
  if (row.greyed) return fill(words.greyed, { mode, space: spaceName, reason: GUARDED_REASON.charAt(0).toLowerCase() + GUARDED_REASON.slice(1) });
  if (sealedRefusal) return /cannot become (?:isolated|sealed)/.test(sealedRefusal) ? words.toSealed : words.sealed;
  return '';
}

/** At most this many mode changes are kept per thread (the quiet lines in the thread). */
export const CHANGES_MAX = 100;

/**
 * Record a mode change made after a thread's first message, for the quiet line in the thread ("Mode changed to
 * Research"). One line per turn: a second change after the same turn replaces the first, and a change back to where the
 * turn ended takes the line away.
 * @param {unknown} list - the thread's stored changes.
 * @param {{turn: number, from: string, to: string, at: number}} change - after which turn, from and to which mode.
 * @returns {Array<{turn: number, from: string, to: string, at: number}>} the new list.
 */
export function noteModeChange(list, { turn, from, to, at }) {
  const rows = (Array.isArray(list) ? list : []).filter((row) => row && Number.isInteger(row.turn) && isText(row.to));
  if (!Number.isInteger(turn) || turn < 0 || !isText(to) || from === to) return rows;
  const last = rows.at(-1);
  if (last && last.turn === turn) {
    const start = isText(last.from) ? last.from : from;
    const rest = rows.slice(0, -1);
    return start === to ? rest : [...rest, { turn, from: start, to, at }];
  }
  return [...rows, { turn, from, to, at }].slice(-CHANGES_MAX);
}

/**
 * The turn after which a change shows: the turn running now, else the last one that ran (the app's agent phase).
 * @param {{kind?: string, turn?: number, lastTurn?: number} | undefined} phase - the agent's phase.
 * @returns {number} 0 when it never ran.
 */
export function turnOfPhase(phase) {
  if (phase?.kind === 'running') return Number.isInteger(phase.turn) && phase.turn > 0 ? phase.turn : (Number(phase.lastTurn) || 0) + 1;
  return Number.isInteger(phase?.lastTurn) ? phase.lastTurn : 0;
}

// ---- Stage 3a: moving a thread to another space -----------------------------------------------------------------

/** What a refused move says (what went wrong and what to do next). */
const MOVE_WORDS = Object.freeze({
  en: Object.freeze({
    unknown: 'There is no space "{space}" to move to. Pick one of the space buttons at the top of the left panel.',
    hidden: '{space} is switched off or hidden, so nothing can move there. Show it again, then move the thread.',
    sealed: 'This thread is sealed (it ran in Recon), so it stays in Recon. Use Move to in its ⋯ menu: it opens a new thread in the other space and this one stays as it is.',
    toRecon: 'A thread cannot move into Recon: Recon threads start there, sealed. Start a new Recon search instead.',
    none: '{space} has no mode this thread could use. Tick a mode for {space} on Settings → Modes, then move it.',
    room: "This new thread is in Recon's room, so it stays in Recon. To work elsewhere, start a new thread in the other space.",
    programs: 'This thread ran the Terminal or a program since the app started, and {space} allows neither. Start a new thread in {space}, or restart the app first.',
    mission: 'This thread has a Mission that has not ended, and its checks would keep running under the rules it started with. End the Mission first, then move the thread to {space}.',
  }),
});

/**
 * A thread moved to another space (its ⋯ menu, "Move to <space>"): the thread's space changes, and its mode stays when
 * the new space offers it, else it becomes the new space's start mode (applied from the next message, as any mode change).
 * A sealed thread never moves (Recon opens a new thread elsewhere instead) and nothing moves into Recon.
 * @param {{to: string, from: string, current: string, sealed: boolean, room?: boolean, shown: string[], offered: Array<{id: string, greyed?: boolean}>,
 *   spaceSettings?: object, lang?: string}} input - `shown`: the spaces on screen now; `offered`: the modes of `to`; `room`: a
 *   new thread whose folder is Recon's room.
 * Stage 6a (I26): `ranPrograms`: the thread ran the Terminal or a program in this app run; it cannot move into Devices
 * or Workshop until the app restarts (background jobs end with the app). `missionLive`: a Mission of the thread has not
 * ended (its checks keep the rules it started with): no move into Devices or Workshop either.
 * @returns {{refusal: string, space?: string, mode?: string}} `mode` only when it changes.
 */
export function spaceMovePlan({ to, from, current, sealed, room = false, ranPrograms = false, missionLive = false, shown = [], offered = [], spaceSettings = {}, lang = 'en' }) {
  const words = MOVE_WORDS[langOf(lang)];
  const name = SPACE_NAMES[langOf(lang)][to] ?? String(to ?? '');
  if (!isSpace(to)) return { refusal: fill(words.unknown, { space: String(to ?? '').slice(0, 40) }) };
  if (sealed) return { refusal: words.sealed };
  // Fix round: a draft in Recon's room never leaves it (its folder is the room: only a sealed thread may work there).
  if (room && to !== 'recon') return { refusal: words.room };
  if (to === 'recon') return { refusal: words.toRecon };
  if (!shown.includes(to)) return { refusal: fill(words.hidden, { space: name }) };
  if (to === from) return { refusal: '', space: to };
  if (ranPrograms && (to === 'devices' || to === 'workshop')) return { refusal: fill(words.programs, { space: name }) };
  // Fix round (6a review): a Mission keeps the rules it started with; it must end before the thread moves into a guarded space.
  if (missionLive && (to === 'devices' || to === 'workshop')) return { refusal: fill(words.mission, { space: name }) };
  const keep = offered.some((row) => row.id === current && row.greyed !== true);
  if (keep) return { refusal: '', space: to };
  const mode = draftStartMode({ space: to, offered, spaceSettings });
  if (!mode) return { refusal: fill(words.none, { space: name }) };
  return { refusal: '', space: to, mode };
}

// ---- Stage 5: Settings → Spaces and the space ticks on Settings → Modes ---------------------------------------------

/** A mode's description (Settings → Modes): one line, at most this long. */
export const DESC_MAX = 160;

/** The kind of a mode on Settings → Modes: built in (Plain chat, Chat, Cowork, Code), an add-on's, or your own. */
export const BUILT_IN_IDS = Object.freeze(['plain', 'chat', 'cowork', 'code']);

/** What a refused change on Settings → Spaces or Settings → Modes says (what went wrong and what to do next). */
const SETTINGS_WORDS = Object.freeze({
  en: Object.freeze({
    noSpace: 'There is no space "{space}". Reload the page and try again.',
    noMode: 'There is no mode "{mode}". Reload the page and try again.',
    chatShown: 'Chat is always shown: something has to be there. You can hide any other space.',
    home: '{mode} stays in {space}: it carries that space\'s safety rules, so its ticks are fixed.',
    greyed: '{mode} cannot be ticked for {space} yet: {reason}.',
    lastMode: '{space} must offer at least one mode. Tick another mode for {space} first, then untick {mode}.',
    startGone: '{mode} is not offered in {space}. Tick {space} for {mode} on Settings → Modes first, or pick a mode from this list.',
    long: 'A description is one line of at most {n} characters. Shorten it, then save again.',
    homeReason: '{mode} stays in its own space, {space}: it carries that space\'s safety rules.',
    requires: Object.freeze({ devices: 'needs Devices', recon: 'needs Recon', workshop: 'needs Creator Plus or Tuner Plus' }),
    off: Object.freeze({ devices: 'The Devices add-on is off, so this space is not shown. Your choices here are kept.', recon: 'The Recon add-on is off, so this space is not shown. Your choices here are kept.', workshop: 'Creator Plus and Tuner Plus are off, so this space is not shown. Your choices here are kept.' }),
    // ---- Item 4A, stage 6a ----
    greyedNow: '{mode} cannot be ticked for {space} now. {reason}',
    needsAddon: Object.freeze({ devices: 'Needs Devices: switch it on in Settings → Devices.', recon: 'Needs Recon: switch it on in Settings → Recon.', workshop: 'Needs Creator Plus: switch it on in Settings → Creator Plus.' }),
    needsUpdate: Object.freeze({ devices: 'Needs a newer Devices: update it, then switch it off and on in Settings → Devices.', recon: 'Needs a newer Recon: update it in Settings → Recon.', workshop: 'Needs a newer Creator Plus: update it in Settings → Creator Plus.' }),
    needsPlugin: Object.freeze({ devices: 'Needs Devices: switch it on on the Plugins page.', recon: 'Needs Recon: switch it on on the Plugins page.', workshop: 'Needs Creator Plus: switch it on on the Plugins page.' }),
    tickNoPrograms: 'In {space}, {mode} loses: {lost}. The rules of {space} refuse them.',
    tickNoProgramsMore: 'and more',
    tickSealed: 'In Recon, {mode} is sealed: it goes online only through Recon\'s routes and keeps its files in Recon\'s room.',
    spaceFixed: 'This thread is in {space}, and a thread never changes space. To go on elsewhere, use Move to in its ⋯ menu.',
    reconRoomOnly: "Recon threads work only in Recon's room, and this thread's folder is somewhere else. Start it with the New button in Recon: it opens in the room.",
    roomOnlySealed: "This new thread is in Recon's room, so it can only use a mode Recon offers. Pick one from the Mode list, or start a new thread in another space.",
    guardHeld: 'This thread has no tools for now: the {addon} add-on is too old to guard it. {fix}',
    guardFix: Object.freeze({ devices: 'Update it, then switch it off and on in Settings → Devices.', recon: 'Update it in Settings → Recon.', workshop: 'Update it in Settings → Creator Plus.' }),
    needsAddonHeld: 'This new thread has no tools for now: the {addon} add-on is off. Switch it on in Settings → {addon}.',
    needsAddonHeldRan: 'This thread has no tools for now: the {addon} add-on is off. Switch it on in Settings → {addon}.',
    needsPluginHeld: 'This new thread has no tools for now: the {addon} add-on is off. Switch it on on the Plugins page.',
    needsPluginHeldRan: 'This thread has no tools for now: the {addon} add-on is off. Switch it on on the Plugins page.',
    heldLabel: 'No tools for now',
    unsortedTools: 'new tools not yet sorted in Tool access',
    // Lab fix (6a): the families the Mode list names as lost (lib/spacerules.js LOST_ORDER), in plain words.
    lostFamily: Object.freeze({ terminal: 'the Terminal', programs: 'programs', jobs: 'background jobs', connectors: 'connectors', mac: 'other Mac apps', office: 'Office files', schedules: 'schedules', engines: 'engines', helpers: 'helpers', deep: 'Deep research', web: 'the web', files: 'some file tools', pdf: 'PDF tools', library: 'your Library', data: 'data tools', codeMap: 'the code map', finance: 'finance data', learn: 'the learning tutor', memory: 'Memory', content: 'content tools', images: 'images', diagrams: 'diagrams', reports: 'reports', steps: 'the step list, questions and goals', creator: 'Creator Plus\'s own tools', tuning: 'writing skills and Tuner Plus (using skills stays)', appTools: 'the app\'s own tools (plugins, workflows)', unsorted: 'new tools not yet sorted in Tool access' }),
    baseNoPrograms: '{space} refuses the Terminal, programs, background jobs, connectors and tools that drive other apps for every mode, so {tool} was not run. Use file tools or the space\'s own tools instead.',
    spaceWait: "This thread's space was not known in time, so its first message waited. If tools look wrong, send the message again.",
    // Stage 6b (J3, 7.1): the refused message went back into the chat box; or it was kept (Put back); or there was none.
    engineHeld: 'Nothing was run: this thread\'s model is an engine, and engines do not run in Recon, Devices or Workshop. Your message is back in the chat box: pick one of your models, then press Send.',
    engineHeldKept: 'Nothing was run: engines do not run in Recon, Devices or Workshop. Your message was kept. Click Put back to return it to the chat box, pick one of your models, then press Send.',
    engineHeldPlain: 'Nothing was run: this thread\'s model is an engine, and engines do not run in Recon, Devices or Workshop, where the space keeps its own rules. Pick one of your models for it, then send the message again.',
    // Stage 6b (J11, 7.2 runHeld): an automation's run that its guarded space could not take; nothing ran.
    // Stage 7 (lab): {where} names the space and the automation's own mode ("Devices · Research"; the space alone when
    // its mode is not known). runHeldAutomationsOff: the same while the Automations add-on is off (its page is gone).
    runHeld: 'This automation\'s run did not start: it runs in {where}, and {space} cannot take it now ({reason}). Nothing was run. The automation is paused; switch it back on on the Automations page.',
    runHeldAutomationsOff: 'This automation\'s run did not start: it runs in {where}, and {space} cannot take it now ({reason}). Nothing was run. The automation is paused: switch on Automations on the Plugins page, then switch the automation back on on the Automations page.',
    runHeldReason: Object.freeze({ guard: '{addon} is switched off or out of date', mode: '{mode} is not offered there now', other: 'its rules could not be read', automations: 'the Automations add-on is off' }),
    // Stage 7 (6b lab leftover): the run of a Devices or Workshop automation while the Automations add-on is off: nobody
    // could open it in its space and mode. {where}: "Devices · Research" (or the space alone when its mode is not known).
    // Lab: no "next run" promise (a one-time automation has none).
    runHeldNoAutomations: 'This automation\'s run did not start: it runs in {where}, and the Automations add-on is off, so nothing could open it there. Nothing was run. While Automations is off, runs set to {space} do not start. Switch on Automations on the Plugins page.',
    sealedExtra: 'Extra tools a mode keeps in Recon.',
    sealedExtraWarn: 'Warning: what these tools read can end up in Recon\'s web searches.',
    gridInGuarded: 'Tool access Off also applies in Devices and Workshop. (On by default: your Off choices are kept there too.)',
  }),
});

/** Fix round (6a review): what lostIn (lib/spacerules.js) gives for a tool nobody has sorted; tickLines names it. */
export const UNSORTED_FAMILY = '\u0000unsorted';
/** Lab fix (6a): how many lost families the line names before "and more" (the seven every mode loses fit). */
const LOST_SHOWN = 8;

/** The sentences of Settings → Spaces and Settings → Modes, for the tests. */
export const SPACE_SETTINGS_TEXT = SETTINGS_WORDS;

/**
 * Item 4A, stage 6a: one of the sentences above in the page's language, with its values filled in (Modes' own refusals
 * and lines: SPACE_FIXED, RECON_ROOM_ONLY, GUARD_HELD, BASE_NO_PROGRAMS, …).
 * @param {string} key - a key of SETTINGS_WORDS.
 * @param {string} [lang]
 * @param {Record<string, unknown>} [values]
 * @returns {string}
 */
export function spaceText(key, lang = 'en', values = {}) {
  const text = SETTINGS_WORDS[langOf(lang)][key];
  return typeof text === 'string' ? fill(text, values) : '';
}

/** Fix round (6a review): the guard add-on of each guarded space, by its shown name in the page's language. */
export const ADDON_NAMES = Object.freeze({
  en: Object.freeze({ devices: 'Devices', recon: 'Recon', workshop: 'Creator Plus' }),
});

/**
 * Fix round (6a review): the line under the chat box for a thread its guarded space holds without tools (2.7 GUARD_HELD,
 * NEEDS_ADDON): the add-on in the page's language, "new thread" only for a thread that has not run.
 * @param {string} space - 'devices', 'recon' or 'workshop'.
 * @param {'off'|'old'} state - the guard is off, or on but too old.
 * @param {{ran?: boolean, lang?: string}} [options]
 * @returns {string}
 */
export function heldText(space, state, { ran = false, lang = 'en' } = {}) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const addon = ADDON_NAMES[langOf(lang)][space] ?? String(space ?? '');
  if (state === 'old') return fill(words.guardHeld, { addon, fix: words.guardFix[space] ?? '' });
  // Lab fix (6a): the add-on is off on the Plugins page (its Settings page is gone too): say where to switch it on.
  if (state === 'plugin') return fill(ran ? words.needsPluginHeldRan : words.needsPluginHeld, { addon });
  return fill(ran ? words.needsAddonHeldRan : words.needsAddonHeld, { addon });
}

/**
 * Item 4A, stage 6a: the warning line beside a ticked guarded space on Settings → Modes, and the note for Recon.
 * @param {{id: string, label?: string}} mode
 * @param {string} space
 * @param {{lost?: (mode: object, space: string) => string[], lang?: string}} [options] - `lost`: what the mode loses there
 *   (lib/spacerules.js lostIn, given by Modes so this file stays free of the tool catalogue).
 * @returns {{warn: string, note: string}}
 */
export function tickLines(mode, space, { lost, lang = 'en' } = {}) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const names = SPACE_NAMES[langOf(lang)];
  const label = String(mode?.label ?? mode?.id ?? '');
  if (!Object.hasOwn(GUARDED, space) || GUARDED[space] === mode?.id) return { warn: '', note: '' };
  if (space === 'recon') return { warn: '', note: fill(words.tickSealed, { mode: label }) };
  const raw = typeof lost === 'function' ? lost(mode, space) : [];
  if (!Array.isArray(raw) || raw.length === 0) return { warn: '', note: '' };
  // Fix round (6a review): every tool nobody has sorted is one family (UNSORTED_FAMILY), named in the page's language.
  // Lab fix (6a): lostIn gives family keys ('\u0000<id>'), most important first; each is named in the page's language.
  const named = (key) => {
    const text = String(key);
    if (text === UNSORTED_FAMILY) return words.unsortedTools;
    return text.startsWith('\u0000') ? words.lostFamily[text.slice(1)] ?? text.slice(1) : text;
  };
  const list = [...new Set(raw.map(named))];
  const cut = list.length > LOST_SHOWN;
  const shown = cut ? list.slice(0, LOST_SHOWN) : list;
  // "and more" is one more item after the names shown.
  const joined = (cut ? [...shown, words.tickNoProgramsMore] : shown).join(', ');
  return { warn: fill(words.tickNoPrograms, { space: names[space], mode: label, lost: joined }), note: '' };
}

const plainObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const sameList = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const guardedHome = (modeId) => Object.entries(GUARDED).find(([, mode]) => mode === modeId)?.[0];

/**
 * The spaces a mode is ticked for, as stored or by default (greyed ticks included).
 * @returns {string[]}
 */
export function tickedSpaces(modeId, modeSpaces = {}) {
  // Greyed ticks included: the readiness of a guard never changes what is stored.
  return ticksOfMode(modeId, modeSpaces).map((tick) => tick.space);
}

/**
 * One tick changed on Settings → Modes. A guarded mode (Devices, Recon, Creator Plus) keeps its own space only; another
 * mode cannot be ticked into a guarded space until its rules are built (stage 6a); a space never ends up offering no mode.
 * The stored entry keeps any `adjust` already there (Part B) and goes away when the ticks are the defaults again, so a
 * later change of the defaults still reaches it. Nothing else in `modeSpaces` changes.
 * @param {{modeSpaces?: object, modeId: string, modeLabel?: string, space: string, on: boolean, modes: Array<{id: string, label?: string}>, lang?: string}} input
 *   `modes`: every mode there is (to check that the space still offers one). Stage 6a: `ready` (guardReady()): a tick into
 *   a guarded space whose guard is not ready is refused with the reason; `lost` (as for tickLines) gives the warning line.
 * @returns {{refusal: string, next?: Record<string, unknown>, warning?: string, note?: string}}
 */
export function nextModeSpaces({ modeSpaces = {}, modeId, modeLabel, space, on, modes = [], lang = 'en', ready, lost }) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const names = SPACE_NAMES[langOf(lang)];
  const mode = isText(modeLabel) ? modeLabel : String(modeId ?? '');
  if (!isSpace(space)) return { refusal: fill(words.noSpace, { space: String(space ?? '').slice(0, 40) }) };
  if (!(modes ?? []).some((one) => one?.id === modeId)) return { refusal: fill(words.noMode, { mode: String(modeId ?? '').slice(0, 60) }) };
  if (guardedHome(modeId)) return { refusal: fill(words.home, { mode, space: names[guardedHome(modeId)] }) };
  const stored = plainObject(modeSpaces);
  const before = tickedSpaces(modeId, stored);
  if (on && before.includes(space)) return { refusal: '', next: { ...stored } };
  if (!on && !before.includes(space)) return { refusal: '', next: { ...stored } };
  if (on && !GUARDED_OPEN && Object.hasOwn(GUARDED, space)) {
    const reason = GUARDED_REASON.charAt(0).toLowerCase() + GUARDED_REASON.slice(1);
    return { refusal: fill(words.greyed, { mode, space: names[space], reason }) };
  }
  // Stage 6a: a guarded space whose guard is off or too old takes no new mode (I25).
  if (on && Object.hasOwn(GUARDED, space) && ready?.[space] !== true) return { refusal: fill(words.greyedNow, { mode, space: names[space], reason: guardedReason(space, ready, lang) }) };
  const after = on ? [...before, space] : before.filter((one) => one !== space);
  if (!on) {
    const trial = { ...stored, [modeId]: after };
    const left = modesInSpace(space, modes, trial).filter((row) => !row.greyed);
    if (left.length === 0) return { refusal: fill(words.lastMode, { space: names[space], mode }) };
  }
  const next = { ...stored };
  const kept = Array.isArray(stored[modeId]) ? stored[modeId] : [];
  const adjustOf = (one) => plainObject(kept.find((tick) => tick && typeof tick === 'object' && tick.space === one)?.adjust);
  const defaults = [...(DEFAULT_TICKS[modeId] ?? ['chat'])];
  if (sameList(after, defaults) && after.every((one) => Object.keys(adjustOf(one)).length === 0)) delete next[modeId];
  else next[modeId] = SPACE_IDS.filter((one) => after.includes(one)).map((one) => ({ space: one, adjust: adjustOf(one) }));
  if (!on) return { refusal: '', next };
  // Stage 6a: what the mode loses there (Devices, Workshop), or that it is sealed (Recon).
  const lines = tickLines({ ...((modes ?? []).find((one) => one?.id === modeId) ?? {}), id: modeId, label: mode }, space, { lost, lang });
  return { refusal: '', next, ...(lines.warn ? { warning: lines.warn } : {}), ...(lines.note ? { note: lines.note } : {}) };
}

/**
 * A space's own settings changed on Settings → Spaces: shown or hidden (Chat always shown), and the mode its new threads
 * start in (only a mode the space offers). A value equal to the default is stored as no entry, so a later default reaches it.
 * @param {{spaceSettings?: object, space: string, patch: {shown?: boolean, startMode?: string}, offered?: Array<{id: string, label?: string, greyed?: boolean}>,
 *   modeLabel?: string, lang?: string}} input
 * @returns {{refusal: string, next?: Record<string, unknown>}}
 */
export function nextSpaceSettings({ spaceSettings = {}, space, patch = {}, offered = [], modeLabel, lang = 'en' }) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const names = SPACE_NAMES[langOf(lang)];
  if (!isSpace(space)) return { refusal: fill(words.noSpace, { space: String(space ?? '').slice(0, 40) }) };
  const stored = plainObject(spaceSettings);
  const entry = { ...plainObject(stored[space]) };
  if (Object.hasOwn(patch, 'shown')) {
    if (patch.shown !== true && space === 'chat') return { refusal: words.chatShown };
    if (patch.shown === false) entry.shown = false;
    else delete entry.shown;
  }
  if (Object.hasOwn(patch, 'startMode')) {
    const id = String(patch.startMode ?? '');
    const table = SPACES.find((one) => one.id === space)?.startMode;
    if (id && !(offered ?? []).some((row) => row.id === id && row.greyed !== true)) {
      return { refusal: fill(words.startGone, { mode: isText(modeLabel) ? modeLabel : id.slice(0, 60), space: names[space] }) };
    }
    if (!id || id === table) delete entry.startMode;
    else entry.startMode = id;
  }
  const next = { ...stored };
  if (Object.keys(entry).length === 0) delete next[space];
  else next[space] = entry;
  return { refusal: '', next };
}

/**
 * A mode's own description changed (Settings → Modes): one line, at most DESC_MAX characters; empty takes it away, and
 * the mode's usual line shows again.
 * @returns {{refusal: string, next?: Record<string, string>}}
 */
export function nextDescriptions(stored, modeId, text, lang = 'en') {
  const words = SETTINGS_WORDS[langOf(lang)];
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (line.length > DESC_MAX) return { refusal: fill(words.long, { n: DESC_MAX }) };
  const next = { ...plainObject(stored) };
  if (line) next[modeId] = line;
  else delete next[modeId];
  return { refusal: '', next };
}

/**
 * A mode's description as the Mode list and Settings → Modes show it: the owner's own line (Settings → Modes), else one
 * the mode itself carries, else the usual line.
 * @returns {string}
 */
export function descriptionOf(modeId, lang = 'en', { descriptions = {}, own } = {}) {
  const set = plainObject(descriptions)[modeId];
  return modeBlurb(modeId, lang, isText(set) ? set : own);
}

/** How long the read-only summary of an add-on mode's instructions may be. */
export const ABOUT_MAX = 280;

/**
 * What an add-on mode brings, for the read-only view on Settings → Modes: its instructions in short, its tools (all of
 * the app's, none, or its own list), its file access and its model tier. Never its whole prompt.
 * @param {{prompt?: unknown, tools?: unknown, sandbox?: unknown, defaultTier?: unknown}} mode
 * @returns {{instructions: string, tools: 'all'|'none'|'list', toolCount: number, toolNames: string[], access: string, tier: string}}
 */
export function modeAbout(mode) {
  const text = String(mode?.prompt ?? '').replace(/\s+/g, ' ').trim();
  const instructions = text.length > ABOUT_MAX ? `${text.slice(0, ABOUT_MAX - 1).replace(/\s+\S*$/, '')}…` : text;
  const tools = mode?.tools;
  const list = Array.isArray(tools) ? tools.filter((one) => typeof one === 'string' && one) : [];
  const kind = tools === 'none' ? 'none' : Array.isArray(tools) ? 'list' : 'all';
  const access = ['read-only', 'workspace-write', 'danger-full-access'].includes(mode?.sandbox) ? mode.sandbox : 'inherit';
  return { instructions, tools: kind, toolCount: list.length, toolNames: list.slice(0, 40), access, tier: typeof mode?.defaultTier === 'string' ? mode.defaultTier : '' };
}

/**
 * Every mode for Settings → Modes, built-in first (Plain chat first), then the add-ons' modes, then your own, each with
 * its description and its five ticks: `on`, `greyed` (cannot be changed now, with `reason`) and `fixed` (a guarded
 * mode's own space).
 * @param {Array<{id: string, label?: string, extra?: boolean, added?: boolean, description?: string}>} modes - readModes values.
 * @param {{modeSpaces?: object, descriptions?: object, lang?: string, ready?: object, lost?: Function}} [options] - stage 6a:
 *   `ready` (guardReady()) greys a guarded space's tick while its guard is not ready, with the reason; `lost` gives the
 *   warning line under a ticked Devices or Workshop box (`warn`), and Recon a note (`note`).
 * @returns {Array<object>}
 */
export function modeRowsForPage(modes, { modeSpaces = {}, descriptions = {}, lang = 'en', ready, lost } = {}) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const kindOf = (mode) => (mode.extra ? 'addon' : BUILT_IN_IDS.includes(mode.id) ? 'builtin' : 'own');
  const rows = (modes ?? []).filter((mode) => isText(mode?.id)).map((mode) => {
    const home = guardedHome(mode.id);
    const ticked = tickedSpaces(mode.id, modeSpaces);
    const ticks = SPACE_IDS.map((space) => {
      // Lab fix (6a): the reason names the mode and its space (it is read on its own, in a tooltip and an aria-label).
      if (home) return { space, on: space === home, greyed: true, fixed: space === home, reason: space === home ? '' : fill(words.homeReason, { mode: modeName(mode, lang), space: SPACE_NAMES[langOf(lang)][home] ?? home }) };
      const reason = guardedReason(space, ready, lang);
      const on = ticked.includes(space);
      const lines = on ? tickLines(mode, space, { lost, lang }) : { warn: '', note: '' };
      return { space, on, greyed: reason !== '', fixed: false, reason, warn: lines.warn, note: lines.note };
    });
    const set = plainObject(descriptions)[mode.id];
    return {
      id: mode.id,
      label: String(mode.label ?? mode.id),
      kind: kindOf(mode),
      // Round 2 (mock-up f, part 2): what an add-on mode brings, shown read-only on Settings → Modes.
      about: kindOf(mode) === 'addon' ? modeAbout(mode) : null,
      desc: descriptionOf(mode.id, lang, { descriptions, own: mode.description }),
      ownDesc: isText(set) ? set : '',
      usualDesc: modeBlurb(mode.id, lang, mode.description),
      ticks,
    };
  });
  const rank = (row) => (row.id === 'plain' ? 0 : row.kind === 'builtin' ? 1 : row.kind === 'addon' ? 2 : 3);
  return [0, 1, 2, 3].flatMap((step) => rows.filter((row) => rank(row) === step));
}

/** @returns {string} a mode's shown name for Settings → Spaces, also when its add-on is off (the mode is not listed). */
function goneName(modeId, space, modes, lang) {
  const listed = (modes ?? []).find((mode) => mode?.id === modeId);
  if (listed) return modeName(listed, lang);
  if (GUARDED[space] === modeId) return ADDON_NAMES[langOf(lang)][space] ?? modeId;
  const own = Object.entries(GUARDED).find(([, id]) => id === modeId);
  if (own) return ADDON_NAMES[langOf(lang)][own[0]] ?? modeId;
  // Stage 6b, Part D (J20): an add-on's mode that is switched off (so not listed) by the name it ships with, never its
  // raw id ("start mode gone: Research", not "research"). The owner's own modes are always listed while they exist.
  const shipped = Object.hasOwn(SHIPPED_MODE_NAMES, modeId) ? SHIPPED_MODE_NAMES[modeId] : null;
  return shipped ? shipped.en[0] : modeId;
}

/**
 * The five space cards of Settings → Spaces: shown or hidden (and whether it can be hidden), what the space needs, the
 * mode its new threads start in and the modes it can start in.
 * @param {{spaces: Array<object>, spaceSettings?: object, modes: Array<{id: string, label?: string}>, modeSpaces?: object, lang?: string}} input
 *   `spaces`: spacesNow rows.
 * @returns {Array<object>}
 */
export function spaceCards({ spaces = [], spaceSettings = {}, modes = [], modeSpaces = {}, lang = 'en', ready }) {
  const words = SETTINGS_WORDS[langOf(lang)];
  const names = SPACE_NAMES[langOf(lang)];
  return SPACE_IDS.map((id) => {
    const row = (spaces ?? []).find((one) => one?.id === id) ?? { id, available: id === 'chat' || id === 'code', shown: id === 'chat' || id === 'code' };
    const offered = modesInSpace(id, modes, modeSpaces, { ready, lang }).filter((one) => !one.greyed);
    const own = plainObject(plainObject(spaceSettings)[id]);
    const table = SPACES.find((one) => one.id === id).startMode;
    const startMode = draftStartMode({ space: id, offered, spaceSettings }) ?? '';
    const wanted = isText(own.startMode) ? own.startMode : table;
    return {
      id,
      label: names[id],
      available: row.available === true,
      shown: id === 'chat' ? true : own.shown !== false,
      canHide: id !== 'chat',
      requires: words.requires[id] ?? '',
      off: row.available === true ? '' : words.off[id] ?? '',
      startMode,
      // The start mode chosen (or the built-in one) is not offered there now: the card says which one is used instead.
      startModeGone: wanted !== startMode ? wanted : '',
      // Lab re-check fix (6a, problem 7): the gone mode by its name (its add-on's name while the add-on is off and the
      // mode is not listed), and, for a guarded space's own mode whose add-on is not ready, what to do (guardedReason:
      // "Needs Creator Plus: switch it on on the Plugins page.").
      startModeGoneLabel: wanted !== startMode ? goneName(wanted, id, modes, lang) : '',
      startModeGoneReason: wanted !== startMode && GUARDED[id] === wanted ? guardedReason(id, ready, lang) : '',
      // Stage 6b lab fix: the gone mode is an add-on's mode whose add-on is switched off (not listed at all), so the card
      // tells the owner to switch the add-on on (ticking cannot help); the choice comes back with it (J20).
      startModeGoneOff: wanted !== startMode && GUARDED[id] !== wanted && !(modes ?? []).some((mode) => mode?.id === wanted) && Object.hasOwn(SHIPPED_MODE_NAMES, wanted),
      tableStart: table,
      offered: offered.map((one) => ({ id: one.id, label: one.label })),
    };
  });
}
