/**
 * Skill architect (the owner's plan, Skill architect part, steps 70 to 87): learns from your past
 * conversations where you corrected the assistant, and proposes what to change. It installs nothing by
 * itself: every proposal waits for your yes on Settings → Learned skills.
 *
 *   - Learned skills: plain text in this add-on's own folder, served to the app's skill list by a provider
 *     of its own (never in any skill folder of yours, a project's, Plus's or the app's). Each has a reach:
 *     every tab, one tab, or one project. Recon never gets one.
 *   - The reader lists the conversations it would read and why, without any model. It reads nothing when
 *     the Modes add-on cannot say which conversations are isolated (Recon), and leaves out helpers, the
 *     trash, Self-improve's own runs and conversations you marked "never learn from this".
 *   - Learning asks a reading model of your choice. On this Mac or your own network it needs no tick; an
 *     internet model needs your tick, and you see what would be sent first.
 *   - Accepted: a skill (with versions and Put back), a fact (into Memory), a project rule (into that
 *     project's instructions, as a version). A model habit or a tab lesson is shown for you to add as your
 *     own lesson in Self-improve (filing it there by itself is not built yet).
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import z from '@deepseek-ai/schemastery';
import { openLibrary, readReach } from './lib/library.js';
import { CANDIDATES_MAX, isPrivate, learnPrompt, pickConversations, proposalsOf, signalsOf, whereOf } from './lib/learn.js';
import { openProposals, visibleTo } from './lib/proposals.js';

/**
 * The marker lines of a Recon export (dsh-recon/lib/door.js: EXPORT_LINE_RE, and each source's
 * "origin: Recon · lane:" line), kept here too so the rule holds with Recon switched off.
 */
export const EXPORT_MARKS = [/^\[Recon export [^\]\n]{1,80}\]/m, /origin: Recon · lane:/];

export const name = 'skill-architect';
export const DATA_PATH = '/dsh-skill-architect/data';
/** The provider's name in the app's skill list. Learned skills rank after every other kind of skill. */
export const PROVIDER = 'learned-skills';
const RANK = 900;

export const Config = z.object({
  /** Off: learned skills are not offered and nothing is read. */
  enabled: z.boolean().default(true).volatile(),
  /** The model that reads your conversations, as JSON `{provider, model}`. Empty: the first model on this Mac or your network. */
  readingModel: z.string().default('').volatile(),
  /** Allow a reading model on the internet. You still see what would be sent before anything is. */
  allowInternet: z.boolean().default(false).volatile(),
  /** Conversations never to learn from (ids, as JSON). Kept on each Mac. */
  nolearn: z.string().default('[]').volatile(),
  /** Project folders where learned skills are off ("Start clean"), as JSON. */
  projectsOff: z.string().default('[]').volatile(),
  /**
   * Learn by itself (step 87): off, nightly or weekly. Only proposes, only while the app is open, and only
   * with a reading model on this Mac or your own network. A time missed while the app was closed is shown,
   * not caught up.
   */
  schedule: z.string().default('off').volatile(),
});

function plain(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}
const listOf = (value) => {
  try {
    const parsed = JSON.parse(String(plain(value) ?? '[]') || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
  } catch {
    return [];
  }
};
const trimSlash = (path) => String(path ?? '').replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '');
/**
 * A Recon room: no learned skill there, ever. Recon's own naming rule: a dsh-recon-* folder directly in
 * /tmp or the temporary folder (the real room, and the room a test copy of the app gets; 17 November 2026).
 */
const inReconRoom = (path) => {
  // Any spelling: capitals, "//", "..", and /private before /tmp or /var (the review of step 6).
  const tidy = (one) => resolve(String(one ?? '/')).toLowerCase().replace(/^\/private(?=\/(?:tmp|var)\/)/, '').replace(/\/+$/, '');
  const value = tidy(path);
  const temp = tidy(tmpdir()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return /^\/tmp\/dsh-recon-[^/]+(?:\/|$)/.test(value) || new RegExp(`^${temp}/dsh-recon-[^/]+(?:/|$)`).test(value);
};

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const warn = (text) => ctx.logger?.warn?.(`skill-architect: ${text}`);
  const enabled = () => plain(config?.enabled) !== false;
  const home = ctx.get('dshHomePath');
  const dir = typeof home === 'function' ? home('skill-architect') : '';
  const library = openLibrary(dir);
  const proposals = openProposals(dir ? join(dir, 'proposals.json') : '');
  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };

  // ---- the skill provider (steps 70, 71) -------------------------------------------------------

  let invalidate = () => {};
  /**
   * Names of every other skill: a learned skill never takes one. The app is asked for the folders where a
   * learned skill would be offered too (the default folder and the folders of the conversations it may
   * read, never Recon's): a skill file there wins over a learned skill of the same name and would hide it
   * silently (17 November 2026; the owner's answer 8). Kept for 30 seconds.
   */
  let takenCache = { at: 0, names: null };
  const takenNames = async ({ fresh = false } = {}) => {
    if (!fresh && takenCache.names && Date.now() - takenCache.at < 30_000) return new Set(takenCache.names);
    const names = new Set();
    const skills = ctx.get('skills');
    const add = (list) => {
      for (const skill of list ?? []) if (skill?.name && skill.provider !== PROVIDER) names.add(String(skill.name));
    };
    try {
      add(await skills?.list?.({}));
    } catch { /* none from the app's own list */ }
    const folders = new Set();
    const usual = ctx.get('workingDirectory')?.defaultDirectory;
    if (typeof usual === 'string' && isAbsolute(usual)) folders.add(usual);
    try {
      for (const record of (await readable()).read ?? []) {
        const cwd = record?.header?.cwd;
        if (typeof cwd === 'string' && isAbsolute(cwd) && !inReconRoom(cwd)) {
          folders.add(cwd);
          // A Scratch conversation works in its own folder inside the shared one (<folder>/<its id>).
          const id = String(record?.header?.id ?? '');
          try {
            if (/^[\w.-]{1,120}$/.test(id) && statSync(join(cwd, id)).isDirectory()) folders.add(join(cwd, id));
          } catch { /* no folder of its own */ }
        }
        if (folders.size >= 40) break;
      }
    } catch { /* only the default folder */ }
    let lease;
    try {
      lease = await ctx.get('agentPresets')?.acquireScope?.(undefined);
    } catch {
      lease = undefined;
    }
    try {
      for (const cwd of folders) {
        try {
          add(await skills?.list?.({ cwd, scope: lease?.key }));
        } catch { /* that folder is left out */ }
      }
    } finally {
      await lease?.[Symbol.asyncDispose]?.();
    }
    takenCache = { at: Date.now(), names: [...names] };
    return names;
  };
  /** The conversation's tab when the app says which conversation asks ('' when it cannot be told). */
  const tabOf = (options) => {
    try {
      const scope = options?.scope;
      if (!scope) return '';
      const agent = (ctx.get('agents')?.list?.() ?? []).find((item) => item === scope || item?.ctx === scope || item?.scope === scope || item?.id === scope);
      return agent ? String(ctx.get('modes')?.get?.(agent.id) ?? '') : '';
    } catch {
      return '';
    }
  };
  const shownFor = (options) => {
    if (!enabled()) return [];
    const cwd = trimSlash(options?.cwd);
    if (cwd && inReconRoom(cwd)) return [];
    if (cwd && listOf(config?.projectsOff).map(trimSlash).includes(cwd)) return [];
    const tab = tabOf(options);
    if (tab === 'recon') return [];
    return library.list().filter((skill) => visibleTo(skill, { cwd, tab }));
  };
  ctx.inject(['skills'], (inner) => {
    try {
      inner.effect(() => inner.skills.registerProvider((control) => {
        invalidate = () => {
          try {
            control.invalidate();
          } catch { /* the list refreshes at the next lookup */ }
        };
        return {
          name: PROVIDER,
          list: async (options) => shownFor(options).map((skill) => ({
            name: skill.name, description: skill.description, invocation: { modelInvocable: true, userInvocable: true },
            source: 'custom', provider: PROVIDER, rank: RANK, locator: skill.name,
          })),
          get: async (candidate, options) => {
            const skill = shownFor(options).find((item) => item.name === candidate?.locator);
            if (!skill) return undefined;
            library.used(skill.name);
            return { name: skill.name, description: skill.description, invocation: { modelInvocable: true, userInvocable: true }, source: 'custom', provider: PROVIDER, content: skill.text };
          },
        };
      }), 'skill-architect: provider');
    } catch (error) {
      warn(`learned skills are not offered: ${String(error?.message ?? error)}`);
    }
  });

  // ---- which conversations may be read (step 76) -------------------------------------------------

  /**
   * Whether a text holds a Recon export: Recon's own detector when its service offers one, and always this
   * add-on's copy of the export's marker lines (so it holds with Recon switched off). Fail closed.
   */
  const exportText = (text) => {
    const value = String(text ?? '');
    if (EXPORT_MARKS.some((mark) => mark.test(value))) return true;
    try {
      const exports = ctx.get('reconExports');
      // Recon's own detector: `inText(text)` → { ids } (an export is in the text when it names one).
      if (typeof exports?.inText === 'function') {
        const found = exports.inText(value);
        if (Array.isArray(found?.ids) && found.ids.length > 0) return true;
      }
      const detect = [exports?.isExport, exports?.detect, exports?.looksExported, exports?.containsExport].find((fn) => typeof fn === 'function');
      return detect ? detect(value) === true : false;
    } catch {
      return true;
    }
  };
  /** @returns {boolean} whether any text in a conversation's events holds a Recon export (copied events too). */
  const exportIn = (events) => {
    let found = false;
    const walk = (value, depth) => {
      if (found || depth > 8 || value === null || value === undefined) return;
      if (typeof value === 'string') {
        if (exportText(value)) found = true;
        return;
      }
      if (Array.isArray(value)) for (const item of value.slice(0, 500)) walk(item, depth + 1);
      else if (typeof value === 'object') for (const item of Object.values(value).slice(0, 100)) walk(item, depth + 1);
    };
    for (const event of Array.isArray(events) ? events : []) walk(event, 0);
    return found;
  };

  /**
   * Whether a conversation received an export from Recon (Recon's export door): its text never reaches
   * learned skills. Fail closed: when Recon's answer cannot be read, the conversation is left out.
   * @returns {string} why it is left out ('' : it may be read).
   */
  const fromRecon = (id) => {
    const exports = ctx.get('reconExports');
    if (!exports) return '';
    try {
      return exports.has(String(id ?? '')) === true ? 'it received an export from Recon' : '';
    } catch {
      return 'Recon could not say whether it received an export';
    }
  };

  const readable = async () => {
    const query = ctx.get('sessionQuery');
    if (!query?.listSessions) return { known: false, reason: 'The app\'s conversation index is not available.', read: [], left: [] };
    const modes = settingsOf('modes');
    // Fail closed, as Sync does: without Modes nobody can say which conversations are Recon's.
    if (!modes) return { known: false, reason: 'The Modes add-on is not running, so it cannot say which conversations are isolated (Recon). Nothing is read.', read: [], left: [] };
    let isolatedMarks = {};
    try {
      isolatedMarks = JSON.parse(modes.sessionIsolated || '{}') ?? {};
    } catch {
      isolatedMarks = {};
    }
    const nolearn = new Set(listOf(config?.nolearn));
    const evolveHome = typeof home === 'function' ? trimSlash(home('evolve')) : '';
    const trash = ctx.get('coworkTrash');
    const records = await query.listSessions();
    const picked = pickConversations(records, {
      known: true,
      why: (id, header) => {
        const cwd = trimSlash(header.cwd);
        if (isolatedMarks[id] === true) return 'isolated (Recon)';
        try {
          if (ctx.get('modes')?.isolated?.(id) === true) return 'isolated (Recon)';
        } catch {
          return 'isolated (Recon)';
        }
        if (inReconRoom(cwd)) return 'isolated (Recon)';
        const exported = fromRecon(id);
        if (exported) return exported;
        if (nolearn.has(id)) return 'you marked it "never learn from this"';
        if (evolveHome && cwd.startsWith(evolveHome)) return 'a Self-improve test run';
        try {
          if (trash?.find?.(id)) return 'in the trash';
        } catch { /* no trash: nothing to leave out */ }
        return '';
      },
    });
    return { known: true, reason: '', ...picked };
  };

  /** The conversations with something to learn from, newest first, with their signals. */
  const candidates = async (most = CANDIDATES_MAX) => {
    const query = ctx.get('sessionQuery');
    const found = await readable();
    if (!found.known) return { ...found, candidates: [] };
    const out = [];
    for (const record of found.read.slice(0, 200)) {
      if (out.length >= most) break;
      const id = String(record.header.id);
      try {
        const log = await query.readSession(id);
        // An export from Recon in its messages, also with Recon off: never read.
        if (exportIn(log.events)) continue;
        const signals = signalsOf(log.events, log.inheritedEventCount);
        if (signals.score > 0 && signals.excerpts.length > 0) out.push({ id, cwd: String(record.header.cwd ?? ''), tab: String(ctx.get('modes')?.get?.(id) ?? ''), ...signals });
      } catch (error) {
        warn(`could not read a conversation: ${String(error?.message ?? error)}`);
      }
    }
    return { known: true, reason: '', left: found.left, candidates: out };
  };

  /**
   * Finished Mission runs as a source (step 85): items that stayed NOT FINISHED after their tries, from the
   * record of runs (`<home>/mission/runs.jsonl` and each run's run.json). Never a run in Recon's room.
   */
  const missionRuns = () => {
    if (typeof home !== 'function') return [];
    const out = [];
    try {
      const lines = readFileSync(join(home('mission'), 'runs.jsonl'), 'utf8').trim().split('\n').slice(-30);
      for (const line of lines.reverse()) {
        if (out.length >= 5) break;
        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        const folder = trimSlash(entry.folder);
        if (!folder || inReconRoom(folder)) continue;
        // A run of a conversation that received an export from Recon is never read; with Recon's export
        // door there, a run that does not say its conversation (an older line) is left out too.
        if (ctx.get('reconExports') && (typeof entry.conversation !== 'string' || !entry.conversation || fromRecon(entry.conversation))) continue;
        let run;
        try {
          run = JSON.parse(readFileSync(join(entry.folder, '.dsh-mission', 'runs', entry.id, 'run.json'), 'utf8'));
        } catch {
          continue;
        }
        // A Bench run is never read: what a device says stays out of learning (the plan's rule).
        if (run.long?.bench) continue;
        // A run whose goal, notes or items carry a Recon export is never read either.
        if (exportIn([run])) continue;
        const stuck = (run.items ?? []).filter((item) => item.status === 'stuck' || item.tries >= 2).slice(0, 3);
        // A run with the work loop on (plan step S8): its recipe and what its checker said, so a recipe change can be proposed.
        const loop = run.loop && typeof run.loop === 'object' ? run.loop : undefined;
        const loopExcerpts = loop ? [
          `A Mission run used the work loop: kind ${String(loop.kind ?? '?').slice(0, 20)}, Depth ${String(loop.depth ?? '?').slice(0, 20)}, ${loop.ultra ? 'Ultra Code on' : 'switched on for its tab'}${loop.recipe ? `, recipe "${String(loop.recipe.id ?? '').slice(0, 60)}" (${String(loop.recipe.name ?? '').slice(0, 80)}): ${(Array.isArray(loop.recipe.steps) ? loop.recipe.steps : []).slice(0, 8).map((step, index) => `${index + 1}. (${String(step.role ?? '').slice(0, 10)}) ${String(step.does ?? '').slice(0, 160)} Checked by: ${String(step.check ?? '').slice(0, 120)}`).join(' ')}` : ''}. Its checks: ${Number(loop.checks?.passed) || 0} passed, ${Number(loop.checks?.failed) || 0} failed; ${Number(loop.escalations) || 0} steps went up to the strongest model. The run ended ${String(run.status ?? '?').slice(0, 20)}.`,
          ...(run.items ?? []).filter((item) => /^Checker: /.test(String(item.note ?? ''))).slice(0, 3).map((item) => `In that run the checker sent back the item "${String(item.title ?? '').slice(0, 120)}": ${String(item.note ?? '').slice(0, 300)}`),
        ] : [];
        if (stuck.length === 0 && loopExcerpts.length === 0) continue;
        out.push({ id: `mission-run-${entry.id}`, cwd: entry.folder, tab: 'mission run', excerpts: [...stuck.map((item) => `A Mission run's item "${item.title}" took ${item.tries} tries${item.status === 'stuck' ? ' and was not finished' : ''}. Last note: ${String(item.note ?? '').slice(0, 300)}`), ...loopExcerpts] });
      }
    } catch {
      /* no runs yet */
    }
    return out;
  };

  // ---- the reading model (step 78) --------------------------------------------------------------

  const readingRoute = () => {
    try {
      const value = JSON.parse(String(plain(config?.readingModel) ?? '') || '{}');
      if (value?.provider && value?.model) return { provider: String(value.provider), model: String(value.model) };
    } catch { /* not set */ }
    return undefined;
  };
  /** Where a provider's models run: its own address when you added it; DeepSeek and unknown ones are the internet. */
  const whereIs = (provider) => {
    const own = settingsOf('llm-pi-ai')?.providers?.[provider];
    const address = own && typeof own === 'object' ? own.baseURL ?? own.baseUrl : undefined;
    if (address) return whereOf(address).where;
    return 'cloud';
  };
  const askModel = async (route, text, signal) => {
    const llm = ctx.get('llm');
    if (!llm?.stream) throw new Error('The app\'s model service is not available.');
    let answer = '';
    for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: [{ role: 'user', content: [{ type: 'text', text }] }], signal })) {
      if (chunk.type === 'text-delta') answer += chunk.text;
      else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message ?? 'The model reported an error.');
    }
    return answer;
  };
  /** Build what would be sent, and to where. */
  const prepare = async () => {
    const route = readingRoute();
    if (!route) throw new Error('Pick the reading model on Settings → Learned skills first.');
    if (route.provider.startsWith('engine-')) throw new Error('An engine is a whole agent, not a model to read with. Pick a model on Settings → Learned skills.');
    const where = whereIs(route.provider);
    const found = await candidates();
    if (!found.known) throw new Error(found.reason);
    const runs = missionRuns();
    if (found.candidates.length === 0 && runs.length === 0) return { route, where, text: '', conversations: [] };
    const conversations = [...found.candidates, ...runs].map((candidate, index) => ({ n: index + 1, id: candidate.id, cwd: candidate.cwd, tab: candidate.tab, excerpts: candidate.excerpts }));
    const taken = [...(await takenNames()), ...library.list().map((skill) => skill.name)];
    return { route, where, conversations, text: learnPrompt({ conversations, taken }) };
  };
  let learning = null;
  const learn = async ({ seen = false } = {}) => {
    if (learning) throw new Error('A learning run is already going.');
    const ready = await prepare();
    if (!ready.text) return { proposals: [], note: 'Nothing to learn from: no conversation has a correction, a Stop, a thumbs down with a note, or feedback.' };
    if (!isPrivate(ready.where)) {
      if (plain(config?.allowInternet) !== true) throw new Error('The reading model is on the internet. Allow that on Settings → Learned skills first, or pick a model on this Mac or your own network.');
      if (!seen) throw new Error('See what would be sent first (Show what it would send), then learn.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('The reading model took too long.')), 10 * 60000);
    learning = controller;
    try {
      const taken = new Set([...(await takenNames()), ...library.list().map((skill) => skill.name)]);
      const answer = await askModel(ready.route, ready.text, controller.signal);
      const found = proposalsOf(answer, { taken: (name) => taken.has(name) });
      const added = proposals.add(found.map((proposal) => {
        const sources = proposal.from.map((ref) => ready.conversations.find((item) => String(item.n) === String(ref).split('.')[0])).filter(Boolean);
        return { ...proposal, conversations: [...new Set(sources.map((item) => item.id))], folder: sources[0]?.cwd ?? '', tab: sources[0]?.tab ?? '', quotes: sources.flatMap((item) => item.excerpts).slice(0, 3) };
      }));
      return { proposals: added, note: added.length > 0 ? '' : 'The reading model proposed nothing.' };
    } finally {
      clearTimeout(timer);
      learning = null;
    }
  };

  // ---- deciding on proposals (steps 79 to 82) ---------------------------------------------------

  /**
   * Tuning Plus's exam, when that add-on is on and has an exam of the owner's work: the reading model answers
   * the exam without the skill and with it. Undefined (Tuning Plus off, no exam, no reading model): as before.
   */
  const skillExam = async (skill) => {
    let tuning;
    try {
      tuning = ctx.get('tuning');
    } catch {
      return undefined;
    }
    const route = readingRoute();
    if (tuning?.apiVersion !== 1 || typeof tuning.examGate !== 'function' || !route || route.provider.startsWith('engine-')) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('The exam took too long.')), 20 * 60000);
    try {
      const result = await tuning.examGate({ route, before: '', after: `## Skill: ${skill.name}\n${skill.description ? `${skill.description}\n\n` : ''}${skill.text}`, signal: controller.signal });
      return result && typeof result.ok === 'boolean' ? { ok: result.ok, why: String(result.why ?? '').slice(0, 300), model: route.model } : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Whether Tuning Plus can try a skill on the owner's exam (it may still find too few exam rows). */
  const examAvailable = () => {
    try {
      const tuning = ctx.get('tuning');
      const route = readingRoute();
      return tuning?.apiVersion === 1 && typeof tuning.examGate === 'function' && Boolean(route) && !route.provider.startsWith('engine-');
    } catch {
      return false;
    }
  };
  const addSkill = async (id, merged, exam, anyway) => {
    // The final check asks afresh: a skill file written moments ago must count.
    const taken = await takenNames({ fresh: true });
    const reach = merged.reach === 'project' && merged.folder ? { kind: 'project', folder: merged.folder } : merged.reach === 'tab' && merged.tab ? { kind: 'tab', tab: merged.tab } : { kind: 'all' };
    library.add({ name: merged.name, description: merged.description, text: merged.text, reach, by: 'learned', why: `Learned from your conversations: ${merged.why}${exam ? ` Your own exam (Tuner Plus): ${exam.why}.` : anyway ? ' Added anyway after the exam.' : ''}` }, (name) => taken.has(name));
    invalidate();
    proposals.decide(id, 'accepted');
    return `The skill "${merged.name}" is added.${exam ? ` On your own exam (Tuner Plus) with ${exam.model}: ${exam.why}.` : ''}`;
  };
  const examJobs = new Set();
  // A try that was going when the app closed is not going any more.
  for (const item of proposals.list()) if (item.examRunning) proposals.note(item.id, { examRunning: false });

  const accept = async (id, edits = {}, { anyway = false } = {}) => {
    const proposal = proposals.get(id);
    if (!proposal) throw new Error('That proposal is gone.');
    const merged = { ...proposal, ...Object.fromEntries(Object.entries(edits).filter(([, value]) => typeof value === 'string')) };
    let said = '';
    if (merged.kind === 'skill') {
      if (anyway || !examAvailable()) return addSkill(id, merged, undefined, anyway);
      // One more check when Tuning Plus is on: the skill is tried on your own exam in the background (it can
      // take minutes); it is added when it is not worse, and otherwise waits here with the result and an
      // "Add anyway" button.
      if (examJobs.has(id)) return 'It is being tried on your own exam (Tuner Plus); this page shows the result when it is done.';
      examJobs.add(id);
      proposals.note(id, { examRunning: true, examProblem: '' });
      void (async () => {
        try {
          const exam = await skillExam(merged);
          proposals.note(id, { examRunning: false, ...(exam ? { exam: { ...exam, text: merged.text, at: Date.now() } } : {}) });
          if (!exam || exam.ok) await addSkill(id, merged, exam, false);
        } catch (error) {
          proposals.note(id, { examRunning: false, examProblem: String(error?.message ?? error).slice(0, 300) });
        } finally {
          examJobs.delete(id);
        }
      })();
      return `Trying "${merged.name}" on your own exam first (Tuner Plus), with ${readingRoute()?.model ?? 'the reading model'}. It is added when it is not worse; this page shows the result when it is done.`;
    } else if (merged.kind === 'fact') {
      const memory = ctx.get('memoryStore');
      if (!memory?.add) throw new Error('Memory is off, so the fact cannot be added. Switch Memory on, or reject this.');
      memory.add(merged.text);
      said = 'The fact is added to Memory.';
    } else if (merged.kind === 'recipe') {
      // A recipe changes only with your yes: Mission checks it, keeps the earlier version and writes the new one.
      const mission = ctx.get('mission');
      if (!mission?.saveRecipe) throw new Error('Mission is off or older, so the recipe cannot be saved. Switch Mission on, or reject this.');
      const saved = mission.saveRecipe(merged.recipe);
      said = `The recipe "${saved.name}" is saved as version ${saved.version}${saved.kept ? `; the earlier one is kept as ${saved.kept}` : ''}. Runs with the work loop use it from the next one.`;
    } else if (merged.kind === 'version') {
      said = 'Change it yourself on Settings → Model Tiers → Model versions, on the version it is about. Changing it by itself is not built.';
    } else if (merged.kind === 'rule') {
      const projectsService = ctx.get('coworkProjects');
      if (!projectsService?.appendRule) throw new Error('The Cowork sidebar is off, so the rule cannot be added to the project.');
      if (!merged.folder) throw new Error('This rule came from a conversation with no project.');
      projectsService.appendRule(merged.folder, merged.text);
      said = 'The rule is added to the project\'s instructions, as a new version you can put back on its page.';
    } else {
      said = 'Add it yourself on Settings → Self-improve as your own lesson (on the model version it is about). Filing it there by itself is not built yet.';
    }
    // The quotes go once you decided (the owner's choice); the record of the decision stays.
    proposals.decide(id, 'accepted');
    return said;
  };

  // Deleting a conversation for good removes the quotes taken from it (the owner's choice).
  ctx.inject(['coworkTrash'], (inner) => {
    try {
      inner.effect(() => inner.coworkTrash.onErased?.((ids) => { proposals.dropQuotes(ids); }) ?? (() => {}), 'skill-architect: quotes go with their conversation');
    } catch { /* quotes then stay until you decide */ }
  });

  // ---- the optional schedule (step 87) ------------------------------------------------------------

  const scheduleFile = dir ? join(dir, 'schedule.json') : '';
  const readSchedule = () => {
    try {
      return JSON.parse(readFileSync(scheduleFile, 'utf8')) ?? {};
    } catch {
      return {};
    }
  };
  const writeSchedule = (value) => {
    if (!scheduleFile) return;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(scheduleFile, JSON.stringify(value), { mode: 0o600 });
    } catch { /* the next tick tries again */ }
  };
  const every = () => ({ nightly: 24 * 3600000, weekly: 7 * 24 * 3600000 })[String(plain(config?.schedule) ?? 'off')] ?? 0;
  const scheduleState = () => {
    const period = every();
    const last = Number(readSchedule().lastRun) || 0;
    return { schedule: String(plain(config?.schedule) ?? 'off'), lastRun: last, missed: period > 0 && last > 0 && Date.now() - last > 2 * period, lastNote: String(readSchedule().note ?? '') };
  };
  const tick = async () => {
    const period = every();
    if (!period || !enabled() || learning) return;
    const state = readSchedule();
    const last = Number(state.lastRun) || 0;
    if (last && Date.now() - last < period) return;
    const route = readingRoute();
    // Only a private reading model: an internet one needs you to look first.
    if (!route || !isPrivate(whereIs(route.provider))) {
      writeSchedule({ ...state, lastRun: Date.now(), note: 'Skipped: a scheduled run needs a reading model on this Mac or your own network.' });
      return;
    }
    try {
      const done = await learn({ seen: false });
      writeSchedule({ lastRun: Date.now(), note: `${done.proposals.length} proposal(s).` });
    } catch (error) {
      writeSchedule({ lastRun: Date.now(), note: `Failed: ${String(error?.message ?? error).slice(0, 200)}` });
    }
  };
  const timer = setInterval(() => void tick(), 60 * 60000);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), 'skill-architect: schedule');

  // ---- settings writes ---------------------------------------------------------------------------

  const setConfig = async (ops) => {
    const settings = ctx.get('settings');
    if (!settings?.mutate) throw new Error('The settings service is not available.');
    await settings.mutate('skill-architect', ops);
  };
  const toggleIn = async (field, value, on) => {
    const list = new Set(listOf(config?.[field]));
    if (on) list.add(value);
    else list.delete(value);
    await setConfig([{ op: 'set', path: [field], value: JSON.stringify([...list].slice(-1000)) }]);
    invalidate();
  };

  // ---- the page's route --------------------------------------------------------------------------

  const view = () => ({
    at: Date.now(),
    enabled: enabled(),
    readingModel: readingRoute() ?? null,
    where: readingRoute() ? whereIs(readingRoute().provider) : '',
    allowInternet: plain(config?.allowInternet) === true,
    nolearn: listOf(config?.nolearn),
    projectsOff: listOf(config?.projectsOff),
    skills: library.list(),
    // A recipe change shows what it would replace: the file, its version and its steps (Mission's own copy).
    proposals: proposals.list().map((item) => {
      if (item.kind !== 'recipe' || !item.recipe || item.state !== 'waiting') return item;
      let now;
      try {
        now = ctx.get('mission')?.recipe?.(String(item.recipe.id ?? ''));
      } catch {
        now = undefined;
      }
      return { ...item, replaces: now ? { id: now.id, name: now.name, kind: now.kind, version: now.version, when: now.when, steps: now.steps, stop: now.stop, ...(now.shape ? { shape: now.shape } : {}) } : null };
    }),
    learning: Boolean(learning),
    ...scheduleState(),
  });
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: DATA_PATH,
      handler: async (req, res) => {
        const refused = inner.connection.requestRejection(req);
        if (refused !== undefined) {
          res.statusCode = refused;
          res.end();
          return;
        }
        if (req.method !== 'GET' && req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('allow', 'GET, POST');
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        try {
          const out = {};
          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 64 * 1024) throw new Error('request too large');
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            // A deleted learned skill brought back must not take a name another skill has meanwhile.
            const backAgain = async (name) => {
              if (library.get(name)?.deleted === true && (await takenNames({ fresh: true })).has(name)) throw new Error(`There is now another skill called "${name}" (a skill file, a plugin's or the app's). Bringing this learned skill back would hide it or be hidden by it.`);
            };
            switch (body.action) {
              case 'add': {
                const taken = await takenNames({ fresh: true });
                library.add({ name: body.name, description: body.description, text: body.text, reach: readReach(body.reach), by: 'hand' }, (skillName) => taken.has(skillName));
                invalidate();
                break;
              }
              case 'update':
                await backAgain(String(body.name ?? ''));
                library.update(String(body.name ?? ''), { description: body.description, text: body.text, reach: body.reach === undefined ? undefined : readReach(body.reach) });
                invalidate();
                break;
              case 'putBack':
                await backAgain(String(body.name ?? ''));
                library.putBack(String(body.name ?? ''), body.version);
                invalidate();
                break;
              case 'delete':
                library.remove(String(body.name ?? ''));
                invalidate();
                break;
              case 'candidates': {
                const found = await candidates(50);
                out.candidates = found.candidates.map(({ excerpts, ...rest }) => ({ ...rest, excerpts: excerpts.length }));
                out.left = found.left.slice(0, 200);
                out.known = found.known;
                out.reason = found.reason;
                break;
              }
              case 'preview': {
                const ready = await prepare();
                out.preview = { where: ready.where, model: ready.route.model, text: ready.text, conversations: ready.conversations.length };
                break;
              }
              case 'learn':
                Object.assign(out, await learn({ seen: body.seen === true }));
                break;
              case 'accept':
                out.said = await accept(String(body.id ?? ''), body.edits ?? {}, { anyway: body.anyway === true });
                break;
              case 'reject':
                proposals.decide(String(body.id ?? ''), 'rejected');
                break;
              case 'nolearn':
                await toggleIn('nolearn', String(body.sessionId ?? ''), body.on === true);
                break;
              case 'projectOff':
                await toggleIn('projectsOff', String(body.folder ?? ''), body.on === true);
                break;
              default:
                throw new Error('Unknown action.');
            }
          }
          res.end(JSON.stringify({ ...view(), ...out }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 400) }));
        }
      },
    }), 'skill-architect: route');
  });

  // ---- /skills learn (step 78) -------------------------------------------------------------------

  ctx.inject(['commands'], (inner) => {
    inner.effect(() => inner.commands.register({
      name: 'skills',
      description: 'Learned skills: `learn` reads your past corrections and proposes changes (nothing is installed until you say yes), `list` shows them',
      input: { hint: '[learn | list]' },
      handler: async ({ rawInput }) => {
        try {
          const word = String(rawInput ?? '').trim().toLowerCase();
          if (word === 'learn') {
            const done = await learn({ seen: false });
            return { kind: 'success', text: done.proposals.length > 0 ? `${done.proposals.length} proposal${done.proposals.length === 1 ? '' : 's'} wait for your yes on Settings → Learned skills. Nothing is installed until you accept.` : done.note };
          }
          const skills = library.list().filter((skill) => !skill.deleted);
          return { kind: 'success', text: skills.length > 0 ? `${skills.length} learned skill${skills.length === 1 ? '' : 's'}. Click for the list.\n${skills.map((skill) => `${skill.name}: ${skill.description} (${skill.reach.kind === 'all' ? 'every tab' : skill.reach.kind === 'tab' ? `tab ${skill.reach.tab}` : `project ${skill.reach.folder}`})`).join('\n')}` : 'No learned skills yet. /skills learn reads your past corrections and proposes some; Settings → Learned skills adds one by hand.' };
        } catch (error) {
          return { kind: 'error', text: String(error?.message ?? error).slice(0, 400) };
        }
      },
    }), 'skill-architect: command');
  });

  ctx.effect(() => ctx.provide('skillArchitect', Object.freeze({
    apiVersion: 1,
    /** @returns {boolean} whether a learned skill of this name may reach a conversation in this folder (Model Tiers asks, step 74). */
    allowed: (skillName, cwd = '') => {
      const skill = library.get(String(skillName ?? ''));
      if (!skill) return true; // not a learned skill: not ours to decide
      return shownFor({ cwd }).some((item) => item.name === skill.name);
    },
    isLearned: (skillName) => Boolean(library.get(String(skillName ?? ''))),
  })), 'skill-architect service');
}
