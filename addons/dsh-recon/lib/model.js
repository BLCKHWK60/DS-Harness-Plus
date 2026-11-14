/**
 * Where a conversation's model runs, and whether research content may be sent to it. A model on
 * this computer or in the user's own network gets it without a question. Any other model gets it
 * only after the user agreed, for that conversation, since the app was started.
 */

/**
 * Where a model runs, told from its provider's address.
 * @param {unknown} address - the provider's base URL; undefined when it is not known.
 * @returns {{where: 'local' | 'network' | 'cloud' | 'unknown', host: string}} `local` is this computer, `network` a private address in the user's own network.
 */
export function whereOf(address) {
  let host;
  try {
    host = new URL(String(address ?? '')).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return { where: 'unknown', host: '' };
  }
  if (!host) return { where: 'unknown', host: '' };
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host) || host === '0.0.0.0') return { where: 'local', host };
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) return { where: 'network', host };
    return { where: 'cloud', host };
  }
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return { where: 'network', host };
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home') || host.endsWith('.internal') || !host.includes('.')) return { where: 'network', host };
  return { where: 'cloud', host };
}

/**
 * Where a provider's models run, from the app's provider settings.
 * @param {object | undefined} providers - the app's own-provider table (id -> { baseURL, displayName }).
 * @param {unknown} provider - the provider's id.
 * @returns {{where: string, host: string, name: string}} what cannot be told is `unknown`, and is treated as cloud.
 */
export function providerPlace(providers, provider) {
  const id = String(provider ?? '');
  if (!id) return { where: 'unknown', host: '', name: '' };
  const own = providers?.[id];
  if (own && typeof own === 'object') {
    const address = own.baseURL ?? own.baseUrl;
    const name = String(own.displayName ?? id);
    return address ? { ...whereOf(address), name } : { where: 'cloud', host: '', name };
  }
  if (/^deepseek/i.test(id)) return { where: 'cloud', host: 'DeepSeek', name: 'DeepSeek' };
  return { where: 'unknown', host: '', name: id };
}

/** @returns {boolean} whether content may go to a model at that place without asking. */
export const staysHome = (place) => place?.where === 'local' || place?.where === 'network';

/**
 * Who agreed to what. Held in memory only: closing the app forgets every agreement.
 * @returns {object} the record.
 */
export function openConsent() {
  /** conversation id -> the provider and model the user agreed to. */
  const agreed = new Map();
  const key = (route) => `${route?.provider ?? ''}\u0000${route?.model ?? ''}`;
  return {
    /** The user agrees that this conversation's content goes to this model. */
    agree: (id, route) => agreed.set(String(id), key(route)),
    /** @returns {boolean} whether the user agreed for this conversation and this very model. */
    has: (id, route) => agreed.get(String(id)) === key(route),
    forget: (id) => agreed.delete(String(id)),
  };
}

/**
 * May research content go to this conversation's model?
 * @param {object} input - `place` (from providerPlace), `route` ({provider, model} or undefined), `id` (conversation), `consent`.
 * @returns {{ok: boolean, why: string}} `why` is for the user, in plain words.
 */
export function mayReceive({ place, route, id, consent }) {
  if (!route) return { ok: false, why: 'The model of this conversation could not be told, so nothing is sent to it. Pick a model in the chat box.' };
  if (staysHome(place)) return { ok: true, why: '' };
  if (consent.has(id, route)) return { ok: true, why: '' };
  const who = place?.where === 'cloud' ? `a cloud model (${place.name || route.provider}${place.host ? `, ${place.host}` : ''})` : `a model whose location is unknown (${place?.name || route.provider})`;
  return { ok: false, why: `This conversation uses ${who}. What Recon finds would be sent to it. Nothing has been sent. To agree for this conversation, the user types /recon cloud. To avoid it, the user picks a model on this computer or in their own network.` };
}
