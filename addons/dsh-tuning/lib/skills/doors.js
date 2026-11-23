/**
 * The doors a skill comes in through, as far as code can see them (the owner's fixed rule 1, widened on
 * 17 November 2026: "Yes, both"). A model's own file tools (write, edit, apply_patch) writing into a
 * skills folder make the app ask the owner first with its own approval card, and the skill is stamped
 * AI-made with that model when it is written. Writing into Tuner Plus's own folder (the record) or into
 * Learned skills' data (its list decides marks) is refused. Writes through the shell or by other
 * programs raise no event: those skills show as Not sorted or Changed, and the owner is asked.
 *
 * Paths are read exactly as the app's file tools read them (an independent review, 17 November): `~` is
 * the home folder, a relative path is in the thread's own working folder, `..` goes through links
 * the way the disk does, and apply_patch headers are trimmed of any white space, as the app's parser does.
 */
import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/** The app's file tools that write. */
export const WRITE_TOOLS = Object.freeze(['write', 'edit', 'apply_patch']);
/** The apply_patch headers that name a file (dsh-fs-patch). */
const PATCH_HEADERS = ['*** Add File: ', '*** Delete File: ', '*** Update File: ', '*** Move to: '];
const WHITE = /\p{White_Space}/u;
/** Trimmed of Unicode white space at both ends, as the app's patch parser trims. */
export function trimWhite(value) {
  const text = String(value ?? '');
  let start = 0;
  let end = text.length;
  while (start < end && WHITE.test(text.charAt(start))) start += 1;
  while (end > start && WHITE.test(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** `~` and `~/…` are the home folder, as the app's file tools take them. */
export const expandHome = (path) => (path === '~' || path.startsWith('~/') ? `${homedir()}${path.slice(1)}` : path);

/** A path made absolute the way the app does it: relative to the thread's folder, `..` kept for the disk. */
export function absoluteRaw(path, cwd) {
  const value = expandHome(String(path ?? ''));
  return isAbsolute(value) ? value : `${String(cwd ?? '') || '/'}/${value}`;
}

/** A path as the disk names it: the real path of the nearest part that exists (the disk follows links and `..`), plus the rest. */
export function physical(path) {
  const raw = String(path ?? '');
  let head = raw.replace(/\/+$/, '');
  const rest = [];
  for (let step = 0; step < 400; step += 1) {
    try {
      return join(realpathSync.native(head || '/'), ...rest);
    } catch {
      const at = head.lastIndexOf('/');
      if (at <= 0) return resolve(raw);
      rest.unshift(head.slice(at + 1));
      head = head.slice(0, at);
    }
  }
  return resolve(raw);
}
/** Kept for the callers that name it so: the disk's spelling of a path. */
export const onDisk = physical;
/** Every spelling a path can be compared in: as written (tidied), and as the disk names it. */
export const spellings = (path) => [...new Set([resolve(String(path ?? '')), physical(path)])];
const lowered = (path) => String(path).toLowerCase().replace(/\/+$/, '');
/** Whether a path is a folder or inside it, in any spelling (the Mac's disk does not tell capitals apart). */
export function inFolder(path, folder) {
  if (!folder) return false;
  const roots = spellings(folder).map(lowered);
  return spellings(path).map(lowered).some((one) => roots.some((root) => one === root || one.startsWith(`${root}/`)));
}

/** A Recon room: a dsh-recon-* folder directly in /tmp, /private/tmp or the temporary folder (Recon's own naming rule). */
export function inReconRoom(path) {
  // The temporary folder in both its spellings (/var/folders/… is /private/var/folders/… on the disk).
  const temps = spellings(tmpdir()).map((one) => one.toLowerCase().replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const rules = [/^\/(?:private\/)?tmp\/dsh-recon-[^/]+(?:\/|$)/, ...temps.map((temp) => new RegExp(`^${temp}/dsh-recon-[^/]+(?:/|$)`))];
  return spellings(path).some((one) => rules.some((rule) => rule.test(one.toLowerCase())));
}

/**
 * The files a call of the app's file tools would write, as absolute paths (`..` left for the disk).
 * @param {string} name - the tool.
 * @param {object} args - its arguments.
 * @param {string} cwd - the thread's own working folder.
 * @returns {string[]} the paths ([] for other tools).
 */
export function writeTargets(name, args, cwd) {
  if (name === 'write' || name === 'edit') {
    const path = typeof args?.file_path === 'string' ? args.file_path : '';
    return path.trim() ? [absoluteRaw(path, cwd)] : [];
  }
  if (name === 'apply_patch') {
    const text = typeof args?.input === 'string' ? args.input : '';
    const found = [];
    // Every line that is a header once trimmed, wherever it stands (a superset of what the app takes).
    for (const line of text.split(/\r?\n/u)) {
      const header = trimWhite(line);
      const prefix = PATCH_HEADERS.find((one) => header.startsWith(one));
      if (prefix) {
        const path = trimWhite(header.slice(prefix.length));
        if (path) found.push(absoluteRaw(path, cwd));
      }
    }
    return found;
  }
  return [];
}

/**
 * The skill a path belongs to when it is in a skills folder the app reads (a project's `.dsh/skills` or
 * `.agents/skills`, the user's `~/.dsh/skills` or DSH_HOME's `skills`, `~/.agents/skills`), or inside a
 * skill folder already known (a linked skill whose real folder lies elsewhere).
 * @param {string} path - an absolute path.
 * @param {{dshHome?: string, known?: string[]}} [where] - the app's data folder; the real folders of known skills.
 * @returns {{root: string, entry: string, folder: string} | undefined}
 */
export function skillOf(path, { dshHome = '', known = [] } = {}) {
  const homeRoots = dshHome ? spellings(join(dshHome, 'skills')).map(lowered) : [];
  for (const spelling of spellings(path)) {
    const parts = spelling.split('/');
    for (let index = parts.length - 2; index >= 1; index -= 1) {
      const isRoot = parts[index].toLowerCase() === 'skills' && ['.dsh', '.agents'].includes(parts[index - 1]?.toLowerCase());
      const root = parts.slice(0, index + 1).join('/');
      if (!isRoot && !homeRoots.includes(lowered(root))) continue;
      const entry = parts[index + 1];
      if (!entry) return undefined;
      return { root, entry, folder: join(root, entry) };
    }
  }
  for (const folder of known) {
    if (folder && inFolder(path, folder)) return { root: dirname(folder), entry: basename(folder), folder };
  }
  return undefined;
}

/**
 * What a write call means for the skills: refused (into a closed folder: the record, Learned skills'
 * data; or by a helper), asked (into a skills folder), or nothing.
 * @param {object} call - `{name, args, cwd, closed: [{folder, reason}], dshHome, known, helper}`.
 * @returns {{refuse?: string, ask?: string, skills: object[]}}
 */
export function writeDecision({ name, args, cwd, closed = [], dshHome, known = [], helper = false }) {
  if (!WRITE_TOOLS.includes(name)) return { skills: [] };
  const targets = writeTargets(name, args, cwd);
  for (const { folder, reason } of closed) {
    if (folder && targets.some((path) => inFolder(path, folder))) return { refuse: reason, skills: [] };
  }
  const skills = targets.map((path) => ({ path, ...skillOf(path, { dshHome, known }) })).filter((one) => one.root);
  if (skills.length === 0) return { skills };
  const names = [...new Set(skills.map((one) => one.folder))];
  if (helper) return { refuse: 'A helper may not write a skill. The thread itself can, with your yes.', skills };
  return {
    ask: `A model wants to write a skill: ${names.join(', ')}. A skill there loads in every thread that reads that folder. Allow it this once?`,
    skills,
  };
}

/** The `name:` in a skill file's front matter ('' when there is none). */
export function nameInFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  if (!match) return '';
  const line = /^name:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*$/m.exec(match[1]);
  return line ? line[1] : '';
}
