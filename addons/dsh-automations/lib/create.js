/**
 * Making an automation from a chat box (the clock button) or from New on the Automations page (item 6).
 * The rules of where an automation may be made and where it runs, the plain words for the app's refusals,
 * and the checks of a request. Pure functions, so they can be tested without the app.
 *
 * The owner's decisions (21 November 2026, point 23):
 * - Recon is allowed like any space, with a warning; "Scheduling from Recon" (on by default) switches it off.
 * - In Recon only "In this thread" is offered: a new thread could not be put in Recon with full isolation
 *   before its first step (see RECON_NEW_CHAT below and the README).
 * - New threads open in the mode the automation was made in (or picked on the New form), when the setting allows it.
 * - The preset of new threads: the thread's own by default; a mode with a preset lock always uses its lock.
 */

/** Where an automation's runs go: the app's three destination kinds. */
export const WHERE = ['session', 'new_once', 'new'];

/** The name shown for an automation whose name must stay inside Recon (alerts, phone pushes, results). */
export const SEALED_NAME = 'A Recon automation';

// Plus is English only (decision 28): a page that reports Chinese still gets English. `lang` stays accepted.
const langOf = () => 'en';

/** Item 4A, stage 6b (7.2, 9.3): the space words of "Runs in", the pauses, the guest choices and the folder rule. */
const SPACE_WORDS_EN = {
  runsIn: (space, mode) => `Runs in: ${space} · ${mode}`,
  runsInThread: (space, mode) => `Runs in: this thread (${space} · ${mode})`,
  runsInScheduled: (space, mode) => `Runs in: ${space} · ${mode} (the mode for automations)`,
  placeUnticked: (space, mode) => `${mode} is no longer offered in ${space}. This automation still runs there, as you set it. To change that, use Change under Runs in.`,
  placeHidden: (space) => `${space} is hidden in Settings → Spaces. This automation still runs there; its threads are under Show all and in ⌘K.`,
  pausedSpace: (space, reason, fix) => `Paused: ${space} cannot run it now (${reason}). It was not moved anywhere else. ${fix}, then switch this automation on.`,
  pausedSpaceBack: (space) => `Paused while ${space} could not run it. ${space} can run it again: switch this automation on when you want.`,
  automationsOff: (space) => `Paused: Automations was switched off, and it is what keeps these runs in ${space}. Switch Automations on, then switch this automation on.`,
  modesOld: (space) => `Paused: Modes is off, missing or out of date, and it is what keeps these runs in ${space}. Switch on or update Modes in Settings, then switch this automation on.`,
  reasons: {
    devicesOff: ['Devices is switched off', 'Switch on Devices in Settings → Devices'],
    devicesOld: ['Devices is out of date', 'Update Devices in Settings → Devices'],
    workshopOff: ['Creator Plus is switched off', 'Switch on Creator Plus in Settings → Creator Plus'],
    workshopOld: ['Creator Plus is out of date', 'Update Creator Plus in Settings → Creator Plus'],
    unticked: ['{mode} is no longer ticked for {space}', 'Tick it in Settings → Modes, or change Runs in'],
    unavailable: ['{space} is not available', 'Switch on its add-on'],
    unknown: ['its rules could not be read', 'Check Settings → Modes'],
  },
  guestHere: (space, mode) => `A new thread in ${space} · ${mode}`,
  guestOther: 'A new thread in another space…',
  guestInfo: (space) => `Runs in ${space} follow the rules of ${space}. A run in another space follows that space's rules instead, in a folder you pick.`,
  otherWarn: (space, space2, mode) => `Runs in ${space2} do not follow the rules of ${space}: the new thread gets the tools of ${space2}, the Terminal included where ${mode} allows it. The instruction you type goes with it.`,
  guestFolderNeeded: (space2) => `Pick a folder for runs in ${space2}.`,
  guestFolderRefused: 'That folder cannot be used: it is, or holds, the Devices folder, /dev or Recon\'s room. Pick another folder.',
  guestFolderUnchecked: (space) => `The folder could not be checked, because Devices is off or out of date. Switch on or update Devices in Settings → Devices, or let it run in ${space}.`,
  guestOwnFolder: (space) => `This is the ${space} thread's own folder; files written there by ${space} tools will be readable by the new thread.`,
  needsNewerModes: (space) => `Runs in ${space} need a newer Modes add-on (it keeps them in ${space}). Update Plus, or let it run in this thread.`,
  presetLockedSpace: (space, mode, preset) => `Its new threads open in ${space} · ${mode}, which always uses ${preset}. Change that in Settings → Spaces.`,
  presetWillBe: (preset, space) => `After this change its new threads use ${preset} (the lock of ${space}).`,
  placeRefused: 'That place is not offered now. Look again, then pick one from the list.',
  benchHome: 'Automations are not made from the Devices mode: it keeps its own rules, as before. Make it from another mode in Devices, or from a Chat or Code thread.',
  roomFolder: 'That folder is Recon\'s room: an automation cannot open new threads there. Pick another folder.',
  wrapperPaused: (space) => `It was made paused: its place in ${space} could not be recorded. Open Automations and switch it on to try again.`,
};
/** Every word the server sends for the Schedule form. `CREATE_WORDS.en` is the one table (English only). */
export const CREATE_WORDS = {
  en: {
    noScheduler: "The app's scheduler is not running. Restart the app, then try again.",
    badTime: 'That time does not work. Pick another time.',
    tooOften: 'That repeats too often. The app allows at most one run a minute.',
    badZone: 'Your time zone was not recognised. Check the Mac\'s time zone, then try again.',
    cannotReceive: "This thread can't receive automations. Choose \"In a new thread each time\" or \"In one new thread, reused\".",
    badPrompt: 'The instruction is empty or too long.',
    refused: 'The app did not accept it. Try again; Details says what the app reported.',
    name: 'A name of 1 to 120 characters.',
    prompt: 'Write what should happen at each run.',
    promptLong: 'The instruction is too long (at most 20,000 characters).',
    where: 'Pick where it runs.',
    helper: 'This is a helper thread, so it cannot receive automations. Use the thread it works for.',
    reconOff: 'Scheduling is off in Recon. An automation\'s name and instruction can be seen outside Recon (the Automations list, and the assistant\'s schedule tools in other spaces). To allow it, switch on Settings → Alerts → Scheduling from Recon.',
    reconNewChat: 'In Recon an automation runs only in this thread. A new thread could not be placed in Recon with all of Recon\'s rules before its first step, so it is not offered.',
    reconWarn: 'The name and instruction you type can be seen outside Recon: in the Automations list, and by the assistant\'s schedule tools in other spaces. Write nothing you would not show there.',
    noSession: 'Which thread? Open the thread again, then try once more.',
    noTab: 'Pick a mode that is switched on.',
    tabIsolated: 'An automation cannot open new threads in Recon or in a sealed mode. Pick another mode.',
    // Item 4A, stage 6b (7.2): a thread whose space's rules cannot be read now (replaces 6a's guardedSpace).
    guardNotReady: (space, reason, fix) => `Automations cannot be made from this thread now: the rules of ${space} cannot be read (${reason}). ${fix}, then try again.`,
    ...SPACE_WORDS_EN,
    noFolder: 'Pick a folder for the new threads.',
    gone: 'That automation is gone.',
    changed: 'It was changed on another page meanwhile. Look again, then try once more.',
    notNewChat: 'Only an automation that opens new threads has a place to run in. Nothing was changed.',
    tabGone: (tab, change = true) => `Paused: its mode ${tab} is switched off. Switch it on${change ? ', or change Runs in' : ''}, then switch this automation on.`,
    tabBack: (tab) => `Paused while its mode ${tab} was off. ${tab} is on again: switch this automation on when you want.`,
    noNewChats: 'New threads cannot be made here. Choose "In this thread".',
    financeTab: 'A Finance brief always opens in a Chat · Finance thread. Finance decides that.',
    reused: 'Its thread is already made, and every run goes on there. To run in another mode, make the automation again from a thread in that mode.',
    runTabOff: 'New threads open in the mode for automations now (Settings → Alerts → "New threads use the automation\'s mode" is off). Switch that on to choose a mode here.',
    presetLocked: (tab, preset) => `Its new threads open in ${tab}, which always uses ${preset}. Change that in Settings → Modes.`,
    missionWarn: 'A Mission is running here. Each run\'s message joins it and may change its course. Choose a new thread to keep them apart.',
    waitingNote: 'After each run, requests that need your yes wait in "Waiting for you" until you write here.',
  },
};

/** @returns {object} the words of a language. */
export const createWords = (lang) => CREATE_WORDS[langOf(lang)];

/**
 * An Error in plain words, with the raw cause only for Details.
 * @param {string} text - the sentence the user sees.
 * @param {string} [details] - the raw cause.
 */
export function plainError(text, details) {
  const error = new Error(text);
  if (details) error.details = String(details).slice(0, 300);
  return error;
}

/**
 * The app's refusal of a new automation in plain words (its ScheduleInputError is thrown, with a `.code`).
 * @param {unknown} error - what schedule.create threw.
 * @param {string} [lang] - the page's language.
 * @returns {Error} the plain sentence, the code and the app's message behind Details.
 */
export function scheduleProblem(error, lang = 'en') {
  const words = createWords(lang);
  const code = String(error?.code ?? '').replace(/^schedule\//, '');
  const message = String(error?.message ?? error ?? '');
  const details = code ? `${code}: ${message}` : message;
  // Only about a Session: "The local at time does not exist" is a time problem (a clock change), not a lost chat.
  if (code === 'subagent_session' || ((code === 'invalid_rule' || code === 'target-archived') && /Session/.test(message) && /archived|does not exist|cannot be inspected/i.test(message))) return plainError(words.cannotReceive, details);
  // The app also says invalid_rule for things that are not about the time (review finding, item 6).
  if (code === 'invalid_rule' && /cannot create Sessions/i.test(message)) return plainError(words.noNewChats, details);
  if (code === 'invalid_rule' && /\b(target|Session|patch|limit|offset|history)\b/.test(message)) return plainError(words.refused, details);
  if (['invalid_rule', 'not_future', 'time_out_of_range', 'invalid_selector'].includes(code)) return plainError(words.badTime, details);
  if (code === 'frequency_too_high') return plainError(words.tooOften, details);
  if (code === 'invalid_time_zone') return plainError(words.badZone, details);
  if (code === 'invalid_prompt') return plainError(words.badPrompt, details);
  return plainError(words.refused, details);
}

/**
 * Item 4A, stage 6b: the guarded space that refuses a new automation from a thread, or '' when it may be made. Point 27:
 * guests in Devices and Workshop may make them (their runs stay in the space unless the owner picks another). Refused
 * (fail closed): a guard that is missing or not an object, the `unknown` guard, an unknown top, or a guarded space whose
 * guard is not ready now (`ready[space] !== true`, Modes' `spaces.ready()`). Home modes keep today's behaviour (point 26,
 * G3/G4): Creator Plus at home in Workshop may (as before 6a); Devices mode at home has no clock (as before 6b).
 * @param {object} guard - what Modes says about the thread (`guardOf`).
 * @param {Record<string, boolean>} [ready] - `modes.spaces.ready()`; none counts as not ready.
 * @returns {string} 'devices', 'workshop', another guarded name ('unknown'), or '' (not refused).
 */
export function guardedRefusal(guard, ready = {}) {
  if (!guard || typeof guard !== 'object') return 'unknown';
  const space = String(guard.guardedBy ?? '');
  if (!space) return guard.unknownTop === true && guard.space === 'unknown' ? 'unknown' : '';
  if (space !== 'devices' && space !== 'workshop') return space;
  if (guard.unknownTop === true) return space;
  const creatorAtHome = space === 'workshop' && guard.space === 'workshop' && guard.mode === 'creator-plus' && guard.homeMode === true;
  if (creatorAtHome) return '';
  // G4: the Devices mode at home keeps no clock (home modes keep today's behaviour; owner question O3).
  if (space === 'devices' && guard.mode === 'bench' && guard.homeMode === true) return 'devices';
  return ready && typeof ready === 'object' && ready[space] === true ? '' : space;
}

/**
 * Item 4A, stage 6b (J10): the guest space of a thread ('devices', 'workshop'), '' when it is not a guest there (a home
 * mode, another space, or a guard that could not be read).
 * @param {object} guard - `guardOf`.
 * @returns {string}
 */
export function guestOf(guard) {
  if (!guard || typeof guard !== 'object' || guard.unknownTop === true) return '';
  const space = String(guard.guardedBy ?? '');
  if (space !== 'devices' && space !== 'workshop') return '';
  return guard.homeMode === true ? '' : space;
}

/**
 * What the Schedule form may offer in a thread, decided on the server (the page only shows it).
 * @param {object} facts
 * @param {string} facts.tab - the thread's tab.
 * @param {boolean} facts.isolated - the thread is isolated (Recon), or that is not known.
 * @param {boolean} facts.helper - a helper thread (the app refuses those).
 * @param {boolean} facts.reconAllowed - the setting "Scheduling from Recon".
 * @returns {{allowed: boolean, reason?: string, wheres: string[], recon: boolean}} `reason` is a key of CREATE_WORDS.
 */
export function placePolicy({ tab, isolated, helper, reconAllowed, guest = '' }) {
  if (helper) return { allowed: false, reason: 'helper', wheres: [], recon: false };
  if (isolated) {
    if (!reconAllowed) return { allowed: false, reason: 'reconOff', wheres: [], recon: true };
    // RECON_NEW_CHAT: only this thread (the owner-accepted fallback). A chat the scheduler makes is created in the
    // scheduled tab, outside the Recon room, and other add-ons see it as a normal chat when it is made. A 'new' chat is
    // known to belong to the automation only when its message arrives; a 'new_once' chat's id is reserved at create
    // time, but it is still created outside Recon. See the README.
    return { allowed: true, wheres: ['session'], recon: true };
  }
  // Item 4A, stage 6b (J10): a guest in Devices or Workshop: this thread, a new thread in this space · this mode, or a new
  // thread in Chat or Code in a folder the owner picks.
  if (guest === 'devices' || guest === 'workshop') return { allowed: true, wheres: [...WHERE], recon: false, guest, otherSpaces: ['chat', 'code'] };
  return { allowed: true, wheres: tab === 'automations' ? ['new_once', 'new'] : [...WHERE], recon: false };
}

/**
 * The tab new threads of an automation open in.
 * @param {object} want
 * @param {string} want.tab - where it was made (or the tab picked on the New form).
 * @param {boolean} want.ownTab - the setting "New threads use the automation's mode".
 * @param {string} want.scheduledTab - Settings → Modes → Mode for automations.
 * @returns {string} the tab.
 */
export function runTabFor({ tab, ownTab, scheduledTab }) {
  // The Automations tab is no place for a run (step A5): its new threads open in the scheduled tab.
  if (!ownTab || !tab || tab === 'automations') return scheduledTab;
  return tab;
}

/**
 * The preset new threads of an automation get, written into target.create.agentPreset.
 * @param {object} want
 * @param {string} want.locked - the run tab's preset lock ('' for none).
 * @param {string} want.picked - the preset picked in the form (':default' for the app's default, '' for none picked).
 * @param {string} want.chat - the preset of the thread it was made from ('' when not known or on the New form).
 * @param {string[]} want.known - the presets the app has now.
 * @returns {string} the preset id, or '' to store none (the app's default at each run).
 */
export function presetFor({ locked, picked, chat, known = [] }) {
  if (locked) return locked;
  if (picked === ':default') return '';
  if (picked && known.includes(picked)) return picked;
  if (picked) throw plainError('That preset is not in the app now. Look again, then pick one from the list.');
  return chat && known.includes(chat) ? chat : '';
}

/**
 * The name and instruction, checked.
 * @returns {{title: string, prompt: string}}
 */
export function checkText({ title, prompt }, lang = 'en') {
  const words = createWords(lang);
  const name = String(title ?? '').trim();
  const text = String(prompt ?? '').trim();
  if (!name || name.length > 120) throw plainError(words.name);
  if (!text) throw plainError(words.prompt);
  if (text.length > 20000) throw plainError(words.promptLong);
  return { title: name, prompt: text };
}

/** The first words of an instruction, up to 60 characters, as a starting name. */
export function nameFrom(prompt) {
  const text = String(prompt ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= 60) return text;
  const cut = text.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Task ids of the scheduler's messages put into an inbox (`agent/inbox/spliced` -> data.inserted).
 * The same reading as Finance's (dsh-finance/lib/briefs.js) and this add-on's run record.
 * @param {unknown} inserted - the inserted messages.
 * @returns {string[]} the ids.
 */
export function scheduledIds(inserted) {
  const ids = [];
  for (const item of Array.isArray(inserted) ? inserted : []) {
    const message = item?.message ?? item;
    if (message?.source?.kind !== 'schedule') continue;
    const text = (Array.isArray(message.content) ? message.content : []).map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n');
    if (!text.trimStart().startsWith('[SCHEDULE REMINDER')) continue;
    const one = /^schedule_id_json: (.+)$/m.exec(text);
    if (one) {
      try {
        ids.push(String(JSON.parse(one[1])));
      } catch {
        /* not a task id */
      }
    }
    const many = /^reminders_json: (.+)$/m.exec(text);
    if (many) {
      try {
        for (const entry of JSON.parse(many[1])) if (entry?.schedule_id) ids.push(String(entry.schedule_id));
      } catch {
        /* not a list */
      }
    }
  }
  return [...new Set(ids)];
}

/**
 * Whether an automation's name must stay inside Recon: it writes into an isolated thread, or it was made in an
 * isolated tab. Computed, never stored, so it covers automations made before this rule too.
 * @param {object} want
 * @param {object} want.entry - the catalog entry (or a recipe).
 * @param {string} [want.createdIn] - the tab it was made in.
 * @param {(sessionId: string) => boolean} want.isolated - a thread is isolated (unknown counts as isolated).
 * @param {(tab: string) => boolean} want.isolatedTab - a tab is isolated.
 */
export function sealedOf({ entry, createdIn, isolated, isolatedTab, createdSpace = '' }) {
  if (createdIn && isolatedTab(createdIn)) return true;
  // Item 4A, stage 6b: made in the Recon space (any mode).
  if (createdSpace === 'recon') return true;
  const target = entry?.target ?? {};
  const into = target.kind === 'session' ? target.sessionId : '';
  return Boolean(into) && isolated(String(into));
}

/** Item 4A, stage 6b: the spaces an automation's runs may be stored in (Recon never: "this thread only", D9). */
export const RUN_SPACES = Object.freeze(['chat', 'code', 'devices', 'workshop']);
/** The guarded spaces a run place may be in (they keep their own rules; a run there is never moved, J9). */
export const GUARDED_RUN_SPACES = Object.freeze(['devices', 'workshop']);
const isGuardedRun = (space) => GUARDED_RUN_SPACES.includes(space);

/**
 * Item 4A, stage 6b (J5-J9): where an automation's runs happen, the pair space · mode.
 * - A stored place (`note.runSpace`, written only from 6b on) is used as it is (`stored: true`).
 * - Else the derived place, worked out when read and never written: `ofMode(runTab)` for one with a run mode (exactly where
 *   Modes puts a claimed scheduled thread today), else the place Modes gives a scheduled thread in its folder
 *   (`scheduledPlace(cwd)`): the assistant's, Finance's, or the setting off.
 * - A session target runs in its thread: `{space: thread's space, mode: thread's mode, fixed: 'thread'}`.
 * `fixed` as before: 'finance' (Finance decides), 'off' (the setting is off), 'reused' (its one thread exists).
 * @param {object} want
 * @param {object} want.task - the catalog entry.
 * @param {object} want.note - its notes.
 * @param {(mode: string) => string} want.ofMode - Modes' `spaces.ofMode`.
 * @param {(cwd: string) => {space: string, mode: string}} want.scheduledPlace - Modes' `spaces.scheduledPlace`.
 * @param {boolean} want.ownTab - "New threads use the automation's mode".
 * @param {(task: object) => boolean} want.isFinanceBrief
 * @param {(sessionId: string) => {space: string, mode: string}} [want.threadPlace] - a thread's space and mode.
 * @param {string} [want.scheduledMode] - Settings → Modes → Mode for automations (when `scheduledPlace` is missing).
 * @returns {{space: string, mode: string, stored: boolean, fixed: string, note: string}}
 */
export function runPlaceOf({ task, note = {}, ofMode, scheduledPlace, ownTab, isFinanceBrief, threadPlace, scheduledMode = 'cowork' }) {
  const kind = task?.target?.kind;
  const spaceOf = (mode) => {
    try {
      return String(ofMode?.(mode) ?? '') || 'chat';
    } catch {
      return 'chat';
    }
  };
  const scheduled = () => {
    try {
      const place = scheduledPlace?.(String(task?.target?.create?.cwd ?? ''));
      if (place && typeof place.space === 'string' && place.space) return { space: place.space, mode: String(place.mode ?? '') || scheduledMode };
    } catch {
      // the mode's own space below
    }
    return { space: spaceOf(scheduledMode), mode: scheduledMode };
  };
  if (kind === 'session' || (kind === 'new_once' && task?.lastDelivery)) {
    const id = String(task?.target?.sessionId ?? '');
    let place = { space: '', mode: '' };
    try {
      place = (id && threadPlace?.(id)) || place;
    } catch {
      place = { space: '', mode: '' };
    }
    return { space: String(place.space ?? ''), mode: String(place.mode ?? '') || String(note.runTab ?? ''), stored: Boolean(note.runSpace), fixed: kind === 'session' ? 'thread' : 'reused', note: '' };
  }
  if (kind !== 'new' && kind !== 'new_once') return { space: '', mode: '', stored: false, fixed: '', note: '' };
  if (isFinanceBrief?.(task)) return { space: spaceOf('finance'), mode: 'finance', stored: false, fixed: 'finance', note: '' };
  const runSpace = typeof note.runSpace === 'string' && RUN_SPACES.includes(note.runSpace) ? note.runSpace : '';
  // C2: a guarded stored place always opens there, also with the setting off (it only steers Chat and Code runs).
  if (runSpace && note.runTab && (ownTab || isGuardedRun(runSpace))) return { space: runSpace, mode: note.runTab, stored: true, fixed: '', note: String(note.placeNote ?? '') };
  if (note.runTab && ownTab) return { space: spaceOf(note.runTab), mode: note.runTab, stored: false, fixed: '', note: '' };
  return { ...scheduled(), stored: false, fixed: note.runTab && !ownTab ? 'off' : '', note: '' };
}

/**
 * Item 4A, stage 6b (J8, J9, J17, C3): what the pause guard watches for one automation, and whether it is missing now.
 * - Mode gone (its add-on off): as before 6b, `watch` is the mode id (pausedFor = the mode).
 * - A stored guarded place, a thread target or clock-made thread whose `createdSpace` is guarded, or a legacy `createdIn`
 *   of 'devices'/'workshop': `watch` is 'space:<id>'; missing while the guard is not ready, the mode is not offered (or
 *   greyed) there, or the space is not available. Never moved: the automation pauses (J9).
 * - A stored Chat or Code place whose mode is no longer offered, or whose space is hidden: never a pause, a `placeNote`
 *   ('unticked' or 'hidden', J8).
 * @param {object} want
 * @param {object} want.task - the catalog entry.
 * @param {object} want.note - its notes.
 * @param {string} want.legacyWatch - what the pre-6b guard watched (`watchedTab`), '' for nothing.
 * @param {(id: string) => boolean} want.modeThere - the mode is in Modes' list (its add-on on).
 * @param {(space: string) => 'ready' | 'off' | 'old' | 'unknown'} want.guardState - the guarded space's guard.
 * @param {(space: string, mode: string) => boolean} want.offered - ticked and not greyed there.
 * @param {(space: string) => boolean} want.available - the space can be used now.
 * @param {(space: string) => boolean} [want.shown] - the space is shown (not hidden) in Settings → Spaces.
 * @param {boolean} [want.ownTab]
 * @returns {{watch: string, missing: boolean, reason: string, placeNote: string, space: string, mode: string}}
 */
export function guardWatch({ task, note = {}, legacyWatch = '', modeThere, guardState, offered, available, shown = () => true, ownTab = true }) {
  const kind = task?.target?.kind;
  const runSpace = typeof note.runSpace === 'string' ? note.runSpace : '';
  const newThread = kind === 'new' || kind === 'new_once';
  let space = '';
  let mode = '';
  if (newThread && runSpace && note.runTab && !(kind === 'new_once' && task?.lastDelivery)) {
    if (isGuardedRun(runSpace)) {
      space = runSpace;
      mode = String(note.runTab);
    } else if (ownTab) {
      // J8: a stored Chat or Code place never pauses for an untick or a hidden space; a mode whose add-on is off does (C3).
      const runMode = String(note.runTab);
      if (!modeThere(runMode)) return { watch: runMode, missing: true, reason: 'modeGone', placeNote: '', space: runSpace, mode: runMode };
      const placeNote = !shown(runSpace) ? 'hidden' : !offered(runSpace, runMode) ? 'unticked' : '';
      return { watch: runMode, missing: false, reason: '', placeNote, space: runSpace, mode: runMode };
    }
  } else if (isGuardedRun(String(note.createdSpace ?? '')) && (kind === 'session' || (kind === 'new_once' && task?.lastDelivery) || (newThread && note.made === 'tool'))) {
    // A thread target made from a guest thread (this thread), or its one reused thread: the space's readiness.
    space = String(note.createdSpace);
    mode = String(note.createdIn ?? '');
  } else if (isGuardedRun(String(note.createdIn ?? ''))) {
    // J17: a legacy space id in createdIn is a space, never a missing mode.
    space = String(note.createdIn);
    mode = '';
  }
  if (space) {
    if (mode && !modeThere(mode)) return { watch: mode, missing: true, reason: 'modeGone', placeNote: '', space, mode };
    const state = guardState(space);
    const watch = `space:${space}`;
    if (state !== 'ready') return { watch, missing: true, reason: state === 'old' ? `${space}Old` : state === 'unknown' ? 'unknown' : `${space}Off`, placeNote: '', space, mode };
    if (!available(space)) return { watch, missing: true, reason: 'unavailable', placeNote: '', space, mode };
    if (mode && !offered(space, mode)) return { watch, missing: true, reason: 'unticked', placeNote: '', space, mode };
    return { watch, missing: false, reason: '', placeNote: '', space, mode };
  }
  if (!legacyWatch) return { watch: '', missing: false, reason: '', placeNote: '', space: '', mode: '' };
  return { watch: legacyWatch, missing: !modeThere(legacyWatch), reason: 'modeGone', placeNote: '', space: '', mode: legacyWatch };
}
