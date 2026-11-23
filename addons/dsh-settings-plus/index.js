/**
 * Settings helper, host half: serves the list of every setting (settings-index.json, made from the
 * pages' own code) to the search field in the Settings window. Everything else is in client.js.
 * Route: `GET /dsh-settings-plus/index`.
 */
import z from '@deepseek-ai/schemastery';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExport, FORMATS, LEVELS } from './lib/export.js';
import { clearDamagedNotes, damagedNotes } from './lib/json-store.js';
import { CARD_PATH, createCardBridge } from './lib/toolcard.js';

export const name = 'dsh-settings-plus';
export const INDEX_PATH = '/dsh-settings-plus/index';
export const EXPORT_PATH = '/dsh-settings-plus/export';
export const ABOUT_PATH = '/dsh-settings-plus/about';
export { CARD_PATH };

const triple = (version) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Whether an app version is inside the range Plus was written for: from `min` up to, not including, `below`. */
export function appInRange(version, range) {
  const v = triple(version);
  const min = triple(range?.min);
  const below = triple(range?.below);
  return Boolean(v && min && below) && compare(v, min) >= 0 && compare(v, below) < 0;
}

/**
 * What the About Plus page shows: Plus's own version, the app version and the range it was written for, and every
 * installed add-on with its label (Core, Beta, Experimental), read from addon-tiers.json next to the add-on folders.
 * @param {{plusDir: string, appVersion?: string}} where - the folder holding the add-ons, and the app's version.
 * @returns {object} the page's data.
 */
export function buildAbout({ plusDir, appVersion = '' }) {
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return undefined;
    }
  };
  // Installed: the list sits beside the add-on folders. In the repository it sits one folder up.
  const tiers = read(join(plusDir, 'addon-tiers.json')) ?? read(join(plusDir, '..', 'addon-tiers.json')) ?? {};
  let plus = '';
  try {
    plus = readFileSync(join(plusDir, 'VERSION'), 'utf8').trim() || readFileSync(join(plusDir, '..', 'VERSION'), 'utf8').trim();
  } catch {
    try {
      plus = readFileSync(join(plusDir, '..', 'VERSION'), 'utf8').trim();
    } catch {
      plus = '';
    }
  }
  const labels = tiers.tiers ?? {};
  const addons = Object.entries(tiers.addons ?? {})
    .filter(([folder]) => existsSync(join(plusDir, folder, 'package.json')))
    .map(([folder, one]) => ({ folder, name: String(one.label ?? folder), tier: String(one.tier ?? 'beta'), tierLabel: String(labels[one.tier]?.label ?? one.tier ?? ''), reason: String(one.reason ?? '') }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const range = tiers.supportedApp ? { min: String(tiers.supportedApp.min ?? ''), below: String(tiers.supportedApp.below ?? '') } : undefined;
  return {
    plus,
    app: String(appVersion ?? ''),
    range,
    inRange: range && appVersion ? appInRange(appVersion, range) : undefined,
    addons,
    // Recon is its own download: its settings are left out of search while it is not installed.
    recon: existsSync(join(plusDir, 'dsh-recon', 'package.json')),
  };
}

/** The installed app's version: the bundle's package.json, else the environment's `DSH_VERSION`. */
export function readAppVersion() {
  try {
    const bundle = join(dirname(process.execPath), '..', '..');
    return JSON.parse(readFileSync(join(bundle, 'Contents', 'Resources', 'app.asar', 'package.json'), 'utf8')).version ?? '';
  } catch {
    return process.env.DSH_VERSION ?? '';
  }
}

export const Config = z.object({
  /** Groups, icons and the search field in the Settings window. */
  enabled: z.boolean().default(true).volatile(),
  /** The small gear beside Send that opens the current mode's settings page in a popup. */
  modeGear: z.boolean().default(true).volatile(),
  /** The Export button beside the gear: this thread as a file (Markdown, text, HTML, JSON), at three levels. */
  exportButton: z.boolean().default(true).volatile(),
  /** A mode's own extra buttons (Devices rules, Creator Plus, Export for Recon, Focus, Finance pill, route badge) live in the gear's popup instead of the chat box. Only with the gear on and "Same chat box in every mode" on. */
  extrasInGear: z.boolean().default(true).volatile(),
  /** Which settings list the Settings window starts with: "simple" (about ten settings, in plain sentences) or "advanced" (every page). A first install starts on simple; an earlier install keeps advanced. */
  view: z.union([z.const('simple'), z.const('advanced')]).default('advanced').volatile(),
  /** True only after a first install, until the first-run setup card is finished or put away. An earlier install never has it. */
  setupPending: z.boolean().default(false).volatile(),
});

const plain = (value) => (value && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value) ? value.get() : value);

/** The list of settings, checked: entries without a page or a label are left out. */
export function readIndex(text) {
  let list;
  try {
    list = JSON.parse(String(text ?? '[]'));
  } catch {
    return [];
  }
  return (Array.isArray(list) ? list : [])
    // `internal: true` marks bookkeeping fields (markers, one-time carry-over flags): they are listed so the completeness test
    // knows them, but never shown in search.
    .filter((entry) => entry && entry.internal !== true && typeof entry.page === 'string' && typeof entry.label === 'string' && entry.label.trim())
    .map((entry) => ({
      page: entry.page,
      pageLabel: String(entry.pageLabel ?? entry.page),
      heading: String(entry.heading ?? ''),
      label: entry.label.trim(),
      description: String(entry.description ?? '').slice(0, 240),
      keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String).slice(0, 12) : [],
      kind: String(entry.kind ?? ''),
      configOnly: entry.configOnly === true,
      field: String(entry.field ?? ''),
      where: String(entry.where ?? ''),
      // A setting that lives in a tab of a merged page: `host` is the page that shows it when the merge is on (the
      // entry's own `page` is where it lives when its add-on is alone); `tab` is the tab to open.
      host: String(entry.host ?? ''),
      tab: String(entry.tab ?? ''),
    }));
}

/** The daily-limit value the first-run card suggests: `prepared.budget.suggested` in new-install-defaults.json (beside the add-on folders, or one folder up in the repository). */
export function readSetup(plusDir) {
  for (const file of [join(plusDir, 'new-install-defaults.json'), join(plusDir, '..', 'new-install-defaults.json')]) {
    try {
      const suggested = Number(JSON.parse(readFileSync(file, 'utf8'))?.prepared?.budget?.suggested);
      if (Number.isFinite(suggested) && suggested > 0) return { suggested: Math.floor(suggested) };
    } catch {
      /* try the next place */
    }
  }
  return { suggested: 2000000 };
}

export function apply(ctx, config, standIns = {}) {
  let cached;
  const plusDir = standIns.plusDir ?? dirname(dirname(fileURLToPath(import.meta.url)));
  const aboutNow = () => buildAbout({ plusDir, appVersion: standIns.appVersion ?? readAppVersion() });
  const index = () => {
    if (!cached) {
      try {
        cached = readIndex(readFileSync(fileURLToPath(new URL('./settings-index.json', import.meta.url)), 'utf8'));
      } catch {
        cached = [];
      }
    }
    return cached;
  };
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: INDEX_PATH,
        handler: (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) {
            res.statusCode = refused;
            res.end();
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          // Review H4: a saved file that was damaged and kept aside is told to the user once: `?notices=1` lists
          // them, `?notices=told` clears the list (the page shows them once, then says it was told).
          const asked = new URL(req.url ?? '', 'http://localhost').searchParams.get('notices');
          if (asked === '1') return res.end(JSON.stringify({ damaged: damagedNotes().map((note) => ({ label: note.label, aside: note.aside })) }));
          if (asked === 'told') return res.end(JSON.stringify({ cleared: clearDamagedNotes() }));
          res.end(JSON.stringify({ recon: aboutNow().recon, view: plain(config?.view) === 'simple' ? 'simple' : 'advanced', setupPending: plain(config?.setupPending) === true, setup: readSetup(plusDir), enabled: plain(config?.enabled) !== false, modeGear: plain(config?.modeGear) !== false, exportButton: plain(config?.exportButton) !== false, extrasInGear: plain(config?.extrasInGear) !== false, entries: index() }));
        },
      }),
      'settings-plus: index route',
    );
  });
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: ABOUT_PATH,
        handler: (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) {
            res.statusCode = refused;
            res.end();
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(aboutNow()));
        },
      }),
      'settings-plus: about route',
    );
  });
  // The permission card (Tool access): what is waiting for an answer, and the answer. See lib/toolcard.js.
  const bridge = createCardBridge({ service: () => { try { return ctx.get('toolAccess'); } catch { return undefined; } } });
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => () => bridge.stop(), 'settings-plus: card bridge');
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: CARD_PATH,
        handler: async (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) return send(res, refused, 'text/plain', '');
          const json = (status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
          try {
            if (plain(config?.enabled) === false) return json(200, { ready: false, requests: [] });
            if (req.method === 'GET') return json(200, bridge.poll());
            if (req.method !== 'POST') return send(res, 405, 'text/plain', '', { allow: 'GET, POST' });
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 4096) return json(413, { ok: false, reason: 'Too large.' });
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            return json(200, bridge.answer({ id: body?.id, choice: typeof body?.choice === 'string' ? body.choice : '' }));
          } catch {
            return json(400, { ok: false, reason: 'The answer could not be read.' });
          }
        },
      }),
      'settings-plus: permission card route',
    );
  });
  // The Export button's file. A conversation another add-on keeps apart (Recon's) is not exported here: its own door is the one way out.
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: EXPORT_PATH,
        handler: (req, res) => {
          void exportResponse(ctx, inner, config, req, res);
        },
      }),
      'settings-plus: export route',
    );
  });
}

const send = (res, status, type, body, extra = {}) => {
  res.statusCode = status;
  res.setHeader('content-type', type);
  res.setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
  res.end(body);
};

/** A JSON object stored as text (a Modes setting), or {} when it is not one. */
const readObject = (text) => {
  try {
    const value = typeof text === 'string' ? JSON.parse(text || '{}') : text;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

/**
 * Item 4A, stage 6a (belt, as Search and Sync): whether a conversation is kept apart (Recon) and so never exported
 * here. Any one of these says yes:
 * - Modes says so (`modes.isolated(id)`), or Modes or its answer fails (fail closed);
 * - Modes' settings mark it (`sessionIsolated[id] === true`) or put it in the Recon space (`sessionSpaces[id] === 'recon'`);
 * - its stored folder (the log's `session` header `cwd`) is Recon's room (`recon.isRoom`). This covers a closed thread
 *   whose space and mark writes both failed.
 * No Modes add-on at all: only the last two can say yes (nothing else keeps a conversation apart).
 * @param {object} from - what is known.
 * @param {() => any} from.modes - returns the Modes service.
 * @param {() => any} from.modesSettings - returns the Modes add-on's stored settings (`settings.describe()` value).
 * @param {() => any} from.recon - returns the Recon service.
 * @param {string} session - the conversation id.
 * @param {string} [cwd] - its stored folder, when known.
 * @returns {boolean} kept apart.
 */
export function keptApart({ modes, modesSettings, recon }, session, cwd = '') {
  let service;
  try {
    service = modes();
  } catch {
    return true;
  }
  if (service) {
    try {
      if (service.isolated?.(session) === true) return true;
    } catch {
      return true;
    }
  }
  let stored;
  try {
    stored = modesSettings();
  } catch {
    stored = undefined;
  }
  if (readObject(stored?.sessionIsolated)[session] === true) return true;
  if (readObject(stored?.sessionSpaces)[session] === 'recon') return true;
  if (cwd) {
    try {
      if (recon()?.isRoom?.(cwd) === true) return true;
    } catch {
      // Recon cannot say: the checks above decide.
    }
  }
  return false;
}

/** `?session=<id>&level=&format=` is the file; `&info=1` says whether the conversation may be exported and what it is called. */
async function exportResponse(ctx, inner, config, req, res) {
  const json = (status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
  try {
    const refused = inner.connection.requestRejection(req);
    if (refused !== undefined) return send(res, refused, 'text/plain', '');
    if (plain(config?.enabled) === false || plain(config?.exportButton) === false) return json(404, { ok: false, reason: 'Export is switched off. Switch it on in Settings → Start here → Export button on/off.' });
    const url = new URL(req.url ?? '', 'http://localhost');
    const session = url.searchParams.get('session') ?? '';
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(session)) return json(400, { ok: false, reason: 'No thread given.' });
    const apart = (cwd = '') => keptApart({
      modes: () => ctx.get('modes'),
      modesSettings: () => ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'modes')?.value,
      recon: () => ctx.get('recon'),
    }, session, cwd);
    const refuseApart = () => json(403, { ok: false, isolated: true, reason: "This thread is sealed, so it is kept apart from the others. It is exported only through its own Export…, shown below." });
    // A Modes answer `isolated?.(session) === true` is the first check (keptApart); the stored folder is checked once the log is read.
    if (apart()) return refuseApart();
    const query = ctx.get('sessionQuery');
    if (typeof query?.readSession !== 'function') return json(503, { ok: false, reason: 'The app cannot read stored threads here. Update the app, or use the app\'s own archive (Download the ZIP).' });
    let log;
    try {
      log = await query.readSession(session);
    } catch {
      return json(404, { ok: false, reason: 'That thread was not found. It may have been deleted; open it from the list and try again.' });
    }
    // Item 4A, stage 6a (belt): a thread whose stored folder is Recon's room is never exported here.
    const header = (Array.isArray(log?.events) ? log.events : []).find((event) => event?.type === 'session');
    if (typeof header?.cwd === 'string' && header.cwd && apart(header.cwd)) return refuseApart();
    const level = url.searchParams.get('level') ?? 'conversation';
    const format = url.searchParams.get('format') ?? 'md';
    if (!LEVELS.includes(level) || !FORMATS.includes(format)) return json(400, { ok: false, reason: 'That level or format is not known. Pick one from the lists, then try again.' });
    // Review H10: keys and passwords are hidden unless the user unticks it; for the full log that is the default.
    const hide = (url.searchParams.get('hide') ?? (level === 'full' ? '1' : '0')) === '1';
    const made = buildExport(log?.events ?? [], { level, format, sessionId: session, hide });
    if (url.searchParams.get('info') === '1') return json(200, { ok: true, title: made.title, filename: made.filename, size: Buffer.byteLength(made.body), counts: made.counts, hidden: hide });
    send(res, 200, made.mime, made.body, { 'content-disposition': `attachment; filename="${made.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(made.filename)}` });
  } catch {
    send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, reason: 'The export failed. Close this window and try again.' }));
  }
}
