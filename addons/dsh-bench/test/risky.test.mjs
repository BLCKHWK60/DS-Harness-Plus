/**
 * The owner's "Allow risky writes" switch on the setting rules: what it lifts and what it never lifts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { settingRefusal } from '../lib/android.js';
import { routerSettingRule } from '../lib/router.js';
import { serviceRefusal } from '../lib/windows.js';
import { METHOD, TOOLS, BENCH_TOOLS } from '../lib/mode.js';
import { PLUS_TOOL_NAMES } from '../lib/plus/index.js';

test('router: off, only the short list; on, any setting but radio limits and keys', () => {
  assert.match(routerSettingRule('network.lan.ipaddr', '192.168.9.1').why, /lock you out/);
  const free = routerSettingRule('network.lan.ipaddr', '192.168.9.1', { risky: true });
  assert.equal(free.why, '');
  assert.deepEqual({ package: free.rule.package, reload: free.rule.reload }, { package: 'network', reload: 'reload_config' });
  assert.match(routerSettingRule('wireless.radio0.txpower', '30', { risky: true }).why, /radio limit/);
  assert.match(routerSettingRule('wireless.radio0.country', 'US', { risky: true }).why, /radio limit/);
  assert.match(routerSettingRule('wireless.default_radio0.key', 'secret', { risky: true }).why, /never goes through a model/);
  assert.match(routerSettingRule('system.@system[0].hostname', 'bad name!', { risky: true }).why, /not a value/, 'a listed setting keeps its own values');
  assert.match(routerSettingRule('system.ntp.server', 'line\nbreak', { risky: true }).why, /one line/);
});

test('Android: off, only the short list; on, any plain value, but never a radio limit', () => {
  assert.match(settingRefusal({ namespace: 'global', key: 'wifi_sleep_policy', value: '2', change: true }), /protections/);
  assert.equal(settingRefusal({ namespace: 'global', key: 'wifi_sleep_policy', value: '2', change: true, risky: true }), '');
  assert.match(settingRefusal({ namespace: 'global', key: 'stay_on_while_plugged_in', value: '3; reboot', change: true, risky: true }), /not a plain value/);
  assert.match(settingRefusal({ namespace: 'secure', key: 'android_id', change: false, risky: true }), /identifier/, 'reading identifiers stays closed');
});

test('Windows: off, only a service the user names and never the ones Windows needs; on, any service', () => {
  assert.match(serviceRefusal('sshd', 'stop sshd'), /never stops/);
  assert.match(serviceRefusal('Spooler', 'please'), /name it in your own message/);
  assert.equal(serviceRefusal('sshd', '', { risky: true }), '');
  assert.match(serviceRefusal('bad name', '', { risky: true }), /as Windows writes it/);
});

test('the tab: all 44 Bench tools and the shared ones, 60 in all, and instructions under 4,000 characters', () => {
  assert.equal(BENCH_TOOLS.length, 44);
  assert.equal(new Set(TOOLS).size, 60);
  for (const name of PLUS_TOOL_NAMES) assert.ok(BENCH_TOOLS.includes(name), name);
  assert.ok(METHOD.length < 4000, String(METHOD.length));
  assert.match(METHOD, /Allow risky writes/);
});
