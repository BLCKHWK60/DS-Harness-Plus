/**
 * The policy: the text the loop may change. It has two parts.
 *  - sections: a few named blocks of standing instructions;
 *  - playbook: short numbered lessons, each for one family of tasks (or all).
 *
 * The loop never rewrites the whole thing. A change is one bounded edit to one
 * section or one lesson, so every gain can be traced to one change and undone.
 */

export const LIMITS = Object.freeze({
  entryChars: 600,
  sectionChars: 2000,
  sections: 6,
  entries: 60,
});

export const EDIT_OPS = ['add_entry', 'replace_entry', 'retire_entry', 'replace_section'];

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** @returns {object} the starting policy: nothing added to the model's instructions. */
export function emptyPolicy() {
  return { version: 'v0001', parent: null, createdAt: new Date(0).toISOString(), note: 'Starting point: nothing added.', sections: [], playbook: [] };
}

/**
 * Normalize a stored policy; unusable parts are dropped.
 * @param {unknown} raw - stored policy.
 * @returns {object} policy.
 */
export function normalizePolicy(raw) {
  const base = emptyPolicy();
  if (!raw || typeof raw !== 'object') return base;
  const sections = [];
  for (const item of Array.isArray(raw.sections) ? raw.sections : []) {
    const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
    const text = typeof item?.text === 'string' ? item.text.trim().slice(0, LIMITS.sectionChars) : '';
    if (!ID.test(id) || !text || sections.some((section) => section.id === id) || sections.length >= LIMITS.sections) continue;
    sections.push({ id, title: typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 60) : id, text });
  }
  const playbook = [];
  for (const item of Array.isArray(raw.playbook) ? raw.playbook : []) {
    const id = typeof item?.id === 'string' ? item.id.trim().toLowerCase() : '';
    const text = typeof item?.text === 'string' ? item.text.trim().slice(0, LIMITS.entryChars) : '';
    if (!ID.test(id) || !text || playbook.some((entry) => entry.id === id) || playbook.length >= LIMITS.entries) continue;
    playbook.push({
      id,
      family: familyOf(item.family),
      text,
      author: ['reviewer', 'you'].includes(item.author) ? item.author : 'reviewer',
      status: item.status === 'retired' ? 'retired' : 'active',
    });
  }
  return {
    version: typeof raw.version === 'string' && /^v\d{4}$/.test(raw.version) ? raw.version : base.version,
    parent: typeof raw.parent === 'string' && /^v\d{4}$/.test(raw.parent) ? raw.parent : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : base.createdAt,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 300) : '',
    sections,
    playbook,
  };
}

/**
 * A family name: lower case, or `all` for lessons that apply everywhere.
 * @param {unknown} value - stored family.
 * @returns {string} family.
 */
export function familyOf(value) {
  const family = typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) : '';
  return family || 'all';
}

/**
 * The text a policy adds to the model's instructions for one family.
 * The order is fixed (sections, then lessons by id), so the text stays the same
 * between runs and the model server can keep it cached.
 * @param {object} policy - normalized policy.
 * @param {string | string[]} [family] - task family, or several; lessons for `all` always apply.
 *   Pass `'*'` for every lesson, as the page does to show the whole playbook.
 * @returns {string} text, or an empty string when the policy adds nothing.
 */
export function renderPolicy(policy, family = 'all') {
  const parts = [];
  for (const section of policy.sections) parts.push(`### ${section.title}\n${section.text}`);
  const wanted = family === '*' ? null : new Set(['all', ...[family].flat().map(familyOf)]);
  const lessons = policy.playbook
    .filter((entry) => entry.status === 'active' && (wanted === null || wanted.has(entry.family)))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (lessons.length > 0) {
    parts.push(`### Lessons from earlier work\n${lessons.map((entry) => `- ${entry.text}`).join('\n')}`);
  }
  return parts.length > 0 ? `## Working notes\n${parts.join('\n\n')}` : '';
}

/**
 * Check one proposed edit against the policy it would change.
 * @param {unknown} raw - proposed edit.
 * @param {object} policy - current policy.
 * @returns {{edit?: object, error?: string}} the cleaned edit, or why it is refused.
 */
export function validateEdit(raw, policy) {
  if (!raw || typeof raw !== 'object') return { error: 'Not an edit.' };
  const op = EDIT_OPS.includes(raw.op) ? raw.op : undefined;
  if (!op) return { error: `Unknown kind of edit. Allowed: ${EDIT_OPS.join(', ')}.` };
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim().slice(0, 400) : '';
  const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
  const predictedFixes = Array.isArray(raw.predictedFixes)
    ? raw.predictedFixes.filter((item) => typeof item === 'string').slice(0, 20)
    : [];
  const base = { op, rationale, predictedFixes };

  if (op === 'add_entry') {
    if (!text) return { error: 'A new lesson needs text.' };
    if (text.length > LIMITS.entryChars) return { error: `A lesson may be at most ${LIMITS.entryChars} characters.` };
    if (policy.playbook.filter((entry) => entry.status === 'active').length >= LIMITS.entries) return { error: 'The playbook is full.' };
    if (policy.playbook.some((entry) => entry.status === 'active' && similar(entry.text, text))) {
      return { error: 'The playbook already has a lesson that says almost the same.' };
    }
    return { edit: { ...base, family: familyOf(raw.family), text } };
  }
  if (op === 'replace_entry' || op === 'retire_entry') {
    const entry = policy.playbook.find((item) => item.id === id && item.status === 'active');
    if (!entry) return { error: `There is no active lesson with the id "${id}".` };
    if (op === 'retire_entry') return { edit: { ...base, id } };
    if (!text) return { error: 'A replaced lesson needs text.' };
    if (text.length > LIMITS.entryChars) return { error: `A lesson may be at most ${LIMITS.entryChars} characters.` };
    if (similar(entry.text, text)) return { error: 'The new text says almost the same as the old one.' };
    return { edit: { ...base, id, text } };
  }
  // replace_section: adds the section when the id is new.
  if (!ID.test(id)) return { error: 'A section needs a short id of lower-case letters, digits and dashes.' };
  if (!text) return { error: 'A section needs text.' };
  if (text.length > LIMITS.sectionChars) return { error: `A section may be at most ${LIMITS.sectionChars} characters.` };
  const existing = policy.sections.find((section) => section.id === id);
  if (!existing && policy.sections.length >= LIMITS.sections) return { error: 'There are already as many sections as allowed.' };
  if (existing && similar(existing.text, text)) return { error: 'The new text says almost the same as the old one.' };
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 60) : existing?.title ?? id;
  return { edit: { ...base, id, title, text } };
}

/**
 * Apply one validated edit and return the next version. The input is not changed.
 * @param {object} policy - current policy.
 * @param {object} edit - an edit from `validateEdit`.
 * @param {string} version - version id of the result.
 * @returns {object} the new policy.
 */
export function applyEdit(policy, edit, version) {
  const next = {
    ...policy,
    version,
    parent: policy.version,
    createdAt: new Date().toISOString(),
    note: describeEdit(edit, policy),
    sections: policy.sections.map((section) => ({ ...section })),
    playbook: policy.playbook.map((entry) => ({ ...entry })),
  };
  if (edit.op === 'add_entry') {
    next.playbook.push({ id: nextEntryId(policy), family: edit.family, text: edit.text, author: edit.author ?? 'reviewer', status: 'active' });
  } else if (edit.op === 'replace_entry') {
    next.playbook.find((entry) => entry.id === edit.id).text = edit.text;
  } else if (edit.op === 'retire_entry') {
    next.playbook.find((entry) => entry.id === edit.id).status = 'retired';
  } else {
    const section = next.sections.find((item) => item.id === edit.id);
    if (section) Object.assign(section, { title: edit.title, text: edit.text });
    else next.sections.push({ id: edit.id, title: edit.title, text: edit.text });
  }
  return next;
}

/**
 * One line that says what an edit does, in plain words.
 * @param {object} edit - validated edit.
 * @param {object} policy - the policy it applies to.
 * @returns {string} description.
 */
export function describeEdit(edit, policy) {
  if (edit.op === 'add_entry') return `New lesson for ${edit.family === 'all' ? 'all tasks' : `"${edit.family}" tasks`}: ${edit.text}`;
  if (edit.op === 'replace_entry') return `Lesson ${edit.id} reworded: ${edit.text}`;
  if (edit.op === 'retire_entry') {
    return `Lesson ${edit.id} removed: ${policy.playbook.find((entry) => entry.id === edit.id)?.text ?? ''}`;
  }
  return `${policy.sections.some((section) => section.id === edit.id) ? 'Section changed' : 'New section'} "${edit.title}": ${edit.text}`;
}

/**
 * Refuse an edit that carries a test's answer, so a change cannot "pass" by memorising.
 * @param {object} edit - validated edit.
 * @param {Array<{id: string, checks: Array<{type: string, value: string}>}>} tasks - every task, of every split.
 * @returns {string | undefined} why the edit is refused, or undefined when clean.
 */
export function leakOf(edit, tasks) {
  const text = `${edit.text ?? ''} ${edit.title ?? ''}`.toLowerCase();
  if (!text.trim()) return undefined;
  for (const task of tasks) {
    if (task.id && text.includes(String(task.id).toLowerCase())) return `It names the test task "${task.id}".`;
    for (const check of task.checks ?? []) {
      if (!['contains', 'equals', 'fileContains'].includes(check.type)) continue;
      const expected = (check.type === 'fileContains' ? check.value.split('::').slice(1).join('::') : check.value).trim().toLowerCase();
      if (expected.length >= 8 && text.includes(expected)) return 'It contains the expected answer of a test task.';
    }
  }
  return undefined;
}

/** @param {object} policy - policy. @returns {string} the next free lesson id, e.g. `l007`. */
export function nextEntryId(policy) {
  const used = policy.playbook.map((entry) => Number(/^l(\d+)$/.exec(entry.id)?.[1] ?? 0));
  return `l${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
}

/** @param {string} version - e.g. `v0007`. @returns {string} the following version id. */
export function nextVersion(version) {
  return `v${String(Number(String(version).slice(1)) + 1).padStart(4, '0')}`;
}

/**
 * Whether two texts say almost the same, by shared words.
 * @param {string} a - text.
 * @param {string} b - text.
 * @returns {boolean} true when at least 85% of the words are shared.
 */
export function similar(a, b) {
  const words = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size) >= 0.85;
}
