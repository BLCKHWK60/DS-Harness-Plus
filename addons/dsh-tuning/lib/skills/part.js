/**
 * The skills part of Tuner Plus (the owner's prompt "Tuner Plus: build prompt for adding skills", step 4:
 * the record and the marks). A part of its own with its own switch: while it is off, nothing here runs,
 * writes or asks, and Tuner Plus is what it was before.
 *
 * It lists every skill the app can see (the default folder, the folders of the threads Tuner Plus
 * may read, never Recon's, and the projects where a door stamped a skill), gives each its mark by code
 * (lib/skills/marks.js), keeps the record in Tuner Plus's own folder (`skills/records.jsonl`,
 * lib/skills/records.js), makes the app ask the owner before a model's file tools write a skill and stamps
 * it when written, refuses model writes into its own folder and into Learned skills' data, and lets the
 * owner sort the skills nobody can place.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRITE_TOOLS, inFolder, inReconRoom, nameInFile, physical, skillOf, writeDecision } from './doors.js';
import { MARKS, MARK_NAMES, MARK_RULES, within, markOf } from './marks.js';
import { fingerprint, hashOf, indexRecords, keyOf, openRecords } from './records.js';
import { hiddenBehind, projectOf, rootsFor, sameSkill, scanRoot } from './shadows.js';
import { contentProblem, inDefault, nameProblem, preflight, skillFileText, targetFor, writeSkillFile } from './writer.js';
import { catalogDescription, examSkill, examSummary, examWhy, loadSetKey, textPrint } from './exam.js';
import { draftPrompt, evidenceOf, ideasFrom, parseDraft, pluginsOfSkill } from './ideas.js';
import { CHECK_MAX, IMPROVE_MAX, RUNNABLE, RUN_TYPES, WHAT_MAX, healthLine, newSkillPrompt, skillsRunSentence } from './bar.js';
import { UNUSED_DAYS, listCost, roomOf, tallyUses, usesIn } from './health.js';
import { changesBetween, howToChange, improvePrompt, mergePrompt, parseImprove, parseSplit, rewriteSkillText, splitPrompt } from './care.js';
import { jsonObjectsIn } from './exam.js';
import { TEACH_LOADS, TEACH_ROWS, rowsWithoutTaught, runsBySkill, teachable } from './graduate.js';
import { mask } from '../mask.js';
import { readJson, writeJson } from '../store.js';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

/** The app's Contents folder (…/DeepSeek Harness.app/Contents), where its own skills live. */
export const APP_CONTENTS = resolve(dirname(process.execPath), '..');
/** The Plus add-ons' folder: the one this add-on sits in. */
export const PLUS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/**
 * The app's default workspace: the Host's fixed folder under the account's Documents folder
 * (dsh-api-workspace-controller, `<Documents>/deepseek-harness/default-workspace`). The working-folder service's
 * own default is the folder the app's host process started in (on the owner's Mac `~/.dsh/profiles/desktop`), not this.
 */
export const DEFAULT_WORKSPACE = join(homedir(), 'Documents', 'deepseek-harness', 'default-workspace');
/** How much of a skill folder its fingerprint reads (files, bytes). */
const PRINT_FILES = 300;
const PRINT_BYTES = 4_000_000;

/** The place a skill's records hang on: its folder (or its one .md file), or the provider that serves it. */
export function placeOf(skill) {
  const path = String(skill?.path ?? '');
  if (!path) return `provider:${String(skill?.provider ?? '')}`;
  return physical(basename(path).toLowerCase() === 'skill.md' ? dirname(path) : path);
}

/**
 * The fingerprint of a skill on disk: its one .md file, or every file in its folder (scripts too), so a
 * change anywhere in it shows as Changed.
 * @param {string} where - the skill's folder or file.
 * @returns {string} the fingerprint ('' when it cannot be read).
 */
export function folderPrint(where) {
  try {
    if (!statSync(where).isDirectory()) return fingerprint(readFileSync(where));
  } catch {
    return '';
  }
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 4 || files.length >= PRINT_FILES) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= PRINT_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk(where, 0);
  let bytes = 0;
  const parts = [];
  for (const file of files) {
    try {
      const body = readFileSync(file);
      bytes += body.length;
      if (bytes > PRINT_BYTES) break;
      parts.push(`${relative(where, file)}\u0000${body.toString('base64')}`);
    } catch { /* unreadable: left out */ }
  }
  return fingerprint(parts.join('\u0001'));
}

/**
 * The names each Plus add-on gives its skills in its own files: a `name: 'x'` in skills.js or index.js
 * that belongs to a skill object (with a description and a `content` text; tools have no `content`).
 * @param {string} folder - the Plus add-ons' folder.
 * @param {string[]} names - the names to look for.
 * @returns {Map<string, string>} skill name → the add-on that names it (only names found in exactly one).
 */
export function plusNamesIn(folder, names) {
  const wanted = new Set(names);
  const found = new Map();
  if (wanted.size === 0) return found;
  let entries = [];
  try {
    entries = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('dsh-'));
  } catch {
    return found;
  }
  for (const entry of entries) {
    for (const file of ['skills.js', 'index.js']) {
      let text = '';
      try {
        text = readFileSync(join(folder, entry.name, file), 'utf8');
      } catch {
        continue;
      }
      const matches = [...text.matchAll(/\bname:\s*['"]([a-z0-9]+(?:-[a-z0-9]+)*)['"]/g)];
      matches.forEach((match, index) => {
        if (!wanted.has(match[1])) return;
        const end = matches[index + 1]?.index ?? Math.min(text.length, match.index + 6000);
        const object = text.slice(match.index, end);
        if (!/\bdescription\s*:/.test(object) || !/\bcontent\s*:/.test(object)) return;
        const had = found.get(match[1]);
        found.set(match[1], had && had !== entry.name ? '' : entry.name);
      });
    }
  }
  for (const [name, addon] of found) if (!addon) found.delete(name);
  return found;
}

/**
 * The folders to list skills from, in this order: the default folder; the project of every skill a door
 * stamped; each readable thread's folder, and its own folder inside it (a Scratch thread
 * works in <its folder>/<its id>, while the index names the shared Scratch folder). Recon's rooms never.
 * @param {{usual?: string, read?: object[], stamped?: string[]}} where
 * @returns {string[]} absolute folders, each once (at most 80).
 */
export function foldersToList({ usual = '', read = [], stamped = [] }) {
  const folders = new Set();
  const add = (path) => {
    if (typeof path === 'string' && isAbsolute(path) && !inReconRoom(path)) folders.add(resolve(path));
  };
  add(usual);
  for (const where of stamped) {
    const match = /^(.*)\/\.(?:dsh|agents)\/skills\/[^/]+$/i.exec(String(where ?? ''));
    if (match && match[1]) add(match[1]);
  }
  for (const record of read) {
    const cwd = record?.header?.cwd;
    const id = String(record?.header?.id ?? '');
    add(cwd);
    if (typeof cwd === 'string' && /^[\w.-]{1,120}$/.test(id)) {
      try {
        if (statSync(join(cwd, id)).isDirectory()) add(join(cwd, id));
      } catch { /* no folder of its own */ }
    }
  }
  return [...folders].slice(0, 80);
}

/** The place part of a record key (`name|place`). */
const placeInKey = (key) => String(key).split('|').slice(1).join('|');

/**
 * @param {object} deps
 * @param {object} deps.ctx - the plugin context.
 * @param {object} deps.store - Tuner Plus's store (its folder, its state).
 * @param {() => boolean} deps.on - whether Tuner Plus and its skills part are switched on.
 * @param {() => number} deps.now
 * @param {(text: string) => void} deps.warn
 * @param {(card: object) => object} deps.addCard - a card on Tuner Plus's page.
 * @param {(key: string) => boolean} deps.hasCard - whether a card with that key is there already (done or not).
 * @param {() => Promise<object>} deps.readable - the threads Tuner Plus may read (never Recon's).
 * @param {() => boolean} [deps.liveWithoutExam] - whether a draft the owner typed may go live before it has an exam (his choice).
 * @param {object} [deps.standIns] - for tests: `listSkills`, `learnedFile`, `plusFolder`, `appContents`, `dshHome`, `defaultFolder`.
 */
export function openSkills({ ctx, store, on, now = () => Date.now(), warn = () => {}, addCard, hasCard = () => false, readable, liveWithoutExam = () => false, exam: examDeps, standIns = {} }) {
  const appContents = standIns.appContents ?? APP_CONTENTS;
  const plusFolder = standIns.plusFolder ?? PLUS_FOLDER;
  const home = ctx.get('dshHomePath');
  const dshHome = () => standIns.dshHome ?? (typeof home === 'function' ? String(home('') ?? '') : '');
  const learnedFile = () => standIns.learnedFile ?? (typeof home === 'function' ? home('skill-architect', 'library.json') : '');
  const records = () => openRecords({
    file: join(store.folder('skills'), 'records.jsonl'),
    readSeal: () => String(store.state().skillsSeal ?? ''),
    writeSeal: (seal) => store.setState({ skillsSeal: seal }),
    isBroken: () => store.state().skillsBroken === true,
    markBroken: () => {
      if (store.state().skillsBroken !== true) store.setState({ skillsBroken: true });
    },
    now,
  });
  /** Folders a model's file tools may not write into: the record, and Learned skills' data (its list decides marks). */
  const closed = () => [
    { folder: store.where(), reason: 'Tuner Plus keeps its records of where each skill came from in that folder; a model may not write there.' },
    { folder: learnedFile() ? dirname(learnedFile()) : '', reason: 'Learned skills keeps its list of skills there, which says who made each one; a model may not write it.' },
  ].filter((one) => one.folder && isAbsolute(one.folder));

  /** The skills hidden behind another of the same name, from the last listing (each with `places`: the project and the winner there). */
  let lastHidden = [];
  /** The folders the last listing asked the app about, and what went wrong (a name check refuses then). */
  let lastListed = [];
  let listingProblem = '';
  const agentsHome = () => standIns.agentsHome ?? (process.env.DSH_AGENTS_HOME?.trim() ? process.env.DSH_AGENTS_HOME : join(homedir(), '.agents'));
  /**
   * Every skill the app can see, once each: from the default folder, stamped projects and the readable
   * threads' folders. On the way, the skills hidden behind another of the same name in each project.
   */
  const listSkills = standIns.listSkills ?? (async () => {
    const skills = ctx.get('skills');
    lastHidden = [];
    listingProblem = '';
    if (!skills?.list) {
      listingProblem = 'The app\'s list of skills is not available.';
      return [];
    }
    // The skills the app serves from elsewhere than a skills folder (its own, plugins', Plus's, Learned skills').
    let served = [];
    try {
      served = (await skills.list({})) ?? [];
    } catch {
      served = [];
      listingProblem = 'The app\'s own skills could not be listed.';
    }
    const hidden = new Map();
    let read = [];
    try {
      read = (await readable()).read ?? [];
    } catch { /* only the default folder */ }
    const stamped = records().read().events.filter((event) => event.kind === 'stamp').map((event) => event.where);
    const folders = foldersToList({ usual: ctx.get('workingDirectory')?.defaultDirectory, read, stamped });
    lastListed = folders;
    let lease;
    try {
      lease = await ctx.get('agentPresets')?.acquireScope?.(undefined);
    } catch {
      lease = undefined;
    }
    const seen = new Map();
    try {
      for (const cwd of folders) {
        let list = [];
        try {
          list = await skills.list({ cwd, scope: lease?.key });
        } catch {
          listingProblem = `The skills of ${cwd} could not be listed.`;
          continue;
        }
        // What the app gives the model here, and what that hides: the same name in another place.
        const winners = new Map((list ?? []).filter((skill) => skill?.name).map((skill) => [skill.name, { name: skill.name, provider: String(skill.provider ?? ''), path: typeof skill.path === 'string' ? skill.path : '' }]));
        const project = projectOf(cwd);
        const files = rootsFor(project, { dshHome: dshHome(), agentsHome: agentsHome() }).flatMap((root) => scanRoot(root.path).map((one) => ({ ...one, provider: 'filesystem' })));
        for (const one of hiddenBehind({ winners, candidates: [...files, ...served.map((skill) => ({ name: skill.name, description: String(skill.description ?? ''), provider: String(skill.provider ?? ''), path: typeof skill.path === 'string' ? skill.path : '' }))] })) {
          if (one.path && inReconRoom(one.path)) continue;
          const id = `${one.provider}|${one.path}|${one.name}`;
          const had = hidden.get(id);
          // Hidden in each project behind that project's own winner.
          if (had) {
            if (!had.places.some((place) => place.project === project)) had.places.push({ project, by: one.hiddenBy });
            continue;
          }
          let content = '';
          let base = '';
          if (!one.path) {
            try {
              const full = await skills.get(one.name, {});
              content = full?.content ?? '';
              base = typeof full?.resourceBase?.path === 'string' ? full.resourceBase.path : '';
            } catch {
              content = '';
            }
          }
          hidden.set(id, { ...one, content, base, cwd, places: [{ project, by: one.hiddenBy }] });
        }
        for (const skill of list ?? []) {
          const path = typeof skill?.path === 'string' ? skill.path : '';
          const id = `${skill?.provider}|${path}|${skill?.name}`;
          if (!skill?.name || seen.has(id) || (path && inReconRoom(path))) continue;
          let content = '';
          let base = '';
          let unread = false;
          if (!path || within(path, appContents)) {
            try {
              const full = await skills.get(skill.name, { cwd, scope: lease?.key });
              content = full?.content ?? '';
              base = typeof full?.resourceBase?.path === 'string' ? full.resourceBase.path : '';
            } catch {
              content = '';
              unread = true;
            }
          }
          seen.set(id, { name: String(skill.name), description: String(skill.description ?? ''), provider: String(skill.provider ?? ''), source: String(skill.source ?? ''), path, base, content, cwd, ...(unread ? { unread: true } : {}) });
        }
      }
    } finally {
      await lease?.[Symbol.asyncDispose]?.();
    }
    lastHidden = [...hidden.values()];
    return [...seen.values()];
  });
  /** The skills hidden behind another of the same name (from the listing just made). */
  const listHidden = standIns.listHidden ?? (async () => lastHidden);

  /** A skill's fingerprint: its file or folder as it is on disk, or what the app serves. */
  const printOf = (skill, where) => {
    const path = String(skill?.path ?? '');
    if (path && !within(path, appContents)) {
      const print = folderPrint(where);
      if (print) return print;
    }
    return fingerprint(`${skill?.description ?? ''}\n${skill?.content ?? ''}`);
  };
  const readLearned = () => {
    try {
      const file = learnedFile();
      const table = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      return table && typeof table === 'object' && !Array.isArray(table) ? table : {};
    } catch {
      return {};
    }
  };

  let last = { keys: new Set(), fps: new Map(), folders: [], names: new Set(), projects: [], skills: new Map(), marks: new Map(), catalog: [], at: 0 };
  /**
   * The default workspace, where Tuner Plus never writes: the app's own, and the working-folder service's
   * default when that is a real working folder (never `/` or the home folder or above, which would close every
   * project).
   */
  const defaultFolders = () => {
    if (standIns.defaultFolder !== undefined) return [].concat(standIns.defaultFolder).filter((one) => typeof one === 'string' && isAbsolute(one));
    const service = String(ctx.get('workingDirectory')?.defaultDirectory ?? '');
    const usable = isAbsolute(service) && resolve(service) !== '/' && !inFolder(homedir(), service);
    return [DEFAULT_WORKSPACE, ...(usable ? [service] : [])];
  };
  /**
   * List every skill and give it its mark; skills seen for the first time are recorded (the first sorting).
   * @returns {Promise<object>} what the page shows.
   */
  // One look at a time (the page, another add-on's page and a run may all ask at once): each waits for the
  // one before it, so records are never written twice for the same skill (the review of step 13).
  let syncQueue = Promise.resolve();
  const sync = () => {
    const run = syncQueue.catch(() => {}).then(() => syncNow());
    syncQueue = run;
    return run;
  };
  const syncNow = async () => {
    if (!on()) return { on: false };
    const shown = await listSkills();
    const hiddenList = await listHidden();
    // Every skill once: the ones the app gives the model somewhere, and the ones hidden everywhere they are.
    const list = [...shown.map((skill) => ({ ...skill, hiddenIn: [] }))];
    for (const one of hiddenList) {
      const same = list.find((skill) => skill.name === one.name && sameSkill(skill, one));
      const where = (one.places ?? []).map(({ project, by }) => ({ project, by }));
      if (same) same.hiddenIn.push(...where);
      else list.push({ ...one, description: String(one.description ?? ''), hiddenIn: where });
    }
    const book = records();
    const read = book.read();
    const index = indexRecords(read);
    const learned = readLearned();
    const plusNames = plusNamesIn(plusFolder, list.filter((skill) => skill.provider === 'runtime').map((skill) => skill.name));
    const placed = list.map((skill) => {
      const where = placeOf(skill);
      return { skill, where, fp: printOf(skill, where) };
    });
    const present = new Set(placed.map(({ skill, where }) => keyOf(skill.name, where)));
    const fresh = [];
    const rows = placed.map(({ skill, where, fp }) => {
      const key = keyOf(skill.name, where);
      const entry = skill.provider === 'learned-skills' ? learned[skill.name] : undefined;
      let record = index.get(key);
      if (!record?.first) {
        // A skill that moved or was renamed: its record follows its fingerprint, only from one place that
        // is really gone from the disk (not merely unlisted), and only for a skill with no record of its own.
        const candidates = where.startsWith('provider:') ? [] : [...index.entries()].filter(([other, one]) => {
          const place = placeInKey(other);
          return other !== key && !present.has(other) && one.fps.has(fp) && !place.startsWith('provider:') && !existsSync(place);
        });
        const moved = candidates.length === 1 ? candidates[0] : undefined;
        if (moved) record = moved[1];
        fresh.push({ kind: 'seen', key, name: skill.name, where, fp, ...(moved ? { from: moved[0] } : {}), ...(entry ? { by: entry.by === 'learned' ? 'learned' : 'hand' } : {}) });
      }
      // Who made a learned skill is taken as it was first seen: a later change to that file proves nothing.
      const firstBy = record?.first?.by ?? fresh.find((event) => event.key === key)?.by;
      const given = markOf(skill, {
        appContents,
        plusFolder,
        plusNames,
        learned: entry ? { ...entry, by: firstBy ?? entry.by } : undefined,
        stamp: record?.stamp,
        resorted: record?.sorted,
      });
      // The text it had when it last arrived: first seen, stamped by a door, or sorted by the owner (the newest).
      const arrivals = [record?.first, record?.stamp, record?.sorted].filter((one) => one?.fp).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
      const arrival = arrivals.at(-1)?.fp;
      return {
        key,
        name: skill.name,
        description: skill.description.slice(0, 300),
        provider: skill.provider,
        path: skill.path,
        where,
        fp,
        mark: given.mark,
        markName: MARK_NAMES[given.mark],
        why: given.why,
        from: given.from ?? '',
        changed: Boolean(arrival && arrival !== fp),
        // Built from outside material the owner pointed at: its source, as the door stamped it.
        outside: typeof record?.stamp?.outside === 'string' ? record.stamp.outside : '',
        treatAs: given.mark === 'unsorted' ? 'downloaded' : given.mark,
        firstSeen: record?.first?.at ?? now(),
        // Where the app hides it behind another skill of the same name, and which one.
        hiddenIn: (skill.hiddenIn ?? []).map(({ project, by }) => ({ project, byName: by?.name ?? '', byPlace: by?.path ? placeOf(by) : `provider:${by?.provider ?? ''}` })),
        // How many other skills (each counted once, wherever it is hidden) this one hides.
        hides: list.filter((other) => other !== skill && (other.hiddenIn ?? []).some(({ by }) => by && by.name === skill.name && sameSkill(by, skill))).length,
      };
    });
    if (fresh.length > 0) {
      for (const event of fresh) event.mark = rows.find((row) => row.key === event.key)?.mark;
      book.add(fresh);
    }
    // The projects a new skill can go to: those of the folders the skills were listed from (never the
    // default workspace, never a Recon room), each once.
    const projects = [];
    for (const cwd of [...lastListed, ...list.map((skill) => skill.cwd)].filter((one) => typeof one === 'string' && isAbsolute(one))) {
      const top = projectOf(cwd);
      if (inReconRoom(top) || inDefault(top, defaultFolders()) || projects.some((one) => one.path === top)) continue;
      projects.push({ path: top, name: basename(top), git: existsSync(join(top, '.git')) });
    }
    // Every skill by its key (with its whole description, for the exam), and the list the model gets.
    const byKey = new Map(placed.map(({ skill, where }) => [keyOf(skill.name, where), skill]));
    last = {
      keys: present,
      skills: byKey,
      marks: new Map(rows.map((row) => [row.key, row.mark])),
      // The plugins that bring a skill of their own (a Plus add-on's, or a plugin's folder on the skill's path).
      plugins: new Set(rows.flatMap((row) => pluginsOfSkill({ from: row.from, path: row.path }))),
      // Every name once, as the model sees it: the skill the app gives where one is never hidden, else the first.
      catalog: [...rows.reduce((names, row) => {
        const had = names.get(row.name);
        if (!had || (had.hiddenIn.length > 0 && row.hiddenIn.length === 0)) names.set(row.name, row);
        return names;
      }, new Map()).values()].map((row) => ({ name: row.name, description: String(byKey.get(row.key)?.description ?? '') })),
      fps: new Map(rows.map((row) => [row.key, row.fp])),
      folders: rows.filter((row) => !row.where.startsWith('provider:') && !within(row.where, appContents)).map((row) => row.where),
      names: new Set(rows.map((row) => row.name)),
      projects: projects.slice(0, 40),
      at: now(),
    };
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const counts = Object.fromEntries(MARKS.map((mark) => [mark, rows.filter((row) => row.mark === mark).length]));
    counts.shared = new Set(rows.filter((row) => row.hiddenIn.length > 0 || row.hides > 0).map((row) => row.name)).size;
    const unsorted = rows.filter((row) => row.mark === 'unsorted');
    const cardKey = `skills-unsorted-${hashOf(unsorted.map((row) => row.key).sort().join('\n')).slice(0, 16)}`;
    // Asked once for each new set of skills nobody can place ("Not now" and "Do not suggest this again" hold).
    if (unsorted.length > 0 && !hasCard(cardKey)) {
      addCard?.({
        kind: 'skills',
        key: cardKey,
        title: `${unsorted.length} skill${unsorted.length === 1 ? ' is' : 's are'} not sorted`,
        text: `Nobody can show where ${unsorted.length === 1 ? 'it' : 'they'} came from: ${unsorted.slice(0, 8).map((row) => row.name).join(', ')}${unsorted.length > 8 ? '…' : ''}. Until you sort ${unsorted.length === 1 ? 'it' : 'them'}, Tuner Plus treats ${unsorted.length === 1 ? 'it' : 'them'} as Downloaded. Sort them under Skills on this page.`,
        buttons: ['later', 'never'],
      });
    }
    // Looking after the skills (step 10): its uses, the room it takes, its last check, how it may change.
    const tally = tallyUses(Object.values(readHealth().sessions ?? {}));
    const checks = readChecks();
    const fpByKey = new Map(rows.map((row) => [row.key, row.fp]));
    for (const row of rows) {
      const uses = tally.get(row.name);
      const skill = byKey.get(row.key);
      row.health = { loads: uses?.loads ?? 0, well: uses?.well ?? 0, owner: uses?.owner ?? 0, last: uses?.last ?? 0, room: roomOf(row.name, String(skill?.description ?? row.description)), check: checks[row.key] ?? null };
      const change = howToChange({ row: { name: row.name, mark: row.mark, path: row.path, provider: row.provider }, dshHome: dshHome(), agentsHome: agentsHome(), appContents, defaultFolders: defaultFolders() });
      row.change = { how: change.how, why: change.why };
      const copyOf = index.get(row.key)?.stamp?.copyOf;
      // An original the app does not show beside the copy (an app skill served from inside it) cannot be compared here.
      row.copyOf = copyOf?.name ? { name: copyOf.name, where: copyOf.where, seen: fpByKey.has(copyOf.key) } : null;
      row.behind = Boolean(copyOf?.key && fpByKey.get(copyOf.key) && fpByKey.get(copyOf.key) !== copyOf.fp);
      // Your copy is behind its original: told once for each change of the original, with what changed.
      if (row.behind) {
        const cardKey = `skill-behind-${hashOf(`${row.key}|${fpByKey.get(copyOf.key)}`).slice(0, 16)}`;
        if (!hasCard(cardKey)) {
          const snapshot = readJson(join(originalsDir(), `${hashOf(row.key).slice(0, 24)}.json`), null);
          const changes = changesBetween(snapshot?.text ?? '', mask(textOfSkill(byKey.get(copyOf.key))).text);
          addCard?.({ kind: 'skill-behind', key: cardKey, title: `Your copy "${row.name}" is behind its original`, text: `The original changed after your copy was made (${changes.gone} line${changes.gone === 1 ? '' : 's'} gone, ${changes.added} new):\n${changes.lines.join('\n') || '(only spacing)'}\nYour copy is unchanged, and the model still gets it. Improve the copy again, or retire it to go back to the original.`, buttons: ['later', 'never'] });
        }
      }
    }
    // The check after an update (step 11): only on a complete list.
    if (!listingProblem) {
      try {
        checkAfterUpdate(rows, byKey);
      } catch (error) {
        // Never the whole list's problem: the check waits for the next look.
        warn(`the check after an update could not be made: ${String(error?.message ?? error).slice(0, 200)}`);
      }
    }
    const view = rows.map(({ fp: _fp, where: _where, ...row }) => row);
    const health = readHealth();
    const tabs = [...new Set(Object.values(health.sessions ?? {}).map((one) => one.mode || 'other'))].sort();
    return { on: true, intact: read.intact, rows: view, counts, marks: MARK_NAMES, rules: MARK_RULES, at: last.at, drafts: drafts(), projects: last.projects, defaultFolder: defaultFolders()[0] ?? '', liveWithoutExam: liveWithoutExam(), retired: retiredList(), cost: listCost(last.catalog, tally, tabs), healthAt: health.at ?? 0, healthCounted: Object.keys(health.sessions ?? {}).length, taught: taughtList(), teach: { loads: TEACH_LOADS, rows: TEACH_ROWS }, tabConversations: Object.fromEntries(tabs.map((tab) => [tab, Object.values(health.sessions ?? {}).filter((one) => (one.mode || 'other') === tab).length])) };
  };

  // ---- new skills: drafts first, live only after the exam and your yes -------------------------------

  const draftsDir = () => store.folder('skills', 'drafts');
  const draftFile = (id) => {
    if (!/^D[a-z0-9]{6,24}$/.test(String(id))) throw new Error('There is no such draft.');
    return join(draftsDir(), `${id}.json`);
  };
  /** @returns {object[]} the drafts waiting (newest first). */
  const drafts = () => {
    let names = [];
    try {
      names = readdirSync(draftsDir()).filter((one) => /^D[a-z0-9]{6,24}\.json$/.test(one));
    } catch {
      return [];
    }
    return names.map((one) => readJson(join(draftsDir(), one), null)).filter((one) => one?.status === 'draft').sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 100);
  };
  /** Every name a skill already has anywhere: the app's skills (hidden ones too), Learned skills', drafts waiting, and what is in the target folder. */
  const namesTaken = async (root, exceptDraft = '') => {
    await sync();
    // Unless every skill could be read, nobody can say the name is free.
    if (listingProblem) throw new Error(`${listingProblem} So Tuner Plus cannot be sure the name is free; try again in a moment.`);
    const names = new Set(last.names);
    // Learned skills' names, deleted ones too: a deleted learned skill can be put back.
    for (const [name, entry] of Object.entries(readLearned())) if (entry) names.add(name);
    for (const one of drafts()) if (one.id !== exceptDraft) names.add(one.name);
    if (root) for (const one of scanRoot(root)) names.add(one.name);
    return names;
  };
  /**
   * A new skill, kept as a draft in Tuner Plus's own folder (where the app does not load it).
   * @param {{name: string, description: string, text: string, scope: string, project?: string, by?: 'owner'|'model', model?: string}} want
   * @returns {Promise<object>} the draft.
   */
  /** One draft or going live at a time (a double click makes one draft, not two). */
  let queue = Promise.resolve();
  const oneAtATime = (work) => {
    const run = queue.then(work, work);
    queue = run.catch(() => {});
    return run;
  };
  const draft = (want) => oneAtATime(() => makeDraft(want));
  /** Where a draft came from: a skill idea's card, or a thread (and the outside material the owner pointed at). */
  const originOf = (value) => {
    if (!value || typeof value !== 'object' || !['chat', 'idea', 'bar', 'improve', 'merge', 'split'].includes(value.kind)) return null;
    const clean = (text, size) => mask(String(text ?? '')).text.replace(/\s+/g, ' ').trim().slice(0, size);
    // A thread's id is kept as it is when it looks like one (the masking would take a long id for a key).
    const session = String(value.session ?? '');
    return { kind: value.kind, title: clean(value.title, 200), session: /^[\w.:-]{1,120}$/.test(session) ? session : '', source: clean(value.source, 500), ...(value.night === true ? { night: true } : {}) };
  };
  const makeDraft = async ({ name, description, text, scope, project = '', by = 'owner', model = '', origin, run, replaces, retires = [] }) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    // While a run lasts, only its own new draft (the boundary; the review of step 9).
    const outside = run && run === skillsRun ? '' : scopeRefusal(String(name ?? '').trim());
    if (outside) throw new Error(outside);
    const value = String(name ?? '').trim();
    const content = contentProblem({ description, text });
    if (content) throw new Error(content);
    if (scope === 'project') {
      // Only a project the page offered (the folders the skills were listed from), never any path sent in.
      await sync();
      const top = projectOf(String(project ?? ''));
      if (!last.projects.some((one) => inFolder(one.path, top) && inFolder(top, one.path))) throw new Error('Pick one of the projects offered.');
    }
    let target;
    if (replaces) {
      // A change keeps the skill's name; a copy goes into a folder that wins, where nothing of that name is yet.
      if (value !== replaces.name) throw new Error('A change keeps the skill\'s name.');
      if (replaces.how === 'in-place') target = { root: replaces.root, file: replaces.path, git: false };
      else {
        target = { root: replaces.root, folder: join(replaces.root, value), file: join(replaces.root, value, 'SKILL.md'), git: replaces.scope === 'project' && existsSync(join(replaces.project, '.git')) };
        const problem = preflight(target);
        if (problem) throw new Error(problem);
      }
    } else {
      target = targetFor({ name: value, scope, project: String(project ?? ''), dshHome: dshHome(), defaultFolder: defaultFolders(), agentsHome: agentsHome() });
      if (target.problem) throw new Error(target.problem);
      const problem = nameProblem(value, await namesTaken(target.root)) || preflight(target);
      if (problem) throw new Error(problem);
    }
    const written = skillFileText({ name: value, description, text });
    if (written.unsure) throw new Error('The text may hold a password or key that the masking could not judge. Take it out and save again.');
    const id = `D${now().toString(36)}${randomBytes(3).toString('hex')}`;
    const from = originOf(origin);
    const entry = { id, name: value, description: written.description, text: written.body, scope, project: scope === 'project' ? projectOf(String(project)) : '', file: target.file, git: target.git, by: by === 'model' ? 'model' : 'owner', model: String(model ?? '').slice(0, 200), masked: written.masked, exam: null, status: 'draft', at: now(), origin: from, outside: from?.source ?? '', ...(replaces ? { replaces, retires: retires.map((one) => ({ key: String(one?.key ?? one), fp: String(one?.fp ?? '') })).slice(0, 5) } : {}) };
    writeJson(draftFile(id), entry, store.root());
    return entry;
  };
  /**
   * Put a draft live: only once it passed its exam (step 7), or, for one you typed yourself, when you
   * allowed that; the name and place are checked again, the file is written, and the door stamps it.
   * @returns {Promise<object>} what was written.
   */
  const goLive = (id) => oneAtATime(() => putLive(id));
  const putLive = async (id) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const entry = readJson(draftFile(id), null);
    if (!entry || entry.status !== 'draft') throw new Error('There is no such draft.');
    const outside = scopeRefusal(entry.name);
    if (outside) throw new Error(outside);
    // Its exam must be of this very text (a draft is never changed, but a file changed by hand is caught here).
    // A failed exam of this text stops it always; only a draft without one may go live by your own allowance.
    const print = textPrint(entry.name, entry.description, entry.text);
    const examined = Boolean(entry.exam) && entry.exam.fp === print;
    if (examined && entry.exam.passed !== true) throw new Error('This draft did not pass its exam, so it does not go live.');
    if (!examined && !(entry.by === 'owner' && liveWithoutExam())) throw new Error('This draft waits for its exam: run it first; no skill goes live before it.');
    // You see it first: its whole text was shown to you on its card, this very text.
    if (entry.shown !== print) throw new Error('Show its whole text first (Show its text on its card): no skill goes live before you have seen it.');
    if (entry.replaces) return putChange(entry, id);
    const target = targetFor({ name: entry.name, scope: entry.scope, project: entry.project, dshHome: dshHome(), defaultFolder: defaultFolders(), agentsHome: agentsHome() });
    if (target.problem) throw new Error(target.problem);
    const problem = nameProblem(entry.name, await namesTaken(target.root, entry.id));
    if (problem) throw new Error(problem);
    const file = writeSkillFile({ ...target, text: skillFileText(entry).text });
    const where = placeOf({ path: file });
    const added = records().add({ kind: 'stamp', key: keyOf(entry.name, where), name: entry.name, where, fp: folderPrint(where), mark: entry.by === 'owner' ? 'mine' : 'ai', door: 'tuner', model: entry.by === 'model' ? entry.model : '', ...(entry.outside ? { outside: String(entry.outside) } : {}) });
    if (added === 0) warn('the record is broken, so the new skill was written but not stamped (it shows Not sorted)');
    writeJson(draftFile(id), { ...entry, status: 'live', file, liveAt: now() }, store.root());
    return { name: entry.name, file, git: target.git };
  };
  // ---- the check after an update (step 11) --------------------------------------------------------------

  const baselineFile = () => join(store.folder('skills'), 'baseline.json');
  /** The app's version, from its own Info.plist. */
  const appVersion = () => {
    if (standIns.appVersion !== undefined) return String(standIns.appVersion);
    try {
      return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(readFileSync(join(appContents, 'Info.plist'), 'utf8'))?.[1] ?? '';
    } catch {
      return '';
    }
  };
  /** Each Plus add-on's version, from its own package.json. */
  const plusVersions = () => {
    const out = {};
    try {
      for (const name of readdirSync(plusFolder).sort().slice(0, 200)) {
        try {
          const version = JSON.parse(readFileSync(join(plusFolder, name, 'package.json'), 'utf8')).version;
          if (version) out[name] = String(version);
        } catch { /* not an add-on */ }
      }
    } catch { /* no Plus folder */ }
    return out;
  };
  /** The skills an update brings or changes: those that came with the app, a download or Plus (and the unsorted, treated as Downloaded). */
  const WATCHED = new Set(['default', 'downloaded', 'plus', 'unsorted']);
  /**
   * After the app, a Plus add-on or a plugin was updated (or a skill of theirs changed or went away): one card
   * with the skills changed, gone, new and now clashing, and your copies now behind; its button runs the
   * loading check again on them (look only). The marks hold: they come from where each skill lives.
   */
  const checkAfterUpdate = (rows, byKey = new Map()) => {
    const versions = { app: appVersion(), plus: plusVersions() };
    // Only the places an update can touch: the app's own skills, Plus's and the providers', and the shared
    // folders at home. A project's folders come and go with its threads, so they are never news here.
    // (Places are kept with links resolved, so the folders are compared the same way.)
    const homes = [join(dshHome(), 'skills'), join(agentsHome(), 'skills'), appContents, plusFolder].filter((one) => isAbsolute(one)).flatMap((one) => [one, physical(one)]);
    const updatable = (where) => where.startsWith('provider:') || homes.some((home) => within(where, home));
    const base = readJson(baselineFile(), null);
    const baseSkills = base && base.skills && typeof base.skills === 'object' && !Array.isArray(base.skills) ? base.skills : null;
    const skillsNow = {};
    for (const row of rows) {
      if (!updatable(row.where)) continue;
      const was = baseSkills?.[row.key];
      // A skill the app could not hand over this time keeps the print it had (a failed read is no change).
      const fp = byKey.get(row.key)?.unread && was?.fp ? was.fp : row.fp;
      skillsNow[row.key] = { name: row.name, fp, mark: row.mark, clash: (row.hiddenIn ?? []).length > 0 || row.hides > 0 };
    }
    // Gone only when its place is really gone (a folder deleted, or a provider's skill no longer served);
    // one merely not listed this time stays as it was.
    const reallyGone = (key) => {
      const place = placeInKey(key);
      return place.startsWith('provider:') || !existsSync(place);
    };
    const kept = Object.fromEntries(Object.entries(baseSkills ?? {}).filter(([key, was]) => !skillsNow[key] && was && typeof was === 'object' && updatable(placeInKey(key)) && !reallyGone(key)));
    const save = () => writeJson(baselineFile(), { ...versions, skills: { ...kept, ...skillsNow }, at: now() }, store.root());
    if (!baseSkills) return save();
    const appMoved = base.app !== versions.app;
    const plusMoved = Object.keys({ ...base.plus, ...versions.plus }).filter((name) => (base.plus ?? {})[name] !== versions.plus[name]);
    const moved = appMoved || plusMoved.length > 0;
    // A Not sorted skill may be your own hand-made one: its changes count only beside a version change.
    const watched = (mark) => WATCHED.has(mark) && (mark !== 'unsorted' || moved);
    // A skill hidden behind your own copy of it (Improve as a copy) is no news.
    const copied = new Set(rows.filter((row) => row.copyOf).map((row) => row.name));
    const changed = [];
    const added = [];
    const clash = [];
    for (const [key, one] of Object.entries(skillsNow)) {
      const was = baseSkills[key];
      if (!watched(one.mark)) continue;
      if (!was) added.push(key);
      else {
        if (was.fp !== one.fp) changed.push(key);
        if (one.clash && !was.clash && !copied.has(one.name)) clash.push(key);
      }
    }
    const gone = Object.entries(baseSkills).filter(([key, was]) => was && typeof was === 'object' && watched(was.mark) && !skillsNow[key] && updatable(placeInKey(key)) && reallyGone(key)).map(([, was]) => String(was.name ?? ''));
    const behind = rows.filter((row) => row.behind).map((row) => row.name);
    const unseen = appMoved ? rows.filter((row) => row.copyOf && row.copyOf.seen === false).map((row) => row.name) : [];
    const skillNews = changed.length + added.length + gone.length + clash.length + unseen.length;
    // A version change that touched no skill is noted in the baseline only (no card to read for nothing).
    if (skillNews === 0) return save();
    const nameOf = (key) => skillsNow[key]?.name ?? key;
    const lines = [
      appMoved ? `The app went from ${base.app || 'an earlier version'} to ${versions.app || 'a new version'}.` : '',
      plusMoved.length > 0 ? `Plus add-ons updated: ${plusMoved.slice(0, 8).map((name) => `${name} ${(base.plus ?? {})[name] ?? '(new)'} → ${versions.plus[name] ?? '(gone)'}`).join(', ')}.` : '',
      changed.length > 0 ? `Changed: ${changed.map(nameOf).join(', ')}.` : '',
      gone.length > 0 ? `Gone: ${gone.join(', ')}.` : '',
      added.length > 0 ? `New: ${added.map((key) => `${nameOf(key)} (${MARK_NAMES[skillsNow[key].mark] ?? skillsNow[key].mark})`).join(', ')}.` : '',
      clash.length > 0 ? `Now share a name with another skill: ${clash.map(nameOf).join(', ')}.` : '',
      behind.length > 0 ? `Your copies now behind their original: ${behind.join(', ')} (each has its own card).` : '',
      unseen.length > 0 ? `Your copies of app skills whose original is not shown here: ${unseen.join(', ')}; compare them by hand.` : '',
      'The marks hold: each comes from where the skill lives.',
    ].filter(Boolean);
    const check = [...new Set([...changed, ...added, ...clash])].slice(0, 60);
    const key = `skills-update-${hashOf(JSON.stringify({ versions, changed, added, gone, clash, unseen })).slice(0, 16)}`;
    const counts = [[changed.length, 'changed'], [gone.length, 'gone'], [added.length, 'new'], [clash.length, 'now sharing a name'], [unseen.length, `cop${unseen.length === 1 ? 'y' : 'ies'} to compare`]].filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`).join(', ');
    if (!hasCard(key)) addCard?.({ kind: 'skills-update', key, title: `After an update: ${counts}`, text: `${lines.join('\n')}${check.length > 0 ? '\n"Check them" runs the loading check again on the changed and new ones (look only).' : ''}`, check, buttons: check.length > 0 ? ['check', 'later', 'never'] : ['later'] });
    return save();
  };
  /** "Check them" on an update card: a Check run of those skills (look only). */
  const checkFromCard = async (cardId) => {
    const all = store.cards();
    const card = all.cards.find((one) => one.id === String(cardId) && one.kind === 'skills-update');
    if (!card || card.done) throw new Error('There is no such card (it may be done already).');
    const keys = (Array.isArray(card.check) ? card.check : []).filter((key) => last.skills.has(key));
    if (keys.length === 0) throw new Error('Those skills are not in the list any more.');
    const started = await startSkillsRun({ type: 'check', keys, by: 'page' });
    const fresh = store.cards();
    const same = fresh.cards.find((one) => one.id === card.id);
    if (same) {
      same.done = 'checking';
      store.saveCards(fresh);
    }
    return started;
  };

  // ---- looking after the skills (step 10): changes, copies, retiring ---------------------------------

  const versionsDir = () => store.folder('skills', 'versions');
  const originalsDir = () => store.folder('skills', 'originals');
  const retiredDir = () => store.folder('skills', 'retired');
  const checksFile = () => join(store.folder('skills'), 'checks.json');
  const readChecks = () => readJson(checksFile(), {});
  const healthFile = () => join(store.folder('skills'), 'health.json');
  const readHealth = () => readJson(healthFile(), { sessions: {}, at: 0 });
  /** Never through a link: the file and the folder it is in. */
  const noLinkOnTheWay = (path) => {
    for (const step of [dirname(path), path]) {
      try {
        if (lstatSync(step).isSymbolicLink()) throw new Error(`${step} is a link; Tuner Plus does not change skills through links.`);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  };
  /** Move a folder or file, also across disks (copy, then remove). */
  const move = (from, to) => {
    mkdirSync(dirname(to), { recursive: true });
    try {
      renameSync(from, to);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
      rmSync(from, { recursive: true, force: true });
    }
  };
  /** How the listed skill with this key may change. */
  const howFor = (key) => {
    const skill = last.skills.get(key);
    if (!skill) return { how: 'none', why: 'it is not in the list any more' };
    return howToChange({ row: { name: skill.name, mark: last.marks.get(key), path: typeof skill.path === 'string' ? skill.path : '', provider: skill.provider }, dshHome: dshHome(), agentsHome: agentsHome(), appContents, defaultFolders: defaultFolders() });
  };
  /**
   * Use a change, after its exam passed and your yes: in place (the old text kept in Tuner Plus's folder, the
   * mark kept, other skills it merged retired), or as a copy under the same name that wins (AI-made, naming its
   * original; the original's text at that moment kept, to say later what changed in it). Never if the original
   * changed since the change was written.
   */
  const putChange = async (entry, id) => {
    const r = entry.replaces;
    await sync();
    const fpNow = last.fps.get(r.key);
    if (!fpNow) throw new Error(`"${r.name}" is not in the list any more, so this change cannot be used.`);
    if (fpNow !== r.fp) throw new Error(`"${r.name}" changed since this change was written. Run Improve again.`);
    // Still the same way, now: your sorting since may have changed what may change (the review of step 10).
    const howNow = howFor(r.key);
    const sameRoot = (one, other) => Boolean(one && other) && inFolder(one, other) && inFolder(other, one);
    if (howNow.how !== r.how || !sameRoot(howNow.root, r.root)) throw new Error(`"${r.name}" may no longer be changed this way (${howNow.how === 'none' ? howNow.why : howNow.how === 'in-place' ? 'now it changes where it is' : 'now it gets a copy'}). Run Improve again.`);
    const retiring = (entry.retires ?? []).map((one) => (typeof one === 'string' ? { key: one, fp: '' } : one));
    for (const one of retiring) {
      const name = last.skills.get(one.key)?.name ?? one.key;
      if (!last.fps.get(one.key) || last.fps.get(one.key) !== one.fp) throw new Error(`"${name}" changed since this merge was written. Run Merge again.`);
      if (howFor(one.key).how !== 'in-place') throw new Error(`"${name}" may no longer be retired. Run Merge again.`);
    }
    const prior = indexRecords(records().read()).get(r.key)?.stamp;
    let file;
    if (r.how === 'in-place') {
      file = r.path;
      if (inReconRoom(file)) throw new Error('A Recon room is never touched.');
      noLinkOnTheWay(file);
      const old = readFileSync(file, 'utf8');
      const kept = join(versionsDir(), hashOf(r.key).slice(0, 16));
      mkdirSync(kept, { recursive: true });
      writeFileSync(join(kept, `${now()}.md`), old, { flag: 'wx', mode: 0o600 });
      const temp = `${file}.tuner-${randomBytes(4).toString('hex')}`;
      writeFileSync(temp, rewriteSkillText(old, { description: entry.description, text: entry.text }), { flag: 'wx', mode: 0o644 });
      renameSync(temp, file);
      const markNow = last.marks.get(r.key) === 'mine' ? 'mine' : 'ai';
      const added = records().add({ kind: 'stamp', key: r.key, name: r.name, where: r.where, fp: folderPrint(r.where), mark: markNow, door: 'tuner', improved: true, model: entry.model, ...(prior?.copyOf ? { copyOf: prior.copyOf } : {}), ...(typeof prior?.outside === 'string' && prior.outside ? { outside: prior.outside } : {}) });
      if (added === 0) warn('the record is broken, so the change was written but not stamped');
      for (const other of retiring) {
        try {
          retireKey(other.key, { inside: true });
        } catch (error) {
          warn(`could not retire a merged skill: ${String(error?.message ?? error)}`);
        }
      }
    } else {
      file = writeSkillFile({ root: r.root, folder: join(r.root, entry.name), text: skillFileText(entry).text });
      const where = placeOf({ path: file });
      const key = keyOf(entry.name, where);
      const added = records().add({ kind: 'stamp', key, name: entry.name, where, fp: folderPrint(where), mark: 'ai', door: 'tuner', model: entry.model, copyOf: { key: r.key, name: r.name, where: r.where, fp: r.fp } });
      if (added === 0) warn('the record is broken, so the copy was written but not stamped');
      writeJson(join(originalsDir(), `${hashOf(key).slice(0, 24)}.json`), { key: r.key, name: r.name, description: r.before?.description ?? '', text: r.before?.text ?? '', fp: r.fp, at: now() }, store.root());
    }
    writeJson(draftFile(id), { ...entry, status: 'live', file, liveAt: now() }, store.root());
    return { name: entry.name, file, git: false, how: r.how };
  };
  /** The skills retired (switched off and kept), newest first. */
  const retiredList = () => {
    const list = readJson(join(retiredDir(), 'index.json'), []);
    return Array.isArray(list) ? list.slice(0, 200) : [];
  };
  /**
   * Retire a skill: switch it off and keep it (moved into Tuner Plus's folder). Only a skill that may be
   * changed in place (yours or AI-made, in a folder Tuner Plus may write); never during a run outside its
   * selection.
   */
  const retireKey = (key, { inside = false } = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const skill = last.skills.get(String(key));
    if (!skill) throw new Error('That skill is not in the list any more. Look again.');
    if (!inside) {
      const outside = scopeRefusal(skill.name);
      if (outside) throw new Error(outside);
    }
    const how = howFor(String(key));
    if (how.how !== 'in-place') throw new Error(`"${skill.name}" cannot be retired here: ${how.why}.`);
    const from = /\/SKILL\.md$/i.test(String(skill.path)) ? dirname(String(skill.path)) : String(skill.path);
    if (inReconRoom(from)) throw new Error('A Recon room is never touched.');
    if (lstatSync(from).isSymbolicLink()) throw new Error(`${from} is a link; Tuner Plus does not move links.`);
    const id = `R${now().toString(36)}${randomBytes(3).toString('hex')}`;
    const to = join(retiredDir(), id, basename(from));
    move(from, to);
    const list = retiredList();
    writeJson(join(retiredDir(), 'index.json'), [{ id, name: skill.name, key: String(key), from, to, mark: last.marks.get(String(key)) ?? '', at: now() }, ...list].slice(0, 200), store.root());
    return skill.name;
  };
  /** Put a retired skill back where it was, when nothing is in its place. */
  const putBack = (id) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const list = retiredList();
    const entry = list.find((one) => one.id === String(id));
    if (!entry) throw new Error('There is no such retired skill.');
    const outside = scopeRefusal(entry.name);
    if (outside) throw new Error(outside);
    if (existsSync(entry.from)) throw new Error(`Something is in its place now (${entry.from}); it stays retired.`);
    if (!inFolder(entry.to, retiredDir())) throw new Error('The retired copy is not where Tuner Plus keeps it.');
    move(entry.to, entry.from);
    writeJson(join(retiredDir(), 'index.json'), list.filter((one) => one.id !== entry.id), store.root());
    return entry.name;
  };
  /** Retire the skills a "Retire unused" card proposed (your yes is the button on the card). */
  const retireFromCard = (cardId) => {
    const all = store.cards();
    const card = all.cards.find((one) => one.id === String(cardId) && one.kind === 'skills-retire');
    if (!card || card.done) throw new Error('There is no such proposal (it may be done already).');
    const done = [];
    const problems = [];
    for (const key of Array.isArray(card.retire) ? card.retire : []) {
      try {
        done.push(retireKey(key));
      } catch (error) {
        problems.push(String(error?.message ?? error));
      }
    }
    // Done only when something was retired; else the proposal stays, with what stopped it.
    if (done.length > 0) {
      const fresh = store.cards();
      const same = fresh.cards.find((one) => one.id === card.id);
      if (same) {
        same.done = 'retired';
        store.saveCards(fresh);
      }
    }
    return { done, problems };
  };
  /**
   * Count the skills' uses in the threads Tuner Plus may read (never Recon, never one holding a Recon
   * export): at most `most` threads a time, each read again after six hours.
   */
  let healthJob;
  const refreshHealth = ({ most = 200 } = {}) => {
    if (!on()) return Promise.reject(new Error('The skills part of Tuner Plus is switched off.'));
    healthJob ??= (async () => {
      const query = ctx.get('sessionQuery');
      const kept = readHealth();
      if (!query?.readSession) return kept;
      const found = await readable();
      if (found?.known === false) return kept;
      const readIds = new Set((found.read ?? []).map((record) => String(record.id ?? '')));
      const sessions = Object.fromEntries(Object.entries(kept.sessions ?? {}).filter(([id]) => readIds.has(id)));
      let read = 0;
      const skippedExport = new Set();
      for (const record of found.read ?? []) {
        if (read >= most || !on()) break;
        const id = String(record.id ?? '');
        if (sessions[id] && now() - (sessions[id].at ?? 0) < 6 * 3_600_000) continue;
        let log;
        try {
          log = await query.readSession(id);
        } catch {
          continue;
        }
        read += 1;
        const events = Array.isArray(log?.events) ? log.events : [];
        if (examDeps?.exportIn?.(events)) {
          delete sessions[id];
          skippedExport.add(id);
          continue;
        }
        sessions[id] = { at: now(), mode: String(record.mode ?? ''), uses: usesIn(events, log?.inheritedEventCount).slice(0, 500) };
      }
      const saved = { sessions, at: now() };
      if (on()) writeJson(healthFile(), saved, store.root());
      // Skill first, adapter later (step 15): a proposal for a skill used often and well, never more.
      if (on()) {
        try {
          proposeTeaching();
        } catch (error) {
          warn(`skills to teach could not be looked for: ${String(error?.message ?? error).slice(0, 200)}`);
        }
      }
      // Readable threads not counted yet (beyond this pass's limit, or not readable now).
      const missing = [...readIds].filter((id) => !sessions[id] && !skippedExport.has(id)).length;
      return { ...saved, missing };
    })().finally(() => {
      healthJob = undefined;
    });
    return healthJob;
  };

  /** The owner showed a draft's whole text on its card: recorded with the text it showed. */
  const markShown = (id) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const entry = readJson(draftFile(id), null);
    if (!entry || entry.status !== 'draft') throw new Error('There is no such draft.');
    writeJson(draftFile(id), { ...entry, shown: textPrint(entry.name, entry.description, entry.text), shownAt: now() }, store.root());
    return entry.name;
  };
  /** Drop a draft (kept on record as dropped; nothing was written to any skills folder). */
  const dropDraft = (id) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const entry = readJson(draftFile(id), null);
    if (!entry || entry.status !== 'draft') throw new Error('There is no such draft.');
    const outside = scopeRefusal(entry.name);
    if (outside) throw new Error(outside);
    writeJson(draftFile(id), { ...entry, status: 'dropped', droppedAt: now() }, store.root());
    return entry.name;
  };

  /** The owner sorts skills by hand on the page (recorded; a model has no way to do this). */
  const sort = (keys, mark) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    if (!MARKS.includes(mark)) throw new Error('That is not a mark.');
    const chosen = [...new Set((Array.isArray(keys) ? keys : []).map(String))].filter((key) => last.keys.has(key)).slice(0, 500);
    if (chosen.length === 0) throw new Error('Pick the skills to sort first.');
    for (const key of chosen) {
      const outside = scopeRefusal(last.skills.get(key)?.name ?? key.split('|')[0]);
      if (outside) throw new Error(outside);
    }
    const added = records().add({ kind: 'sorted', keys: chosen, mark, by: 'owner', fps: Object.fromEntries(chosen.map((key) => [key, last.fps.get(key) ?? ''])) });
    if (added === 0) throw new Error('The record was changed outside Tuner Plus, so nothing more is written to it. Start a new record first (the button above the list).');
    // Your sorting holds at once (what may change, and how, follows the mark).
    for (const key of chosen) last.marks.set(key, mark);
    return chosen.length;
  };

  /** A broken record is kept aside and a new one started: every skill is seen again (the owner's choice). */
  const restartRecord = () => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const file = join(store.folder('skills'), 'records.jsonl');
    if (existsSync(file)) renameSync(file, join(store.folder('skills'), `records-${now()}.jsonl.kept`));
    store.setState({ skillsSeal: '', skillsBroken: false });
    return 'A new record was started; the old one is kept beside it.';
  };

  // ---- the doors -------------------------------------------------------------------------------------

  const headerOf = (agent) => agent?.header ?? agent?.session?.header ?? {};
  const isHelper = (agent) => Boolean(headerOf(agent).parentSession);
  const isolated = (agent) => {
    try {
      const modes = ctx.get('modes');
      const parent = headerOf(agent).parentSession;
      return modes?.isolated?.(String(agent?.id ?? '')) === true || (Boolean(parent) && modes?.isolated?.(String(parent)) === true);
    } catch {
      return true;
    }
  };
  /** The folder the app's file tools resolve a thread's relative paths in (its own working folder). */
  const workingFolder = async (agent, signal) => {
    try {
      const folder = await ctx.get('workingDirectory')?.ensure?.(agent, signal);
      if (typeof folder === 'string' && isAbsolute(folder)) return folder;
    } catch { /* the thread's folder below */ }
    const cwd = headerOf(agent).cwd;
    return typeof cwd === 'string' ? cwd : '';
  };
  /** The working folder each call was checked with, for the final guard. */
  const checkedIn = new WeakMap();
  const decide = (exec, cwd) => writeDecision({ name: exec.name, args: exec.arguments, cwd, closed: closed(), dshHome: dshHome(), known: last.folders, helper: isHelper(exec.agent) });
  // A model's file tools: into a closed folder never (refused before any card); into a skills folder only
  // after the owner's yes on the app's own approval card, asked once every other rule has allowed the call.
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!on() || !WRITE_TOOLS.includes(exec?.name)) return next();
    let decision;
    try {
      const cwd = await workingFolder(exec.agent, exec.signal);
      if (exec && typeof exec === 'object') checkedIn.set(exec, cwd);
      decision = decide(exec, cwd);
    } catch (error) {
      warn(`could not check a file write for skills: ${String(error?.message ?? error)}`);
      // Fail closed only where a skill or a closed folder may be meant.
      if (/skills|tuning|skill-architect/i.test(JSON.stringify(exec?.arguments ?? {}))) return { kind: 'deny', reason: 'Tuner Plus could not check this write, so it was not done.' };
      return next();
    }
    if (decision.refuse) return { kind: 'deny', reason: decision.refuse };
    // While a run lasts, a model's write into a skills folder touches only the run's own skills.
    for (const skill of decision.skills ?? []) {
      const outside = scopeRefusal(basename(String(skill.folder ?? '')).replace(/\.md$/i, ''));
      if (outside) return { kind: 'deny', reason: outside };
    }
    const inner = await next();
    if (!decision.ask || inner?.kind === 'deny' || inner?.kind === 'cancel') return inner;
    const reason = inner?.kind === 'ask' && inner.reason ? `${decision.ask}\n\n${inner.reason}` : decision.ask;
    return { ...(inner?.kind === 'ask' ? inner : {}), kind: 'ask', reason, displayReason: { en: reason } };
  });
  // The closed folders once more after every other rule and the card: nothing after it can allow such a write.
  const finalRule = (exec) => {
    try {
      if (!on() || !WRITE_TOOLS.includes(exec?.name)) return undefined;
      const folders = [checkedIn.get(exec), headerOf(exec.agent).cwd].filter((one) => typeof one === 'string' && one);
      for (const cwd of folders.length > 0 ? folders : ['/']) {
        const refused = writeDecision({ name: exec.name, args: exec.arguments, cwd, closed: closed() }).refuse;
        if (refused) return refused;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };
  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (inner) => inner.effect(() => inner.tools?.guard?.(finalRule) ?? (() => {}), 'tuning: skills closed folders, final'));
  } else {
    ctx.effect(() => ctx.get('tools')?.guard?.(finalRule) ?? (() => {}), 'tuning: skills closed folders, final');
  }
  // When the write happened: the skill is stamped AI-made with the model of that thread (never in Recon).
  ctx.on('fs/observed', (target, observation, exec) => {
    try {
      if (!on() || !WRITE_TOOLS.includes(exec?.name) || observation?.kind !== 'present') return;
      const path = String(target?.displayPath ?? target ?? '');
      if (!path || inReconRoom(path) || isolated(exec?.agent)) return;
      const skill = skillOf(path, { dshHome: dshHome(), known: last.folders });
      if (!skill || inReconRoom(skill.folder)) return;
      let main = skill.folder;
      try {
        if (statSync(skill.folder).isDirectory()) main = join(skill.folder, 'SKILL.md');
      } catch {
        return;
      }
      let text = '';
      try {
        text = readFileSync(main, 'utf8');
      } catch {
        return;
      }
      const name = nameInFile(text) || basename(skill.folder).replace(/\.md$/i, '');
      const where = placeOf({ path: main });
      const route = exec?.agent?.session?.requestHeader?.()?.config ?? {};
      // Built from outside material once, built from it still; a copy stays a copy of its original: a later edit keeps both.
      let outside = '';
      let copyOf;
      try {
        const before = indexRecords(records().read()).get(keyOf(name, where))?.stamp;
        if (typeof before?.outside === 'string') outside = before.outside;
        if (before?.copyOf) copyOf = before.copyOf;
      } catch { /* nothing to keep */ }
      records().add({
        ...(outside ? { outside } : {}),
        ...(copyOf ? { copyOf } : {}),
        kind: 'stamp',
        key: keyOf(name, where),
        name,
        where,
        fp: folderPrint(where),
        mark: 'ai',
        door: 'file-tool',
        tool: exec.name,
        model: route.provider && route.model ? `${route.provider}/${route.model}` : '',
        session: String(exec?.agent?.id ?? ''),
      });
    } catch (error) {
      warn(`could not stamp a skill a model wrote: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the skill exam (step 7): a draft's three checks, or any skill's health report (look only) ------

  const loadSetsDir = () => store.folder('skills', 'loadsets');
  const resultsDir = () => store.folder('skills', 'results');
  /** Each skill's test requests, kept by its name and the description the models see (written again when that changes). */
  const loadSets = {
    get: (name, description) => {
      const kept = readJson(join(loadSetsDir(), `${loadSetKey(name, description)}.json`), null);
      return kept && kept.name === name && Array.isArray(kept.should) && Array.isArray(kept.shouldNot) ? kept : undefined;
    },
    put: (name, description, set) => writeJson(join(loadSetsDir(), `${loadSetKey(name, description)}.json`), { name, description: catalogDescription(description), should: set.should, shouldNot: set.shouldNot, writer: set.writer ?? '', fromText: set.fromText === true, at: now() }, store.root()),
  };
  /** A skill file's text below its name and description. */
  const bodyOf = (text) => {
    const raw = String(text ?? '').replace(/\r\n/g, '\n');
    if (!raw.startsWith('---\n')) return raw;
    const end = raw.indexOf('\n---', 3);
    if (end < 0) return raw;
    const after = raw.indexOf('\n', end + 4);
    return after < 0 ? '' : raw.slice(after + 1);
  };
  /** The text of a skill the app has (read only: never changed). */
  const textOfSkill = (skill) => {
    const path = String(skill?.path ?? '');
    if (path) {
      if (inReconRoom(path)) return '';
      try {
        const main = statSync(path).isDirectory() ? join(path, 'SKILL.md') : path;
        return bodyOf(readFileSync(main, 'utf8').slice(0, 64_000)).trim().slice(0, 20_000);
      } catch {
        return '';
      }
    }
    return String(skill?.content ?? '').slice(0, 20_000);
  };
  let examJob;
  const examState = () => (examJob ? { name: examJob.name, phase: examJob.phase, step: examJob.step, steps: examJob.steps, started: examJob.started, lookOnly: examJob.lookOnly } : null);
  const examModels = () => {
    const picked = examDeps?.models?.() ?? {};
    const route = (one) => (one?.provider && one?.model ? { provider: String(one.provider), model: String(one.model) } : null);
    return { floor: route(picked.floor), strong: route(picked.strong) };
  };
  /** Whether the exam can start, and if not, why (in plain words). */
  const examProblem = () => {
    if (!examDeps) return 'The skill exam is not available.';
    const { floor, strong } = examModels();
    if (!floor || !strong) return 'Pick the two models of the skill exam first: the floor model on this Mac and one strong model.';
    if (!examDeps.here(floor.provider)) return `The floor model (${floor.provider}/${floor.model}) does not run on this Mac. Your held-back tasks never leave it, so pick a model on this Mac.`;
    return '';
  };
  /**
   * Start an exam in the background: a draft's (its result is kept on the draft), or any skill's health
   * report (look only: nothing is changed). One at a time; never while a training run is going.
   * @param {{draft?: string, key?: string}} what - a draft's id, or a skill's key in the list.
   * @returns {Promise<{id: string, name: string, lookOnly: boolean, done: Promise<object|undefined>}>}
   */
  const startExam = async ({ draft: draftId = '', key = '', quiet = false, run = undefined } = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    // While a run from the bar lasts, only that run starts exams (its own selection).
    if (skillsRun && skillsRun !== run) throw new Error(`A run is going: ${skillsRun.sentence} The exam waits until it is done.`);
    const problem = examProblem();
    if (problem) throw new Error(problem);
    if (examJob) throw new Error(`An exam is running: ${examJob.name}. It can be stopped on this page.`);
    const busy = examDeps.busy?.();
    if (busy) throw new Error(`A run is going: ${busy}. The exam waits until it is done.`);
    // Held from here on, also while the list is read: a second exam or a training run waits (the review of step 7).
    const lookOnly = !draftId;
    const id = `E${now().toString(36)}${randomBytes(3).toString('hex')}`;
    const abort = new AbortController();
    const job = { id, name: 'a skill', phase: 'starting', step: 0, steps: 3, started: now(), lookOnly, abort };
    examJob = job;
    let target;
    let draftEntry;
    try {
      if (run?.abort.signal.aborted) throw new Error('the run was stopped');
      if (draftId) {
        draftEntry = readJson(draftFile(draftId), null);
        if (!draftEntry || draftEntry.status !== 'draft') throw new Error('There is no such draft.');
        // A fair exam needs every skill the model would see beside it: read again, and never with part of it missing.
        await sync();
        if (listingProblem) throw new Error(`${listingProblem} The exam needs every skill the model would see; try again in a moment.`);
        target = { name: draftEntry.name, description: String(draftEntry.description ?? ''), text: String(draftEntry.text ?? '') };
      } else {
        // Look only: the list the page showed is used as it is (reading it again would record newly seen skills).
        const skill = last.skills.get(String(key));
        if (!skill) throw new Error('There is no such skill in the list. Look again.');
        target = { name: skill.name, description: String(skill.description ?? ''), text: textOfSkill(skill) };
      }
      if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    } catch (error) {
      if (examJob === job) examJob = undefined;
      throw error;
    }
    job.name = target.name;
    // An exam inside a run stops when the run is stopped or unloaded.
    run?.abort.signal.addEventListener('abort', () => abort.abort(run.abort.signal.reason), { once: true });
    const { floor, strong } = examModels();
    // Switched off part-way: the exam is stopped at once (also inside a canary run), and nothing of it is kept.
    const stopIfOff = () => {
      if (!on() && !abort.signal.aborted) abort.abort(new Error('the skills part was switched off'));
    };
    const watch = setInterval(stopIfOff, 1000);
    watch.unref?.();
    const whileOn = (work) => async (...args) => {
      stopIfOff();
      if (abort.signal.aborted) throw new Error('the exam was stopped');
      return work(...args);
    };
    const fp = textPrint(target.name, target.description, target.text);
    job.done = (async () => {
      try {
        const result = await examSkill(
          { target, catalog: last.catalog, floor, strong, signal: abort.signal, onStep: (phase, step, steps) => Object.assign(job, { phase, step, steps }) },
          { ask: whileOn(examDeps.ask), here: examDeps.here, examRows: examDeps.examRows, answerRow: whileOn(examDeps.answerRow), canaries: whileOn(examDeps.canaries), loadSets },
        );
        stopIfOff();
        if (abort.signal.aborted) throw new Error('the exam was stopped');
        const saved = { id, at: now(), lookOnly, target: { name: target.name, draft: draftId, key, fp }, ...result };
        writeJson(join(resultsDir(), `${id}.json`), saved, store.root());
        const why = examWhy(result);
        if (key && !draftEntry) {
          const found = [
            ...Object.entries(result.loading?.models ?? {}).filter(([, one]) => !one.ok).map(([role, one]) => `on the ${role} model ${one.why}${one.wrongs?.[0] ? `, for example "${one.wrongs[0]}"` : one.misses?.[0] ? `, for example it missed "${one.misses[0]}"` : ''}`),
            ...(result.near?.skills ?? []).filter((one) => one.worse).map((one) => `it makes "${one.name}" load worse`),
          ];
          const checks = readChecks();
          checks[key] = { at: now(), line: healthLine(target.name, result), found };
          writeJson(checksFile(), checks, store.root());
        }
        if (draftEntry) {
          // Kept on the draft only when the draft is still waiting with the very text that was examined.
          const current = readJson(draftFile(draftId), null);
          if (current?.status === 'draft' && textPrint(current.name, current.description, current.text) === fp) {
            writeJson(draftFile(draftId), { ...current, exam: { passed: result.passed, at: now(), result: id, fp, why } }, store.root());
          }
        }
        if (!quiet) addCard?.({
          kind: 'skill-exam',
          key: `skill-exam-${id}`,
          title: lookOnly ? `Health check (look only): ${target.name}` : `${result.passed ? 'Passed its exam' : 'Did not pass its exam'}: ${target.name}`,
          text: examSummary(result, { name: target.name, lookOnly }),
          buttons: ['later', 'never'],
        });
        return saved;
      } catch (error) {
        // Switched off: nothing is written, not even a card.
        job.failure = String(abort.signal.reason?.message ?? error?.message ?? error).slice(0, 400);
        if (on() && !quiet) addCard?.({ kind: 'skill-exam', title: `The exam of ${target.name} did not finish`, text: job.failure, buttons: ['later'] });
        return undefined;
      } finally {
        clearInterval(watch);
        if (examJob === job) examJob = undefined;
      }
    })();
    return { id, name: target.name, lookOnly, done: job.done, failure: () => job.failure ?? '' };
  };
  const stopExam = (why = 'stopped by the owner') => {
    if (!examJob) return false;
    examJob.abort.abort(new Error(why));
    return true;
  };

  // ---- skill ideas (step 8): from the harvest's rows, as cards; "Draft it" writes a draft on this Mac ------

  /**
   * Look for skill ideas in the harvest's rows (never the exam's) and put each on a card. An idea a skill
   * or a draft covers is left out; "Do not suggest this again" holds for it.
   * @returns {Promise<object[]>} the ideas found.
   */
  /**
   * The harvest's rows Tuner Plus may still read today: a row from a thread is used only while that
   * thread is among the readable ones (one marked "never learn from this", trashed or given a Recon
   * export since it was gathered is left out; the review of step 8). Rows from elsewhere (reports, ledgers) stay.
   */
  const rowsReadableNow = async () => {
    const rows = store.rows();
    let found;
    try {
      found = await readable();
    } catch {
      found = { known: false, read: [] };
    }
    const ok = new Set((found?.read ?? []).map((record) => String(record.id ?? record.header?.id ?? '')));
    return rows.filter((row) => !row?.from?.session || (found?.known !== false && ok.has(String(row.from.session))));
  };
  const findIdeas = async ({ skip = [] } = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    await sync();
    const cards = store.cards();
    const exclude = new Set([...(cards.never ?? []), ...(cards.cards ?? []).filter((one) => one.kind === 'skill-idea' && one.done === 'drafted').map((one) => one.key), ...skip]);
    const ideas = ideasFrom({ rows: await rowsReadableNow(), skills: [...last.catalog, ...drafts().map((one) => ({ name: one.name, description: one.description }))], pluginsWithSkills: last.plugins ?? new Set(), exclude });
    const shown = [];
    for (const idea of ideas) {
      const card = addCard?.({ kind: 'skill-idea', key: idea.key, title: `Skill idea: ${idea.title}`, text: `${idea.text}\n"Draft it" has a model on this Mac write a draft from these examples; the draft then takes its exam, and you decide.`, idea: { kind: idea.kind, rows: idea.rows.slice(0, 50) }, buttons: ['draft', 'later', 'never'] });
      if (card) shown.push(idea);
    }
    return shown;
  };
  /** A model's name made into the app's form: lowercase words joined by hyphens. */
  const slug = (value) => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  /** The writer of a draft from an idea: a model on this Mac (the examples are your work): the strong one when it runs here, else the floor one. */
  const ideaWriter = () => {
    const { floor, strong } = examModels();
    if (strong && examDeps?.here?.(strong.provider)) return strong;
    if (floor && examDeps?.here?.(floor.provider)) return floor;
    return null;
  };
  /**
   * Draft a skill from an idea's card: a model on this Mac writes it from the masked examples. It goes to
   * the one project the examples came from when there is one (and it is offered), else everywhere.
   * @returns {Promise<object>} the draft.
   */
  const draftFromIdea = async (cardId, { night = false, signal } = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    if (skillsRun) throw new Error(`A run is going: ${skillsRun.sentence} A skill idea is drafted when it is done.`);
    if (!examDeps?.ask) throw new Error('No model can be asked.');
    const all = store.cards();
    const card = all.cards.find((one) => one.id === String(cardId) && one.kind === 'skill-idea');
    if (!card || card.done) throw new Error('There is no such skill idea (it may be done already).');
    const route = ideaWriter();
    if (!route) throw new Error('A skill idea is drafted by a model on this Mac, so your work stays on it: pick the skill exam\'s floor model (on this Mac) first.');
    // Only rows Tuner Plus may still read today.
    const rows = await rowsReadableNow();
    const evidence = evidenceOf(card.idea, rows);
    if (evidence.length === 0) throw new Error('The examples of this idea are gone from the harvest, so it cannot be drafted.');
    const written = parseDraft(await examDeps.ask(route, draftPrompt({ idea: { text: card.text }, evidence }), signal, () => {}));
    if (signal?.aborted) throw new Error(String(signal.reason?.message ?? 'stopped'));
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    // The one project the examples came from, when there is one and it is offered; else everywhere.
    await sync();
    let project = '';
    try {
      const sessions = new Set((card.idea?.rows ?? []).map((id) => rows.find((row) => row.id === id)?.from?.session).filter(Boolean).map(String));
      const read = (await readable()).read ?? [];
      const tops = new Set(read.filter((record) => sessions.has(String(record.id ?? record.header?.id ?? ''))).map((record) => projectOf(String(record.header?.cwd ?? ''))).filter((one) => one && isAbsolute(one)));
      const only = tops.size === 1 ? [...tops][0] : '';
      if (only && last.projects.some((one) => inFolder(one.path, only) && inFolder(only, one.path))) project = only;
    } catch { /* everywhere */ }
    const base = slug(written.name) || 'new-skill';
    let made;
    for (const name of [base, `${base}-2`, `${base}-3`]) {
      try {
        made = await draft({ name, description: written.description, text: written.text, scope: project ? 'project' : 'everywhere', project, by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'idea', title: card.title, ...(night ? { night: true } : {}) } });
        break;
      } catch (error) {
        if (!/already a skill called|already something called/.test(String(error?.message ?? ''))) throw error;
      }
    }
    if (!made) throw new Error(`The model named it "${base}", and that name and two more like it are taken. Make it by hand with New skill.`);
    const fresh = store.cards();
    const same = fresh.cards.find((one) => one.id === card.id);
    if (same) {
      same.done = 'drafted';
      store.saveCards(fresh);
    }
    return made;
  };

  // ---- skill first, adapter later (step 15) -------------------------------------------------------------

  const taughtFile = () => join(store.folder('skills'), 'taught.json');
  /** The skills you agreed to teach the local model: `{ name: { at } }`. */
  const readTaught = () => {
    const value = readJson(taughtFile(), {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  /** Their names; none while the skills part is off (then the sets go to the trainer exactly as before). */
  const taughtNames = () => (on() ? new Set(Object.keys(readTaught())) : new Set());
  /** A set's rows (or exam rows) as the trainer gets them: without the taught skills' loading. */
  const forTrainer = (rows) => rowsWithoutTaught(rows, taughtNames());
  /** Cards for skills used often and well, with enough checked runs (each skill once; "never" holds). */
  const proposeTeaching = () => {
    const tally = tallyUses(Object.values(readHealth().sessions ?? {}));
    // Waiting cards and "never" hold; "Not now" (or Stop teaching) may be proposed again a month later.
    const all = store.cards();
    const month = new Date(now()).toISOString().slice(0, 7);
    const keyOfSkill = (name) => `skill-teach-${hashOf(name).slice(0, 16)}`;
    const skip = new Set(all.cards.filter((one) => one.kind === 'skill-teach' && one.skill && (!one.done || String(one.key ?? '').endsWith(month))).map((one) => one.skill));
    for (const name of [...last.skills.values()].map((skill) => skill.name)) if ((all.never ?? []).some((key) => String(key).startsWith(keyOfSkill(name)))) skip.add(name);
    const skills = [...last.skills.entries()].map(([key, skill]) => ({ key, name: skill.name }));
    const found = teachable({ rows: store.rows().filter((row) => row.kind === 'toolcalls'), uses: tally, checks: readChecks(), skills, taught: new Set(Object.keys(readTaught())), skip });
    for (const one of found.slice(0, 3)) {
      const key = `${keyOfSkill(one.name)}-${month}`;
      if (hasCard(key)) continue;
      addCard?.({
        kind: 'skill-teach',
        key,
        skill: one.name,
        title: `Your model on this Mac could learn the job of "${one.name}"`,
        text: `"${one.name}" was loaded ${one.loads} times (${one.well} ended well), and its last check found nothing wrong. ${one.rows} checked runs loaded it.\n"Teach it" lets those of them that may train (the usual rules decide) train the harness adapter without the skill's loading, so your model on this Mac learns to do the job without it. The usual rules for what may train apply; the skill's text never trains. The skill stays as it is for the other models. Nothing is trained until you start a training run, with its exam, as always.`,
        buttons: ['teach', 'later', 'never'],
      });
    }
    return found;
  };
  /** "Teach it" on a card. */
  const teachFromCard = (cardId) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    const all = store.cards();
    const card = all.cards.find((one) => one.id === String(cardId) && one.kind === 'skill-teach');
    if (!card || card.done || typeof card.skill !== 'string') throw new Error('There is no such proposal (it may be done already).');
    writeJson(taughtFile(), { ...readTaught(), [card.skill]: { at: now() } }, store.root());
    const fresh = store.cards();
    const same = fresh.cards.find((one) => one.id === card.id);
    if (same) {
      same.done = 'taught';
      store.saveCards(fresh);
    }
    return card.skill;
  };
  /** Stop teaching a skill: its runs go to the trainer with its loading again. */
  const stopTeaching = (name) => {
    const taught = readTaught();
    if (!taught[String(name)]) throw new Error(`"${name}" is not being taught.`);
    delete taught[String(name)];
    writeJson(taughtFile(), taught, store.root());
    return String(name);
  };
  /** For the page: the skills being taught, with how many checked runs loaded each. */
  const taughtList = () => {
    const taught = Object.entries(readTaught());
    if (taught.length === 0) return [];
    const runs = runsBySkill(store.rows());
    return taught.map(([name, one]) => ({ name, at: Number(one?.at) || 0, rows: runs.get(name) ?? 0 }));
  };

  // ---- the marks for other pages (step 13: Cowork's Skills page) -----------------------------------------

  /** How old the last look at the skills may be before another page's question looks again. */
  const MARKS_FRESH_MS = 60_000;
  /**
   * Each skill's mark, for another add-on's page: name, file (or the part of the app that gives it) and mark.
   * Never a skill's text. Null while the skills part is off.
   */
  let marksRefresh = null;
  const marksList = async () => {
    if (!on()) return null;
    // At once from the last look; a look older than a minute is made again in the background (one at a time).
    // Only when there has been no look yet does the answer wait for one.
    if (!last.at || now() - last.at > MARKS_FRESH_MS) {
      marksRefresh ??= sync().catch(() => undefined).finally(() => { marksRefresh = null; });
      if (!last.at) await marksRefresh;
    }
    if (!on() || !last.at) return null;
    return {
      names: { ...MARK_NAMES },
      list: [...last.marks].map(([key, mark]) => {
        const skill = last.skills?.get(key) ?? {};
        return { name: String(skill.name ?? ''), path: typeof skill.path === 'string' ? skill.path : '', provider: typeof skill.provider === 'string' ? skill.provider : '', mark };
      }).filter((one) => one.name),
    };
  };

  // ---- the night shift's skill drafts (step 12) ------------------------------------------------------------

  /** Skill ideas the night shift drafts at most, each night, and how many it tries to get there. */
  const NIGHT_DRAFTS = 2;
  const NIGHT_TRIES = 6;
  /** How often the night looks whether the Mac is used again, while a draft is written or examined. */
  const NIGHT_LOOK_MS = Number(standIns.nightLookMs) > 0 ? Number(standIns.nightLookMs) : 15_000;
  /**
   * The ideas you put aside ("Not now"), kept in a file of their own so the night never brings them back,
   * also once their card has left the page.
   */
  const asideFile = () => join(store.folder('skills'), 'ideas-aside.json');
  const asideKeys = () => {
    const kept = readJson(asideFile(), []);
    const keys = new Set(Array.isArray(kept) ? kept.filter((one) => typeof one === 'string') : []);
    const before = keys.size;
    for (const card of store.cards().cards ?? []) if (card.kind === 'skill-idea' && card.done === 'later' && card.key) keys.add(String(card.key));
    if (keys.size !== before) writeJson(asideFile(), [...keys].slice(-1000), store.root());
    return keys;
  };
  /**
   * The night shift's skill step (its own switch, off at first): it looks for skill ideas, drafts at most two of
   * them with a model on this Mac and runs their exams. It never puts a skill live and never edits one that
   * exists: each draft waits under Skills for your yes. Ideas you put aside are left alone. It stops the
   * moment the Mac is used (also while a draft is written or examined), and it never spends on a model
   * elsewhere: when the exam's strong model is not on this Mac, the draft waits for you to press Exam.
   * @param {{stopped?: () => Promise<string>}} options - the night's stop rule.
   * @returns {Promise<{ideas: number, drafted: object[], problems: string[], stopped: string}>}
   */
  const nightDrafts = async ({ stopped = async () => '' } = {}) => {
    const out = { ideas: 0, drafted: [], problems: [], stopped: '' };
    if (!on()) return out;
    if (!ideaWriter()) {
      out.problems.push('no model on this Mac to write drafts (pick the skill exam\'s floor model)');
      return out;
    }
    const aside = asideKeys();
    await findIdeas({ skip: [...aside] });
    const waiting = store.cards().cards.filter((one) => one.kind === 'skill-idea' && !one.done && !aside.has(one.key));
    out.ideas = waiting.length;
    // Watching the Mac the whole time: a use stops the draft being written and the exam at once.
    const abort = new AbortController();
    let watching = true;
    const look = async () => {
      if (out.stopped) return true;
      const why = await stopped();
      if (why && !out.stopped) {
        out.stopped = why;
        abort.abort(new Error(why));
        stopExam(`stopped: ${why}`);
      }
      return Boolean(out.stopped);
    };
    const watch = (async () => {
      while (watching) {
        await new Promise((resolve) => { const timer = setTimeout(resolve, NIGHT_LOOK_MS); timer.unref?.(); });
        if (watching) await look().catch(() => false);
      }
    })();
    try {
      // In turn until two are drafted: an idea that cannot be drafted (its examples gone, its names taken)
      // does not hold up the others.
      for (const card of waiting.slice().reverse().slice(0, NIGHT_TRIES)) {
        if (out.drafted.length >= NIGHT_DRAFTS || (await look()) || !on()) break;
        let made;
        try {
          made = await draftFromIdea(card.id, { night: true, signal: abort.signal });
        } catch (error) {
          if (out.stopped) break;
          out.problems.push(`${card.title.replace(/^Skill idea: /, '')}: ${String(error?.message ?? error).slice(0, 200)}`);
          continue;
        }
        const one = { name: made.name, id: made.id, exam: 'not run' };
        out.drafted.push(one);
        if ((await look()) || !on()) break;
        const { strong } = examModels();
        if (!strong || !examDeps?.here?.(strong.provider)) {
          one.exam = 'waits for you (its strong model is not on this Mac, so the night does not spend on it; press Exam on the draft)';
          continue;
        }
        try {
          const exam = await startExam({ draft: made.id, quiet: true });
          const saved = await exam.done;
          one.exam = saved ? (saved.passed ? 'passed' : 'did not pass') : `did not finish (${out.stopped ? `stopped: ${out.stopped}` : exam.failure() || 'stopped'})`;
        } catch (error) {
          one.exam = `not run (${String(error?.message ?? error).slice(0, 160)})`;
        }
      }
    } finally {
      watching = false;
      void watch;
    }
    return out;
  };

  // ---- the bar with the goal "Build or improve a skill" (step 9): runs with a fixed selection ----------

  let skillsRun;
  const skillsRunState = () => (skillsRun ? { id: skillsRun.id, type: skillsRun.type, sentence: skillsRun.sentence, step: skillsRun.step, steps: skillsRun.steps, current: skillsRun.current ?? '', started: skillsRun.started, by: skillsRun.by } : null);
  /**
   * The selection is a boundary that code enforces (the owner's prompt, part 7): while a run lasts, a request
   * about a skill outside the skills it started with is refused (the chat tools ask this before they act).
   * @returns {string} why it is refused, or '' when it may go on.
   */
  const scopeRefusal = (name) => (skillsRun && !skillsRun.names.has(String(name ?? '')) ? `A run is going: ${skillsRun.sentence} It reads and changes only the skills it started with, so "${name}" waits until it is done.` : '');
  /** The listed skills' keys for names (a name may stand in more than one place: every one of them). */
  const keysForNames = (names) => {
    const wanted = new Set((Array.isArray(names) ? names : []).map(String));
    return [...last.skills.entries()].filter(([, skill]) => wanted.has(skill.name)).map(([key]) => key);
  };
  /**
   * Start a run from the bar (or the chat tool): Check (a health check of each selected skill, look only), New
   * skill (a model on this Mac writes a draft from the owner's words; its exam follows; look only shows it and
   * writes nothing), or Find gaps (the skill ideas). One at a time, never beside an exam or a training run.
   * @returns {Promise<{id: string, sentence: string, done: Promise<void>}>}
   */
  /**
   * What a run would be, checked but not started (the chat tool asks the owner only about a run that can
   * start, with this very sentence): its type, its fixed selection, its sentence.
   */
  const planSkillsRun = async ({ type, keys = [], names = [], mark = 'all', what = '', scope = 'everywhere', project = '', lookOnly = false } = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    if (!RUNNABLE.includes(type)) throw new Error(skillsRunSentence({ type }));
    if (type !== 'gaps') {
      const problem = examProblem();
      if (problem) throw new Error(problem);
    }
    if (type === 'new' && !ideaWriter()) throw new Error('A new skill is written by a model on this Mac: pick the skill exam\'s floor model (on this Mac) first.');
    // Runs that change skills read the list afresh (the marks decide what may change); the others when none was read.
    if (last.keys.size === 0 || ['improve', 'merge', 'retire'].includes(type)) await sync();
    let chosen = [];
    if (['check', 'improve', 'merge', 'retire'].includes(type)) {
      const asked = new Set([...(Array.isArray(keys) ? keys : []).map(String), ...keysForNames(names)]);
      if ((Array.isArray(names) ? names : []).some((name) => keysForNames([name]).length === 0)) throw new Error('Some of those skills are not in the list. Look again.');
      if ([...asked].some((key) => !last.skills.has(key))) throw new Error('Some of those skills are not in the list any more. Look again.');
      // Neither keys nor names: every skill of the mark (All: every skill).
      if (asked.size === 0) for (const [key, given] of last.marks) if (mark === 'all' || given === mark) asked.add(key);
      chosen = [...asked];
      if (chosen.length === 0) throw new Error(type === 'merge' ? 'Pick one skill to split, or two to merge.' : 'Pick the skills first.');
      if (chosen.length > CHECK_MAX) throw new Error(`One run takes at most ${CHECK_MAX} skills; pick fewer.`);
      if (type === 'improve' && chosen.length > IMPROVE_MAX) throw new Error(`One Improve takes at most ${IMPROVE_MAX} skills; pick fewer.`);
      if (type === 'merge' && chosen.length > 2) throw new Error('Pick one skill to split, or two to merge.');
      if (['improve', 'merge'].includes(type)) {
        const names = chosen.map((key) => last.skills.get(key)?.name ?? key);
        const twice = names.find((name, index) => names.indexOf(name) !== index);
        if (twice) throw new Error(`"${twice}" stands in more than one place: pick the one you mean on the page (one skill each time).`);
      }
      if (['improve', 'merge'].includes(type) && !ideaWriter()) throw new Error('A change is written by a model on this Mac: pick the skill exam\'s floor model (on this Mac) first.');
    }
    const text = mask(String(what ?? '').replace(/\s+/g, ' ').trim().slice(0, WHAT_MAX)).text;
    if (type === 'new' && !text) throw new Error('Say in one line what the new skill is for.');
    if (type === 'new' && scope === 'project') {
      const top = projectOf(String(project ?? ''));
      if (!last.projects.some((one) => inFolder(one.path, top) && inFolder(top, one.path))) throw new Error('That folder is not one of the projects offered; pick one of them, or everywhere.');
    }
    const placeName = scope === 'project' ? `for the project ${String(projectOf(String(project ?? ''))).split('/').pop()}` : 'for everywhere';
    const total = mark === 'all' ? last.marks.size : [...last.marks.values()].filter((given) => given === mark).length;
    const chosenNames = [...new Set(chosen.map((key) => last.skills.get(key)?.name).filter(Boolean))];
    const sentence = skillsRunSentence({ type, names: chosenNames, mark, markName: MARK_NAMES[mark] ?? '', total, what: text, where: placeName, lookOnly });
    return { type, chosen, chosenNames, text, sentence, scope: scope === 'project' ? 'project' : 'everywhere', project: String(project ?? ''), lookOnly: ['new', 'improve', 'merge'].includes(type) ? lookOnly === true : true };
  };
  const startSkillsRun = async (want = {}) => {
    if (!on()) throw new Error('The skills part of Tuner Plus is switched off.');
    if (skillsRun) throw new Error(`A run is going: ${skillsRun.sentence}`);
    if (examJob) throw new Error(`An exam is running: ${examJob.name}. It can be stopped on this page.`);
    const busy = examDeps?.busy?.();
    if (busy) throw new Error(`A run is going: ${busy}. The skills run waits until it is done.`);
    // Held from the first moment, also while the list is read: a second run, an exam or a training run waits
    // (the review of step 9).
    const run = { id: `S${now().toString(36)}${randomBytes(3).toString('hex')}`, type: String(want.type ?? ''), sentence: 'Starting a skills run.', keys: new Set(), names: new Set(), step: 0, steps: 1, started: now(), by: want.by ?? 'page', abort: new AbortController() };
    skillsRun = run;
    let plan;
    try {
      plan = await planSkillsRun(want);
      if (run.abort.signal.aborted || !on()) throw new Error('The run was stopped before it started.');
    } catch (error) {
      if (skillsRun === run) skillsRun = undefined;
      throw error;
    }
    const { type, chosen, text, sentence, scope, project, lookOnly } = plan;
    Object.assign(run, { sentence, keys: new Set(chosen), names: new Set(plan.chosenNames), steps: Math.max(1, chosen.length) });
    const card = (title, body) => {
      if (on()) addCard?.({ kind: 'skills-run', key: `skills-run-${run.id}`, title, text: body, buttons: ['later'] });
    };
    run.done = (async () => {
      try {
        if (type === 'check') {
          const lines = [];
          for (const key of chosen) {
            if (run.abort.signal.aborted || !on()) break;
            run.step += 1;
            const name = last.skills.get(key)?.name ?? key;
            run.current = name;
            let started;
            try {
              started = await startExam({ key, quiet: true, run });
            } catch (error) {
              lines.push(`${name}: not checked (${String(error?.message ?? error).slice(0, 160)}).`);
              continue;
            }
            run.exam = started;
            const saved = await started.done;
            lines.push(saved ? healthLine(name, saved) : `${name}: not checked (${started.failure() || 'it did not finish'}).`);
          }
          const stopped = run.abort.signal.aborted;
          card(`${stopped ? 'Stopped' : 'Done'}: ${sentence}`, `${lines.join('\n')}${stopped ? '\nStopped before the end.' : ''}\nLook only: nothing was changed. Each skill's whole result is kept in Tuner Plus's folder (skills/results).`);
        } else if (type === 'new') {
          const route = ideaWriter();
          if (!route) throw new Error('No model on this Mac can write it: pick the skill exam\'s floor model first.');
          const written = parseDraft(await examDeps.ask(route, newSkillPrompt({ what: text, near: last.catalog.map((one) => one.name) }), run.abort.signal, () => {}));
          if (run.abort.signal.aborted || !on()) throw new Error('the run was stopped');
          if (lookOnly) {
            card(sentence, `Name: ${written.name}\nWhen it helps: ${written.description}\n\n${mask(written.text).text}\n\nNothing was written. Run it without Look only to keep it as a draft and give it its exam.`);
            return;
          }
          const base = slug(written.name) || 'new-skill';
          let made;
          for (const name of [base, `${base}-2`, `${base}-3`]) {
            try {
              made = await draft({ name, description: written.description, text: written.text, scope, project, by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'bar', title: text }, run });
              break;
            } catch (error) {
              if (!/already a skill called|already something called/.test(String(error?.message ?? ''))) throw error;
            }
          }
          if (!made) throw new Error(`The model named it "${base}", and that name and two more like it are taken.`);
          // The run's selection is now this one new skill.
          run.names = new Set([made.name]);
          run.current = made.name;
          // Stopped (or switched off, or unloaded) while the draft was saved: the exam does not start.
          if (run.abort.signal.aborted || !on()) throw new Error(`the run was stopped; the draft "${made.name}" is kept, without its exam`);
          const started = await startExam({ draft: made.id, run });
          const saved = await started.done;
          card(`Done: ${sentence}`, `The draft "${made.name}" is under Skills${saved ? (saved.passed ? ', and it passed its exam: read its whole text, then you decide' : ', and it did not pass its exam') : `; its exam did not finish (${started.failure() || 'stopped'})`}.`);
        } else if (type === 'improve' || type === 'merge') {
          const route = ideaWriter();
          const lines = [];
          const skillOfKey = (key) => {
            const skill = last.skills.get(key);
            return { key, skill, name: skill?.name ?? key, description: String(skill?.description ?? ''), text: skill ? textOfSkill(skill) : '', how: howFor(key) };
          };
          const replacesOf = (one) => ({ key: one.key, name: one.name, mark: last.marks.get(one.key), where: placeOf(one.skill), path: typeof one.skill.path === 'string' ? one.skill.path : '', provider: String(one.skill.provider ?? ''), fp: last.fps.get(one.key), how: one.how.how, root: one.how.root, scope: one.how.scope, project: one.how.project ?? '', before: { description: one.description, text: mask(one.text).text } });
          const examine = async (made, label) => {
            if (run.abort.signal.aborted || !on()) return `${label}: kept as a draft, without its exam (stopped).`;
            const started = await startExam({ draft: made.id, run, quiet: true });
            const saved = await started.done;
            return `${label}: waits under Skills${saved ? (saved.passed ? '; it passed its exam: read it, then you decide' : '; it did not pass its exam') : `; its exam did not finish (${started.failure() || 'stopped'})`}.`;
          };
          const asked = (prompt) => examDeps.ask(route, prompt, run.abort.signal, () => {});
          if (type === 'improve') {
            for (const key of chosen) {
              if (run.abort.signal.aborted || !on()) break;
              run.step += 1;
              const one = skillOfKey(key);
              run.current = one.name;
              if (one.how.how === 'none') {
                lines.push(`${one.name}: not changed (${one.how.why}).`);
                continue;
              }
              if (!one.text.trim()) {
                lines.push(`${one.name}: its text could not be read, so it was not changed.`);
                continue;
              }
              let written;
              try {
                written = parseImprove(await asked(improvePrompt({ name: one.name, description: one.description, text: one.text, found: readChecks()[key]?.found ?? [] })), jsonObjectsIn);
              } catch (error) {
                if (run.abort.signal.aborted) break;
                lines.push(`${one.name}: no better version was written (${String(error?.message ?? error).slice(0, 120)}).`);
                continue;
              }
              const way = one.how.how === 'in-place' ? 'changed where it is' : 'as a copy under the same name';
              if (lookOnly) {
                lines.push(`${one.name} (${way}): would say "${written.description}".\n${mask(written.text).text.slice(0, 600)}`);
                continue;
              }
              try {
                const made = await draft({ name: one.name, description: written.description, text: written.text, scope: one.how.scope, project: one.how.project ?? '', by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'improve', title: `Improve ${one.name}` }, replaces: replacesOf(one), run });
                lines.push(await examine(made, `${one.name} (${way})`));
              } catch (error) {
                lines.push(`${one.name}: not kept (${String(error?.message ?? error).slice(0, 160)}).`);
              }
            }
          } else if (chosen.length === 2) {
            const [first, second] = chosen.map(skillOfKey);
            run.current = first.name;
            const bad = [first, second].find((one) => one.how.how !== 'in-place');
            if (bad) lines.push(`Not merged: "${bad.name}" ${bad.how.how === 'copy' ? 'is not yours: a copy cannot take the place of two skills' : `cannot change here (${bad.how.why})`}.`);
            else {
              const written = parseImprove(await asked(mergePrompt({ first, second })), jsonObjectsIn);
              if (lookOnly) lines.push(`${first.name} and ${second.name} would become one "${first.name}": "${written.description}".\n${mask(written.text).text.slice(0, 600)}`);
              else {
                const made = await draft({ name: first.name, description: written.description, text: written.text, scope: first.how.scope, project: first.how.project ?? '', by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'merge', title: `Merge ${first.name} and ${second.name}` }, replaces: replacesOf(first), retires: [{ key: second.key, fp: last.fps.get(second.key) }], run });
                lines.push(await examine(made, `${first.name} and ${second.name} merged (${second.name} is retired when you use it)`));
              }
            }
          } else {
            const one = skillOfKey(chosen[0]);
            run.current = one.name;
            if (one.how.how !== 'in-place') lines.push(`Not split: "${one.name}" ${one.how.how === 'copy' ? 'is not yours: a copy cannot take its place twice' : `cannot change here (${one.how.why})`}.`);
            else {
              const parts = parseSplit(await asked(splitPrompt({ name: one.name, description: one.description, text: one.text })), jsonObjectsIn);
              const second = slug(parts.second.name) || `${one.name}-part-two`;
              if (lookOnly) lines.push(`"${one.name}" would keep: "${parts.first.description}"; a new "${second}" would take: "${parts.second.description}".`);
              else {
                const kept = await draft({ name: one.name, description: parts.first.description, text: parts.first.text, scope: one.how.scope, project: one.how.project ?? '', by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'split', title: `Split ${one.name}` }, replaces: replacesOf(one), run });
                run.names = new Set([...run.names, second]);
                const added = await draft({ name: second, description: parts.second.description, text: parts.second.text, scope: one.how.scope, project: one.how.project ?? '', by: 'model', model: `${route.provider}/${route.model}`, origin: { kind: 'split', title: `Split ${one.name}` }, run });
                lines.push(await examine(kept, `${one.name} (its first part, changed where it is)`), await examine(added, `${added.name} (its second part, a new skill)`));
              }
            }
          }
          const stopped = run.abort.signal.aborted;
          card(`${stopped ? 'Stopped' : 'Done'}: ${sentence}`, `${lines.join('\n')}${lookOnly ? '\nLook only: nothing was written.' : '\nNothing is used before you say yes on its draft (read it, then Use it).'}`);
        } else if (type === 'retire') {
          // Count first: a skill is "unused" only when every thread Tuner Plus may read was counted.
          run.current = 'counting uses';
          const counted = await refreshHealth({ most: 5000 });
          if (counted.missing > 0) {
            if (on()) addCard?.({ kind: 'skills-retire', key: `skills-retire-${run.id}`, title: `Nothing proposed yet: ${sentence}`, text: `Uses are not counted yet in ${counted.missing} thread${counted.missing === 1 ? '' : 's'} Tuner Plus may read, so no skill can be called unused. Count uses again (under Skills), then run this again. Nothing was changed.`, buttons: ['later'] });
            return;
          }
          const tally = tallyUses(Object.values(counted.sessions ?? {}));
          const firstSeen = indexRecords(records().read());
          const cutoff = now() - UNUSED_DAYS * 86_400_000;
          const lines = [];
          const retire = [];
          for (const key of chosen) {
            const skill = last.skills.get(key);
            const name = skill?.name ?? key;
            const uses = tally.get(name);
            const how = howFor(key);
            if (how.how !== 'in-place') lines.push(`${name}: not offered (${how.why}).`);
            else if ((uses?.last ?? 0) > cutoff) lines.push(`${name}: used ${uses.loads} time${uses.loads === 1 ? '' : 's'}, the last ${Math.max(0, Math.round((now() - uses.last) / 86_400_000))} days ago: kept.`);
            else if ((firstSeen.get(key)?.first?.at ?? 0) > cutoff) lines.push(`${name}: too new to judge (first seen less than ${UNUSED_DAYS} days ago): kept.`);
            else {
              retire.push(key);
              lines.push(`${name}: not used for ${UNUSED_DAYS} days or more.`);
            }
          }
          if (on()) addCard?.({ kind: 'skills-retire', key: `skills-retire-${run.id}`, title: retire.length > 0 ? `Retire unused: ${retire.map((key) => last.skills.get(key)?.name ?? key).join(', ')}` : `Nothing to retire: ${sentence}`, text: `${lines.join('\n')}\n${retire.length > 0 ? 'Retire them switches them off and keeps them: Put back is under Skills. Uses are counted from the threads Tuner Plus may read.' : 'Nothing was changed.'}`, retire, buttons: retire.length > 0 ? ['retire', 'later', 'never'] : ['later'] });
        } else {
          const ideas = await findIdeas();
          card(`Done: ${sentence}`, ideas.length === 0 ? 'No new skill ideas in what was gathered. Changed nothing.' : `${ideas.length} skill idea${ideas.length === 1 ? '' : 's'}: see their cards. Changed nothing.`);
        }
      } catch (error) {
        card(`Did not finish: ${sentence}`, String(error?.message ?? error).slice(0, 400));
      } finally {
        if (skillsRun === run) skillsRun = undefined;
      }
    })();
    return { id: run.id, sentence, done: run.done };
  };
  /** Stop the run from the bar: its exam stops, and what was not reached is left. */
  const stopSkillsRun = () => {
    if (!skillsRun) return false;
    skillsRun.abort.abort(new Error('stopped by the owner'));
    if (examJob) stopExam();
    return true;
  };

  // Tuner Plus unloaded (switched off in the app, or updated): a running exam stops.
  ctx.effect?.(() => () => {
    skillsRun?.abort.abort(new Error('Tuner Plus was unloaded'));
    examJob?.abort.abort(new Error('Tuner Plus was unloaded'));
  }, 'tuning: skill exam');

  return { sync, sort, restartRecord, draft, goLive, dropDraft, markShown, drafts, findIdeas, draftFromIdea, retireKey, putBack, retireFromCard, refreshHealth, checkFromCard, nightDrafts, marksList, forTrainer, proposeTeaching, teachFromCard, stopTeaching, startExam, stopExam, examState, examModels, examProblem, examRunning: () => Boolean(examJob || skillsRun), planSkillsRun, startSkillsRun, stopSkillsRun, skillsRunState, scopeRefusal, keysForNames, inOwnFolder: (path) => inFolder(path, store.where()) };
}
