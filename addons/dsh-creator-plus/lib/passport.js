/**
 * A passport for every plugin (build prompt, part 2): a small set of files each plugin carries,
 * whoever built it. Written by code from the plugin's own files; the brief is the one part a person
 * (or Creator Plus with the user's yes) improves by hand, so it is written only when missing.
 *
 * Layout (Tuning Plus relies on it): passport/brief.md, touches.json, built-against.json, tests.md,
 * changelog.md, origin.json, and lessons/ (worked examples Tuning Plus fills). A Plus add-on carries
 * its passport in its own folder; a built-in or third-party plugin's passport lives in Creator Plus's
 * own folder (<home>/creator-plus/passports/<id>/), never inside that plugin.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { safeDir, safeWrite } from './safewrite.js';
import { touchesOf } from './map.js';
import { mask } from './text.js';

export const PASSPORT_FILES = ['brief.md', 'touches.json', 'built-against.json', 'tests.md', 'changelog.md', 'origin.json'];

/**
 * The passport's files for one plugin.
 * @param {object} input - `scan` (lib/scan.js), `origin` ('owner+claude' | 'creator-plus' | 'third-party' | 'built-in'),
 *   `appVersion`, `changelog` (lines, newest first), `at`.
 * @returns {Record<string, string>} file name → text.
 */
export function passportFiles({ scan, origin, appVersion = '', changelog = [], at = Date.now() }) {
  const day = new Date(at).toISOString().slice(0, 10);
  const readme = mask(String(scan.readme ?? '')).trim();
  const brief = [
    `# Brief: ${scan.name || scan.folder}`,
    '',
    `What it is for: ${scan.description || 'not described in its package'}`,
    '',
    'This brief was written by Creator Plus from the plugin\'s own files. Its README below is the full description, complete enough to rebuild the plugin from; improve this brief by hand, with the user\'s yes.',
    '',
    '## What it must keep doing',
    '',
    ...(scan.tools?.length ? [`- Its tools: ${scan.tools.join(', ')}.`] : []),
    ...(scan.commands?.length ? [`- Its commands: ${scan.commands.map((name) => `/${name}`).join(', ')}.`] : []),
    ...(scan.modes?.length ? [`- Its tabs: ${scan.modes.join(', ')}.`] : []),
    ...(scan.provides?.length ? [`- The services it gives other plugins: ${scan.provides.join(', ')}.`] : []),
    ...(scan.config?.length ? [`- Its settings: ${scan.config.join(', ')}.`] : []),
    '',
    '## Its README',
    '',
    readme || '(no README)',
    '',
  ].join('\n');
  const touches = JSON.stringify({ name: scan.name, folder: scan.folder, at: day, ...touchesOf(scan) }, null, 2);
  const builtAgainst = JSON.stringify({
    harness: appVersion || 'unknown',
    engines: scan.engines || '',
    // The parts of the harness's interface the plugin uses: services, events, places in the interface.
    services: scan.uses ?? [],
    inject: scan.inject ?? [],
    events: scan.events ?? [],
    places: (scan.slots ?? []).map((slot) => slot.name).filter((name, index, list) => list.indexOf(name) === index),
  }, null, 2);
  const tests = [
    `# Tests: ${scan.name || scan.folder}`,
    '',
    scan.tests?.length ? `${scan.testCount} tests in ${scan.tests.length} file${scan.tests.length === 1 ? '' : 's'}: ${scan.tests.map((file) => `test/${file}`).join(', ')}.` : 'No tests yet.',
    '',
    'Run with the app\'s own Node (stand-ins only; never against the real app data):',
    '',
    '```',
    'ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs',
    '```',
    '',
    'The installer leaves the test folder out of an installed copy: run them from the Plus folder.',
    '',
  ].join('\n');
  const log = [`# Changelog: ${scan.name || scan.folder}`, '', ...(changelog.length ? changelog.slice(0, 200).map((line) => `- ${mask(line)}`) : ['- (no history found)']), ''].join('\n');
  const originRecord = JSON.stringify({ origin, name: scan.name, version: scan.version, written: day, by: 'creator-plus' }, null, 2);
  return { 'brief.md': brief, 'touches.json': `${touches}\n`, 'built-against.json': `${builtAgainst}\n`, 'tests.md': tests, 'changelog.md': log, 'origin.json': `${originRecord}\n` };
}

/**
 * Write a passport folder. The brief is written only when there is none (it may have been improved
 * by hand); the other files are regenerated. `lessons/` is made, empty, for Tuning Plus.
 * @param {string} dir - the passport folder.
 * @param {Record<string, string>} files - from passportFiles.
 * @returns {{written: string[], kept: string[]}} what happened.
 */
export function writePassport(dir, files, base = dirname(dirname(dir))) {
  // Every write through one helper: no link anywhere from the base down; replaced through a new file and a rename.
  const rel = relative(base, dir);
  if (!rel || rel.startsWith('..')) throw new Error('A passport is written inside its plugin\'s folder.');
  safeDir(base, join(rel, 'lessons'));
  safeWrite(base, join(rel, 'lessons', '.keep'), '', { keep: true });
  const written = [];
  const kept = [];
  for (const [name, text] of Object.entries(files)) {
    if (!PASSPORT_FILES.includes(name)) continue;
    const done = safeWrite(base, join(rel, name), text, { keep: name === 'brief.md' });
    (done === 'written' ? written : kept).push(name);
  }
  return { written, kept };
}

/** @returns {object | undefined} a passport's origin record. */
export function readOrigin(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'origin.json'), 'utf8'));
  } catch {
    return undefined;
  }
}
