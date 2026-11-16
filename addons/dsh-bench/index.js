/**
 * Bench: a mode and tab for the devices the user connects to this Mac. This first version:
 *   - the Bench mode (through the Modes add-on), with its method and a fixed tool list without a
 *     shell; Web, Depth, Long run and the Run button are the ones every tab has;
 *   - four tools: bench_usb (what is plugged in by USB, and the serial ports, read from the Mac's own
 *     device list), bench_devices, bench_card and bench_log (a card and a logbook per device);
 *   - a note in each Bench conversation naming the Bench folder and the devices with a card.
 * It opens no port and sends nothing to a device. Reading, changing settings and flashing come in
 * later steps, each behind its own gate.
 *
 * Off until switched on in Settings > Bench. Needs the Modes add-on and the Cowork sidebar.
 * Route: `GET/POST /dsh-bench/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { openBench } from './lib/cards.js';
import { benchRefusal } from './lib/guard.js';
import { MODE_ID, benchNote, withBench } from './lib/mode.js';
import { buildTools } from './lib/tools.js';
import { identifyUsb } from './lib/usb.js';

export const name = 'dsh-bench';
export const DATA_PATH = '/dsh-bench/data';
const MODES_NS = 'modes';

export const Config = z.object({
  /** The Bench mode and tab. Off leaves nothing of it in the app; cards and logbooks stay. */
  enabled: z.boolean().default(false).volatile(),
  /** Where cards and logbooks are kept. Empty: `bench` in the app's home. */
  folder: z.string().default('').volatile(),
  /**
   * A Long run in Bench checks its work with commands that Mission runs, with the Mac's device ports
   * closed to them. Off: Bench's Long runs run no checks (the reviewer judges by reading).
   */
  longChecks: z.boolean().default(true).volatile(),
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

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 * @param {{identify?: () => Promise<string>}} [standIns] - for tests: the USB report.
 */
export function apply(ctx, config, standIns = {}) {
  const enabled = () => plain(config?.enabled) === true;
  const warn = (text) => ctx.logger?.warn?.(`bench: ${text}`);
  const home = ctx.get('dshHomePath');
  const ownFolder = typeof home === 'function' ? home('bench') : '';
  /** The folder from Settings when it is a full path, else Bench's own. */
  const folder = () => {
    const picked = String(plain(config?.folder) ?? '').trim();
    return isAbsolute(picked) ? picked : ownFolder;
  };
  const bench = openBench(folder);
  const identify = standIns.identify ?? (() => identifyUsb());
  const modeOf = (id) => {
    try {
      return ctx.get('modes')?.get?.(id);
    } catch {
      return undefined;
    }
  };
  /** A helper works for the conversation that started it. */
  const topOf = (agent) => String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');
  /** Whether an agent is a Bench conversation or one of its helpers. */
  const inBench = (agent) => {
    const id = topOf(agent);
    return Boolean(id) && modeOf(id) === MODE_ID;
  };

  // ---- the mode: kept in step with the switch ------------------------------------------------

  let problem = '';
  let syncing = false;
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === MODES_NS);
      if (!row) {
        problem = 'The Modes add-on is not running, so there is no Bench tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = enabled();
      const ops = [];
      const next = withBench(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // A tab that no longer exists must not stay selected.
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Bench tab could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };

  // ---- the tools: there only while Bench is on -----------------------------------------------

  let toolsOff;
  const syncTools = () => {
    const on = enabled();
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      // Offered only in Bench conversations and their helpers: other tabs' tool lists stay as they were.
      toolsOff = buildTools({ enabled, bench, identify }).map((tool) => tools.register(tool, { when: ({ agent }) => enabled() && inBench(agent) }));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  };
  const follow = () => {
    void syncMode();
    try {
      syncTools();
    } catch (error) {
      warn(`could not update the tools: ${String(error?.message ?? error)}`);
    }
  };
  follow();
  const timer = setInterval(follow, 3000);
  timer.unref?.();
  ctx.effect(() => () => {
    clearInterval(timer);
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    toolsOff = undefined;
  }, 'bench: follow the switch');

  // ---- what is open and closed in Bench, for Mission and for the page ----------------------------
  const checksOn = () => plain(config?.longChecks) !== false;
  /** What is closed in a Bench conversation, as the chat box and the note say it. */
  const closedList = () => [
    { what: 'Commands, programs and background jobs', open: false, why: 'Bench reaches a device only through its own tools. Fixed in Bench.' },
    { what: 'Writing into the Bench folder or a device\'s port', open: false, why: 'Cards and logbooks are kept by Bench\'s own tools. Fixed in Bench.' },
    { what: 'Talking to a device (reading its memory, changing settings, flashing)', open: false, why: 'Not in this version: Bench identifies devices and keeps records.' },
    checksOn()
      ? { what: 'Long run checks', open: true, why: 'On, with the Mac\'s device ports closed to them. Switch them off in Settings → Bench.' }
      : { what: 'Long run checks', open: false, why: 'Switched off in Settings → Bench: the reviewer judges each step by reading.' },
  ];
  ctx.effect(() => ctx.provide('bench', Object.freeze({
    apiVersion: 1,
    /**
     * Mission asks this when a Long run starts. Undefined outside Bench and while Bench is off.
     * @param {string} sessionId - the conversation.
     * @returns {{checks: boolean, closePorts: boolean} | undefined} the rules.
     */
    longRunRules(sessionId) {
      const id = String(sessionId ?? '');
      if (!enabled() || !id || modeOf(id) !== MODE_ID) return undefined;
      return { checks: checksOn(), closePorts: true };
    },
  })), 'bench: service');

  // ---- Bench's rule on every tool call in a Bench conversation ---------------------------------
  // No shell, no program, no background job, no file tool writing into the Bench folder or /dev. It
  // holds also during a Long run, which offers every tool when its "Files and commands" is on.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      if (!exec?.agent || !inBench(exec.agent)) return decision;
      const header = exec.agent.header ?? exec.agent.session?.header;
      const reason = benchRefusal({ name: String(exec.name ?? ''), args: exec.arguments, cwd: typeof header?.cwd === 'string' ? header.cwd : '', benchFolder: folder() });
      return reason ? { kind: 'deny', reason } : decision;
    } catch (error) {
      warn(`could not check a tool call: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  // ---- a note in every Bench conversation: the folder and the known devices ------------------

  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'bench:folder',
            order: 59,
            interpolate: false,
            text: () => {
              try {
                if (!enabled() || modeOf(agent.id) !== MODE_ID) return '';
                if (ctx.get('modes')?.isolated?.(agent.id) === true) return '';
                let devices = [];
                try {
                  devices = bench.list().map((card) => card.name);
                } catch {
                  devices = [];
                }
                return benchNote({ folder: folder(), devices, closed: closedList() });
              } catch {
                return '';
              }
            },
          }),
        'bench note',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the Bench note: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => install(agent));
  ctx.on('agent/disposed', ({ agent }) => sections.delete(agent?.id));
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) install(agent);
  } catch {
    /* agents appear later */
  }
  ctx.effect(() => () => {
    for (const dispose of sections.values()) {
      try {
        dispose?.();
      } catch {
        /* the conversation may already be closing */
      }
    }
    sections.clear();
  }, 'bench: notes');

  // ---- the page's data ---------------------------------------------------------------------------

  const view = () => {
    let devices = [];
    let listProblem = '';
    try {
      devices = bench.list().map((card) => ({ name: card.name, maker: card.maker ?? '', model: card.model ?? '', connects: card.connects ?? '', level: card.permissions?.level ?? 'read', asks: card.permissions?.asks ?? 'ask-auto', entries: card.entries, updated: card.updated ?? 0 }));
    } catch (error) {
      listProblem = String(error?.message ?? error).slice(0, 200);
    }
    return { at: Date.now(), enabled: enabled(), problem: problem || listProblem, toolsOn: Boolean(toolsOff), folder: folder(), ownFolder: folder() === ownFolder, longChecks: checksOn(), closed: closedList(), devices };
  };
  ctx.inject(['webServer', 'connection'], (inner) => {
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
            if (req.method === 'POST') {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
              if (body.action !== 'reveal') throw new Error('unknown action');
              const path = folder();
              if (!path) throw new Error('There is no Bench folder.');
              mkdirSync(path, { recursive: true, mode: 0o700 });
              if (process.platform === 'darwin') await new Promise((done) => execFile('/usr/bin/open', [path], () => done()));
            } else if (req.method !== 'GET') throw new Error('only GET and POST');
            const session = new URL(req.url ?? '/', 'http://local').searchParams.get('session') ?? '';
            res.end(JSON.stringify({ ...view(), ...(session ? { session: { inBench: enabled() && modeOf(session.slice(0, 200)) === MODE_ID } } : {}) }));
            void syncMode();
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
          }
        },
      }),
      'bench: data route',
    );
  });
}
