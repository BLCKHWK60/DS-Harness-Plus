/**
 * The one skill writer of Tuner Plus (step 6; the owner's answers 1 and 2): an ordinary skill file in the
 * app's own format, a folder with SKILL.md (a name and a description at the top, then the text), that the
 * app reads by itself, so it keeps working without Tuner Plus or Learned skills.
 *
 *   - Where: "this project" (the project's .dsh/skills, the project being the nearest folder with .git) or
 *     "everywhere" (the app's own ~/.dsh/skills). Never the shared ~/.agents/skills (other tools read it),
 *     never the default workspace (Plus never writes there; there only "everywhere"), never a Recon room.
 *   - The name rule: the app's own (lowercase words joined by hyphens); never a name a skill already has
 *     anywhere (a skill file silently hides an Office, Plus or Learned skill of the same name); never an
 *     office… name (loading one unlocks the Office tools).
 *   - Never over a skill that is there, never through a link; secrets masked before anything is written.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { mask } from '../mask.js';
import { inFolder, inReconRoom } from './doors.js';
import { SKILL_NAME, projectOf } from './shadows.js';

export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 500;
export const TEXT_MAX = 20_000;
/** Names that unlock the app's Office tools when a skill of that name loads. */
export const RESERVED = /^office(?:-|$)/;
export const SCOPES = Object.freeze(['project', 'everywhere']);

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/**
 * A labelled secret the masking left in place (it masks the usual spellings; a skill must hold none):
 * "password: [hunter2]", 'token = "x…"', "api key: …" with a value that is not the mask (the review of step 6).
 */
const SECRET_LEFT = /\b(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[\s_-]?key|access[\s_-]?key|private[\s_-]?key|client[\s_-]?secret)\b\s*[:=]\s*["'(]?(?!\[secret\]|\*{3})\[?[^\s"'\])]{3,}/i;
export const secretLeft = (value) => SECRET_LEFT.test(String(value ?? ''));

/**
 * What is wrong with a new skill's name, in plain words ('' when it may be used).
 * @param {string} name - the name.
 * @param {Set<string>} taken - every name a skill already has anywhere.
 */
export function nameProblem(name, taken = new Set()) {
  const value = String(name ?? '').trim();
  if (!SKILL_NAME.test(value) || value.length > NAME_MAX) return `The name must be lowercase words joined by hyphens, at most ${NAME_MAX} characters, like "write-changelogs".`;
  if (RESERVED.test(value)) return 'Names starting with "office" belong to the app\'s own Office skills (loading one switches on the Office tools). Pick another name.';
  if (taken.has(value)) return `There is already a skill called "${value}". A new skill never takes another skill's name: in the app, a skill file would hide the other one. Pick another name.`;
  return '';
}

/** Whether two folders are the same one, in any spelling. */
const same = (one, other) => Boolean(one && other) && inFolder(one, other) && inFolder(other, one);
/**
 * Whether a project is the default workspace or inside it, or is the project the default workspace belongs to
 * (a skill there would load in its conversations).
 * @param {string} top - a project.
 * @param {string|string[]} folders - the default workspace (one folder or several spellings of it).
 */
export function inDefault(top, folders) {
  return [].concat(folders ?? []).filter((one) => typeof one === 'string' && isAbsolute(one)).some((folder) => inFolder(top, folder) || same(projectOf(resolve(folder)), top));
}

/**
 * Where a new skill goes. The skills folder it ends up in is checked, not only the folder asked for: never
 * a Recon room, never the shared ~/.agents/skills, never the default workspace's project (a skill there
 * would load in its conversations), and "this project" never lands in the "everywhere" folder (a project
 * that is the home folder) (the review of step 6).
 * @param {{name: string, scope: string, project?: string, dshHome: string, defaultFolder?: string|string[], agentsHome?: string}} want - `defaultFolder`: the default workspace (one folder or several).
 * @returns {{folder?: string, file?: string, root?: string, git?: boolean, problem?: string}}
 */
export function targetFor({ name, scope, project = '', dshHome, defaultFolder = '', agentsHome = '' }) {
  if (!SCOPES.includes(scope)) return { problem: 'Say where the skill goes: this project, or everywhere.' };
  if (!dshHome || !isAbsolute(dshHome)) return { problem: 'The app\'s data folder is not known, so no skill can be written.' };
  const everywhere = join(resolve(dshHome), 'skills');
  const shared = agentsHome ? join(resolve(agentsHome), 'skills') : '';
  const closed = (root) => {
    if (inReconRoom(root)) return 'Recon\'s room never gets a skill.';
    if (shared && (inFolder(root, shared) || inFolder(shared, root))) return 'That is the shared skills folder other tools read; Tuner Plus writes there only when you ask for it.';
    return '';
  };
  if (scope === 'everywhere') {
    const problem = closed(everywhere);
    return problem ? { problem } : { root: everywhere, folder: join(everywhere, name), file: join(everywhere, name, 'SKILL.md'), git: false };
  }
  if (!project || !isAbsolute(project)) return { problem: 'Pick the project the skill is for.' };
  const top = projectOf(resolve(project));
  const root = join(top, '.dsh', 'skills');
  const problem = closed(top) || closed(root);
  if (problem) return { problem };
  if (inDefault(top, defaultFolder)) return { problem: 'Tuner Plus never writes into your default workspace. Choose "everywhere" for a skill there.' };
  if (same(root, everywhere)) return { problem: 'That project\'s skills folder is the "everywhere" one (the project is your home folder). Choose "everywhere".' };
  return { root, folder: join(root, name), file: join(root, name, 'SKILL.md'), git: existsSync(join(top, '.git')) };
}

/**
 * What stands in the way of writing a skill there, found before anything is kept: a link or a file on the
 * way, or something of that name already there in any capitals (the Mac's disk does not tell them apart).
 * @param {{root: string, folder: string}} target
 * @returns {string} the problem in plain words ('' when the way is clear).
 */
export function preflight({ root, folder }) {
  for (const step of [dirname(root), root]) {
    try {
      const seen = lstatSync(step);
      if (seen.isSymbolicLink()) return `${step} is a link; Tuner Plus does not write through links.`;
      if (!seen.isDirectory()) return `${step} is not a folder, so no skill can go there.`;
    } catch (error) {
      if (error?.code !== 'ENOENT') return `${step} cannot be read.`;
    }
  }
  const name = basename(folder).toLowerCase();
  try {
    if (readdirSync(root).some((entry) => entry.toLowerCase() === name || entry.toLowerCase() === `${name}.md`)) return `There is already something called ${basename(folder)} in ${root}; Tuner Plus never writes over it.`;
  } catch { /* no skills folder yet: it is made */ }
  return '';
}

/**
 * The skill file's text: the name and description at the top (as the app reads them), then the text.
 * Secrets are masked first.
 * @returns {{text: string, description: string, body: string, masked: number}}
 */
export function skillFileText({ name, description, text }) {
  const desc = mask(oneLine(description).slice(0, DESCRIPTION_MAX));
  const body = mask(String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, TEXT_MAX));
  // Both written as quoted texts: a name like "true" or "123" stays a name (the app's YAML reader would
  // take it for something else and drop the skill), and nothing in the description can add a field.
  return {
    text: `---\nname: ${JSON.stringify(String(name))}\ndescription: ${JSON.stringify(desc.text)}\n---\n${body.text}\n`,
    description: desc.text,
    body: body.text,
    masked: desc.masked + body.masked,
    unsure: desc.unsure || body.unsure || secretLeft(desc.text) || secretLeft(body.text),
  };
}

/** What is wrong with a new skill's description or text ('' when nothing). */
export function contentProblem({ description, text }) {
  if (!oneLine(description)) return 'Say in one line when the skill helps (its description): the model chooses by it.';
  if (oneLine(description).length > DESCRIPTION_MAX) return `The description is longer than ${DESCRIPTION_MAX} characters; the app cuts it there.`;
  if (!String(text ?? '').trim()) return 'The skill needs its text.';
  if (String(text).length > TEXT_MAX) return `The text is longer than ${TEXT_MAX} characters.`;
  return '';
}

/**
 * Write the skill file: its folder is made new (never over a skill that is there), no link on the way to
 * it, the file made with "only if new", through the skills folder's real path (so a link swapped in after
 * the check changes nothing).
 * @param {{root: string, folder: string, file: string, text: string}} target
 * @returns {string} the file written.
 */
export function writeSkillFile({ root, folder, text }) {
  const problem = preflight({ root, folder });
  if (problem) throw new Error(problem);
  mkdirSync(root, { recursive: true });
  if (lstatSync(root).isSymbolicLink()) throw new Error(`${root} is a link; Tuner Plus does not write through links.`);
  const real = join(realpathSync.native(root), basename(folder));
  mkdirSync(real);
  const file = join(real, 'SKILL.md');
  writeFileSync(file, text, { flag: 'wx', mode: 0o644 });
  return join(folder, 'SKILL.md');
}
