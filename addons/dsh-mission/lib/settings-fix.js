/**
 * Owner point 19 (20 November 2026): the repair helper may change any ordinary setting, after your Allow.
 *
 * How a setting is named: by its id in the settings list (Settings helper's settings-index.json, `field`, for example
 * `ui-chat.transcriptView`) and the new value. The repair helper gets a short list of the settings it may name, each with
 * its page, label, value now and the values it may take. The runner never guesses from words: an ask is a change only
 * when its id is exactly one setting of that list and its new value is valid for it. Anything else stays a suggestion
 * question ("change it there; then answer here"), as before. An ask for a setting that would give a Mission more access
 * (permissions, sandbox, tool access, presets, keys, the internet, Recon or Devices rules, Budget guard on or off, Mission's
 * own When it needs you, an add-on on or off, settings kept only in the config file) is refused and listed, never asked.
 *
 * The values come from the app's settings service (`describe()`: each add-on's namespace, its schema and its values now);
 * the change is made with `mutate(namespace, [{op: 'set', path, value}])`, the same call the Calls-at-once fix uses.
 * Pure, so it is tested without the app.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCESS_ASK } from './repair.js';
import { LIMIT_RANGE, LONG_RANGE, HELPERS_MAX } from './run.js';

/** The kinds of control whose value the repair helper may change. */
export const SETTING_KINDS = Object.freeze(['switch', 'number', 'slider', 'select', 'segments', 'text']);
/** At most this many characters of the list go into the repair helper's prompt. */
export const SETTINGS_LIST_MAX = 8000;
/** A text setting's new value: one line, at most this long. */
export const TEXT_MAX = 200;

/** Pages whose settings give access or hold keys: never changed by a Mission. */
const REFUSED_PAGES = new Set(['tool-access', 'agent-presets', 'sampling-presets', 'recon', 'bench', 'account', 'models', 'web-sources', 'plugins', 'mac', 'finance', 'creator-plus']);
/**
 * Namespaces of the same kind (also where a page is shared). Also: Tuner Plus (consents, night work, what it learns from),
 * Engines (whether changes go in without review), role instructions, Model Tiers, Notify's rules and Skill architect
 * (learning by itself): each decides what happens without you, or which model or instructions are used.
 */
const REFUSED_NS = new Set(['mac', 'finance', 'creator-plus', 'permission', 'bash-sandbox', 'privacy', 'web', 'web-deepseek-api', 'web-search-deepseek', 'session-log-deepseek', 'sync', 'agent-preset-registry', 'recon', 'bench', 'shared-settings', 'tuning', 'engines', 'role-prompts', 'model-tiers', 'notify', 'skill-architect']);
/**
 * Mission's own settings that decide when it needs you, what it may do, or what it asks: never changed by a Mission. Also
 * the spaces of item 4A (each thread's space, the space ticks per mode, the per-space settings, the one-time fill): where a
 * thread lives decides its rules once spaces carry them, so a repair helper never moves a thread or opens a space.
 */
const REFUSED_FIELDS = new Set(['mission.longNeeds', 'mission.longWaitAsk', 'mission.longWaitHold', 'mission.waitMinutes', 'mission.defaultMode', 'mission.longAssistant', 'mission.longCarryOn', 'mission.loopTabs', 'budget.enabled', 'modes.defaultMode', 'modes.scheduledMode', 'modes.sessionSpaces', 'modes.modeSpaces', 'modes.spaceSettings', 'modes.spacesFilled', 'modes.spacesRefreshed', 'modes.plainAdded', 'modes.plainCarried', 'modes.plainCarriedIn', 'modes.plainFence', 'modes.sessionModeChanges', 'modes.modeDescriptions', 'modes.sessionIsolated', 'modes.sealedExtra', 'modes.gridInGuarded', 'modes.guestRunSpaces', 'modes.guestRunModes', 'engines.applyWhen', 'skill-architect.schedule', 'tuning.anthropicOpenEnded', 'tuning.providers', 'tuning.nightShift', 'tuning.nightSkills', 'tuning.nightTrain', 'tuning.skills', 'tuning.harvest']);
/**
 * Words of a setting (its label, field, keywords and description) that say it works without you, by itself, at night,
 * on a schedule, with a consent, or without a review step.
 */
const ON_ITS_OWN_WORDS = /by itself|on its own|at night|night shift|\bschedul|in the background|without (review|you\b|asking|a review)|review step|terms of use|\bconsent|\bauto\b|auto-|goes? in without|puts? everything in/i;
/** Words of a setting's label or id that say it picks a model, a role, a depth or instructions (a fallback model has its own ask). */
const MODEL_WORDS = /\bmodels?\b|\broles?\b|\bjudge\b|\bteacher\b|\bdepth\b|\binstructions?\b|\blenses\b/i;
/**
 * Mission's own numbers have no bounds in their schema: the ranges Settings → Mission and the runner use. `zero`: 0 is
 * allowed too, and means the words given.
 */
const FIELD_RANGES = Object.freeze({
  'mission.maxItems': { min: LIMIT_RANGE.maxItems[0], max: LIMIT_RANGE.maxItems[1], step: 1 },
  'mission.maxTries': { min: LIMIT_RANGE.maxTries[0], max: LIMIT_RANGE.maxTries[1], step: 1 },
  'mission.maxReviews': { min: LIMIT_RANGE.maxReviews[0], max: LIMIT_RANGE.maxReviews[1], step: 1 },
  'mission.maxSteps': { min: LIMIT_RANGE.maxSteps[0], max: LIMIT_RANGE.maxSteps[1], step: 1 },
  'mission.longMinutes': { min: LONG_RANGE.minutes[0], max: LONG_RANGE.minutes[1], step: 1, zero: 'no time limit' },
  'mission.longLaps': { min: LONG_RANGE.laps[0], max: LONG_RANGE.laps[1], step: 1, zero: 'no lap limit' },
  'mission.longHelpers': { min: 1, max: HELPERS_MAX, step: 1 },
});
/** Characters that could make a value read as something else on the card (control and direction marks). */
const HIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
/** Words of a setting that point at access, places or programs. */
const ACCESS_WORDS = /\burls?\b|\bhosts?\b|endpoint|\bproxy\b|base url|\bfolders?\b|\bpaths?\b|directory|\bcommands?\b|allow ?list|block ?list|deny ?list|approval|auto-?approve|\bdangerous\b|\brisky\b|without asking|trusted|readers?\b|who may|\bspend|\busd\b|\bcost|\bphone\b|ntfy|\btopic\b|upload|\bshare|real (?:conversations|threads)|applyLive/i;
/**
 * Settings the repair helper does not change this way, because they have their own ask: Calls at once ('calls'), the
 * roles' models ('model') and the Budget guard's limits ('budget', asked when Budget stops a Mission).
 */
const OWN_ASK_FIELDS = new Set(['mission.callsAtOnce', 'mission.roles', 'mission.projects']);
const OWN_ASK_PAGES = new Set(['budget']);

const line = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Read the settings list of Settings helper, beside Mission's own folder (installed add-ons sit side by side).
 * @param {string} [dir] - the folder holding the add-ons; Mission's parent folder when not given.
 * @returns {object[]} the entries; [] when it is not there or cannot be read.
 */
export function readSettingsIndex(dir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))) {
  const file = join(dir, 'dsh-settings-plus', 'settings-index.json');
  try {
    if (!existsSync(file)) return [];
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry === 'object' && typeof entry.field === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Why a setting of the list may never be changed by a Mission ('' when it may).
 * @param {object} entry - a settings list entry.
 * @returns {string} the plain reason.
 */
export function refusedSetting(entry) {
  const field = String(entry?.field ?? '');
  const ns = field.split('.')[0];
  const name = [entry?.label, entry?.heading, field, ...(Array.isArray(entry?.keywords) ? entry.keywords : [])].map((part) => String(part ?? '')).join(' ');
  // The description counts too: "auto puts everything in" is said there, not in the label.
  const words = `${name} ${String(entry?.description ?? '')}`;
  if (entry?.configOnly === true) return 'it is kept only in the app\'s config file';
  if (entry?.internal === true) return 'the app keeps it itself';
  if (REFUSED_FIELDS.has(field) || /^mission\.long(Needs|Wait)/.test(field)) return 'it decides what a Mission or a thread may do, or when it asks you';
  if (/\.enabled$/.test(field)) return 'it switches an add-on or a feature on or off';
  if (REFUSED_PAGES.has(String(entry?.page ?? '')) || REFUSED_NS.has(ns)) return 'it gives access, or holds keys or rules';
  // Access words are read in the name only: descriptions say "tool output" or "the overall commands" of harmless settings.
  if (ACCESS_ASK.test(name) || ACCESS_WORDS.test(name)) return 'it gives access, or names places, programs or servers';
  if (ON_ITS_OWN_WORDS.test(words)) return 'it decides what happens without you, or without a review';
  if (!OWN_ASK_FIELDS.has(field) && MODEL_WORDS.test(`${entry?.label ?? ''} ${field}`)) return 'it picks a model, a role, a depth or instructions';
  return '';
}

/** A schema node from the settings service's schema JSON ({uid, refs}), by its ref or as given. */
const nodeOf = (schema, ref) => {
  const refs = schema?.refs && typeof schema.refs === 'object' ? schema.refs : {};
  if (ref && typeof ref === 'object') return ref;
  return refs[String(ref)] ?? undefined;
};
/** Wrappers that hold the real field (a lazy or transformed schema). */
const unwrap = (schema, node) => {
  let now = node;
  for (let k = 0; k < 8 && now && ['transform', 'lazy'].includes(now.type) && now.inner !== undefined; k += 1) now = nodeOf(schema, now.inner);
  return now;
};

/**
 * The schema of a field, from a namespace's schema JSON (`schema.toJSON()`: {uid, refs}).
 * @param {object} schema - the namespace's schema JSON.
 * @param {string[]} path - the field's path inside it.
 * @returns {object | undefined} the node.
 */
export function schemaAt(schema, path) {
  let now = unwrap(schema, nodeOf(schema, schema?.uid));
  for (const key of path) {
    if (!now) return undefined;
    if (now.type === 'intersect' && Array.isArray(now.list)) {
      now = now.list.map((ref) => unwrap(schema, nodeOf(schema, ref))).find((part) => part?.dict && Object.hasOwn(part.dict, key));
      if (!now) return undefined;
    }
    if (now.type !== 'object' || !now.dict || !Object.hasOwn(now.dict, key)) return undefined;
    now = unwrap(schema, nodeOf(schema, now.dict[key]));
  }
  return now;
}

/** What a field's schema allows: {type: 'boolean' | 'number' | 'choice' | 'string', min, max, step, choices}. */
function allowedOf(schema, node) {
  if (!node) return undefined;
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  if (node.type === 'boolean') return { type: 'boolean' };
  if (['number', 'natural', 'percent'].includes(node.type)) {
    return { type: 'number', min: Number.isFinite(meta.min) ? meta.min : node.type === 'natural' ? 0 : undefined, max: Number.isFinite(meta.max) ? meta.max : undefined, step: node.type === 'natural' ? 1 : Number.isFinite(meta.step) ? meta.step : undefined };
  }
  if (node.type === 'union' && Array.isArray(node.list)) {
    const parts = node.list.map((ref) => unwrap(schema, nodeOf(schema, ref)));
    if (parts.length > 0 && parts.every((part) => part?.type === 'const' && ['string', 'number', 'boolean'].includes(typeof part.value))) return { type: 'choice', choices: parts.map((part) => part.value) };
    return undefined;
  }
  if (node.type === 'string') return { type: 'string' };
  return undefined;
}

/**
 * A number setting's range: Mission's own ranges where its schema has none; otherwise never below 0 when the schema
 * names no lowest value (no ordinary setting takes a negative number).
 */
function withRange(field, allowed) {
  if (!allowed || allowed.type !== 'number') return allowed;
  const own = FIELD_RANGES[field];
  if (own) return { ...allowed, ...own };
  return Number.isFinite(allowed.min) ? allowed : { ...allowed, min: 0 };
}

/** A value read along a path (undefined when missing). */
const valueAt = (value, path) => path.reduce((node, key) => (node && typeof node === 'object' && Object.hasOwn(node, key) ? node[key] : undefined), value);

/**
 * One setting the repair helper may change, read live from the settings service, or why not.
 * @param {object} entry - its settings list entry.
 * @param {object[]} namespaces - the settings service's `describe()`.
 * @returns {{spec?: object, why?: string}}
 */
export function specOf(entry, namespaces) {
  const field = String(entry?.field ?? '');
  const kind = String(entry?.kind ?? '');
  if (!SETTING_KINDS.includes(kind)) return { why: 'it is not a value that can be set' };
  // The namespace is the longest name the settings service knows that the field starts with.
  const known = (Array.isArray(namespaces) ? namespaces : []).filter((row) => row && typeof row.ns === 'string' && field.startsWith(`${row.ns}.`)).sort((a, b) => b.ns.length - a.ns.length)[0];
  if (!known) return { why: 'its add-on is not on' };
  const path = field.slice(known.ns.length + 1).split('.').filter(Boolean);
  if (path.length === 0) return { why: 'it is not a value that can be set' };
  const allowed = withRange(field, allowedOf(known.schema, schemaAt(known.schema, path)));
  if (!allowed) return { why: 'its values cannot be checked here' };
  const fits = { switch: ['boolean'], number: ['number'], slider: ['number'], select: ['choice'], segments: ['choice'], text: ['string'] }[kind] ?? [];
  if (!fits.includes(allowed.type)) return { why: 'its values cannot be checked here' };
  let now = valueAt(known.value, path);
  if (now === undefined) now = schemaAt(known.schema, path)?.meta?.default;
  if (allowed.type === 'string') {
    // A text setting that holds a list or a table (JSON) is no plain text.
    if (typeof now !== 'string' || /^\s*[[{]/.test(now) || now.includes('\n')) return { why: 'it holds more than one plain line' };
  }
  return { spec: { field, ns: known.ns, path, page: String(entry.page ?? ''), pageLabel: line(entry.pageLabel, 60) || 'Settings', label: line(entry.label, 80), kind, allowed, now } };
}

/**
 * The settings the repair helper may name: ordinary settings of add-ons that are on, one control each, with a value that
 * can be checked. Settings with their own ask (Calls at once, the roles' models, the Budget guard) are not in it.
 * @param {object[]} index - the settings list.
 * @param {object[]} namespaces - the settings service's `describe()`.
 * @returns {object[]} specs.
 */
export function settingsCatalog(index, namespaces) {
  const byField = new Map();
  for (const entry of Array.isArray(index) ? index : []) {
    const field = String(entry?.field ?? '');
    if (!field || !SETTING_KINDS.includes(String(entry.kind ?? ''))) continue;
    byField.set(field, [...(byField.get(field) ?? []), entry]);
  }
  const out = [];
  for (const [field, entries] of byField) {
    // One control per setting: a field shown as several controls (three buttons of one choice, say) is not named.
    if (new Set(entries.map((entry) => `${entry.page}|${entry.label}`)).size !== 1) continue;
    const entry = entries[0];
    if (OWN_ASK_FIELDS.has(field) || OWN_ASK_PAGES.has(String(entry.page ?? '')) || refusedSetting(entry)) continue;
    const { spec } = specOf(entry, namespaces);
    if (spec) out.push(spec);
  }
  return out;
}

/**
 * A value in plain words (On / Off, a number, text in quotes). Text is shown whole (a new value is at most TEXT_MAX
 * long), with its quotes and any odd characters written out, so the card shows exactly what is written.
 * @param {unknown} value
 * @param {string} [field] - the setting's id: Mission's "0" words (no time limit, no lap limit).
 */
export function valueWords(value, field = '') {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  if (value === undefined || value === null || value === '') return 'empty';
  if (typeof value === 'number') return value === 0 && FIELD_RANGES[field]?.zero ? `0 (${FIELD_RANGES[field].zero})` : String(value);
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > TEXT_MAX ? `${JSON.stringify(text.slice(0, TEXT_MAX))}…` : JSON.stringify(text);
}

/**
 * The list the repair helper gets: one line per setting, at most SETTINGS_LIST_MAX characters, Mission's own page first.
 * @param {object[]} catalog - from settingsCatalog.
 * @returns {string}
 */
export function catalogText(catalog) {
  const rows = [...(Array.isArray(catalog) ? catalog : [])].sort((a, b) => Number(b.page === 'mission') - Number(a.page === 'mission') || a.pageLabel.localeCompare(b.pageLabel));
  const lines = [];
  let size = 0;
  for (const spec of rows) {
    const a = spec.allowed;
    const may = a.type === 'boolean' ? 'true or false' : a.type === 'number' ? `${a.step === 1 ? 'a whole number' : 'a number'}${Number.isFinite(a.min) ? ` from ${a.min}` : ''}${Number.isFinite(a.max) ? ` up to ${a.max}` : ''}${a.zero ? `, or 0 for ${a.zero}` : ''}` : a.type === 'choice' ? `one of ${a.choices.map((choice) => JSON.stringify(choice)).join(', ')}` : `one line of text`;
    const text = `- ${spec.field} | ${spec.pageLabel} → ${spec.label} | now ${JSON.stringify(spec.now ?? null)} | ${may}`;
    if (size + text.length + 1 > SETTINGS_LIST_MAX) {
      lines.push(`- (${rows.length - lines.length} more not shown)`);
      break;
    }
    lines.push(text);
    size += text.length + 1;
  }
  return lines.join('\n');
}

/**
 * Check a new value against what a setting allows.
 * @param {{type: string, min?: number, max?: number, step?: number, choices?: unknown[]}} allowed
 * @param {unknown} given - the value the repair helper named.
 * @returns {{ok: true, value: unknown} | {ok: false, why: string}}
 */
export function checkValue(allowed, given) {
  if (allowed.type === 'boolean') {
    const text = String(given).trim().toLowerCase();
    if (given === true || ['true', 'on', 'yes'].includes(text)) return { ok: true, value: true };
    if (given === false || ['false', 'off', 'no'].includes(text)) return { ok: true, value: false };
    return { ok: false, why: 'it is on or off' };
  }
  if (allowed.type === 'number') {
    const value = typeof given === 'number' ? given : typeof given === 'string' && given.trim() !== '' ? Number(given) : NaN;
    if (!Number.isFinite(value)) return { ok: false, why: 'it takes a number' };
    if (allowed.zero && value === 0) return { ok: true, value };
    if (Number.isFinite(allowed.min) && value < allowed.min) return { ok: false, why: `it is at least ${allowed.min}` };
    if (Number.isFinite(allowed.max) && value > allowed.max) return { ok: false, why: `it is at most ${allowed.max}` };
    if (allowed.step === 1 && !Number.isInteger(value)) return { ok: false, why: 'it takes a whole number' };
    return { ok: true, value };
  }
  if (allowed.type === 'choice') {
    const found = allowed.choices.find((choice) => choice === given || String(choice) === String(given));
    return found === undefined ? { ok: false, why: `it is one of ${allowed.choices.map((choice) => valueWords(choice)).join(', ')}` } : { ok: true, value: found };
  }
  if (allowed.type === 'string') {
    if (typeof given !== 'string' || /[\r\n]/.test(given) || given.length > TEXT_MAX) return { ok: false, why: `it takes one line of text, at most ${TEXT_MAX} characters` };
    if (HIDDEN_CHARS.test(given)) return { ok: false, why: 'it takes plain text, without hidden or control characters' };
    return { ok: true, value: given.trim() };
  }
  return { ok: false, why: 'its values cannot be checked here' };
}

/**
 * Turn a 'setting' ask of the repair helper into a change, a refusal, or a suggestion.
 * @param {{field?: string, setting?: string, id?: string, to?: unknown, where?: string, change?: string, why?: string}} ask
 * @param {{index: object[], namespaces: object[] | undefined}} where - the settings list, and the settings service's
 *   `describe()` (undefined when it cannot be reached).
 * @returns {{how: 'change', fix: object, what: string} | {how: 'refused', what: string, why: string} | {how: 'same', why: string} | {how: 'suggest', why: string}}
 */
export function resolveSettingAsk(ask, { index = [], namespaces } = {}, { same = false } = {}) {
  const field = line(ask?.field ?? ask?.setting ?? ask?.id, 200);
  if (!field) return { how: 'suggest', why: 'no setting was named by its id' };
  const entries = (Array.isArray(index) ? index : []).filter((entry) => entry?.field === field);
  if (entries.length === 0) return { how: 'suggest', why: 'no setting has that id' };
  // Refused first, whatever else: a setting that gives access is never asked.
  const refused = entries.map(refusedSetting).find(Boolean);
  if (refused) {
    const entry = entries[0];
    return { how: 'refused', what: `${line(entry.pageLabel, 60) || 'Settings'} → ${line(entry.label, 80) || field}`, why: refused };
  }
  if (!Array.isArray(namespaces)) return { how: 'suggest', why: 'the app\'s settings could not be reached' };
  const catalog = settingsCatalog(entries, namespaces);
  const spec = catalog.find((each) => each.field === field);
  if (!spec) return { how: 'suggest', why: 'that setting cannot be changed from a Mission' };
  if (!('to' in (ask ?? {}))) return { how: 'suggest', why: 'no new value was named' };
  const checked = checkValue(spec.allowed, ask.to);
  if (!checked.ok) return { how: 'suggest', why: `the new value does not fit: ${checked.why}` };
  // Lab check of point 19: a change to the value it has already is no change: dropped, never asked nor suggested.
  if (checked.value === spec.now && !same) return { how: 'same', why: `it is ${valueWords(spec.now, field)} already` };
  const fix = { kind: 'setting', field, ns: spec.ns, path: spec.path, page: spec.pageLabel, label: spec.label, from: spec.now ?? null, to: checked.value };
  return { how: 'change', fix, what: changeWords(fix) };
}

/** The approval's words: which page, which setting, from what to what. */
export const changeWords = (fix) => `Change Settings → ${fix.page} → ${fix.label} from ${valueWords(fix.from, fix.field)} to ${valueWords(fix.to, fix.field)}`;
/** The run log's and the report's line after your Allow. */
export const changedWords = (fix) => `Changed after your Allow: ${fix.page} → ${fix.label}: ${valueWords(fix.from, fix.field)} → ${valueWords(fix.to, fix.field)}.`;
/** What to click when a setting change cannot be made. */
export const settingNextStep = (fix) => `Press Deny, or change it yourself in Settings${fix?.page ? ` → ${line(fix.page, 60)}` : ''}${fix?.label ? ` → ${line(fix.label, 80)}` : ''}.`;

/**
 * At Allow: the change is built again from its setting id alone, against the settings list and the app's settings now, so
 * a saved approval that was altered (another namespace, path, page, label or value than its id gives) is never made.
 * The refusal rules are checked again too.
 * @param {object} fix - the saved fix ({kind: 'setting', field, ns, path, page, label, to}).
 * @param {{index: object[], namespaces: object[] | undefined}} where
 * @returns {{fix: object, what: string} | {why: string, where?: {page: string, label: string}}} the change to make (its
 *   `from` is the value now), or why not and where the setting is (as the settings list says).
 */
export function recheckSettingFix(fix, { index = [], namespaces } = {}) {
  if (!Array.isArray(namespaces)) return { why: 'the app\'s settings could not be read' };
  const field = String(fix?.field ?? '');
  // Where it is, as the settings list says (for the next step), never the saved words.
  const listed = (Array.isArray(index) ? index : []).find((entry) => entry?.field === field);
  const where = listed ? { page: line(listed.pageLabel, 60) || 'Settings', label: line(listed.label, 80) || field } : undefined;
  const got = resolveSettingAsk({ field, to: fix?.to }, { index, namespaces }, { same: true });
  if (got.how === 'refused') return { why: `a Mission may not change that setting: ${got.why}`, where };
  if (got.how !== 'change') {
    if (!listed) return { why: 'the setting is not in the settings list any more' };
    if (specOf(listed, namespaces).why === 'its add-on is not on') return { why: `the setting ${where.page} → ${where.label} is not there any more (its add-on may be off)`, where };
    return { why: got.why, where };
  }
  const fresh = got.fix;
  const samePath = Array.isArray(fix.path) && fix.path.length === fresh.path.length && fix.path.every((key, k) => String(key) === fresh.path[k]);
  if (fix.kind !== 'setting' || fix.ns !== fresh.ns || !samePath || fix.page !== fresh.page || fix.label !== fresh.label || !Object.is(fix.to, fresh.to)) {
    return { why: 'the saved change does not match the setting it names, so it may have been altered', where };
  }
  return { fix: fresh, what: changeWords(fresh) };
}

/**
 * Whether a setting change asked earlier can still be made now ('' when it can; the plain reason otherwise).
 * @param {object} fix - {kind: 'setting', ns, path, field, page, label, to}.
 * @param {object[] | undefined} namespaces - the settings service's `describe()` now.
 * @returns {string}
 */
export function settingGone(fix, namespaces) {
  if (!Array.isArray(namespaces)) return 'the app\'s settings could not be reached';
  const known = namespaces.find((row) => row?.ns === fix?.ns);
  const node = known ? schemaAt(known.schema, Array.isArray(fix.path) ? fix.path.map(String) : []) : undefined;
  if (!node) return `the setting ${fix?.page ?? ''} → ${fix?.label ?? fix?.field ?? ''} is not there any more (its add-on may be off)`;
  const allowed = allowedOf(known.schema, node);
  if (!allowed || !checkValue(allowed, fix.to).ok) return `the setting ${fix.page} → ${fix.label} does not take ${valueWords(fix.to)} any more`;
  return '';
}

/** @returns {unknown} a setting's value now (undefined when it cannot be read). */
export function settingNow(fix, namespaces) {
  const known = (Array.isArray(namespaces) ? namespaces : []).find((row) => row?.ns === fix?.ns);
  if (!known) return undefined;
  const now = valueAt(known.value, fix.path ?? []);
  return now === undefined ? schemaAt(known.schema, fix.path ?? [])?.meta?.default : now;
}
