/**
 * Settings helper, host half: serves the list of every setting (settings-index.json, made from the
 * pages' own code) to the search field in the Settings window. Everything else is in client.js.
 * Route: `GET /dsh-settings-plus/index`.
 */
import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildExport, FORMATS, LEVELS } from './lib/export.js';

export const name = 'dsh-settings-plus';
export const INDEX_PATH = '/dsh-settings-plus/index';
export const EXPORT_PATH = '/dsh-settings-plus/export';

export const Config = z.object({
  /** Groups, icons and the search field in the Settings window. */
  enabled: z.boolean().default(true).volatile(),
  /** The small gear beside Send that opens the current mode's settings page in a popup. */
  modeGear: z.boolean().default(true).volatile(),
  /** The Export button beside the gear: this conversation as a file (Markdown, text, HTML, JSON), at three levels. */
  exportButton: z.boolean().default(true).volatile(),
  /** A mode's own extra buttons (Bench rules, Creator Plus, Export for Recon, Focus, Finance pill, route badge) live in the gear's popup instead of the chat box. Only with the gear on and "Same chat box in every mode" on. */
  extrasInGear: z.boolean().default(true).volatile(),
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
    .filter((entry) => entry && typeof entry.page === 'string' && typeof entry.label === 'string' && entry.label.trim())
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
    }));
}

export function apply(ctx, config) {
  let cached;
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
          res.end(JSON.stringify({ enabled: plain(config?.enabled) !== false, modeGear: plain(config?.modeGear) !== false, exportButton: plain(config?.exportButton) !== false, extrasInGear: plain(config?.extrasInGear) !== false, entries: index() }));
        },
      }),
      'settings-plus: index route',
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
    const made = buildExport(log?.events ?? [], { level, format, sessionId: session });
    if (url.searchParams.get('info') === '1') return json(200, { ok: true, title: made.title, filename: made.filename, size: Buffer.byteLength(made.body), counts: made.counts });
    send(res, 200, made.mime, made.body, { 'content-disposition': `attachment; filename="${made.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(made.filename)}` });
  } catch {
    send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, reason: 'The export failed.' }));
  }
}
