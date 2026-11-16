/**
 * WireGuard for what Recon sends outside Tor (lib/vpn.js, lib/forward.js): the list, the Keychain
 * value, the primary and its backups tried in order, the files deleted once wireproxy has read them,
 * and the relay through the tunnel. No real VPN: a stand-in wireproxy (a small script that opens its
 * port) and a stand-in SOCKS5 server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { CHECK_HOST, createVpn, decodeStored, readVpnList, vpnRemoveCommandFor, vpnServiceOf, vpnStoreCommandFor, wgProblem, wireproxyConfig } from '../lib/vpn.js';
import { openForward } from '../lib/forward.js';

const GOOD = '[Interface]\nPrivateKey = aGVsbG8=\nAddress = 10.0.0.2/32\nDNS = 10.0.0.1\n\n[Peer]\nPublicKey = d29ybGQ=\nEndpoint = vpn.example.net:51820\nAllowedIPs = 0.0.0.0/0\n';

test('the list keeps ids and names only, in order, without repeats; the Keychain commands name each one', () => {
  assert.deepEqual(readVpnList([{ id: 'wg-a1', label: '  Sweden  ' }, { id: 'wg-a1', label: 'again' }, { id: 'Bad Id!', label: 'x' }, { id: 'wg-b2' }, 'junk']), [{ id: 'wg-a1', label: 'Sweden' }, { id: 'wg-b2', label: '' }]);
  assert.deepEqual(readVpnList(undefined), []);
  assert.equal(vpnServiceOf('wg-a1'), 'dsh-recon-wg-wg-a1');
  // The file's contents never on a command line: copied, then pasted when security asks.
  assert.equal(vpnStoreCommandFor('wg-a1'), 'base64 -i ~/PATH/TO/YOUR-FILE.conf | pbcopy && security add-generic-password -U -s dsh-recon-wg-wg-a1 -a wireguard -w');
  assert.equal(vpnRemoveCommandFor('wg-a1'), 'security delete-generic-password -s dsh-recon-wg-wg-a1');
});

test('a stored configuration: base64 as the command stores it, or plain text; a file that is not WireGuard is refused', () => {
  assert.equal(decodeStored(Buffer.from(GOOD).toString('base64')), GOOD);
  assert.equal(decodeStored(GOOD), GOOD.trim());
  assert.equal(wgProblem(GOOD), '');
  assert.match(wgProblem('hello'), /no \[Interface\]/);
  assert.match(wgProblem('[Interface]\nAddress = 1\n[Peer]\nEndpoint = a:1'), /no PrivateKey/);
  assert.match(wgProblem('[Interface]\nPrivateKey = k\n'), /no \[Peer\]/);
  assert.match(wgProblem('[Interface]\nPrivateKey = k\n[Peer]\nPublicKey = p\n'), /no Endpoint/);
  assert.match(wgProblem('[Interface]\nPrivateKey = k\n[Peer]\nEndpoint = a:1\n'), /no DNS line/);
  assert.equal(wireproxyConfig({ wgPath: '/tmp/x/wg.conf', port: 4242 }), 'WGConfig = /tmp/x/wg.conf\n\n[Socks5]\nBindAddress = 127.0.0.1:4242\n');
});

/** A stand-in for wireproxy: reads its configuration, notes what it saw, and opens the port it names. */
function fakeWireproxy(dir) {
  const program = join(dir, 'wireproxy');
  writeFileSync(program, `#!/usr/bin/python3
import socket, sys, re, time, os
conf = open(sys.argv[2]).read()
wg = re.search(r'WGConfig = (.+)', conf).group(1).strip()
port = int(re.search(r'BindAddress = 127.0.0.1:(\\d+)', conf).group(1))
open(os.path.join(${JSON.stringify(dir)}, 'seen.txt'), 'w').write(open(wg).read())
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', port)); s.listen(5)
while True:
    c, _ = s.accept(); c.close()
`);
  chmodSync(program, 0o755);
  return program;
}

test('the primary first, then the backups in order: one not in the Keychain and one that is not WireGuard are skipped, with the reason', { skip: !existsSync('/usr/bin/python3') && 'needs python3' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-vpn-'));
  try {
    const program = fakeWireproxy(dir);
    const stored = { 'dsh-recon-wg-wg-b': 'not a config', 'dsh-recon-wg-wg-c': Buffer.from(GOOD).toString('base64') };
    const list = () => [{ id: 'wg-a', label: 'Primary' }, { id: 'wg-b', label: 'Backup one' }, { id: 'wg-c', label: '' }];
    const checked = [];
    const vpn = createVpn({ list, bin: () => program, read: async (service) => stored[service] ?? '', check: async (port) => { checked.push(port); return true; }, startMs: 8000 });
    const got = await vpn.start();
    assert.equal(got.ok, true, JSON.stringify(got));
    assert.equal(got.name, 'WireGuard 3', 'the third, unnamed, is the one that works');
    assert.deepEqual(checked, [got.port], 'traffic was checked through its port');
    const status = vpn.status();
    assert.equal(status.state, 'ready');
    assert.deepEqual(status.tried.map((entry) => entry.name), ['Primary', 'Backup one']);
    assert.match(status.tried[0].why, /not in the Keychain/);
    assert.match(status.tried[1].why, /not a usable WireGuard configuration/);
    // wireproxy read the configuration, and the files are gone now.
    for (let i = 0; i < 50 && !existsSync(join(dir, 'seen.txt')); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(readFileText(join(dir, 'seen.txt')), GOOD);
    const left = readdirSync(tmpdir()).filter((name) => name.startsWith('dsh-recon-wg-')).flatMap((name) => { try { return readdirSync(join(tmpdir(), name)); } catch { return []; } });
    assert.deepEqual(left.filter((name) => name.endsWith('.conf')), [], 'no configuration file is left on disk');
    // Asked again while it runs: the same tunnel.
    assert.equal((await vpn.start()).port, got.port);
    vpn.stop();
    assert.equal(vpn.status().state, 'off');
  } finally {
    pkillQuiet(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Stop any stand-in wireproxy left by a failed test, so the test run can end. */
const pkillQuiet = (dir) => { try { execFileSync('/usr/bin/pkill', ['-f', `${dir}/wireproxy`]); } catch { /* none left */ } };
const readFileText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

test('none set up, wireproxy missing, or none passing traffic: no tunnel, and it says why', async () => {
  const none = createVpn({ list: () => [], bin: () => '/nowhere' });
  assert.match((await none.start()).why, /No WireGuard configuration is set up/);
  const missing = createVpn({ list: () => [{ id: 'wg-a', label: 'A' }], bin: () => '' });
  assert.match((await missing.start()).why, /wireproxy program was not found/);
  if (!existsSync('/usr/bin/python3')) return;
  const dir = mkdtempSync(join(tmpdir(), 'recon-vpn-'));
  try {
    const program = fakeWireproxy(dir);
    const dead = createVpn({ list: () => [{ id: 'wg-a', label: 'A' }], bin: () => program, read: async () => GOOD, check: async () => false, startMs: 8000 });
    const got = await dead.start();
    assert.equal(got.ok, false);
    assert.match(got.why, /No WireGuard configuration works: A: its tunnel passes no traffic/);
    assert.equal(dead.status().state, 'failed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the relay reaches its server through the tunnel\'s SOCKS5 port, the name looked up on the far side', async () => {
  // The server: answers what it gets, in capitals.
  const server = net.createServer((socket) => socket.on('data', (data) => socket.write(data.toString().toUpperCase())));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const seen = [];
  // The tunnel: a SOCKS5 server that notes which name it was asked for, and connects to the server.
  const socks = net.createServer((client) => {
    let stage = 0;
    client.on('data', function onData(chunk) {
      if (stage === 0) { stage = 1; client.write(Buffer.from([5, 0])); return; }
      const length = chunk[4];
      seen.push([chunk.subarray(5, 5 + length).toString(), chunk.readUInt16BE(5 + length)]);
      client.removeListener('data', onData);
      const far = net.connect({ host: '127.0.0.1', port: server.address().port }, () => {
        client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        client.pipe(far);
        far.pipe(client);
      });
    });
  });
  await new Promise((resolve) => socks.listen(0, '127.0.0.1', resolve));
  try {
    const way = await openForward('news.example.net', 563, { socksPort: socks.address().port });
    const answer = await new Promise((resolve, reject) => {
      const near = net.connect({ host: '127.0.0.1', port: way.port }, () => near.write('hello'));
      near.on('data', (data) => { resolve(data.toString()); near.destroy(); });
      near.on('error', reject);
    });
    way.close();
    assert.equal(answer, 'HELLO');
    assert.deepEqual(seen, [['news.example.net', 563]], 'the tunnel got the name, so nothing was looked up on this Mac');
  } finally {
    server.close();
    socks.close();
  }
  assert.equal(CHECK_HOST, 'one.one.one.one');
});

test('a configuration wireproxy refuses: the reason never repeats wireproxy\'s own words, which can hold the key', { skip: !existsSync('/usr/bin/python3') && 'needs python3' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-vpn-'));
  try {
    const program = join(dir, 'wireproxy');
    writeFileSync(program, '#!/usr/bin/python3\nimport sys\nsys.stderr.write("invalid base64 string: SECRETKEYSECRETKEY=\\n")\nsys.exit(1)\n');
    chmodSync(program, 0o755);
    const warned = [];
    const vpn = createVpn({ list: () => [{ id: 'wg-a', label: 'A' }], bin: () => program, read: async () => GOOD, check: async () => true, startMs: 4000, warn: (text) => warned.push(text) });
    const got = await vpn.start();
    assert.equal(got.ok, false);
    assert.doesNotMatch(got.why, /SECRETKEY/);
    assert.doesNotMatch(JSON.stringify(vpn.status()), /SECRETKEY/);
    assert.doesNotMatch(warned.join('\n'), /SECRETKEY/);
    assert.match(got.why, /wireproxy stopped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a running tunnel that stops passing traffic is noticed, and the configurations are tried again in order', { skip: !existsSync('/usr/bin/python3') && 'needs python3' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recon-vpn-'));
  try {
    const program = fakeWireproxy(dir);
    let primaryUp = true;
    const byPort = {};
    let lastRead = '';
    const vpn = createVpn({
      list: () => [{ id: 'wg-a', label: 'Primary' }, { id: 'wg-b', label: 'Backup' }],
      bin: () => program,
      read: async (service) => { lastRead = service; return GOOD; },
      // Each tunnel belongs to the configuration read just before it started; the primary's server answers only while primaryUp.
      check: async (port) => { byPort[port] = byPort[port] ?? lastRead; return byPort[port].endsWith('wg-a') ? primaryUp : true; },
      startMs: 8000,
      recheckMs: 0,
    });
    try {
      assert.equal((await vpn.start()).name, 'Primary');
      primaryUp = false;
      const next = await vpn.start();
      assert.equal(next.ok, true);
      assert.equal(next.name, 'Backup', 'the backup took over');
      assert.deepEqual(vpn.status().tried.map((one) => one.name), ['Primary']);
    } finally {
      vpn.stop();
      pkillQuiet(dir);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
