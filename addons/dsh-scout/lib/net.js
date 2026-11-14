/**
 * Read-only requests to the job sources: GET only, a size cap, a time limit, a pause between two
 * requests to the same service, and a short memory so one run does not ask twice for the same thing.
 */
import https from 'node:https';

/** How Scout names itself to the services. No personal details. */
export const AGENT = 'DeepSeek-Harness-Plus scout add-on';
const TIMEOUT_MS = 20_000;
const BODY_MAX = 8 * 1024 * 1024;
const KEEP_MS = 10 * 60 * 1000;
const PAUSE_MS = 1000;

/** The network; replaceable by tests. */
export const hooks = {
  /**
   * @param {string} url - an https address.
   * @param {Record<string, string>} headers - extra request headers.
   * @returns {Promise<{status: number, text: string}>} the answer.
   */
  get(url, headers = {}) {
    return new Promise((done, fail) => {
      const request = https.get(url, { headers: { 'user-agent': AGENT, accept: 'application/json', ...headers }, timeout: TIMEOUT_MS, autoSelectFamily: true }, (response) => {
        let size = 0;
        const chunks = [];
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > BODY_MAX) request.destroy(new Error('the answer was too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => done({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', fail);
      });
      request.on('timeout', () => request.destroy(new Error('the service did not answer in time')));
      request.on('error', fail);
    });
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const cache = new Map();
const last = new Map();

/** Forget everything kept (for tests). */
export function forget() {
  cache.clear();
  last.clear();
}

/** What a refusal by a service means, in plain words. */
function failure(host, status) {
  if (status === 401 || status === 403) return `${host} refused the request (status ${status}). If it needs a key, check the key in Settings → Scout.`;
  if (status === 404) return `${host} has nothing at that address (status 404).`;
  if (status === 429) return `${host} asked to slow down (status 429). Do not retry it in this run.`;
  return `${host} answered with status ${status}.`;
}

/**
 * GET a JSON document.
 * @param {string} url - an https address.
 * @param {Record<string, string>} [headers] - extra headers (keys go here, never in the address when avoidable).
 * @returns {Promise<unknown>} the parsed answer; throws with a plain reason otherwise.
 */
export async function getJson(url, headers = {}) {
  const address = new URL(url);
  if (address.protocol !== 'https:') throw new Error('only https addresses are read');
  const key = `${url}\u0000${JSON.stringify(headers)}`;
  const kept = cache.get(key);
  if (kept && hooks.now() - kept.at < KEEP_MS) return kept.value;
  const since = hooks.now() - (last.get(address.hostname) ?? 0);
  if (since < PAUSE_MS) await hooks.sleep(PAUSE_MS - since);
  last.set(address.hostname, hooks.now());
  const answer = await hooks.get(url, headers);
  if (answer.status !== 200) throw new Error(failure(address.hostname, answer.status));
  let value;
  try {
    value = JSON.parse(answer.text);
  } catch {
    throw new Error(`${address.hostname} gave an answer that could not be read`);
  }
  cache.set(key, { at: hooks.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

/** HTML or markup as plain text: tags dropped, entities decoded, blank lines squeezed. */
export function plainText(html) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '\'', lsquo: '\'', rdquo: '"', ldquo: '"', bull: '•', euro: '€', pound: '£' };
  const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return named[code.toLowerCase()] ?? whole;
  });
  // Some services send their HTML escaped once more.
  let text = String(html ?? '');
  if (/&lt;\/?[a-z]/i.test(text) && !/<\/?[a-z]/i.test(text)) text = decode(text);
  text = text
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  return decode(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
