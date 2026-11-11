/**
 * The example task packs. Every answer a pack expects is worked out again here,
 * so a pack can never ship a task that a correct answer would fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AI_ISMS, PACKS, packList } from '../lib/packs.js';
import { normalizeTask } from '../lib/store.js';
import { normalizeCheck, phrasesOf, rangeOf, runCheck, verdictOf } from '../lib/verify.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const day = (iso) => DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const plus = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const perms = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest])));
const sum = (list) => list.reduce((total, x) => total + x, 0);

/** Run the JavaScript shown in a coding task and return what it prints. */
async function printed(prompt) {
  const code = prompt.split('\n\n').slice(1, -1).join('\n\n');
  const logs = [];
  new Function('console', code)({ log: (...args) => logs.push(args.join(' ')) });
  await new Promise((done) => setTimeout(done, 20));
  return logs;
}

const LOG = ['10:01 INFO start', '10:02 WARN disk 81%', '10:03 ERROR db timeout 1200ms', '10:04 INFO retry', '10:05 ERROR db timeout 3400ms', '10:06 INFO ok', '10:09 WARN disk 86%', '10:11 ERROR cache miss storm', '10:12 ERROR db timeout 900ms', '10:15 INFO ok', '10:17 WARN disk 91%', '10:20 ERROR db timeout 2100ms'];
const level = (name) => LOG.filter((line) => line.includes(` ${name} `)).length;

/** The right answer to every task that has one, worked out here. */
async function answers() {
  const out = {};

  // ---- reasoning
  out['reasoning-01'] = String([...'strawberry raspberry cranberry blackberry boysenberry'].filter((c) => c === 'r').length);
  out['reasoning-02'] = String(48637 * 9284);
  out['reasoning-03'] = String(7n ** 222n % 13n);
  out['reasoning-04'] = `${plus('2023-03-15', 1000)} ${day(plus('2023-03-15', 1000))}`;
  out['reasoning-05'] = String([...(0x3f7a).toString(2)].filter((c) => c === '1').length);
  out['reasoning-06'] = String([482, 97, 1203, 356, 871, 64, 990, 415, 728, 1337, 256, 603, 149, 842, 511].sort((a, b) => b - a)[6]);
  out['reasoning-07'] = String(sum([...(2n ** 100n).toString()].map(Number)));
  out['reasoning-08'] = String(Array.from({ length: 1000 }, (_, i) => i + 1).filter((n) => (n % 3 === 0 || n % 5 === 0) && n % 15 !== 0).length);
  {
    const stack = [];
    for (const step of 'push 5, push 8, add, push 3, mul, dup, push 4, sub, swap, pop, push 7, add'.split(', ')) {
      const [name, arg] = step.split(' ');
      if (name === 'push') stack.push(Number(arg));
      else if (name === 'add') stack.push(stack.pop() + stack.pop());
      else if (name === 'mul') stack.push(stack.pop() * stack.pop());
      else if (name === 'sub') { const b = stack.pop(); const a = stack.pop(); stack.push(a - b); }
      else if (name === 'dup') stack.push(stack.at(-1));
      else if (name === 'swap') { const b = stack.pop(); const a = stack.pop(); stack.push(b, a); }
      else stack.pop();
    }
    out['reasoning-09'] = stack.join(' ');
  }
  {
    const fits = perms(['Ana', 'Ben', 'Cy', 'Dee', 'Eli']).filter((row) => {
      const at = (name) => row.indexOf(name);
      return at('Dee') === 0 && Math.abs(at('Cy') - at('Dee')) === 1 && at('Ana') < at('Ben') && at('Ben') !== at('Ana') + 1 && at('Eli') !== 0 && at('Eli') !== 4 && at('Eli') > at('Ana');
    });
    assert.equal(fits.length, 1, 'the row puzzle has one answer');
    out['reasoning-10'] = fits[0].join(', ');
  }
  {
    // Minutes after 08:30, when B leaves; A is already 36 km along.
    const minutes = ((372 - 72 * 0.5) / (72 + 96)) * 60;
    assert.equal(minutes, 120);
    out['reasoning-11'] = `10:30, ${72 * 0.5 + 72 * (minutes / 60)} km`;
  }
  {
    let n = 1994 + 446;
    let roman = '';
    for (const [value, mark] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= value) { roman += mark; n -= value; }
    out['reasoning-12'] = roman;
  }
  out['reasoning-13'] = (50 - Math.round((3 * 4.75 + 2 * 1.6 + 23.9 * 0.85) * 1.08 * 100) / 100).toFixed(2);
  out['reasoning-14'] = String(sum([...'KNOWLEDGE'].map((c) => c.charCodeAt(0) - 64)));
  out['reasoning-15'] = String(Math.abs(30 * 3 + 0.5 * 40 - 6 * 40));
  {
    const fits = [];
    for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) if ((!b) === a && (a !== c) === b && a === c) fits.push([a, b, c]);
    assert.equal(fits.length, 1, 'the knights puzzle has one answer');
    const [a, b, c] = fits[0].map((knight) => (knight ? 'knight' : 'knave'));
    out['reasoning-16'] = `A=${a}, B=${b}, C=${c}`;
  }

  // ---- coding: the JavaScript is run; the Python and the rest were run once and are fixed here.
  const coding = PACKS.find((item) => item.id === 'coding').tasks;
  for (const index of [1, 2, 3, 6, 7, 10]) out[coding[index - 1].id] = (await printed(coding[index - 1].prompt)).join('\n');
  out['coding-12'] = (await printed(coding[11].prompt)).join(' ');
  out['coding-04'] = '[2, 4, 6]';
  out['coding-05'] = '-4 2 -4 -3';
  out['coding-08'] = 'tmomfs emen fipo';
  out['coding-09'] = ['ab12', 'a1b2', 'abc123', '12ab', 'ab1', 'xab99'].filter((text) => /^[a-z]{2,3}\d{2,}$/.test(text)).join(',');
  out['coding-11'] = '30 0 []';
  out['coding-13'] = '15 5';
  {
    const rows = [['ann', 120, 'paid'], ['bob', 80, 'paid'], ['ann', 45, 'refunded'], ['cat', 200, 'paid'], ['bob', 60, 'pending'], ['ann', 300, 'paid'], ['cat', 20, 'paid'], ['dan', 500, 'refunded']];
    const totals = {};
    for (const [who, amount, status] of rows) if (status === 'paid') totals[who] = (totals[who] ?? 0) + amount;
    out['coding-14'] = Object.entries(totals).filter(([, total]) => total > 100).sort((a, b) => b[1] - a[1]).map(([who, total]) => `${who}:${total}`).join(' ');
  }
  {
    const list = Array.from({ length: 34 }, (_, i) => 1 + 3 * i);
    const seen = [];
    for (let lo = 0, hi = 33; lo <= hi;) {
      const mid = Math.floor((lo + hi) / 2);
      seen.push(list[mid]);
      if (list[mid] === 37) break;
      if (list[mid] < 37) lo = mid + 1;
      else hi = mid - 1;
    }
    out['coding-15'] = seen.join(',');
  }
  out['coding-16'] = `${(1234567.891).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}|${(255).toString(2).padStart(8, '0')}|${-(3 ** 2)}`;

  // ---- structured
  const items = 3 * 4.5 + 2 * 12 + 89.99;
  const discount = Math.round(items * 10) / 100;
  out['structured-01'] = JSON.stringify({ items_total: Number(items.toFixed(2)), discount, total: Number((items - discount + 7.5).toFixed(2)) });
  assert.equal(day('2026-03-03'), 'Tuesday');
  out['structured-02'] = JSON.stringify({ original: '2026-03-03', new: plus('2026-03-03', 2), weekday_original: day('2026-03-03') });
  out['structured-03'] = JSON.stringify([{ name: 'Maria Lopez', email: 'Maria.Lopez@Example.COM'.toLowerCase(), phone: `+1${'(415) 555-0132'.replace(/\D/g, '')}` }, { name: 'Tom Ashby', email: 't.ashby@northwind.co.uk', phone: `+44${'020 7946 0958'.replace(/\D/g, '').slice(1)}` }]);
  out['structured-04'] = JSON.stringify({ INFO: level('INFO'), WARN: level('WARN'), ERROR: level('ERROR') });
  out['structured-05'] = JSON.stringify({ top3: Object.entries({ Ivo: 71.5, Mara: 88, Quinn: 79.25, Sol: 88.5, Tess: 64, Uma: 79.5, Vik: 87.75 }).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name) });
  out['structured-06'] = JSON.stringify({ weight_g: Math.round(35 * 28.349523125), volume_cm3: Math.round(10 * 4 * 2.5 * 2.54 ** 3) });
  assert.equal(day('2026-06-08'), 'Monday');
  out['structured-07'] = JSON.stringify([{ owner: 'Priya', task: 'Send the budget', due: plus('2026-06-08', 4) }, { owner: 'Tom', task: 'Draft the contract', due: plus('2026-06-08', 14) }, { owner: 'Lena', task: 'Book the venue', due: plus('2026-06-08', 1) }]);
  out['structured-08'] = JSON.stringify({ street: '221B Baker Street', city: 'London', postcode: 'NW1 6XE', country_code: 'GB' });
  out['structured-09'] = JSON.stringify({ total_usd: Number((1234.5 * 1.1 + 2300.75 + 980 * 1.25).toFixed(2)) });
  {
    const rank = (version) => {
      const [core, pre] = version.split('-');
      return [...core.split('.').map(Number), pre ? 0 : 1, pre ?? ''];
    };
    const order = ['1.9.12', '1.10.0-rc.1', '1.10.0', '1.9.9', '1.10.0-beta.3', '1.2.30'].sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      for (let i = 0; i < 4; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return x[4].localeCompare(y[4]);
    });
    out['structured-10'] = JSON.stringify({ latest: order.at(-1), latest_prerelease: order.filter((version) => version.includes('-')).at(-1), ascending: order });
  }
  out['structured-11'] = JSON.stringify({ unique_count: new Set(['Ana Silva', ' ana silva', 'ANA  SILVA', 'Bo Chen', 'bo chen ', 'Chloé Dubois', 'Chloe Dubois', "Dee O'Neil", "dee o'neil"].map((name) => name.trim().toLowerCase().replace(/\s+/g, ' '))).size });
  {
    const minutes = 105 + 150 + 55 + 185 + 40;
    out['structured-12'] = JSON.stringify({ total_minutes: minutes, formatted: `${Math.floor(minutes / 60)}h ${minutes % 60}m` });
  }

  // ---- instructions
  out['instructions-01'] = `ALPHA\n${'independence'.length}\nOMEGA`;
  out['instructions-02'] = [2, 3, 5, 7, 11, 13].reverse().join(' | ');
  out['instructions-03'] = 'modern';
  out['instructions-04'] = 'Because air molecules bounce the short blue waves of sunlight around the sky far more than the long red ones. Have you noticed that the same effect turns the sunset red?';
  out['instructions-05'] = JSON.stringify({ squares: [1, 3, 5, 7, 9, 11, 13, 15].map((n) => n * n), count: 8 });
  out['instructions-06'] = [...'harness'].sort().join('').toUpperCase();
  out['instructions-07'] = 'Careful plans come first\nOld bugs return quietly\nDeadlines sharpen every choice\nEvery test earns trust';
  out['instructions-08'] = 'never trust a quiet server on friday afternoon'.split(' ').reverse().join(' ');
  out['instructions-09'] = `name,score\n${[['Kim', 71], ['Raj', 88], ['Zoe', 79]].sort((a, b) => b[1] - a[1]).map((row) => row.join(',')).join('\n')}`;
  out['instructions-10'] = String('Autonomous agents iterate over uncertain outcomes'.match(/[aeiou]/gi).length);
  out['instructions-11'] = 'Seven silent sailors slowly steered small ships south Sunday, smiling.';
  {
    const all = 'Large models still stumble when simple counting meets strict formatting rules'.split(' ');
    out['instructions-12'] = [all[2], all[5], all[8]].join('-');
  }

  // ---- knowledge, from the facts themselves
  const atomic = { gold: 79, silver: 47, copper: 29, einsteinium: 99 };
  out['knowledge-01'] = String(atomic.gold + atomic.silver + atomic.copper);
  out['knowledge-02'] = String(1969 - 1903);
  out['knowledge-03'] = String(1789 - 1492);
  {
    const states = 'Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada NewHampshire NewJersey NewMexico NewYork NorthCarolina NorthDakota Ohio Oklahoma Oregon Pennsylvania RhodeIsland SouthCarolina SouthDakota Tennessee Texas Utah Vermont Virginia Washington WestVirginia Wisconsin Wyoming';
    assert.equal(states.split(' ').length, 50);
    const missing = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((letter) => !states.toUpperCase().includes(letter));
    assert.deepEqual(missing, ['Q']);
    out['knowledge-04'] = missing[0];
  }
  out['knowledge-05'] = String(4 + 6 + 4);
  out['knowledge-06'] = String(23 * 8);
  out['knowledge-07'] = String(atomic.einsteinium);
  out['knowledge-08'] = String(12 * 20);
  out['knowledge-09'] = 'Black Sea';
  out['knowledge-10'] = 'Colombia';
  out['knowledge-11'] = 'W';
  out['knowledge-12'] = '299792458';
  out['knowledge-13'] = String(1453 + 500);
  out['knowledge-14'] = String(Math.round(22.99 + 35.45));
  return out;
}

/** The files a correct run of each tool task leaves behind, worked out here. */
function files() {
  const out = {};
  out['tools-01'] = { 'result.txt': String(sum(Array.from({ length: 500 }, (_, i) => (i + 1) ** 2))) };
  out['tools-02'] = { 'sevens.txt': String(Array.from({ length: 2500 }, (_, i) => i + 1).filter((n) => String(n).includes('7')).length) };
  out['tools-03'] = { 'hash.txt': createHash('sha256').update('deepseek-harness-plus').digest('hex').slice(0, 12) };
  out['tools-04'] = { 'encoded.txt': Buffer.from('Self-improvement loop: measure, review, test, approve.').toString('base64') };
  out['tools-05'] = { 'days.txt': String((Date.UTC(2031, 6, 4) - Date.UTC(1999, 11, 31)) / 86400000) };
  {
    const rows = [['widget', 12, 3.4], ['gadget', 7, 12.25], ['doohickey', 31, 0.8], ['gizmo', 4, 49.99], ['thingamajig', 18, 5.5], ['whatsit', 9, 7.75], ['contraption', 2, 120], ['doodad', 26, 1.15]];
    const top = [...rows].sort((a, b) => b[1] * b[2] - a[1] * a[2])[0][0];
    out['tools-06'] = { 'stock.csv': 'item,quantity,price', 'report.txt': `total=${sum(rows.map((row) => row[1] * row[2])).toFixed(2)}\ntop=${top}` };
  }
  out['tools-07'] = { 'sorted.txt': 'quartz, ember, willow, atlas, nimbus, cobalt, harbor, zephyr, lantern, meadow, orchid, granite'.split(', ').sort().join(',') };
  {
    const text = 'the quick brown fox jumps over the lazy dog while the other fox watches the dog and the fox yawns';
    const seen = {};
    for (const word of text.split(' ')) seen[word] = (seen[word] ?? 0) + 1;
    out['tools-08'] = { 'text.txt': text, 'top.txt': Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([word, n]) => `${word}=${n}`).join(' ') };
  }
  {
    const parts = { 'a.txt': 'one', 'b.txt': 'two two', 'c.txt': 'three three three' };
    out['tools-09'] = { ...parts, 'all.txt': Object.keys(parts).sort().reverse().map((name) => parts[name]).join(' / ') };
  }
  {
    const before = 'The colour scheme is fixed.\nPick a colour for links.\nFonts are not decided.\nBackground colour: white.';
    out['tools-10'] = { 'notes.md': before.replaceAll('colour', 'color'), 'count.txt': String(before.split('colour').length - 1) };
  }

  const readme = { 'README.md': 'Run it with node.' };
  {
    const primes = [];
    for (let n = 2; primes.length < 1000; n += 1) if (primes.every((p) => p * p > n || n % p !== 0)) primes.push(n);
    out['agentic-01'] = { ...readme, 'answer.txt': `prime1000=${primes[999]}\nsum100=${sum(primes.slice(0, 100))}` };
  }
  {
    const merged = [];
    for (const [start, end] of [[8, 12], [1, 3], [2, 6], [15, 18], [17, 20], [5, 7], [11, 13], [22, 25], [24, 24], [30, 31]].sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    out['agentic-02'] = { ...readme, 'merged.txt': merged.map((range) => range.join('-')).join(' ') };
  }
  {
    const cache = new Map();
    let misses = 0;
    for (const step of 'put a 1, put b 2, put c 3, get a, put d 4, get b, put e 5, get c, get a, put f 6, get d, put a 9'.split(', ')) {
      const [name, key, value] = step.split(' ');
      if (name === 'get') {
        if (!cache.has(key)) misses += 1;
        else { const kept = cache.get(key); cache.delete(key); cache.set(key, kept); }
      } else {
        cache.delete(key);
        cache.set(key, value);
        if (cache.size > 3) cache.delete(cache.keys().next().value);
      }
    }
    out['agentic-03'] = { ...readme, 'cache.txt': `keys=${[...cache.keys()].join(',')}\nmisses=${misses}` };
  }
  {
    let cells = new Set(['1,0', '2,0', '0,1', '1,1', '1,2']);
    for (let generation = 0; generation < 30; generation += 1) {
      const around = new Map();
      for (const cell of cells) {
        const [x, y] = cell.split(',').map(Number);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (dx || dy) around.set(`${x + dx},${y + dy}`, (around.get(`${x + dx},${y + dy}`) ?? 0) + 1);
      }
      const next = new Set();
      for (const [cell, n] of around) if (n === 3 || (n === 2 && cells.has(cell))) next.add(cell);
      cells = next;
    }
    out['agentic-04'] = { ...readme, 'alive.txt': String(cells.size) };
  }
  {
    const roads = {};
    for (const road of 'A-B 7, A-C 9, A-F 14, B-C 10, B-D 15, C-D 11, C-F 2, D-E 6, E-F 9, E-G 4, D-G 13, F-H 20, G-H 3'.split(', ')) {
      const [ends, length] = road.split(' ');
      const [a, b] = ends.split('-');
      (roads[a] ??= []).push([b, Number(length)]);
      (roads[b] ??= []).push([a, Number(length)]);
    }
    const far = { A: 0 };
    const from = {};
    const todo = new Set(Object.keys(roads));
    while (todo.size > 0) {
      const town = [...todo].filter((name) => far[name] !== undefined).sort((a, b) => far[a] - far[b])[0];
      todo.delete(town);
      for (const [next, length] of roads[town]) if (far[next] === undefined || far[town] + length < far[next]) { far[next] = far[town] + length; from[next] = town; }
    }
    const path = [];
    for (let town = 'H'; town; town = from[town]) path.unshift(town);
    out['agentic-05'] = { ...readme, 'route.txt': `distance=${far.H}\npath=${path.join('>')}` };
  }
  {
    const waits = LOG.filter((line) => line.includes('db timeout')).map((line) => Number(/(\d+)ms/.exec(line)[1]));
    out['agentic-06'] = { ...readme, 'app.log': LOG.join('\n'), 'summary.txt': `errors=${level('ERROR')}\nwarnings=${level('WARN')}\navg_timeout_ms=${sum(waits) / waits.length}` };
  }
  {
    const A = [[2, -1, 0], [1, 3, 4], [0, 5, -2]];
    const B = [[1, 2, 3], [0, -1, 4], [5, 0, 1]];
    const P = A.map((row) => B[0].map((_, j) => sum(row.map((x, k) => x * B[k][j]))));
    const det = P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1]) - P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0]) + P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0]);
    out['agentic-07'] = { ...readme, 'matrix.txt': `determinant=${det}\ntrace=${P[0][0] + P[1][1] + P[2][2]}` };
  }
  {
    const balance = { acc1: 0, acc2: 0, acc3: 0 };
    let rejected = 0;
    for (const step of ['deposit acc1 500', 'deposit acc2 300', 'transfer acc1 acc2 120', 'withdraw acc2 500', 'withdraw acc2 400', 'transfer acc2 acc3 50', 'deposit acc3 75', 'transfer acc3 acc1 200', 'transfer acc3 acc1 100', 'withdraw acc1 480']) {
      const [name, a, b, c] = step.split(' ');
      const amount = Number(name === 'transfer' ? c : b);
      if (name === 'deposit') balance[a] += amount;
      else if (balance[a] < amount) rejected += 1;
      else { balance[a] -= amount; if (name === 'transfer') balance[b] += amount; }
    }
    out['agentic-08'] = { ...readme, 'balances.txt': `acc1=${balance.acc1}\nacc2=${balance.acc2}\nacc3=${balance.acc3}\nrejected=${rejected}` };
  }
  {
    let best = { start: 0, length: 0 };
    for (let start = 1; start < 3000; start += 1) {
      let length = 1;
      for (let n = start; n !== 1; n = n % 2 ? 3 * n + 1 : n / 2) length += 1;
      if (length > best.length) best = { start, length };
    }
    out['agentic-09'] = { ...readme, 'collatz.txt': `start=${best.start}\nlength=${best.length}` };
  }
  {
    const text = 'aaabccccddddddeffffgggggggh';
    const encoded = text.replace(/(.)\1*/g, (run, c) => `${c}${run.length}`);
    const back = encoded.replace(/(\D)(\d+)/g, (_, c, n) => c.repeat(Number(n)));
    out['agentic-10'] = { ...readme, 'rle.txt': `encoded=${encoded}\nroundtrip=${back === text ? 'ok' : 'fail'}` };
  }
  return out;
}

test('every pack has 10 to 30 valid tasks, spread over the three groups, with ids of its own', () => {
  const ids = new Set();
  for (const item of PACKS) {
    assert.ok(item.tasks.length >= 10 && item.tasks.length <= 30, `${item.id} has ${item.tasks.length} tasks`);
    assert.deepEqual([...new Set(item.tasks.map((task) => task.split))].sort(), ['check', 'guard', 'learn'], item.id);
    for (const task of item.tasks) {
      assert.ok(!ids.has(task.id), `${task.id} is used twice`);
      ids.add(task.id);
      const stored = normalizeTask(task);
      assert.ok(stored, task.id);
      assert.equal(stored.family, item.id);
      assert.equal(stored.kind, item.kind);
      assert.equal(stored.checks.length, task.checks.length, `${task.id} keeps all of its checks`);
      assert.ok(stored.checks.length > 0, task.id);
    }
  }
  assert.ok(ids.size <= 500);
});

test('the right answer passes every answer task, and a wrong one fails', async () => {
  const right = await answers();
  for (const item of PACKS.filter((entry) => entry.kind === 'answer' && !entry.needsJudge)) {
    for (const task of item.tasks) {
      assert.ok(right[task.id] !== undefined, `${task.id} has no worked answer`);
      const verdict = verdictOf(task.checks, { answer: right[task.id] });
      assert.equal(verdict.status, 'PASS', `${task.id}: ${verdict.detail} (${right[task.id]})`);
      assert.equal(verdictOf(task.checks, { answer: 'I am not sure, but here is my reasoning.' }).status, 'FAIL', task.id);
    }
  }
});

test('the right files pass every tool task, and an empty folder fails', () => {
  const right = files();
  const root = mkdtempSync(join(tmpdir(), 'dsh-evolve-packs-'));
  try {
    for (const item of PACKS.filter((entry) => entry.kind === 'agent')) {
      for (const task of item.tasks) {
        assert.ok(right[task.id], `${task.id} has no worked files`);
        const folder = join(root, task.id);
        mkdirSync(folder, { recursive: true });
        assert.equal(verdictOf(task.checks, { answer: 'Done.', folder }).status, 'FAIL', task.id);
        for (const [name, text] of Object.entries(right[task.id])) {
          mkdirSync(dirname(join(folder, name)), { recursive: true });
          writeFileSync(join(folder, name), `${text}\n`);
        }
        const verdict = verdictOf(task.checks, { answer: 'Done.', folder });
        assert.equal(verdict.status, 'PASS', `${task.id}: ${verdict.detail}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writing tasks need a judge, a length, and text free of machine phrases', () => {
  const writing = PACKS.find((item) => item.id === 'writing');
  assert.equal(writing.needsJudge, true);
  for (const task of writing.tasks) {
    const types = task.checks.map((check) => check.type);
    assert.ok(types.includes('judge') && types.includes('noneOf'), task.id);
    assert.ok(types.includes('wordCount') || types.includes('lineCount'), task.id);
    // Without a judge model the task is never counted as passed.
    const mechanical = task.checks.filter((check) => check.type !== 'judge');
    assert.notEqual(verdictOf(task.checks, { answer: 'x' }).status, 'PASS', task.id);
    assert.equal(verdictOf(mechanical, { answer: "Certainly! Let's delve into the rich tapestry of this topic." }).status, 'FAIL', task.id);
  }
  assert.ok(phrasesOf(AI_ISMS).length >= 25);
});

test('the new checks: noneOf, wordCount and lineCount', () => {
  assert.deepEqual(rangeOf('12'), { min: 12, max: 12 });
  assert.deepEqual(rangeOf(' 150 - 220 '), { min: 150, max: 220 });
  assert.equal(rangeOf('220-150'), undefined);
  assert.equal(rangeOf('many'), undefined);
  assert.equal(normalizeCheck({ type: 'wordCount', value: 'many' }), undefined);
  assert.equal(normalizeCheck({ type: 'noneOf', value: ' | ' }), undefined);
  assert.deepEqual(normalizeCheck({ type: 'lineCount', value: '8-40' }), { type: 'lineCount', value: '8-40' });

  assert.equal(runCheck({ type: 'noneOf', value: 'delve | — | **' }, { answer: 'A plain sentence.' }).status, 'PASS');
  assert.equal(runCheck({ type: 'noneOf', value: 'delve | — | **' }, { answer: 'We DELVE in.' }).status, 'FAIL');
  assert.equal(runCheck({ type: 'noneOf', value: 'delve | — | **' }, { answer: 'A pause — then on.' }).status, 'FAIL');
  assert.equal(runCheck({ type: 'wordCount', value: '3-4' }, { answer: ' one two  three ' }).status, 'PASS');
  assert.equal(runCheck({ type: 'wordCount', value: '3-4' }, { answer: 'one two' }).status, 'FAIL');
  assert.equal(runCheck({ type: 'lineCount', value: '2' }, { answer: 'first\n\nsecond\n' }).status, 'PASS');
  assert.equal(runCheck({ type: 'lineCount', value: '2' }, { answer: 'first' }).status, 'FAIL');
});

test('the page list counts what is already added', () => {
  const none = packList([]);
  assert.equal(none.length, PACKS.length);
  assert.ok(none.every((item) => item.added === 0 && item.count >= 10 && item.name && item.description));
  const some = packList([{ id: 'coding-01' }, { id: 'coding-02' }, { id: 'my-own-task' }]);
  assert.equal(some.find((item) => item.id === 'coding').added, 2);
  assert.equal(some.find((item) => item.id === 'writing').needsJudge, true);
  assert.equal(some.find((item) => item.id === 'agentic').needsTools, true);
});
