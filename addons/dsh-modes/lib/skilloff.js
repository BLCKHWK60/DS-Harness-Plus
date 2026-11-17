/**
 * Skills switched off per tab (Tuner Plus's step 14). The app gives a conversation every skill or none; this
 * leaves out, in one tab, the skills switched off there:
 *   - the skill list the app hands a conversation (a `skill-catalog` message) loses those lines and entries;
 *   - a list the model already has, unchanged after that, is not sent again (the app remembers the list the
 *     model last saw by the entries of the message it stored; see `lastSeenCatalog`);
 *   - a `skill` call for a switched-off skill is refused with a plain sentence (in index.js).
 * The owner's own typed /name still works: he asked for that skill himself. Isolated conversations (Recon)
 * get no skill list at all, as before. Nothing switched off: everything exactly as before.
 *
 * The list's form is the app's own (dsh-tool-skill 0.2.2-rc.2: `renderCatalogMessage`,
 * `renderCatalogUpdate`, `renderCatalogEntries`, `escapeText`). A message in any other form is left whole.
 */

import { randomUUID } from 'node:crypto';

/** The kind of the app's skill-list message. */
export const SKILL_CATALOG = 'skill-catalog';
/** At most this many skills switched off in one tab, and this long a name. */
export const OFF_MAX = 500;
const NAME = /^[A-Za-z0-9][\w.:-]{0,127}$/;

/** The app's escaping of a description in the list (`escapeText` of dsh-skill). */
export const escapeCatalogText = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
/** One line of the list, as the app writes it (`renderCatalogEntries`). */
export const catalogLine = (entry) => `- \`${entry.name}\`: ${escapeCatalogText(entry.description)}`;

/**
 * The switched-off skills of one tab, from the setting `skillsOff` (`{ tabId: [names] }`).
 * @returns {Set<string>}
 */
export function offIn(table, tabId) {
  const list = table && typeof table === 'object' && !Array.isArray(table) ? table[String(tabId ?? '')] : undefined;
  return new Set((Array.isArray(list) ? list : []).filter((name) => typeof name === 'string' && NAME.test(name)).slice(0, OFF_MAX));
}

/**
 * The setting with one tab's list replaced (empty: the tab's entry goes).
 * @returns {Record<string, string[]>}
 */
export function withOff(table, tabId, names) {
  const next = table && typeof table === 'object' && !Array.isArray(table) ? { ...table } : {};
  const clean = [...new Set((Array.isArray(names) ? names : []).filter((name) => typeof name === 'string' && NAME.test(name)))].sort().slice(0, OFF_MAX);
  if (clean.length === 0) delete next[tabId];
  else next[tabId] = clean;
  return next;
}

/** A message's entries, as the app reads them (`readCatalogEntries`), or undefined. */
export function entriesOf(source) {
  const entries = source?.entries;
  if (!Array.isArray(entries)) return undefined;
  const out = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    if (typeof entry.name !== 'string' || entry.name === '' || typeof entry.description !== 'string') return undefined;
    out.push({ name: entry.name, description: entry.description });
  }
  return out;
}

/** Two lists the same, as the app's digest compares them (entries in order, and completeness). */
export function sameCatalog(a, b) {
  if (!a || !b || a.incomplete !== b.incomplete || a.entries.length !== b.entries.length) return false;
  return a.entries.every((entry, index) => entry.name === b.entries[index].name && entry.description === b.entries[index].description);
}

/**
 * One skill-list message without the switched-off skills.
 * @param {object} message - a message whose source kind is `skill-catalog`.
 * @param {Set<string>} off - the tab's switched-off skills.
 * @returns {{message: object|null, changed: boolean, unknown?: boolean}} `message` null: none is left, drop it.
 */
export function trimCatalog(message, off) {
  const source = message?.source;
  const entries = entriesOf(source);
  if (!entries) return { message, changed: false, unknown: true };
  const kept = entries.filter((entry) => !off.has(entry.name));
  if (kept.length === entries.length) return { message, changed: false };
  const content = Array.isArray(message.content) ? message.content : [];
  const at = content.findIndex((block) => block?.type === 'text' && typeof block.text === 'string');
  const text = at >= 0 ? content[at].text : '';
  // The block exactly as the app writes it; anything else is left whole.
  const block = `<available_skills>\n${entries.map(catalogLine).join('\n')}\n</available_skills>`;
  const where = text.indexOf(block);
  if (where < 0 || text.indexOf(block, where + 1) >= 0) return { message, changed: false, unknown: true };
  if (kept.length === 0) return { message: null, changed: true };
  const nextText = `${text.slice(0, where)}<available_skills>\n${kept.map(catalogLine).join('\n')}\n</available_skills>${text.slice(where + block.length)}`;
  return {
    message: { ...message, content: content.map((one, index) => (index === at ? { ...one, text: nextText } : one)), source: { ...source, entries: kept } },
    changed: true,
  };
}

/**
 * The list the model last saw: the newest stored skill-list message still in the conversation's view
 * (the app's `catalogHistory`). Undefined when there is none or the history cannot be read.
 * @param {object} session - the agent's session.
 */
export function lastSeenCatalog(session) {
  try {
    const visible = new Set(session.surface.nodes);
    for (let index = session.seq - 1; index >= 0; index -= 1) {
      const event = session.eventAt(index);
      if (!event) return undefined;
      if (event.type !== 'user/message' || event.data?.source?.kind !== SKILL_CATALOG) continue;
      const entries = entriesOf(event.data.source);
      if (!entries) continue;
      if (visible.has(event.seq)) return { entries, incomplete: event.data.source.incomplete === true };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** The app's note on an incomplete list (`incompleteCatalogNotice`). */
const INCOMPLETE_NOTICE = 'Some skills could not be checked. Only confirmed skills are listed; a lower-priority definition of the same name may be selected when a preferred source is unavailable. Discovery will be retried on the next request.';

/** A frozen copy, as the app freezes its messages. */
const frozen = (value) => {
  if (value && typeof value === 'object') {
    for (const one of Object.values(value)) frozen(one);
    Object.freeze(value);
  }
  return value;
};

/**
 * A replacement list in the app's own words (`renderCatalogUpdate`), made by Modes when the model still sees
 * skills switched off in its tab and the app has no reason to send a list (its list did not change).
 * @param {{name: string, description: string}[]} entries - the list the model should see now.
 * @param {boolean} [incomplete]
 */
export function catalogUpdate(entries, incomplete = false) {
  const availability = entries.length === 0
    ? [
      incomplete
        ? 'No skills could be confirmed in this discovery attempt. Do not use names from earlier skill catalogs.'
        : 'No skills are currently available through the `skill` tool. Do not use names from earlier skill catalogs.',
      'A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool for it.',
    ]
    : [
      'Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the `skill` tool with the exact name before acting.',
      'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
    ];
  const text = [
    '<system-reminder>',
    incomplete
      ? 'Skill discovery is incomplete. This catalog of currently available skills replaces every earlier available-skills list in this session:'
      : 'The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:',
    '',
    '<available_skills>',
    ...entries.map(catalogLine),
    '</available_skills>',
    '',
    ...(incomplete ? [INCOMPLETE_NOTICE, ''] : []),
    ...availability,
    '</system-reminder>',
  ].join('\n');
  return frozen({
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: SKILL_CATALOG, form: 'catalog', update: true, entries: entries.map((one) => ({ name: one.name, description: one.description })), ...(incomplete ? { incomplete: true } : {}) },
    id: randomUUID(),
  });
}

/**
 * A step's messages with the tab's switched-off skills left out of the skill list. A list unchanged from the
 * one the model already sees is dropped, so the app's re-sending (it compares with the full list) costs nothing.
 * @param {object[]} messages - the step's messages.
 * @param {Set<string>} off - the tab's switched-off skills.
 * @param {() => ({entries: object[], incomplete: boolean}|undefined)} seen - the list the model sees now.
 * @returns {{messages: object[], changed: boolean, unknown: boolean}}
 */
export function withoutOffSkills(messages, off, seen) {
  if (!Array.isArray(messages) || off.size === 0) return { messages, changed: false, unknown: false };
  let changed = false;
  let unknown = false;
  const out = [];
  for (const message of messages) {
    if (message?.source?.kind !== SKILL_CATALOG) {
      out.push(message);
      continue;
    }
    const trimmed = trimCatalog(message, off);
    if (trimmed.unknown) unknown = true;
    if (!trimmed.changed) {
      out.push(message);
      continue;
    }
    changed = true;
    const before = seen();
    if (!trimmed.message) {
      // None left: the model that already saw a list is told there are none now (else it keeps the old one).
      const incomplete = message.source.incomplete === true;
      if (before && !sameCatalog(before, { entries: [], incomplete })) out.push(catalogUpdate([], incomplete));
      continue;
    }
    if (before && sameCatalog(before, { entries: trimmed.message.source.entries, incomplete: trimmed.message.source.incomplete === true })) continue;
    out.push(trimmed.message);
  }
  // No list this step, but the list the model sees still has skills switched off here (switched off since,
  // or the conversation came from another tab): a replacement without them, once.
  if (!messages.some((message) => message?.source?.kind === SKILL_CATALOG)) {
    const before = seen();
    if (before && before.entries.some((entry) => off.has(entry.name))) {
      return { messages: [...messages, catalogUpdate(before.entries.filter((entry) => !off.has(entry.name)), before.incomplete)], changed: true, unknown };
    }
  }
  return { messages: changed ? out : messages, changed, unknown };
}
