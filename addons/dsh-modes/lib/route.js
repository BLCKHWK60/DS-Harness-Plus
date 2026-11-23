/**
 * The web route /dsh-modes/tool-access: how the Tool access page and the choice card (both run in the
 * browser) reach the service `toolAccess`. POST {call, args} or GET ?call=...&args=<json> answer
 * `{ok: true, value}` or `{ok: false, error: 'a plain sentence'}`. Only the calls below exist.
 * `answer` is the only call that resolves a card; the service refuses choices that were not offered.
 * `labRequest` exists only when the environment variable DSH_TOOL_ACCESS_LAB is 1 (a lab, never a release).
 */
export const TOOL_ACCESS_PATH = '/dsh-modes/tool-access';

const text = (value, max = 160) => (typeof value === 'string' ? value.slice(0, max) : '');

/** One entry per call: how its arguments go to the service. */
const CALLS = {
  grid: (s) => s.grid(),
  setCell: (s, a) => s.setCell({ modeId: text(a.modeId), groupId: text(a.groupId), state: text(a.state, 10) }),
  setTool: (s, a) => s.setTool({ modeId: text(a.modeId), tool: text(a.tool, 128), state: text(a.state, 10) }),
  resetMode: (s, a) => s.resetMode(text(a.modeId)),
  toolsOf: (s, a) => s.toolsOf(text(a.modeId)),
  catalogueFor: (s, a) => s.catalogueFor(text(a.sessionId), { group: text(a.group, 60) || undefined, search: text(a.search, 60) || undefined }),
  catalogueForMode: (s, a) => s.catalogueForMode(text(a.modeId), { group: text(a.group, 60) || undefined, search: text(a.search, 60) || undefined, space: text(a.space, 20) || undefined }),
  grants: (s) => s.grants(),
  revoke: (s, a) => s.revoke(text(a.id, 40)),
  revokeAll: (s) => s.revokeAll(),
  revokeConversation: (s, a) => s.revokeConversation(text(a.sessionId)),
  history: (s, a) => s.history({ limit: Math.min(Math.max(Number(a.limit) || 200, 1), 1000), sessionId: text(a.sessionId) || undefined }),
  waiting: (s) => s.waiting(),
  clearWaiting: (s, a) => s.clearWaiting(text(a.id, 40)),
  allowWaiting: (s, a) => s.allowWaiting(text(a.id, 40)),
  record: (s, a) => s.record(text(a.sessionId)),
  // Open requests, without the timer object.
  pending: (s) => s.pending().map(({ signal, ...rest }) => rest),
  answer: (s, a) => s.answer(text(a.requestId, 40), { choice: text(a.choice, 20), ...(typeof a.expiresAt === 'number' ? { expiresAt: a.expiresAt } : {}) }),
  enabled: (s) => s.enabled(),
  // The page's switch (Off keeps every permission and choice). Switching On is the page's to ask about first.
  setEnabled: (s, a) => s.setEnabled(a.on === true ? true : a.on === false ? false : undefined),
};

/**
 * @param {object | undefined} service - `toolAccess`.
 * @param {string} call - the call's name.
 * @param {unknown} args - its arguments.
 * @param {{lab?: boolean}} [options] - `lab`: the lab-only call is allowed.
 * @returns {Promise<{ok: boolean, value?: unknown, error?: string}>} the answer.
 */
export async function toolAccessCall(service, call, args, { lab = false } = {}) {
  if (!service) return { ok: false, error: 'Tool access is not running.' };
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  try {
    if (call === 'labRequest') {
      if (!lab) return { ok: false, error: 'That call is only there in the lab.' };
      // Starts a request as the AI would; the answer is in the record (history) and the permissions, not in this reply.
      const started = service.ask({ sessionId: text(a.sessionId), tool: text(a.tool, 128), reason: text(a.reason, 300), outsideMaterial: a.outsideMaterial === 'file' ? 'file' : a.outsideMaterial ? 'web' : undefined });
      started.catch(() => {});
      return { ok: true, value: { started: true } };
    }
    if (!Object.hasOwn(CALLS, call)) return { ok: false, error: 'There is no such call.' };
    return { ok: true, value: await CALLS[call](service, a) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).replace(/^toolAccess: /, '').slice(0, 200) };
  }
}

/** Read the body of a POST (at most 32 KB). */
export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX) throw new Error('The request was too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/** The calls a plain GET may make: reads only. Everything that changes something or answers a card needs a POST. */
export const READ_CALLS = ['grid', 'toolsOf', 'catalogueFor', 'grants', 'history', 'waiting', 'record', 'pending', 'enabled'];
/** Largest body a POST may carry. */
export const BODY_MAX = 32_768;

/**
 * The handler of the route: sign-in first, then the method, then the call.
 * @param {object} want - what it needs.
 * @param {() => object | undefined} want.service - `toolAccess`, when it is running.
 * @param {{requestRejection: (req: object) => number | undefined}} want.connection - the app's sign-in check (a status code when the request is refused).
 * @param {boolean} [want.lab] - the lab-only call is allowed.
 * @returns {(req: object, res: object) => Promise<void>} the handler.
 */
export function toolAccessHandler({ service, connection, lab = false }) {
  return async (req, res) => {
    // Without the app's sign-in nothing is answered: no read, no write, no answer to a card.
    const refused = connection.requestRejection(req);
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
    let answer;
    try {
      let call;
      let args;
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        call = String(body?.call ?? '');
        args = body?.args;
      } else {
        const url = new URL(req.url ?? '', 'http://localhost');
        call = url.searchParams.get('call') ?? '';
        try {
          args = JSON.parse(url.searchParams.get('args') ?? '{}');
        } catch {
          args = Object.fromEntries(url.searchParams.entries());
        }
        // A plain read: writes and answers need a POST.
        if (!READ_CALLS.includes(call)) {
          res.statusCode = 405;
          res.setHeader('allow', 'POST');
          res.end(JSON.stringify({ ok: false, error: 'This call changes something: send it with POST.' }));
          return;
        }
      }
      answer = await toolAccessCall(service(), call, args, { lab });
    } catch (error) {
      answer = { ok: false, error: String(error?.message ?? error).slice(0, 200) };
      if (/too large/.test(answer.error)) res.statusCode = 413;
    }
    res.end(JSON.stringify(answer));
  };
}

/**
 * Item 4A, stage 5: the settings changes the route takes (no thread involved). Each answers the settings page anew, or
 * a sentence that says what to do (lib/spaces.js nextModeSpaces, nextSpaceSettings, nextDescriptions).
 */
const PAGE_ACTIONS = Object.freeze({
  tick: (s, b, lang) => s.setTick(text(b.modeId, 64), text(b.space, 20), b.on === true, { lang }),
  space: (s, b, lang) => {
    const patch = {};
    if (typeof b.shown === 'boolean') patch.shown = b.shown;
    if (typeof b.startMode === 'string') patch.startMode = text(b.startMode, 64);
    return s.setSpace(text(b.space, 20), patch, { lang });
  },
  describe: (s, b, lang) => s.describe(text(b.modeId, 64), text(b.text, 400), { lang }),
  // Item 4A, stage 6a: Settings → Modes → Spaces (`sealedExtra`, `gridInGuarded`).
  rules: (s, b, lang) => {
    const patch = {};
    if (Array.isArray(b.sealedExtra)) patch.sealedExtra = b.sealedExtra.slice(0, 10).map((name) => text(name, 64));
    if (typeof b.gridInGuarded === 'boolean') patch.gridInGuarded = b.gridInGuarded;
    if (typeof s.setRules !== 'function') throw new Error('This Modes add-on is too old for this. Update it, then try again.');
    return s.setRules(patch, { lang });
  },
});

/** A thread id as the app makes them (the same check as the other routes' x-dsh-session). */
const SESSION_ID = /^[\w.:-]{1,120}$/;
/** A space id (lower-case letters, short). */
const SPACE_ID = /^[a-z]{1,20}$/;

/**
 * Item 4A, stage 2: the route /dsh-modes/mode, the chat box's Mode list. GET (header x-dsh-session, x-dsh-locale) answers
 * the list for a thread (`modes.spaces.view`). POST `{action: 'pick', sessionId, modeId}` changes the mode through
 * Modes itself (`modes.spaces.pick`, so a refusal comes back as a sentence); POST `{action: 'start', sessionId, space,
 * tab, reset}` claims a new draft with its space's start mode (`reset`: a New click, the mode picked earlier is dropped). Stage 5: GET with x-dsh-page: settings answers Settings → Spaces
 * and the ticks on Settings → Modes; POST `{action: 'tick' | 'space' | 'describe', ...}` changes them (PAGE_ACTIONS).
 * Answers `{ok: true, value}` or `{ok: false, error: 'a sentence'}`.
 * @param {{spaces: () => object | undefined, connection: {requestRejection: (req: object) => number | undefined}}} want
 * @returns {(req: object, res: object) => Promise<void>}
 */
export function modeHandler({ spaces, connection }) {
  return async (req, res) => {
    const refused = connection.requestRejection(req);
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
    // Plus is English only (decision 28): a page that sends x-dsh-locale (Chinese included) gets English words.
    const lang = 'en';
    let answer;
    try {
      const service = spaces();
      if (!service) throw new Error('The Modes add-on is not running. Switch it on on the Plugins page, then reload this page.');
      if (req.method === 'GET') {
        const header = req.headers?.['x-dsh-session'];
        const sessionId = typeof header === 'string' && SESSION_ID.test(header) ? header : '';
        // Stage 5: Settings → Spaces and the ticks on Settings → Modes ask with x-dsh-page: settings.
        // Stage 6b (J3, L5, C5): the window's space (x-dsh-space) decides whether a refused message's text is offered back;
        // the page's language is remembered for the thread (always 'en' now).
        const windowSpace = String(req.headers?.['x-dsh-space'] ?? '');
        answer = { ok: true, value: req.headers?.['x-dsh-page'] === 'settings' && typeof service.page === 'function' ? service.page(lang) : service.view(sessionId, lang, { windowSpace: SPACE_ID.test(windowSpace) ? windowSpace : '', page: true }) };
      } else {
        const body = await readJsonBody(req);
        if (Object.hasOwn(PAGE_ACTIONS, body?.action)) {
          answer = { ok: true, value: await PAGE_ACTIONS[body.action](service, body, lang) };
          res.end(JSON.stringify(answer));
          return;
        }
        const sessionId = text(body?.sessionId, 120);
        if (!SESSION_ID.test(sessionId)) throw new Error('No thread was named. Reload the page and try again.');
        if (body?.action === 'pick') {
          await service.pick(sessionId, text(body.modeId, 64), { lang });
          answer = { ok: true, value: service.view(sessionId, lang) };
        } else if (body?.action === 'move') {
          // Stage 3a: threads moved to another space (the sidebar's ⋯ menu). `sessionIds`: at most 500.
          const ids = (Array.isArray(body.sessionIds) ? body.sessionIds : [sessionId]).map((id) => text(id, 120)).filter((id) => SESSION_ID.test(id)).slice(0, 500);
          answer = { ok: true, value: await service.move(ids, text(body.space, 20), { lang }) };
        } else if (body?.action === 'start') {
          const started = await service.startDraft(sessionId, { space: text(body.space, 20), tab: text(body.tab, 64), lang, ...(body.reset === true ? { reset: true } : {}) });
          answer = { ok: true, value: { ...service.view(sessionId, lang), started } };
        } else {
          throw new Error('There is no such action.');
        }
      }
    } catch (error) {
      answer = { ok: false, error: String(error?.message ?? error).replace(/^modes: /, '').slice(0, 400) };
      if (/too large/.test(answer.error)) res.statusCode = 413;
    }
    res.end(JSON.stringify(answer));
  };
}

/** Item 4A, stage 6b (J3): the route the chat box tells that it put a refused message back. */
export const ENGINE_HELD_TAKEN_PATH = '/dsh-modes/engine-held-taken';

/**
 * Item 4A, stage 6b (J3): POST `{sessionId, id}`: the chat box put the refused message's text back (or the owner pressed
 * Put back), so Modes deletes it. 204 when it was that thread's text, 404 when not (already taken, too old, another id).
 * The text itself never travels here.
 * @param {{taken: (sessionId: string, id: string) => boolean, connection: {requestRejection: (req: object) => number | undefined}}} want
 * @returns {(req: object, res: object) => Promise<void>}
 */
export function engineHeldTakenHandler({ taken, connection }) {
  return async (req, res) => {
    const refused = connection.requestRejection(req);
    if (refused !== undefined) {
      res.statusCode = refused;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('allow', 'POST');
      res.end();
      return;
    }
    try {
      const body = await readJsonBody(req);
      const sessionId = text(body?.sessionId, 120);
      const id = text(body?.id, 80);
      res.statusCode = SESSION_ID.test(sessionId) && id && taken(sessionId, id) === true ? 204 : 404;
    } catch (error) {
      res.statusCode = /too large/.test(String(error?.message ?? error)) ? 413 : 400;
    }
    res.end();
  };
}
