/**
 * Balance: your DeepSeek balance at the bottom of the sidebar.
 *
 * It reads from the account you are signed in to in the app and, if the app has a DeepSeek API key
 * saved, from that key too. The account is shown first. The key never leaves the server half and is
 * sent only to DeepSeek.
 *
 * Route: `GET /dsh-balance/data` (the last reading, at most a minute old), `POST` reads again now.
 */
import z from '@deepseek-ai/schemastery';
import { KEEP_MS, KEY_NAME, readAccount, readKey, viewOf } from './lib/balance.js';

export const name = 'dsh-balance';

export const DATA_PATH = '/dsh-balance/data';

export const Config = z.object({
  /** Off takes the balance out of the sidebar and asks DeepSeek nothing. */
  enabled: z.boolean().default(true).volatile(),
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
 */
export function apply(ctx, config) {
  const enabled = () => plain(config?.enabled) !== false;
  const service = (id) => {
    try {
      return ctx.get(id);
    } catch {
      return undefined;
    }
  };

  let last;
  let running;
  const read = async () => {
    const sources = [];
    const account = service('deepseekAccount');
    if (account?.getBalance && account?.getState) {
      try {
        const found = await readAccount(account, { version: '0.1.0', locale: 'en-US', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 });
        if (found) sources.push(found);
      } catch {
        /* not signed in, or the service is not ready */
      }
    }
    let key = '';
    try {
      key = String((await service('credentials')?.resolve?.(KEY_NAME))?.value ?? '').trim();
    } catch {
      key = '';
    }
    if (!key) key = String(process.env[KEY_NAME] ?? '').trim();
    if (key) sources.push(await readKey(key));
    last = viewOf(sources, Date.now());
    return last;
  };
  const view = async (fresh) => {
    if (!enabled()) return { enabled: false };
    if (!fresh && last && Date.now() - last.at < KEEP_MS) return { enabled: true, ...last };
    running ??= read().finally(() => { running = undefined; });
    return { enabled: true, ...(await running) };
  };

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
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
              // A refresh is asked for at most every 10 seconds, however often the button is pressed.
              const fresh = req.method === 'POST' && !(last && Date.now() - last.at < 10000);
              res.end(JSON.stringify(await view(fresh)));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'balance: data route',
    );
  });
}
