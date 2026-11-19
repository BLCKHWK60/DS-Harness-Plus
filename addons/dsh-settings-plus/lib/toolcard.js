/**
 * The permission card, host half: the bridge between the Tool access service (`ctx.get('toolAccess')`, provided by
 * Modes) and the card the browser draws (client.js, "Permission card").
 *
 * The browser asks `GET /dsh-settings-plus/tool-card` about once a second. While it does, a card is registered with the
 * service, so a request waits for the user here. When no page has asked for a few seconds (no window open), the card is
 * withdrawn; a request then cannot be asked and is refused, and it is listed under "Waiting for you" on the Tool access page.
 * An answer comes back as `POST /dsh-settings-plus/tool-card` with `{id, choice}`; the service checks the choice against
 * what the request offered, so a wrong or longer choice counts as Deny.
 */

/** A page that has not asked for this long is gone (milliseconds). */
export const ALIVE_MS = 6000;
export const CARD_PATH = '/dsh-settings-plus/tool-card';
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
const TEXT_MAX = 400;

const clip = (value, max = TEXT_MAX) => String(value ?? '').slice(0, max);

/**
 * What the browser needs of one open request: text only, nothing live (no signal, no functions).
 * @param {object} request - from the service.
 * @param {number} now - the host clock.
 * @returns {object} a plain copy.
 */
export function describeRequest(request, now) {
  const wording = request?.wording ?? {};
  const waitMs = Number.isFinite(request?.waitMs) ? request.waitMs : 600000;
  const openedAt = Number.isFinite(request?.openedAt) ? request.openedAt : now;
  return {
    id: clip(request?.id, 120),
    sessionId: clip(request?.sessionId, 120),
    modeLabel: clip(request?.modeLabel ?? request?.modeId, 80),
    tool: clip(request?.tool, 128),
    plain: clip(request?.plain ?? request?.tool, 120),
    tier: Number.isInteger(request?.tier) ? request.tier : 3,
    risk: clip(wording.risk, 40),
    // The AI's own words: already cleaned by the service, cut again here so nothing long ever crosses.
    reason: clip(wording.reason, 300),
    outsideWarning: clip(wording.outsideWarning),
    reconWarning: clip(wording.reconWarning),
    recon: request?.recon === true,
    outsideMaterial: Boolean(request?.outsideMaterial),
    choices: (Array.isArray(request?.choices) ? request.choices : []).slice(0, 8).map((one) => ({ id: clip(one?.id, 24), label: clip(one?.label, 60) })),
    defaultChoice: 'deny',
    longest: clip(request?.longest, 24),
    openedAt,
    waitMs,
    // The host's own count: the browser's clock may differ.
    remainingMs: Math.max(0, openedAt + waitMs - now),
  };
}

/**
 * @param {{service: () => object | undefined, now?: () => number, setTimer?: Function, clearTimer?: Function}} deps - the service (read each time: Modes may load later) and clocks.
 * @returns {{poll: Function, answer: Function, stop: Function, registered: () => boolean}} the bridge.
 */
export function createCardBridge(deps) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let unregister;
  let timer;
  let service;

  const withdraw = () => {
    clearTimer(timer);
    timer = undefined;
    try {
      unregister?.();
    } catch {
      // already gone
    }
    unregister = undefined;
    service = undefined;
  };
  const keepAlive = () => {
    clearTimer(timer);
    timer = setTimer(withdraw, ALIVE_MS);
    timer?.unref?.();
  };

  return {
    registered: () => unregister !== undefined,
    /** A page looked: make sure the card is registered, and list what is open. */
    poll() {
      const current = deps.service?.();
      if (!current || typeof current.registerCard !== 'function' || typeof current.pending !== 'function') {
        withdraw();
        return { ready: false, now: now(), requests: [] };
      }
      if (current.enabled?.() === false) {
        withdraw();
        return { ready: true, off: true, now: now(), requests: [] };
      }
      if (unregister === undefined || service !== current) {
        withdraw();
        service = current;
        // The card's own work is done through `answer`; this handler only keeps the service from using the app's card, and ends with the wait.
        unregister = current.registerCard((request) => new Promise((resolve) => {
          const done = () => resolve({ choice: 'timeout' });
          if (request?.signal?.aborted) done();
          else request?.signal?.addEventListener?.('abort', done, { once: true });
        }));
      }
      keepAlive();
      const at = now();
      const requests = (current.pending() ?? []).map((one) => describeRequest(one, at));
      return { ready: true, now: at, requests };
    },
    /** @returns {{ok: boolean, reason?: string}} whether the answer reached an open request. */
    answer({ id, choice }) {
      if (!ID.test(String(id ?? ''))) return { ok: false, reason: 'No request given.' };
      const current = deps.service?.();
      if (!current || typeof current.answer !== 'function') return { ok: false, reason: 'Tool access is not available.' };
      const open = (current.pending?.() ?? []).find((one) => one.id === id);
      if (!open) return { ok: false, reason: 'That request is no longer waiting.' };
      // Only a choice the request offered; anything else is Deny (the service checks again).
      const offered = (open.choices ?? []).some((one) => one.id === choice);
      const taken = current.answer(id, { choice: offered ? choice : 'deny' });
      return taken ? { ok: true } : { ok: false, reason: 'That request is no longer waiting.' };
    },
    stop: withdraw,
  };
}
