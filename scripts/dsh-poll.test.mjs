// Tests for the shared polling helper (docs/shared/dsh-poll.js): one shared copy of Settings, loops that pause while the
// window is hidden, and the copies in the add-on pages. A fake clock and a fake window stand in for the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'docs/shared/dsh-poll.js'), 'utf8');

/** A page with a clock we move by hand and a document that can be hidden. */
function page() {
  let now = 1_000_000;
  let nextId = 0;
  const timers = new Map();
  const document = new EventTarget();
  document.hidden = false;
  const win = {
    document,
    setTimeout: (fn, ms) => { nextId += 1; timers.set(nextId, { fn, at: now + Math.max(0, ms) }); return nextId; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  const advance = async (ms) => {
    const end = now + ms;
    await flush();
    for (;;) {
      let pick = null;
      for (const [id, timer] of timers) if (timer.at <= end && (!pick || timer.at < pick.timer.at)) pick = { id, timer };
      if (!pick) break;
      timers.delete(pick.id);
      now = Math.max(now, pick.timer.at);
      pick.timer.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  const hide = (value) => { document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  const poll = new Function('window', 'Date', `${source}\nreturn dshPoll;`)(win, { now: () => now });
  return { poll, win, advance, hide, timers };
}

/** A fake add-on context: a settings service that counts its reads, and the change event. */
function context(namespaces = [{ ns: 'modes', revision: 1, value: { a: 1 } }]) {
  const handlers = [];
  const calls = { describe: 0, mutate: 0 };
  const ctx = {
    remote: {
      $on: (name, handler) => { handlers.push({ name, handler }); return () => {}; },
      settings: {
        describe: async () => { calls.describe += 1; return { ok: true, value: { namespaces: JSON.parse(JSON.stringify(namespaces)) } }; },
        mutate: async () => { calls.mutate += 1; return { ok: true }; },
      },
    },
    on: () => () => {},
  };
  const fire = (ns) => { for (const item of handlers) if (item.name === 'settings/document-updated') item.handler(ns); };
  return { ctx, calls, fire, set: (next) => { namespaces = next; } };
}

test('Settings are read once for any number of callers', async () => {
  const { poll } = page();
  const { ctx, calls } = context();
  await Promise.all([poll.settings(ctx), poll.settings(ctx), poll.settings(ctx)]);
  await poll.settings(ctx);
  assert.equal(calls.describe, 1);
  assert.equal(poll.stats().settingsHits, 3);
});

test('a second add-on with its own context shares the same copy', async () => {
  const { poll } = page();
  const a = context();
  const b = context();
  await poll.settings(a.ctx);
  const result = await poll.settings(b.ctx);
  assert.equal(b.calls.describe, 0);
  assert.equal(result.value.namespaces[0].ns, 'modes');
});

test('a Settings change event drops the copy at once, so a switch flipped shows on the next read', async () => {
  const { poll } = page();
  const { ctx, calls, fire, set } = context();
  assert.equal((await poll.entry(ctx, 'modes')).value.a, 1);
  set([{ ns: 'modes', revision: 2, value: { a: 2 } }]);
  fire('modes');
  assert.equal((await poll.entry(ctx, 'modes')).value.a, 2);
  assert.equal(calls.describe, 2);
});

test('the copy is renewed after 30 seconds even with no event', async () => {
  const { poll, advance } = page();
  const { ctx, calls } = context();
  await poll.settings(ctx);
  await advance(29000);
  await poll.settings(ctx);
  assert.equal(calls.describe, 1);
  await advance(2000);
  await poll.settings(ctx);
  assert.equal(calls.describe, 2);
});

test('without the change event the copy is trusted for two seconds only', async () => {
  const { poll, advance } = page();
  const { ctx, calls } = context();
  delete ctx.remote.$on;
  await poll.settings(ctx);
  await advance(1500);
  await poll.settings(ctx);
  assert.equal(calls.describe, 1);
  await advance(1000);
  await poll.settings(ctx);
  assert.equal(calls.describe, 2);
});

test("this page's own write drops the copy before the write's answer", async () => {
  const { poll } = page();
  const { ctx, calls } = context();
  await poll.settings(ctx);
  const written = ctx.remote.settings.mutate('modes', [], 1);
  // While the write is still going, a read must not hand out the old copy.
  await poll.settings(ctx);
  await written;
  assert.equal(calls.describe, 2);
  assert.equal(calls.mutate, 1);
  await poll.settings(ctx);
  assert.equal(calls.describe, 3, 'and again after the write answered');
});

test('fresh: true always asks the app, and a bad answer is not kept', async () => {
  const { poll } = page();
  const { ctx, calls } = context();
  await poll.settings(ctx);
  await poll.settings(ctx, { fresh: true });
  assert.equal(calls.describe, 2);
  ctx.remote.settings.describe = async () => { calls.describe += 1; return { ok: false, error: 'busy' }; };
  poll.invalidate();
  assert.equal((await poll.settings(ctx)).ok, false);
  await poll.settings(ctx);
  assert.equal(calls.describe, 4, 'a failed read is asked again');
});

test('a read that was on its way when Settings changed is not kept', async () => {
  const { poll } = page();
  const { ctx, calls, fire } = context();
  let release;
  ctx.remote.settings.describe = () => new Promise((resolve) => { release = () => resolve({ ok: true, value: { namespaces: [{ ns: 'x', value: {} }] } }); });
  const pending = poll.settings(ctx);
  fire('modes');
  release();
  await pending;
  ctx.remote.settings.describe = async () => { calls.describe += 1; return { ok: true, value: { namespaces: [{ ns: 'y', value: {} }] } }; };
  assert.equal((await poll.settings(ctx)).value.namespaces[0].ns, 'y');
});

test('change listeners are told, and can stop listening', async () => {
  const { poll } = page();
  const { ctx, fire } = context();
  const seen = [];
  const off = poll.onChange(ctx, (ns) => seen.push(ns));
  fire('modes');
  off();
  fire('tiers');
  assert.deepEqual(seen, ['modes']);
});

/**
 * A context like the app's: `ctx.remote` is a NEW wrapper object at every read (cordis's traceable proxy), over one
 * shared service whose change event reaches every listener with `(ns, revision)`.
 */
function appLikeContexts(count) {
  const handlers = [];
  const calls = { describe: 0, mutate: 0 };
  let revision = 1;
  const settings = {
    describe: async () => { calls.describe += 1; return { ok: true, value: { namespaces: [{ ns: 'modes', revision, value: {} }] } }; },
    mutate: async () => { calls.mutate += 1; return { ok: true }; },
  };
  const service = { $on: (name, handler) => { handlers.push({ name, handler }); return () => {}; }, settings };
  const fresh = () => new Proxy(service, {
    get: (target, prop) => (prop === Symbol.for('cordis.original') ? target : prop === 'settings' ? new Proxy(target.settings, { get: (inner, key) => (key === Symbol.for('cordis.original') ? inner : inner[key]) }) : target[prop]),
  });
  const contexts = Array.from({ length: count }, () => ({ get remote() { return fresh(); }, on: () => () => {} }));
  const fire = (ns) => { revision += 1; for (const item of [...handlers]) if (item.name === 'settings/document-updated') item.handler(ns, revision); };
  return { contexts, calls, fire, handlers, settings };
}

test('reading Settings many times adds no new listeners, even though the app hands out a new remote at every read', async () => {
  const { poll } = page();
  const { contexts, handlers, settings } = appLikeContexts(3);
  for (let i = 0; i < 50; i += 1) {
    poll.invalidate();
    for (const ctx of contexts) await poll.settings(ctx);
  }
  assert.equal(handlers.length, 3, 'one listener per add-on, not one per read');
  const write = settings.mutate;
  await poll.settings(contexts[0]);
  assert.equal(settings.mutate, write, 'the write is wrapped once, not again at every read');
});

test('one Settings change starts one read, not one per listener (the 21 November storm)', async () => {
  const { poll, advance } = page();
  // Kept small: with the old helper the reads doubled at every change (16 add-ons ran out of memory here).
  const { contexts, calls, fire } = appLikeContexts(4);
  // Like the Modes colours switch: a listener that reads Settings at once, in every add-on.
  for (const ctx of contexts) poll.onChange(ctx, () => { void poll.settings(ctx); });
  await poll.settings(contexts[0]);
  const before = calls.describe;
  for (let round = 0; round < 6; round += 1) {
    fire('modes');
    await advance(10);
  }
  assert.equal(calls.describe - before, 6, 'one read per change, and the count does not grow from change to change');
  assert.equal(poll.stats().changes, 6);
});

test('a loop looks now, then every `every`, one look at a time', async () => {
  const { poll, advance } = page();
  let runs = 0;
  let overlap = 0;
  let most = 0;
  const handle = poll.loop(async () => { runs += 1; overlap += 1; most = Math.max(most, overlap); await new Promise((r) => setImmediate(r)); overlap -= 1; }, { every: 1000 });
  await advance(0);
  assert.equal(runs, 1);
  await advance(3500);
  assert.equal(runs, 4);
  assert.equal(most, 1);
  handle.stop();
  await advance(5000);
  assert.equal(runs, 4);
});

test("'idle' waits longer and a number is the next wait", async () => {
  const { poll, advance } = page();
  const answers = ['idle', 300, 'go'];
  let runs = 0;
  poll.loop(() => { runs += 1; return answers[runs - 1]; }, { every: 1000, idle: 10000 });
  await advance(0);
  assert.equal(runs, 1);
  await advance(9000);
  assert.equal(runs, 1, 'idle: nothing for 10 s');
  await advance(1100);
  assert.equal(runs, 2);
  await advance(400);
  assert.equal(runs, 3, 'the number 300 was the wait');
  await advance(1000);
  assert.equal(runs, 4);
});

test('a hidden window means no looking at all, and a shown one looks at once', async () => {
  const { poll, advance, hide, timers } = page();
  let runs = 0;
  poll.loop(() => { runs += 1; }, { every: 1000 });
  await advance(2500);
  const before = runs;
  hide(true);
  assert.equal(timers.size, 0, 'no timer is left pending');
  await advance(60000);
  assert.equal(runs, before, 'not one look while hidden');
  hide(false);
  await advance(0);
  assert.equal(runs, before + 1, 'looks the moment the window is shown');
  await advance(1100);
  assert.equal(runs, before + 2);
});

test('a loop may keep a slow look while hidden when asked', async () => {
  const { poll, advance, hide } = page();
  let runs = 0;
  poll.loop(() => { runs += 1; }, { every: 500, hidden: 3000 });
  await advance(0);
  hide(true);
  const before = runs;
  await advance(10000);
  assert.ok(runs - before >= 3 && runs - before <= 4, `slow looks while hidden: ${runs - before}`);
});

test('poke looks now, once however often it is called', async () => {
  const { poll, advance } = page();
  let runs = 0;
  const handle = poll.loop(() => { runs += 1; return 'idle'; }, { every: 1000, idle: 60000 });
  await advance(0);
  handle.poke();
  handle.poke();
  handle.poke();
  await advance(10);
  assert.equal(runs, 2);
});

test('a failing look backs off instead of hammering, and recovers', async () => {
  const { poll, advance } = page();
  let runs = 0;
  let broken = true;
  poll.loop(() => { runs += 1; if (broken) throw new Error('down'); }, { every: 1000 });
  await advance(0);
  await advance(10000);
  assert.ok(runs <= 5, `backed off: ${runs} looks in 10 s`);
  broken = false;
  await advance(60000);
  const calm = runs;
  await advance(3500);
  assert.ok(runs >= calm + 3, 'steady again after it recovers');
});

test('a loop that is stopped while a look is running does not schedule another', async () => {
  const { poll, advance, timers } = page();
  let release;
  const handle = poll.loop(() => new Promise((resolve) => { release = resolve; }), { every: 1000 });
  await advance(0);
  handle.stop();
  release();
  await advance(0);
  assert.equal(timers.size, 0);
});

test('two copies of the block on one page share one state', () => {
  const { poll, win } = page();
  const second = new Function('window', 'Date', `${source}\nreturn dshPoll;`)(win, { now: () => 0 });
  assert.equal(second, poll);
});

test('an older copy that ran first is replaced, not reused; a later older copy reuses the newer one', async () => {
  const { win, advance } = page();
  // The old helper (api 1) of an older page file, with its own write wrapper marked the old way.
  const old = { api: 1, settings: () => { throw new Error('the old helper must not be used'); } };
  win.__dshPoll = old;
  const fresh = new Function('window', 'Date', `${source}\nreturn dshPoll;`)(win, { now: () => 0 });
  assert.notEqual(fresh, old, 'the newer block does not reuse the older shared object');
  assert.equal(win.__dshPoll, fresh, 'and puts itself on the page for later copies');
  assert.ok(fresh.api > 1);
  const again = new Function('window', 'Date', `${source}\nreturn dshPoll;`)(win, { now: () => 0 });
  assert.equal(again, fresh, 'a copy of the same version reuses it');
  // A Settings service already wrapped by the older helper is wrapped once more, so this page's writes still drop the new copy.
  const { ctx, calls } = context();
  const oldWrite = ctx.remote.settings.mutate;
  const marked = async (...args) => oldWrite(...args);
  marked.__dshPollWrite = true;
  ctx.remote.settings.mutate = marked;
  await fresh.settings(ctx);
  assert.equal(calls.describe, 1);
  await ctx.remote.settings.mutate('modes', []);
  await fresh.settings(ctx);
  await advance(0);
  assert.equal(calls.describe, 2, 'the write dropped the new copy');
});

/** A page file's text without the shared blocks (their code is the master's, checked below). */
const pageText = (name) => {
  const text = readFileSync(join(root, 'addons', name, 'client.js'), 'utf8');
  const from = text.indexOf('// ---- dsh-poll:begin ----');
  const to = text.indexOf('// ---- dsh-poll:end ----');
  return from < 0 ? text : text.slice(0, from) + text.slice(to);
};

test('the copies in the add-on pages match the master', () => {
  const begin = '// ---- dsh-poll:begin ----';
  const end = '// ---- dsh-poll:end ----';
  const master = source.trimEnd();
  let seen = 0;
  for (const name of readdirSync(join(root, 'addons'))) {
    const file = join(root, 'addons', name, 'client.js');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const from = text.indexOf(begin);
    if (from < 0) continue;
    seen += 1;
    const block = text.slice(from, text.indexOf(end, from) + end.length);
    const flat = (value) => value.split('\n').map((line) => line.trim()).join('\n');
    assert.equal(flat(block), flat(master), `${name} has a stale copy of the block (run: node scripts/sync-kit.mjs)`);
  }
  assert.ok(seen >= 10, `the block is in ${seen} pages`);
});

test('the pages that read Settings on a timer share the one copy of Settings', () => {
  // These three read Settings on the idle chat page (28 reads a minute before the shared copy, 3 after).
  for (const name of ['dsh-modes', 'dsh-cowork-shell', 'dsh-color-schemes']) {
    const text = pageText(name);
    assert.doesNotMatch(text, /\.remote\.settings\.describe\(/, `${name} reads Settings by itself`);
    assert.match(text, /dshPoll\.settings\(/, `${name} uses the shared copy`);
    assert.match(text, /dshPoll\.onChange\(/, `${name} listens for Settings changes`);
  }
});

test('a read that a save follows is never taken from the shared copy', () => {
  // `load(ctx, true)` / `describe(true)` / `fresh: true` sit before every mutate in these pages.
  for (const name of ['dsh-modes', 'dsh-cowork-shell', 'dsh-color-schemes']) {
    const lines = pageText(name).split('\n');
    lines.forEach((line, i) => {
      const read = line.match(/await (load|describe)\((appCtx|ctx)?(?:, )?(true)?\)/);
      if (!read || read[3]) return;
      const next = lines.slice(i, i + 3).join('\n');
      assert.doesNotMatch(next, /\.mutate\(/, `${name} line ${i + 1} reads from the copy and then saves: ${line.trim()}`);
    });
  }
});

test('the idle-page pollers stop while the window is hidden: no bare interval is left in them', () => {
  const expected = {
    'dsh-activity': 1, // the Settings page's own preview history
    'dsh-cowork-shell': 2, // a one-minute clock redraw, and a short start-up wait that ends itself
    'dsh-bench': 1, // the Devices page's own refresh
    'dsh-creator-plus': 1, // the Creator Plus page's own refresh
  };
  for (const name of ['dsh-activity', 'dsh-modes', 'dsh-cowork-shell', 'dsh-color-schemes', 'dsh-learn', 'dsh-bench', 'dsh-mission', 'dsh-research', 'dsh-creator-plus', 'dsh-finance', 'dsh-route-health', 'dsh-split-plus', 'dsh-library', 'dsh-evolve', 'dsh-code-map', 'dsh-automations']) {
    const intervals = (pageText(name).match(/\bsetInterval\(/g) ?? []).length;
    assert.ok(intervals <= (expected[name] ?? 0), `${name} has ${intervals} bare setInterval calls (allowed ${expected[name] ?? 0}); use dshPoll.loop so the look stops while hidden`);
  }
});
