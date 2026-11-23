/**
 * The first files of a new plugin (build prompt, part 5: tests first). The scaffold is a small plugin that
 * already loads, does nothing while switched off, and passes its own tests; the model then grows it by
 * the recipe. Files are made with wx: nothing that exists is replaced.
 */
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { safeCopy, safeWrite } from './safewrite.js';
import { oneLine } from './text.js';

const q = (text) => JSON.stringify(String(text ?? ''));
const sq = (text) => `'${String(text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;


/**
 * The scaffold's files.
 * @param {object} input - `folder` (dsh-…), `title`, `description`, `kind`, `tool` (a tool name for a tool plugin), `modeId` (for a mode), `method` (for a mode).
 * @returns {Record<string, string>} relative path → text.
 */
export function scaffoldFiles({ folder, title, description, kind, tool = '', modeId = '', method = '' }) {
  const short = folder.replace(/^dsh-/, '');
  const name = `@local/${folder}`;
  const desc = oneLine(description, 300) || oneLine(title, 80);
  const files = {};
  files['package.json'] = `${JSON.stringify({
    name, version: '0.1.0', private: true, type: 'module', description: `${desc} Off until you switch it on.`,
    exports: { '.': './index.js', './client': './client.js', './locale/*.json': './locale/*.json' },
    files: ['index.js', 'client.js', 'lib/*.js', 'cordis.patch.yml', 'README.md', 'locale/*.json', 'node_modules/@deepseek-ai/schemastery/**', 'node_modules/@deepseek-ai/cosmokit/**'],
    engines: { dsh: '>=0.2.2-rc.1 <0.3.0' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', immediately: true, inject: ['@deepseek-ai/dsh-api-remotes', '@deepseek-ai/dsh-client-locale'] } },
  }, null, 2)}\n`;
  files['cordis.patch.yml'] = `- insert:\n    - id: ${short}\n      name: '${name}'\n      config:\n        # Off until you switch it on in Settings > ${oneLine(title, 60).replace(/[:#]/g, ' ')}.\n        enabled: false\n`;
  files['locale/en.json'] = `${JSON.stringify({ meta: { title: oneLine(title, 60), description: desc } }, null, 2)}\n`;
  const toolBlock = kind === 'tool' && tool ? `
  // The tool: offered only while switched on. Its answer is one plain text.
  const output = { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }] };
  const work = standIns.work ?? (async (args) => \`Received: \${String(args.text ?? '').slice(0, 200)}\`);
  const definition = {
    name: ${sq(tool)},
    description: ${sq(`${desc} (Creator Plus scaffold: grow it by the recipe.)`)},
    parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 } }, additionalProperties: false },
    output,
    isConcurrencySafe: () => true,
    timeoutMs: 60_000,
    execute: async (args) => {
      if (!enabled()) return { text: 'This plugin is switched off in Settings.' };
      try {
        return { text: await work(args ?? {}) };
      } catch (error) {
        return { text: \`It did not work: \${String(error?.message ?? error).slice(0, 300)}\` };
      }
    },
  };
  let off;
  const sync = () => {
    const tools = ctx.get('tools');
    if (enabled() && !off && tools?.register) off = tools.register(definition, { when: () => enabled() });
    else if (!enabled() && off) {
      if (typeof off === 'function') off();
      off = undefined;
    }
  };
  sync();
  const timer = setInterval(sync, 3000);
  timer.unref?.();
  ctx.effect(() => () => {
    clearInterval(timer);
    if (typeof off === 'function') off();
  }, ${sq(`${short}: tool`)});
` : '';
  const modeBlock = kind === 'mode' ? `
  // The tab: added to the Modes add-on's extraModes while switched on, taken out when off.
  const sync = async () => {
    try {
      const settings = ctx.get('settings');
      const row = settings?.describe?.().find((entry) => entry.ns === 'modes');
      if (!row || row.value?.extraModes === undefined) return;
      let table = {};
      try {
        table = JSON.parse(String(row.value.extraModes || '{}'));
      } catch {
        table = {};
      }
      const has = Object.hasOwn(table, MODE_ID);
      const ops = [];
      if (enabled() && JSON.stringify(table[MODE_ID]) !== JSON.stringify(MODE)) ops.push({ op: 'set', path: ['extraModes'], value: JSON.stringify({ ...table, [MODE_ID]: MODE }) });
      if (!enabled() && has) {
        const { [MODE_ID]: _gone, ...rest } = table;
        ops.push({ op: 'set', path: ['extraModes'], value: JSON.stringify(rest) });
        // Without the Cowork sidebar (and in the lab with spaces off) defaultMode still picks a new thread's mode, so it
        // must not name a mode that is gone. With spaces, Modes already skips a start mode whose add-on is off and keeps
        // the owner's choice: this add-on never writes spaceSettings.
        if (row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      }
      if (ops.length > 0) await settings.mutate('modes', ops);
    } catch (error) {
      ctx.logger?.warn?.(\`${short}: the tab could not be updated: \${String(error?.message ?? error)}\`);
    }
  };
  void sync();
  const timer = setInterval(() => void sync(), 3000);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), ${sq(`${short}: tab`)});
` : '';
  files['index.js'] = `/**
 * ${oneLine(title, 80)}: ${desc}
 * Made by Creator Plus from its ${kind} recipe. Off until switched on in Settings.
 */
import z from '@deepseek-ai/schemastery';

export const name = ${sq(folder)};
${kind === 'mode' ? `export const MODE_ID = ${sq(modeId || short)};
/** The tab as the Modes add-on stores it. Its method stays under 4,000 characters. */
export const MODE = { label: ${sq(oneLine(title, 40))}, tools: ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'todo_write', 'ask_user_question'], sandbox: 'read-only', prompt: ${q(method || `You are in the ${oneLine(title, 40)} mode. ${desc}`)} };
` : ''}
export const Config = z.object({
  /** Off until switched on. */
  enabled: z.boolean().default(false).volatile(),
});

function plain(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * @param {object} ctx - plugin context.
 * @param {object} config - live Config.
 * @param {object} [standIns] - for tests: replacements for programs, the web and the clock.
 */
export function apply(ctx, config, standIns = {}) {
  const enabled = () => plain(config?.enabled) === true;
${toolBlock}${modeBlock}}
`;
  files['client.js'] = `window.__ModuleLoader__.load({
  id: ${sq(name)},
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useState } = React;
    const NS = ${sq(short)};

    function Page({ appCtx }) {
      const [on, setOn] = useState(undefined);
      const [busy, setBusy] = useState(false);
      useEffect(() => {
        let alive = true;
        appCtx.remote.settings.describe().then((result) => {
          const row = result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
          if (alive) setOn(row?.value?.enabled === true);
        }, () => {});
        return () => { alive = false; };
      }, [appCtx]);
      const flip = async () => {
        setBusy(true);
        try {
          const result = await appCtx.remote.settings.describe();
          const row = result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
          if (!row) return;
          const done = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: !on }], row.revision);
          if (done.ok) setOn(!on);
        } finally {
          setBusy(false);
        }
      };
      return h('div', { style: { padding: '0 0 24px', color: 'var(--dsw-alias-label-primary)' } },
        h('h2', { style: { fontSize: '20px', fontWeight: 600, margin: '0 0 6px' } }, ${sq(oneLine(title, 60))}),
        h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', margin: '0 0 16px' } }, ${sq(desc)}),
        h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } },
          h('input', { type: 'checkbox', checked: on === true, disabled: busy || on === undefined, onChange: () => void flip() }),
          'Switched on'));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings'],
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: NS, order: 140, label: () => ${sq(oneLine(title, 40))} }, (props) => h(Page, { ...props, appCtx: ctx }))));
      },
    };
  },
});
`;
  files[`test/${short}.test.mjs`] = `/**
 * ${oneLine(title, 80)}: written first, from the brief (Creator Plus, tests first). Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Config, apply } from '../index.js';

/** A stand-in app: just enough of the app's services. */
function app(config) {
  const registered = new Map();
  const disposers = [];
  const settings = { modes: { extraModes: '{}', defaultMode: 'cowork' } };
  const services = {
    tools: { register(tool) { registered.set(tool.name, tool); return () => registered.delete(tool.name); } },
    settings: { describe: () => Object.entries(settings).map(([ns, value]) => ({ ns, value })), mutate: async (ns, ops) => { for (const op of ops) settings[ns][op.path[0]] = op.value; } },
  };
  const ctx = { get: (key) => services[key], effect: (fn) => { const undo = fn(); if (typeof undo === 'function') disposers.push(undo); }, logger: { warn() {} } };
  apply(ctx, config);
  return { registered, settings, stop: () => disposers.forEach((undo) => undo()) };
}

test('off until switched on: nothing is added while it is off', async () => {
  const stand = app(Config({}));
  try {
    await new Promise((done) => setTimeout(done, 20));
    assert.equal(stand.registered.size, 0);
    assert.equal(JSON.parse(stand.settings.modes.extraModes)[${sq(modeId || short)}], undefined);
  } finally {
    stand.stop();
  }
});
${kind === 'tool' && tool ? `
test('switched on: the tool answers in plain text', async () => {
  const stand = app({ enabled: true });
  try {
    const tool = stand.registered.get(${sq(tool)});
    assert.ok(tool, 'the tool is offered');
    assert.match((await tool.execute({ text: 'hello' })).text, /hello/);
  } finally {
    stand.stop();
  }
});
` : ''}${kind === 'mode' ? `
test('switched on: the tab is added through the Modes add-on, with a method under 4,000 characters', async () => {
  const { MODE } = await import('../index.js');
  assert.ok(MODE.prompt.length < 4000);
  const stand = app({ enabled: true });
  try {
    await new Promise((done) => setTimeout(done, 20));
    assert.ok(JSON.parse(stand.settings.modes.extraModes)[${sq(modeId || short)}]);
  } finally {
    stand.stop();
  }
});
` : ''}
test('the page code parses, and the patch ships it switched off with no personal values', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(client));
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /enabled: false/);
  assert.doesNotMatch(patch, /\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b|\\/Users\\//);
});
`;
  files['README.md'] = `# ${oneLine(title, 80)}\n\nPlugin \`${name}\`, made by Creator Plus from its ${kind} recipe. ${desc}\n\nOff until you switch it on in **Settings → ${oneLine(title, 60)}**.\n\n## What you get\n\n(Filled in as the plugin grows.)\n\n## Rules, enforced in code\n\n- Off until switched on.\n\n## Tested\n\n- \`test/${short}.test.mjs\` (stand-ins only).\n\n## Not built yet\n\n(Filled in as the plugin grows.)\n`;
  return files;
}

/**
 * Write the scaffold into a build folder. Existing files are kept.
 * @param {string} dir - the plugin's folder (inside the conversation's build folder).
 * @param {Record<string, string>} files - from scaffoldFiles.
 * @param {string} [modules] - a node_modules folder to copy (the shared schemastery and cosmokit).
 * @param {string} [base] - where the check for links starts (the conversation's folder; its parent by default).
 * @returns {{written: string[], kept: string[]}} what happened.
 */
export function writeScaffold(dir, files, modules = '', base = dirname(dir)) {
  // Every write through one helper: no link anywhere from the base down, new files only (existing ones kept).
  const rel = relative(base, dir);
  if (!rel || rel.startsWith('..')) throw new Error('A plugin is written inside its build folder.');
  const written = [];
  const kept = [];
  for (const [path, text] of Object.entries(files)) (safeWrite(base, join(rel, path), text, { keep: true }) === 'written' ? written : kept).push(path);
  if (modules && existsSync(modules) && !existsSync(join(dir, 'node_modules'))) safeCopy(modules, base, join(rel, 'node_modules'));
  return { written, kept };
}
