/**
 * Role prompts in a stand-in app: what it adds to the prompt, its defaults, and how its page is offered
 * (as a tab of Model Tiers when that page exists, as its own page when it does not).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, Config } from '../index.js';

// ---- the host half -------------------------------------------------------------------------------

function standIn({ sections, tierOf = () => undefined, replaced = () => false, isolated = () => false }) {
  const handlers = {};
  const installed = [];
  const agent = (id) => ({
    id,
    ctx: {
      effect: (fn) => fn(),
      systemPrompt: { section: (spec) => { installed.push({ agent: id, ...spec }); return () => {}; } },
    },
  });
  const agents = [agent('a1')];
  const ctx = {
    effect: (fn) => fn(),
    on: (name, fn) => { handlers[name] = fn; },
    logger: { warn() {} },
    get: (name) => {
      if (name === 'agents') return { list: () => agents };
      if (name === 'modelTiers') return { resolveTier: tierOf, instructionsReplaced: replaced };
      if (name === 'modes') return { isolated };
      return undefined;
    },
  };
  apply(ctx, { sections });
  return { installed, handlers, agent };
}

test('nothing is added until sections are written', () => {
  const { installed } = standIn({ sections: {} });
  assert.deepEqual(installed, []);
  const defaults = Config({});
  const sections = typeof defaults.sections?.get === 'function' ? defaults.sections.get() : defaults.sections;
  assert.deepEqual({ ...sections }, {}, 'no section is configured by default');
});

test('each section becomes its own prompt section, in its own position, with the text kept literal', () => {
  const { installed } = standIn({
    sections: { Plans: { enabled: true, order: 65, appliesToTiers: [], text: ' Plan first. {{not_a_variable}} ' } },
  });
  assert.equal(installed.length, 1);
  assert.equal(installed[0].name, 'role-prompts:Plans');
  assert.equal(installed[0].order, 65);
  assert.equal(installed[0].interpolate, false);
  assert.equal(installed[0].text(), 'Plan first. {{not_a_variable}}');
});

test('a switched-off section, a section for other tiers, a stand-alone model version and a private conversation add nothing', () => {
  const sections = {
    Off: { enabled: false, order: 60, appliesToTiers: [], text: 'x' },
    OnlyDeep: { enabled: true, order: 61, appliesToTiers: ['opus'], text: 'deep' },
    Always: { enabled: true, order: 62, appliesToTiers: [], text: 'always' },
  };
  const byName = (installed, name) => installed.find((one) => one.name === `role-prompts:${name}`);
  let run = standIn({ sections, tierOf: () => ({ id: 'sonnet' }) });
  assert.equal(byName(run.installed, 'Off').text(), '');
  assert.equal(byName(run.installed, 'OnlyDeep').text(), '', 'another tier');
  assert.equal(byName(run.installed, 'Always').text(), 'always');
  run = standIn({ sections, tierOf: () => ({ id: 'opus' }) });
  assert.equal(byName(run.installed, 'OnlyDeep').text(), 'deep');
  run = standIn({ sections, tierOf: () => ({ id: 'opus' }), replaced: () => true });
  assert.equal(byName(run.installed, 'Always').text(), '', 'a model version that stands alone');
  run = standIn({ sections, isolated: () => true });
  assert.equal(byName(run.installed, 'Always').text(), '', 'an isolated conversation');
});

test('the sections field can be edited by the Settings page while the app runs', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /sections: z\.dict\(sectionSchema\)\.default\(\{\}\)\.volatile\(\)/);
});

// ---- the page ------------------------------------------------------------------------------------

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function loadClient(window) {
  let loaded;
  window.__ModuleLoader__ = { load: (module) => { loaded = module; } };
  new Function('window', CLIENT)(window); // eslint-disable-line no-new-func
  const React = {
    createElement: () => null,
    Fragment: 'fragment',
    useCallback: (fn) => fn,
    useEffect() {},
    useMemo: (fn) => fn(),
    useRef: () => ({}),
    useState: (value) => [value, () => {}],
  };
  return { loaded, plugin: loaded.factory((name) => (name === 'react' ? React : {})) };
}

function pageContext() {
  const pages = [];
  return {
    pages,
    ctx: {
      effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {}; },
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: {
        inject: (_name, fn) => fn(),
        register: (entry) => { pages.push(entry.id); return () => { pages.splice(pages.indexOf(entry.id), 1); }; },
      },
    },
  };
}

test('with no Model Tiers page it has its own page; when Model Tiers appears the page goes away and a tab is offered', () => {
  const window = {};
  const { loaded, plugin } = loadClient(window);
  assert.equal(loaded.id, '@local/dsh-role-prompts');
  const { ctx, pages } = pageContext();
  plugin.apply(ctx);
  assert.deepEqual(pages, ['role-prompts'], 'alone: its own page');
  const merge = window.__dshMerge;
  assert.ok(merge.parts['model-tiers']['role-prompts'], 'a tab is offered either way');
  assert.equal(merge.parts['model-tiers']['role-prompts'].order, 200);
  // Model Tiers announces itself.
  merge.hosts['model-tiers'] = 1;
  merge.subs.forEach((fn) => fn());
  assert.deepEqual(pages, [], 'hosted: no page of its own');
  delete merge.hosts['model-tiers'];
  merge.subs.forEach((fn) => fn());
  assert.deepEqual(pages, ['role-prompts'], 'Model Tiers switched off: the page comes back');
});
