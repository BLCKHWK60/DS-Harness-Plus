/**
 * The bar (build prompt, part 13): what to work on, and what to do. The selection of plugins is a boundary
 * that code enforces: Creator Plus opens the code, the logs and the passport of the selected plugins only,
 * and can change only those; for everything else it sees the map and nothing more. A run that can change a
 * plugin does not start with an empty selection; "All" is picked on purpose. Built-in and third-party
 * plugins can be selected to be read, explained and checked; they are never edited.
 */
import { oneLine } from './text.js';

/** The kinds of run: what each does and whether it can change anything. */
export const RUNS = [
  { id: 'new', label: 'New add-on', does: 'Builds a new add-on. The selection names the add-ons it has to work with.', changes: true, logs: false },
  { id: 'improve', label: 'Improve', does: 'Reads the thread logs of the selected add-ons and proposes improvements.', changes: true, logs: true },
  { id: 'wrong', label: 'Find what went wrong', does: 'Goes through earlier runs of the selected add-ons, finds the errors and works out the cause.', changes: false, logs: true },
  { id: 'rebuild', label: 'Rebuild', does: 'Builds a selected add-on again from its brief and compares the new one with the old one.', changes: true, logs: false },
  { id: 'combine', label: 'Combine or split', does: 'For several selected add-ons: could they be one add-on, or should one become two?', changes: false, logs: false },
  { id: 'gaps', label: 'Find gaps', does: 'Looks at what the selected add-ons do and how you use them, and says which add-on is missing.', changes: false, logs: true },
  { id: 'update', label: 'Check after an update', does: 'Upkeep for the selection: what broke, what is at risk, the smallest fix first.', changes: true, logs: false },
  { id: 'explain', label: 'Explain', does: 'Says in plain words what an add-on does, what it touches and how it is built.', changes: false, logs: false },
];
export const LOGS_FROM = [
  { id: 'last', label: 'since the last run' },
  { id: '7', label: 'the last 7 days', days: 7 },
  { id: '30', label: 'the last 30 days', days: 30 },
  { id: 'all', label: 'everything' },
];

/**
 * A bar state, checked.
 * @param {unknown} value - what the page sent.
 * @param {string[]} known - the plugin names the map has.
 * @returns {{selection: string[], all: boolean, run: string, lookOnly: boolean, logsFrom: string}} the state.
 */
export function barState(value, known = []) {
  const v = value && typeof value === 'object' ? value : {};
  const all = v.all === true;
  const names = new Set(known);
  const selection = all ? [...names] : (Array.isArray(v.selection) ? v.selection.map(String) : []).filter((name) => names.has(name)).slice(0, 200);
  // A new conversation starts on "New add-on" (it builds nothing in the real setup; the selection stays empty).
  const run = RUNS.some((entry) => entry.id === v.run) ? v.run : 'new';
  const logsFrom = LOGS_FROM.some((entry) => entry.id === v.logsFrom) ? v.logsFrom : '30';
  return { selection: [...new Set(selection)], all, run, lookOnly: v.lookOnly === true, logsFrom };
}

/** @returns {string} why a run cannot start, or ''. */
export function startRefusal(state) {
  const run = RUNS.find((entry) => entry.id === state.run);
  if (run?.changes && !state.lookOnly && state.selection.length === 0 && state.run !== 'new') return 'Pick the add-ons this run may work on first (or pick "All" on purpose). A run that can change an add-on does not start with nothing selected.';
  if ((state.run === 'combine') && state.selection.length < 2) return 'Combine or split needs at least two add-ons selected (or one to split).';
  return '';
}

/**
 * The run in one sentence, shown before it starts.
 * @param {object} state - barState.
 * @param {{model?: string, depth?: string, labelOf?: (name: string) => string}} [options] - who runs it, at which Depth.
 * @returns {string} the sentence.
 */
export function runSentence(state, { model = '', depth = '', labelOf = (name) => name.replace(/^@local\/dsh-/, '') } = {}) {
  const run = RUNS.find((entry) => entry.id === state.run) ?? RUNS[0];
  const which = state.all ? 'every add-on' : state.selection.length === 0 ? 'a new add-on' : state.selection.slice(0, 4).map(labelOf).join(', ') + (state.selection.length > 4 ? ` and ${state.selection.length - 4} more` : '');
  const logs = run.logs ? ` from the logs of ${LOGS_FROM.find((entry) => entry.id === state.logsFrom)?.label ?? 'the last 30 days'}` : '';
  const how = state.lookOnly ? ', looking only (nothing is prepared, not even in the trial copy)' : run.changes ? ', with changes prepared in the trial copy and nothing changed in your setup without your yes' : ', reporting only';
  return `${run.label}: ${which}${logs}${how}${depth ? `, at ${depth}` : ''}${model ? `, run by ${oneLine(model, 60)}` : ''}.`;
}

/**
 * The boundary on one plugin: may this run open or change it?
 * @param {object} state - barState.
 * @param {string} name - a plugin's package name.
 * @param {{locked?: boolean}} plugin - its map entry.
 * @param {'read' | 'change'} want - what the run wants to do.
 * @returns {string} why not, or ''.
 */
export function boundaryRefusal(state, name, plugin, want) {
  if (!state.selection.includes(name)) return `${name} is outside this run's selection. Creator Plus sees only its place on the map. Ask the user to add it to the selection${want === 'change' ? ', and say why it has to change' : ''}; in a Mission, carry on without it and put it on the list for the end.`;
  if (want === 'change' && state.lookOnly) return 'This run is "Look only": it reads and reports, and prepares no change, not even in the trial copy.';
  if (want === 'change' && plugin?.locked) return `${name} is locked: built-in and third-party plugins are read, explained and checked, never edited.`;
  if (want === 'change' && !(RUNS.find((entry) => entry.id === state.run)?.changes)) return `"${RUNS.find((entry) => entry.id === state.run)?.label}" reports only; it changes nothing.`;
  return '';
}

/**
 * Saved runs (the owner's answer: on the bar and offered in the Automations tab).
 * @param {unknown} value - the stored JSON text.
 * @returns {{name: string, state: object, sentence: string}[]} the saved runs.
 */
export function savedRunsOf(value) {
  let list = [];
  try {
    list = JSON.parse(String(value ?? '') || '[]');
  } catch {
    list = [];
  }
  return (Array.isArray(list) ? list : []).filter((item) => item && typeof item.name === 'string' && item.name.trim()).slice(0, 30).map((item) => ({ name: oneLine(item.name, 60), state: item.state ?? {}, sentence: oneLine(item.sentence ?? '', 400) }));
}

/** The first line of a scheduled saved run's message (Creator Plus knows its own runs by it). */
export const SAVED_RUN_MARK = '[Creator Plus saved run:';
/** @returns {string} the message an automation sends for a saved run. */
export const savedRunPrompt = (run) => `${SAVED_RUN_MARK} ${run.name}]\n${run.sentence}\nRun it as a Mission would: never wait for an answer; prepare every change in the trial copy only, and list the changes and open questions for the user at the end. Nothing changes in the real setup without the user's yes.`;

/**
 * Whether this run may build or prepare anything: never in Look only, never in a run that reports only.
 * @returns {string} why not, or ''.
 */
export function buildRefusal(state) {
  if (state.lookOnly) return 'This run is "Look only": it reads and reports, and builds or prepares nothing, not even in the build folder.';
  const run = RUNS.find((entry) => entry.id === state.run);
  if (!run?.changes) return `"${run?.label ?? state.run}" reports only; it builds nothing. To build, the user picks "New add-on" (or another run that changes things) on the bar.`;
  return '';
}
