/**
 * Where a model runs, told from its provider's address (the same rule Recon uses; copied so Creator
 * Plus works with Recon switched off). Logs go to a model outside this Mac only when the user's setting
 * allows it (fixed rule 6; the build prompt: "Ask me before a model outside this Mac reads them").
 */

/** @returns {{where: 'local' | 'network' | 'cloud' | 'unknown', host: string}} `local` is this Mac, `network` a private address in the user's own network. */
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
 * @param {object | undefined} providers - the app's own-provider table (id → { baseURL, displayName }).
 * @param {unknown} provider - the provider's id.
 * @returns {{where: string, host: string, name: string}} what cannot be told is `unknown` (treated as outside this Mac).
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
  return { where: 'unknown', host: '', name: id };
}

/** Who may read the logs, by the user's setting. */
export const LOG_READERS = {
  'this-mac': { label: 'Only models on this Mac', allows: (where) => where === 'local' },
  'my-network': { label: 'Models on this Mac and in my own network', allows: (where) => where === 'local' || where === 'network' },
  any: { label: 'Any model, also cloud models', allows: () => true },
};

/** @returns {string} why this model may not read logs, or ''. */
export function logRefusal(setting, place) {
  const rule = LOG_READERS[setting] ?? LOG_READERS['this-mac'];
  if (rule.allows(place?.where)) return '';
  return `The session logs are read only by ${rule.label.toLowerCase()} (your setting on the Creator Plus page), and this conversation's model runs ${place?.where === 'cloud' ? `outside this Mac (${place.name || 'a cloud service'})` : place?.where === 'network' ? `on another machine in your network (${place.host})` : 'in a place that cannot be told'}. Nothing was read. Switch to a model on this Mac, or change the setting.`;
}
