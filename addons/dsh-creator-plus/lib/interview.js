/**
 * The interview, the brief and the plan (build prompt, part 3). Creator Plus reads the map and asks
 * only what the map cannot answer, one question at a time, each with a recommendation and the user's
 * usual answer as the default. It always settles four things: alone or with other plugins; the look of
 * what is enabled or a look of its own; whether an existing plugin has to change; which tabs it appears
 * in and which permissions it needs.
 */
import { KINDS } from './recipes.js';
import { oneLine } from './text.js';

/** The four questions always settled, in order, with the safe recommendation. */
export const ALWAYS = [
  { id: 'together', question: 'Should the new plugin stand alone, or work with plugins you already have?', options: ['Stand alone', 'Work with others (name them)'], recommended: 'Stand alone', why: 'A plugin that stands alone cannot break another one; it can still read what others offer.' },
  { id: 'look', question: 'Should it match the look of what you have, or have a look of its own?', options: ['Match what I have', 'A look of its own (describe it)'], recommended: 'Match what I have', why: 'Matching keeps every page alike and readable in light and dark.' },
  { id: 'change', question: 'Does an existing plugin have to change for it?', options: ['No, nothing else changes', 'Yes (name it and what changes)'], recommended: 'No, nothing else changes', why: 'Nothing else changes, so nothing else can break; a change to another plugin is shown, backed up and tested first.' },
  { id: 'where', question: 'Which tabs should it appear in, and what may it do (read only, change files, go online)?', options: ['Only where you start it, read only', 'Name the tabs and what it may do'], recommended: 'Only where you start it, read only', why: 'The smallest reach is the safest start; it can be widened later.' },
];

/**
 * The next question to ask, or none when the four are settled.
 * @param {object} input - `answers` (id → text), `kind` (when known), `preferences` (id → usual answer).
 * @returns {{id: string, question: string, options: string[], recommended: string, usual: string, why: string} | undefined} the question.
 */
export function nextQuestion({ answers = {}, kind = '', preferences = {} }) {
  if (!KINDS.includes(kind) && !answers.kind) {
    return { id: 'kind', question: 'What kind of plugin is it?', options: ['A tool the assistant calls', 'A tab (a mode)', 'A page or panel', 'A look', 'An automation', 'A model provider'], recommended: 'A tool the assistant calls', usual: preferences.kind ?? '', why: 'Each kind has its own recipe.' };
  }
  for (const item of ALWAYS) {
    if (!answers[item.id]) return { ...item, usual: preferences[item.id] ?? '' };
  }
  return undefined;
}

/** A plugin's folder name from its title: dsh-<words>. */
export function slugOf(title) {
  const slug = String(title ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return slug ? (slug.startsWith('dsh-') ? slug : `dsh-${slug}`) : '';
}

/**
 * The brief (part of the passport): what the plugin is for and what it must do, complete enough that a
 * later model could rebuild it from it alone.
 * @param {object} input - `title`, `kind`, `purpose`, `must` (lines), `mustNot` (lines), `answers`, `assumed` (lines), `at`.
 * @returns {string} brief.md.
 */
export function briefText({ title, kind, purpose, must = [], mustNot = [], answers = {}, assumed = [], at = Date.now() }) {
  const day = new Date(at).toISOString().slice(0, 10);
  return [
    `# Brief: ${oneLine(title, 80)}`,
    '',
    `Kind: ${kind}. Written ${day} by Creator Plus from the user's answers.`,
    '',
    `What it is for: ${oneLine(purpose, 600)}`,
    '',
    '## What it must do',
    '',
    ...(must.length ? must.map((line) => `- ${oneLine(line, 300)}`) : ['- (to be filled in)']),
    '',
    '## What it must never do',
    '',
    ...(mustNot.length ? mustNot.map((line) => `- ${oneLine(line, 300)}`) : []),
    '- Weaken another tab\'s safety rules, change the app\'s own files or a third-party plugin, or keep a password or key in a file.',
    '',
    '## How it fits',
    '',
    ...ALWAYS.map((item) => `- ${item.question} ${oneLine(answers[item.id] ?? item.recommended, 200)}`),
    ...(assumed.length ? ['', '## Assumed (a Long run did not stop to ask; the user can change these)', '', ...assumed.map((line) => `- ${oneLine(line, 300)}`)] : []),
    '',
  ].join('\n');
}

/**
 * The plan the fit check reads, from the plugin's intended names.
 * @param {object} input - `folder` (dsh-…), `kind`, `tools`, `commands`, `tabs`, `slots`, `services`, `storage`, `instructionChars`, `changes`, `newMode`.
 * @returns {object} the plan.
 */
export function planOf({ folder, kind, tools = [], commands = [], tabs = [], slots = [], services = [], storage = [], instructionChars = 0, changes = [], newMode = '' }) {
  const short = String(folder ?? '').replace(/^dsh-/, '');
  const pageSlot = { name: 'settings.section', id: short };
  return {
    name: `@local/${folder}`,
    folder,
    kind,
    tools: tools.map(String),
    commands: commands.map(String),
    routes: [`/${folder}/data`],
    slots: [pageSlot, ...slots.filter((slot) => slot && slot.name && slot.id)],
    services: services.map(String),
    settings: [short],
    rows: [short],
    storage: storage.map(String),
    modes: [...tabs.map(String), ...(newMode ? [newMode] : [])],
    newModes: newMode ? [newMode] : [],
    instructionChars: Number(instructionChars) || 0,
    changes: Array.isArray(changes) ? changes : [],
  };
}

/** @returns {string} the plan in plain words: what will be created, what it touches, what could collide. */
export function planText(plan, fit) {
  return [
    `Plan for ${plan.folder} (${plan.kind}):`,
    `- Creates: a new plugin folder ${plan.folder} in this conversation's build folder, with its tests, README and passport; nothing in your real setup.`,
    `- Adds: ${[plan.tools.length ? `tools ${plan.tools.join(', ')}` : '', plan.commands.length ? `commands ${plan.commands.map((name) => `/${name}`).join(', ')}` : '', plan.newModes.length ? `the tab ${plan.newModes.join(', ')}` : '', `a Settings page`].filter(Boolean).join('; ')}.`,
    `- Appears in: ${plan.modes.length ? plan.modes.join(', ') : 'where it is started'}.`,
    plan.changes.length ? `- Changes: ${plan.changes.map((change) => `${change.plugin} (${(change.files ?? []).join(', ')})`).join('; ')}.` : '- Changes no other plugin.',
    '',
    fit.result === 'clear' ? 'Fit check: clear.' : `Fit check: ${fit.result === 'blocked' ? 'BLOCKED' : 'needs your decision'}:\n${fit.findings.map((finding) => `- ${finding.text}`).join('\n')}`,
  ].join('\n');
}
