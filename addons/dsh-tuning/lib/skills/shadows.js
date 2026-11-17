/**
 * Same name, two places (the owner's prompt, Phase 2 part 1; step 5): when two skills share a name, the
 * app gives the model one of them and hides the others, and it shows the hidden ones nowhere. Tuner Plus
 * reads the skills folders itself, the way the app does (dsh-skill-filesystem: a folder with SKILL.md or
 * one .md file directly in a skills folder, with a name and a description at the top; the project is the
 * nearest folder with .git), adds the skills the app serves from elsewhere, and compares with the one the
 * app says wins: every other skill of that name is hidden behind it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { physical } from './doors.js';

/** A skill name as the app takes it (lowercase words joined by single hyphens). */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The project a folder belongs to, as the app finds it: the nearest folder with .git, or the folder itself. */
export function projectOf(cwd) {
  let current = String(cwd ?? '');
  for (let step = 0; step < 200 && current; step += 1) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return String(cwd ?? '');
}

/** The skills folders the app reads for a project, with their order (a lower rank wins a shared name). */
export function rootsFor(project, { dshHome = '', agentsHome = '' } = {}) {
  return [
    { path: join(project, '.dsh', 'skills'), rank: 100 },
    { path: join(project, '.agents', 'skills'), rank: 200 },
    ...(dshHome ? [{ path: join(dshHome, 'skills'), rank: 400 }] : []),
    ...(agentsHome ? [{ path: join(agentsHome, 'skills'), rank: 500 }] : []),
  ];
}

/** The name and description at the top of a skill file ({} when they are not there the way the app wants them). */
export function frontOf(text) {
  const raw = String(text ?? '');
  const first = raw.indexOf('\n');
  if (first < 0 || raw.slice(0, first).replace(/\r$/, '') !== '---') return {};
  const rest = raw.slice(first + 1).split('\n');
  const end = rest.findIndex((line) => line.replace(/\r$/, '') === '---');
  if (end < 0) return {};
  const field = (key) => {
    const line = rest.slice(0, end).find((one) => one.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2').trim() : '';
  };
  const name = field('name');
  const description = field('description');
  return SKILL_NAME.test(name) && description ? { name, description } : {};
}

/**
 * The skills in one skills folder, as the app finds them.
 * @param {string} root - a skills folder.
 * @returns {{name: string, description: string, path: string}[]} each skill's name, description and file.
 */
export function scanRoot(root) {
  let entries = [];
  try {
    entries = readdirSync(root).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries.slice(0, 500)) {
    if (entry === '.system') continue;
    const at = join(root, entry);
    let file = '';
    try {
      const stat = statSync(at);
      if (stat.isDirectory()) file = join(at, 'SKILL.md');
      else if (stat.isFile() && entry.endsWith('.md')) file = at;
    } catch {
      continue;
    }
    if (!file) continue;
    let text = '';
    try {
      text = readFileSync(file, 'utf8').slice(0, 64_000);
    } catch {
      continue;
    }
    const front = frontOf(text);
    if (front.name) found.push({ ...front, path: file });
  }
  return found;
}

/** Whether two skills are the same one: the same file, or the same provider when neither has a file. */
export function sameSkill(one, other) {
  const a = String(one?.path ?? '');
  const b = String(other?.path ?? '');
  if (a || b) return Boolean(a && b) && physical(a).toLowerCase() === physical(b).toLowerCase();
  return String(one?.provider ?? '') === String(other?.provider ?? '');
}

/**
 * The skills hidden behind the ones the app gives the model in one project.
 * @param {{winners: Map<string, object>, candidates: object[]}} where - the app's winner per name; every skill of the project.
 * @returns {object[]} the hidden ones, each with `hiddenBy` (the winner).
 */
export function hiddenBehind({ winners, candidates }) {
  const hidden = [];
  for (const candidate of candidates) {
    const winner = winners.get(candidate?.name);
    if (!winner || sameSkill(candidate, winner)) continue;
    if (hidden.some((one) => one.name === candidate.name && sameSkill(one, candidate))) continue;
    hidden.push({ ...candidate, hiddenBy: { name: winner.name, provider: winner.provider, path: winner.path ?? '' } });
  }
  return hidden;
}
