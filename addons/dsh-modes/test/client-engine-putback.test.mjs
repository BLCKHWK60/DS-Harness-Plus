/**
 * Item 4A, stage 6b, Part A, the chat box half (STAGE6B-DESIGN.md J3, J21): the refused message goes back into an empty
 * chat box with the app's `setDraft`; a busy box (or no `setDraft`) gets a Put back button that asks before replacing.
 * And (J21) with spaces live, the Mode label's fallback is the space's start mode or Plain chat, never `defaultMode`.
 * The client's own functions are cut out of client.js and run with a small hook runner (no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cut = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} is in client.js`);
  let depth = 0;
  for (let i = source.indexOf('{', source.indexOf(')', start)); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(name);
};
const line = (name) => {
  const found = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(found, `const ${name} is in client.js`);
  return found[0];
};

/** A tiny hook runner: state, refs, callbacks and effects (run after each render, by their dependencies). */
function runner() {
  const slots = [];
  const effects = [];
  let index = 0;
  let dirty = false;
  const hooks = {
    useState(init) {
      const at = index++;
      if (!(at in slots)) slots[at] = { value: typeof init === 'function' ? init() : init };
      const slot = slots[at];
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; }];
    },
    useRef(init) {
      const at = index++;
      if (!(at in slots)) slots[at] = { current: init };
      return slots[at];
    },
    useCallback(fn) {
      index++;
      return fn;
    },
    useEffect(fn, deps) {
      const at = index++;
      const before = slots[at];
      const changed = !before || !deps || deps.length !== before.deps.length || deps.some((dep, i) => !Object.is(dep, before.deps[i]));
      if (!changed) return;
      slots[at] = { deps: deps ?? [], cleanup: before?.cleanup };
      effects.push(() => {
        if (typeof slots[at].cleanup === 'function') slots[at].cleanup();
        slots[at].cleanup = fn();
      });
    },
  };
  return {
    hooks,
    render(fn) {
      let result;
      for (let round = 0; round < 6; round += 1) {
        index = 0;
        dirty = false;
        result = fn();
        const now = effects.splice(0);
        for (const effect of now) effect();
        if (!dirty) break;
      }
      return result;
    },
  };
}

function world({ draft = '', setDraft = true, input = true, confirm = true } = {}) {
  const calls = { setDraft: [], posts: [], confirms: [], copied: [] };
  const box = { draft, phase: 'plain' };
  const run = runner();
  const fetchStub = async (url, init) => {
    calls.posts.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 204 };
  };
  const document = { baseURI: 'http://localhost/app/' };
  // The question goes through dshKit.ask (the desktop app shows no native window.confirm).
  const dshKit = { ask: async (options) => { calls.confirms.push(options.title); calls.asks = [...(calls.asks ?? []), options]; return confirm; } };
  const navigator = { clipboard: { writeText: async (text) => { calls.copied.push(text); } } };
  const make = new Function('useState', 'useEffect', 'useRef', 'useCallback', 'fetch', 'document', 'dshKit', 'navigator', 'URL', `
    ${line('ENGINE_HELD_TAKEN_ROUTE')}
    ${line('noInput')}
    ${cut('useEnginePutBack')}
    return useEnginePutBack;
  `);
  const useEnginePutBack = make(run.hooks.useState, run.hooks.useEffect, run.hooks.useRef, run.hooks.useCallback, fetchStub, document, dshKit, navigator, URL);
  const inputActions = setDraft ? { setDraft: (text) => { calls.setDraft.push(text); box.draft = text; } } : {};
  const useInput = input ? (select) => select(box) : undefined;
  const appCtx = { locale: { bind: () => (key) => ({ 'eh.replace': 'Replace what is in the chat box with your earlier message?', 'eh.replace.ok': 'Replace', 'mt.cancel': 'Cancel' }[key] ?? key) } };
  let pokes = 0;
  const render = (view) => run.render(() => useEnginePutBack({ appCtx, sessionId: 'gd', view, inputActions, useInput, poke: () => { pokes += 1; } }));
  return { calls, box, render, pokes: () => pokes };
}
const HELD = { engineHeldDraft: { id: 'h-1', text: 'rename zebra.txt' }, engineHeldKept: 'kept line', engineHeld: 'back line' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('putback-empty-box: the text goes back at once with setDraft, Modes is told, it is not offered again', async () => {
  const w = world({ draft: '  ' });
  const first = w.render(HELD);
  assert.deepEqual(w.calls.setDraft, ['rename zebra.txt']);
  assert.equal(first.held, null, 'taken: the line shows view.engineHeld from now on');
  await flush();
  assert.deepEqual(w.calls.posts, [{ url: 'http://localhost/app/dsh-modes/engine-held-taken', body: { sessionId: 'gd', id: 'h-1' } }]);
  assert.ok(w.pokes() >= 1, 'the Mode list is read again');
  // The view still carries it until it is read again: not put back twice.
  w.box.draft = '';
  w.render(HELD);
  assert.equal(w.calls.setDraft.length, 1);
  assert.deepEqual(w.calls.confirms, []);
});

test('putback-button-when-box-busy: a box with text gets Put back, which asks before replacing', async () => {
  const declined = world({ draft: 'I was typing this', confirm: false });
  const shown = declined.render(HELD);
  assert.equal(declined.calls.setDraft.length, 0, 'never overwritten by itself');
  assert.equal(shown.held.id, 'h-1');
  await shown.putBack();
  assert.deepEqual(declined.calls.confirms, ['Replace what is in the chat box with your earlier message?']);
  assert.equal(declined.calls.asks[0].ok, 'Replace', 'the button says what it does');
  assert.equal(declined.calls.asks[0].cancel, 'Cancel');
  assert.equal(declined.calls.setDraft.length, 0, 'declined: the box keeps its text');
  assert.equal(declined.calls.posts.length, 0);
  const accepted = world({ draft: 'I was typing this', confirm: true });
  await accepted.render(HELD).putBack();
  assert.deepEqual(accepted.calls.setDraft, ['rename zebra.txt']);
  await flush();
  assert.equal(accepted.calls.posts.length, 1);
  assert.equal(accepted.render(HELD).held, null);
});

test('putback without the app\'s setDraft or input state: never automatic; Put back copies it and says where to paste', async () => {
  const noSet = world({ draft: '', setDraft: false });
  const shown = noSet.render(HELD);
  assert.equal(shown.held.id, 'h-1', 'the button shows');
  shown.putBack();
  await flush();
  await flush();
  assert.deepEqual(noSet.calls.copied, ['rename zebra.txt']);
  assert.equal(noSet.calls.posts.length, 1);
  assert.equal(noSet.render(HELD).copied, true);
  const noInput = world({ input: false });
  assert.equal(noInput.render(HELD).held.id, 'h-1', 'an unknown box is never overwritten by itself');
  assert.equal(noInput.calls.setDraft.length, 0);
});

test('putback: nothing offered, nothing done; a malformed offer is ignored', () => {
  const w = world({ draft: '' });
  assert.equal(w.render({ engineHeld: 'back line' }).held, null);
  assert.equal(w.render({ engineHeldDraft: { id: 1, text: 'x' } }).held, null);
  assert.equal(w.render(null).held, null);
  assert.equal(w.calls.setDraft.length, 0);
});

test('putback in the chat box: the slot\'s input props reach it; Put back and its question, in English only', () => {
  assert.match(source, /function ToggleControl\(\{ appCtx, sessionId, inputActions, useInput \}\)/);
  assert.match(source, /useEnginePutBack\(\{ appCtx, sessionId, view: modeList\.view, inputActions, useInput, poke: modeList\.poke \}\)/);
  assert.match(source, /'data-engine-putback': ''/);
  assert.match(source, /'x-dsh-space': windowSpaceAttr\(\)/, 'the Mode list read says the window\'s space (L5)');
  // Review finding: Put back has its (i) (short label + (i)).
  // Lab fix (6b): its pop-up is drawn in the page body (`portal`, with ReactDOM given to the parts), so it stays inside
  // the window instead of being placed from the chat box's own box.
  assert.match(source, /h\(tgUi\(\)\.Info, \{ title: t\('eh\.putback'\), what: t\('eh\.putback\.what'\), when: t\('eh\.putback\.when'\), change: t\('eh\.putback\.change'\), lang: presetLang\(appCtx\), portal: true, side: 'above' \}\)/);
  assert.match(source, /const tgUi = \(\) => \(tgParts \?\?= dshUi\.makeParts\(React, ReactDOM\)\);/);
  for (const key of ['eh.putback', 'eh.putback.title', 'eh.putback.what', 'eh.putback.when', 'eh.putback.change', 'eh.replace', 'eh.replace.ok', 'eh.copied']) {
    assert.equal(source.split('\n').filter((row) => row.includes(`'${key}':`)).length, 1, `${key}: once, English only`);
  }
  assert.match(source, /'eh\.putback': 'Put back'/);
  assert.doesNotMatch(cut('useEnginePutBack'), /window\.confirm/, 'no native confirm: it does nothing in the desktop app');
});

test('client-mode-fallback: with spaces live the label falls back to the space\'s start mode or Plain chat, never defaultMode (J21)', () => {
  const describeModes = new Function(`
    ${source.slice(source.indexOf('const FALLBACK_MODES = ['), source.indexOf('];', source.indexOf('const FALLBACK_MODES = [')) + 2)}
    ${cut('readObject')}
    ${line('ADDED_MODES')}
    ${cut('describeModes')}
    return describeModes;
  `)();
  const view = { modes: { code: { label: 'Code' }, recon: { label: 'Recon' } }, extraModes: { research: { label: 'Research' } }, defaultMode: 'recon', sessionModes: { kept: 'code' } };
  assert.equal(describeModes(view, 'new', { live: true, start: 'research' }).current, 'research', 'the space\'s start mode');
  assert.equal(describeModes(view, 'new', { live: true }).current, 'plain', 'else Plain chat');
  assert.equal(describeModes(view, 'new', { live: true, start: 'gone-mode' }).current, 'plain', 'a start mode that is not there: Plain chat');
  assert.equal(describeModes(view, 'kept', { live: true, start: 'research' }).current, 'code', 'a recorded mode first');
  assert.equal(describeModes(view, 'new').current, 'recon', 'without spaces: as before (defaultMode)');
  assert.equal(describeModes(view, 'new', { live: false }).current, 'recon');
});

test('putback-accessible-name (stage 7, 6b lab): Put back is named by its visible text; the longer text is its description', () => {
  const at = source.indexOf("className: 'dsh-me-putback'");
  assert.ok(at > 0);
  const button = source.slice(at, source.indexOf('\n', at));
  assert.match(button, /'aria-label': t\('eh\.putback'\)/, 'the screen-reader name is "Put back"');
  assert.match(button, /'aria-description': t\('eh\.putback\.title'\)/, 'the longer text stays, as a description');
  assert.match(button, /\}, t\('eh\.putback'\)\),$/, 'the visible text is the same words');
});

test('engine-line-gone-on-send (stage 7, 6b lab): the refusal line goes at once when a message goes out; a newer refusal shows it again', () => {
  const w = world({ draft: 'hello' });
  const line = { engineHeld: 'Nothing was run: …', engineHeldAt: 1000 };
  assert.equal(w.render(line).lineHidden, false, 'shown after the refusal');
  w.box.phase = 'sending';
  assert.equal(w.render(line).lineHidden, true, 'hidden as soon as the message goes out (no wait for the next read)');
  w.box.phase = 'plain';
  assert.equal(w.render(line).lineHidden, true, 'still hidden while the same refusal is reported');
  assert.equal(w.render({ engineHeld: 'Nothing was run: …', engineHeldAt: 2000 }).lineHidden, false, 'a newer refusal (still an engine): shown again');
  assert.match(source, /modeList\.view\?\.engineHeld && !engineBack\.lineHidden \?/);
});
