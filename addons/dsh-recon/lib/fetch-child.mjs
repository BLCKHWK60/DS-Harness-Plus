/**
 * Recon's fetch process. It runs locked down (see sandbox.js): it can open one local port, the
 * proxy's, and no file. It reads one request from its input, fetches one page through the proxy,
 * turns it into plain text, and writes one JSON answer. Hostile pages are read here and nowhere
 * else; the app only ever sees the text this process hands back.
 *
 * It asks for the page itself and nothing the page points to: no pictures, scripts, styles,
 * frames or downloads are ever requested. One GET, no cookies, no body.
 */
import net from 'node:net';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

export const ALLOWED_TYPES = ['text/html', 'text/plain', 'application/xhtml+xml'];
const TEXT_MAX = 200_000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', middot: '·', euro: '€', pound: '£' };

/** @returns {string} text with HTML entities turned into characters. */
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Characters that hide or reorder text: controls, zero-width, direction overrides, tags. */
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]|\udb40[\udc00-\udc7f]/g;

/** @returns {string} text without hidden characters, with space runs and blank-line runs folded. */
export function tidy(text) {
  return String(text).replace(HIDDEN, '').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A page as plain text. Everything that is not text is dropped, not fetched.
 * @param {string} html - the page.
 * @param {string} base - the page's own address, to complete its links.
 * @returns {{title: string, text: string, links: {url: string, text: string}[]}} links are kept only when they point to an .onion address.
 */
export function htmlToText(html, base) {
  let page = String(html).replace(/<!--[\s\S]*?-->/g, ' ');
  const title = tidy(decodeEntities((/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(page)?.[1] ?? '').replace(/<[^>]*>/g, ' '))).slice(0, 300);
  page = page.replace(/<(script|style|noscript|template|svg|math|iframe|object|embed|applet|canvas|audio|video|picture|map|head|select|textarea)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // An unclosed block of the same kinds swallows the rest of the page: nothing after it is trusted.
  page = page.replace(/<(script|style|noscript|template|svg|iframe|object|embed|textarea)\b[\s\S]*$/i, ' ');
  const links = [];
  const seen = new Set();
  page = page.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_whole, attrs, inner) => {
    const label = tidy(decodeEntities(String(inner).replace(/<[^>]*>/g, ' '))).slice(0, 200);
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const raw = decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
    let url = '';
    try {
      const made = new URL(raw, base);
      made.hash = '';
      if ((made.protocol === 'http:' || made.protocol === 'https:') && /(^|\.)[a-z2-7]{56}\.onion$/.test(made.hostname) && !made.username && !made.password) url = made.href;
    } catch {
      url = '';
    }
    if (url && url.length <= 600 && !seen.has(url) && links.length < 300) {
      seen.add(url);
      links.push({ url, text: label });
    }
    return ` ${label} `;
  });
  page = page.replace(/<(br|hr)\b[^>]*>/gi, '\n').replace(/<\/?(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|dl|dt|dd|tr|table|thead|tbody|h[1-6]|pre|blockquote|form|fieldset|figure|figcaption|address|details|summary)\b[^>]*>/gi, '\n').replace(/<\/(td|th)\s*>/gi, ' | ');
  page = page.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, ' ');
  const text = tidy(decodeEntities(page));
  return { title, text: text.slice(0, TEXT_MAX), links };
}

/**
 * The hidden fields of a page's first search form, so a search can be sent the way the page's own
 * form would send it. Only forms that send with GET count; nothing is ever posted.
 * @param {string} html - the page.
 * @returns {{action: string, fields: Record<string, string>} | undefined}
 */
export function searchForm(html) {
  for (const match of String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
    const attr = (text, name) => decodeEntities(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(text)?.slice(1).find((part) => part !== undefined) ?? '');
    if ((attr(match[1], 'method') || 'get').toLowerCase() !== 'get') continue;
    const fields = {};
    for (const input of match[2].matchAll(/<input\b([^>]*)>/gi)) {
      if (attr(input[1], 'type').toLowerCase() !== 'hidden') continue;
      const name = attr(input[1], 'name').slice(0, 60);
      if (/^[\w.-]{1,60}$/.test(name) && Object.keys(fields).length < 8) fields[name] = attr(input[1], 'value').slice(0, 200);
    }
    return { action: attr(match[1], 'action').slice(0, 300), fields };
  }
  return undefined;
}

/**
 * A search engine's result page as a list. Each result is a block that holds a link to an .onion
 * address (given straight, or inside the engine's own redirect link), a title and a description.
 * @param {string} html - the result page.
 * @param {string} base - the page's own address.
 * @returns {{url: string, title: string, description: string, seen: string}[]} at most 60 results.
 */
export function searchResults(html, base) {
  const page = String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const plain = (text) => tidy(decodeEntities(String(text ?? '').replace(/<[^>]*>/g, ' ')));
  const out = [];
  const seen = new Set();
  for (const block of page.matchAll(/<li\b[^>]*class\s*=\s*["'][^"']*\bresult\b[^"']*["'][^>]*>([\s\S]*?)<\/li\s*>/gi)) {
    const link = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/i.exec(block[1]);
    if (!link) continue;
    let target = decodeEntities(link[1] ?? link[2] ?? '').trim();
    const inside = /[?&]redirect_url=([^&]+)/.exec(target);
    if (inside) {
      try {
        target = decodeURIComponent(inside[1]);
      } catch {
        target = inside[1];
      }
    }
    let url = '';
    try {
      const made = new URL(target, base);
      made.hash = '';
      if ((made.protocol === 'http:' || made.protocol === 'https:') && /(^|\.)[a-z2-7]{56}\.onion$/.test(made.hostname) && !made.username && !made.password) url = made.href;
    } catch {
      url = '';
    }
    if (!url || url.length > 600 || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: plain(link[3]).slice(0, 200),
      description: plain(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(block[1])?.[1]).slice(0, 400),
      seen: plain(/data-timestamp\s*=\s*"([^"]*)"/i.exec(block[1])?.[1]).slice(0, 60),
    });
    if (out.length >= 60) break;
  }
  return out;
}

/** Open a connection to `host:port` through a SOCKS5 proxy. The proxy resolves the name; this process never does. */
function viaSocks({ proxyPort, host, port, user, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
    const fail = (why) => {
      socket.destroy();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('the proxy did not answer in time'), timeoutMs);
    let stage = 'hello';
    let buffered = Buffer.alloc(0);
    socket.on('error', (error) => fail(`could not reach the proxy (${error.code ?? error.message})`));
    socket.on('connect', () => socket.write(Buffer.from(user ? [5, 1, 2] : [5, 1, 0])));
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (stage === 'hello') {
        if (buffered.length < 2) return;
        const method = buffered[1];
        buffered = buffered.subarray(2);
        if (method === 2 && user) {
          const name = Buffer.from(String(user).slice(0, 200));
          const pass = Buffer.from('recon');
          socket.write(Buffer.concat([Buffer.from([1, name.length]), name, Buffer.from([pass.length]), pass]));
          stage = 'auth';
        } else if (method === 0) {
          request();
        } else fail('the proxy refused the connection method');
        return;
      }
      if (stage === 'auth') {
        if (buffered.length < 2) return;
        if (buffered[1] !== 0) return fail('the proxy refused the sign-in');
        buffered = buffered.subarray(2);
        request();
        return;
      }
      if (stage === 'connect') {
        if (buffered.length < 5) return;
        if (buffered[1] !== 0) return fail(`the proxy could not open the address (code ${buffered[1]})`);
        const need = buffered[3] === 1 ? 10 : buffered[3] === 4 ? 22 : 7 + buffered[4];
        if (buffered.length < need) return;
        clearTimeout(timer);
        socket.off('data', onData);
        const rest = buffered.subarray(need);
        if (rest.length > 0) socket.unshift(rest);
        resolve(socket);
      }
    };
    const request = () => {
      const name = Buffer.from(host);
      if (name.length === 0 || name.length > 255) return fail('the address is not usable');
      stage = 'connect';
      socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]));
    };
    socket.on('data', onData);
  });
}

/** Take a chunked body apart. Stops quietly at a broken chunk. */
function dechunk(body) {
  const parts = [];
  let at = 0;
  for (;;) {
    const end = body.indexOf('\r\n', at);
    if (end < 0) break;
    const size = parseInt(body.subarray(at, end).toString('latin1').split(';')[0].trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    parts.push(body.subarray(end + 2, end + 2 + size));
    at = end + 2 + size + 2;
    if (at >= body.length) break;
  }
  return Buffer.concat(parts);
}

/**
 * One GET through the proxy.
 * @param {object} req - `url`, `proxyPort`, `user` (keeps conversations on separate circuits), `maxBytes`, `timeoutMs`.
 * @returns {Promise<object>} `{ok: true, status, type, title, text, links, bytes, cut}`, `{ok: true, status, redirect}`, or `{ok: false, why}`.
 */
export async function get(req) {
  const url = new URL(String(req.url));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, why: 'only http and https addresses are read' };
  const secure = url.protocol === 'https:';
  const port = Number(url.port) || (secure ? 443 : 80);
  const maxBytes = Math.min(Math.max(Number(req.maxBytes) || 1_000_000, 10_000), 4_000_000);
  const timeoutMs = Math.min(Math.max(Number(req.timeoutMs) || 60_000, 2_000), 180_000);
  let socket = await viaSocks({ proxyPort: Number(req.proxyPort), host: url.hostname, port, user: req.user, timeoutMs });
  if (secure) {
    // An .onion address is its own proof of identity; its certificate is usually self-signed.
    socket = await new Promise((resolve, reject) => {
      const wrapped = tls.connect({ socket, servername: url.hostname, rejectUnauthorized: false }, () => resolve(wrapped));
      wrapped.on('error', (error) => reject(new Error(`the secure connection failed (${error.code ?? error.message})`)));
    });
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, why: 'the page did not arrive in time' }), timeoutMs);
    let raw = Buffer.alloc(0);
    let head;
    let bodyStart = 0;
    const settle = (cut) => {
      let body = raw.subarray(bodyStart);
      if (/chunked/i.test(head.headers['transfer-encoding'] ?? '')) body = dechunk(body);
      const charset = (/charset\s*=\s*"?([\w-]+)/i.exec(head.headers['content-type'] ?? '')?.[1] ?? 'utf-8').toLowerCase();
      let text;
      try {
        text = new TextDecoder(charset, { fatal: false }).decode(body);
      } catch {
        text = new TextDecoder('utf-8', { fatal: false }).decode(body);
      }
      // What is handed back depends on what was asked for: a page's text, a result list, a search
      // form's hidden fields, or a list of fingerprints (the blocklist). Never the page as it came.
      let page;
      if (req.shape === 'hashes') page = { hashes: [...new Set(text.match(/\b[0-9a-f]{32}\b/g) ?? [])].slice(0, 400_000) };
      else if (req.shape === 'form') page = { form: searchForm(text) ?? null };
      else if (req.shape === 'results') {
        const results = searchResults(text, url.href);
        page = { results, ...(results.length === 0 ? { links: htmlToText(text, url.href).links.slice(0, 80) } : {}) };
      } else page = head.type === 'text/plain' ? { title: '', text: tidy(text).slice(0, TEXT_MAX), links: [] } : htmlToText(text, url.href);
      finish({ ok: true, status: head.status, type: head.type, ...page, bytes: body.length, cut });
    };
    socket.on('error', (error) => finish({ ok: false, why: `the connection broke (${error.code ?? error.message})` }));
    socket.on('data', (chunk) => {
      raw = Buffer.concat([raw, chunk]);
      if (!head) {
        const end = raw.indexOf('\r\n\r\n');
        if (end < 0) {
          if (raw.length > 64_000) finish({ ok: false, why: 'the answer had no proper beginning' });
          return;
        }
        const lines = raw.subarray(0, end).toString('latin1').split('\r\n');
        const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(lines[0])?.[1]);
        if (!status) return finish({ ok: false, why: 'the answer was not a web page' });
        const headers = {};
        for (const line of lines.slice(1)) {
          const cut = line.indexOf(':');
          if (cut > 0) headers[line.slice(0, cut).trim().toLowerCase()] = line.slice(cut + 1).trim();
        }
        bodyStart = end + 4;
        if (status >= 300 && status < 400 && headers.location) return finish({ ok: true, status, redirect: String(headers.location).slice(0, 800) });
        const type = String(headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        // Anything that is not text is refused before a single byte of it is read.
        if (!ALLOWED_TYPES.includes(type)) return finish({ ok: false, why: `the address holds ${type || 'something that does not say what it is'}, not text, so it was not read`, status });
        head = { status, headers, type };
      }
      if (head && raw.length - bodyStart >= maxBytes) {
        raw = raw.subarray(0, bodyStart + maxBytes);
        settle(true);
      }
    });
    socket.on('end', () => (head ? settle(false) : finish({ ok: false, why: 'the connection closed before the page began' })));
    const path = `${url.pathname || '/'}${url.search}`;
    const hostHeader = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    socket.write(
      [
        `GET ${path} HTTP/1.1`,
        `Host: ${hostHeader}`,
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept: text/html,application/xhtml+xml,text/plain;q=0.9',
        'Accept-Language: en-US,en;q=0.5',
        'Accept-Encoding: identity',
        'Connection: close',
        '',
        '',
      ].join('\r\n'),
    );
  });
}

/** For the leak test only: can this process open a connection to somewhere? It should not be able to. */
function probe({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: String(host), port: Number(port) });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: true, reached: false, why: 'no answer' });
    }, 3000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: true, reached: true });
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: true, reached: false, why: String(error.code ?? error.message) });
    });
  });
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let answer;
  try {
    const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (req.op === 'get') answer = await get(req);
    else if (req.op === 'probe') answer = await probe(req);
    else if (req.op === 'readfile') {
      // For the leak test only: this process should not be able to read the user's files.
      const { readFileSync } = await import('node:fs');
      try {
        answer = { ok: true, read: readFileSync(String(req.path), 'utf8').length >= 0 };
      } catch (error) {
        answer = { ok: true, read: false, why: String(error.code ?? error.message) };
      }
    } else answer = { ok: false, why: 'unknown request' };
  } catch (error) {
    answer = { ok: false, why: String(error?.message ?? error).slice(0, 300) };
  }
  process.stdout.write(JSON.stringify(answer), () => process.exit(0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
