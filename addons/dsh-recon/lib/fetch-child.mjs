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

// ---- Usenet: text newsgroups over NNTP ------------------------------------------------------------

/** Parts of a group name that mean files, not text. A group with one of them is never listed or opened. */
const BINARY_GROUP = /(^|\.)(binaries|binary|bin|binaer|pictures|picture|pics|images|multimedia|mp3|mp3s|sounds|movies|movie|video|videos|dvd|dvdr|cd|iso|warez|wares|erotica|x264|x265|hdtv|divx|ebook|ebooks|mm|nzb|nzbs|boneless|teevee|ftd|fileshare|files)(\.|$)/i;

/** @returns {boolean} whether a newsgroup is a text group Recon may open. */
export function textGroup(name) {
  const group = String(name ?? '').toLowerCase();
  return /^[a-z0-9][a-z0-9+_-]*(\.[a-z0-9+_-]+){1,12}$/.test(group) && group.length <= 160 && !BINARY_GROUP.test(group);
}

/** A header value with its encoded words ("=?utf-8?B?...?=") made readable. */
export function decodeWords(value) {
  return tidy(String(value ?? '').replace(/=\?([\w-]+)\?([bBqQ])\?([^?]*)\?=(\s+(?==\?))?/g, (_whole, charset, kind, body) => {
    try {
      const bytes = kind.toLowerCase() === 'b' ? Buffer.from(body, 'base64') : Buffer.from(body.replace(/_/g, ' ').replace(/=([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
      return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
    } catch {
      return ' ';
    }
  })).slice(0, 400);
}

/** Whether a body carries a file in disguise: yEnc, uuencode, or a long run of base64. */
export function carriesFile(body) {
  const text = String(body);
  if (/^=ybegin /m.test(text) || /^begin [0-7]{3,4} \S/m.test(text)) return true;
  let run = 0;
  for (const line of text.split('\n')) {
    if (/^[A-Za-z0-9+/]{60,76}={0,2}\r?$/.test(line)) {
      run += 1;
      if (run >= 12) return true;
    } else run = 0;
  }
  return false;
}

const decodeBody = (raw, encoding, charset) => {
  const kind = String(encoding ?? '').trim().toLowerCase();
  let bytes = raw;
  if (kind === 'base64') bytes = Buffer.from(raw.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  else if (kind === 'quoted-printable') bytes = Buffer.from(raw.toString('latin1').replace(/=\r?\n/g, '').replace(/=([0-9a-fA-F]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
  try {
    return new TextDecoder(String(charset || 'utf-8').toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
};
const headerMap = (block) => {
  const headers = {};
  for (const line of String(block).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const cut = line.indexOf(':');
    if (cut > 0) headers[line.slice(0, cut).trim().toLowerCase()] ??= line.slice(cut + 1).trim();
  }
  return headers;
};
const param = (value, name) => new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(String(value ?? ''))?.slice(1).find((part) => part !== undefined) ?? '';

/**
 * The text of an article. Parts that are not plain text are dropped, and an article that carries a
 * file is refused whole.
 * @param {object} headers - the article's headers, lower-case names.
 * @param {Buffer} body - its body as it came.
 * @returns {{ok: true, text: string, dropped: number} | {ok: false, why: string}}
 */
export function articleText(headers, body) {
  const type = String(headers['content-type'] ?? 'text/plain').toLowerCase();
  const main = type.split(';')[0].trim();
  if (main.startsWith('multipart/')) {
    const boundary = param(headers['content-type'], 'boundary');
    if (!boundary) return { ok: false, why: 'the article is in several parts that cannot be told apart, so it was not read' };
    const pieces = body.toString('latin1').split(`--${boundary}`).slice(1).filter((piece) => !piece.startsWith('--'));
    const texts = [];
    let dropped = 0;
    for (const piece of pieces.slice(0, 30)) {
      const cut = piece.search(/\r?\n\r?\n/);
      const own = headerMap(cut < 0 ? piece : piece.slice(0, cut));
      const kind = String(own['content-type'] ?? 'text/plain').toLowerCase().split(';')[0].trim();
      const rest = cut < 0 ? '' : piece.slice(cut).replace(/^\r?\n\r?\n/, '');
      if (kind !== 'text/plain' || /attachment/i.test(own['content-disposition'] ?? '')) {
        dropped += 1;
        continue;
      }
      const text = decodeBody(Buffer.from(rest, 'latin1'), own['content-transfer-encoding'], param(own['content-type'], 'charset'));
      if (carriesFile(text)) return { ok: false, why: 'the article carries an encoded file, so it was not read' };
      texts.push(text);
    }
    if (texts.length === 0) return { ok: false, why: 'the article has no plain text part, so it was not read' };
    return { ok: true, text: tidy(texts.join('\n\n')).slice(0, TEXT_MAX), dropped };
  }
  if (main !== 'text/plain' && main !== 'text' && main !== '') return { ok: false, why: `the article is ${main}, not plain text, so it was not read` };
  if (carriesFile(body.toString('latin1'))) return { ok: false, why: 'the article carries an encoded file, so it was not read' };
  const text = decodeBody(body, headers['content-transfer-encoding'], param(headers['content-type'], 'charset'));
  if (carriesFile(text)) return { ok: false, why: 'the article carries an encoded file, so it was not read' };
  return { ok: true, text: tidy(text).slice(0, TEXT_MAX), dropped: 0 };
}

/**
 * One visit to a news server: sign in, do one thing, leave. The connection is encrypted from this
 * process to the server; what carries it there (a local forwarder, or a proxy) sees only ciphertext.
 * @param {object} req - `port` (the one local port this process may reach), `server` (the news server's name, for the
 *   certificate), `user`, `pass`, `via` ('forward' or 'socks'), `serverPort`, and `action`: 'groups' (`pattern`),
 *   'over' (`group`, `subject`, `author`, `since`, `span`) or 'article' (`messageId`, `maxBytes`). `ca` is for tests.
 * @returns {Promise<object>} `{ok: true, ...}` or `{ok: false, why}`. The password is never part of an answer.
 */
export async function nntp(req) {
  const timeoutMs = Math.min(Math.max(Number(req.timeoutMs) || 60_000, 2_000), 180_000);
  const server = String(req.server);
  const raw = req.via === 'socks'
    ? await viaSocks({ proxyPort: Number(req.port), host: server, port: Number(req.serverPort) || 563, user: req.circuit, timeoutMs })
    : await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port: Number(req.port) }, () => resolve(socket));
      socket.on('error', (error) => reject(new Error(`could not reach the connection (${error.code ?? error.message})`)));
    });
  const socket = await new Promise((resolve, reject) => {
    const wrapped = tls.connect({ socket: raw, servername: server, ...(req.ca ? { ca: req.ca } : {}) }, () => resolve(wrapped));
    wrapped.on('error', (error) => reject(new Error(`the encrypted connection to the news server failed (${error.code ?? error.message})`)));
  });
  let buffered = Buffer.alloc(0);
  let waiting;
  let failed;
  const wake = () => {
    const done = waiting;
    waiting = undefined;
    done?.();
  };
  socket.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    wake();
  });
  socket.on('error', (error) => {
    failed = new Error(`the connection broke (${error.code ?? error.message})`);
    wake();
  });
  socket.on('close', () => {
    failed ??= new Error('the news server closed the connection');
    wake();
  });
  const deadline = Date.now() + timeoutMs;
  const more = async () => {
    if (failed) throw failed;
    const left = deadline - Date.now();
    if (left <= 0) throw new Error('the news server did not answer in time');
    await new Promise((resolve) => {
      waiting = resolve;
      setTimeout(resolve, left);
    });
    if (failed && buffered.length === 0) throw failed;
  };
  /** One line, without its line end. */
  const line = async () => {
    for (;;) {
      const end = buffered.indexOf('\r\n');
      if (end >= 0) {
        const text = buffered.subarray(0, end);
        buffered = buffered.subarray(end + 2);
        return text;
      }
      if (buffered.length > 2_000_000) throw new Error('the news server sent a line that never ends');
      await more();
    }
  };
  /** A block that ends with a line holding one dot. Stops reading into memory after `max` bytes but reads on to the end. */
  const block = async (max) => {
    const lines = [];
    let size = 0;
    let cut = false;
    for (;;) {
      const next = await line();
      if (next.length === 1 && next[0] === 46) return { lines, cut };
      const clean = next[0] === 46 ? next.subarray(1) : next;
      if (size + clean.length > max) {
        cut = true;
        if (size > max * 4 + 4_000_000) throw new Error('the article is far too large to be text');
        size += clean.length;
        continue;
      }
      size += clean.length + 1;
      lines.push(clean);
    }
  };
  /** What the server said next to a code, short and clean, for a message. */
  const words = (text) => {
    const clean = tidy(String(text ?? '')).replace(/[^\x20-\x7e]/g, ' ').slice(0, 90).trim();
    return clean ? `, the server said: "${clean}"` : '';
  };
  const say = async (command) => {
    socket.write(`${command}\r\n`);
    const answer = (await line()).toString('latin1');
    return { code: Number(answer.slice(0, 3)), text: answer.slice(4) };
  };
  try {
    const hello = (await line()).toString('latin1');
    if (!/^20[01]/.test(hello)) return { ok: false, why: `the news server did not welcome the connection (${hello.slice(0, 80)})` };
    if (req.user) {
      const first = await say(`AUTHINFO USER ${String(req.user).replace(/[\r\n]/g, '')}`);
      if (first.code === 381) {
        const second = await say(`AUTHINFO PASS ${String(req.pass ?? '').replace(/[\r\n]/g, '')}`);
        if (second.code !== 281) return { ok: false, why: `the news server refused the sign-in (code ${second.code})` };
      } else if (first.code !== 281) return { ok: false, why: `the news server refused the sign-in (code ${first.code})` };
    }
    // Some servers hand out reading commands only after this. Its answer does not matter.
    await say('MODE READER').catch(() => undefined);
    if (req.action === 'groups') {
      const pattern = String(req.pattern ?? '').toLowerCase().replace(/[^a-z0-9.+_-]/g, '').slice(0, 80);
      if (pattern.length < 2) return { ok: false, why: 'give at least two characters of a group name' };
      const asked = await say(`LIST ACTIVE *${pattern}*`);
      if (asked.code !== 215) return { ok: false, why: `the news server would not list groups (code ${asked.code})` };
      const { lines } = await block(3_000_000);
      const groups = [];
      let hidden = 0;
      for (const entry of lines) {
        const [name, high, low] = entry.toString('latin1').split(/\s+/);
        if (!textGroup(name)) {
          hidden += 1;
          continue;
        }
        if (groups.length < 150) groups.push({ group: name.toLowerCase(), articles: Math.max(0, Number(high) - Number(low) + 1) || 0 });
      }
      return { ok: true, groups, hidden };
    }
    if (!textGroup(req.group)) return { ok: false, why: 'that is not a text newsgroup, so it was not opened' };
    const entered = await say(`GROUP ${String(req.group).toLowerCase()}`);
    if (entered.code !== 211) return { ok: false, why: entered.code === 411 ? 'the news server has no such group' : `the news server would not open the group (code ${entered.code}${words(entered.text)})` };
    const [, low, high] = entered.text.split(/\s+/).map(Number);
    if (req.action === 'over') {
      const span = Math.min(Math.max(Number(req.span) || 3000, 100), 20_000);
      const from = Math.max(low || 0, (high || 0) - span + 1);
      // Servers differ: some know OVER, some only the older XOVER, and they refuse the one they do
      // not know with different codes. Both are tried before giving up.
      let asked = await say(`OVER ${from}-${high}`);
      if (asked.code !== 224 && asked.code !== 420 && asked.code !== 423) {
        const older = await say(`XOVER ${from}-${high}`);
        if (older.code === 224 || older.code === 420 || older.code === 423) asked = older;
      }
      if (asked.code !== 224) return { ok: false, why: asked.code === 420 || asked.code === 423 ? 'the group has no articles in that range' : `the news server would not list articles (code ${asked.code}${words(asked.text)})` };
      const { lines } = await block(8_000_000);
      const subject = String(req.subject ?? '').toLowerCase().trim();
      const author = String(req.author ?? '').toLowerCase().trim();
      const since = Date.parse(String(req.since ?? '')) || 0;
      const found = [];
      let files = 0;
      for (let at = lines.length - 1; at >= 0 && found.length < 40; at -= 1) {
        const [number, rawSubject, rawFrom, date, messageId, , bytes, count] = lines[at].toString('latin1').split('\t');
        const title = decodeWords(rawSubject);
        const who = decodeWords(rawFrom);
        // A file posting gives itself away: yEnc in the subject, "(3/41)" part counts, or a size no message has.
        if (/yenc|\(\d+\/\d+\)|\[\d+\/\d+\]/i.test(title) || Number(bytes) > 150_000 || Number(count) > 3000) {
          files += 1;
          continue;
        }
        if (subject && !subject.split(/\s+/).every((word) => title.toLowerCase().includes(word))) continue;
        if (author && !who.toLowerCase().includes(author)) continue;
        if (since && (Date.parse(date) || 0) < since) continue;
        if (!/^<[^<>\s]{3,250}>$/.test(String(messageId).trim())) continue;
        found.push({ number: Number(number), subject: title, author: who, date: tidy(date).slice(0, 60), messageId: messageId.trim(), bytes: Number(bytes) || 0 });
      }
      return { ok: true, group: String(req.group).toLowerCase(), looked: lines.length, from, to: high, found, files };
    }
    if (req.action === 'article') {
      const id = String(req.messageId ?? '').trim();
      if (!/^<[^<>\s]{3,250}>$/.test(id)) return { ok: false, why: 'that is not a Message-ID (it looks like <text@host>)' };
      const head = await say(`HEAD ${id}`);
      if (head.code !== 221) return { ok: false, why: head.code === 430 ? 'the news server has no article with that Message-ID' : `the news server would not give the article (code ${head.code}${words(head.text)})` };
      const headers = headerMap((await block(200_000)).lines.map((entry) => entry.toString('latin1')).join('\n'));
      const kind = String(headers['content-type'] ?? 'text/plain').toLowerCase().split(';')[0].trim();
      const groups = String(headers.newsgroups ?? '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
      // Decided from the headers alone, before one byte of the body is asked for.
      if (!(kind === '' || kind === 'text/plain' || kind.startsWith('multipart/'))) return { ok: false, why: `the article is ${kind}, not plain text, so its body was not fetched` };
      if (Number(headers.lines) > 4000 || Number(headers.bytes) > 400_000) return { ok: false, why: 'the article is too large to be a message, so its body was not fetched' };
      if (groups.length > 0 && !groups.some((name) => textGroup(name))) return { ok: false, why: 'the article was posted only to groups that are not text groups, so its body was not fetched' };
      if (/yenc|\(\d+\/\d+\)/i.test(headers.subject ?? '')) return { ok: false, why: 'the article is part of a file posting, so its body was not fetched' };
      const body = await say(`BODY ${id}`);
      if (body.code !== 222) return { ok: false, why: `the news server would not give the article's text (code ${body.code})` };
      const max = Math.min(Math.max(Number(req.maxBytes) || 300_000, 10_000), 600_000);
      const got = await block(max);
      const read = articleText(headers, Buffer.concat(got.lines.flatMap((entry) => [entry, Buffer.from('\n')])));
      if (!read.ok) return read;
      return { ok: true, messageId: id, group: String(req.group).toLowerCase(), subject: decodeWords(headers.subject), author: decodeWords(headers.from), date: tidy(headers.date ?? '').slice(0, 60), groups: groups.slice(0, 12), text: read.text, dropped: read.dropped, bytes: got.lines.reduce((sum, entry) => sum + entry.length + 1, 0), cut: got.cut };
    }
    return { ok: false, why: 'unknown request' };
  } finally {
    try {
      socket.write('QUIT\r\n');
    } catch {
      /* already closed */
    }
    socket.destroy();
  }
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
    else if (req.op === 'nntp') answer = await nntp(req);
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
