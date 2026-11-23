/**
 * Devices' network door end to end on a stand-in app: route, ifconfig, ipconfig, dns-sd, ssh-keyscan,
 * ssh-keygen, ssh, security and pmset are scripted answers. Nothing real runs: no network is looked at,
 * no host is reached, the Keychain is not touched. The router and the Windows server are emulated from
 * the commands Devices sends.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';
import { addressRefusal, cidrOf, inCidr, macOf, markedOf, onMarked, parseBrowse } from '../lib/network.js';
import { ASKPASS, keychainInput, networkFiles, sshArgs } from '../lib/ssh.js';
import { ROUTER_NEVER, maskedSettings, routerSettingRule } from '../lib/router.js';
import { SCRIPTS, powershellCommand, serviceRefusal } from '../lib/windows.js';

const FP = 'SHA256:' + 'A'.repeat(43);
const FP2 = 'SHA256:' + 'B'.repeat(43);
const unquote = (word) => String(word).replace(/^'|'$/g, '').replace(/'\\''/g, "'");

function world({ mission } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'bench-net-'));
  const state = {
    asked: [], calls: [], approve: 'allowed-once', approveSecond: undefined,
    net: { iface: 'en0', ip: '192.168.8.120', mask: '0xffffff00', ssid: 'Home', gateway: '192.168.8.1', gatewayMac: '94:83:c4:1:2:3' },
    dns: new Map([['router.local', '192.168.8.1'], ['far.local', '10.0.0.5']]),
    hostKey: FP, keychain: new Map(),
    router: { uci: new Map([['system.@system[0].hostname', 'GL-BE3600'], ['wireless.default_radio0', 'wifi-iface'], ['wireless.default_radio0.ssid', 'Home'], ['wireless.default_radio0.key', 'hunter22secret'], ['wireless.radio0', 'wifi-device'], ['wireless.radio0.txpower', '20']]), gl: '4.6.8', uptime: 259200, writeResult: 'reboot', backup: Buffer.from('tar.gz bytes with keys'), uploaded: Buffer.alloc(0), wrote: 0, testOk: true, answers: true },
    server: { services: new Map([['Spooler', { status: 'Running', startType: 'Automatic' }], ['sshd', { status: 'Running', startType: 'Automatic' }], ['wuauserv', { status: 'Running', startType: 'Manual' }], ['BITS', { status: 'Running', startType: 'Manual' }]]), restore: true, changes: 0 },
    power: "Now drawing from 'AC Power'",
    pages: new Map(),
  };
  const ps = (script) => {
    const service = /-Name '([^']+)'/.exec(script)?.[1];
    if (script.includes('Win32_OperatingSystem')) return JSON.stringify({ name: 'NAS', system: 'Microsoft Windows 10 IoT Enterprise LTSC', version: '10.0.19044', build: '19044', booted: '2026-11-16T08:00:00', model: 'N1', maker: 'LincPlus', memoryGB: 16 });
    if (script.startsWith('Get-Service |')) return JSON.stringify([...state.server.services].map(([Name, s]) => ({ Name, DisplayName: Name, Status: s.status, StartType: s.startType })));
    if (script.includes('Checkpoint-Computer')) return state.server.restore ? 'BENCH-OK' : 'BENCH-NO: System Restore is off';
    if (script.startsWith('$s=Get-Service')) return JSON.stringify({ name: state.server.services.get(service).realName ?? service, status: state.server.services.get(service).status, startType: state.server.services.get(service).startType });
    if (script.startsWith('Start-Service')) { state.server.services.get(service).status = 'Running'; state.server.changes += 1; return 'BENCH-OK'; }
    if (script.startsWith('Stop-Service')) { state.server.services.get(service).status = 'Stopped'; state.server.changes += 1; return 'BENCH-OK'; }
    if (script.startsWith('Set-Service')) { state.server.services.get(service).startType = /-StartupType '?(\w+)'?/.exec(script)[1]; state.server.changes += 1; return 'BENCH-OK'; }
    return '';
  };
  const router = (command, input) => {
    const r = state.router;
    if (!r.answers) return { code: 255, stdout: '', stderr: 'ssh: connect to host: Connection refused' };
    if (command.startsWith('cat /etc/openwrt_release')) return { code: 0, stdout: `DISTRIB_ID='OpenWrt'\nDISTRIB_RELEASE='23.05'\n@@\n${r.gl}\n@@\nGL.iNet GL-BE3600\n@@\nLinux 5.4 aarch64\n@@\n up 3 days\n@@\n${r.uptime}.42 1000.00\n`, stderr: '' };
    if (command.startsWith('cat /proc/mtd')) return { code: 0, stdout: 'dev:    size   erasesize  name\nmtd0: 00080000 00010000 "0:SBL1"\nmtd5: 00080000 00010000 "0:APPSBL"\nmtd8: 00040000 00010000 "0:ART"\n@@\n', stderr: '' };
    if (command.startsWith('uci show')) return { code: 0, stdout: [...r.uci].map(([k, v]) => `${k}='${v}'`).join('\n'), stderr: '' };
    let found = /^uci -q get '([^']+)'$/.exec(command);
    if (found) return r.uci.has(found[1]) ? { code: 0, stdout: `${r.uci.get(found[1])}\n`, stderr: '' } : { code: 1, stdout: '', stderr: '' };
    found = /^uci set '([^=]+)=(.*)' && uci commit /.exec(command);
    if (found) { r.uci.set(found[1], unquote(`'${found[2]}'`)); return { code: 0, stdout: '', stderr: '' }; }
    found = /^uci -q delete '([^']+)'/.exec(command);
    if (found) { r.uci.delete(found[1]); return { code: 0, stdout: '', stderr: '' }; }
    if (command.includes('sysupgrade -b')) return { code: 0, stdout: 'BENCH-OK\n', stderr: '' };
    if (command === 'cat /tmp/bench-config.tar.gz') {
      r.reads = (r.reads ?? 0) + 1;
      return { code: 0, stdout: r.flip && r.reads % 2 === 0 ? Buffer.from('changed between reads') : r.backup, stderr: '' };
    }
    if (command.startsWith('rm -f')) return { code: 0, stdout: '', stderr: '' };
    if (command === 'cat > /tmp/bench-firmware.bin') { r.uploaded = r.corrupt ? Buffer.from('half a file') : Buffer.from(input); return { code: 0, stdout: '', stderr: '' }; }
    if (command.startsWith('sha256sum')) return { code: 0, stdout: `${createHash('sha256').update(r.uploaded).digest('hex')}  /tmp/bench-firmware.bin\n`, stderr: '' };
    if (command.startsWith('sysupgrade -T')) return { code: r.testOk ? 0 : 1, stdout: r.testOk ? 'BENCH-OK\n' : '', stderr: r.testOk ? '' : 'Image check failed' };
    if (command.startsWith('sysupgrade -v')) {
      if (r.writeResult === 'fail') return { code: 1, stdout: '', stderr: 'Image check failed' };
      if (r.writeResult === 'noreboot') return { code: 0, stdout: 'Upgrade cancelled', stderr: '' };
      if (r.writeResult === 'drop-only') return { code: 255, stdout: '', stderr: 'Connection closed' };
      r.wrote += 1; r.gl = '4.7.0'; r.uptime = 40;
      return { code: 255, stdout: '', stderr: 'Connection closed' };
    }
    return { code: 127, stdout: '', stderr: `unknown: ${command}` };
  };
  const run = async (file, args, options = {}) => {
    state.calls.push({ file, args, env: options.env, input: options.input });
    const program = file.split('/').pop();
    if (program === 'route') return { code: 0, stdout: `   route to: default\ndestination: default\n    gateway: ${state.net.gateway}\ninterface: ${state.net.iface}\n`, stderr: '' };
    if (program === 'arp') return { code: 0, stdout: args[1] === state.net.gateway ? `? (${state.net.gateway}) at ${state.net.gatewayMac} on en0 ifscope [ethernet]\n` : '', stderr: '' };
    if (program === 'dscacheutil') return { code: 0, stdout: state.dns.has(args.at(-1)) ? `name: ${args.at(-1)}\nip_address: ${state.dns.get(args.at(-1))}\n` : '', stderr: '' };
    if (program === 'ifconfig') return { code: 0, stdout: `en0: flags=8863\n\tinet ${state.net.ip} netmask ${state.net.mask} broadcast 192.168.8.255\n`, stderr: '' };
    if (program === 'ipconfig') return { code: 0, stdout: `<dictionary> {\n  SSID : ${state.net.ssid}\n}\n`, stderr: '' };
    if (program === 'dns-sd') return { code: null, stdout: args[1] === '_ssh._tcp' ? 'Browsing for _ssh._tcp.local.\nDATE: ---Mon 16 Nov 2026---\n12:00:00.001  Add        2   4 local.               _ssh._tcp.           GL-BE3600-4b2\n' : '', stderr: '', timedOut: true };
    if (program === 'ssh-keyscan') return { code: 0, stdout: `${args.at(-1)} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample\n`, stderr: '' };
    if (program === 'ssh-keygen') {
      if (args.includes('-l')) return { code: 0, stdout: `256 ${state.hostKey} no comment (ED25519)\n`, stderr: '' };
      const key = args[args.indexOf('-f') + 1];
      writeFileSync(key, 'PRIVATE', { mode: 0o600 });
      writeFileSync(`${key}.pub`, 'ssh-ed25519 AAAAbench DeepSeek Harness Bench\n');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (program === 'security') {
      if (args[0] === '-i') {
        const found = /-a (\S+) .*-X ([0-9a-f]+)/.exec(String(options.input));
        if (found) state.keychain.set(found[1], Buffer.from(found[2], 'hex').toString('utf8'));
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'find-generic-password') return { code: state.keychain.has(args.at(-1)) ? 0 : 44, stdout: '', stderr: '' };
      if (args[0] === 'delete-generic-password') { state.keychain.delete(args.at(-1)); return { code: 0, stdout: '', stderr: '' }; }
    }
    if (program === 'pmset') return { code: 0, stdout: state.power, stderr: '' };
    if (program === 'ssh') {
      const command = args.at(-1);
      if (command.startsWith('powershell ')) {
        const script = Buffer.from(command.split(' ').at(-1), 'base64').toString('utf16le');
        return { code: 0, stdout: `${ps(script)}\n`, stderr: '' };
      }
      return router(command, options.input);
    }
    return { code: 1, stdout: '', stderr: 'unknown program' };
  };
  const registered = new Map();
  let route;
  const settings = { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'bench' } }], mutate: async () => {} };
  const services = { dshHomePath: (name) => join(home, name), settings, tools: { register(tool) { registered.set(tool.name, tool); return () => registered.delete(tool.name); } }, modes: { get: () => MODE_ID, isolated: () => false }, agents: { list: () => [] } };
  const ctx = {
    get: (key) => services[key], on() {}, effect(fn) { fn(); }, provide() {},
    inject: (_names, callback) => callback({ effect: (fn) => fn(), webServer: { register: (spec) => { route = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }),
    logger: { warn() {}, info() {} },
  };
  apply(ctx, { enabled: true, folder: '' }, {
    ...(mission ? { mission } : {}),
    identify: async () => 'USB report',
    find: async (id) => `/fake/bin/${id}`,
    run,
    sleep: async () => {},
    approve: async (_exec, reason) => { state.asked.push(reason); const answer = state.approveSecond && state.asked.length > 1 ? state.approveSecond : state.approve; return answer; },
    fetch: async (url) => {
      const page = state.pages.get(url);
      if (!page) return { status: 404, headers: { get: () => null }, text: async () => '' };
      return { status: 200, headers: { get: () => null }, text: async () => page };
    },
  });
  const agent = (said = '', helper = false) => ({ id: helper ? 'h1' : 'b1', header: helper ? { parentSession: 'b1' } : {}, session: { deriveMessages: () => [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: said }] }] } });
  const call = async (name, args, { said = '', helper = false } = {}) => (await registered.get(name).execute(args, { agent: agent(said, helper), name })).text;
  const post = async (body) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    const req = { method: 'POST', url: '/dsh-bench/data', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    await route(req, res);
    return { status: res.statusCode, json: JSON.parse(out) };
  };
  const device = (name) => join(home, 'bench', 'devices', name);
  const ssh = () => state.calls.filter((entry) => entry.file.endsWith('/ssh'));
  return { home, state, call, post, device, ssh, close: () => rmSync(home, { recursive: true, force: true }) };
}
const settle = () => new Promise((done) => setTimeout(done, 20));

/** A router with a card, network settings, a marked network, a key and a trusted host key. */
async function readyRouter(app, { signIn = 'key', level = 'adjust', asks = 'ask-auto', dryRun = false } = {}) {
  await app.call('bench_card', { name: 'Slate 7', recovery: 'GL.iNet U-Boot recovery page: hold reset while powering on, open http://192.168.1.1' });
  assert.equal((await app.post({ action: 'network', label: 'Home', cidr: '192.168.8.0/24' })).status, 200);
  assert.equal((await app.post({ action: 'net', name: 'Slate 7', address: '192.168.8.1', port: 22, user: 'root', signIn })).status, 200);
  assert.equal((await app.post({ action: 'permissions', name: 'Slate 7', level, asks, dryRun, ranges: '' })).status, 200);
  if (signIn === 'key') await app.call('bench_network', { action: 'key' });
  else assert.equal((await app.post({ action: 'password', name: 'Slate 7', password: "s3cret 'pw\"" })).status, 200);
  assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /is trusted: key SHA256:A{43}/);
}

test('networks and addresses: only private ranges and .local names; the Mac must be on a marked network', () => {
  assert.equal(cidrOf('192.168.8.77/24'), '192.168.8.0/24');
  assert.throws(() => cidrOf('8.8.8.0/24'), /private range/);
  assert.equal(inCidr('192.168.8.1', '192.168.8.0/24'), true);
  assert.equal(inCidr('192.168.9.1', '192.168.8.0/24'), false);
  assert.equal(addressRefusal('192.168.8.1', { cidr: '192.168.8.0/24' }), '');
  assert.match(addressRefusal('192.168.9.1', { cidr: '192.168.8.0/24' }), /outside the marked network/);
  assert.match(addressRefusal('8.8.8.8', undefined), /not an address on a home network/);
  assert.match(addressRefusal('example.com', undefined), /not a private address or a \.local name/);
  assert.equal(addressRefusal('router.local', undefined), '');
  assert.throws(() => markedOf({}, { ip: '', gatewayMac: '' }), /while the Mac is on it/);
  assert.deepEqual(markedOf({ label: 'Home' }, { ip: '192.168.8.120', cidr: '192.168.8.0/24', ssid: '', gatewayMac: '94:83:c4:01:02:03' }), { label: 'Home', ssid: '', cidr: '192.168.8.0/24', gatewayMac: '94:83:c4:01:02:03' });
  assert.throws(() => markedOf({ cidr: '10.0.0.0/24' }, { ip: '192.168.8.120', cidr: '192.168.8.0/24', gatewayMac: '94:83:c4:01:02:03' }), /is not in 10\.0\.0\.0\/24/);
  const home = { cidr: '192.168.8.0/24', gatewayMac: '94:83:c4:01:02:03' };
  assert.equal(onMarked({ ip: '192.168.8.20', ssid: 'Home', gatewayMac: '94:83:c4:01:02:03' }, [home]), home);
  assert.equal(onMarked({ ip: '192.168.8.20', ssid: 'Home', gatewayMac: '94:83:c4:99:99:99' }, [home]), undefined, 'a hotel\'s GL.iNet: same range, another router');
  assert.equal(onMarked({ ip: '192.168.8.20', ssid: 'Home', gatewayMac: '94:83:c4:01:02:03' }, [{ ssid: 'Home', cidr: '192.168.8.0/24' }]), undefined, 'an older mark without its router does not count');
  assert.equal(macOf('94:83:C4:1:2:3'), '94:83:c4:01:02:03');
  assert.deepEqual(parseBrowse('12:00:00.001  Add        2   4 local.               _ssh._tcp.           My\u202e router'), [{ type: '_ssh._tcp', name: 'My router' }]);
});

test('the SSH sign-in: fixed options, Devices\' own known_hosts, the key or the Keychain; a password never on a command line', () => {
  const files = { key: '/b/network/id_ed25519', knownHosts: '/b/network/known_hosts', askpass: '/b/network/askpass.sh' };
  const keyArgs = sshArgs({ net: { address: '192.168.8.1', port: 22, user: 'root', signIn: 'key' }, files, command: 'uname', alias: 'bench-slate-7' });
  for (const option of ['StrictHostKeyChecking=yes', 'HostKeyAlias=bench-slate-7', 'UserKnownHostsFile="/b/network/known_hosts"', 'GlobalKnownHostsFile=/dev/null', 'BatchMode=yes', 'IdentitiesOnly=yes', 'ForwardAgent=no']) assert.ok(keyArgs.includes(option), option);
  assert.deepEqual(keyArgs.slice(keyArgs.indexOf('-F'), keyArgs.indexOf('-F') + 2), ['-F', '/dev/null'], 'the user\'s own ssh config is not read');
  const pwArgs = sshArgs({ net: { address: '192.168.8.1', port: 22, user: 'root', signIn: 'password' }, files, command: 'uname', alias: 'bench-slate-7' });
  assert.throws(() => networkFiles('/Users/me/Devices $HOME'), /%, \$ or "/);
  assert.throws(() => networkFiles('/Users/me/100% Devices'), /%, \$ or "/);
  assert.equal(networkFiles('/Users/me/My Devices').knownHosts, '/Users/me/My Devices/known_hosts', 'a space is fine: the path is quoted');
  assert.ok(pwArgs.includes('PubkeyAuthentication=no'));
  assert.match(keychainInput('slate-7', 'p w"\''), /-X 7020772227\n$/);
  assert.doesNotMatch(keychainInput('slate-7', 'hunter22'), /hunter22/, 'the password goes to the Keychain as hexadecimal');
  assert.throws(() => keychainInput('../x', 'a'), /not a device folder/);
  assert.match(ASKPASS, /find-generic-password -s 'DeepSeekHarnessBench' -a "\$BENCH_KEYCHAIN_ACCOUNT" -w/);
  assert.match(ASKPASS, /\*\[!a-z0-9-\]\*\) exit 1/, 'only a checked account name');
});

test('the network door on a stand-in app: nothing without a marked network; listing what announces itself; trusting a key with the user\'s yes', async () => {
  const app = world();
  try {
    await settle();
    assert.match(await app.call('bench_network', { action: 'discover' }), /No network is marked as yours yet/);
    assert.equal((await app.post({ action: 'network', label: 'Home', cidr: '8.8.8.0/24' })).status, 400);
    assert.equal((await app.post({ action: 'network', label: 'Home' })).status, 200);
    // A hotel's network: same Wi-Fi name, same GL.iNet range, another router.
    app.state.net.gatewayMac = '94:83:c4:aa:bb:cc';
    assert.match(await app.call('bench_network', { action: 'discover' }), /not on a network marked as yours right now \(192\.168\.8\.0\/24, router 94:83:c4:aa:bb:cc\)/);
    assert.equal(app.state.calls.some((entry) => entry.file.endsWith('dns-sd')), false, 'nothing looked at on another network');
    app.state.net.gatewayMac = '94:83:c4:1:2:3';
    assert.match(await app.call('bench_network', { action: 'discover' }), /"GL-BE3600-4b2" \(_ssh\._tcp\)/);
    await app.call('bench_card', { name: 'Slate 7' });
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /no network settings yet/);
    assert.equal((await app.post({ action: 'net', name: 'Slate 7', address: '8.8.8.8', port: 22, user: 'root' })).status, 400, 'not a home address');
    assert.equal((await app.post({ action: 'net', name: 'Slate 7', address: '192.168.8.1', port: 22, user: 'root; rm' })).status, 400);
    assert.equal((await app.post({ action: 'net', name: 'Slate 7', address: '192.168.8.1', port: 22, user: 'root' })).status, 200);
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }, { helper: true }), /a helper of a run cannot ask/);
    app.state.approve = 'rejected';
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /The user said no to trusting/);
    app.state.approve = 'allowed-once';
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /is trusted/);
    assert.match(app.state.asked.at(-1), /Its key fingerprint is SHA256:A{43}/);
    assert.match(readFileSync(join(app.home, 'bench', 'network', 'known_hosts'), 'utf8'), /^bench-slate-7 ssh-ed25519 /, 'kept under the card\'s own name');
    app.state.hostKey = FP2;
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /linked to the device with key SHA256:A{43}, and 192\.168\.8\.1 answers with SHA256:B{43}/);
    const unlinked = await app.post({ action: 'unlink', name: 'Slate 7' });
    assert.equal(unlinked.status, 200);
    assert.doesNotMatch(readFileSync(join(app.home, 'bench', 'network', 'known_hosts'), 'utf8'), /bench-slate-7/, 'unlinking forgets its key');
    const key = await app.call('bench_network', { action: 'key' });
    assert.match(key, /ssh-ed25519 AAAAbench/);
    assert.equal((await app.post({ action: 'key' })).json.publicKey, 'ssh-ed25519 AAAAbench DeepSeek Harness Bench');
  } finally {
    app.close();
  }
});

test('a password goes only into the Keychain: never in a file, a card, a log, an argument or the answer; ssh asks the helper for it', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app, { signIn: 'password' });
    assert.equal(app.state.keychain.get('slate-7'), "s3cret 'pw\"");
    const secret = /s3cret/;
    for (const entry of app.state.calls) {
      assert.doesNotMatch(entry.args.join(' '), secret, `${entry.file} got it as an argument`);
      assert.doesNotMatch(JSON.stringify(entry.env ?? {}), secret, `${entry.file} got it in its environment`);
    }
    const files = (dir) => readFileSync(join(app.device('slate-7'), dir), 'utf8');
    assert.doesNotMatch(files('card.json') + files('card.md') + files('logbook.md'), secret);
    assert.match(files('logbook.md'), /Password saved in the Keychain by the user/);
    const info = await app.call('bench_router', { name: 'Slate 7', action: 'info' });
    assert.match(info, /OpenWrt 23\.05, GL\.iNet firmware 4\.6\.8/);
    const call = app.ssh().at(-1);
    assert.equal(call.env.SSH_ASKPASS, join(app.home, 'bench', 'network', 'askpass.sh'));
    assert.equal(call.env.BENCH_KEYCHAIN_ACCOUNT, 'slate-7');
    assert.doesNotMatch(JSON.stringify(call), secret);
    await app.post({ action: 'forgetPassword', name: 'Slate 7' });
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'info' }), /No password is saved for Slate 7/);
  } finally {
    app.close();
  }
});

test('the router: read with keys masked; a checked backup kept on this Mac; only the short list of settings, never radio limits or keys; undo', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app);
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'info' }), /Storage parts: 0:SBL1 \(never written by Devices\)[\s\S]*0:ART \(never written by Devices\)/);
    const settings = await app.call('bench_router', { name: 'Slate 7', action: 'settings' });
    assert.match(settings, /wireless\.default_radio0\.key='\[masked\]'/);
    assert.doesNotMatch(settings, /hunter22/);
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'get', key: 'wireless.default_radio0.key' }), /holds a key, a password or a PIN/);
    // Secrets under other names, and values masked whatever the name.
    app.state.router.uci.set('wireless.default_radio0.key2', 'wep-secret-2');
    app.state.router.uci.set('network.wan.pincode', '1234');
    app.state.router.uci.set('network.vpn.priv_key_pwd', 'pw');
    app.state.router.uci.set('system.@system[0].notes', 'password: hunter22');
    for (const key of ['wireless.default_radio0.key2', 'network.wan.pincode', 'network.vpn.priv_key_pwd', 'system.@system[0].passwd']) assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'get', key }), /never reads it out/, key);
    assert.doesNotMatch(await app.call('bench_router', { name: 'Slate 7', action: 'get', key: 'system.@system[0].notes' }), /hunter22/);
    assert.doesNotMatch(await app.call('bench_router', { name: 'Slate 7', action: 'settings' }), /wep-secret-2|1234'|=\'pw\'/);
    const backup = await app.call('bench_router', { name: 'Slate 7', action: 'backup' });
    assert.match(backup, /checked: read twice, both equal[\s\S]*never shown to a model/);
    const list = JSON.parse(readFileSync(join(app.device('slate-7'), 'backups.json'), 'utf8'));
    assert.deepEqual(readFileSync(join(app.device('slate-7'), 'backups', list[0].file)), app.state.router.backup);
    assert.doesNotMatch(backup, /tar\.gz bytes/);
    const set = (key, value, extra = {}) => app.call('bench_router', { name: 'Slate 7', action: 'set', key, value, ...extra });
    assert.match(await set('wireless.radio0.txpower', '30'), /radio limit, a key or a setting that can lock you out/);
    assert.match(await set('wireless.radio0.channel', '149'), /radio limit/);
    assert.match(await set('wireless.radio0.country', 'US'), /radio limit/);
    assert.match(await set('network.lan.ipaddr', '10.0.0.1'), /lock you out/);
    assert.match(await set('wireless.default_radio0.key', 'x'), /radio limit, a key/);
    assert.match(await set('system.@system[0].hostname', 'bad name;reboot'), /is not a value/);
    assert.match(await set('wireless.radio0.ssid', 'X'), /is not a Wi-Fi network on this router/);
    assert.equal(app.state.router.uci.get('wireless.radio0.txpower'), '20');
    assert.match(await set('system.@system[0].hostname', 'slate'), /GL-BE3600 → slate, read back and equal\. It is on the undo list/);
    assert.match(app.state.asked.at(-1), /^Change system\.@system\[0\]\.hostname \(the router's name\) on Slate 7 from GL-BE3600 to slate/);
    assert.ok(app.ssh().some((entry) => entry.args.at(-1) === "uci set 'system.@system[0].hostname=slate' && uci commit system && /etc/init.d/system reload"));
    assert.match(await set('wireless.default_radio0.ssid', "Ann's net"), /The Mac is on the Wi-Fi "Home" itself/, 'never the Wi-Fi the Mac is on');
    assert.match(await set('wireless.default_radio0.ssid', 'x'.repeat(31) + 'é'), /at most 32 bytes/);
    assert.match(await set('wireless.default_radio0.ssid', 'a\tb'), /is not a value/);
    assert.match(await set('dhcp.lan.leasetime', '1m'), /at least 2m/);
    app.state.net.ssid = '';
    assert.match(await set('wireless.default_radio0.ssid', "Ann's net"), /macOS does not show which Wi-Fi the Mac is on[\s\S]*names "Home" in their own message/);
    app.state.net.ssid = 'Other';
    assert.match(await set('wireless.default_radio0.ssid', "Ann's net"), /Home → Ann's net, read back/);
    assert.match(app.state.asked.at(-1), /must be connected again to the new name/);
    assert.match(await app.call('bench_undo', { name: 'Slate 7', which: 'all-since', since: JSON.parse(readFileSync(join(app.device('slate-7'), 'undo.json'), 'utf8'))[0].id }), /Each was read back/);
    assert.equal(app.state.router.uci.get('system.@system[0].hostname'), 'GL-BE3600');
    assert.equal(app.state.router.uci.get('wireless.default_radio0.ssid'), 'Home');
  } finally {
    app.close();
  }
});

test('router firmware by the maker\'s route: the four conditions, the yes, the file checked on the router, sysupgrade keeping settings, the restart checked; a new backup after', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app, { level: 'write' });
    const folder = join(app.device('slate-7'), 'firmware');
    mkdirSync(folder, { recursive: true });
    const bytes = Buffer.alloc(6000, 9);
    const sum = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'gl-be3600-4.7.0.bin'), bytes);
    const source = 'https://dl.gl-inet.com/router/be3600/stable';
    const write = () => app.call('bench_router', { name: 'Slate 7', action: 'firmware', file: 'gl-be3600-4.7.0.bin', source });
    let said = await write();
    assert.match(said, /Not written[\s\S]*Missing:[\s\S]*backup: no checked configuration backup/);
    assert.match(said, /Missing:[\s\S]*firmware checksum: the page answered 404/);
    app.state.pages.set(source, `gl-be3600-4.7.0.bin sha256 ${sum}`);
    await app.call('bench_router', { name: 'Slate 7', action: 'backup' });
    app.state.approve = 'rejected';
    assert.match(await write(), /The user said no to writing firmware/);
    assert.equal(app.state.router.wrote, 0);
    app.state.approve = 'allowed-once';
    app.state.router.testOk = false;
    said = await write();
    assert.match(said, /not a firmware it takes \(sysupgrade -T\); nothing was written[\s\S]*To bring it back: GL\.iNet U-Boot/);
    assert.equal(app.state.router.wrote, 0);
    app.state.router.testOk = true;
    said = await write();
    assert.match(said, /^Written: gl-be3600-4\.7\.0\.bin on Slate 7\. It restarted and answers: OpenWrt 23\.05, GL\.iNet 4\.7\.0/);
    assert.equal(app.state.router.wrote, 1);
    assert.deepEqual(app.state.router.uploaded, bytes);
    assert.ok(app.ssh().some((entry) => entry.args.at(-1) === 'sysupgrade -v /tmp/bench-firmware.bin'));
    assert.equal(app.ssh().some((entry) => /\b(mtd|dd)\b|sysupgrade -n/.test(entry.args.at(-1))), false, 'never the loader, the calibration, or wiping the settings');
    assert.match(await write(), /Not written[\s\S]*backup: no checked configuration backup since the last firmware write/);
  } finally {
    app.close();
  }
});

test('the Windows server: read; a service changed only when the user names it, never the ones Windows or SSH need; a restore point first, or the user\'s yes without one; undo', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'NAS' });
    await app.post({ action: 'network', label: 'Home', cidr: '192.168.8.0/24' });
    await app.post({ action: 'net', name: 'NAS', address: '192.168.8.20', port: 22, user: 'Sam Admin', signIn: 'key' });
    await app.post({ action: 'permissions', name: 'NAS', level: 'adjust', asks: 'full-auto', dryRun: false, ranges: '' });
    await app.call('bench_network', { action: 'key' });
    await app.call('bench_network', { action: 'trust', name: 'NAS' });
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'info' }), /Windows 10 IoT Enterprise LTSC 10\.0\.19044 \(build 19044\), LincPlus N1/);
    const sent = app.ssh().at(-1).args.at(-1);
    assert.match(sent, /^powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand [A-Za-z0-9+/=]+$/);
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'services' }), /- Spooler \(Spooler\): Running, starts Automatic/);
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'bios' }), /does not update NAS's BIOS/);
    const stop = (said, service = 'Spooler') => app.call('bench_server', { name: 'NAS', action: 'service', service, change: 'stop' }, { said });
    assert.match(await stop('please stop the printer thing'), /only when you name it in your own message/);
    assert.match(await stop('stop sshd', 'sshd'), /Devices never stops or changes it/);
    assert.match(await stop("stop Spooler'; Remove-Item C:\\ -Recurse", "Spooler'; Remove-Item"), /as Windows writes it/);
    assert.equal(app.state.server.changes, 0);
    assert.match(await stop('stop Spooler please'), /Spooler is now Stopped, starts Automatic\. A restore point was made first\. It is on the undo list/);
    app.state.server.restore = false;
    app.state.approve = 'rejected';
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'service', service: 'Spooler', change: 'startup', startup: 'Manual' }, { said: 'set Spooler to manual' }), /The user said no to changing Spooler without a restore point/);
    assert.match(app.state.asked.at(-1), /No restore point could be made on NAS \(System Restore is off\)/, 'asked even in Full Auto');
    assert.equal(app.state.server.services.get('Spooler').startType, 'Automatic');
    app.state.approve = 'allowed-once';
    assert.match(await app.call('bench_undo', { name: 'NAS', which: 'last' }), /service Spooler: Stopped, starts Automatic → Running, starts Automatic\. Each was read back/);
    assert.equal(app.state.server.services.get('Spooler').status, 'Running');
  } finally {
    app.close();
  }
});

test('the rules of the recipes: radio limits never on the list; the scripts quote a service; refusals', () => {
  for (const key of ['wireless.radio0.txpower', 'wireless.radio1.country', 'wireless.radio0.htmode', 'wireless.radio0.channel', 'network.lan.ipaddr', 'firewall.@zone[0].input', 'dropbear.@dropbear[0].Port']) assert.ok(ROUTER_NEVER.test(key), key);
  assert.equal(routerSettingRule('system.@system[0].hostname', 'slate').why, '');
  assert.match(routerSettingRule('system.@system[0].log_ip', '1').why, /read only/);
  assert.deepEqual(maskedSettings("wireless.wifinet0.sae_password='x'\nsystem.@system[0].hostname='GL'"), ["wireless.wifinet0.sae_password='[masked]'", "system.@system[0].hostname='GL'"]);
  assert.match(SCRIPTS.stop("a'b"), /-Name 'a''b'/);
  assert.equal(Buffer.from(powershellCommand('Get-Date').split(' ').at(-1), 'base64').toString('utf16le'), 'Get-Date');
  assert.match(serviceRefusal('WinRM', 'stop winrm'), /never/);
  assert.equal(serviceRefusal('Spooler', 'Stop spooler.'), '');
  assert.match(serviceRefusal('Spool', 'stop spooler'), /name it in your own message/, 'the whole name, not a part of another word');
});

test('the network door\'s own checks: an address outside the marked range; two backup reads that differ; a file that arrives changed', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app, { level: 'write' });
    app.state.router.flip = true;
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'backup' }), /The two reads of Slate 7's backup differ, so it is not checked/);
    app.state.router.flip = false;
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'backup' }), /checked: read twice/);
    const folder = join(app.device('slate-7'), 'firmware');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'fw.bin'), Buffer.alloc(100, 1));
    const sum = createHash('sha256').update(Buffer.alloc(100, 1)).digest('hex');
    app.state.pages.set('https://dl.gl-inet.com/router/be3600/stable', sum);
    app.state.router.corrupt = true;
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'firmware', file: 'fw.bin', source: 'https://dl.gl-inet.com/router/be3600/stable' }), /The file on the router is not the one checked; nothing was written/);
    assert.equal(app.state.router.wrote, 0);
    await app.post({ action: 'net', name: 'Slate 7', address: '192.168.9.1', port: 22, user: 'root', signIn: 'key' });
    assert.match(await app.call('bench_router', { name: 'Slate 7', action: 'info' }), /192\.168\.9\.1 is outside the marked network 192\.168\.8\.0\/24/);
    assert.equal(app.ssh().some((entry) => entry.args.includes('192.168.9.1')), false);
  } finally {
    app.close();
  }
});

test('a router write counts only when the router restarted with a new version or a fresh uptime; otherwise failed or not confirmed, and a new backup is needed', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app, { level: 'write' });
    const folder = join(app.device('slate-7'), 'firmware');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'fw.bin'), Buffer.alloc(64, 2));
    app.state.pages.set('https://dl.gl-inet.com/router/be3600/stable', createHash('sha256').update(Buffer.alloc(64, 2)).digest('hex'));
    const write = () => app.call('bench_router', { name: 'Slate 7', action: 'firmware', file: 'fw.bin', source: 'https://dl.gl-inet.com/router/be3600/stable' });
    const backup = () => app.call('bench_router', { name: 'Slate 7', action: 'backup' });
    const writes = () => JSON.parse(readFileSync(join(app.device('slate-7'), 'writes.json'), 'utf8'));
    await backup();
    app.state.router.writeResult = 'fail';
    assert.match(await write(), /sysupgrade FAILED \(it ended with 1\) without restarting the router/);
    assert.deepEqual([writes().at(-1).ok, writes().at(-1).uncertain], [false, false]);
    app.state.router.writeResult = 'noreboot';
    assert.match(await write(), /without restarting the router, so the write is NOT confirmed/);
    assert.equal(writes().at(-1).uncertain, true);
    assert.match(await write(), /Not written[\s\S]*backup: no checked configuration backup since the last firmware write/, 'an unconfirmed write may have changed it: a new backup first');
    await backup();
    app.state.router.writeResult = 'drop-only';
    assert.match(await write(), /did not restart and runs the same version: the write is NOT confirmed/);
    assert.doesNotMatch(readFileSync(join(app.device('slate-7'), 'logbook.md'), 'utf8'), /Firmware written/);
    await backup();
    app.state.router.writeResult = 'reboot';
    assert.match(await write(), /^Written: fw\.bin on Slate 7\. It restarted and answers: OpenWrt 23\.05, GL\.iNet 4\.7\.0/);
    assert.equal(writes().at(-1).ok, true);
  } finally {
    app.close();
  }
});

test('host keys are kept per card: trusting another card at the same address does not re-point the first; undo only on the device it was made on', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app);
    await app.call('bench_card', { name: 'Clone' });
    await app.post({ action: 'net', name: 'Clone', address: '192.168.8.1', port: 22, user: 'root', signIn: 'key' });
    app.state.hostKey = FP2;
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Clone' }), /Clone is trusted: key SHA256:B{43}/);
    const known = readFileSync(join(app.home, 'bench', 'network', 'known_hosts'), 'utf8');
    assert.match(known, /^bench-slate-7 /m);
    assert.match(known, /^bench-clone /m, 'each card under its own name: the first is not re-pointed');
    await app.call('bench_router', { name: 'Slate 7', action: 'info' });
    assert.ok(app.ssh().at(-1).args.includes('HostKeyAlias=bench-slate-7'));
    await app.call('bench_router', { name: 'Clone', action: 'info' });
    assert.ok(app.ssh().at(-1).args.includes('HostKeyAlias=bench-clone'));
    app.state.net.ssid = 'Other';
    await app.call('bench_router', { name: 'Slate 7', action: 'set', key: 'system.@system[0].hostname', value: 'slate' });
    assert.equal(JSON.parse(readFileSync(join(app.device('slate-7'), 'undo.json'), 'utf8'))[0].net, FP);
    await app.post({ action: 'unlink', name: 'Slate 7' });
    app.state.hostKey = FP2;
    await app.call('bench_network', { action: 'trust', name: 'Slate 7' });
    assert.match(await app.call('bench_undo', { name: 'Slate 7', which: 'last' }), /could not be set back \(it was made on the device with key SHA256:A{43}, and the card is now linked to SHA256:B{43}\)/);
    assert.equal(app.state.router.uci.get('system.@system[0].hostname'), 'slate');
  } finally {
    app.close();
  }
});

test('a .local name is looked up and checked against the range; Devices connects to the address it checked', async () => {
  const app = world();
  try {
    await settle();
    await readyRouter(app);
    await app.post({ action: 'net', name: 'Slate 7', address: 'far.local', port: 22, user: 'root', signIn: 'key' });
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }), /far\.local: 10\.0\.0\.5 is outside the marked network 192\.168\.8\.0\/24/);
    assert.equal(app.state.calls.some((entry) => entry.file.endsWith('ssh-keyscan') && entry.args.includes('10.0.0.5')), false);
    await app.post({ action: 'net', name: 'Slate 7', address: 'router.local', port: 22, user: 'root', signIn: 'key' });
    await app.call('bench_network', { action: 'trust', name: 'Slate 7' });
    await app.call('bench_router', { name: 'Slate 7', action: 'info' });
    assert.equal(app.ssh().at(-1).args.at(-2), '192.168.8.1');
  } finally {
    app.close();
  }
});

test('Windows: undo checks the saved startup type; the name Windows answers with is checked; Wi-Fi services never changed', async () => {
  const app = world();
  try {
    await settle();
    app.state.server.services.set('OpenSSH', { status: 'Running', startType: 'Automatic', realName: 'sshd' });
    app.state.server.services.set('WlanSvc', { status: 'Running', startType: 'Automatic' });
    await app.call('bench_card', { name: 'NAS' });
    await app.post({ action: 'network', label: 'Home' });
    await app.post({ action: 'net', name: 'NAS', address: '192.168.8.20', port: 22, user: 'admin', signIn: 'key' });
    await app.post({ action: 'permissions', name: 'NAS', level: 'adjust', asks: 'full-auto', dryRun: false, ranges: '' });
    await app.call('bench_network', { action: 'key' });
    await app.call('bench_network', { action: 'trust', name: 'NAS' });
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'service', service: 'WlanSvc', change: 'stop' }, { said: 'stop WlanSvc' }), /never stops or changes it/);
    assert.match(await app.call('bench_server', { name: 'NAS', action: 'service', service: 'OpenSSH', change: 'stop' }, { said: 'stop OpenSSH' }), /sshd keeps Windows running, protects it or is Devices' own way in/);
    await app.call('bench_server', { name: 'NAS', action: 'service', service: 'Spooler', change: 'stop' }, { said: 'stop Spooler' });
    const file = join(app.device('nas'), 'undo.json');
    const list = JSON.parse(readFileSync(file, 'utf8'));
    list[0].old.startType = "Automatic'; Remove-Item C:\\ -Recurse; '";
    writeFileSync(file, JSON.stringify(list));
    assert.match(await app.call('bench_undo', { name: 'NAS', which: 'last' }), /its saved state is not one Devices sets/);
    assert.equal(app.state.server.services.get('Spooler').status, 'Stopped');
    assert.throws(() => SCRIPTS.startup('Spooler', 'Automatic; x'), /not a startup type/);
    assert.match(SCRIPTS.startup('Spooler', 'Manual'), /-StartupType 'Manual'/);
  } finally {
    app.close();
  }
});

test('Windows Update and BITS: changed only when the user names them, after a restore point, with undo; SSH and Wi-Fi stay protected', async () => {
  const app = world();
  try {
    await settle();
    await app.call('bench_card', { name: 'NAS' });
    await app.post({ action: 'network', label: 'Home' });
    await app.post({ action: 'net', name: 'NAS', address: '192.168.8.20', port: 22, user: 'admin', signIn: 'key' });
    await app.post({ action: 'permissions', name: 'NAS', level: 'adjust', asks: 'ask-auto', dryRun: false, ranges: '' });
    await app.call('bench_network', { action: 'key' });
    await app.call('bench_network', { action: 'trust', name: 'NAS' });
    const change = (service, said, extra = {}) => app.call('bench_server', { name: 'NAS', action: 'service', service, change: 'stop', ...extra }, { said });
    assert.match(await change('wuauserv', 'stop the updates'), /only when you name it in your own message/);
    assert.match(await change('wuauserv', 'please stop wuauserv'), /wuauserv is now Stopped[\s\S]*A restore point was made first[\s\S]*undo list/);
    assert.match(app.state.asked.at(-1), /stop wuauserv/, 'asked as the card says');
    assert.match(await change('BITS', 'stop BITS too'), /BITS is now Stopped/);
    assert.match(await change('sshd', 'stop sshd'), /never stops or changes it/);
    assert.match(await change('WlanSvc', 'stop WlanSvc'), /never stops or changes it/);
    assert.match(await app.call('bench_undo', { name: 'NAS', which: 'last' }), /service BITS: Stopped, starts Manual → Running, starts Manual\. Each was read back/);
    assert.equal(app.state.server.services.get('BITS').status, 'Running');
  } finally {
    app.close();
  }
});

test('review of Mission stage E: an Allow in the Mission\'s card covers only the key the owner was shown; a helper that meets another key is asked again', async () => {
  // Mission's matching, as in its runner: an Allow is used once, by a request with the same key.
  const allowed = new Set();
  const asked = [];
  const mission = { askYes: async ({ key, reason }) => {
    if (allowed.has(key)) { allowed.delete(key); return { granted: true, id: 'a' }; }
    asked.push({ key, reason });
    return { id: `a${asked.length}`, text: 'This needs the user\'s yes (Devices asks). It waits in the Mission\'s card.' };
  } };
  const app = world({ mission });
  try {
    await settle();
    assert.equal((await app.post({ action: 'network', label: 'Home' })).status, 200);
    await app.call('bench_card', { name: 'Slate 7' });
    assert.equal((await app.post({ action: 'net', name: 'Slate 7', address: '192.168.8.1', port: 22, user: 'root' })).status, 200);
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }, { helper: true }), /waits in the Mission's card/);
    assert.match(asked[0].reason, /SHA256:A{43}/);
    // The owner checks F1 and allows it; before the item is redone the address answers with another key.
    allowed.add(asked[0].key);
    app.state.hostKey = FP2;
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }, { helper: true }), /waits in the Mission's card/, 'not trusted with a key the owner never saw');
    assert.equal(asked.length, 2);
    assert.notEqual(asked[1].key, asked[0].key);
    assert.match(asked[1].reason, /SHA256:B{43}/);
    assert.equal(existsSync(join(app.home, 'bench', 'network', 'known_hosts')) && /bench-slate-7/.test(readFileSync(join(app.home, 'bench', 'network', 'known_hosts'), 'utf8')), false, 'nothing trusted');
    // The key the owner allowed: that exact request goes on, once.
    app.state.hostKey = FP;
    assert.match(await app.call('bench_network', { action: 'trust', name: 'Slate 7' }, { helper: true }), /is trusted: key SHA256:A{43}/);
  } finally {
    app.close();
  }
});
