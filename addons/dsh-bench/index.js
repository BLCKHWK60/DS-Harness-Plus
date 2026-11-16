/**
 * Bench: a mode and tab for the devices the user connects to this Mac.
 *   - the Bench mode (through the Modes add-on), with its method and a fixed tool list without a
 *     shell; Web, Depth, Long run and the Run button are the ones every tab has;
 *   - bench_usb, bench_devices, bench_card, bench_log (Identify, cards and logbooks), and the device
 *     tools of lib/devices.js: bench_serial_watch (read a port for up to an hour), bench_esp32 (details,
 *     a checked backup, firmware behind the four conditions), bench_android (read, settings with undo),
 *     bench_undo, bench_bluetooth (the Mac's Bluetooth list);
 *   - the gates of lib/gate.js, the user's yes through the app's own approval card, the per-device
 *     permissions set on Settings → Bench;
 *   - a note in each Bench conversation naming the Bench folder, the devices and what is open and closed.
 *
 * Off until switched on in Settings > Bench. Needs the Modes add-on and the Cowork sidebar.
 * Route: `GET/POST /dsh-bench/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { linkedText, openBench } from './lib/cards.js';
import { buildDeviceTools } from './lib/devices.js';
import { ASK_LABEL, LEVEL_LABEL, familyOfText, lookOnlyFamily } from './lib/gate.js';
import { benchRefusal } from './lib/guard.js';
import { findProgram, runFixed } from './lib/run.js';
import { createSerial } from './lib/serial.js';
import { MODE_ID, benchNote, withBench } from './lib/mode.js';
import { buildTools } from './lib/tools.js';
import { identifyUsb } from './lib/usb.js';

export const name = 'dsh-bench';
/** The app's tools service: Bench's final rule is a `tools.guard`, which needs it injected. */
export const inject = ['tools'];
export const DATA_PATH = '/dsh-bench/data';
const MODES_NS = 'modes';
/** How long a listing of ports or phones counts: after that, Identify again. */
const LISTED_FOR_MS = 60 * 60_000;

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
 * @param {object} [standIns] - for tests: the USB report (`identify`), the programs (`find`, `run`), the
 *   serial reader (`serial`), the user's yes (`approve`).
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
  /**
   * What each conversation listed in the last hour (the ports with the device on each, the phones) and
   * the dry runs it was shown: a port or phone is used only by the conversation that listed it.
   */
  const listings = new Map();
  const listingOf = (exec) => {
    const id = topOf(exec?.agent) || 'unknown';
    let entry = listings.get(id);
    if (!entry) {
      entry = { ports: new Map(), serials: new Map(), dry: new Map() };
      listings.set(id, entry);
      if (listings.size > 200) listings.delete(listings.keys().next().value);
    }
    const fresh = (map, ms = LISTED_FOR_MS) => {
      const cut = Date.now() - ms;
      for (const [key, value] of map) if (value.at < cut) map.delete(key);
      return map;
    };
    return {
      id,
      ports: () => new Set(fresh(entry.ports).keys()),
      port: (port) => fresh(entry.ports).get(port),
      setPorts(list) {
        entry.ports.clear();
        for (const item of list ?? []) {
          const port = typeof item === 'string' ? item : item?.port;
          if (typeof port !== 'string') continue;
          entry.ports.set(port, typeof item === 'string' ? { id: `port ${port}`, label: port, at: Date.now() } : { id: String(item.id), label: String(item.label ?? item.id), at: Date.now() });
        }
      },
      serial: (serialNumber) => fresh(entry.serials).get(serialNumber),
      setSerials(list) {
        entry.serials.clear();
        for (const device of list ?? []) entry.serials.set(device.serial, { model: device.model ?? '', at: Date.now() });
      },
      sawDry: (key) => entry.dry.set(key, { at: Date.now() }),
      hasDry: (key, ms) => fresh(entry.dry, ms).has(key),
    };
  };
  const identify = (exec) => {
    const onPorts = (ports) => listingOf(exec).setPorts(ports);
    return standIns.identify ? standIns.identify(onPorts) : identifyUsb({ onPorts });
  };
  const fetchFn = standIns.fetch ?? globalThis.fetch;
  const find = standIns.find ?? ((id) => findProgram(id));
  const run = standIns.run ?? runFixed;
  const serial = standIns.serial ?? (async () => createSerial({ stty: await find('stty'), cat: await find('cat') }));
  /** The user's yes through the app's own approval card: the user clicks it; a model cannot. */
  const approve = standIns.approve ?? (async (exec, reason) => {
    const approval = ctx.get('approval');
    if (!approval?.request || !exec?.agent) return 'unavailable';
    try {
      return await approval.request({ agent: exec.agent, toolName: exec.name, ...(exec.callId ? { callId: exec.callId } : {}), reason, displayReason: { en: reason }, signal: exec.signal });
    } catch (error) {
      warn(`could not ask: ${String(error?.message ?? error)}`);
      return 'unavailable';
    }
  });
  /** The user's latest own message in the conversation (never the model's words). */
  const userSaid = (exec) => {
    try {
      const messages = exec?.agent?.session?.deriveMessages?.() ?? [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'user' || message?.source?.kind !== 'user') continue;
        const content = message.content;
        return typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => (part?.type === 'text' ? part.text : '')).join(' ') : '';
      }
    } catch {
      /* nothing said */
    }
    return '';
  };
  const isHelper = (exec) => Boolean(exec?.agent?.header?.parentSession ?? exec?.agent?.session?.header?.parentSession);
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
      const all = [...buildTools({ enabled, bench, identify }), ...buildDeviceTools({ enabled, bench, find, run, serial, approve, userSaid, isHelper, seen: listingOf, fetchFn })];
      toolsOff = all.map((tool) => tools.register(tool, { when: ({ agent }) => enabled() && inBench(agent) }));
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
    { what: 'Commands, programs, background jobs and any tool not on Bench\'s list', open: false, why: 'Bench reaches a device only through its own tools, which run fixed commands. Its list: its own tools, the web, PDFs, the Library, reading files, diagrams, the step list and questions (and writing files outside the Bench folder in a Long run). Fixed in Bench.' },
    { what: 'File tools reading or writing the Bench folder or a device\'s port', open: false, why: 'Cards, logbooks and backups are kept by Bench\'s own tools; backups are never shown to a model (bench_devices shows a card). Fixed in Bench.' },
    { what: 'Identify and Read', open: true, why: 'Listing USB and Bluetooth devices, watching a serial port (up to an hour per call), an ESP32\'s details and a checked backup, a phone\'s details, log and settings. Opening a serial port restarts many boards: you are asked once per device.' },
    { what: 'Adjust (a phone\'s settings, with undo)', open: true, why: 'Only on a device whose card you set to Adjust or Write on this page, and only a short list of settings (brightness, screen timeout, text size, sounds, rotation, animation speed, automatic time); Ask-Auto asks each time, Full Auto does not, Restricted refuses. Each card is linked to one device. Never on look-only devices (e-bikes, medical devices, locks and the like).' },
    { what: 'Write (ESP32 firmware)', open: true, why: 'Only on a device you set to Write; asks every time, and only with a checked backup taken since its last write, a recovery path, firmware from the maker or the official project whose checksum Bench finds on their page itself. The start of the flash (loader, partition table, settings) also needs your own message "write protected <device name>". The eFuses: never.' },
    { what: 'Unlocking a phone or flashing it, network devices, Bluetooth connections', open: false, why: 'Not built yet.' },
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
  /** Every Bench folder in use this run: the current one, Bench's own, and any set earlier (their backups stay closed too). */
  const benchFolders = new Set(ownFolder ? [ownFolder] : []);
  // Decided before any other add-on is asked, so no other rule (an approval card) can open a closed tool.
  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (exec?.agent && inBench(exec.agent)) {
        benchFolders.add(folder());
        const header = exec.agent.header ?? exec.agent.session?.header;
        const reason = benchRefusal({ name: String(exec.name ?? ''), args: exec.arguments, cwd: typeof header?.cwd === 'string' ? header.cwd : '', benchFolders: [...benchFolders].filter(Boolean) });
        if (reason) return { kind: 'deny', reason };
      }
    } catch (error) {
      warn(`could not check a tool call: ${String(error?.message ?? error)}`);
      return { kind: 'deny', reason: 'Bench could not check this call, so it was not run.' };
    }
    return next();
  });
  // The same rule once more after every other add-on and the approval card: a denial nothing can undo.
  ctx.effect(() => ctx.tools?.guard?.((exec) => {
    try {
      if (!exec?.agent || !inBench(exec.agent)) return undefined;
      const header = exec.agent.header ?? exec.agent.session?.header;
      return benchRefusal({ name: String(exec.name ?? ''), args: exec.arguments, cwd: typeof header?.cwd === 'string' ? header.cwd : '', benchFolders: [...benchFolders, folder()].filter(Boolean) }) || undefined;
    } catch {
      return 'Bench could not check this call, so it was not run.';
    }
  }), 'bench: the rule, final');

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
  ctx.on('agent/disposed', ({ agent }) => {
    sections.delete(agent?.id);
    listings.delete(agent?.id);
  });
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
      devices = bench.list().map((card) => ({ name: card.name, maker: card.maker ?? '', model: card.model ?? '', connects: card.connects ?? '', level: card.permissions?.level ?? 'read', asks: card.permissions?.asks ?? 'ask-auto', dryRun: card.permissions?.dryRun === true, ranges: card.permissions?.ranges ?? '', portAgreed: card.permissions?.portAgreed === true, linked: linkedText(card), isLinked: Boolean(card.permissions?.bound && Object.keys(card.permissions.bound).length > 0), lookOnly: lookOnlyFamily(card), lookOnlyMarked: typeof card.permissions?.lookOnly === 'string' && card.permissions.lookOnly !== '', lookOnlyFromWords: familyOfText(card), backups: bench.backupsOf(card).length, undo: bench.undoOf(card).filter((entry) => !entry.undone).length, entries: card.entries, updated: card.updated ?? 0 }));
    } catch (error) {
      listProblem = String(error?.message ?? error).slice(0, 200);
    }
    return { at: Date.now(), enabled: enabled(), problem: problem || listProblem, toolsOn: Boolean(toolsOff), folder: folder(), ownFolder: folder() === ownFolder, longChecks: checksOn(), closed: closedList(), levels: LEVEL_LABEL, asks: ASK_LABEL, devices };
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
              if (body.action === 'permissions') {
                // The user's own settings for a device, from this page: never from the model.
                bench.setPermissions(String(body.name ?? '').slice(0, 80), { level: String(body.level ?? ''), asks: String(body.asks ?? ''), dryRun: body.dryRun === true, ranges: String(body.ranges ?? ''), clearLookOnly: body.clearLookOnly === true });
              } else if (body.action === 'unlink') {
                bench.unlink(String(body.name ?? '').slice(0, 80));
              } else if (body.action === 'reveal') {
                const path = folder();
                if (!path) throw new Error('There is no Bench folder.');
                mkdirSync(path, { recursive: true, mode: 0o700 });
                if (process.platform === 'darwin') await new Promise((done) => execFile('/usr/bin/open', [path], () => done()));
              } else throw new Error('unknown action');
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
