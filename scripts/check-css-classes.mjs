// Fails when add-on pages could restyle each other (review 1.0 UI-01/02/03/06). Rules, see docs/UI-STYLE.md "CSS names":
//   1. A class an add-on puts on an element (dsh-xx-… or cws-…) is created by that add-on only.
//   2. Every add-on has its own prefix (dsh-xx); two add-ons never create classes with the same prefix.
//   3. A rule in an add-on's own CSS names at least one of its prefixed classes, or hooks onto html/body/[data-…]
//      on purpose. A bare ".title" or ".row" would style every page.
//   4. "dshu-" classes belong to the shared page parts (docs/shared/dsh-ui.js); an add-on uses them but never restyles them.
// Known, explained exceptions are in scripts/css-class-allowlist.json. Run: node scripts/check-css-classes.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIXED = /^(dsh|cws)-/;

export function stripBlocks(text) {
  // Every shared block (dsh-kit, dsh-ui, dsh-poll, ...) is a copy of a master in docs/shared, not the add-on's own code.
  let out = text;
  for (const [, name] of [...text.matchAll(/\/\/ ---- (dsh-[a-z]+):begin/g)]) {
    const from = out.indexOf(`// ---- ${name}:begin`);
    const to = out.indexOf(`// ---- ${name}:end`);
    if (from >= 0 && to > from) out = out.slice(0, from) + out.slice(to);
  }
  return out;
}

/** What one page file creates (classes on elements) and defines (selectors in its own CSS). */
export function scanPage(raw) {
  const text = stripBlocks(raw);
  const created = new Set();
  const take = (value) => { for (const c of String(value).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-zA-Z_][\w-]*$/.test(c)) created.add(c); };
  for (const m of text.matchAll(/className\s*[:=]\s*(?:'([^']*)'|"([^"]*)"|\{?`([^`]*)`)/g)) take(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of text.matchAll(/class=["']([^"']*)["']/g)) take(m[1]);
  for (const m of text.matchAll(/classList\.(?:add|toggle)\(\s*['"]([^'"]+)['"]/g)) take(m[1]);
  for (const m of text.matchAll(/\.className\s*=\s*['"]([^'"]+)['"]/g)) take(m[1]);
  const selectors = [];
  for (const block of text.matchAll(/(?:CSS|STYLE|Css|style)\w*\s*=\s*`([\s\S]*?)`/g)) {
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\$\{[^}]*\}/g, '');
    for (const rule of body.matchAll(/([^{}]+)\{/g)) for (const part of rule[1].split(',')) {
      const sel = part.trim();
      if (sel && !sel.startsWith('@') && !/^(from|to|\d)/.test(sel)) selectors.push(sel);
    }
  }
  return { created, selectors };
}

const prefixOf = (cls) => /^(dsh-[a-z0-9]+|cws)(?:-|$)/.exec(cls)?.[1] ?? '';

export function findProblems(pages, allow = {}) {
  const problems = [];
  const okDup = (cls) => (allow.sharedClasses ?? []).some((p) => (p.endsWith('*') ? cls.startsWith(p.slice(0, -1)) : cls === p));
  const okPrefix = (prefix) => (allow.sharedPrefixes ?? []).includes(prefix);
  const owners = new Map();
  const prefixes = new Map();
  for (const [name, { created, selectors }] of Object.entries(pages)) {
    for (const cls of created) {
      if (!PREFIXED.test(cls) || okDup(cls)) continue;
      if (!owners.has(cls)) owners.set(cls, new Set());
      owners.get(cls).add(name);
      const prefix = prefixOf(cls);
      if (!prefixes.has(prefix)) prefixes.set(prefix, new Set());
      prefixes.get(prefix).add(name);
    }
    for (const sel of selectors) {
      const classes = [...sel.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
      if (classes.some((c) => c.startsWith('dshu-'))) { problems.push(`${name}: a rule restyles a shared part: ${sel.slice(0, 80)}`); continue; }
      const foreign = classes.filter((c) => !PREFIXED.test(c));
      if (foreign.length === 0) continue;
      if (classes.some((c) => PREFIXED.test(c)) || /\[data-|^html\b|^body\b|^:root|^\*/.test(sel)) continue;
      if ((allow.looseSelectors ?? []).includes(`${name}: ${sel}`)) continue;
      problems.push(`${name}: a rule with no prefixed class would reach other pages: ${sel.slice(0, 80)}`);
    }
  }
  for (const [cls, who] of owners) if (who.size > 1) problems.push(`class "${cls}" is created by ${[...who].join(' and ')}`);
  for (const [prefix, who] of prefixes) if (who.size > 1 && !okPrefix(prefix)) problems.push(`prefix "${prefix}-" is used by ${[...who].join(' and ')}; give each add-on its own`);
  return problems;
}

export function scanRepo(root) {
  const pages = {};
  for (const name of readdirSync(join(root, 'addons')).sort()) {
    const file = join(root, 'addons', name, 'client.js');
    if (existsSync(file)) pages[name] = scanPage(readFileSync(file, 'utf8'));
  }
  const allowFile = join(root, 'scripts/css-class-allowlist.json');
  const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : {};
  return { pages, allow };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { pages, allow } = scanRepo(root);
  const problems = findProblems(pages, allow);
  for (const line of problems) console.log(line);
  console.log(problems.length === 0 ? `css names: ${Object.keys(pages).length} pages, no clashes` : `css names: ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
