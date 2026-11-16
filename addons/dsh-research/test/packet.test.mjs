/**
 * The research packet beside a saved report (step C2, the Research side), made by code from a run's own
 * findings; and its removal with a Scratch conversation's report, never through a link.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { listReports } from '../lib/mode.js';
import { dateKey, packetFiles, packetOf, writePacket } from '../lib/packet.js';
import { removeOwned } from '../lib/owned.js';

const RUN = {
  findings: [
    { n: 1, host: 'agency.example', claim: 'Sales rose 34% in 2023', quote: 'Sales rose by 34% in 2023.', date: '2023', status: 'fetched' },
    { n: 2, host: 'installer.example', claim: 'Demand | doubled in March 2024', quote: 'demand doubled', date: '', status: 'search result only' },
    { n: 1, host: 'agency.example', claim: 'The first heat pump subsidy began on 4 Jan 2021', quote: '', date: '', status: 'not fetched' },
  ],
  conflicts: ['The agency says 34%, the installer says 50%.'],
  gaps: ['The 2025 figure is not published yet.'],
  sources: [{ n: 1, url: 'https://agency.example/report', host: 'agency.example', status: 'fetched' }, { n: 2, url: 'https://installer.example/blog', host: 'installer.example', status: 'search result only' }],
  grades: { 1: 'Confirmed', 2: 'Single' },
};

test('the packet: claims with who, passage, source, grade and read; contradictions; a timeline by date; the leads', () => {
  const packet = packetOf(RUN);
  assert.deepEqual(packet.claims.map((claim) => [claim.id, claim.who, claim.source, claim.grade, claim.read]), [['R1', 'agency.example', 1, 'Confirmed', 'read'], ['R2', 'installer.example', 2, 'Single', 'seen only in search results'], ['R3', 'agency.example', 1, 'Confirmed', 'not read']]);
  assert.deepEqual(packet.timeline.map((row) => [row.when, row.claim]), [['2021-01-04', 'R3'], ['2023', 'R1'], ['2024-03', 'R2']]);
  assert.deepEqual(packet.contradictions, RUN.conflicts);
  assert.deepEqual(packet.leads, RUN.gaps);
  const files = packetFiles(packet, { question: 'How fast?', at: new Date(Date.UTC(2026, 10, 16)) });
  assert.match(files['claims.md'], /\| R2 \| Demand \\\| doubled in March 2024 \| installer\.example \| demand doubled \| \[2\] \| Single \|  \| seen only in search results \|/, 'a | in a claim cannot break the table');
  assert.match(files['timeline.md'], /\| 2021-01-04 \| R3: The first heat pump subsidy/);
  assert.match(files['leads.md'], /- The 2025 figure is not published yet\./);
  assert.equal(JSON.parse(files['packet.json']).claims.length, 3);
  assert.equal(dateKey('in March 2024'), '2024-03');
  assert.equal(dateKey('no date here'), '');
  assert.equal(packetOf({ findings: Array.from({ length: 900 }, (_, index) => ({ n: 1, claim: `c${index}` })) }).claims.length, 400, 'bounded');
});

test('saving a report writes its packet beside it; the report list is unchanged; a packet that cannot be written never costs the report', async () => {
  const home = mkdtempSync(join(tmpdir(), 'research-packet-'));
  const provided = {};
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { get: () => 'research' },
    agents: { get: (id) => ({ id }), list: () => [] },
  };
  const ctx = { get: (key) => services[key], on() {}, effect(fn) { fn(); }, provide(name, value) { provided[name] = value; }, inject() {}, logger: { warn() {}, info() {} } };
  try {
    apply(ctx, { enabled: true, focus: 'web', folder: '' });
    const file = provided.research.saveReport('s1', { question: 'How fast are heat pumps growing?', text: 'Body [1].', packet: RUN });
    assert.ok(existsSync(file));
    assert.deepEqual(readdirSync(`${file}.packet`).sort(), ['claims.md', 'contradictions.md', 'leads.md', 'packet.json', 'timeline.md']);
    assert.match(readFileSync(join(`${file}.packet`, 'claims.md'), 'utf8'), /From the Research report "How fast are heat pumps growing\?"/);
    const { createHash } = await import('node:crypto');
    assert.equal(JSON.parse(readFileSync(join(`${file}.packet`, 'packet.json'), 'utf8')).reportSha256, createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex'), 'the packet names its very report');
    assert.deepEqual(listReports(join(home, 'research', 'reports')).map((report) => report.name), [file.split('/').pop()], 'the packet folder is not listed as a report');
    // A packet in the way (a file of that name): the report is still saved.
    const again = provided.research.saveReport('s1', { question: 'Second', text: 'Body.', packet: RUN });
    assert.ok(existsSync(again));
    const third = provided.research.saveReport('s1', { question: 'Third', text: 'Body.' });
    assert.equal(existsSync(`${third}.packet`), false, 'a run without a packet writes none (as before)');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a Scratch report goes with its packet; a packet that is a link is removed as a link, never followed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'research-owned-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'research-elsewhere-'));
  try {
    const report = join(folder, 'a.md');
    writeFileSync(report, 'x');
    writePacket(report, RUN, { question: 'q' });
    assert.equal(removeOwned([report], folder, ['.packet']), 1);
    assert.equal(existsSync(`${report}.packet`), false);
    const second = join(folder, 'b.md');
    writeFileSync(second, 'x');
    writeFileSync(join(elsewhere, 'keep.txt'), 'keep');
    symlinkSync(elsewhere, `${second}.packet`);
    removeOwned([second], folder, ['.packet']);
    assert.equal(existsSync(join(elsewhere, 'keep.txt')), true, 'what a link points at is untouched');
    writeFileSync(join(folder, 'c.md'), 'report c');
    assert.throws(() => writePacket(join(folder, 'c.md'), RUN) && writePacket(join(folder, 'c.md'), RUN), /EEXIST/, 'never written over');
  } finally {
    rmSync(folder, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});
