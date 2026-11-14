/**
 * Builds docs/GUIDE.md. Part 1 (how to use it) is written by hand in docs/guide-part1.md. Part 2
 * (the slash commands) and Part 3 (every add-on with every setting and its starting value) are
 * read from the add-ons' own code here, so they cannot go out of date.
 * Usage: node scripts/dev-guide.mjs   (from the repository's top folder)
 */
import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2] ?? '.';
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const SLOT = { 'conversation.input.left': 'chat box, left group', 'conversation.input.right': 'chat box, beside the send button', 'conversation.input.dock': 'above the chat box', 'conversation.chat.turnTail': 'under an answer', 'conversation.chat.assistant-actions': 'action row under an answer', 'conversation.hero.options': 'start page of a new conversation', 'conversation.hero.brand.mark': 'start page', 'sidebar.panellist': 'sidebar', 'sidebar.panel.icon': 'sidebar', 'sidebar.footer.action': 'bottom of the sidebar', 'shell.overlay': 'window edge', 'shell.leading': 'sidebar' };
const ORDER = ['dsh-cowork-shell', 'dsh-modes', 'dsh-mission', 'dsh-data', 'dsh-finance', 'dsh-deep-research', 'dsh-model-tiers', 'dsh-agent-swarm', 'dsh-code-power', 'dsh-code-map', 'dsh-diagram', 'dsh-pdf', 'dsh-library', 'dsh-memory', 'dsh-learn', 'dsh-automations', 'dsh-mac', 'dsh-activity', 'dsh-budget', 'dsh-balance', 'dsh-usage-ledger', 'dsh-evolve', 'dsh-benchmark', 'dsh-model-arena', 'dsh-model-router', 'dsh-route-health', 'dsh-sampling-presets', 'dsh-role-prompts', 'dsh-context-saver', 'dsh-media-tools', 'dsh-notify', 'dsh-privacy', 'dsh-color-schemes', 'dsh-sync', 'dsh-shared-settings'];
const dirs = fs.readdirSync(path.join(root, 'addons')).filter((d) => fs.existsSync(path.join(root, 'addons', d, 'package.json')));
dirs.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const facts = []; const out = [];
for (const d of dirs) {
  const dir = path.join(root, 'addons', d);
  const pkg = JSON.parse(read(path.join(dir, 'package.json')));
  const loc = (() => { try { return JSON.parse(read(path.join(dir, 'locale/en.json'))); } catch { return {}; } })();
  const idx = read(path.join(dir, 'index.js')); const cli = read(path.join(dir, 'client.js')); const patch = read(path.join(dir, 'cordis.patch.yml'));
  const libs = fs.existsSync(path.join(dir, 'lib')) ? fs.readdirSync(path.join(dir, 'lib')).filter((f) => f.endsWith('.js')).map((f) => read(path.join(dir, 'lib', f))).join('\n') : '';
  const code = `${idx}\n${libs}\n${read(path.join(dir, 'runner.js'))}`;
  // Settings: every field of Config, with the comment written above it and its default.
  const cfgStart = idx.indexOf('export const Config');
  const settings = [];
  if (cfgStart >= 0) {
    const block = idx.slice(cfgStart, idx.indexOf('\n});', cfgStart) + 1 || cfgStart + 12000);
    const re = /(?:\/\*\*([\s\S]*?)\*\/\s*\n)?\s{2}(\w+): z\s*\.?\s*(\w+)\(/g; let m;
    while ((m = re.exec(block))) {
      const rest = block.slice(m.index, m.index + 900);
      const def = /\.default\(((?:[^()]|\([^()]*\))*)\)/.exec(rest.slice(0, rest.indexOf('\n  /**') > 0 ? rest.indexOf('\n  /**') : 900));
      const note = (m[1] ?? '').replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim();
      let value = def ? def[1].trim().replace(/\s+/g, ' ') : '';
      if (value.length > 40) value = value.startsWith('{') || value.startsWith('[') ? '(a list or table)' : `${value.slice(0, 37)}…`;
      if (!['object', 'array'].includes(m[3]) || note) settings.push({ name: m[2], value, note: note.slice(0, 260) });
    }
  }
  const tools = [...code.matchAll(/name: '([a-z][a-z0-9_]{3,})',\s*\n\s*description:\s*(?:\[\s*\n\s*)?['`]((?:[^'`\\]|\\.)*)/g)].map((m) => ({ name: m[1], what: m[2].replace(/\\'/g, "'").split(/(?<=[.:])\s/)[0].slice(0, 170) }));
  const cmdDefault = /commandName: z\.string\(\)\.default\('([^']*)'\)/.exec(idx)?.[1];
  const cmds = [...new Set([...idx.matchAll(/commands\.register\(\{\s*name: '([^']+)'/g)].map((m) => m[1]).concat(cmdDefault ? [cmdDefault] : []))];
  const section = /settings\.section', id: '[^']+', order: \d+, label: \(\) => t\('([^']+)'\)/.exec(cli) ? (loc.meta?.title ?? d) : '';
  const sectionTitle = /'section\.title': '([^']+)'/.exec(cli)?.[1] ?? '';
  const places = [...new Set([...cli.matchAll(/name: '((?:sidebar|conversation|shell)[.\w-]+)'/g)].map((m) => SLOT[m[1]]).filter(Boolean))];
  const on = /^\s+enabled:\s*(true|false)/m.exec(patch)?.[1] ?? (/enabled: z\.boolean\(\)\.default\((true|false)\)/.exec(idx)?.[1]);
  const title = loc.meta?.title ?? d;
  const state = d === 'dsh-privacy' ? 'true' : on;
  facts.push({ d, title, settings: settings.length, tools: tools.length, cmds, section: sectionTitle, places, on, hasClient: Boolean(cli), tests: fs.existsSync(path.join(dir, 'test')) });
  out.push(`### ${title}`, '', `${(loc.meta?.description ?? pkg.description ?? '').trim()}`, '');
  const where = [];
  if (sectionTitle) where.push(`Settings → ${sectionTitle}`);
  if (places.length) where.push(...places);
  if (cmds.length) where.push(...cmds.map((c) => `\`/${c}\` in the chat box`));
  out.push(`- **Where:** ${where.length ? where.join('; ') : 'no page of its own; it works in the background'}`);
  out.push(`- **After install:** ${state === 'false' ? 'off until you switch it on' : 'on'}`);
  if (tools.length) out.push(`- **Tools the assistant gets:** ${tools.map((t) => `\`${t.name}\``).join(', ')}`);
  out.push(`- **Details:** \`addons/${d}/README.md\``, '');
  if (settings.length) {
    out.push('| Setting | Starts as | What it does |', '|---|---|---|');
    for (const s of settings) out.push(`| \`${s.name}\` | ${s.value ? `\`${s.value.replace(/\|/g, '\\|')}\`` : ''} | ${s.note.replace(/\|/g, '\\|') || ''} |`);
    out.push('');
  }
}
const commands = ['## Part 2: every slash command', '', '| Command | Add-on |', '|---|---|', ...facts.flatMap((f) => f.cmds.map((c) => [c, f.title])).sort((a, b) => a[0].localeCompare(b[0])).map(([c, t]) => `| \`/${c}\` | ${t} |`), '', 'Type a command alone to see what it offers. The app\'s own commands (such as `/goal`, `/permission`, `/feedback`) are not listed here.', ''];
const head = fs.readFileSync(path.join(root, 'docs', 'guide-part1.md'), 'utf8').trimEnd();
fs.writeFileSync(path.join(root, 'docs', 'GUIDE.md'), [head, '', ...commands, '## Part 3: reference', '', 'Every add-on, in the order of Part 1, with what it adds and every setting. "Starts as" is the value after a fresh install. Settings are changed on the add-on\'s page in Settings where it has one, otherwise in the configuration file.', '', ...out].join('\n'));
console.log('addons', facts.length, 'lines', out.length, 'settings', facts.reduce((n, f) => n + f.settings, 0), 'tools', facts.reduce((n, f) => n + f.tools, 0));
console.log('no settings page but has settings:', facts.filter((f) => !f.section && f.settings > 1).map((f) => `${f.title}(${f.settings})`).join(', '));
console.log('settings without a comment:', out.filter((l) => /^\| `\w+` \| .* \|  \|$/.test(l)).length);
