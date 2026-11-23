/**
 * "Preset in this tab" (item 7, the owner's decisions of 21 November 2026): which of the app's agent presets
 * (Standard, PTC, Creator, ...) a new conversation of each tab may start in, and the words that explain it.
 *
 * Nothing is fixed. Every tab has one choice, stored in the Modes setting `presetLock` as JSON
 * `{ modeId: 'any' | 'standard' | 'creator' }`; a tab without an entry has its default: Standard only for
 * Recon, Devices and Automations, Creator only for Creator Plus, Any for every other tab (built-in, add-on
 * or your own). Outside those locks PTC is never blocked, only explained.
 *
 * Kept apart from the plugin so it can be tested without the app. The browser half (client.js) shows what
 * the route built from these functions returns; it does not copy the words.
 */
import { modeName, SPACE_TAB } from './spaces.js';

/** The three choices, in the order Settings shows them. */
export const LOCK_CHOICES = ['any', 'standard', 'creator'];
/** The app's preset id behind each locked choice. Creator is the app's preset `cordis`. */
export const LOCK_PRESET = Object.freeze({ standard: 'standard', creator: 'cordis' });
/** The app's own names for those presets. */
export const PRESET_NAMES = Object.freeze({ standard: 'Standard', ptc: 'PTC', minimal: 'Minimal', cordis: 'Creator' });
/** The tabs that are locked until the owner changes it (Devices is the mode `bench`). */
export const DEFAULT_LOCKS = Object.freeze({ recon: 'standard', bench: 'standard', automations: 'standard', 'creator-plus': 'creator' });
/** The two fallback modes of an isolated conversation (lib/isolation.js): they have no tools in any preset, so no lock applies. */
export const FALLBACK_MODE_IDS = Object.freeze(['isolated-locked', 'isolated-late']);
/** Tabs whose own guard refuses `run_code` (Devices, Creator Plus). Isolated tabs and modes marked `noPrograms` refuse it too. */
export const NO_PROGRAM_MODES = Object.freeze(['bench', 'creator-plus']);
/** The app's PTC preset. */
export const PTC_PRESET = 'ptc';
/** Where the setting is, in the owner's words. */
export const WHERE = 'Settings → Modes → Preset for each mode';
/** Item 4A, stage 5: where it is once spaces are live (each space's card on Settings → Spaces). */
export const WHERE_SPACES = 'Settings → Spaces → Preset in this space';
/** The app's Coding Tools switch (checked in the app 0.2.2-rc.2: dsh-client-ui-settings-general, developerTools). */
export const CODING_TOOLS_LINE = 'PTC shows in this menu only while the app\'s Coding Tools setting is on: Settings → General → Show coding view.';
/** The same line in the (i) of a started chat, which has a label, not a menu. */
export const CODING_TOOLS_LINE_STARTED = 'PTC shows in the preset menu on the new-chat page only while the app\'s Coding Tools setting is on: Settings → General → Show coding view.';

/** The owner's own words for the (i), fitted into What it does / When to use it / If you change it. */
export const OWNER_INFO = Object.freeze({
  title: 'Standard or PTC',
  what: 'Standard: the AI uses one tool at a time. After each tool it reads the full result, then decides the next step. PTC (Programmatic Tool Calling): the AI writes a small program that calls many tools in one go (loops, filters, batches). Only the final printed result comes back to the AI.',
  when: 'Standard: Best when each step needs judgement. PTC: This saves tokens and time on repetitive or batch work, for example checking 40 links or reading 30 files. It works less well when each step needs judgement, and you see less of each individual step.',
  change: 'The switch applies when a new thread starts. A thread keeps the setting it started with.',
});

/**
 * Item 4A, stage 4: the owner's line for the (i) beside the preset menu once spaces are live, so a preset is never
 * mistaken for a Plus mode (the Mode list under the chat box).
 */
export const NOT_A_MODE = Object.freeze({
  en: 'Preset: how the model works with tools (Standard, PTC or Creator). It is fixed when a thread starts. It is not a Plus mode; Plus modes are the Mode list under the chat box.',
});

/**
 * Every word the page shows. Plus is English only; the `en` key stays because the tests read the table by language.
 */
const TEXT = {
  en: {
    names: PRESET_NAMES,
    where: WHERE,
    whereSpaces: WHERE_SPACES,
    coding: CODING_TOOLS_LINE,
    codingStarted: CODING_TOOLS_LINE_STARTED,
    info: OWNER_INFO,
    reasons: {
      recon: 'Recon never runs code the AI writes, and a PTC thread can only run programs.',
      bench: 'Devices runs no programs, so a PTC thread could do nothing here.',
      automations: 'an automation made from a PTC thread would run in PTC every time it runs.',
      'creator-plus': 'Creator Plus runs no programs, and its two inspection tools (cordis_inspect_list, cordis_inspect_query) come only with the Creator preset.',
    },
    loosen: {
      recon:
        'Unsafe. With Any, a Recon thread can start in PTC. PTC runs code the AI writes, which breaks Recon\'s rule that it never runs code. Recon still refuses every program, so a PTC Recon thread cannot do anything: no searches, no reading. Recon\'s own no-programs rule is not changed here and stays on. Start Recon threads in Standard instead.',
      bench:
        'With Any, a Devices thread can start in PTC. Devices refuses every program, so a PTC Devices thread cannot do anything, a Mission included. Start Devices threads in Standard instead.',
      automations:
        'With Any, an Automations thread can start in PTC. Every automation it creates then runs in PTC too, each time it runs, and a program can read files and go online by itself (Read Only stops only writes). Start Automations threads in Standard instead.',
      'creator-plus':
        'With Any, a Creator Plus thread can start in Standard or PTC. In PTC it cannot do anything, because Creator Plus refuses programs. In Standard it works without its two inspection tools (cordis_inspect_list, cordis_inspect_query), which come only with the Creator preset. Start Creator Plus threads on Creator instead.',
    },
    loosenOther: (label) => `With Any, a ${label} thread can start in any preset, PTC included.`,
    caution: {
      recon: 'Any is unsafe here: PTC runs code the AI writes. Keep Standard only.',
    },
    swap: {
      'creator-plus:standard': 'Creator Plus then works without its two inspection tools, which come only with the Creator preset.',
      'recon:creator': 'The Creator preset\'s own instructions are about changing the app. Recon keeps its own tools and rules.',
      'bench:creator': 'The Creator preset\'s own instructions are about changing the app. Devices keeps its own tools and rules.',
      'automations:creator': 'The Creator preset\'s own instructions are about changing the app. Automations made here then run on Creator too.',
    },
    reach: {
      chat: {
        note: 'PTC with Web on: a program can also read files, run commands and go online by itself.',
        info: 'In Chat with Web on, a PTC program can read your files, start commands and go online by itself, so Chat\'s rule of no files and no commands does not hold for programs. Read Only still stops it writing files. Nothing is blocked.',
      },
      scout: {
        note: 'PTC: a program can read your files and go online by itself.',
        info: 'In Scout, a PTC program can read your files and make its own web requests. Scout\'s privacy check sees only its own search tools, not a program\'s own requests. Nothing is blocked.',
      },
      data: {
        note: 'PTC: a program can go online and read files outside the folder.',
        info: 'In Data, a PTC program does not run in Data\'s no-network Python sandbox: it can go online and read files outside the folder. Read Only still stops it writing files. Nothing is blocked.',
      },
      research: {
        note: 'PTC: a program can read files, run commands and go online by itself.',
        info: 'In Research, a PTC program can read files, run commands and go online by itself; Read Only stops only writes. Deep research inside a program needs a long time limit, or it stops after 2 minutes and its work is lost. Nothing is blocked.',
      },
      content: {
        note: 'PTC: a program can read files, run commands and go online by itself.',
        info: 'In Content, a PTC program can read files, run commands and go online by itself; Read Only stops only writes. Nothing is blocked.',
      },
      automations: {
        note: 'PTC: automations made in this thread run in PTC every time.',
        info: 'In Automations, an automation made from a PTC thread runs in PTC every time it runs, and a program can read files and go online by itself. Nothing is blocked.',
      },
    },
    refusesNoteBlank: (name) => `This mode runs no programs: in PTC it cannot do anything. Pick ${name} in this menu before you send.`,
    refusesInfoBlank: (name) => `This mode refuses every program the AI writes, so a PTC thread here cannot do anything. Pick ${name} in the preset menu before you send.`,
    refusesNote: (name) => `This mode runs no programs: in PTC it cannot do anything. Start a new thread on ${name}.`,
    refusesInfo: (name) => `This mode refuses every program the AI writes, so a PTC thread here cannot do anything. Start a new thread in this mode on ${name}.`,
    missing: (label, wanted, creator, where) => `${label} is set to ${wanted} only, but the ${wanted} preset is not in the app's preset list right now, so new threads here start on the app's default preset and the menu stays free. ${creator ? 'Creator Plus then works without its inspection tools. ' : ''}To change it: ${where}.`,
    lockedBlank: (label, wanted, reason, where) => `${label} is set to ${wanted} only, so the menu is greyed${reason ? `: ${reason}` : '.'} Other modes keep their own choice. To change it: ${where}.`,
    lockedStarted: (label, wanted, reason, where) => `${label} is set to ${wanted} only: new threads here start on ${wanted}${reason ? ` (${reason.replace(/\.$/, '')})` : ''}. This thread keeps its preset. To change it: ${where}.`,
    otherPreset: (preset, wanted) => `This thread runs on ${preset}: it started before the setting, or outside the left panel, and a started thread keeps its preset. Start a new thread for ${wanted}.`,
    picked: (from, label, to) => `You had picked ${from} for a new thread, but ${label} is set to ${to} only, so this thread was switched back to ${to}.`,
    opened: (from, label, to) => `This new thread opened on ${from}, but ${label} is set to ${to} only, so it was switched to ${to}.`,
  },
};
/** @returns {object} the words (English for every language: `lang` is accepted and ignored). */
const textOf = () => TEXT.en;
/** @returns {string} where the setting is. */
export function whereText(lang = 'en', spaces = false) {
  return spaces ? textOf(lang).whereSpaces : textOf(lang).where;
}
/** The words table, for the tests. */
export const PRESET_TEXT = TEXT;

/**
 * @param {unknown} value - the stored `presetLock` (JSON text, or an object already).
 * @returns {Record<string, 'any'|'standard'|'creator'>} the valid entries only.
 */
export function readLocks(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      raw = {};
    }
  }
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, choice] of Object.entries(raw)) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(id) && LOCK_CHOICES.includes(choice)) out[id] = choice;
  }
  return out;
}

/** @returns {'any'|'standard'|'creator'} a tab's default choice. */
export function defaultLockOf(modeId) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_LOCKS, modeId) ? DEFAULT_LOCKS[modeId] : 'any';
}

/**
 * @param {Record<string, string>} table - from readLocks.
 * @param {string} modeId - the tab.
 * @returns {'any'|'standard'|'creator'} the tab's choice in force; the fallback modes are never locked.
 */
export function lockOf(table, modeId) {
  if (typeof modeId !== 'string' || !modeId || FALLBACK_MODE_IDS.includes(modeId)) return 'any';
  const own = table?.[modeId];
  return LOCK_CHOICES.includes(own) ? own : defaultLockOf(modeId);
}

/** @returns {string} the app's preset id a tab is locked to, '' for Any. */
export function lockedPresetOf(table, modeId) {
  const lock = lockOf(table, modeId);
  return lock === 'any' ? '' : LOCK_PRESET[lock];
}

/**
 * Item 4A, stage 3a: the lock that holds for a thread in a space. Recon, Devices and Workshop read their space's lock
 * from today's keys (`recon`, `bench`, `creator-plus`: lib/spaces.js LOCK_KEY_SPACE), so every saved choice keeps
 * working; Chat and Code have no space lock (Any). The mode keeps its own lock (Automations: Standard). When both say
 * something, the stricter one holds: a locked choice wins over Any, and when the two lock to different presets the
 * space's lock wins (the space carries the safety rules) and `conflict` says so, for one line in the chat box.
 * @param {Record<string, string>} table - from readLocks.
 * @param {string} space - the thread's space.
 * @param {string} modeId - the thread's mode.
 * @returns {{lock: 'any'|'standard'|'creator', from: 'space'|'mode'|'', conflict: boolean, spaceLock: string, modeLock: string}}
 */
export function lockInSpace(table, space, modeId) {
  const key = SPACE_LOCK_KEY[space];
  const spaceLock = key ? lockOf(table, key) : 'any';
  // A key that is a space's own (Chat, Code, Recon, Devices, Creator Plus) is that space's lock, not a mode's: the Chat
  // mode ticked into Code does not take Chat's lock along (stage 5).
  const modeLock = SPACE_KEYS.includes(modeId) ? 'any' : lockOf(table, modeId);
  if (spaceLock === 'any' && modeLock === 'any') return { lock: 'any', from: '', conflict: false, spaceLock, modeLock };
  if (modeLock === 'any' || spaceLock === modeLock) return { lock: spaceLock, from: 'space', conflict: false, spaceLock, modeLock };
  if (spaceLock === 'any') return { lock: modeLock, from: 'mode', conflict: false, spaceLock, modeLock };
  return { lock: spaceLock, from: 'space', conflict: true, spaceLock, modeLock };
}
/** The preset-lock key each guarded space reads (the reverse of lib/spaces.js LOCK_KEY_SPACE). */
// Item 4A, stage 6a: the values come from one table (lib/spaces.js SPACE_TAB); this order is the one Settings shows.
export const SPACE_LOCK_KEY = Object.freeze({ chat: SPACE_TAB.chat, code: SPACE_TAB.code, recon: SPACE_TAB.recon, devices: SPACE_TAB.devices, workshop: SPACE_TAB.workshop });
/**
 * Stage 5: Chat and Code read their space's lock from today's Chat and Code tab keys too ("Preset in this tab" becomes
 * "Preset in this space", the same stored value). Every other key stays a per-mode lock (the Automations mode keeps its own).
 */
const SPACE_KEYS = Object.freeze(Object.values(SPACE_LOCK_KEY));

/**
 * The line in the chat box when a space and a mode lock to different presets (lockInSpace's `conflict`).
 * @returns {string}
 */
export function lockConflictLine({ space, mode, spaceLock, modeLock, lang = 'en' }) {
  const name = (lock) => presetName(LOCK_PRESET[lock], lang);
  return `${space} is set to ${name(spaceLock)} only and ${mode} to ${name(modeLock)} only: the space wins, so ${name(spaceLock)} is used here. Change it on Settings → Spaces.`;
}

/** @returns {string} a preset's name as the app shows it ("Standard", "PTC", "Creator"), else its id. */
export function presetName(id, lang = 'en') {
  return textOf(lang).names[id] ?? String(id ?? '');
}

/**
 * Whether a tab refuses `run_code`, so it cannot work in PTC: an isolated tab (Recon, your own isolated mode),
 * Devices and Creator Plus, and any mode marked `noPrograms`. The fallback modes have no tools at all and count
 * as no.
 * @param {{id?: string, isolated?: boolean, noPrograms?: boolean} | undefined} mode - the mode.
 * @returns {boolean} true when it refuses programs.
 */
export function refusesPrograms(mode) {
  if (!mode || FALLBACK_MODE_IDS.includes(mode.id)) return false;
  return mode.isolated === true || mode.noPrograms === true || NO_PROGRAM_MODES.includes(mode.id);
}

/**
 * The preset to start again in, for a tab that cannot work in PTC: the tab's own lock when it has one,
 * else Creator for Creator Plus, else Standard.
 * @returns {string} the app's preset id.
 */
export function restartPresetOf(table, mode) {
  const locked = lockedPresetOf(table, mode?.id);
  if (locked) return locked;
  return mode?.id === 'creator-plus' ? LOCK_PRESET.creator : LOCK_PRESET.standard;
}

/**
 * What the AI is told in a tab that refuses programs while the conversation is in PTC. It replaces the
 * general "call every tool from inside run_code" note there.
 * @param {string} label - the tab's name.
 * @param {string} presetId - the preset to start again in.
 * @returns {string} the note.
 */
export function noProgramsPtcPrompt(label, presetId) {
  const name = presetName(presetId);
  return `This thread runs in the app's PTC preset, where tools can only be called from inside run_code programs. The ${label} mode runs no programs, so none of its tools can be used here. Do not call run_code. Tell the user plainly that the ${label} mode does not work in PTC, and that they should start a new thread in this mode with the ${name} preset (the preset menu next to the folder name on the new-chat page).`;
}

/**
 * The red warning (and confirmation question) for a choice that loosens a tab's default lock to Any.
 * @param {string} modeId - the tab.
 * @param {string} choice - the new choice.
 * @param {string} [label] - the tab's name.
 * @param {string} [lang] - the page's language.
 * @returns {string} the warning, or '' when the choice does not loosen a default lock.
 */
export function loosenWarning(modeId, choice, label, lang = 'en') {
  if (choice !== 'any' || defaultLockOf(modeId) === 'any') return '';
  const words = textOf(lang);
  return words.loosen[modeId] ?? words.loosenOther(modeName({ id: modeId, label: label || modeId }, lang));
}

/** @returns {string} the short line always shown under a tab's row where Any is unsafe (Recon), else ''. */
export function lockCaution(modeId, lang = 'en') {
  return textOf(lang).caution[modeId] ?? '';
}

/** @returns {string} a short note for a choice that changes a default lock without loosening it to Any, else ''. */
export function swapNote(modeId, choice, lang = 'en') {
  if (choice === 'any' || choice === defaultLockOf(modeId)) return '';
  return textOf(lang).swap[`${modeId}:${choice}`] ?? '';
}

/**
 * What a PTC program can still reach in a tab, where that is more than the tab normally allows.
 * @param {{id?: string}} mode - the conversation's mode.
 * @param {{web?: boolean, restart?: string, blank?: boolean, lang?: string}} [want] - whether its Web is on (Chat counts
 *   only with Web on), the preset to start in, whether the chat is still blank (then the next step is the menu beside the
 *   note, not a new chat), and the page's language.
 * @returns {{note: string, info: string}} empty strings where there is nothing to say.
 */
export function ptcReach(mode, { web = false, restart = LOCK_PRESET.standard, blank = false, lang = 'en' } = {}) {
  const words = textOf(lang);
  if (refusesPrograms(mode)) {
    const name = presetName(restart, lang);
    return blank
      ? { note: words.refusesNoteBlank(name), info: words.refusesInfoBlank(name) }
      : { note: words.refusesNote(name), info: words.refusesInfo(name) };
  }
  const id = mode?.id;
  if (id === 'chat' && !web) return { note: '', info: '' };
  return words.reach[id] ?? { note: '', info: '' };
}

/**
 * Whether the (i) keeps the tab's PTC line. While the menu is greyed on the locked preset the chat is not in PTC and
 * cannot be, so the line (ending "Nothing is blocked.") would contradict the lock; a tab that refuses programs says
 * its own words in the lock line. A started chat that still runs on PTC in a locked tab keeps the line.
 * @param {{greyed: boolean, refuses: boolean, preset: string, lockedTo: string, info: string}} want - the view.
 * @returns {string} the line, or ''.
 */
export function reachLine({ greyed = false, refuses = false, preset = '', lockedTo = '', info = '' } = {}) {
  if (!greyed) return info;
  if (refuses || preset === lockedTo) return '';
  return info;
}

/**
 * The (i) beside the preset menu or label: the owner's text, the Coding Tools line and, where it applies, the
 * tab's lock, a new chat that was switched, and what a PTC program can still reach.
 * @param {object} want - what applies.
 * @param {string} want.label - the tab's name.
 * @param {string} want.modeId - the tab.
 * @param {'any'|'standard'|'creator'} want.lock - the choice in force.
 * @param {boolean} [want.missing] - the locked preset is not in the app's list right now.
 * @param {{from: string, to: string, why?: string, label?: string} | null} [want.overridden] - a switch that still applies
 *   (`why`: 'pick' for a pick made elsewhere; anything else: the chat opened on another preset). `label`: the tab then.
 * @param {string} [want.preset] - the conversation's preset.
 * @param {boolean} [want.started] - the conversation has started (its preset is fixed, and it has a label, not a menu).
 * @param {string} [want.reach] - the tab's PTC line (ptcReach().info).
 * @param {string} [want.lang] - the page's language.
 * @param {boolean} [want.spaces] - spaces are live: the first line says a preset is not a Plus mode.
 * @returns {{title: string, what: string, when: string, change: string, more: string[], lang: string}} for ui.Info.
 */
export function presetInfo({ label: given, modeId, lock, missing = false, overridden = null, preset = '', started = false, reach = '', lang = 'en', spaces = false }) {
  const words = textOf(lang);
  const label = modeName({ id: modeId, label: given }, lang);
  const name = (id) => presetName(id, lang);
  // With spaces live, the first line says what a preset is and that it is not a Plus mode (item 4A, stage 4).
  const more = [...(spaces ? [NOT_A_MODE.en] : []), started ? words.codingStarted : words.coding];
  const where = spaces ? words.whereSpaces : words.where;
  if (lock !== 'any') {
    const wanted = name(LOCK_PRESET[lock]);
    const reason = words.reasons[modeId];
    if (missing) {
      more.push(words.missing(label, wanted, lock === 'creator', where));
    } else if (started) {
      more.push(words.lockedStarted(label, wanted, reason, where));
      if (preset && preset !== LOCK_PRESET[lock]) more.push(words.otherPreset(name(preset), wanted));
    } else {
      more.push(words.lockedBlank(label, wanted, reason, where));
    }
  }
  if (overridden && overridden.from && overridden.to) {
    const tab = overridden.label || label;
    more.push(overridden.why === 'pick'
      ? words.picked(name(overridden.from), tab, name(overridden.to))
      : words.opened(name(overridden.from), tab, name(overridden.to)));
  }
  if (reach) more.push(reach);
  // `lang` stays in the answer for older pages; it is always 'en' (Plus is English only).
  return { ...words.info, more, lang: 'en' };
}
