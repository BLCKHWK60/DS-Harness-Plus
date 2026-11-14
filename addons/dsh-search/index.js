/**
 * Global Search: one box that finds conversations by their titles and by the text of their
 * messages, across every tab, and projects by name. Opened with Cmd-K (Ctrl-K), or from the
 * search button the Cowork sidebar shows.
 *
 * The searching of message text uses the app's search index (`sessionQuery`). The app ships it
 * switched off; this add-on's patch switches it on, in memory only (see cordis.patch.yml).
 * lib/text.js asks it for more than the app's own endpoint does and leaves out the notes the app
 * adds to every conversation. Nothing is given to a model.
 */
import z from '@deepseek-ai/schemastery';
import { results } from './lib/match.js';
import { searchText } from './lib/text.js';

export const name = 'dsh-search';
export const MATCH_PATH = '/dsh-search/match';

export const Config = z.object({
  /** Cmd-K (Ctrl-K) opens Global Search. Off leaves that shortcut to the app. */
  shortcut: z.boolean().default(true).volatile(),
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
 * The one route, `POST /dsh-search/match`: the browser half sends the query with the titles, the
 * projects and the tabs, and gets the grouped results back; with `text: true` the text of messages
 * is searched as well. The Cowork sidebar's own search uses the same route.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: MATCH_PATH,
          handler: async (req, res) => {
            const refused = inner.connection.requestRejection(req);
            if (refused !== undefined) {
              res.statusCode = refused;
              res.end();
              return;
            }
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            if (req.method === 'GET') {
              res.end(JSON.stringify({ shortcut: plain(config?.shortcut) !== false }));
              return;
            }
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET, POST');
              res.end();
              return;
            }
            try {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 4_000_000) throw new Error('request too large');
                chunks.push(chunk);
              }
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              // `text: true` asks for the text of messages to be searched too; without it only titles and projects are.
              let text = { hits: [], more: false, note: '' };
              if (body?.text === true) {
                try {
                  const index = ctx.get('sessionQuery');
                  if (typeof index?.searchSessions !== 'function') throw new Error('unavailable');
                  text = { ...(await searchText((request) => index.searchSessions(request, {}), body.query)), note: '' };
                } catch (error) {
                  text = { hits: [], more: false, note: error?.code === 'SESSION_QUERY_SEARCH_DISABLED' ? 'The app\'s search of message text is switched off, so only titles were searched.' : 'The text of messages could not be searched just now; titles were.' };
                }
              }
              res.end(JSON.stringify({ ...results({ ...body, hits: text.hits }), more: text.more, note: text.note, hitIds: text.hits.map((hit) => hit.sessionId) }));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'search: match route',
    );
  });
}
