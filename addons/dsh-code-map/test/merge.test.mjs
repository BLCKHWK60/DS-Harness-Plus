// The "Code tools" page: Code map is its main tab, and a tab appears for each partner part (Code power) that is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
};
function setup(window) {
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const plugin = loaded.factory((name) => (name === 'react' ? React : {}));
  const pages = new Map();
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_n, fn) => fn(), register: (entry, render) => { pages.set(entry.id, { entry, render }); return () => pages.delete(entry.id); } },
  };
  plugin.apply(ctx);
  return pages;
}
const tabsOf = (node) => (!node || typeof node !== 'object' ? [] : [...(node.props?.role === 'tab' ? [node] : []), ...(node.children ?? []).flat().flatMap(tabsOf)]);
const expand = (el) => el.type(el.props);

test('the page is called Code tools, keeps its id, and announces itself to partners', () => {
  const window = {};
  const pages = setup(window);
  assert.deepEqual([...pages.keys()], ['code-map']);
  assert.equal(pages.get('code-map').entry.label(), 'section.title');
  assert.equal(window.__dshMerge.hosts['code-map'], 1);
});

test('no partner: no tab row; a partner: Code map first, then the partner tab', () => {
  const window = {};
  const pages = setup(window);
  const page = () => expand(pages.get('code-map').render({}));
  assert.equal(tabsOf(page()).length, 0);
  window.__dshMerge.parts['code-map'] = { 'code-power': { label: () => 'Reviews', order: 200, render: () => 'PART' } };
  assert.deepEqual(tabsOf(page()).map((n) => n.children[0]), ['tab.map', 'Reviews']);
});

// ---- where the guides are offered (the per-tab switch in Settings → Code tools) ----------------------

function plugin() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  return loaded.factory((name) => (name === 'react' ? React : {}));
}

test('a person can switch the guides on in Chat and Cowork, and off again, without touching other skills', () => {
  const { SKILL_NAMES, offeredIn, withPlace } = plugin().skillPlaces;
  assert.equal(SKILL_NAMES.length, 8);
  // What a new install starts with: off in Chat and Cowork, a skill of the person's own also off in Chat.
  const start = { chat: [...SKILL_NAMES, 'my-own-skill'].sort(), cowork: [...SKILL_NAMES].sort() };
  assert.equal(offeredIn(start, 'chat'), false);
  assert.equal(offeredIn(start, 'code'), true);
  const on = withPlace(start, 'chat', true);
  assert.deepEqual(on.chat, ['my-own-skill'], 'only these eight come out of the list');
  assert.equal(offeredIn(on, 'chat'), true);
  const both = withPlace(on, 'cowork', true);
  assert.ok(!('cowork' in both), 'an empty list is removed');
  assert.equal(offeredIn(withPlace(both, 'cowork', false), 'cowork'), false, 'and they can be switched off again');
});

test('the page draws the three switches (Chat, Cowork, Code) from the Modes list', () => {
  assert.match(SOURCE, /const PLACES = \[\['chat', 'Chat'\], \['cowork', 'Cowork'\], \['code', 'Code'\]\]/);
  assert.match(SOURCE, /mutate\('modes', \[\{ op: 'set', path: \['skillsOff'\]/);
  assert.match(SOURCE, /h\(SkillPlaces, \{ appCtx: props\.appCtx \}\)/);
});

/** A stand-in for the app's settings service holding Modes' `skillsOff`, with revisions and a way to change it from outside. */
function fakeModes(table) {
  const state = { table, revision: 1, conflictOnce: false, writes: [] };
  const ctx = {
    remote: {
      settings: {
        describe: async () => ({ ok: true, value: { namespaces: [{ ns: 'modes', revision: state.revision, value: { skillsOff: JSON.stringify(state.table) } }] } }),
        mutate: async (_ns, ops, revision) => {
          if (state.conflictOnce) { state.conflictOnce = false; state.outside?.(); return { ok: false, error: { code: 'settings/conflict' } }; }
          if (revision !== state.revision) return { ok: false, error: { code: 'settings/conflict' } };
          state.table = JSON.parse(ops[0].value);
          state.revision += 1;
          state.writes.push(state.table);
          return { ok: true, value: { revision: state.revision, value: { skillsOff: ops[0].value } } };
        },
      },
    },
  };
  return { state, ctx };
}

test('each guide can be switched on in one tab without touching the other seven or other skills', () => {
  const { SKILL_NAMES, guideOffered, offeredIn, withPlace } = plugin().skillPlaces;
  const start = { chat: [...SKILL_NAMES, 'mine'].sort(), cowork: [...SKILL_NAMES].sort() };
  const next = withPlace(start, 'chat', true, ['pr-review']);
  assert.equal(guideOffered(next, 'chat', 'pr-review'), true);
  for (const name of SKILL_NAMES.filter((one) => one !== 'pr-review')) assert.equal(guideOffered(next, 'chat', name), false, `${name} stays off`);
  assert.ok(next.chat.includes('mine'));
  assert.equal(offeredIn(next, 'chat'), false, 'the all-switch stays off while seven are off');
  assert.equal(guideOffered(next, 'cowork', 'pr-review'), false, 'other tabs are not touched');
  // and one guide off again, from all on
  const off = withPlace({}, 'code', false, ['best-of-n']);
  assert.deepEqual(off, { code: ['best-of-n'] });
});

test('a change is made from what Modes holds right now, so a list changed meanwhile is not overwritten with an old copy', async () => {
  const { SKILL_NAMES, changeModes, withPlace } = plugin().skillPlaces;
  const { state, ctx } = fakeModes({ chat: [...SKILL_NAMES].sort() });
  // Modes (or another window) switches a skill off in Cowork after this page loaded its copy.
  state.table = { chat: [...SKILL_NAMES].sort(), cowork: ['my-own-skill'] };
  state.revision = 5;
  const saved = await changeModes(ctx, (table) => withPlace(table, 'code', false, ['hunk-review']));
  assert.deepEqual(saved.table.cowork, ['my-own-skill'], 'the newer list is kept');
  assert.deepEqual(saved.table.code, ['hunk-review']);
  assert.equal(state.writes.length, 1);
  // A conflict: the list changes between reading and saving; the change is worked out again from the fresh list.
  state.conflictOnce = true;
  state.outside = () => { state.table = { ...state.table, cowork: ['my-own-skill', 'another'] }; state.revision += 1; };
  const again = await changeModes(ctx, (table) => withPlace(table, 'chat', true, ['pr-review']));
  assert.deepEqual(again.table.cowork, ['my-own-skill', 'another'], 'the change made meanwhile survives the retry');
  assert.ok(!again.table.chat.includes('pr-review'));
});

test('Settings search can open each part of Code tools: the host and tab ids in the index match what the pages register', () => {
  const index = JSON.parse(readFileSync(new URL('../../dsh-settings-plus/settings-index.json', import.meta.url), 'utf8'));
  const entries = (Array.isArray(index) ? index : index.entries).filter((entry) => entry.host === 'code-map');
  assert.ok(entries.length > 5, 'Code power settings are in the index under Code tools');
  const window = {};
  setup(window);
  assert.equal(window.__dshMerge.hosts[entries[0].host], 1, 'the page registers itself as the host the search names');
  // The Code power page registers its part under the tab id the search asks for (client file of the partner).
  const partner = readFileSync(new URL('../../dsh-code-power/client.js', import.meta.url), 'utf8');
  for (const tab of new Set(entries.map((entry) => entry.tab))) assert.ok(partner.includes(`dshMerge.part('${entries[0].host}', '${tab}'`), `part ${tab} of host ${entries[0].host}`);
  // And the page itself reads its open tab under that same id.
  assert.match(SOURCE, new RegExp(`dshMerge\\.useTab\\(React, '${entries[0].host}'\\)`));
});
