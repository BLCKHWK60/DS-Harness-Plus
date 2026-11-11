/**
 * Host half of Media tools.
 *
 * 1. `generate_image` and `edit_image`: call an OpenAI-compatible images API
 *    you configure, save the result as files in the session's working folder
 *    and tell the model to hand them over with `present` (dsh's deliverables
 *    tool), so the image shows up as a deliverable.
 * 2. An approval gate: before the first (or every) call of the browser-use or
 *    computer-use tools you list, dsh asks the user (`tools/pre-execute` ask).
 *
 * The key is never in a file: `images.apiKeyEnv` is the NAME of an environment
 * variable, read at call time and sent only to `images.baseUrl`. The URL and
 * key come from this config, never from the model. Redirects from the API are
 * never followed. Error messages are fixed text: an upstream body or URL is
 * not echoed to the model. Nothing is configured by default.
 */
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { basename, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import z from '@deepseek-ai/schemastery';

export const name = 'media-tools';
export const inject = ['tools'];

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 36 * 1024 * 1024;
const MAX_PROMPT_CHARS = 4000;
const SIZE_RE = /^(auto|\d{3,4}x\d{3,4})$/;

export const Config = z.object({
  enabled: z.boolean().default(true),
  images: z
    .object({
      baseUrl: z.string(),
      model: z.string(),
      apiKeyEnv: z.string(),
      label: z.string(),
      approval: z.union([z.const('first'), z.const('every'), z.const('never')]).default('first'),
      maxCallsPerSession: z.number().min(1).max(200).default(20),
      maxImages: z.number().min(1).max(4).default(4),
      outputDir: z.string().default('generated-images'),
      allowUrlResults: z.boolean().default(true),
      timeoutMs: z.number().min(1000).max(1800000).default(180000),
      generateToolName: z.string().default('generate_image'),
      editToolName: z.string().default('edit_image'),
    })
    .default({}),
  gate: z
    .object({
      patterns: z.array(z.string()).default([]),
      mode: z.union([z.const('first'), z.const('every')]).default('first'),
      reason: z.string(),
    })
    .default({}),
});

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) return value.map(plain);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

/** A failure with a fixed message that is safe to show the model. */
export class MediaError extends Error {
  /**
   * @param {string} message - fixed text.
   * @param {string} reason - short code.
   */
  constructor(message, reason = 'image_error') {
    super(message);
    this.reason = reason;
  }
}

// ---- pure helpers (exported for tests) -------------------------------------------------

/**
 * Detect png, jpeg, webp or gif by magic bytes.
 * @param {Uint8Array} data - file bytes.
 * @returns {{mime: string, ext: string} | null} the type, or null.
 */
export function sniffImage(data) {
  const b = Buffer.from(data.subarray(0, 12));
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))) return { mime: 'image/gif', ext: 'gif' };
  return null;
}

/**
 * The 16 bytes of an IPv6 literal (with an optional embedded IPv4 tail), or null.
 * @param {string} address - IPv6 literal, without brackets or zone.
 * @returns {number[] | null} bytes.
 */
function ipv6Bytes(address) {
  let text = String(address).toLowerCase().split('%')[0];
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  let tailBytes = [];
  if (tail) {
    tailBytes = tail[1].split('.').map(Number);
    if (tailBytes.some((n) => n > 255)) return null;
    text = text.slice(0, -tail[1].length) + '0:0';
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part) => (part === '' ? [] : part.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const bytes = groups.flatMap((g) => { const n = parseInt(g, 16); return [n >> 8, n & 0xff]; });
  if (tailBytes.length) bytes.splice(12, 4, ...tailBytes);
  return bytes;
}

/**
 * Is an address one a provider-returned image URL may connect to (public only)?
 * @param {string} address - IPv4 or IPv6 literal.
 * @returns {boolean} true for a public address.
 */
export function isPublicAddress(address) {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (kind === 6) {
    const bytes = ipv6Bytes(address);
    if (!bytes) return false;
    const v4 = (offset) => `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
    const zero = (from, to) => bytes.slice(from, to).every((b) => b === 0);
    // Forms that carry an IPv4 address: check that address instead.
    if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPublicAddress(v4(12)); // ::ffff:a.b.c.d (mapped)
    if (zero(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && zero(10, 12)) return isPublicAddress(v4(12)); // ::ffff:0:a.b.c.d (translated)
    if (zero(0, 12)) return zero(12, 16) ? false : isPublicAddress(v4(12)); // :: and ::a.b.c.d (compatible)
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zero(4, 12)) return isPublicAddress(v4(12)); // 64:ff9b::/96 NAT64
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPublicAddress(v4(2)); // 2002::/16 6to4
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return false; // 2001::/32 Teredo
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false; // 2001:db8::/32 documentation
    if ((bytes[0] & 0xfe) === 0xfc) return false; // fc00::/7 unique local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false; // fe80::/10 link local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return false; // fec0::/10 site local (deprecated)
    if (bytes[0] === 0xff) return false; // multicast
    return true;
  }
  return false;
}

/**
 * Validate an image size argument.
 * @param {unknown} size - model input.
 * @returns {string | undefined} the size, or undefined when not given.
 */
export function checkSize(size) {
  if (size === undefined || size === null || size === '') return undefined;
  if (typeof size !== 'string' || !SIZE_RE.test(size)) throw new MediaError("`size` must be 'auto' or WIDTHxHEIGHT such as 1024x1024.", 'invalid_input');
  return size;
}

/**
 * Pull images out of an images-API response.
 * @param {unknown} payload - parsed JSON.
 * @param {number} limit - at most this many.
 * @returns {Array<{data?: Buffer, url?: string}>} images, by value or url.
 */
export function parseImages(payload, limit) {
  const items = Array.isArray(payload?.data) ? payload.data : null;
  if (!items?.length) throw new MediaError('The image API returned an unexpected response.', 'bad_response');
  const out = [];
  for (const item of items.slice(0, limit)) {
    if (typeof item?.b64_json === 'string' && item.b64_json) out.push({ data: Buffer.from(item.b64_json, 'base64') });
    else if (typeof item?.url === 'string' && item.url) out.push({ url: item.url });
  }
  if (!out.length) throw new MediaError('The image API returned an unexpected response.', 'bad_response');
  return out;
}

/**
 * Download a provider-returned image URL: public addresses only (checked, then
 * pinned for the connection), every redirect hop checked again, no credentials,
 * image content types only, size capped.
 * @param {string} rawUrl - the URL the provider returned.
 * @param {{vet?: (address: string) => boolean, maxBytes?: number, hops?: number, timeoutMs?: number, signal?: AbortSignal}} [options] - `vet` is a test seam.
 * @returns {Promise<Buffer>} image bytes.
 */
export async function fetchVetted(rawUrl, { vet = isPublicAddress, maxBytes = MAX_IMAGE_BYTES, hops = 3, timeoutMs = 20000, signal } = {}) {
  let current;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new MediaError('An image url from the provider was refused.', 'url_refused');
  }
  for (let hop = 0; hop <= hops; hop += 1) {
    if (!/^https?:$/.test(current.protocol) || current.username || current.password) throw new MediaError('An image url from the provider was refused.', 'url_refused');
    const host = current.hostname.replace(/^\[|\]$/g, '');
    let addresses;
    try {
      addresses = await dnsLookup(host, { all: true });
    } catch {
      throw new MediaError('An image url from the provider could not be fetched.', 'url_fetch');
    }
    if (!addresses.length || !addresses.every((entry) => vet(entry.address))) throw new MediaError('An image url from the provider was refused.', 'url_refused');
    const pinned = addresses[0];
    const reply = await new Promise((resolveReply, reject) => {
      const client = current.protocol === 'https:' ? https : http;
      const request = client.request(
        current,
        {
          method: 'GET',
          headers: { Accept: 'image/*' },
          timeout: timeoutMs,
          signal,
          lookup: (_host, options, callback) => (options?.all ? callback(null, [{ address: pinned.address, family: pinned.family }]) : callback(null, pinned.address, pinned.family)),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            response.resume();
            resolveReply({ redirect: response.headers.location ?? '' });
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(new MediaError('An image url from the provider could not be fetched.', 'url_fetch'));
            return;
          }
          const type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) {
            response.resume();
            reject(new MediaError('An image url from the provider is not an image.', 'url_not_image'));
            return;
          }
          const declared = Number(response.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            response.resume();
            reject(new MediaError('An image from the provider is larger than 25 MB.', 'too_large'));
            return;
          }
          const chunks = [];
          let total = 0;
          response.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
              response.destroy();
              reject(new MediaError('An image from the provider is larger than 25 MB.', 'too_large'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => resolveReply({ data: Buffer.concat(chunks) }));
          response.on('error', () => reject(new MediaError('An image url from the provider could not be fetched.', 'url_fetch')));
        },
      );
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (error) => reject(error instanceof MediaError ? error : new MediaError('An image url from the provider could not be fetched.', 'url_fetch')));
      request.end();
    });
    if (reply.data) return reply.data;
    if (!reply.redirect) throw new MediaError('An image url from the provider could not be fetched.', 'url_fetch');
    try {
      current = new URL(reply.redirect, current);
    } catch {
      throw new MediaError('An image url from the provider was refused.', 'url_refused');
    }
  }
  throw new MediaError('An image url from the provider redirected too many times.', 'url_fetch');
}

/**
 * Compile gate patterns; throws on a bad pattern.
 * @param {string[]} patterns - regular expressions as text.
 * @returns {RegExp[]} compiled expressions.
 */
export function compilePatterns(patterns) {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      throw new Error(`media-tools: gate pattern "${pattern}" is not a valid regular expression`);
    }
  });
}

/**
 * Check the images config; throws on a value that must not run.
 * @param {object} images - config.images.
 * @returns {boolean} true when the image tools should be registered.
 */
export function checkImages(images) {
  const baseUrl = String(images.baseUrl ?? '').trim();
  const model = String(images.model ?? '').trim();
  if (!baseUrl && !model) return false;
  if (!baseUrl || !model) throw new Error('media-tools: images needs both `baseUrl` and `model`');
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('media-tools: images.baseUrl is not a valid URL');
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('media-tools: images.baseUrl must be http(s) with no credentials in it');
  const keyEnv = String(images.apiKeyEnv ?? '').trim();
  if (keyEnv) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new Error('media-tools: images.apiKeyEnv must be the NAME of an environment variable, never the key itself');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const loopback = host === 'localhost' || host === '::1' || /^127\./.test(host);
    if (url.protocol === 'http:' && !loopback) throw new Error('media-tools: a key is not sent over plain http except to localhost; use https');
  }
  return true;
}

// ---- plugin ----------------------------------------------------------------------------

/**
 * Plugin entry.
 * @param {object} ctx - Cordis context.
 * @param {object} config - plugin config.
 */
export function apply(ctx, config) {
  const cfg = plain(config) ?? {};
  if (cfg.enabled === false) return;
  const images = cfg.images ?? {};
  const gate = cfg.gate ?? {};
  const imagesOn = checkImages(images);
  const gatePatterns = compilePatterns(Array.isArray(gate.patterns) ? gate.patterns : []);

  const generateName = String(images.generateToolName || 'generate_image');
  const editName = String(images.editToolName || 'edit_image');
  const outputDir = String(images.outputDir || 'generated-images');
  if (imagesOn && (outputDir.startsWith('/') || outputDir.split(/[\\/]/).includes('..'))) throw new Error('media-tools: images.outputDir must be a relative folder inside the working folder');
  const maxCalls = Number(images.maxCallsPerSession) || 20;
  const maxImages = Math.min(4, Number(images.maxImages) || 4);
  const timeoutMs = Number(images.timeoutMs) || 180000;
  const label = String(images.label || 'the image API');
  const calls = new Map();

  /**
   * Call the images API with a fixed target.
   * @param {string} path - `/images/generations` or `/images/edits`.
   * @param {{json?: object, form?: FormData}} body - request body.
   * @param {AbortSignal} signal - cancellation.
   * @returns {Promise<unknown>} parsed JSON.
   */
  async function post(path, body, signal) {
    const headers = {};
    const keyEnv = String(images.apiKeyEnv ?? '').trim();
    if (keyEnv) {
      const key = process.env[keyEnv];
      if (!key) throw new MediaError(`The environment variable ${keyEnv} is not set, so ${label} cannot be called.`, 'no_key');
      headers.Authorization = `Bearer ${key}`;
    }
    if (body.json) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(`${String(images.baseUrl).trim().replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers,
        body: body.json ? JSON.stringify(body.json) : body.form,
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new MediaError(`Could not reach ${label} for image generation.`, 'unreachable');
    }
    if (response.status === 401 || response.status === 403) throw new MediaError(`${label} rejected the API key for image generation.`, 'auth');
    if (response.status === 429) throw new MediaError(`${label} is rate limiting image requests. Try again later.`, 'rate_limited');
    if (response.status >= 300) throw new MediaError(`${label} returned HTTP ${response.status} for image generation.`, 'upstream_status');
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > MAX_RESPONSE_BYTES) throw new MediaError(`${label} returned too large an image response.`, 'too_large');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new MediaError(`${label} returned an unexpected image response.`, 'bad_response');
    }
  }

  /**
   * Turn raw results into verified image bytes.
   * @param {Array<{data?: Buffer, url?: string}>} raws - results.
   * @param {AbortSignal} signal - cancellation.
   * @returns {Promise<Array<{data: Buffer, ext: string}>>} verified images.
   */
  async function materialize(raws, signal) {
    const out = [];
    for (const raw of raws) {
      let data = raw.data;
      if (!data) {
        if (images.allowUrlResults === false) throw new MediaError('The image API returned a URL, and `allowUrlResults` is off.', 'url_refused');
        data = await fetchVetted(raw.url, { signal });
      }
      if (data.length > MAX_IMAGE_BYTES) throw new MediaError('An image from the provider is larger than 25 MB.', 'too_large');
      const kind = sniffImage(data);
      if (!kind) throw new MediaError('The provider returned data that is not an image.', 'url_not_image');
      out.push({ data, ext: kind.ext });
    }
    return out;
  }

  /**
   * Write images into the working folder, never through a link.
   * @param {string} cwd - session working folder.
   * @param {Array<{data: Buffer, ext: string}>} list - verified images.
   * @returns {string[]} paths relative to the working folder.
   */
  function save(cwd, list) {
    const root = realpathSync(cwd);
    const folder = join(root, outputDir);
    mkdirSync(folder, { recursive: true });
    const real = realpathSync(folder);
    if (real !== root && !real.startsWith(root + sep)) throw new MediaError('The output folder is outside the working folder.', 'write_refused');
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const tag = randomBytes(2).toString('hex');
    return list.map((image, index) => {
      const file = join(real, `image-${stamp}-${tag}-${index + 1}.${image.ext}`);
      try {
        writeFileSync(file, image.data, { flag: 'wx', mode: 0o644 });
      } catch {
        throw new MediaError('The image could not be saved.', 'write_refused');
      }
      return relative(root, file);
    });
  }

  /**
   * Read an edit input from the working folder: a regular file, no link, png/jpeg/webp.
   * @param {string} cwd - session working folder.
   * @param {unknown} imagePath - path from the model.
   * @returns {{data: Buffer, mime: string, filename: string}} the image.
   */
  function readInput(cwd, imagePath) {
    if (typeof imagePath !== 'string' || !imagePath.trim()) throw new MediaError('`image_path` must be a non-empty string.', 'invalid_input');
    const root = realpathSync(cwd);
    const target = resolve(root, imagePath);
    try {
      const entry = lstatSync(target);
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('not a file');
      const real = realpathSync(target);
      if (!real.startsWith(root + sep)) throw new Error('outside');
      if (entry.size > MAX_IMAGE_BYTES) throw new MediaError('The image is larger than 25 MB.', 'too_large');
      const data = readFileSync(real);
      const kind = sniffImage(data);
      if (!kind || kind.ext === 'gif') throw new MediaError('Only PNG, JPEG and WebP images can be edited.', 'unsupported');
      return { data, mime: kind.mime, filename: basename(real) };
    } catch (error) {
      if (error instanceof MediaError) throw error;
      throw new MediaError('`image_path` must be a regular image file inside the working folder.', 'invalid_input');
    }
  }

  /**
   * Check the prompt and count the call.
   * @param {object} args - tool input.
   * @param {object} exec - tool execution.
   * @returns {string} the trimmed prompt.
   */
  function begin(args, exec) {
    const prompt = args?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) throw new MediaError('`prompt` must be a non-empty string.', 'invalid_input');
    if (prompt.length > MAX_PROMPT_CHARS) throw new MediaError(`\`prompt\` is longer than ${MAX_PROMPT_CHARS} characters.`, 'invalid_input');
    return prompt.trim();
  }

  /**
   * Count an API call against the session cap.
   * @param {object} exec - tool execution.
   */
  function countCall(exec) {
    const id = exec.agent?.id ?? '';
    const used = calls.get(id) ?? 0;
    if (used >= maxCalls) throw new MediaError(`This session already made ${maxCalls} image calls. Nothing was sent.`, 'call_cap');
    if (calls.size > 500) calls.clear();
    calls.set(id, used + 1);
  }

  /**
   * Finish a call: verify, save, report.
   * @param {Array<{data?: Buffer, url?: string}>} raws - API results.
   * @param {object} exec - tool execution.
   * @returns {Promise<{text: string, files: string[]}>} the result.
   */
  async function finish(raws, exec) {
    const list = await materialize(raws, exec.signal);
    const service = ctx.get('workingDirectory');
    if (!service?.ensure) throw new MediaError('No working folder is available.', 'no_store');
    const cwd = await service.ensure(exec.agent, exec.signal);
    const files = save(cwd, list);
    return {
      text: `Saved ${files.length} image(s): ${files.join(', ')}. Call \`present\` with these paths so the user sees them, and say they were saved.`,
      files,
    };
  }

  /**
   * Wrap an execute function so failures become fixed-text errors.
   * @param {(args: object, exec: object) => Promise<object>} run - the work.
   * @returns {(args: object, exec: object) => Promise<object>} the guarded function.
   */
  const guarded = (run) => async (args, exec) => {
    try {
      return await run(args, exec);
    } catch (error) {
      if (error instanceof MediaError) throw new Error(`image: ${error.message}`);
      throw error;
    }
  };

  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };

  if (imagesOn) {
    ctx.effect(
      () =>
        ctx.tools.register({
          name: generateName,
          description: 'Generate an image from a text prompt with the configured image API and save it as a file in the working folder. May cost the user money; call it only when asked.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', maxLength: MAX_PROMPT_CHARS },
              size: { type: 'string', description: "'auto' or WIDTHxHEIGHT, e.g. 1024x1024." },
              n: { type: 'integer', minimum: 1, maximum: maxImages },
            },
            required: ['prompt'],
            additionalProperties: false,
          },
          output,
          timeoutMs: timeoutMs + 60000,
          isConcurrencySafe: () => false,
          execute: guarded(async (args, exec) => {
            const prompt = begin(args, exec);
            const size = checkSize(args.size);
            const n = args.n ?? 1;
            if (!Number.isInteger(n) || n < 1 || n > maxImages) throw new MediaError(`\`n\` must be an integer from 1 to ${maxImages}.`, 'invalid_input');
            countCall(exec);
            const payload = await post('/images/generations', { json: { model: String(images.model).trim(), prompt, n, ...(size ? { size } : {}) } }, exec.signal);
            return finish(parseImages(payload, n), exec);
          }),
        }),
      'media-tools generate_image',
    );
    ctx.effect(
      () =>
        ctx.tools.register({
          name: editName,
          description: 'Edit an existing PNG, JPEG or WebP image from the working folder with a text prompt and save the result as a new file. May cost the user money; call it only when asked.',
          parameters: {
            type: 'object',
            properties: {
              prompt: { type: 'string', maxLength: MAX_PROMPT_CHARS },
              image_path: { type: 'string', description: 'Path of the image inside the working folder.' },
              size: { type: 'string', description: "'auto' or WIDTHxHEIGHT." },
            },
            required: ['prompt', 'image_path'],
            additionalProperties: false,
          },
          output,
          timeoutMs: timeoutMs + 60000,
          isConcurrencySafe: () => false,
          execute: guarded(async (args, exec) => {
            const prompt = begin(args, exec);
            const size = checkSize(args.size);
            const service = ctx.get('workingDirectory');
            if (!service?.ensure) throw new MediaError('No working folder is available.', 'no_store');
            const cwd = await service.ensure(exec.agent, exec.signal);
            const input = readInput(cwd, args.image_path);
            countCall(exec);
            const form = new FormData();
            form.set('model', String(images.model).trim());
            form.set('prompt', prompt);
            form.set('n', '1');
            if (size) form.set('size', size);
            form.set('image', new Blob([input.data], { type: input.mime }), input.filename);
            const payload = await post('/images/edits', { form }, exec.signal);
            return finish(parseImages(payload, 1), exec);
          }),
        }),
      'media-tools edit_image',
    );
  }

  // ---- approval gate ----
  /** Group key -> session ids that already approved one call. */
  const approved = new Map();
  /** Executions that were put to the user: exec -> {key, sid}. */
  const asked = new WeakMap();

  /**
   * Which approval group (if any) a tool belongs to.
   * @param {string} toolName - tool name.
   * @returns {{key: string, mode: string, reason: string} | null} the group.
   */
  function groupOf(toolName) {
    if (imagesOn && (toolName === generateName || toolName === editName) && images.approval !== 'never') {
      return { key: 'images', mode: images.approval === 'every' ? 'every' : 'first', reason: 'The model wants to call the image API, which may cost money. Allow?' };
    }
    if (gatePatterns.some((pattern) => pattern.test(toolName))) {
      return { key: 'gate', mode: gate.mode === 'every' ? 'every' : 'first', reason: String(gate.reason || '').trim() || 'The model wants to operate a browser or the desktop. Allow?' };
    }
    return null;
  }

  if ((imagesOn && images.approval !== 'never') || gatePatterns.length) {
    ctx.on('tools/pre-execute', async (exec, next) => {
      const group = groupOf(exec.name);
      const decision = await next();
      if (!group) return decision;
      if (decision?.kind && decision.kind !== 'allow') return decision;
      const sid = exec.agent?.id ?? '';
      if (group.mode === 'first' && approved.get(group.key)?.has(sid)) return decision;
      asked.set(exec, { key: group.key, sid });
      return { kind: 'ask', reason: group.reason };
    });
    ctx.on('tools/result', (exec, result) => {
      const entry = asked.get(exec);
      asked.delete(exec);
      if (!entry || result?.isError) return;
      let set = approved.get(entry.key);
      if (!set) approved.set(entry.key, (set = new Set()));
      if (set.size > 500) set.clear();
      set.add(entry.sid);
    });
  }
}
