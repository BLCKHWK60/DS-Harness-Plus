/**
 * Lens: how an answer is worded (the owner's plan, "Lens: the kind of answer"). Step 24 writes the
 * texts only; nothing sends them yet (step 26 puts the picked one in a conversation's instructions).
 *
 * Each text is the plan's wording, plus only the lines the owner's answers of 15 November call for:
 *   - the Lens wins over general style preferences on wording, but the tab's rules, labels and order
 *     of sections come first, and a required warning is not softening (every Lens);
 *   - Blunt uses a tab's own claim labels where the tab has them;
 *   - the fact-heavy Lenses (Blunt, Scientific, Journalistic, Data only) never switch the web on:
 *     what could not be checked is an inference or a guess, and a figure from memory is never a fact.
 * Default adds nothing.
 */

/** The Lenses in the order the owner listed them. */
export const LENS_IDS = ['default', 'blunt', 'scientific', 'journalistic', 'data-only', 'skeptic', 'encouraging'];

/** Their names, as the owner gave them. */
export const LENS_NAMES = {
  default: 'Default',
  blunt: 'Blunt',
  scientific: 'Scientific',
  journalistic: 'Journalistic',
  'data-only': 'Data only',
  skeptic: 'Skeptic',
  encouraging: 'Encouraging',
};

/** What each Lens is for (the plan's "For" column). */
export const LENS_FOR = {
  default: 'Everyday use',
  blunt: 'The plain truth, no cushioning',
  scientific: 'Health, technology, anything with studies',
  journalistic: 'Events, people, organisations',
  'data-only': 'Figures you will judge yourself',
  skeptic: 'Testing a plan, a claim or a source',
  encouraging: 'When you want momentum',
};

/** Every Lens: it wins on wording, never over the tab's rules (owner's answers: "Lens wins on wording", "Tab rules first"). */
export const LENS_GUARD = "This Lens decides how the answer is worded, over general style preferences. The mode's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.";

/** The fact-heavy Lenses: the web is never switched on for them (owner's answer: "Never change Web"). */
export const LENS_UNCHECKED = 'Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact.';

/** What the model is told for each Lens ('' for Default). */
export const LENS_PROMPTS = {
  default: '',
  blunt: [
    'Lens: Blunt. The most direct Lens. Answer first, at whatever length the question needs. No softening, euphemism, praise, reassurance or moral commentary, and no concern for whose feelings a fact hurts. Give the most likely explanation, not the most charitable one.',
    // Owner's answer on labels: the tab's own labels where it has them.
    "Mark each key claim as fact, inference or guess; where this mode already labels claims its own way, use its labels instead.",
    LENS_UNCHECKED,
    LENS_GUARD,
  ].join(' '),
  scientific: [
    'Lens: Scientific. Rank the evidence: reviews, trials, single studies, opinion. Give sample sizes, effect sizes and whether it was replicated. Say what would change the conclusion.',
    LENS_UNCHECKED,
    LENS_GUARD,
  ].join(' '),
  journalistic: [
    'Lens: Journalistic. Who, what, when, where, and how we know. Every claim attributed. Confirmed kept apart from alleged. Say what is still unknown.',
    LENS_UNCHECKED,
    LENS_GUARD,
  ].join(' '),
  'data-only': [
    'Lens: Data only. Numbers, tables and charts with sources. No interpretation beyond what the figures show. "No data" said plainly.',
    LENS_UNCHECKED,
    LENS_GUARD,
  ].join(' '),
  skeptic: [
    'Lens: Skeptic. Argue the strongest case against it. List what would have to be true, and what breaks first.',
    LENS_GUARD,
  ].join(' '),
  encouraging: [
    'Lens: Encouraging. The same facts, nothing hidden. Lead with what works and the next step.',
    LENS_GUARD,
  ].join(' '),
};

/** The longest a Lens text may be, so small local models are not swamped by it. */
export const LENS_MAX = 900;

/** @returns {string} a Lens id, checked ('default' when unknown). */
export function lensId(value) {
  const id = String(value ?? '').trim().toLowerCase();
  return LENS_IDS.includes(id) ? id : 'default';
}

/** @returns {string} what the model is told for a Lens ('' for Default or an unknown one). */
export function lensText(value) {
  return LENS_PROMPTS[lensId(value)];
}

// ---- your own Lenses (Lens part, step 30) -------------------------------------------------------

/** At most this many of your own, names up to this long, texts up to this long (the plan's limits). */
export const OWN_MAX = 40;
export const OWN_NAME_MAX = 40;
export const OWN_TEXT_MAX = 4000;

/** @returns {string} the id of your own Lens with this name: `own-` and its letters and digits. */
export function ownSlug(name) {
  const slug = String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `own-${slug || 'lens'}`;
}

/**
 * @param {{name: string, text: string}} entry - one of your own Lenses.
 * @param {Array<{name: string}>} [others] - the rest of your list.
 * @returns {string} what is wrong with it, in plain words ('' when it can be saved).
 */
export function ownLensProblem(entry, others = []) {
  const name = String(entry?.name ?? '').trim();
  const text = String(entry?.text ?? '').trim();
  if (!name) return 'needs a name';
  if (name.length > OWN_NAME_MAX) return `has a name longer than ${OWN_NAME_MAX} characters`;
  if (LENS_IDS.some((id) => LENS_NAMES[id].toLowerCase() === name.toLowerCase())) return 'has the name of a Lens that comes with Plus';
  if (!text) return 'needs a text';
  if (text.length > OWN_TEXT_MAX) return `has a text longer than ${OWN_TEXT_MAX} characters`;
  if (others.some((other) => ownSlug(other?.name) === ownSlug(name))) return 'has the same name as another of your Lenses';
  return '';
}

/**
 * @param {unknown} value - the stored list (`ownLenses`): an array, or the same as JSON text.
 * @returns {Array<{id: string, name: string, text: string}>} the ones that can be used, at most OWN_MAX.
 */
export function ownLensesOf(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (out.length >= OWN_MAX) break;
    if (ownLensProblem(entry, out)) continue;
    const name = String(entry.name).trim();
    out.push({ id: ownSlug(name), name, text: String(entry.text).trim() });
  }
  return out;
}

/** @returns {string} a Lens id among the shipped ones and your own ('default' when it is neither, e.g. removed). */
export function lensIdIn(value, own = []) {
  const id = String(value ?? '').trim().toLowerCase();
  if (LENS_IDS.includes(id)) return id;
  return own.some((entry) => entry.id === id) ? id : 'default';
}

/** @returns {string} what the model is told for a Lens, your own included: its name, your text, and the same guard as every Lens. */
export function lensTextIn(value, own = []) {
  const id = lensIdIn(value, own);
  const mine = own.find((entry) => entry.id === id);
  return mine ? `Lens: ${mine.name}. ${mine.text} ${LENS_GUARD}` : LENS_PROMPTS[id];
}
