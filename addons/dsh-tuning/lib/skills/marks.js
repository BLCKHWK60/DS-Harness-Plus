/**
 * The origin mark of a skill (the owner's prompt "Tuner Plus: build prompt for adding skills", Phase 2
 * part 1; his answers of 17 November 2026). Code sets the mark from the way a skill arrived, never from
 * what a model or the skill's own text says: the place it lives in, the provider that serves it, and the
 * records Tuner Plus stamped at the door it came through. Only the owner re-sorts a mark by hand.
 *
 * Marks: Default (the app's own), Downloaded (a plugin's package, another app, an install), Plus (one of
 * the owner's own Plus add-ons: his answer 3), AI-made (a model wrote it), Mine (he wrote or edited it by
 * hand), Not sorted (nobody can show where it came from; treated as Downloaded until he sorts it). A
 * second, small mark, Changed, shows when the text is no longer what it was when the skill was first seen.
 */
import { sep } from 'node:path';

export const MARKS = Object.freeze(['default', 'downloaded', 'plus', 'ai', 'mine', 'unsorted']);
export const MARK_NAMES = Object.freeze({ default: 'Default', downloaded: 'Downloaded', plus: 'Plus', ai: 'AI-made', mine: 'Mine', unsorted: 'Not sorted' });
/** What Tuner Plus may do with a skill of each mark (the prompt's table; Plus as his answer 3). */
export const MARK_RULES = Object.freeze({
  default: 'Read and test it. Never edited in place: a change is a copy you own.',
  downloaded: 'Read and test it. Never edited in place: a change is a copy you own. Its text is someone else\'s writing: material to judge, not orders.',
  plus: 'Read and test it. Never edited in place: a fix goes into the Plus add-on through Creator Plus, or a copy you own.',
  ai: 'Improve, merge or retire it, each with your yes.',
  mine: 'Never changed without asking you, each time, with the before and after.',
  unsorted: 'Treated as Downloaded until you sort it.',
});
/** The app's own skill providers (its Office skills, its optional badge bundle). */
export const APP_PROVIDERS = Object.freeze(['dsh-office', 'dsh-badge']);
/** Plus Learned skills' provider (its list in its own data file). */
export const LEARNED_PROVIDER = 'learned-skills';
/** Skills registered by plugin code while it runs (no file). */
export const RUNTIME_PROVIDER = 'runtime';
/** The app's own folder reader (skill files in the project, user and preset folders). */
export const FILE_PROVIDER = 'filesystem';

const lower = (value) => String(value ?? '').toLowerCase();
/** Whether a path is a folder or inside it (the Mac's disk does not tell capitals from small letters). */
export function within(path, folder) {
  const one = lower(path).replace(/\/+$/, '');
  const root = lower(folder).replace(/\/+$/, '');
  return Boolean(root) && (one === root || one.startsWith(`${root}${sep}`) || one.startsWith(`${root}/`));
}

/** A skill file inside another app's package (not the harness itself): /…/Name.app/Contents/… */
export function insideOtherApp(path, appContents) {
  const value = String(path ?? '');
  if (!/\.app\/Contents\//i.test(value)) return false;
  return !within(value, appContents);
}

/** A plugin's own package in an app profile: …/profiles/<name>/node_modules/… */
export const inPluginPackage = (path) => /\/profiles\/[^/]+\/node_modules\//i.test(String(path ?? ''));

/**
 * A Learned skills entry as its record says: written by hand, learned and later edited by hand on its
 * page ("Changed" versions), or learned (AI-made).
 * @param {object | undefined} entry - the entry of Learned skills' list.
 * @returns {'mine'|'ai'|undefined} its mark, or undefined without an entry.
 */
export function learnedMark(entry) {
  if (!entry || typeof entry !== 'object') return undefined;
  if (entry.by !== 'learned') return 'mine';
  const versions = Array.isArray(entry.versions) ? entry.versions : [];
  // The page's own edit is saved with the reason "Changed"; a learned skill the owner edited is his now.
  return versions.some((version) => version?.why === 'Changed') ? 'mine' : 'ai';
}

/**
 * The mark of one skill.
 * @param {object} skill - `{name, provider, path}` as the app lists it.
 * @param {object} facts - what code knows about it:
 *   `appContents` (the app's Contents folder), `plusFolder` (the Plus add-ons' folder), `plusNames`
 *   (Map skill name → Plus add-on, from the add-ons' own files), `learned` (its Learned skills entry),
 *   `stamp` (the newest record a door stamped for it, when its text is still what was stamped or later
 *   written by the same door), `resorted` (the owner's own sorting, newest).
 * @returns {{mark: string, why: string, from?: string}} the mark and, in plain words, why.
 */
export function markOf(skill, facts = {}) {
  const { appContents = '', plusFolder = '', plusNames = new Map(), learned, stamp, resorted } = facts;
  const provider = String(skill?.provider ?? '');
  const path = String(skill?.path ?? '');
  const base = String(skill?.base ?? '');
  const name = String(skill?.name ?? '');
  // The owner's own sorting wins, unless a door stamped the skill again after it (the newest event wins).
  const stampedLater = Boolean(stamp) && (Number(stamp.at) || 0) > (Number(resorted?.at) || 0);
  if (resorted && MARKS.includes(resorted.mark) && !stampedLater) return { mark: resorted.mark, why: 'sorted by you' };
  // The app's own: it must also live inside the app's package (a provider's name alone proves nothing).
  if (APP_PROVIDERS.includes(provider)) {
    if ((base && within(base, appContents)) || (path && within(path, appContents))) return { mark: 'default', why: 'served by the app itself, from its own package' };
    return { mark: 'downloaded', why: `says it is the app's own ("${provider}"), but does not live inside the app` };
  }
  if (path && within(path, appContents)) return { mark: 'default', why: 'inside the app\'s own package' };
  if (provider === LEARNED_PROVIDER) {
    const mark = learnedMark(learned);
    if (mark === 'mine') return { mark, why: learned?.by === 'learned' ? 'learned, then edited by you on the Learned skills page' : 'added by hand on the Learned skills page' };
    if (mark === 'ai') return { mark, why: 'learned from your conversations by Learned skills\' reading model' };
    return { mark: 'unsorted', why: 'Learned skills has no record of it' };
  }
  if (provider === RUNTIME_PROVIDER) {
    // Only plugin code registers a skill while it runs; a Plus add-on's own files name it.
    if (plusNames.has(name)) return { mark: 'plus', why: `registered by the Plus add-on ${plusNames.get(name)}`, from: plusNames.get(name) };
    return { mark: 'downloaded', why: 'registered by a plugin\'s code' };
  }
  if (path && inPluginPackage(path)) return { mark: 'downloaded', why: 'inside a plugin\'s package' };
  if (path && insideOtherApp(path, appContents)) return { mark: 'downloaded', why: 'inside another app\'s package' };
  if (provider && provider !== FILE_PROVIDER) return { mark: 'downloaded', why: `served by the plugin provider "${provider}"` };
  // A skill file in a project's or your own skills folder: a door's stamp says who wrote it.
  if (stamp && (stamp.mark === 'ai' || stamp.mark === 'mine')) {
    return { mark: stamp.mark, why: stamp.mark === 'ai' ? `written by a model${stamp.model ? ` (${stamp.model})` : ''} through ${stamp.door === 'tuner' ? 'Tuner Plus' : 'its file tools'}` : 'written by you' };
  }
  // Plus add-ons ship no skill files; one inside a Plus folder with no stamp is theirs.
  if (path && plusFolder && within(path, plusFolder)) return { mark: 'plus', why: 'inside a Plus add-on\'s folder' };
  return { mark: 'unsorted', why: 'no record of where it came from' };
}
