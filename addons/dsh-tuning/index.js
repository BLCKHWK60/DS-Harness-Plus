/**
 * Tuning Plus: models that learn from your work (the plan of 16 November 2026).
 *
 * The harness already produces checked work: tests that pass, claims that map to an opened source, drafts the
 * owner edited and approved, devices that read back. Tuning Plus keeps each checked step as a training row with
 * its proof (the harvest), sends one row in five to a private exam, builds named data sets over time, and turns
 * them into better instructions, adapters and small tuned models, each one tested on the exam before the owner
 * is asked. It is a ratchet, not infinity: each step holds only if it beats the exam.
 *
 *   - lib/harvest.js, lib/harvest-more.js: rows cut by code from conversations, Mission runs and Content's records;
 *   - lib/rows.js: a row, its proof, who made it, and whether it may train (set by code);
 *   - lib/exam.js: marking by each kind's own check, the promotion rule, the weakest spot;
 *   - lib/sets.js: named sets, near repeats, the trainer's format;
 *   - lib/ladder.js: the cheapest rung first, the run in one sentence;
 *   - lib/trainer.js, lib/answer.py: training and answering with Apple's mlx-lm on this Mac (installed by the owner);
 *   - lib/shelf.js: adapters and prompts, switched on, never baked in;
 *   - lib/night.js: the night shift (on power and idle only);
 *   - lib/taste.js, lib/lessons.js, lib/qa.js: the taste test, plugin lessons, question-and-answer rows.
 *
 * Off until switched on, for each mode. Recon is never harvested, nor a conversation that received an export
 * from Recon. Training runs only on this Mac, from a Python and a model folder the owner gives. Nothing is
 * promoted without the exam and the owner's yes. Route: `GET/POST /dsh-tuning/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { EXAM_MIN, mark, pct, promotable, promptOf, runExam, weakestSpot } from './lib/exam.js';
import { QUIET_MS, closedTool, lastTimeOf, rowsFromLedger, rowsFromLibrary, rowsFromRun, rowsFromTurns, signedInTool, turnsOf } from './lib/harvest.js';
import { rowsFromBench, rowsFromCorrections, rowsFromCreator, rowsFromData, rowsFromPacket } from './lib/harvest-more.js';
import { ADAPTER_MIN, GOALS, RUNGS, SKILL_HOME, homes, proposeRung, runSentence } from './lib/ladder.js';
import { RUN_TYPES, SKILL_GOAL, WHAT_MAX } from './lib/skills/bar.js';
import { MARKS } from './lib/skills/marks.js';
import { lessonsFrom, toolsKey } from './lib/lessons.js';
import { IDLE, POWER, idleSeconds, mayWork, mustStop, onPower } from './lib/night.js';
import { qaRows } from './lib/qa.js';
import { forExam, mayTrain } from './lib/rows.js';
import { TASK_SETS, buildSets, dropRepeats, examApart, trainerRows } from './lib/sets.js';
import { markDue, newEntry, promote, rebuildPlan, recordExam, routeOf, setOn, setRoles, setServing, staleEntries } from './lib/shelf.js';
import { folderIn, openStore, readJson, readLines, writeJson, writeText } from './lib/store.js';
import { newRound, pairsOf, recordPick, roundView, tally } from './lib/taste.js';
import { openSkills } from './lib/skills/part.js';
import { CHECKPOINT, ISOLATED, OFFLINE_ENV, answerArgs, emptyFolder, fingerprint, folderBytes, freeBytes, fuseArgs, inside, modelProblem, progressOf, pythonProblem, runPython, serveArgs, trainArgs } from './lib/trainer.js';

export const name = 'dsh-tuning';
export const DATA_PATH = '/dsh-tuning/data';
const NS = 'tuning';
/** The modes Tuning Plus harvests, each with its own switch (all off until the owner switches one on). */
export const MODES = {
  code: 'Code: tool calls whose tests passed, finished runs, failed calls beside the fix, Mission items whose check passed',
  content: 'Content: your rulings on claims, and your edits beside the writer\'s drafts',
  research: 'Research: a passage and the claim it supports from a source that was opened, and source grades',
  data: 'Finance and Data: a question and the query that answered it, when the analysis was saved or run again',
  bench: 'Bench: what a device reports and the recipe that fitted, for devices whose read was checked (never a write command)',
  loop: 'The work loop: each step and the cheapest model that passed it, for the router',
  corrections: 'Any mode: the answer before the owner corrected it beside the answer after',
  creator: 'Creator Plus: a brief and the plugin that passed its checks; an error, its cause and its fix',
  other: 'Other tabs (Cowork, Chat, Scout…): tool calls of turns that finished with no failed call and no correction',
};
/**
 * What marks an export from Recon in a text: the line a message export starts with, the source lines, and
 * a folder export's files (export.md's heading and warning, export.json's origin). Recon's own reader
 * (reconExports.inText) is asked too when Recon is on.
 */
export const EXPORT_MARKS = [/^\[Recon export [^\]\n]{1,80}\]/m, /origin: Recon · lane:/, /^#\s*Recon export\b/m, /"origin"\s*:\s*"Recon"/, /Everything below came from Recon/];

export const Config = z.object({
  /** Tuning Plus as a whole. Off: nothing is harvested and its tools are not offered. */
  enabled: z.boolean().default(false).volatile(),
  /** Which modes are harvested, as JSON: `{ code: true }`. Every mode starts off. */
  harvest: z.string().default('{}').volatile(),
  /** Tuning Plus's folder. Empty (or not a full path): `tuning` in the app's data. */
  folder: z.string().default('').volatile(),
  /** The Python in which the owner installed mlx-lm (full path). Tuning Plus installs nothing. */
  python: z.string().default('').volatile(),
  /** Where each base model's MLX files are on this Mac, as JSON: `{ "model name": "/full/path" }`. */
  models: z.string().default('{}').volatile(),
  /** The teacher model (question-and-answer rows), as JSON `{ provider, model }`. */
  teacher: z.string().default('').volatile(),
  /** A teacher on the internet may read rows only when the owner ticked this. */
  teacherCloud: z.boolean().default(false).volatile(),
  /** "May train" per provider, as JSON `{ provider: false }`. Missing means yes. */
  providers: z.string().default('{}').volatile(),
  /** Text written by Anthropic's models may train adapters that write open-ended text. Starts off (the plan). */
  anthropicOpenEnded: z.boolean().default(false).volatile(),
  /** The night shift on this Mac. */
  nightShift: z.boolean().default(false).volatile(),
  /** Minutes of quiet before the night shift works. */
  idleMinutes: z.number().default(15).volatile(),
  /** The night shift's time limit per night, in minutes. */
  nightMinutes: z.number().default(120).volatile(),
  /** The sets the night shift may train, as JSON `["harness"]`, with the base model for each: `{ set, model }`. */
  nightTrain: z.string().default('[]').volatile(),
  /** How many exam rows a check uses at most. */
  examLimit: z.number().default(40).volatile(),
  /**
   * Count the owner's own network's machines (192.168…, .local) as this Mac when deciding what may be sent to
   * a model. Off: only this Mac itself counts. A local proxy that forwards to a cloud provider cannot be told
   * apart from a model on the owner's network.
   */
  ownNetworkLocal: z.boolean().default(false).volatile(),
  /**
   * The skills part (marks and records of every skill; later: writing and examining skills). Off: Tuner Plus is
   * what it was before; nothing of the part runs, writes or asks.
   */
  skills: z.boolean().default(false).volatile(),
  /**
   * The two models of the skill exam, as JSON `{ floor: { provider, model }, strong: { provider, model } }`: the
   * floor model must run on this Mac (the owner's held-back tasks never leave it); the strong one may be any.
   */
  skillExam: z.string().default('{}').volatile(),
  /**
   * The night shift drafts skills too (off at first; needs the night shift and the skills part): at most two
   * skill ideas a night, each drafted by a model on this Mac and examined. Nothing goes live, nothing is edited.
   */
  nightSkills: z.boolean().default(false).volatile(),
});

function plain(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}
const readObject = (value, fallback = {}) => {
  const raw = plain(value);
  if (raw && typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw ?? '') || JSON.stringify(fallback));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};
const trimSlash = (value) => String(value ?? '').replace(/\/+$/, '');
/** A Recon room: a dsh-recon-* folder directly in /tmp, /private/tmp or the temporary folder (Recon's own naming rule). */
export function inReconRoom(path) {
  const value = String(path ?? '').toLowerCase();
  return [/^\/(?:private\/)?tmp\/dsh-recon-[^/]+(?:\/|$)/, new RegExp(`^${trimSlash(tmpdir()).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/dsh-recon-[^/]+(?:/|$)`)].some((rule) => rule.test(value));
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 * @param {object} [standIns] - for tests: `run` (fixed commands), `runPython`, `now`.
 */
export function apply(ctx, config, standIns = {}) {
  const enabled = () => plain(config?.enabled) === true;
  const warn = (text) => ctx.logger?.warn?.(`tuning: ${text}`);
  const home = ctx.get('dshHomePath');
  const ownFolder = typeof home === 'function' ? home('tuning') : '';
  const folder = () => {
    const picked = String(plain(config?.folder) ?? '').trim();
    return isAbsolute(picked) ? picked : ownFolder;
  };
  const store = openStore(folder);
  const now = standIns.now ?? (() => Date.now());
  const harvestOn = (mode) => enabled() && readObject(config?.harvest)[mode] === true;
  const providers = () => readObject(config?.providers);
  const rules = () => ({ providers: providers(), anthropicOpenEnded: plain(config?.anthropicOpenEnded) === true });
  const modelPaths = () => readObject(config?.models);
  const python = () => String(plain(config?.python) ?? '').trim();
  const examLimit = () => Math.min(500, Math.max(EXAM_MIN, Number(plain(config?.examLimit)) || 40));
  const settingsOf = (ns) => {
    try {
      return plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value);
    } catch {
      return undefined;
    }
  };
  /** Fixed commands, never through a shell. */
  const run = standIns.run ?? ((file, args, timeoutMs = 20_000) => new Promise((done) => execFile(file, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, shell: false }, (error, stdout) => done({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout ?? '') }))));
  const py = standIns.runPython ?? runPython;

  // ---- models: the teacher, the model being examined -----------------------------------------------------

  const teacherRoute = () => {
    const value = readObject(config?.teacher, {});
    return value?.provider && value?.model ? { provider: String(value.provider), model: String(value.model) } : undefined;
  };
  /** Where a provider's models run: its own address when the owner added it; DeepSeek and unknown ones are the internet. */
  const whereIs = (provider) => {
    const own = settingsOf('llm-pi-ai')?.providers?.[provider];
    const address = own && typeof own === 'object' ? String(own.baseURL ?? own.baseUrl ?? '') : '';
    if (!address) return 'internet';
    try {
      const host = new URL(address).hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return 'this Mac';
      if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return 'own network';
    } catch {
      return 'internet';
    }
    return 'internet';
  };
  /**
   * Whether a provider's models count as this Mac for what may be sent to them: this Mac itself, and the
   * owner's own network only when the owner switched that on (a local proxy to a cloud provider cannot be told
   * apart from a machine at home).
   */
  const onThisMac = (provider) => {
    const where = whereIs(provider);
    return where === 'this Mac' || (where === 'own network' && plain(config?.ownNetworkLocal) === true);
  };
  /** Ask a model in the app; its token use is counted when the caller keeps an allowance. */
  const askModel = standIns.askModel ?? (async (route, text, signal, spend, options = {}) => {
    const llm = ctx.get('llm');
    if (!llm?.stream) throw new Error('The app\'s model service is not available.');
    let answer = '';
    let usage;
    // The skill exam asks for steady answers (temperature 0); every other caller sends what it always sent.
    for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages: [{ role: 'user', content: [{ type: 'text', text }] }], ...(typeof options?.temperature === 'number' ? { temperature: options.temperature } : {}), signal })) {
      if (chunk.type === 'text-delta') answer += chunk.text;
      else if (chunk.type === 'usage') usage = chunk.usage;
      else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message ?? 'The model reported an error.');
    }
    spend?.((Number(usage?.inputTokens) || 0) + (Number(usage?.outputTokens) || 0) || Math.ceil((text.length + answer.length) / 4));
    return answer;
  });
  /** A request of an exam row as one text (system notes first, as the benchmark add-on does). */
  const asText = (messages, instructions = '') => {
    const system = [instructions, ...messages.filter((message) => message.role === 'system').map((message) => message.content)].filter(Boolean).join('\n\n');
    const rest = messages.filter((message) => message.role !== 'system').map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`).join('\n\n');
    return system ? `${system}\n\n${rest}` : rest;
  };

  // ---- which conversations may be read (the same rules as Learned skills, fail closed) ----------------------

  const fromRecon = (id) => {
    const exports = ctx.get('reconExports');
    if (!exports) return '';
    try {
      return exports.has?.(String(id ?? '')) === true ? 'it received an export from Recon' : '';
    } catch {
      return 'Recon could not say whether it received an export';
    }
  };
  const exportText = (text) => {
    const value = String(text ?? '');
    if (EXPORT_MARKS.some((mark_) => mark_.test(value))) return true;
    try {
      const found = ctx.get('reconExports')?.inText?.(value);
      return Array.isArray(found?.ids) && found.ids.length > 0;
    } catch {
      return true;
    }
  };
  const exportIn = (events) => {
    let found = false;
    const walk = (value, depth) => {
      if (found || depth > 8 || value === null || value === undefined) return;
      if (typeof value === 'string') {
        if (exportText(value)) found = true;
        return;
      }
      if (Array.isArray(value)) for (const item of value) walk(item, depth + 1);
      else if (typeof value === 'object') for (const item of Object.values(value)) walk(item, depth + 1);
    };
    walk(events, 0);
    return found;
  };
  /** The conversations that may be read, each with its mode (a helper takes its conversation's). */
  const readable = async () => {
    const query = ctx.get('sessionQuery');
    if (!query?.listSessions) return { known: false, why: 'The app\'s conversation index is not available.', read: [], left: [] };
    const modes = settingsOf('modes');
    // Without Modes nobody can say which conversations are Recon's: nothing is read.
    if (!modes) return { known: false, why: 'The Modes add-on is not running, so it cannot say which conversations are Recon\'s. Nothing is read.', read: [], left: [] };
    const isolatedMarks = readObject(modes.sessionIsolated);
    const modeMap = readObject(modes.sessionModes);
    // Conversations the owner marked "never learn from this" on Learned skills' page.
    const nolearn = new Set(readObject(settingsOf('skill-architect')?.nolearn, []));
    const evolveHome = typeof home === 'function' ? trimSlash(home('evolve')) : '';
    const trash = ctx.get('coworkTrash');
    const records = await query.listSessions();
    const byId = new Map(records.map((record) => [String(record?.header?.id ?? ''), record]));
    const topOf = (id) => {
      let current = id;
      for (let depth = 0; depth < 8; depth += 1) {
        const parent = byId.get(current)?.header?.parentSession;
        if (!parent) break;
        current = String(parent);
      }
      return current;
    };
    const why = (id, header) => {
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
      if (nolearn.has(id)) return 'marked "never learn from this"';
      if (evolveHome && (cwd === evolveHome || cwd.startsWith(`${evolveHome}/`))) return 'a Self-improve test run';
      try {
        if (trash?.find?.(id)) return 'in the trash';
      } catch { /* no trash */ }
      return '';
    };
    const read = [];
    const left = [];
    for (const record of records) {
      const header = record?.header ?? {};
      const id = String(header.id ?? '');
      if (!id) continue;
      const top = topOf(id);
      const reason = why(id, header) || (top !== id ? why(top, byId.get(top)?.header ?? {}) : '');
      if (reason) left.push({ id, why: reason, cwd: trimSlash(header.cwd), top });
      else read.push({ id, header, top, mode: String(modeMap[top] ?? ctx.get('modes')?.get?.(top) ?? '') });
    }
    return { known: true, why: '', read, left };
  };

  // ---- the harvest (T1, T12) ------------------------------------------------------------------------------

  const keep = (mode, rows) => {
    const salt = store.salt();
    // A row made from another row (a lesson) keeps that row's side; any other row is drawn by code.
    for (const row of rows) if (typeof row.exam !== 'boolean') row.exam = forExam(row.id, salt);
    return store.addRows(mode, rows);
  };
  /**
   * Rows a conversation's turns make now, and rows it would have made had no turn been corrected: what was
   * kept earlier (a newest turn let through after a quiet spell) and corrected since is taken out again.
   */
  const withdraw = (turns, meta, quiet) => {
    const now = new Set([...rowsFromTurns(turns, { ...meta, quiet }), ...rowsFromCorrections(turns, { ...meta, quiet })].map((row) => row.id));
    const relaxed = turns.map((turn) => ({ ...turn, corrected: false, last: false }));
    const could = [...rowsFromTurns(relaxed, { ...meta, quiet: true }), ...rowsFromCorrections(relaxed, { ...meta, quiet: true })].map((row) => row.id).filter((id) => !now.has(id));
    return could.length > 0 ? store.removeRows(could) : 0;
  };
  /** A mode's switch for a conversation's tab: code → code; data and finance → data; others → other. */
  const switchOf = (tab) => (tab === 'code' ? 'code' : tab === 'data' || tab === 'finance' ? 'data' : tab === 'content' ? 'content' : tab === 'research' ? 'research' : tab === 'bench' ? 'bench' : tab === 'recon' ? '' : 'other');
  const reportsFolder = () => {
    const value = plain(settingsOf('research')?.folder);
    if (typeof value === 'string' && isAbsolute(value.trim())) return value.trim();
    return typeof home === 'function' ? join(home('research'), 'reports') : '';
  };
  const benchFolder = () => {
    const value = String(plain(settingsOf('bench')?.folder) ?? '').trim();
    return isAbsolute(value) ? value : typeof home === 'function' ? home('bench') : '';
  };
  const contentLibrary = () => {
    const value = String(plain(settingsOf('content')?.voiceLibrary) ?? '').trim();
    return isAbsolute(value) ? value : typeof home === 'function' ? join(home('content'), 'voice-library') : '';
  };
  const safeRead = (file, max = 2_000_000) => {
    try {
      if (lstatSync(file).isSymbolicLink()) return '';
      return readFileSync(file, 'utf8').slice(0, max);
    } catch {
      return '';
    }
  };
  let harvesting;
  /**
   * Cut new rows from what the harness kept, for the modes switched on.
   * @returns {Promise<object>} what was found, kept, sent to the exam and left out (with reasons).
   */
  const harvest = async ({ signal } = {}) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    if (harvesting) return harvesting;
    harvesting = (async () => {
      const summary = { at: now(), modes: {}, conversations: 0, left: [], problems: [] };
      const add = (mode, rows) => {
        if (rows.length === 0) return;
        const result = keep(mode, rows);
        const slot = (summary.modes[mode] ??= { kept: 0, exam: 0, repeats: 0 });
        slot.kept += result.kept;
        slot.exam += result.exam;
        slot.repeats += result.repeats;
      };
      const cursor = store.state().cursor ?? {};
      const query = ctx.get('sessionQuery');
      const wantsConversations = ['code', 'content', 'data', 'corrections', 'other', 'research'].some(harvestOn);
      if (wantsConversations) {
        const found = await readable();
        if (!found.known) summary.problems.push(found.why);
        summary.left = found.left.slice(0, 50);
        for (const record of found.read.slice(0, 2000)) {
          signal?.throwIfAborted?.();
          const tab = record.mode;
          const toggle = switchOf(tab);
          if (!toggle || tab === 'bench') continue;
          const wantTurns = harvestOn(toggle) && toggle !== 'research' && toggle !== 'content';
          const wantCorrections = harvestOn('corrections');
          if (!wantTurns && !wantCorrections) continue;
          let log;
          try {
            log = await query.readSession(record.id);
          } catch (error) {
            summary.problems.push(`a conversation could not be read: ${String(error?.message ?? error).slice(0, 120)}`);
            continue;
          }
          const events = Array.isArray(log?.events) ? log.events : [];
          // The newest turn counts once a later turn exists, or once the conversation was quiet for hours.
          const lastAt = lastTimeOf(events);
          const quiet = lastAt > 0 && now() - lastAt > QUIET_MS;
          const mark_ = `${events.length}${quiet ? 'q' : ''}`;
          if (cursor[record.id] === mark_) continue;
          // An export from Recon in its messages (also copied in by a fork): never read, also with Recon off.
          if (exportIn(events)) {
            summary.left.push({ id: record.id, why: 'it holds an export from Recon' });
            continue;
          }
          summary.conversations += 1;
          const turns = turnsOf(events, log.inheritedEventCount);
          const meta = { mode: tab || 'other', session: record.id };
          if (wantTurns) add(toggle === 'data' ? 'data' : tab || 'other', toggle === 'data' ? rowsFromData(turns, { mode: 'data', session: record.id, quiet }) : rowsFromTurns(turns, { ...meta, quiet }));
          if (wantCorrections) add('corrections', rowsFromCorrections(turns, { ...meta, quiet }));
          summary.withdrawn = (summary.withdrawn ?? 0) + withdraw(turns, meta, quiet);
          cursor[record.id] = mark_;
        }
        // Content's ledgers, in the folders of Content conversations. A folder is read only when no
        // conversation in it was left out (Recon, an export, marked) and none holds an export from Recon:
        // a clean conversation on a folder where an export was used never brings that ledger in.
        if (harvestOn('content')) {
          const folders = new Set(found.read.filter((record) => record.mode === 'content' && record.top === record.id).map((record) => trimSlash(record.header.cwd)).filter((cwd) => cwd && isAbsolute(cwd) && !inReconRoom(cwd)));
          const within = (cwd, subject) => cwd === subject || cwd.startsWith(`${subject}/`);
          for (const subject of folders) {
            const outLeft = found.left.find((record) => within(String(record.cwd ?? ''), subject));
            if (outLeft) {
              summary.left.push({ id: `folder ${subject.split('/').pop()}`, why: `a conversation in this folder was left out (${outLeft.why})` });
              continue;
            }
            let tainted = false;
            for (const record of found.read.filter((one) => within(trimSlash(one.header.cwd), subject)).slice(0, 300)) {
              try {
                const log = await query.readSession(record.id);
                if (exportIn(log?.events)) tainted = true;
              } catch {
                tainted = true;
              }
              if (tainted) break;
            }
            if (tainted) {
              summary.left.push({ id: `folder ${subject.split('/').pop()}`, why: 'a conversation in this folder holds an export from Recon (or could not be read)' });
              continue;
            }
            const state = readJson(join(subject, '.content', 'state.json'), null);
            if (state) add('content', rowsFromLedger(state, { subject: subject.split('/').pop() ?? '' }));
          }
          const library = contentLibrary();
          if (library && existsSync(join(library, 'library.json'))) {
            add('content', rowsFromLibrary(readJson(join(library, 'library.json'), {}), (file) => (isAbsolute(String(file)) && inside(String(file), library) ? safeRead(String(file)) : '')));
          }
        }
      }
      // Research packets beside the saved reports.
      if (harvestOn('research')) {
        const dir = reportsFolder();
        let names = [];
        try {
          names = dir ? readdirSync(dir).filter((one) => one.endsWith('.md.packet')).slice(0, 400) : [];
        } catch {
          names = [];
        }
        for (const one of names) {
          const packet = readJson(join(dir, one, 'packet.json'), null);
          if (packet) add('research', rowsFromPacket(packet, { report: one.replace(/\.md\.packet$/, '') }));
        }
      }
      // Mission runs: checked items (code), the cheapest model that passed (the work loop).
      if (harvestOn('code') || harvestOn('loop')) {
        const runsFile = typeof home === 'function' ? join(home('mission'), 'runs.jsonl') : '';
        const lines = runsFile ? readLines(runsFile).slice(-300) : [];
        const allowed = new Map();
        try {
          const found = await readable();
          for (const record of found.read) allowed.set(record.id, record.mode);
        } catch { /* nothing allowed */ }
        const done = new Set(store.state().runs ?? []);
        for (const entry of lines) {
          if (!entry?.id || done.has(entry.id)) continue;
          const folderPath = trimSlash(entry.folder);
          // Only a run of a conversation that may be read (never Recon's, never one with an export).
          if (!folderPath || inReconRoom(folderPath) || typeof entry.conversation !== 'string' || !allowed.has(entry.conversation)) continue;
          const runDir = join(folderPath, '.dsh-mission', 'runs', String(entry.id));
          const runJson = readJson(join(runDir, 'run.json'), null);
          if (!runJson) continue;
          const tab = allowed.get(entry.conversation) || 'other';
          const rows = rowsFromRun({ run: runJson, log: readLines(join(runDir, 'log.jsonl')), mode: tab, session: entry.conversation });
          const want = rows.filter((row) => (row.kind === 'router' ? harvestOn('loop') : harvestOn('code')));
          add(tab === 'code' ? 'code' : 'loop', want);
          done.add(entry.id);
        }
        store.setState({ runs: [...done].slice(-2000) });
      }
      // Bench: devices whose read was checked.
      if (harvestOn('bench')) {
        const devices = join(benchFolder(), 'devices');
        let slugs = [];
        try {
          slugs = readdirSync(devices).slice(0, 500);
        } catch {
          slugs = [];
        }
        const cards = slugs.map((slug) => {
          const card = readJson(join(devices, slug, 'card.json'), null);
          return card ? { ...card, slug } : null;
        }).filter(Boolean);
        add('bench', rowsFromBench(cards, (card) => {
          const backups = readJson(join(devices, card.slug, 'backups.json'), []);
          if (Array.isArray(backups) && backups.some((entry) => entry?.verified === true)) return true;
          return /- Check: passed/.test(safeRead(join(devices, card.slug, 'logbook.md'), 500_000));
        }));
      }
      // Creator Plus's finished builds, when it keeps them.
      if (harvestOn('creator') && typeof home === 'function') {
        const dir = join(home('creator-plus'), 'builds');
        let files = [];
        try {
          files = readdirSync(dir).filter((one) => one.endsWith('.json')).slice(-300);
        } catch {
          files = [];
        }
        add('creator', rowsFromCreator(files.map((one) => readJson(join(dir, one), null)).filter(Boolean)));
      }
      store.setState({ cursor, lastHarvest: summary });
      refreshSets();
      return summary;
    })();
    try {
      return await harvesting;
    } finally {
      harvesting = undefined;
    }
  };

  // ---- sets (T3) ---------------------------------------------------------------------------------------

  const refreshSets = () => {
    const used = {};
    for (const entry of store.shelf().entries ?? []) for (const set of entry.sets) (used[set] ??= []).push(`${entry.name} (${entry.state})`);
    const sets = buildSets(store.rows(), { ...rules(), used });
    store.saveSets({ at: now(), sets });
    return sets;
  };
  const setsNow = () => store.sets().sets ?? {};
  const rowsOfSets = (ids) => {
    const sets = setsNow();
    const wanted = new Set(ids.flatMap((id) => sets[id]?.ids ?? []));
    // Skill first, adapter later (step 15): the taught skills' loading left out (only while the skills part is on).
    const rows = store.rows().filter((row) => wanted.has(row.id));
    const trainer = skillsPart.forTrainer(rows);
    // Rows that became alike once a taught skill's loading is left out train once.
    return trainer === rows ? rows : dropRepeats(trainer).kept;
  };
  /** The exam with every row that repeats a pool row (the same text, or nearly) left out. */
  const examNow = () => examApart(store.exam(), store.rows());
  /** Exam rows that fit a goal's sets (the same rules as the sets: by kind and mode). */
  const examFor = (ids) => {
    const specs = ids.map((id) => TASK_SETS[id]).filter(Boolean);
    const subjects = ids.filter((id) => id.startsWith('subject-'));
    // Kept apart from training as the trainer will see both (a taught skill's loading left out of each).
    const all = store.rows();
    const pool = skillsPart.forTrainer(all);
    const exam = pool === all ? examNow() : examApart(skillsPart.forTrainer(store.exam()), pool);
    return exam.filter((row) => specs.some((spec) => spec.takes(row)) || subjects.some((id) => `subject-${String(row.from?.subject ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` === id));
  };
  const lines = (list) => (list.length > 0 ? `${list.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
  const writeSet = (id, purpose) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    const set = setsNow()[id];
    if (!set) throw new Error('There is no such set.');
    const out = trainerRows(rowsOfSets([id]), { ...rules(), purpose: purpose ?? set.purpose });
    const dir = store.folder('exports', `${id}-${new Date(now()).toISOString().slice(0, 10)}`);
    const root = store.root();
    writeText(join(dir, 'train.jsonl'), lines(out.train), root);
    writeText(join(dir, 'valid.jsonl'), lines(out.valid), root);
    if (out.pairs.length > 0) writeText(join(dir, 'pairs.jsonl'), lines(out.pairs), root);
    writeJson(join(dir, 'flags.json'), { set: id, name: set.name, rows: set.rows, mayTrain: set.mayTrain, notTrain: set.notTrain, purpose: purpose ?? set.purpose, written: new Date(now()).toISOString(), note: 'Only rows that may train are in train.jsonl and valid.jsonl. Exam rows are never in a set.' }, root);
    return { dir, train: out.train.length, valid: out.valid.length, pairs: out.pairs.length, left: out.left };
  };

  // ---- the exam (T2) and its gate on rungs 1 to 3 (T4) ---------------------------------------------------

  /**
   * Answer exam rows with a model in the app (and optional instructions in front). Each answer is counted in
   * the caller's allowance when it keeps one (Self-improve's), and checked against it first.
   */
  const answerByRoute = (route, instructions = '', signal, budget) => async (row) => {
    try {
      budget?.check?.();
    } catch (error) {
      if (error && typeof error === 'object') error.stopsExam = true;
      throw error;
    }
    const prompt = asText(promptOf(row), instructions);
    let counted = false;
    const text = await askModel(route, prompt, signal, (tokens) => {
      counted = true;
      budget?.add?.(tokens);
    });
    if (!counted) budget?.add?.(Math.ceil((prompt.length + String(text ?? '').length) / 4));
    return text;
  };
  const canaryTasks = () => {
    try {
      const list = ctx.get('benchmark')?.canaries?.();
      return Array.isArray(list) && list.length > 0 ? list : undefined;
    } catch {
      return undefined;
    }
  };
  const gradeCanary = (grader, text) => {
    const value = String(text ?? '');
    const expect = String(grader?.expect ?? '');
    if (grader?.type === 'exact') return value.trim() === expect.trim();
    if (grader?.type === 'contains') return value.toLowerCase().includes(expect.toLowerCase());
    if (grader?.type === 'regex') {
      try {
        return new RegExp(expect, 'i').test(value);
      } catch {
        return false;
      }
    }
    return false;
  };
  const runCanaries = async (answer) => {
    const tasks = canaryTasks();
    if (!tasks) return undefined;
    let passed = 0;
    for (const task of tasks) {
      let text = '';
      try {
        text = await answer({ kind: 'canary', input: [{ role: 'user', content: task.prompt }] });
      } catch {
        text = '';
      }
      if (gradeCanary(task.grader, text)) passed += 1;
    }
    return { total: tasks.length, passed, rate: passed / tasks.length };
  };
  /**
   * The exam gate on rungs 1 to 3 (Self-improve's changes, Learned skills' skills): is the changed set of
   * instructions not worse on the owner's exam than today's? Undefined when Tuning Plus is off, the model
   * is not known, or the exam has fewer than EXAM_MIN rows: then the add-on decides as it always did.
   * @param {{route: {provider: string, model: string}, before?: string, after: string, signal?: AbortSignal}} input
   * @returns {Promise<{ok: boolean, before: object, after: object, why: string} | undefined>}
   */
  const examGate = async ({ route, before = '', after, signal, budget }) => {
    if (!enabled() || !route?.provider || !route?.model) return undefined;
    // A model that does not count as this Mac is examined only on rows written in conversations with that
    // same provider: rows that never left this Mac are not sent out for an exam.
    const outside = !onThisMac(route.provider);
    const rows = examNow().filter((row) => ['label', 'answer', 'qa', 'pair', 'toolcalls', 'toolfix'].includes(row.kind) && (!outside || row.by?.provider === route.provider)).slice(-examLimit());
    if (rows.length < EXAM_MIN) return undefined;
    const today = await runExam({ rows, answer: answerByRoute(route, before, signal, budget), limit: rows.length, signal });
    const changed = await runExam({ rows, answer: answerByRoute(route, after, signal, budget), limit: rows.length, signal });
    const ok = changed.rate >= today.rate - 0.02;
    return { ok, before: today, after: changed, why: ok ? `${pct(changed.rate)} on the owner's exam against ${pct(today.rate)} with today's instructions` : `worse on the owner's exam: ${pct(changed.rate)} against ${pct(today.rate)} with today's instructions` };
  };

  // ---- training, the shelf, serving (T5, T6, T8, T9, T13) ------------------------------------------------

  let active;
  const servers = new Map();
  /** The least free disk space a training run starts with. */
  const MIN_FREE = 2e9;
  const cards = () => store.cards();
  const addCard = (card) => {
    const all = cards();
    if (card.key && all.never.includes(card.key)) return undefined;
    const entry = { id: `K${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: now(), ...card };
    all.cards = [entry, ...all.cards.filter((one) => !(card.key && one.key === card.key && !one.done))].slice(0, 200);
    store.saveCards(all);
    return entry;
  };
  /** Answer exam rows with a local MLX model (and an adapter), through the fixed script, in a folder of its own. */
  const answerLocal = async ({ model, adapter, rows, signal }) => {
    const stamp = `${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const work = store.folder('work', `ask-${stamp}`);
    const input = join(work, 'in.jsonl');
    const output = join(work, 'out.jsonl');
    writeText(input, lines(rows.map((row) => ({ id: row.id, messages: promptOf(row) }))), store.root());
    try {
      const result = await py({ python: python(), args: answerArgs({ model, adapter, input, output, maxTokens: 256 }), timeoutMs: 60 * 60_000, signal });
      if (result.code !== 0) throw new Error(`the model could not answer (${result.stopped || result.tail.slice(-2).join(' ').slice(0, 200)})`);
      return new Map(readLines(output).map((line) => [line.id, String(line.text ?? '')]));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
  const localExam = async ({ model, adapter, rows, signal, leaveOut }) => {
    const answers = await answerLocal({ model, adapter, rows, signal });
    return runExam({ rows, answer: async (row) => answers.get(row.id) ?? '', limit: rows.length, leaveOut });
  };
  const localCanaries = async ({ model, adapter, signal }) => {
    const tasks = canaryTasks();
    if (!tasks) return undefined;
    const rows = tasks.map((task) => ({ id: `canary-${task.id}`, kind: 'canary', input: [{ role: 'user', content: task.prompt }] }));
    const answers = await answerLocal({ model, adapter, rows, signal });
    const passed = tasks.filter((task) => gradeCanary(task.grader, answers.get(`canary-${task.id}`))).length;
    return { total: tasks.length, passed, rate: passed / tasks.length };
  };

  /**
   * One run from the bar (or the night shift): look only, a proposal for the lowest rung, or a trained candidate.
   * @param {{model: string, goal: string, sets?: string[], method?: string, minutes?: number, lookOnly?: boolean, settings?: object, by?: string}} input
   */
  /**
   * Whether the work is one kind of job that comes up only sometimes (its rows are under a quarter of the
   * rows of their tabs): then a skill fits better than instructions. Only while the skills part is on.
   */
  const skillHint = (setRows) => {
    if (!skillsOn() || !Array.isArray(setRows) || setRows.length === 0) return {};
    const modes = new Set(setRows.map((row) => row.mode));
    const all = store.rows().filter((row) => modes.has(row.mode)).length;
    return { skills: true, sometimes: all > 0 && setRows.length / all < 0.25 };
  };
  const startRun = async (input, { signal: outer, stopIf } = {}) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    if (active) throw new Error(`A run is going: ${active.sentence}`);
    // Also while an exam winds down after the skills part was switched off (with no exam this never refuses).
    if (skillsPart.examRunning()) throw new Error('A skill exam is running on this Mac; start the run when it is done (or stop it on the page).');
    const goal = GOALS[input.goal] ? input.goal : 'find';
    const sets = (Array.isArray(input.sets) && input.sets.length > 0 ? input.sets : GOALS[goal].sets).filter((id) => setsNow()[id] || TASK_SETS[id]).slice(0, 10);
    const minutes = Math.min(24 * 60, Math.max(0, Math.round(Number(input.minutes) || 0)));
    const sentence = runSentence({ model: input.model, goal, sets, method: input.method ?? 'auto', minutes, lookOnly: input.lookOnly === true, setNames: Object.fromEntries(Object.entries(setsNow()).map(([id, set]) => [id, set.name])) });
    const abort = new AbortController();
    outer?.addEventListener?.('abort', () => abort.abort(outer.reason), { once: true });
    const id = `R${now().toString(36)}`;
    active = { id, sentence, started: now(), phase: 'starting', abort, by: input.by ?? 'page' };
    // The night shift's stop rule holds for the whole run (every exam, the canaries, training), checked
    // before each step and every 30 seconds while one runs.
    const checkStop = async () => {
      if (stopIf && !abort.signal.aborted) {
        const why = await stopIf();
        if (why) abort.abort(new Error(why));
      }
      if (abort.signal.aborted) throw abort.signal.reason instanceof Error ? abort.signal.reason : new Error('stopped');
    };
    const stopTimer = stopIf ? setInterval(() => void checkStop().catch(() => {}), 30_000) : undefined;
    stopTimer?.unref?.();
    const job = (async () => {
      const setRows = rowsOfSets(sets);
      const purpose = sets.some((one) => (TASK_SETS[one]?.purpose ?? setsNow()[one]?.purpose) === 'open') ? 'open' : 'narrow';
      const trainable = setRows.filter((row) => mayTrain(row, { ...rules(), purpose }).ok);
      const exam = examFor(sets);
      // Look only: what it would do, and what the exam says today; it trains nothing.
      if (input.lookOnly === true || goal === 'find' || GOALS[goal].kind === 'retrieval') {
        active.phase = 'looking';
        const proposal = proposeRung({ failures: [], tried: [], setRows: trainable.length, kind: trainable[0]?.kind ?? '', ...skillHint(setRows) });
        return addCard({ kind: 'look', title: `Look only: ${GOALS[goal].name}`, text: `${sentence}\nSets: ${sets.map((one) => `${setsNow()[one]?.name ?? one} (${setsNow()[one]?.rows ?? 0} rows, ${setsNow()[one]?.mayTrain ?? 0} may train)`).join('; ') || 'none yet'}. Exam rows that fit: ${exam.length}.\nThe lowest rung that could help: ${proposal.home === 'skill' ? `a skill, between rungs 1 and 2 (${proposal.why}). Make one under Skills on this page, or ask for one in a conversation` : `${proposal.rung}, ${RUNGS[proposal.rung].name} (${proposal.why})`}.${GOALS[goal].kind === 'retrieval' ? '\nKnow a subject: facts are best looked up; build retrieval from the subject\'s reports first.' : ''}`, key: `look-${goal}-${sets.join(',')}` });
      }
      const method = String(input.method ?? 'auto');
      const auto = method === 'auto' ? proposeRung({ failures: [], tried: (input.tried ?? []).map(Number), setRows: trainable.length, kind: trainable[0]?.kind ?? '', flat: [1, 2, 3].filter(() => input.flat === true), ...skillHint(setRows) }) : undefined;
      const rung = auto ? auto.rung : Number(method);
      if (auto?.home === 'skill') {
        return addCard({ kind: 'proposal', title: `${SKILL_HOME.name}: between rungs 1 and 2`, text: `${sentence}\nThe cheapest home is a skill: ${SKILL_HOME.what}. ${auto.why}. Make one under Skills on this page (New skill, or Look for skill ideas), or ask for one in a conversation; it takes its exam before you decide.`, key: `rung-skill-${goal}` });
      }
      if (rung <= 3) {
        return addCard({ kind: 'proposal', title: `Rung ${rung}: ${RUNGS[rung].name}`, text: `${sentence}\nThe lowest rung that could help is ${RUNGS[rung].name}: ${RUNGS[rung].what}. It lives in ${RUNGS[rung].where}${rung === 0 ? '' : ', which Tuner Plus examines with your exam before you approve a change'}.`, key: `rung-${rung}-${goal}` });
      }
      // Rung 4 or 5: train a candidate on this Mac.
      const problem = pythonProblem(python()) || modelProblem(modelPaths()[input.model]);
      if (problem) throw new Error(problem);
      const base = modelPaths()[input.model];
      if (trainable.length < 20) throw new Error(`The sets have ${trainable.length} rows that may train; a candidate needs at least 20 (an adapter is worth it from about ${ADAPTER_MIN}).`);
      if (exam.length < EXAM_MIN) throw new Error(`The exam has ${exam.length} rows for these sets; it needs at least ${EXAM_MIN} before anything can be judged.`);
      const free = (standIns.freeBytes ?? freeBytes)(store.root());
      if (free !== undefined && free < MIN_FREE) throw new Error(`There is too little free disk space for a training run (${Math.round(free / 1e9)} GB free; at least ${MIN_FREE / 1e9} GB).`);
      const entryId = `A${now().toString(36)}`;
      const dir = store.folder('shelf', entryId);
      const data = store.folder('shelf', entryId, 'data');
      if (inside(dir, base)) throw new Error('Tuner Plus\'s folder is inside the base model\'s folder; pick another folder, so the base model is never changed.');
      const out = trainerRows(trainable, { ...rules(), purpose });
      writeText(join(data, 'train.jsonl'), lines(out.train), store.root());
      writeText(join(data, 'valid.jsonl'), lines(out.valid), store.root());
      const before = fingerprint(base);
      await checkStop();
      active.phase = 'exam before';
      const examRows = exam.slice(-examLimit());
      const today = await localExam({ model: base, rows: examRows, signal: abort.signal });
      await checkStop();
      const canaryToday = await localCanaries({ model: base, signal: abort.signal }).catch(() => undefined);
      await checkStop();
      active.phase = 'training';
      let progress = {};
      const budget = Math.max(5, minutes || 60) * 60_000;
      const trained = await py({ python: python(), args: trainArgs({ model: base, data, adapter: join(dir, 'adapter'), settings: input.settings }), timeoutMs: budget, signal: abort.signal, onLine: (line) => { const step = progressOf(line); if (step) progress = { ...progress, ...step }; active.progress = progress; } });
      // The checkpoints written along the way are not needed once the adapter is there.
      try {
        for (const name of readdirSync(join(dir, 'adapter'))) if (CHECKPOINT.test(name)) rmSync(join(dir, 'adapter', name), { force: true });
      } catch { /* no adapter folder */ }
      const unchanged = fingerprint(base) === before;
      const entry = newEntry({ id: entryId, kind: rung === 5 ? 'specialist' : 'adapter', name: `${GOALS[goal].name} · ${input.model}`, base: { model: input.model, path: base }, sets, rows: out.train.length + out.valid.length, goal, at: now(), files: join(dir, 'adapter'), trainer: { iters: progress.iter ?? 0, seconds: trained.seconds, loss: progress.loss } });
      const shelf = store.shelf();
      shelf.entries = [entry, ...(shelf.entries ?? [])];
      if (!unchanged) warn('the base model\'s files changed during training: that must not happen; the candidate is marked failed');
      if (trained.code !== 0 || !existsSync(join(dir, 'adapter', 'adapters.safetensors')) || !unchanged) {
        recordExam(shelf, entryId, { before: today, after: null, canaryBefore: canaryToday, canaryAfter: null, decision: { ok: false, why: !unchanged ? 'the base model\'s files changed during training' : trained.stopped || `training failed: ${trained.tail.slice(-2).join(' ').slice(0, 200)}` } }, now());
        store.saveShelf(shelf);
        return addCard({ kind: 'candidate', title: `Not finished: ${entry.name}`, text: `${sentence}\nTraining stopped: ${!unchanged ? 'the base model\'s files changed during training (they must never change), so the candidate is not used' : trained.stopped || 'it failed'}. Nothing was offered.`, entry: entryId });
      }
      // From here the candidate is on the shelf: a stop or a failure is recorded on it, never left half done.
      let after;
      let canaryAfter;
      try {
        await checkStop();
        active.phase = 'exam after';
        after = await localExam({ model: base, adapter: join(dir, 'adapter'), rows: examRows, signal: abort.signal, leaveOut: entryId });
        await checkStop();
        canaryAfter = await localCanaries({ model: base, adapter: join(dir, 'adapter'), signal: abort.signal }).catch(() => undefined);
        await checkStop();
      } catch (error) {
        const why = String(error?.message ?? error).slice(0, 200);
        recordExam(shelf, entryId, { before: today, after: null, canaryBefore: canaryToday, canaryAfter: null, decision: { ok: false, why: `not examined: ${why}` } }, now());
        store.saveShelf(shelf);
        return addCard({ kind: 'candidate', title: `Not finished: ${entry.name}`, text: `${sentence}\nStopped before its exam was done (${why}). Nothing was offered.`, entry: entryId });
      }
      const decision = promotable({ before: today, after, canaryBefore: canaryToday, canaryAfter });
      recordExam(shelf, entryId, { before: today, after, canaryBefore: canaryToday, canaryAfter, decision }, now());
      store.saveShelf(shelf);
      refreshSets();
      return addCard({ kind: 'candidate', title: `${decision.ok ? 'Ready for your yes' : 'Did not pass'}: ${entry.name}`, text: `${sentence}\nOn its exam (${after.total} rows of your own work): ${after.passed} right now against ${today.passed} with the model as it is (${pct(after.rate)} against ${pct(today.rate)}).${canaryAfter ? ` General canaries: ${canaryAfter.passed} of ${canaryAfter.total} (before: ${canaryToday?.passed ?? '?'}).` : ' The canaries could not be run (the Benchmark add-on is off).'}\n${decision.why}.`, entry: entryId, buttons: decision.ok ? ['taste', 'promote', 'later', 'never'] : ['later', 'never'] });
    })();
    active.job = job;
    try {
      return await job;
    } finally {
      if (stopTimer) clearInterval(stopTimer);
      active = undefined;
      try {
        pruneShelf();
      } catch (error) {
        warn(`could not let old shelf entries go: ${String(error?.message ?? error)}`);
      }
    }
  };
  /**
   * Let old entries go (their adapter, data and fused copy too): candidates and failed ones beyond the newest
   * ten or older than 30 days. Never an entry the owner promoted, switched on or off, or one being served.
   */
  const pruneShelf = () => {
    const shelf = store.shelf();
    const stale = staleEntries(shelf, { at: now() }).filter((entry) => !servers.has(entry.id) && /^A[a-z0-9]{4,20}$/.test(entry.id));
    if (stale.length === 0) return 0;
    const gone = new Set(stale.map((entry) => entry.id));
    for (const entry of stale) {
      for (const part of ['shelf', 'models']) {
        const path = store.path(part, entry.id);
        try {
          if (existsSync(path) && !lstatSync(path).isSymbolicLink() && inside(path, store.root())) rmSync(path, { recursive: true, force: true });
        } catch { /* left for next time */ }
      }
    }
    shelf.entries = shelf.entries.filter((entry) => !gone.has(entry.id));
    store.saveShelf(shelf);
    return gone.size;
  };
  const stopRun = () => {
    if (!active) return false;
    active.abort.abort(new Error('stopped by the owner'));
    return true;
  };

  /** A port on 127.0.0.1 that nothing listens on (one of 18080 to 18099), or undefined. */
  const freePort = async () => {
    const taken = new Set([...servers.values()].map((one) => one.port));
    for (let port = 18080; port < 18100; port += 1) {
      if (taken.has(port)) continue;
      const free = standIns.portFree ? await standIns.portFree(port) : await new Promise((done) => {
        const probe = createServer();
        probe.once('error', () => done(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
      });
      if (free) return port;
    }
    return undefined;
  };
  /** Serve an adapter: a fused copy (any MLX server serves it) or mlx-lm's own server on this Mac. */
  const serve = async (entryId, way) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    const shelf = store.shelf();
    const entry = shelf.entries.find((one) => one.id === entryId);
    if (!entry) throw new Error('There is no such entry on the shelf.');
    if (!entry.exam?.decision?.ok) throw new Error('Only an entry that passed its exam is served.');
    const problem = pythonProblem(python()) || modelProblem(entry.base.path);
    if (problem) throw new Error(problem);
    if (way === 'fused') {
      // A fused copy is as large as the base model: there must be room for it first.
      const need = folderBytes(entry.base.path) * 1.1 + 512e6;
      const free = (standIns.freeBytes ?? freeBytes)(store.root());
      if (free !== undefined && free < need) throw new Error(`There is not enough free disk space for a fused copy (${Math.round(free / 1e9)} GB free; it needs about ${Math.ceil(need / 1e9)} GB).`);
      const out = store.folder('models', entryId);
      const done = await py({ python: python(), args: fuseArgs({ model: entry.base.path, adapter: entry.files, out }), timeoutMs: 2 * 60 * 60_000 });
      if (done.code !== 0) throw new Error(`The copy could not be made: ${done.tail.slice(-2).join(' ').slice(0, 200)}`);
      setServing(shelf, entryId, { way: 'fused', path: out }, now());
      store.saveShelf(shelf);
      return `A fused copy is in ${out}. Point your MLX model server at that folder (it is one more model), add it in Settings → Models, then give its name here.`;
    }
    if (way === 'server') {
      const running = servers.get(entryId);
      if (running) throw new Error(`It is already being served at http://127.0.0.1:${running.port}/v1 (process ${running.pid}).`);
      const port = await freePort();
      if (!port) throw new Error('No port between 18080 and 18099 is free on this Mac.');
      const cwd = emptyFolder();
      const spawnFn = standIns.spawn ?? (await import('node:child_process')).spawn;
      let child;
      try {
        // Isolated, in an empty folder (as every trainer run), on this Mac only.
        child = spawnFn(python(), [ISOLATED, ...serveArgs({ model: entry.base.path, adapter: entry.files, port })], { cwd, env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '', ...OFFLINE_ENV }, stdio: 'ignore', detached: false });
      } catch (error) {
        rmSync(cwd, { recursive: true, force: true });
        throw new Error(`mlx-lm's server could not start: ${String(error?.message ?? error).slice(0, 200)}`);
      }
      // A start that fails (no permission, no file) is an event, not a crash of the app.
      const started = await new Promise((done) => {
        const timer = setTimeout(() => done(Boolean(child.pid)), 3000);
        child.once?.('spawn', () => {
          clearTimeout(timer);
          done(true);
        });
        child.once?.('error', (error) => {
          clearTimeout(timer);
          warn(`mlx-lm's server could not start: ${String(error?.message ?? error)}`);
          done(false);
        });
      });
      child.on?.('error', (error) => warn(`mlx-lm's server: ${String(error?.message ?? error)}`));
      if (!started || !child.pid) {
        rmSync(cwd, { recursive: true, force: true });
        throw new Error('mlx-lm\'s server could not start (is mlx-lm installed in that Python?).');
      }
      servers.set(entryId, { pid: child.pid, port, child });
      child.on?.('exit', () => {
        if (servers.get(entryId)?.pid === child.pid) servers.delete(entryId);
        rmSync(cwd, { recursive: true, force: true });
      });
      setServing(shelf, entryId, { way: 'server', provider: entry.serve?.route?.provider, model: entry.serve?.route?.model, path: `http://127.0.0.1:${port}/v1` }, now());
      store.saveShelf(shelf);
      return `mlx-lm's own server runs on this Mac at http://127.0.0.1:${port}/v1 (process ${child.pid}). Add it as a provider in Settings → Models, then give its model name here. A team role uses it only while this server runs.`;
    }
    throw new Error('Serve it as a fused copy or with mlx-lm\'s own server.');
  };
  const stopServing = (entryId) => {
    const running = servers.get(entryId);
    if (!running?.pid) return false;
    try {
      if (running.child?.kill) running.child.kill('SIGTERM');
      else process.kill(running.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    servers.delete(entryId);
    return true;
  };
  ctx.effect?.(() => () => {
    for (const id of [...servers.keys()]) stopServing(id);
    if (active) active.abort.abort(new Error('the app is closing'));
  }, 'tuning: stop servers and runs');

  // ---- the taste test (T11) ------------------------------------------------------------------------------

  const tasteDir = () => store.folder('taste');
  const recentRequests = async (most = 5, onlyProvider = '') => {
    const found = await readable();
    if (!found.known) throw new Error(found.why);
    const query = ctx.get('sessionQuery');
    const out = [];
    for (const record of found.read.filter((one) => one.top === one.id).slice(-60).reverse()) {
      if (out.length >= most) break;
      try {
        const log = await query.readSession(record.id);
        if (exportIn(log.events)) continue;
        const turn = turnsOf(log.events, log.inheritedEventCount).filter((one) => one.request && one.end === 'completed' && !one.corrected && !one.closed && (!onlyProvider || one.by?.provider === onlyProvider)).at(-1);
        if (turn) out.push({ id: record.id, text: turn.request, mode: record.mode });
      } catch { /* skip */ }
    }
    return out;
  };
  const startTaste = async (entryId, currentRoute) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    const shelf = store.shelf();
    const entry = shelf.entries.find((one) => one.id === entryId);
    if (!entry?.exam?.decision?.ok) throw new Error('Only a candidate that passed its exam gets a taste test.');
    if (!currentRoute?.provider || !currentRoute?.model) throw new Error('Pick the model in use for the taste test.');
    // A model in use that does not count as this Mac is asked again only requests written to that same provider.
    const outside = !onThisMac(currentRoute.provider);
    const requests = await recentRequests(5, outside ? currentRoute.provider : '');
    if (requests.length === 0) throw new Error(outside ? `There are no recent requests made to ${currentRoute.provider} to answer again yet (requests made to other models are not sent to it).` : 'There are no recent requests to answer again yet.');
    const current = [];
    for (const request of requests) current.push(await askModel(currentRoute, request.text).catch(() => ''));
    const answers = await answerLocal({ model: entry.base.path, adapter: entry.files, rows: requests.map((request, index) => ({ id: `t${index}`, kind: 'answer', input: [{ role: 'user', content: request.text }] })) });
    // Each side keeps its real writer: the model in use, and the candidate (the base model with the adapter, here).
    const round = newRound({ requests, current, candidate: requests.map((_request, index) => answers.get(`t${index}`) ?? ''), entry: entryId, at: now(), writers: { current: { provider: currentRoute.provider, model: currentRoute.model }, candidate: { provider: 'mlx-local', model: entry.base.model } } });
    writeJson(join(tasteDir(), `${round.id}.json`), round);
    return roundView(round);
  };
  const pickTaste = (roundId, n, pick) => {
    if (!/^T[a-z0-9]{4,20}$/.test(String(roundId))) throw new Error('There is no such taste test.');
    const file = join(tasteDir(), `${roundId}.json`);
    const round = readJson(file, null);
    if (!round) throw new Error('There is no such taste test.');
    recordPick(round, n, pick);
    writeJson(file, round);
    const view = roundView(round);
    if (view.done) {
      keep('taste', pairsOf(round));
      const result = tally(round);
      addCard({ kind: 'taste', title: `Taste test: you preferred ${result.prefers === 'candidate' ? 'the candidate' : result.prefers === 'current' ? 'the model in use' : 'neither'}`, text: `${result.candidate} for the candidate, ${result.current} for the model in use, ${result.same} the same. Your picks were kept as preference pairs.`, entry: round.entry, buttons: result.prefers === 'candidate' ? ['promote', 'later', 'never'] : ['later', 'never'] });
    }
    return view;
  };

  // ---- lessons (T7) --------------------------------------------------------------------------------------

  const toolDefs = () => {
    try {
      const tools = ctx.get('tools');
      const list = tools?.list?.() ?? tools?.definitions?.() ?? [];
      return Array.isArray(list) ? list.filter((tool) => tool?.name) : [];
    } catch {
      return [];
    }
  };
  /** The plugin a tool belongs to, by its registration when the app says, else by its name. */
  const pluginOf = (tool) => {
    const def = toolDefs().find((one) => one.name === tool);
    if (def?.plugin) return String(def.plugin);
    const prefix = /^([a-z]+)_/.exec(tool)?.[1];
    if (!prefix || prefix === 'recon') return '';
    return `dsh-${prefix}`;
  };
  const buildLessons = () => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    const defs = new Map(toolDefs().map((tool) => [tool.name, tool.parameters ?? tool.inputSchema]));
    const lookups = { schemaOf: (tool) => defs.get(tool), pluginOf };
    // Lessons from training rows train; lessons from exam rows stay in the exam: a lesson keeps its row's side.
    const fromPool = lessonsFrom(store.rows().filter((row) => row.kind === 'toolcalls').map((row) => ({ ...row, exam: false })), lookups);
    const fromExam = lessonsFrom(store.exam().filter((row) => row.kind === 'toolcalls').map((row) => ({ ...row, exam: true })), lookups);
    const written = {};
    for (const [plugin, rows] of Object.entries(fromPool)) {
      if (!/^[a-z0-9@/_.-]{1,80}$/i.test(plugin)) continue;
      const safe = plugin.replace(/[^a-z0-9._-]+/gi, '-');
      const dir = store.folder('lessons', safe);
      writeText(join(dir, 'lessons.jsonl'), lines(rows), store.root());
      // Into Creator Plus's passport for that plugin, when one exists (never into an installed add-on's folder),
      // and only when that folder really is inside Creator Plus's own folder.
      const creatorHome = typeof home === 'function' ? home('creator-plus') : '';
      const passport = creatorHome ? join(creatorHome, 'passports', safe) : '';
      if (passport && existsSync(passport) && !lstatSync(passport).isSymbolicLink()) {
        try {
          const lessonsDir = folderIn(passport, 'lessons');
          writeText(join(lessonsDir, 'lessons.jsonl'), lines(rows), creatorHome);
        } catch (error) {
          warn(`could not write lessons into a passport: ${String(error?.message ?? error)}`);
        }
      }
      keep('lessons', rows);
      written[plugin] = rows.length;
    }
    for (const rows of Object.values(fromExam)) keep('lessons', rows);
    // A plugin added or changed: the harness adapter is due for a rebuild.
    const key = toolsKey(toolDefs());
    const had = store.state().toolsKey;
    if (had && key && had !== key) {
      const shelf = store.shelf();
      if (markDue(shelf, 'a plugin was added or changed', now()) > 0) {
        store.saveShelf(shelf);
        addCard({ kind: 'due', title: 'The harness adapter is due for a rebuild', text: 'A plugin was added or changed since it was trained; its lessons join the harness set. Rebuild it from the bar when you like.', key: `due-${key.length}` });
      }
    }
    if (key) store.setState({ toolsKey: key });
    return written;
  };

  // ---- question-and-answer rows (T12) ------------------------------------------------------------------

  const buildQa = async ({ signal, most = 20 } = {}) => {
    if (!enabled()) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus.');
    const route = teacherRoute();
    if (!route) throw new Error('Pick the teacher model on Settings → Tuner Plus first.');
    if (!onThisMac(route.provider) && plain(config?.teacherCloud) !== true) throw new Error('The teacher model does not run on this Mac; tick "A teacher on the internet may read rows" first, or pick a model on this Mac.');
    const passages = [];
    const dir = reportsFolder();
    let names = [];
    try {
      names = dir ? readdirSync(dir).filter((one) => one.endsWith('.md.packet')).slice(-40) : [];
    } catch {
      names = [];
    }
    const done = new Set(store.state().qaDone ?? []);
    for (const one of names) {
      const packet = readJson(join(dir, one, 'packet.json'), null);
      for (const claim of packet?.claims ?? []) {
        const key = `${one}:${claim.id}`;
        if (claim.read !== 'read' || !claim.passage || done.has(key)) continue;
        passages.push({ text: claim.passage, source: String(packet.sources?.find?.((source) => source.n === claim.source)?.url ?? ''), subject: one.replace(/\.md\.packet$/, ''), key });
      }
    }
    // The teacher wrote the questions and answers: its provider's rules apply to them.
    const result = await qaRows({ passages, ask: (prompt) => askModel(route, prompt, signal), check: (prompt) => askModel(route, prompt, signal), most, signal, by: route });
    keep('research', result.rows);
    store.setState({ qaDone: [...done, ...passages.slice(0, most).map((passage) => passage.key)].slice(-5000) });
    refreshSets();
    return result;
  };

  // ---- the night shift (T10) -----------------------------------------------------------------------------

  const machine = async () => {
    const power = await run(POWER[0], POWER[1]).catch(() => ({ stdout: '' }));
    const idle = await run(IDLE[0], IDLE[1]).catch(() => ({ stdout: '' }));
    return { power: onPower(power.stdout), idle: idleSeconds(idle.stdout) };
  };
  let nightBusy = false;
  const nightTick = async () => {
    if (nightBusy || !enabled()) return;
    const { power, idle } = await machine();
    // A skills run or a skill exam going: the night waits for it (it is not a lost night).
    const may = mayWork({ on: plain(config?.nightShift) === true, power, idle, idleMinutes: Math.max(1, Number(plain(config?.idleMinutes)) || 15), busy: Boolean(active || harvesting || skillsPart.examRunning()) });
    if (!may.ok) return;
    const today = new Date(now()).toISOString().slice(0, 10);
    if (store.state().nightDone === today) return;
    nightBusy = true;
    const notes = [];
    // Before every step: the Mac on power and unused; the night stops the moment it is used.
    const stopped = async () => mustStop(await machine());
    let why = '';
    try {
      const steps = [
        async () => {
          const summary = await harvest();
          notes.push(`Gathered: ${Object.entries(summary.modes).map(([mode, slot]) => `${mode} ${slot.kept} rows (${slot.exam} to the exam)`).join(', ') || 'nothing new'}.`);
        },
        async () => {
          if (!teacherRoute() || !harvestOn('research')) return;
          const qa = await buildQa({ most: 10 }).catch((error) => ({ rows: [], dropped: 0, tried: 0, error }));
          notes.push(qa.error ? `Questions from reference material: not built (${String(qa.error.message).slice(0, 120)}).` : `Questions from reference material: ${qa.rows.length} kept, ${qa.dropped} dropped by the check.`);
        },
        async () => {
          buildLessons();
          const sets = setsNow();
          const biggest = Object.entries(sets).sort((a, b) => b[1].mayTrain - a[1].mayTrain)[0];
          if (biggest) {
            const proposal = proposeRung({ setRows: biggest[1].mayTrain, kind: '' });
            notes.push(`Biggest set: ${biggest[1].name} (${biggest[1].mayTrain} rows may train). Lowest rung that could help: ${RUNGS[proposal.rung].name} (${proposal.why}).`);
          }
        },
        async () => {
          if (plain(config?.nightSkills) !== true || !skillsOn()) return;
          const result = await skillsPart.nightDrafts({ stopped }).catch((error) => ({ ideas: 0, drafted: [], problems: [String(error?.message ?? error)], stopped: '' }));
          notes.push([
            result.drafted.length > 0 ? `Skill drafts: ${result.drafted.map((one) => `${one.name} (exam ${one.exam})`).join(', ')}. They wait under Skills; nothing went live and no skill was changed.` : `Skill drafts: none${result.ideas === 0 ? ' (no skill idea waiting)' : ''}.`,
            result.problems.length > 0 ? `Not drafted: ${result.problems.slice(0, 3).join('; ')}.` : '',
          ].filter(Boolean).join(' '));
        },
        ...(Array.isArray(readObject(config?.nightTrain, [])) ? readObject(config?.nightTrain, []) : []).slice(0, 2).filter((item) => item?.set && item?.model).map((item) => async () => {
          const result = await startRun({ model: item.model, goal: Object.entries(GOALS).find(([, goal]) => goal.sets.includes(item.set))?.[0] ?? 'harness', sets: [item.set], method: '4', minutes: Math.max(10, Number(plain(config?.nightMinutes)) || 120), by: 'night shift' }, { stopIf: stopped }).catch((error) => ({ error }));
          notes.push(result?.error ? `Training ${item.set}: not done (${String(result.error.message).slice(0, 160)}).` : `Training ${item.set}: ${result?.title ?? 'done'}.`);
        }),
      ];
      for (const step of steps) {
        why = await stopped();
        if (why) break;
        await step();
      }
      if (!why) why = await stopped();
      if (why) notes.push(`Stopped: ${why}. The rest waits for another night.`);
      else store.setState({ nightDone: today });
      addCard({ kind: 'night', title: `The night shift, ${today}`, text: notes.join('\n'), buttons: ['later'] });
    } catch (error) {
      warn(`the night shift stopped: ${String(error?.message ?? error)}`);
    } finally {
      nightBusy = false;
    }
  };
  const timer = setInterval(() => void nightTick(), 5 * 60_000);
  timer.unref?.();
  ctx.effect?.(() => () => clearInterval(timer), 'tuning: night shift timer');

  // ---- the service --------------------------------------------------------------------------------------

  const service = Object.freeze({
    apiVersion: 1,
    examGate,
    /** The model address a team role uses for a shelf entry: only while it is switched on and served. */
    adapterRoute(entryId) {
      try {
        return enabled() ? routeOf(store.shelf(), String(entryId ?? ''), { running: (id) => servers.has(id) }) : undefined;
      } catch {
        return undefined;
      }
    },
    /**
     * Each skill's mark (where it came from), for the Cowork sidebar's Skills page: names, files and marks,
     * never a skill's text. Undefined while the skills part is off (the page then shows no marks).
     */
    async skillMarks() {
      try {
        return skillsOn() ? ((await skillsPart.marksList()) ?? undefined) : undefined;
      } catch {
        return undefined;
      }
    },
    /** The shelf's entries a team may name (switched on, served). */
    adapters() {
      try {
        return (store.shelf().entries ?? []).map((entry) => ({ id: entry.id, name: entry.name, state: entry.state, served: Boolean(entry.serve?.route) }));
      } catch {
        return [];
      }
    },
  });
  ctx.effect(() => ctx.provide('tuning', service), 'tuning service');

  // ---- tools in the chat (plain words) -------------------------------------------------------------------

  const approve = standIns.approve ?? (async (exec, reason) => {
    const approval = ctx.get('approval');
    if (!approval?.request || !exec?.agent) return 'unavailable';
    try {
      return await approval.request({ agent: exec.agent, toolName: exec.name, ...(exec.callId ? { callId: exec.callId } : {}), reason, displayReason: { en: reason }, signal: exec.signal });
    } catch {
      return 'unavailable';
    }
  });
  const isolatedAgent = (agent) => {
    try {
      const id = String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');
      return ctx.get('modes')?.isolated?.(id) === true;
    } catch {
      return true;
    }
  };
  const isHelper = (exec) => Boolean(exec?.agent?.header?.parentSession ?? exec?.agent?.session?.header?.parentSession);

  // ---- the skills part (its own switch; off: nothing of it runs, writes or asks) -----------------------
  const skillsOn = () => enabled() && plain(config?.skills) === true;
  const hasCard = (key) => {
    try {
      const all = cards();
      return all.never.includes(key) || all.cards.some((card) => card.key === key);
    } catch {
      return false;
    }
  };
  /** What the skill exam uses of Tuner Plus as it is: its models, the "this Mac" rule, the exam rows, the canaries. */
  const steady = { temperature: 0 };
  const examDeps = {
    models: () => readObject(config?.skillExam),
    here: onThisMac,
    ask: (route, text, signal, spend) => askModel(route, text, signal, spend, steady),
    examRows: () => examNow().filter((row) => ['label', 'answer', 'qa', 'pair', 'toolcalls', 'toolfix'].includes(row.kind)),
    answerRow: (route, instructions, row, signal, spend) => askModel(route, asText(promptOf(row), instructions), signal, spend, steady),
    // A canary run goes on past errors: once the exam is stopped, the canaries left are not asked.
    canaries: (route, instructions, signal, spend) => runCanaries((row) => (signal?.aborted ? Promise.resolve('') : askModel(route, asText(promptOf(row), instructions), signal, spend, steady))),
    busy: () => (active ? active.sentence : ''),
    // The harvest's own check for a Recon export in a conversation (the health count reads none of those).
    exportIn,
  };
  const skillsPart = openSkills({ ctx, store, on: skillsOn, now, warn, addCard, hasCard, readable, exam: examDeps, standIns: standIns.skills ?? {} });
  /**
   * The models the skill exam may use: the app's own list of every provider's models (asked at most once a
   * minute, three seconds per provider at most), and the ones Tuner Plus already knows; each says whether it
   * runs on this Mac (only those can be the floor model).
   */
  let appModelsCache = { at: -Infinity, list: [], pending: null };
  /** Every provider asked at once, three seconds in all; a provider that does not answer by then is left out. */
  const readAppModels = async () => {
    const llm = ctx.get('llm');
    let providersNow = [];
    try {
      providersNow = typeof llm?.listModels === 'function' ? llm?.listProviders?.() ?? [] : [];
    } catch {
      providersNow = [];
    }
    let timer;
    const late = new Promise((done) => {
      timer = setTimeout(() => done('late'), 3000);
      timer.unref?.();
    });
    try {
      const lists = await Promise.all(providersNow.slice(0, 40).map(async (provider) => {
        const id = String(provider?.id ?? '');
        if (!id) return [];
        const models = await Promise.race([Promise.resolve().then(() => llm.listModels(id)).catch(() => []), late]);
        return (Array.isArray(models) ? models.slice(0, 60) : []).filter((model) => model?.id).map((model) => ({ provider: id, model: String(model.id), label: String(model.name ?? model.id) }));
      }));
      return lists.flat();
    } finally {
      clearTimeout(timer);
    }
  };
  /** At most once a minute; the page never waits for it again once a list is there (it is read again behind it). */
  const appModels = async () => {
    if (now() - appModelsCache.at < 60_000) return appModelsCache.list;
    appModelsCache.pending ??= readAppModels().then((list) => {
      appModelsCache = { at: now(), list, pending: null };
      return list;
    }, () => {
      appModelsCache.pending = null;
      return appModelsCache.list;
    });
    return appModelsCache.at === -Infinity ? appModelsCache.pending : appModelsCache.list;
  };
  const examChoices = async () => {
    const seen = new Map();
    for (const one of [...(await appModels()), ...knownModels()]) {
      const key = `${one.provider}/${one.model}`;
      if (!seen.has(key)) seen.set(key, { provider: one.provider, model: one.model, label: one.label ?? one.model, here: onThisMac(one.provider) });
    }
    return [...seen.values()].slice(0, 200);
  };
  /** The skills view with what changes while it is cached: the drafts and the exam. */
  let healthAsked = 0;
  const withExam = async (value) => {
    if (value?.on === true && now() - healthAsked > 3_600_000 && now() - (value.healthAt ?? 0) > 3_600_000) {
      healthAsked = now();
      void skillsPart.refreshHealth().catch((error) => warn(`could not count the skills' uses: ${String(error?.message ?? error)}`));
    }
    return withExamView(value);
  };
  /**
   * Modes' switch for skills per tab (step 14), when that Modes is there: the skills switched off in each tab,
   * set only by the owner's click. Undefined with an older Modes or none.
   */
  const modesSkills = () => {
    try {
      const modes = ctx.get('modes');
      return modes?.apiVersion === 1 && typeof modes.skillsOff === 'function' && typeof modes.setSkillsOff === 'function' ? modes : undefined;
    } catch {
      return undefined;
    }
  };
  /** A tab's skills are proposed for switching off only from at least this many of its conversations. */
  const TAB_OFF_MIN = 10;
  const tabsView = () => {
    const modes = modesSkills();
    if (!modes) return null;
    try {
      return { off: modes.skillsOff(), labels: Object.fromEntries(modes.list().map((one) => [one.id, one.label])), min: TAB_OFF_MIN };
    } catch {
      return null;
    }
  };
  const withExamView = async (value) => (value?.on === true ? { ...value, tabs: tabsView(), drafts: skillsPart.drafts(), exam: { running: skillsPart.examState(), problem: skillsPart.examProblem(), models: skillsPart.examModels(), choices: await examChoices() }, ladder: homes(true).map((step) => ({ n: step.n, name: step.name, what: step.what })), run: skillsPart.skillsRunState(), runTypes: RUN_TYPES } : value);
  // The page looks again every 30 seconds: the list is made again at most every 20 seconds, and at once after an action.
  let skillsCache = { at: 0, value: null };
  const skillsView = async ({ fresh = false } = {}) => {
    if (!skillsOn()) return { on: false };
    if (!fresh && skillsCache.value && now() - skillsCache.at < 20_000) return skillsCache.value;
    try {
      const value = await skillsPart.sync();
      skillsCache = { at: now(), value };
      return value;
    } catch (error) {
      return { on: true, problem: String(error?.message ?? error).slice(0, 300), rows: [], counts: {} };
    }
  };
  const output = { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }] };
  const safely = (work) => async (args, exec) => {
    if (!enabled()) return { text: 'Tuner Plus is switched off in Settings → Tuner Plus.' };
    try {
      return { text: await work(args ?? {}, exec) };
    } catch (error) {
      return { text: `It did not work: ${String(error?.message ?? error).slice(0, 600)}` };
    }
  };
  const statusText = () => {
    const sets = setsNow();
    const exam = store.exam();
    const shelf = store.shelf().entries ?? [];
    return [
      `Data sets: ${Object.values(sets).map((set) => `${set.name} ${set.rows} rows (${set.mayTrain} may train)`).join('; ') || 'none yet (switch harvesting on for a mode on Settings → Tuner Plus)'}.`,
      `Exam: ${exam.length} rows of your own work (never trained on).`,
      `Shelf: ${shelf.map((entry) => `${entry.name} (${entry.state})`).join('; ') || 'empty'}.`,
      active ? `Running now: ${active.sentence} (${active.phase}).` : 'Nothing is running.',
    ].join('\n');
  };
  const tools = [
    {
      name: 'tuning_status',
      description: 'Tuner Plus: what has been gathered (data sets and their rows), the size of the owner\'s private exam, the shelf of adapters and tuned prompts, and what is running. Read only.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: safely(async () => statusText()),
    },
    {
      name: 'tuning_plan',
      description: 'Tuner Plus, look only: for a plain-words request such as "make my model better at my blog posts", say the run in one sentence, which sets it would use, what the exam says today and the lowest rung that could help. Trains nothing.',
      parameters: { type: 'object', properties: { model: { type: 'string', maxLength: 200 }, goal: { type: 'string', enum: Object.keys(GOALS) }, sets: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10 } }, required: ['goal'], additionalProperties: false },
      execute: safely(async (args) => {
        const card = await startRun({ model: String(args.model ?? ''), goal: args.goal, sets: args.sets, lookOnly: true, by: 'chat' });
        return card ? `${card.title}\n${card.text}\nTo train, the owner starts the run from the bar on Settings → Tuner Plus or asks tuning_start.` : 'Nothing to report.';
      }),
    },
    {
      name: 'tuning_start',
      description: 'Tuner Plus: start a run the owner asked for in plain words (train a candidate, or propose the lowest rung). The owner is asked on the app\'s own card with the run in one sentence; nothing is promoted without the exam and the owner\'s yes on the Tuner Plus page.',
      parameters: { type: 'object', properties: { model: { type: 'string', maxLength: 200 }, goal: { type: 'string', enum: Object.keys(GOALS) }, sets: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10 }, method: { type: 'string', enum: ['auto', '1', '2', '3', '4', '5'] }, minutes: { type: 'integer', minimum: 5, maximum: 1440 } }, required: ['model', 'goal'], additionalProperties: false },
      execute: safely(async (args, exec) => {
        if (isHelper(exec)) throw new Error('Only the conversation itself starts a run, with the owner there.');
        const sentence = runSentence({ model: args.model, goal: args.goal, sets: args.sets ?? GOALS[args.goal]?.sets ?? [], method: args.method ?? 'auto', minutes: args.minutes ?? 60 });
        const answer = await approve(exec, `${sentence}\nThis uses this Mac while it runs.`);
        if (answer !== 'allowed-once') throw new Error(answer === 'rejected' ? 'The owner said no.' : `The owner could not be asked (${answer}).`);
        void startRun({ model: args.model, goal: args.goal, sets: args.sets, method: args.method ?? 'auto', minutes: args.minutes ?? 60, by: 'chat' }).catch((error) => addCard({ kind: 'candidate', title: 'The run did not finish', text: String(error?.message ?? error).slice(0, 400) }));
        return `Started: ${sentence} The result comes as a card on Settings → Tuner Plus.`;
      }),
    },
    {
      name: 'tuning_export_set',
      description: 'Tuner Plus: write one data set out as files in the format the trainer reads (train.jsonl, valid.jsonl, pairs.jsonl when it has pairs, and flags.json), in Tuner Plus\'s own folder. Only rows that may train; exam rows never.',
      parameters: { type: 'object', properties: { set: { type: 'string', maxLength: 60 } }, required: ['set'], additionalProperties: false },
      execute: safely(async (args) => {
        const result = writeSet(String(args.set));
        return `Written to ${result.dir}: ${result.train} training rows, ${result.valid} for checking during training${result.pairs ? `, ${result.pairs} preference pairs` : ''}; ${result.left} rows left out because they may not train.`;
      }),
    },
  ];
  /** A skill from plain words (step 8): only while the skills part is on, never in Recon or a helper. */
  /**
   * Whether a skill may be made from this conversation: the harvest's own reading rules, on everything the
   * model has seen (this conversation with the turns a fork copied in, and its helpers' conversations).
   * @returns {Promise<string>} why not, or ''.
   */
  const conversationRefusal = async (exec) => {
    if (isHelper(exec)) return 'Only the conversation itself makes a skill, with the owner there.';
    if (isolatedAgent(exec?.agent)) return 'Never in Recon.';
    const id = String(exec?.agent?.id ?? '');
    const found = await readable();
    if (!found.known) return found.why;
    const left = found.left.find((one) => one.id === id);
    if (left) return `Tuner Plus does not learn from this conversation (${left.why}), so no skill is made from it.`;
    if (!found.read.some((one) => one.id === id)) return 'This conversation is not among the ones Tuner Plus may read, so no skill is made from it.';
    // A helper left out (an export from Recon, marked, trashed) counts against the conversation it reported to.
    const leftHelper = found.left.find((one) => one.top === id && one.id !== id);
    if (leftHelper) return `A helper of this conversation is left out (${leftHelper.why}), so no skill is made from it.`;
    // Every helper is read; with more than can be read, nothing is made (never a check that gives up open).
    const helpers = found.read.filter((one) => one.top === id && one.id !== id).map((one) => one.id);
    if (helpers.length > 100) return 'This conversation has more helpers than Tuner Plus reads (100), so no skill is made from it.';
    for (const one of [id, ...helpers]) {
      const log = await ctx.get('sessionQuery').readSession(one);
      const events = Array.isArray(log?.events) ? log.events : [];
      if (exportIn(events)) return 'This conversation holds an export from Recon, so no skill is made from it.';
      if (turnsOf(events, 0).some((turn) => turn.tools.some((call) => signedInTool(call.name) || closedTool(call.name)))) return `${one === id ? 'This conversation' : 'A helper of this conversation'} used a signed-in source (a connector), or Bench's or Recon's own tools, so no skill is made from it.`;
    }
    return '';
  };
  /** The conversation's own working folder (for "this project"). */
  const conversationFolder = async (exec) => {
    let cwd = '';
    try {
      cwd = String((await ctx.get('workingDirectory')?.ensure?.(exec.agent, exec.signal)) ?? '');
    } catch { /* the conversation's folder below */ }
    return isAbsolute(cwd) ? cwd : String(exec?.agent?.header?.cwd ?? exec?.agent?.session?.header?.cwd ?? '');
  };
  const skillTools = [
    {
      name: 'tuning_skill_draft',
      description: 'Tuner Plus: when the owner asks in plain words for a skill (for example "make a skill for how I want changelogs written", or "make a skill from how we set up the last three plugins"), write it and save it as a draft: a name (lowercase words joined by hyphens), one line saying when it helps, and the steps. It is not live: on Settings → Tuner Plus it takes its exam, the owner reads it, and only the owner puts it live. Never put a password, key or token in it, nor anything from a signed-in source (a connector) or from Recon. When the owner pointed at a page, a document or a repository to build it from, name it as source.',
      parameters: { type: 'object', properties: { name: { type: 'string', maxLength: 64 }, description: { type: 'string', maxLength: 500 }, text: { type: 'string', maxLength: 20000 }, where: { type: 'string', enum: ['project', 'everywhere'] }, source: { type: 'string', maxLength: 500 } }, required: ['name', 'description', 'text'], additionalProperties: false },
      execute: safely(async (args, exec) => {
        if (!skillsOn()) throw new Error('The skills part of Tuner Plus is switched off.');
        // While a run from the bar lasts, only its own skills (the boundary).
        const outside = skillsPart.scopeRefusal(String(args.name ?? ''));
        if (outside) throw new Error(outside);
        const refused = await conversationRefusal(exec);
        if (refused) throw new Error(refused);
        const id = String(exec?.agent?.id ?? '');
        const where = args.where === 'everywhere' ? 'everywhere' : 'project';
        const cwd = await conversationFolder(exec);
        const config = exec?.agent?.session?.requestHeader?.()?.config ?? {};
        const made = await skillsPart.draft({ name: args.name, description: args.description, text: args.text, scope: where, project: where === 'project' ? cwd : '', by: 'model', model: config.provider && config.model ? `${config.provider}/${config.model}` : '', origin: { kind: 'chat', session: id, source: typeof args.source === 'string' ? args.source : '' } });
        return `Saved as a draft: ${made.name} (${made.scope === 'project' ? `for this project, ${made.file}` : 'for everywhere'}). It is not live. On Settings → Tuner Plus, under Skills, the owner runs its exam, reads its whole text and decides.${made.outside ? ' It is marked as built from outside material.' : ''}${made.masked > 0 ? ` ${made.masked} secret${made.masked === 1 ? ' was' : 's were'} masked.` : ''}`;
      }),
    },
    {
      name: 'tuning_skills_run',
      description: 'Tuner Plus, skills: run what its bar runs with the goal "Build or improve a skill". type "check": a health report of the skills named (or of every skill with one mark), changes nothing; "gaps": jobs the owner does often that no skill covers, as idea cards, changes nothing; "new": a model on this Mac writes a new skill as a draft for what the owner described; "improve": better versions of the skills named (the owner\'s own change in place, others get a copy under the same name); "merge": two skills named become one, or one named is split in two; "retire": proposes retiring the named skills not used for 30 days (the owner decides on the card). new, improve and merge are asked first on the app\'s card, write drafts only, and each takes its exam; nothing is used before the owner\'s yes on the page. lookOnly shows and writes nothing. A run reads and changes only the skills it starts with. How often each skill was used is on Settings → Tuner Plus, under Skills. Results come as cards there.',
      parameters: { type: 'object', properties: { type: { type: 'string', enum: ['check', 'gaps', 'new', 'improve', 'merge', 'retire'] }, skills: { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: 60 }, mark: { type: 'string', enum: ['all', ...MARKS] }, what: { type: 'string', maxLength: WHAT_MAX }, where: { type: 'string', enum: ['project', 'everywhere'] }, lookOnly: { type: 'boolean' } }, required: ['type'], additionalProperties: false },
      execute: safely(async (args, exec) => {
        if (!skillsOn()) throw new Error('The skills part of Tuner Plus is switched off.');
        if (isHelper(exec)) throw new Error('Only the conversation itself starts a skills run, with the owner there.');
        if (isolatedAgent(exec?.agent)) throw new Error('Never in Recon.');
        const running = skillsPart.skillsRunState();
        if (running) throw new Error(`A run is going: ${running.sentence} It reads and changes only the skills it started with; wait for it, or stop it on Settings → Tuner Plus.`);
        const type = String(args.type ?? '');
        const where = args.where === 'project' ? 'project' : 'everywhere';
        let project = '';
        if (type === 'new') {
          // The owner's words come from this conversation: the harvest's reading rules hold.
          const refused = await conversationRefusal(exec);
          if (refused) throw new Error(refused);
          if (where === 'project') project = await conversationFolder(exec);
        }
        const want = { type, names: Array.isArray(args.skills) ? args.skills.map(String) : [], mark: typeof args.mark === 'string' ? args.mark : 'all', what: String(args.what ?? ''), scope: where, project, lookOnly: args.lookOnly === true, by: 'chat' };
        if (['new', 'improve', 'merge'].includes(type) && !want.lookOnly) {
          // Checked first, so the owner is asked only about a run that can start, with its very sentence.
          const plan = await skillsPart.planSkillsRun(want);
          const answer = await approve(exec, plan.sentence);
          if (answer !== 'allowed-once') throw new Error(answer === 'rejected' ? 'The owner said no.' : `The owner could not be asked (${answer}).`);
        }
        const started = await skillsPart.startSkillsRun(want);
        return `Started: ${started.sentence} The result comes as a card on Settings → Tuner Plus.`;
      }),
    },
  ];
  let skillToolsOff;
  let toolsOff;
  const syncTools = () => {
    const registry = ctx.get('tools');
    // The skills part's tool: offered only while the part is on (off: no new tool at all).
    if (skillsOn() && !skillToolsOff && registry?.register) {
      // Never offered to a helper or in Recon.
      skillToolsOff = skillTools.map((tool) => registry.register({ ...tool, output, isConcurrencySafe: () => false, timeoutMs: 120_000 }, { when: ({ agent }) => skillsOn() && !isolatedAgent(agent) && !(agent?.header?.parentSession ?? agent?.session?.header?.parentSession) }));
    } else if (!skillsOn() && skillToolsOff) {
      for (const dispose of skillToolsOff) if (typeof dispose === 'function') dispose();
      skillToolsOff = undefined;
    }
    if (enabled() && !toolsOff && registry?.register) {
      toolsOff = tools.map((tool) => registry.register({ ...tool, output, isConcurrencySafe: () => tool.name !== 'tuning_start', timeoutMs: 120_000 }, { when: ({ agent }) => enabled() && !isolatedAgent(agent) }));
    } else if (!enabled() && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  };
  syncTools();
  const follow = setInterval(syncTools, 3000);
  follow.unref?.();
  ctx.effect?.(() => () => {
    clearInterval(follow);
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    for (const dispose of skillToolsOff ?? []) if (typeof dispose === 'function') dispose();
  }, 'tuning: tools');

  // ---- the page's data ----------------------------------------------------------------------------------

  const knownModels = () => {
    const seen = new Map();
    try {
      for (const version of ctx.get('modelTiers')?.listVersions?.() ?? []) if (version?.provider && version?.model) seen.set(`${version.provider}/${version.model}`, { provider: version.provider, model: version.model, label: version.name ?? version.model });
    } catch { /* no Model Tiers */ }
    for (const row of store.rows().slice(-3000)) if (row.by?.provider && row.by?.model && !['owner', 'research', 'bench', 'teacher', 'made-up', 'mlx-local'].includes(row.by.provider)) seen.set(`${row.by.provider}/${row.by.model}`, { provider: row.by.provider, model: row.by.model, label: row.by.model });
    return [...seen.values()].slice(0, 100);
  };
  const view = () => {
    let sets = {};
    let exam = [];
    let shelf = [];
    let cardList = { cards: [], never: [] };
    let problem = '';
    try {
      sets = setsNow();
      exam = examNow();
      shelf = store.shelf().entries ?? [];
      cardList = cards();
    } catch (error) {
      problem = String(error?.message ?? error).slice(0, 200);
    }
    const examByMode = {};
    for (const row of exam) examByMode[row.mode] = (examByMode[row.mode] ?? 0) + 1;
    const providersSeen = [...new Set(store.rows().slice(-5000).flatMap((row) => [row.by?.provider, row.rejectedBy?.provider]).filter((one) => one && !['owner', 'research', 'bench', 'teacher'].includes(one)))].slice(0, 40);
    return {
      at: now(),
      enabled: enabled(),
      problem,
      folder: folder(),
      ownFolder: folder() === ownFolder,
      harvest: Object.fromEntries(Object.keys(MODES).map((mode) => [mode, readObject(config?.harvest)[mode] === true])),
      modes: MODES,
      lastHarvest: store.state().lastHarvest ?? null,
      sets: Object.fromEntries(Object.entries(sets).map(([id, set]) => [id, { name: set.name, about: set.about, purpose: set.purpose, rows: set.rows, mayTrain: set.mayTrain, notTrain: set.notTrain, first: set.first, last: set.last, usedFor: set.usedFor }])),
      exam: { total: exam.length, byMode: examByMode },
      shelf: shelf.map((entry) => ({ ...entry, serving: servers.has(entry.id) })),
      cards: cardList.cards.filter((card) => !card.done).slice(0, 40),
      active: active ? { sentence: active.sentence, phase: active.phase, started: active.started, progress: active.progress ?? null } : null,
      goals: { ...Object.fromEntries(Object.entries(GOALS).map(([id, goal]) => [id, goal.name])), ...(skillsOn() ? { [SKILL_GOAL.id]: SKILL_GOAL.name } : {}) },
      rungs: RUNGS,
      models: knownModels(),
      modelPaths: modelPaths(),
      python: python(),
      pythonProblem: python() ? pythonProblem(python()) : '',
      teacher: teacherRoute() ?? null,
      teacherWhere: teacherRoute() ? whereIs(teacherRoute().provider) : '',
      teacherHere: teacherRoute() ? onThisMac(teacherRoute().provider) : false,
      ownNetworkLocal: plain(config?.ownNetworkLocal) === true,
      teacherCloud: plain(config?.teacherCloud) === true,
      providers: providersSeen.map((provider) => ({ provider, on: providers()[provider] !== false })),
      anthropicOpenEnded: plain(config?.anthropicOpenEnded) === true,
      night: { skills: plain(config?.nightSkills) === true, on: plain(config?.nightShift) === true, idleMinutes: Number(plain(config?.idleMinutes)) || 15, minutes: Number(plain(config?.nightMinutes)) || 120, train: readObject(config?.nightTrain, []), last: store.state().nightDone ?? '' },
      canaries: Boolean(canaryTasks()),
    };
  };
  const SETTABLE = { enabled: 'boolean', harvest: 'json', folder: 'string', python: 'string', models: 'json', teacher: 'json', teacherCloud: 'boolean', providers: 'json', anthropicOpenEnded: 'boolean', nightShift: 'boolean', idleMinutes: 'number', nightMinutes: 'number', nightTrain: 'json', nightSkills: 'boolean', examLimit: 'number', ownNetworkLocal: 'boolean', skills: 'boolean', skillExam: 'json' };
  /** What the page may do while Tuning Plus is off: switch it on, change settings, and stop or switch off. */
  const WHILE_OFF = new Set(['set', 'stop', 'stopServing']);
  const setSetting = async (field, value) => {
    const kind = SETTABLE[field];
    if (!kind) throw new Error('not a setting of Tuner Plus');
    let stored = value;
    if (kind === 'boolean') stored = value === true;
    else if (kind === 'number') stored = Number(value) || 0;
    else if (kind === 'string') stored = String(value ?? '').slice(0, 1000);
    else stored = JSON.stringify(value ?? {}).slice(0, 20000);
    if (field === 'python' && stored && pythonProblem(stored)) throw new Error(pythonProblem(stored));
    if (field === 'models') for (const path of Object.values(value ?? {})) if (path && modelProblem(path)) throw new Error(modelProblem(path));
    const settings = ctx.get('settings');
    if (!settings?.mutate) throw new Error('The app\'s settings are not available.');
    await settings.mutate(NS, [{ op: 'set', path: [field], value: stored }]);
  };
  const cardAction = (cardId, action) => {
    const all = cards();
    const card = all.cards.find((one) => one.id === cardId);
    if (!card) throw new Error('There is no such card.');
    if (action === 'never') {
      if (card.key) all.never = [...new Set([...all.never, card.key])];
      card.done = 'never';
    } else if (action === 'later') card.done = 'later';
    else if (action === 'promote') {
      // The owner's own action on the page: the exam must already have passed (shelf.promote checks it).
      const shelf = store.shelf();
      promote(shelf, card.entry, { ownerSaidYes: true, at: now() });
      store.saveShelf(shelf);
      card.done = 'promoted';
    } else throw new Error('unknown action');
    store.saveCards(all);
    return card;
  };

  ctx.inject?.(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: DATA_PATH,
        handler: async (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) {
            res.statusCode = refused;
            res.end();
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          try {
            let note = '';
            let extra = {};
            if (req.method === 'POST') {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                // A new skill's text (20,000 characters in any script) fits.
                if (size > 262144) throw new Error('request too large');
                chunks.push(chunk);
              }
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
              const action = String(body.action ?? '');
              if (!enabled() && !WHILE_OFF.has(action) && !(action === 'switch' && body.on !== true)) throw new Error('Tuner Plus is switched off in Settings → Tuner Plus. Switch it on first.');
              if (action === 'set') await setSetting(String(body.field ?? ''), body.value);
              else if (action === 'harvest') {
                const summary = await harvest();
                note = `Gathered: ${Object.entries(summary.modes).map(([mode, slot]) => `${mode} ${slot.kept} new rows, ${slot.exam} to the exam`).join('; ') || 'nothing new'}.${summary.problems.length ? ` ${summary.problems.slice(0, 2).join(' ')}` : ''}`;
              } else if (action === 'run') {
                void startRun({ model: String(body.model ?? ''), goal: String(body.goal ?? 'find'), sets: Array.isArray(body.sets) ? body.sets.map(String) : [], method: String(body.method ?? 'auto'), minutes: Number(body.minutes) || 0, lookOnly: body.lookOnly === true, settings: body.settings, by: 'page' }).catch((error) => addCard({ kind: 'candidate', title: 'The run did not finish', text: String(error?.message ?? error).slice(0, 400) }));
                note = 'Started. The result comes as a card below.';
              } else if (action === 'stop') note = stopRun() ? 'Stopping.' : 'Nothing is running.';
              else if (action === 'card') cardAction(String(body.card ?? ''), String(body.do ?? ''));
              else if (action === 'switch') {
                const shelf = store.shelf();
                setOn(shelf, String(body.entry ?? ''), body.on === true, now());
                store.saveShelf(shelf);
              } else if (action === 'serve') note = await serve(String(body.entry ?? ''), String(body.way ?? ''));
              else if (action === 'stopServing') note = stopServing(String(body.entry ?? '')) ? 'Stopped.' : 'It was not running.';
              else if (action === 'route') {
                const shelf = store.shelf();
                const entry = shelf.entries.find((one) => one.id === String(body.entry ?? ''));
                if (!entry) throw new Error('There is no such entry on the shelf.');
                setServing(shelf, entry.id, { way: entry.serve?.way || 'fused', provider: String(body.provider ?? ''), model: String(body.model ?? ''), path: entry.serve?.path ?? '' }, now());
                store.saveShelf(shelf);
              } else if (action === 'roles') {
                const shelf = store.shelf();
                setRoles(shelf, String(body.entry ?? ''), body.roles, now());
                store.saveShelf(shelf);
              } else if (action === 'taste') extra = { taste: await startTaste(String(body.entry ?? ''), body.current) };
              else if (action === 'pick') extra = { taste: pickTaste(String(body.round ?? ''), body.n, String(body.pick ?? '')) };
              else if (action === 'export') {
                const result = writeSet(String(body.set ?? ''));
                note = `Written to ${result.dir}: ${result.train} training rows, ${result.valid} for checking, ${result.pairs} pairs; ${result.left} left out (may not train).`;
              } else if (action === 'lessons') {
                const written = buildLessons();
                note = `Lessons: ${Object.entries(written).map(([plugin, count]) => `${plugin} ${count}`).join(', ') || 'none yet (they come from tool calls that worked, in harvested conversations)'}.`;
              } else if (action === 'qa') {
                const result = await buildQa({});
                note = `Questions from reference material: ${result.rows.length} kept, ${result.dropped} dropped by the check.`;
              } else if (action === 'skillsSort') {
                const n = skillsPart.sort(body.keys, String(body.mark ?? ''));
                note = `${n} skill${n === 1 ? '' : 's'} sorted.`;
              } else if (action === 'skillsRestart') {
                note = skillsPart.restartRecord();
              } else if (action === 'skillDraft') {
                const made = await skillsPart.draft({ name: body.name, description: body.description, text: body.text, scope: String(body.scope ?? ''), project: String(body.project ?? ''), by: 'owner' });
                note = `The draft "${made.name}" is kept in Tuner Plus's folder, where the app does not load it.${made.masked > 0 ? ` ${made.masked} secret${made.masked === 1 ? ' was' : 's were'} masked.` : ''}${made.git ? ' Its project is a git repository: once live, the skill file shows among its changes.' : ''}`;
              } else if (action === 'skillLive') {
                const live = await skillsPart.goLive(String(body.id ?? ''));
                note = `The skill "${live.name}" is live: ${live.file}.${live.git ? ' This project is a git repository: the file shows among its changes.' : ''}`;
              } else if (action === 'skillExam') {
                const started = await skillsPart.startExam({ draft: String(body.id ?? ''), key: String(body.key ?? '') });
                note = started.lookOnly ? `The health check of "${started.name}" is running (look only: nothing is changed). Its result comes as a card.` : `The exam of "${started.name}" is running. Its result comes as a card, and on the draft.`;
              } else if (action === 'skillsRun') {
                const started = await skillsPart.startSkillsRun({ type: String(body.type ?? ''), keys: Array.isArray(body.keys) ? body.keys.map(String) : [], mark: String(body.mark ?? 'all'), what: String(body.what ?? ''), scope: body.scope === 'project' ? 'project' : 'everywhere', project: String(body.project ?? ''), lookOnly: body.lookOnly === true, by: 'page' });
                note = `Started: ${started.sentence} The result comes as a card below.`;
              } else if (action === 'skillsHealth') {
                const counted = await skillsPart.refreshHealth({ most: 400 });
                note = `Uses counted in ${Object.keys(counted.sessions ?? {}).length} conversations Tuner Plus may read.`;
              } else if (action === 'skillRetire') {
                note = `"${skillsPart.retireKey(String(body.key ?? ''))}" is retired: switched off and kept. Put back is under Skills.`;
              } else if (action === 'skillPutBack') {
                note = `"${skillsPart.putBack(String(body.id ?? ''))}" is back where it was.`;
              } else if (action === 'skillsRetire') {
                const result = skillsPart.retireFromCard(String(body.card ?? ''));
                note = `${result.done.length > 0 ? `Retired (switched off and kept): ${result.done.join(', ')}.` : 'Nothing was retired.'}${result.problems.length > 0 ? ` Not retired: ${result.problems.slice(0, 3).join(' ')}` : ''}`;
              } else if (action === 'skillTeach') {
                const name = skillsPart.teachFromCard(String(body.card ?? ''));
                note = `"${name}" is taught: its checked runs train the harness adapter without loading it, from the next training run. The skill stays as it is.`;
              } else if (action === 'skillTeachStop') {
                note = `"${skillsPart.stopTeaching(String(body.name ?? ''))}" is no longer taught: its runs train with its loading again.`;
              } else if (action === 'skillsTabOff' || action === 'skillsTabOn') {
                // Skills per tab (step 14): the owner's click; Modes keeps the list and does the leaving out.
                const modes = modesSkills();
                if (!modes) throw new Error('Choosing skills per tab needs the Modes add-on of this Plus version.');
                const tab = String(body.tab ?? '');
                const names = (Array.isArray(body.names) ? body.names : []).map(String).slice(0, 500);
                const known = action === 'skillsTabOff' ? new Set(((await skillsView()).rows ?? []).map((row) => row.name)) : new Set();
                // Read after every wait, so a change made meanwhile is kept.
                const now = new Set(modes.skillsOff()[tab] ?? []);
                let next;
                if (action === 'skillsTabOff') {
                  const unknown = names.filter((name) => !known.has(name));
                  if (names.length === 0 || unknown.length > 0) throw new Error(unknown.length > 0 ? `Not in the skill list: ${unknown.slice(0, 3).join(', ')}.` : 'No skill was named.');
                  next = [...new Set([...now, ...names])];
                } else {
                  next = names.length === 0 ? [] : [...now].filter((name) => !names.includes(name));
                }
                const done = await modes.setSkillsOff(tab, next);
                const label = modes.list().find((one) => one.id === tab)?.label ?? tab;
                note = done.length > 0 ? `Switched off in ${label}: ${done.join(', ')}. The model there no longer sees them; your /name still works. Open conversations there get the shorter list at their next step.` : `Every skill is back on in ${label}.`;
              } else if (action === 'skillsUpdateCheck') {
                const started = await skillsPart.checkFromCard(String(body.card ?? ''));
                note = `Started: ${started.sentence} The result comes as a card below.`;
              } else if (action === 'skillsRunStop') {
                note = skillsPart.stopSkillsRun() ? 'Stopping the run.' : 'No skills run is going.';
              } else if (action === 'skillIdeas') {
                const ideas = await skillsPart.findIdeas();
                note = ideas.length === 0 ? 'No new skill ideas in what was gathered. Ideas come from checked work, corrections, runs a stronger model finished, tools that failed first, and plugins with lessons.' : `${ideas.length} skill idea${ideas.length === 1 ? '' : 's'}: see the cards under Results.`;
              } else if (action === 'skillIdeaDraft') {
                const made = await skillsPart.draftFromIdea(String(body.card ?? ''));
                note = `The draft "${made.name}" was written (${made.scope === 'project' ? `for the project ${String(made.project).split('/').pop()}` : 'for everywhere'}). It waits under Skills for its exam.`;
              } else if (action === 'skillShown') {
                skillsPart.markShown(String(body.id ?? ''));
              } else if (action === 'skillExamStop') {
                note = skillsPart.stopExam() ? 'Stopping the exam.' : 'No exam is running.';
              } else if (action === 'skillDrop') {
                note = `The draft "${skillsPart.dropDraft(String(body.id ?? ''))}" was dropped.`;
              } else if (action === 'rebuild') {
                const plan = rebuildPlan(store.shelf(), String(body.model ?? ''));
                note = plan.length === 0 ? 'Nothing to rebuild for that base model.' : `To rebuild on ${body.model}: ${plan.map((one) => one.name).join('; ')}. Start each from the bar with that model; each goes through its exam again.`;
              } else throw new Error('unknown action');
            } else if (req.method !== 'GET') throw new Error('only GET and POST');
            res.end(JSON.stringify({ ...view(), skills: await withExam(await skillsView({ fresh: req.method === 'POST' })), ...extra, note }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 400) }));
          }
        },
      }),
      'tuning: data route',
    );
  });

  return { harvest, refreshSets, examGate, startRun, stopRun, buildLessons, buildQa, nightTick, pickTaste, startTaste, writeSet, view, service, cardAction, serve, skillsPart, skillsView };
}

export const testing = { mark };
