import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, sniffImage, isPublicAddress, checkSize, parseImages, checkImages, compilePatterns, fetchVetted } from '../index.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32, 3)]);

/** A local images API; `behaviour` decides the reply. */
async function server(behaviour) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ url: req.url, headers: req.headers, body });
      behaviour(req, res, body, srv.address().port);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

/** Fake ctx: collects tools and listeners. */
function harness(config, cwd) {
  const tools = {};
  const listeners = {};
  const ctx = {
    get: (key) => (key === 'workingDirectory' ? { ensure: async () => cwd } : undefined),
    effect: (fn) => fn(),
    on: (event, handler) => { (listeners[event] ??= []).push(handler); },
    tools: { register: (tool) => { tools[tool.name] = tool; } },
  };
  apply(ctx, config);
  const exec = (name, args, agentId = 's1', signal = new AbortController().signal) => tools[name].execute(args, { agent: { id: agentId, session: {} }, signal, name, arguments: args });
  return { tools, listeners, exec };
}
const folder = () => mkdtempSync(join(tmpdir(), 'media-'));

test('sniffImage, isPublicAddress, checkSize, parseImages', () => {
  assert.equal(sniffImage(PNG).ext, 'png');
  assert.equal(sniffImage(JPG).ext, 'jpg');
  assert.equal(sniffImage(GIF).ext, 'gif');
  assert.equal(sniffImage(Buffer.from('<html>')), null);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.equal(sniffImage(webp).ext, 'webp');
  for (const ip of ['127.0.0.1', '10.1.1.1', '192.168.0.4', '172.16.0.1', '172.31.255.255', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '2001:db8::1', 'not-an-ip', '::ffff:7f00:1', '::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'fec0::1', '::ffff:0:a00:1', '2001:0:4136:e378::1', '::ffff:169.254.169.254']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808', '2002:808:808::1', '2a00:1450:4001::200e']) assert.equal(isPublicAddress(ip), true, ip);
  assert.equal(checkSize(undefined), undefined);
  assert.equal(checkSize('1024x1024'), '1024x1024');
  assert.throws(() => checkSize('big'), /WIDTHxHEIGHT/);
  assert.throws(() => parseImages({ data: [] }, 2), /unexpected/);
  assert.equal(parseImages({ data: [{ b64_json: PNG.toString('base64') }, { url: 'https://x/y.png' }, { nope: 1 }] }, 4).length, 2);
});

test('config checks', () => {
  assert.equal(checkImages({}), false);
  assert.throws(() => checkImages({ baseUrl: 'http://127.0.0.1:1/v1' }), /both/);
  assert.throws(() => checkImages({ baseUrl: 'ftp://x', model: 'm' }), /http/);
  assert.throws(() => checkImages({ baseUrl: 'https://user:pw@x/v1', model: 'm' }), /credentials/);
  assert.throws(() => checkImages({ baseUrl: 'https://x/v1', model: 'm', apiKeyEnv: 'sk-live-123' }), /NAME/);
  assert.throws(() => checkImages({ baseUrl: 'http://example.com/v1', model: 'm', apiKeyEnv: 'IMG_KEY' }), /plain http/);
  assert.equal(checkImages({ baseUrl: 'http://127.0.0.1:1/v1', model: 'm', apiKeyEnv: 'IMG_KEY' }), true);
  assert.throws(() => compilePatterns(['(']), /not a valid/);
  assert.throws(() => harness({ images: { baseUrl: 'http://127.0.0.1:1/v1', model: 'm', outputDir: '../x' } }, folder()), /relative/);
  assert.deepEqual(Object.keys(harness({}, folder()).tools), [], 'inert with no config');
});

test('generate: sends the configured request, saves a file, tells the model to present it', async () => {
  const api = await server((req, res) => json(res, 200, { data: [{ b64_json: PNG.toString('base64') }, { b64_json: JPG.toString('base64') }] }));
  const cwd = folder();
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1/`, model: 'img-model', label: 'Test API' } }, cwd);
  const out = await h.exec('generate_image', { prompt: ' a red fox ', size: '512x512', n: 2 });
  await api.close();
  const sent = JSON.parse(api.seen[0].body);
  assert.deepEqual(sent, { model: 'img-model', prompt: 'a red fox', n: 2, size: '512x512' });
  assert.equal(api.seen[0].url, '/v1/images/generations');
  assert.equal(api.seen[0].headers.authorization, undefined, 'no key configured: none sent');
  assert.equal(out.files.length, 2);
  assert.match(out.text, /Call `present`/);
  assert.match(out.files[0], /^generated-images\/image-\d{14}-[0-9a-f]{4}-1\.png$/);
  assert.match(out.files[1], /-2\.jpg$/);
  assert.deepEqual(readFileSync(join(cwd, out.files[0])), PNG);
  assert.equal(statSync(join(cwd, out.files[0])).mode & 0o777, 0o644);
});

test('inputs are validated before anything is sent', async () => {
  const api = await server((req, res) => json(res, 200, { data: [{ b64_json: PNG.toString('base64') }] }));
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', maxImages: 2 } }, folder());
  await assert.rejects(h.exec('generate_image', { prompt: '' }), /non-empty/);
  await assert.rejects(h.exec('generate_image', { prompt: 'x'.repeat(4001) }), /longer/);
  await assert.rejects(h.exec('generate_image', { prompt: 'x', size: '9' }), /WIDTHxHEIGHT/);
  await assert.rejects(h.exec('generate_image', { prompt: 'x', n: 3 }), /1 to 2/);
  assert.equal(api.seen.length, 0);
  await api.close();
});

test('the key is read from the named variable, sent only to the configured URL, never echoed', async () => {
  const api = await server((req, res) => json(res, req.headers.authorization === 'Bearer test-secret-value' ? 200 : 401, { data: [{ b64_json: PNG.toString('base64') }], echo: 'upstream detail' }));
  const cwd = folder();
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', apiKeyEnv: 'MEDIA_TEST_KEY_NAME', label: 'Test API' } }, cwd);
  delete process.env.MEDIA_TEST_KEY_NAME;
  await assert.rejects(h.exec('generate_image', { prompt: 'x' }), /MEDIA_TEST_KEY_NAME is not set/);
  assert.equal(api.seen.length, 0, 'no key: no request');
  process.env.MEDIA_TEST_KEY_NAME = 'wrong';
  await assert.rejects(h.exec('generate_image', { prompt: 'x' }), (e) => /rejected the API key/.test(e.message) && !/wrong|upstream detail/.test(e.message));
  process.env.MEDIA_TEST_KEY_NAME = 'test-secret-value';
  const out = await h.exec('generate_image', { prompt: 'x' });
  delete process.env.MEDIA_TEST_KEY_NAME;
  await api.close();
  assert.equal(out.files.length, 1);
  assert.ok(!out.text.includes('test-secret-value'));
});

test('upstream errors and redirects give fixed text; redirects are not followed', async () => {
  let mode = '500';
  const api = await server((req, res) => {
    if (mode === '500') { res.writeHead(500); res.end('SECRET UPSTREAM BODY'); }
    else if (mode === '429') { res.writeHead(429); res.end(); }
    else if (mode === '302') { res.writeHead(302, { location: 'http://127.0.0.1:1/elsewhere' }); res.end(); }
    else if (mode === 'badjson') { res.writeHead(200); res.end('not json'); }
    else json(res, 200, { data: [{ b64_json: Buffer.from('plain text, not an image').toString('base64') }] });
  });
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', label: 'Test API' } }, folder());
  const fail = async (m) => { mode = m; try { await h.exec('generate_image', { prompt: 'x' }); return 'no error'; } catch (e) { return e.message; } };
  const m500 = await fail('500');
  assert.match(m500, /HTTP 500/);
  assert.ok(!m500.includes('SECRET'));
  assert.match(await fail('429'), /rate limiting/);
  assert.match(await fail('302'), /HTTP 302/);
  assert.match(await fail('badjson'), /unexpected image response/);
  assert.match(await fail('notimage'), /not an image/);
  await api.close();
  await assert.rejects(harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', label: 'Test API' } }, folder()).exec('generate_image', { prompt: 'x' }), /Could not reach Test API/);
});

test('a URL result pointing at a private address is refused', async () => {
  const img = await server((req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); });
  const api = await server((req, res) => json(res, 200, { data: [{ url: `http://127.0.0.1:${img.port}/a.png` }] }));
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm' } }, folder());
  await assert.rejects(h.exec('generate_image', { prompt: 'x' }), /provider was refused/);
  assert.equal(img.seen.length, 0, 'the private address was never contacted');
  const off = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', allowUrlResults: false } }, folder());
  await assert.rejects(off.exec('generate_image', { prompt: 'x' }), /allowUrlResults/);
  await api.close(); await img.close();
});

test('fetchVetted: type, size, redirects and scheme checks', async () => {
  const any = () => true;
  const srv = await server((req, res, body, port) => {
    if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); }
    else if (req.url === '/html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<x>'); }
    else if (req.url === '/big') { res.writeHead(200, { 'content-type': 'image/png', 'content-length': '999999' }); res.end(Buffer.alloc(10)); }
    else if (req.url === '/hop') { res.writeHead(302, { location: '/ok' }); res.end(); }
    else if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); res.end(); }
    else if (req.url === '/404') { res.writeHead(404); res.end(); }
    else { res.writeHead(500); res.end(); }
  });
  const base = `http://127.0.0.1:${srv.port}`;
  assert.deepEqual(await fetchVetted(`${base}/ok`, { vet: any }), PNG);
  assert.deepEqual(await fetchVetted(`${base}/hop`, { vet: any }), PNG);
  await assert.rejects(fetchVetted(`${base}/html`, { vet: any }), /not an image/);
  await assert.rejects(fetchVetted(`${base}/big`, { vet: any, maxBytes: 1000 }), /larger than 25 MB/);
  await assert.rejects(fetchVetted(`${base}/loop`, { vet: any }), /redirected too many times/);
  await assert.rejects(fetchVetted(`${base}/404`, { vet: any }), /could not be fetched/);
  await assert.rejects(fetchVetted(`file:///etc/passwd`, { vet: any }), /refused/);
  await assert.rejects(fetchVetted(`http://user:pw@127.0.0.1:${srv.port}/ok`, { vet: any }), /refused/);
  await assert.rejects(fetchVetted(`${base}/ok`), /refused/, 'default vetting refuses loopback');
  await srv.close();
});

test('edit: multipart request, input must be a real image inside the working folder', async () => {
  const api = await server((req, res) => json(res, 200, { data: [{ b64_json: PNG.toString('base64') }] }));
  const cwd = folder();
  mkdirSync(join(cwd, 'pics'));
  writeFileSync(join(cwd, 'pics', 'in.png'), JPG);          // content says jpeg
  writeFileSync(join(cwd, 'pics', 'anim.gif'), GIF);
  writeFileSync(join(cwd, 'pics', 'notes.txt'), 'hello');
  const outside = folder();
  writeFileSync(join(outside, 'secret.png'), PNG);
  symlinkSync(join(outside, 'secret.png'), join(cwd, 'pics', 'link.png'));
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'img' } }, cwd);
  const out = await h.exec('edit_image', { prompt: 'make it blue', image_path: 'pics/in.png', size: 'auto' });
  assert.equal(out.files.length, 1);
  assert.match(api.seen[0].headers['content-type'], /^multipart\/form-data/);
  const raw = api.seen[0].body.toString('latin1');
  for (const part of ['name="model"', 'img', 'name="prompt"', 'make it blue', 'name="n"', 'name="size"', 'filename="in.png"', 'image/jpeg']) assert.ok(raw.includes(part), part);
  assert.equal(api.seen[0].url, '/v1/images/edits');
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: 'pics/link.png' }), /regular image file inside/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: '../' + outside.split('/').pop() + '/secret.png' }), /regular image file inside/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: join(outside, 'secret.png') }), /regular image file inside/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: 'pics/anim.gif' }), /Only PNG, JPEG and WebP/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: 'pics/notes.txt' }), /Only PNG, JPEG and WebP/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x', image_path: 'pics' }), /regular image file inside/);
  await assert.rejects(h.exec('edit_image', { prompt: 'x' }), /non-empty/);
  assert.equal(api.seen.length, 1, 'only the valid edit was sent');
  await api.close();
});

test('the call cap is per session and counts only real calls', async () => {
  const api = await server((req, res) => json(res, 200, { data: [{ b64_json: PNG.toString('base64') }] }));
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm', maxCallsPerSession: 2 } }, folder());
  await assert.rejects(h.exec('generate_image', { prompt: '' }), /non-empty/);
  await h.exec('generate_image', { prompt: 'a' });
  await h.exec('generate_image', { prompt: 'b' });
  await assert.rejects(h.exec('generate_image', { prompt: 'c' }), /already made 2 image calls/);
  await h.exec('generate_image', { prompt: 'c' }, 'other-session');
  assert.equal(api.seen.length, 3);
  await api.close();
});

test('an output folder that is a link out of the working folder is refused', async () => {
  const api = await server((req, res) => json(res, 200, { data: [{ b64_json: PNG.toString('base64') }] }));
  const cwd = folder();
  const outside = folder();
  symlinkSync(outside, join(cwd, 'generated-images'));
  const h = harness({ images: { baseUrl: `http://127.0.0.1:${api.port}/v1`, model: 'm' } }, cwd);
  await assert.rejects(h.exec('generate_image', { prompt: 'x' }), /outside the working folder/);
  assert.deepEqual(readdirSync(outside), []);
  await api.close();
});

// ---- approval gate ----
const pre = (h, name, agentId = 's1', next = async () => ({ kind: 'allow' })) => h.listeners['tools/pre-execute'][0]({ name, agent: { id: agentId } , __id: Math.random() }, next);

test('gate: asks before the first matching call, then lets the session continue', async () => {
  const h = harness({ gate: { patterns: ['^mcp__playwright-mcp__browser_(click|type)$'], mode: 'first', reason: 'Allow the browser?' } }, folder());
  const exec1 = { name: 'mcp__playwright-mcp__browser_click', agent: { id: 's1' } };
  const [pre1] = h.listeners['tools/pre-execute'];
  assert.deepEqual(await pre1({ name: 'mcp__playwright-mcp__browser_snapshot', agent: { id: 's1' } }, async () => ({ kind: 'allow' })), { kind: 'allow' });
  assert.deepEqual(await pre1(exec1, async () => ({ kind: 'allow' })), { kind: 'ask', reason: 'Allow the browser?' });
  // denied by the user: error result, still asks next time
  h.listeners['tools/result'][0](exec1, { isError: true });
  const exec2 = { name: 'mcp__playwright-mcp__browser_type', agent: { id: 's1' } };
  assert.equal((await pre1(exec2, async () => ({ kind: 'allow' }))).kind, 'ask');
  // approved and ran
  h.listeners['tools/result'][0](exec2, { isError: false });
  assert.equal((await pre1({ name: 'mcp__playwright-mcp__browser_click', agent: { id: 's1' } }, async () => ({ kind: 'allow' }))).kind, 'allow');
  // another session still has to be asked
  assert.equal((await pre1({ name: 'mcp__playwright-mcp__browser_click', agent: { id: 's2' } }, async () => ({ kind: 'allow' }))).kind, 'ask');
});

test('gate: every mode always asks; a deny from another listener wins', async () => {
  const h = harness({ gate: { patterns: ['click'], mode: 'every' } }, folder());
  const [pre1] = h.listeners['tools/pre-execute'];
  const exec = { name: 'do_click', agent: { id: 's1' } };
  assert.match((await pre1(exec, async () => ({ kind: 'allow' }))).reason, /browser or the desktop/);
  h.listeners['tools/result'][0](exec, { isError: false });
  assert.equal((await pre1({ name: 'do_click', agent: { id: 's1' } }, async () => ({ kind: 'allow' }))).kind, 'ask');
  assert.deepEqual(await pre1({ name: 'do_click', agent: { id: 's1' } }, async () => ({ kind: 'deny', reason: 'tier says no' })), { kind: 'deny', reason: 'tier says no' });
});

test('gate: image tools ask once per session by default; never turns it off; nothing else is touched', async () => {
  const cfg = (approval) => ({ images: { baseUrl: 'http://127.0.0.1:1/v1', model: 'm', ...(approval ? { approval } : {}) } });
  const h = harness(cfg(), folder());
  const [pre1] = h.listeners['tools/pre-execute'];
  const exec = { name: 'generate_image', agent: { id: 's1' } };
  assert.equal((await pre1(exec, async () => ({ kind: 'allow' }))).kind, 'ask');
  h.listeners['tools/result'][0](exec, { isError: false });
  assert.equal((await pre1({ name: 'edit_image', agent: { id: 's1' } }, async () => ({ kind: 'allow' }))).kind, 'allow');
  assert.equal((await pre1({ name: 'bash', agent: { id: 's1' } }, async () => ({ kind: 'allow' }))).kind, 'allow');
  const never = harness(cfg('never'), folder());
  assert.equal(never.listeners['tools/pre-execute'], undefined, 'no listener at all when nothing is gated');
});

test('no gate listener with an empty config', () => {
  assert.equal(harness({}, folder()).listeners['tools/pre-execute'], undefined);
});
