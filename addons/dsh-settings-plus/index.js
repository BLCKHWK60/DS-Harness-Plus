/**
 * Settings helper, host half: serves the list of every setting (settings-index.json, made from the
 * pages' own code) to the search field in the Settings window. Everything else is in client.js.
 * Route: `GET /dsh-settings-plus/index`.
 */
import z from '@deepseek-ai/schemastery';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-settings-plus';
export const INDEX_PATH = '/dsh-settings-plus/index';

export const Config = z.object({
  /** Groups, icons and the search field in the Settings window. */
  enabled: z.boolean().default(true).volatile(),
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
          res.end(JSON.stringify({ enabled: plain(config?.enabled) !== false, entries: index() }));
        },
      }),
      'settings-plus: index route',
    );
  });
}
