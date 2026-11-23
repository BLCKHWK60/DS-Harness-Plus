/**
 * The shelf (plan step T6): adapters, tuned prompts and instruction sets, each with its base model, the sets
 * and rows it was built from, its exam results, and where it is in use.
 *   - Switched on, never baked in: the base model's files are never changed; every entry is switched off in
 *     one action.
 *   - Nothing is switched on without the exam and the owner's yes (the page's own action, never a tool).
 *   - Private by default: an entry is built for the owner and his harness; sharing is his own act.
 *   - Serving: the owner's model server may not load adapters; an adapter is served either as a fused copy
 *     (a new model folder, which any MLX server serves as one more model) or by mlx-lm's own server. The
 *     owner names the model address under which it appears in the app; a team role then uses that.
 *   - Rebuild all: when the base model changes, every adapter is rebuilt from its sets and examined again.
 */

export const KINDS = ['adapter', 'specialist', 'prompt', 'instructions'];
export const STATES = ['candidate', 'promoted', 'on', 'off', 'failed'];

const clip = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** A new shelf entry for a candidate. */
export function newEntry({ id, kind = 'adapter', name, base, sets = [], rows = 0, goal = '', at = Date.now(), files = '', trainer = {} }) {
  if (!KINDS.includes(kind)) throw new Error('not a kind of shelf entry');
  return {
    id: clip(id, 40),
    kind,
    name: clip(name, 120),
    goal: clip(goal, 40),
    base: { model: clip(base?.model, 200), path: clip(base?.path, 1000) },
    sets: sets.map((set) => clip(set, 60)).slice(0, 20),
    rows: Number(rows) || 0,
    files: clip(files, 1000),
    trainer: { iters: Number(trainer.iters) || 0, seconds: Number(trainer.seconds) || 0, loss: Number.isFinite(trainer.loss) ? trainer.loss : null },
    exam: null,
    state: 'candidate',
    private: true,
    roles: [],
    serve: { way: '', route: null, path: '' },
    built: at,
    history: [{ at, what: 'built' }],
  };
}

const find = (shelf, id) => {
  const entry = (shelf.entries ?? []).find((one) => one.id === id);
  if (!entry) throw new Error('There is no such entry on the shelf.');
  return entry;
};

/** Record the exam of an entry (before and after, canaries, the decision). */
export function recordExam(shelf, id, exam, at = Date.now()) {
  const entry = find(shelf, id);
  entry.exam = { ...exam, at };
  entry.state = exam.decision?.ok ? 'candidate' : 'failed';
  entry.history.push({ at, what: exam.decision?.ok ? 'passed its exam' : `did not pass its exam: ${clip(exam.decision?.why, 200)}` });
  return entry;
}

/**
 * Promote an entry: only after its exam passed, and only from the owner's own action.
 * @returns {object} the entry.
 */
export function promote(shelf, id, { ownerSaidYes, at = Date.now() }) {
  const entry = find(shelf, id);
  if (ownerSaidYes !== true) throw new Error('Promotion needs your yes on the Tuner Plus page.');
  if (!entry.exam?.decision?.ok) throw new Error('This entry has not passed its exam, so it cannot be promoted.');
  entry.state = 'promoted';
  entry.history.push({ at, what: 'promoted by the owner' });
  return entry;
}

/** Switch an entry on (only a promoted one) or off (always, in one action). */
export function setOn(shelf, id, on, at = Date.now()) {
  const entry = find(shelf, id);
  if (on) {
    if (!['promoted', 'off'].includes(entry.state) || !entry.exam?.decision?.ok) throw new Error('Only an entry that passed its exam and was promoted can be switched on.');
    entry.state = 'on';
  } else entry.state = entry.state === 'candidate' || entry.state === 'failed' ? entry.state : 'off';
  entry.history.push({ at, what: on ? 'switched on' : 'switched off' });
  return entry;
}

/**
 * How an adapter is served, set by the owner: a fused copy or mlx-lm's own server, and the model address
 * under which it appears in the app (a provider and a model id he added in Settings → Models).
 */
export function setServing(shelf, id, { way, provider, model, path = '' }, at = Date.now()) {
  const entry = find(shelf, id);
  if (!['fused', 'server', ''].includes(way)) throw new Error('Serve it as a fused copy or with mlx-lm\'s own server.');
  const route = provider && model ? { provider: clip(provider, 120), model: clip(model, 200) } : null;
  entry.serve = { way, route, path: clip(path, 1000) };
  entry.history.push({ at, what: `served: ${way || 'not served'}${route ? ` as ${route.provider}/${route.model}` : ''}` });
  return entry;
}

/** Which team roles wear an entry (a team in Model tiers names it for a role). */
export function setRoles(shelf, id, roles, at = Date.now()) {
  const entry = find(shelf, id);
  entry.roles = (Array.isArray(roles) ? roles : []).filter((role) => role && typeof role.tier === 'string' && ['lead', 'helper', 'checker', 'judge'].includes(role.role)).slice(0, 20).map((role) => ({ tier: clip(role.tier, 60), role: role.role }));
  entry.history.push({ at, what: `worn by ${entry.roles.length} team role${entry.roles.length === 1 ? '' : 's'}` });
  return entry;
}

/**
 * The model address a team role uses for an entry: only while it is switched on and served (for mlx-lm's
 * own server: only while that server really runs; after a restart it does not). Otherwise undefined, and
 * the role keeps its own model, as before.
 * @param {{running?: (id: string) => boolean}} [live] - whether this entry's own server runs now.
 */
export function routeOf(shelf, id, { running } = {}) {
  const entry = (shelf?.entries ?? []).find((one) => one.id === id);
  if (!entry || entry.state !== 'on' || !entry.serve?.route) return undefined;
  if (entry.serve.way === 'server' && !(typeof running === 'function' && running(entry.id) === true)) return undefined;
  return { ...entry.serve.route };
}

/**
 * Old entries to let go: candidates and failed ones beyond the newest `keep`, or older than `days`. Never an
 * entry the owner promoted, switched on or off.
 * @returns {object[]} the entries to remove (their files go too).
 */
export function staleEntries(shelf, { keep = 10, days = 30, at = Date.now() } = {}) {
  const loose = (shelf?.entries ?? []).filter((entry) => entry.state === 'candidate' || entry.state === 'failed').sort((a, b) => (b.built ?? 0) - (a.built ?? 0));
  return loose.filter((entry, index) => index >= keep || at - (entry.built ?? 0) > days * 86_400_000);
}

/** The entries that must be rebuilt for a new base model (every adapter and specialist, from its sets). */
export function rebuildPlan(shelf, newBase) {
  return (shelf.entries ?? []).filter((entry) => (entry.kind === 'adapter' || entry.kind === 'specialist') && entry.sets.length > 0 && entry.base.model !== newBase).map((entry) => ({ from: entry.id, name: entry.name, goal: entry.goal, sets: entry.sets, kind: entry.kind }));
}

/** Mark the harness adapters as due for a rebuild (a plugin was added or changed). */
export function markDue(shelf, why, at = Date.now()) {
  let marked = 0;
  for (const entry of shelf.entries ?? []) {
    if (entry.goal === 'harness' && entry.state !== 'failed') {
      entry.due = { at, why: clip(why, 200) };
      marked += 1;
    }
  }
  return marked;
}
