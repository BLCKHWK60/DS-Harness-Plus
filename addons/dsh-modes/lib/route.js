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
  catalogueForMode: (s, a) => s.catalogueForMode(text(a.modeId), { group: text(a.group, 60) || undefined, search: text(a.search, 60) || undefined }),
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
