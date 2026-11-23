/**
 * Global Search: one box that finds conversations by their titles and by the text of their
 * messages, across every tab, and projects by name. Opened with Cmd-K (Ctrl-K), or from the
 * search button the Cowork sidebar shows.
 *
 * The searching of message text uses the app's search index (`sessionQuery`). The app ships it
 * switched off; this add-on's patch switches it on, in memory only (see cordis.patch.yml).
 * lib/text.js asks it for more than the app's own endpoint does and leaves out the notes the app
 * adds to every conversation. Nothing is given to a model.
 *
 * Isolated conversations (Recon) are never shown, neither by their title nor by the text of their
 * messages (lib/hidden.js). The ids of text hits (`hitIds`) stay complete: the Cowork sidebar's
 * search inside one tab uses them, and keeps only the conversations of that tab.
 *
 * Item 4A, stage 6b (STAGE6B-DESIGN.md J18): with spaces live, results are grouped under space headings (the sidebar's
 * space order; hidden and unavailable spaces too), each row tagged with its mode. No Recon heading ever: a thread in Recon,
 * or whose space cannot be read, is hidden. Without Modes' spaces, the tab grouping exactly as before.
 */
import z from '@deepseek-ai/schemastery';
import { isolatedCheck } from './lib/hidden.js';
import { holds, results, wordsOf } from './lib/match.js';
import { searchText } from './lib/text.js';

export const name = 'dsh-search';
export const MATCH_PATH = '/dsh-search/match';

/** Item 4A, stage 6b (7.3): said when a thread that matched was left out because its space could not be read. */
export const SPACE_READ_NOTE = Object.freeze({
  en: 'Some threads could not be sorted by space just now and are not shown. Try again in a moment.',
});
/** The headings when Modes cannot list its spaces (Recon is never one). */
const SPACE_FALLBACK = Object.freeze(['chat', 'code', 'devices', 'workshop']);

export const Config = z.object({
  /** Cmd-K (Ctrl-K) opens Global search. Off leaves that shortcut to the app. */
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

/** A Recon room's spelling: a "dsh-recon-…" folder directly in /tmp, /private/tmp or the system's temporary folder. */
const ROOM_NAME = /^\/(?:private\/)?tmp\/dsh-recon-[^/]*\/?$|^\/(?:private\/)?var\/folders\/[^/]+\/[^/]+\/T\/dsh-recon-[^/]*\/?$/i;

/**
 * The one route, `POST /dsh-search/match`: the browser half sends the query with the titles, the
 * projects and the tabs, and gets the grouped results back; with `text: true` the text of messages
 * is searched as well. The Cowork sidebar's own search uses the same route.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  /**
   * @param {Array<{id?: string, cwd?: string}>} [sessions] - item 4A, stage 6a: the page's list, for each thread's folder.
   * @returns {(id: string) => boolean} whether a conversation is isolated, as the Modes add-on has it now.
   */
  const isolatedNow = (sessions = []) => {
    let modes;
    try {
      modes = ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'modes')?.value;
    } catch {
      modes = undefined;
    }
    const service = ctx.get('modes');
    const agents = ctx.get('agents');
    // Item 4A, stage 6a (belt): a thread whose folder is Recon's room is hidden too (Recon says which folder that is).
    const folders = new Map((Array.isArray(sessions) ? sessions : []).filter((one) => one && typeof one.id === 'string' && typeof one.cwd === 'string').map((one) => [one.id, one.cwd]));
    let recon;
    try {
      recon = ctx.get('recon');
    } catch {
      recon = undefined;
    }
    return isolatedCheck({
      modes,
      isolated: (id) => service?.isolated?.(id) === true,
      modeOf: (id) => service?.get?.(id),
      loaded: (id) => Boolean(agents?.get?.(id)),
      folderOf: (id) => folders.get(id) ?? '',
      ...(typeof recon?.isRoom === 'function' ? { isRoom: (folder) => recon.isRoom(folder) === true } : {}),
    });
  };

  /**
   * Item 4A, stage 6b (J18): with spaces live, each thread's space and its mode's shown name, from the Modes add-on (the
   * one reader, J22). A thread in Recon, or whose space cannot be read, is hidden (a belt on top of `isolatedNow`); a
   * thread with no recorded space goes where its mode lives, else Chat. null: Modes away, too old, or spaces not live
   * (then the tab grouping, exactly as before).
   * @param {object} body - the page's request (`sessions`, `spaceOrder`, `tabOrder`, `lang`).
   * @returns {null | {sessions: object[], spaces: {id: string, label: string}[], hide: Set<string>, unread: Set<string>, lang: 'en'}}
   */
  const spacesNow = (body) => {
    let service;
    try {
      service = ctx.get('modes');
    } catch {
      return null;
    }
    const spaces = service?.spaces;
    try {
      if (typeof spaces?.live !== 'function' || spaces.live() !== true || typeof spaces.of !== 'function') return null;
    } catch {
      return null;
    }
    // Stage 7 (decision 28): Plus is English only. The request's `lang` is still accepted (an older page sends it) and
    // ignored, so the space and mode names come back in English even when the app is set to Chinese.
    const lang = 'en';
    let names = {};
    try {
      names = spaces.names?.(lang) ?? {};
    } catch {
      names = {};
    }
    // Headings: every space Modes knows (hidden or unavailable ones too: their threads are reachable only here), never Recon.
    let ids;
    try {
      ids = (spaces.list?.() ?? []).map((row) => String(row?.id ?? '')).filter((id) => id && id !== 'recon');
    } catch {
      ids = [];
    }
    if (ids.length === 0) ids = [...SPACE_FALLBACK];
    const ofMode = (mode) => {
      try {
        return String(spaces.ofMode?.(mode) ?? '');
      } catch {
        return '';
      }
    };
    // The sidebar's order: its own `spaceOrder`, else the first time each space's tab shows in `tabOrder`, then the rest.
    const order = [];
    const take = (id) => { if (ids.includes(id) && !order.includes(id)) order.push(id); };
    const own = Array.isArray(body?.spaceOrder) ? body.spaceOrder.filter((id) => typeof id === 'string') : [];
    for (const id of own) take(id);
    if (own.length === 0) for (const tab of Array.isArray(body?.tabOrder) ? body.tabOrder.slice(0, 50) : []) if (typeof tab === 'string' && tab) take(ofMode(tab) || 'chat');
    for (const id of ids) take(id);
    const hide = new Set();
    const unread = new Set();
    const sessions = (Array.isArray(body?.sessions) ? body.sessions : []).filter((one) => one && typeof one.id === 'string').map((one) => {
      const tab = typeof one.tab === 'string' ? one.tab : '';
      let space;
      try {
        space = String(spaces.of(one.id) ?? '');
      } catch {
        hide.add(one.id);
        unread.add(one.id);
        return { ...one, space: '' };
      }
      if (space === '') space = (tab ? ofMode(tab) : '') || 'chat';
      if (space === 'recon') hide.add(one.id);
      else if (!order.includes(space)) {
        // A space Modes named that is not one of the headings: not sorted, so not shown (fail closed).
        hide.add(one.id);
        unread.add(one.id);
      }
      let modeName = tab;
      try {
        modeName = tab ? String(service.modeName?.(tab, lang) ?? tab) : '';
      } catch {
        modeName = tab;
      }
      return { ...one, space, modeName };
    });
    return { sessions, spaces: order.map((id) => ({ id, label: String(names[id] ?? id) })), hide, unread, lang };
  };

  /**
   * Stage 6b lab fix: Recon's room is never listed under Projects (its name and path stay in Recon). Recon says which
   * folder it is; a folder named like a room directly in the temporary folder is left out also while Recon is off, and a
   * Recon that cannot answer leaves the folder out (fail closed).
   * @param {unknown} projects - the page's projects.
   * @returns {object[]} the ones that may be shown.
   */
  const projectsShown = (projects) => {
    let recon;
    try {
      recon = ctx.get('recon');
    } catch {
      recon = undefined;
    }
    return (Array.isArray(projects) ? projects : []).filter((project) => {
      const path = typeof project?.path === 'string' ? project.path : '';
      if (ROOM_NAME.test(path)) return false;
      if (typeof recon?.isRoom !== 'function' || !path) return true;
      try {
        return recon.isRoom(path) !== true;
      } catch {
        return false;
      }
    });
  };

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
              // `bySpace`: results come grouped by space (item 4A, stage 6b), so the page's first line says "in every space".
              res.end(JSON.stringify({ shortcut: plain(config?.shortcut) !== false, bySpace: spacesNow({}) !== null }));
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
              const asked = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const body = asked && typeof asked === 'object' ? { ...asked, projects: projectsShown(asked.projects) } : asked;
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
              const isolated = isolatedNow(body?.sessions);
              const bySpace = spacesNow(body);
              if (!bySpace) {
                res.end(JSON.stringify({ ...results({ ...body, hits: text.hits, hidden: isolated }), more: text.more, note: text.note, hitIds: text.hits.map((hit) => hit.sessionId) }));
                return;
              }
              // Item 4A, stage 6b (J18): grouped by space; Recon, and a thread whose space could not be read, never shown.
              const found = results({ ...body, sessions: bySpace.sessions, hits: text.hits, hidden: (id) => isolated(id) || bySpace.hide.has(id), groupBy: 'space', spaces: bySpace.spaces });
              // The note only when a thread left out for an unread space would have matched (and is not an isolated one).
              const words = wordsOf(body?.query);
              const hitSet = new Set(text.hits.map((hit) => hit.sessionId));
              const missed = bySpace.sessions.some((one) => bySpace.unread.has(one.id) && !isolated(one.id) && (holds(one.title, words) || hitSet.has(one.id)));
              const note = [text.note, missed ? SPACE_READ_NOTE.en : ''].filter(Boolean).join(' ');
              // `hitIds` stay ids only (the sidebar's own search needs them; Revision 2 L7): the page never shows them.
              res.end(JSON.stringify({ ...found, more: text.more, note, hitIds: text.hits.map((hit) => hit.sessionId) }));
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
