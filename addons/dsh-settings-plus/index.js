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

export const name = 'dsh-settings-plus';
export const INDEX_PATH = '/dsh-settings-plus/index';
export const EXPORT_PATH = '/dsh-settings-plus/export';
export const ABOUT_PATH = '/dsh-settings-plus/about';

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
  /** The Export button beside the gear: this conversation as a file (Markdown, text, HTML, JSON), at three levels. */
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

/** `?session=<id>&level=&format=` is the file; `&info=1` says whether the conversation may be exported and what it is called. */
async function exportResponse(ctx, inner, config, req, res) {
  const json = (status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
  try {
    const refused = inner.connection.requestRejection(req);
    if (refused !== undefined) return send(res, refused, 'text/plain', '');
    if (plain(config?.enabled) === false || plain(config?.exportButton) === false) return json(404, { ok: false, reason: 'Export is switched off.' });
    const url = new URL(req.url ?? '', 'http://localhost');
    const session = url.searchParams.get('session') ?? '';
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(session)) return json(400, { ok: false, reason: 'No conversation given.' });
    let isolated = false;
    try {
      isolated = ctx.get('modes')?.isolated?.(session) === true;
    } catch {
      isolated = false;
    }
    if (isolated) return json(403, { ok: false, isolated: true, reason: "This conversation is kept apart from the others. It is exported only through its own tab's Export…, shown below." });
    const query = ctx.get('sessionQuery');
    if (typeof query?.readSession !== 'function') return json(503, { ok: false, reason: 'The app cannot read stored conversations here.' });
    let log;
    try {
      log = await query.readSession(session);
    } catch {
      return json(404, { ok: false, reason: 'That conversation was not found.' });
    }
    const level = url.searchParams.get('level') ?? 'conversation';
    const format = url.searchParams.get('format') ?? 'md';
    if (!LEVELS.includes(level) || !FORMATS.includes(format)) return json(400, { ok: false, reason: 'Unknown level or format.' });
    // Review H10: keys and passwords are hidden unless the user unticks it; for the full log that is the default.
    const hide = (url.searchParams.get('hide') ?? (level === 'full' ? '1' : '0')) === '1';
    const made = buildExport(log?.events ?? [], { level, format, sessionId: session, hide });
    if (url.searchParams.get('info') === '1') return json(200, { ok: true, title: made.title, filename: made.filename, size: Buffer.byteLength(made.body), counts: made.counts, hidden: hide });
    send(res, 200, made.mime, made.body, { 'content-disposition': `attachment; filename="${made.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(made.filename)}` });
  } catch {
    send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, reason: 'The export failed.' }));
  }
}
