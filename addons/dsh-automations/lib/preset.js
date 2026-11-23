/**
 * Each automation's agent preset (item 7, owner's decision of 21 November 2026, point 22): the Automations page
 * shows the preset every automation runs in (Standard, PTC, Creator or another one) and lets you change it, only
 * when you click. Nothing here changes an automation by itself.
 *
 * Where the preset lives (checked against the app's source, 0.2.2-rc.2):
 * - An automation that opens a thread ('new' at every run, 'new_once' at its first run) keeps it in its
 *   destination, `target.create.agentPreset`. The app's schedule tool copies the asking chat's preset there, so
 *   one made from a PTC chat runs in PTC. With none stored, the app's default preset at the time the
 *   thread is made is used.
 * - An automation that writes into one existing thread ('session') runs in that thread's preset,
 *   which the app fixes at its first message. It cannot be changed from here.
 * - A change goes through the app's own scheduler (`schedule.edit` with `patch.target`), never through files.
 *   For 'new_once' the app reserves a new thread for the next run, so once it has run, the next run opens a
 *   new thread in the new preset and later runs go on there.
 *
 * Plain functions, so they can be tested without the app.
 */

/** The app's names for its own presets ('cordis' is the Creator preset). */
const NAMES = { standard: 'Standard', ptc: 'PTC', cordis: 'Creator', minimal: 'Minimal' };
/** @returns {'en'} the page's language. Plus is English only (decision 28): a page that reports Chinese gets English too. */
const langOf = () => 'en';

/**
 * The choice that stores no preset, so the automation follows the app's default preset each time it opens a
 * thread (as it did before any change). Not a preset id: it can never match one.
 */
export const DEFAULT_CHOICE = ':default';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** @returns {'standard'|'ptc'|'creator'|'minimal'|'other'} the kind of a preset, for the label's colour and its (i). */
export function presetKind(id) {
  if (id === 'standard') return 'standard';
  if (id === 'ptc') return 'ptc';
  if (id === 'cordis') return 'creator';
  if (id === 'minimal') return 'minimal';
  return 'other';
}

/**
 * A preset's short name.
 * @param {string} id - preset id.
 * @param {{id: string, name?: string}[]} [list] - the app's preset list (for the names of your own presets).
 * @param {string} [lang] - the page's language (accepted; Plus always answers in English).
 */
export function presetName(id, list = [], lang = 'en') {
  if (!id) return '';
  if (NAMES[id]) return NAMES[id];
  const row = Array.isArray(list) ? list.find((item) => item?.id === id) : undefined;
  return typeof row?.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 40) : String(id).slice(0, 40);
}

/**
 * The presets that can be picked: the app's list without broken ones, in its order.
 * @param {object[]} list - rows of `agentPresets.list()`.
 * @returns {{id: string, name: string, kind: string, description: string}[]}
 */
export function presetChoices(list, lang = 'en') {
  if (!Array.isArray(list)) return [];
  return list
    .filter((row) => typeof row?.id === 'string' && ID_RE.test(row.id) && !row.broken)
    .map((row) => ({ id: row.id, name: presetName(row.id, list, lang), kind: presetKind(row.id), description: typeof row.description === 'string' ? row.description.slice(0, 300) : '' }));
}

/**
 * The first choice of the picker: no preset stored, so each run uses the app's default preset.
 * @param {string} [defaultId] - the app's default preset now.
 * @param {object[]} [list] - the app's preset list.
 * @param {string} [lang] - the page's language.
 * @returns {{id: string, name: string, kind: 'default', description: string}}
 */
export function defaultChoice(defaultId = '', list = [], lang = 'en') {
  const now = presetName(defaultId, list, lang);
  const name = `App default${now ? ` (now ${now})` : ''}`;
  return { id: DEFAULT_CHOICE, name, kind: 'default', description: '' };
}

/**
 * The preset an automation runs in, as the page shows it.
 * @param {object} task - a catalog entry of the app's scheduler.
 * @param {object} [options]
 * @param {(sessionId: string) => string | undefined} [options.sessionPreset] - the preset a thread has, when known.
 * @param {string} [options.defaultId] - the app's default preset now.
 * @param {object[]} [options.list] - the app's preset list.
 * @returns {{id: string, name: string, kind: string, from: 'own'|'default'|'conversation'|'unknown', changeable: boolean, newConversation: boolean}}
 *   `from`: stored in the automation, the app's default (none stored), the thread it writes into, or not known.
 *   `newConversation`: a change makes the next run open a new thread (it has run before into its own one).
 */
export function presetOfTask(task, { sessionPreset = () => undefined, defaultId = '', list = [] } = {}) {
  const target = task?.target ?? {};
  const read = (sessionId) => {
    try {
      const id = sessionId ? sessionPreset(String(sessionId)) : undefined;
      return typeof id === 'string' && id ? id : '';
    } catch {
      return '';
    }
  };
  const shape = (id, from, changeable, newConversation = false) => ({ id, name: presetName(id, list), kind: id ? presetKind(id) : 'other', from, changeable, newConversation });
  if (target.kind === 'session') {
    const id = read(target.sessionId);
    return shape(id, id ? 'conversation' : 'unknown', false);
  }
  if (target.kind !== 'new' && target.kind !== 'new_once') return shape('', 'unknown', false);
  const stored = typeof target.create?.agentPreset === 'string' ? target.create.agentPreset : '';
  // 'new_once' that ran already: its thread exists and keeps the preset it was made with.
  const ran = target.kind === 'new_once' && Boolean(task?.lastDelivery);
  if (ran) {
    const actual = read(target.sessionId);
    if (actual) return shape(actual, actual === stored ? 'own' : 'conversation', true, true);
  }
  if (stored) return shape(stored, 'own', true, ran);
  return shape(String(defaultId || ''), 'default', true, ran);
}

/**
 * The destination that runs an automation in another preset, for `schedule.edit({ patch: { target } })`.
 * Keeps its kind and folder; only the preset changes.
 * @param {object} target - the automation's stored destination.
 * @param {string} presetId - the preset to use, or DEFAULT_CHOICE for none stored (the app's default).
 * @returns {object} the new destination.
 * @throws {Error} in plain words, when the automation's preset cannot be changed here.
 */
export function targetWithPreset(target, presetId) {
  const followDefault = presetId === DEFAULT_CHOICE;
  if (!followDefault && !ID_RE.test(String(presetId ?? ''))) throw new Error('Pick a preset from the list.');
  if (target?.kind === 'session') {
    throw new Error('It writes into one thread, and a thread keeps the preset it started with. Make the automation again from a thread in the preset you want.');
  }
  if (target?.kind !== 'new' && target?.kind !== 'new_once') throw new Error('Its destination is not known, so its preset cannot be changed here.');
  const cwd = typeof target.create?.cwd === 'string' && target.create.cwd ? { cwd: target.create.cwd } : {};
  // App default: no preset stored, so the app's default preset at the time is used (as before any change).
  return { kind: target.kind, create: followDefault ? { ...cwd } : { ...cwd, agentPreset: String(presetId) } };
}

/** Every word of the preset's (i) and picker. */
const WORDS = {
  en: {
    what: {
      standard: 'The assistant uses its tools one at a time, step by step.',
      ptc: 'It runs as a program each time: the assistant writes a short program that calls its tools, and the program does the steps.',
      creator: "The app's preset for building and checking add-ons. It brings the inspection tools.",
      minimal: 'Only a terminal and image reading, with context compression. Made for testing and comparing the AI\'s basic skill, not for everyday work.',
    },
    own: (name) => `Your own preset "${name}": the tools and instructions you set for it in the app.`,
    unknownWhat: 'The app does not say which preset its thread has.',
    notKnown: 'Not known',
    byDefault: (now) => `None is stored, so it uses the app's default preset when it opens a thread${now ? ` (now ${now})` : ''}.`,
    fromConversation: 'It runs in the preset its thread started with.',
    stored: 'Stored in the automation. Usually the preset of the thread it was made in.',
    openOnce: 'Open its thread once, then come back to this page to see its preset.',
    changeNew: 'Details → Preset → Change. The next run then opens a new thread in that preset, and later runs go on there.',
    change: 'Details → Preset → Change. The next run uses it. Nothing changes until you click Use it.',
    fixed: 'It writes into one thread, which keeps the preset it started with. To use another preset, make the automation again from a thread in that preset.',
    title: (name) => `Preset: ${name}`,
    notes: {
      ptc: 'Runs as a program each time.',
      standard: 'Uses its tools step by step.',
      creator: 'Brings the tools for building add-ons.',
      minimal: 'Only a terminal and image reading: for tests, not everyday work.',
      default: 'Stores no preset: each run uses the app\'s default preset at that time.',
    },
    fresh: 'The next run opens a new thread.',
  },
};
/** The table, for the tests. */
export const PRESET_WORDS = WORDS;

/**
 * The (i) of an automation's preset label: what the preset does, where it comes from, and how to change it.
 * @param {ReturnType<typeof presetOfTask>} preset - from presetOfTask.
 * @param {string} [defaultName] - the name of the app's default preset now.
 * @param {string} [lang] - the page's language (accepted; Plus always answers in English).
 * @returns {{title: string, what: string, when: string, change: string, lang: string}} the lines of ui.Info.
 */
export function presetInfo(preset, defaultName = '', lang = 'en') {
  const words = WORDS[langOf(lang)];
  const name = preset?.name || words.notKnown;
  const what = preset?.id ? words.what[preset.kind] ?? words.own(name) : words.unknownWhat;
  let when = '';
  if (preset?.from === 'default') when = words.byDefault(defaultName);
  else if (preset?.from === 'conversation') when = words.fromConversation;
  else if (preset?.from === 'own') when = words.stored;
  else if (!preset?.id) when = words.openOnce;
  let change;
  if (preset?.changeable) change = preset.newConversation ? words.changeNew : words.change;
  else change = words.fixed;
  return { title: words.title(name), what, when, change, lang: langOf(lang) };
}

/**
 * The one line under the picker for a choice (no warnings: PTC is a normal choice).
 * @param {{kind: string}} choice - a row of presetChoices, or defaultChoice.
 * @param {{newConversation?: boolean}} [preset] - the automation's current preset.
 * @param {string} [lang] - the page's language.
 */
export function choiceNote(choice, preset, lang = 'en') {
  const words = WORDS[langOf(lang)];
  const base = words.notes[choice?.kind] ?? '';
  const fresh = preset?.newConversation ? words.fresh : '';
  return [base, fresh].filter(Boolean).join(' ');
}
