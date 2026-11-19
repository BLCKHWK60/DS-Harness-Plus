/**
 * Artifacts, server half (the owner's prompt "Split Plus", part 7, and his answers of 17 November 2026;
 * decisions in docs/SPLIT-PLUS-PHASE1.md and docs/SPLIT-PLUS-BUILD.md).
 *
 * Every file a conversation makes or changes becomes an artifact: a card in its thread (client.js), a
 * version kept in Artifacts' own folder, and an entry in one Artifacts list across every tab.
 * - Found after each tool call: the app's file tools by their arguments; any other tool by the paths in its
 *   answer that changed during the call; a command by a bounded look at what changed in its folder.
 * - Sealed (Recon) artifacts stay with their own conversation and are never listed; Bench backups are
 *   listed and never shown.
 * - Contents go to the page as plain data only (never served as a web page from the app's address).
 * - Clean-up moves versions, list entries and (when asked) files into the app's trash, with Put back.
 *
 * Off until switched on in Settings → Artifacts. Route: `GET/POST /dsh-artifacts/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { appendFileSync, closeSync, constants, copyFileSync, createReadStream, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { TEXT_KINDS, diffLines, kindOf } from './lib/kinds.js';
import { RECON_ROOM, inReconRoom, openArtifacts } from './lib/store.js';

export const name = 'dsh-artifacts';
export const DATA_PATH = '/dsh-artifacts/data';

export const Config = z.object({
  /** Cards, the viewer and the Artifacts page. Off leaves nothing of it in the app; kept versions stay. */
  enabled: z.boolean().default(false).volatile(),
  /** Danger zone (the owner's answer: each rule can be switched off when needed; off by default, marked, logged). */
  dangerShowBackups: z.boolean().default(false).volatile(),
  dangerShowSealed: z.boolean().default(false).volatile(),
  dangerPagesRun: z.boolean().default(false).volatile(),
  dangerPagesInternet: z.boolean().default(false).volatile(),
});

/** The Danger zone's switches, with what each one opens up. */
export const DANGERS = {
  dangerShowBackups: 'Devices backups are shown and opened like any file (they can hold passwords and keys).',
  dangerShowSealed: 'Recon\'s files are listed and shown outside Recon.',
  dangerPagesRun: 'Web pages open already running their scripts (fetching still blocked; a page can still send itself to another address, which may reach the internet).',
  dangerPagesInternet: 'Web pages open with the internet allowed (their servers see that you opened them; they can reach your local network too).',
};

/** The app's file tools that change files, the tools that only read, and those that run commands. */
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'str_replace_editor']);
const READ_ONLY = new Set(['read', 'read_image', 'glob', 'grep', 'ls', 'list', 'split_watch_read', 'web_search', 'web_fetch', 'ask_user_question', 'todo_write']);
/** Any other tool (an MCP server's too) whose name says it only reads: its answer names files it read, not made. */
const READ_NAME = /(^|_)(read|list|get|search|fetch|find|query|view|show)(_|$)/i;
const COMMAND_TOOLS = new Set(['bash', 'terminal', 'shell', 'pwsh']);
/** A command's folder is looked at this deep and this wide, never more. */
const SCAN_DEPTH = 4;
const SCAN_MAX = 3000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.dsh-mission', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', '.cache']);
/** Folders a command's folder is never looked through as (besides your home folder and every folder above it). */
const NEVER_SCAN = new Set(['/', '/Users', '/Volumes', '/System', '/Library', '/Applications', '/private', '/usr', '/opt', '/etc', '/var', '/tmp', '/private/tmp', '/private/var']);
/** A tool's answer is looked through for at most this many paths. */
const PATH_TRIES = 500;
/** The app's own folders where tabs put what they make (Research's reports, Content's drafts, Diagram's pictures, PDF pages, Creator Plus builds). */
const OUTPUT_HOMES = [['research'], ['content'], ['diagrams'], ['pdf-reader'], ['creator-plus', 'builds']];

/** Kinds opened in their own app from here; anything else (a page, a script, a link file, a program) never is. */
const OPENABLE = new Set(['markdown', 'text', 'csv', 'json', 'pdf', 'word', 'sheet', 'slides', 'image', 'audio', 'video']);
/** Endings that run something or lead somewhere when opened, whatever their kind. */
const NEVER_OPEN = new Set(['html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'webarchive', 'webloc', 'url', 'inetloc', 'fileloc', 'command', 'terminal', 'tool', 'jar', 'class', 'pkg', 'mpkg', 'dmg', 'app', 'sh', 'zsh', 'bash', 'csh', 'ksh', 'fish', 'py', 'rb', 'pl', 'php', 'js', 'mjs', 'cjs', 'scpt', 'scptd', 'applescript', 'workflow', 'action', 'shortcut', 'mobileconfig', 'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppsm', 'ppam', 'sldm']);

/** Is anything at this path (a dangling link counts)? */
function thereAt(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The real path, or '' when it is not there. */
function realOf(path) {
  try {
    return realpathSync(String(path));
  } catch {
    return '';
  }
}

/** Why an artifact is not opened in its own app from here ('' when it may be). */
export function openRefusal(item) {
  const name = String(item?.name ?? basename(String(item?.path ?? ''))).toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (!ext || NEVER_OPEN.has(ext) || !OPENABLE.has(item?.kind)) return `${item?.name ?? 'This file'} is not opened from here: opening it could run something. Show in Finder shows it in its folder.`;
  let info;
  try {
    info = lstatSync(String(item.path));
  } catch {
    return 'The file is not in its folder any more.';
  }
  if (!info.isFile()) return 'That is not a plain file any more (a link or a folder); nothing is opened through it.';
  if ((info.mode & 0o111) !== 0) return `${item.name} is marked as a program, so it is not opened from here. Show in Finder shows it in its folder.`;
  return '';
}

/** A file's content without following a link put in its place. */
function readNoFollow(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a file');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/** A live setting's value: the app hands volatile settings over as a frozen holder with `get()`. */
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

/** The files a file tool changes, made absolute against the conversation's folder. */
export function writesOf(toolName, args, cwd) {
  const input = args && typeof args === 'object' ? args : {};
  const abs = (path) => {
    const text = String(path ?? '').trim();
    if (!text || text.startsWith('~')) return '';
    return normalize(isAbsolute(text) ? text : resolve(String(cwd || '/'), text));
  };
  if (toolName === 'write' || toolName === 'edit' || toolName === 'multi_edit') return [abs(input.file_path)].filter(Boolean);
  if (toolName === 'str_replace_editor') return input.command === 'view' ? [] : [abs(input.path)].filter(Boolean);
  if (toolName === 'apply_patch') {
    const found = [];
    for (const line of String(input.input ?? input.patch ?? '').split('\n')) {
      const match = /^\*\*\* (?:Add File|Update File|Move to): (.+?)\s*$/.exec(line);
      if (match) found.push(abs(match[1]));
    }
    return [...new Set(found.filter(Boolean))];
  }
  return [];
}

/**
 * Paths named in a tool's answer that changed during the call (Research's reports, Content's drafts,
 * Diagram's pictures, PDF pages, Creator Plus builds…). Only inside the conversation's folder or the app's
 * own folders where tabs put what they make (`roots`), by their real paths; never a hidden file or folder,
 * never `~/.ssh` or `~/Library`; at most 30 found and 500 looked at.
 * @param {{roots?: string[], userHome?: string}} [where]
 */
export function changedIn(text, cwd, since, { roots = [], userHome = '' } = {}) {
  const found = new Set();
  const realRoots = [...new Set(roots.map(realOf).filter((root) => root && root !== '/'))];
  if (realRoots.length === 0) return [];
  const home = realOf(userHome);
  const never = home ? [join(home, '.ssh'), join(home, 'Library')] : [];
  let tries = 0;
  for (const match of String(text ?? '').matchAll(/(?:^|[\s"'`(\[])((?:\/|\.{0,2}\/)?[\w@.+-]+(?:\/[\w@.+-]+)*\.[A-Za-z0-9]{1,8})(?=$|[\s"'`)\],:;.!?])/g)) {
    if (found.size >= 30 || tries >= PATH_TRIES) break;
    const raw = match[1].trim();
    const path = normalize(isAbsolute(raw) ? raw : resolve(String(cwd || '/'), raw));
    tries += 1;
    let info;
    try {
      info = lstatSync(path);
    } catch {
      continue;
    }
    if (!info.isFile() || info.mtimeMs < since - 1000) continue;
    const real = realOf(path);
    const root = real ? realRoots.find((one) => real.startsWith(`${one}/`)) : undefined;
    if (!root) continue;
    if (relative(root, real).split('/').some((part) => part.startsWith('.'))) continue;
    if (never.some((one) => real === one || real.startsWith(`${one}/`))) continue;
    found.add(path);
  }
  return [...found];
}

/**
 * What changed in a command's folder during the command: a bounded look, never the whole disk, never your
 * home folder or one above it (by their real paths), never into a hidden folder, a link or Recon's room.
 */
export function changedUnder(folder, since, home = '') {
  const out = [];
  if (!folder || !isAbsolute(folder)) return out;
  const real = realOf(folder);
  if (!real) return out;
  const realHome = realOf(home) || (home ? normalize(home).replace(/\/+$/, '') : '');
  if (NEVER_SCAN.has(real) || (realHome && (real === realHome || realHome.startsWith(`${real}/`)))) return out;
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > SCAN_DEPTH || seen > SCAN_MAX || out.length >= 50) return;
    let handle;
    try {
      handle = opendirSync(dir);
    } catch {
      return;
    }
    try {
      for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
        seen += 1;
        if (seen > SCAN_MAX || out.length >= 50) return;
        const name = entry.name;
        if (name.startsWith('.') || SKIP_DIRS.has(name) || entry.isSymbolicLink()) continue;
        const path = join(dir, name);
        if (entry.isDirectory()) {
          if (!RECON_ROOM.test(`/${name}`)) walk(path, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          if (lstatSync(path).mtimeMs >= since - 1000) out.push(path);
        } catch { /* gone meanwhile */ }
      }
    } finally {
      try {
        handle.closeSync();
      } catch { /* closed already */ }
    }
  };
  walk(normalize(folder).replace(/(.)\/+$/, '$1'), 0);
  return out;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin's context.
 * @param {{enabled?: boolean}} config - its settings.
 * @param {{home?: string, userHome?: string, open?: (path: string) => Promise<void>}} [standIns] - for tests.
 */
export function apply(ctx, config, standIns = {}) {
  const enabled = () => plain(config?.enabled) === true;
  const danger = (key) => plain(config?.[key]) === true;
  const warn = (text) => ctx.logger?.warn?.(`artifacts: ${text}`);
  const homeOf = ctx.get('dshHomePath');
  const home = standIns.home ?? (typeof homeOf === 'function' ? homeOf('artifacts') : '');
  const scratchRoot = standIns.scratchRoot ?? (typeof homeOf === 'function' ? homeOf('scratch') : '');
  /** Who made a version: true for a Recon (isolated) conversation, false for an ordinary one, null when Modes does not know. undefined when Modes is not answering at all. */
  const isolatedOf = (id) => {
    const service = ctx.get('modes');
    if (typeof service?.isolated !== 'function') return undefined;
    try {
      const answer = service.isolated(String(id ?? ''));
      return answer === true ? true : answer === false ? false : null;
    } catch {
      return undefined;
    }
  };
  const store = openArtifacts({ home, scratchRoot, isolated: isolatedOf });
  if (store.notice()) warn(store.notice());
  /** Clears old copies of Recon files, one version at a time, once Modes can say which conversations are Recon's. */
  let purged = false;
  const purgeOld = () => {
    if (purged) return;
    try {
      const result = store.purgeReconCopies();
      if (result.ran) purged = true;
    } catch (error) {
      warn(`could not clear old copies of Recon files (${error?.message ?? error})`);
    }
  };
  const trashDir = home ? join(home, 'trash') : '';
  /** The app's own folders where tabs put what they make: what a tool's answer names there is found too. */
  const outputRoots = standIns.outputRoots ?? (typeof homeOf === 'function' ? OUTPUT_HOMES.map((parts) => {
    try {
      return join(homeOf(parts[0]), ...parts.slice(1));
    } catch {
      return '';
    }
  }).filter(Boolean) : []);
  const userHome = standIns.userHome ?? process.env.HOME ?? '';
  const modes = () => ctx.get('modes');
  /** Is this a sealed (Recon) conversation? Without Modes nobody can tell, so every one counts as sealed (fails safe). */
  const sealedOf = (id) => {
    const service = modes();
    if (typeof service?.isolated !== 'function') return true;
    try {
      return service.isolated(String(id ?? '')) !== false;
    } catch {
      return true;
    }
  };
  const modeOf = (id) => {
    try {
      return String(modes()?.get?.(String(id ?? '')) ?? '');
    } catch {
      return '';
    }
  };
  /** A helper's work counts for the conversation it works for. */
  const rootOf = (agent) => {
    let header = agent?.session?.header ?? {};
    const seen = new Set();
    while (header.origin === 'subagent' && typeof header.parentSession === 'string' && !seen.has(header.id)) {
      seen.add(header.id);
      let parent;
      try {
        parent = ctx.get('sessions')?.get?.(header.parentSession);
      } catch {
        parent = undefined;
      }
      if (!parent?.header) return header.parentSession;
      header = parent.header;
    }
    return String(header.id ?? agent?.id ?? '');
  };
  const cwdOf = (agent) => {
    try {
      return String(ctx.get('workingDirectory')?.get?.(agent?.session) ?? agent?.session?.header?.cwd ?? '');
    } catch {
      return '';
    }
  };

  // ---- finding what a conversation made ----------------------------------------------------------

  /** callId → when the call started, for "changed during the call". */
  const started = new Map();
  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      if (enabled() && exec?.callId) {
        started.set(String(exec.callId), Date.now());
        if (started.size > 2000) started.delete(started.keys().next().value);
      }
    } catch { /* timing is a nicety */ }
    return next();
  });
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try {
      if (!enabled() || !exec?.agent || result?.isError === true || decision?.kind === 'block') return decision;
      const name = String(exec.name ?? '');
      if (READ_ONLY.has(name) || (!WRITE_TOOLS.has(name) && !COMMAND_TOOLS.has(name) && READ_NAME.test(name))) return decision;
      const since = started.get(String(exec.callId ?? '')) ?? Date.now() - 60_000;
      started.delete(String(exec.callId ?? ''));
      const cwd = cwdOf(exec.agent);
      const text = (Array.isArray(decision?.content) ? decision.content : Array.isArray(result?.content) ? result.content : []).map((block) => (block?.type === 'text' ? block.text : '')).join('\n');
      const paths = WRITE_TOOLS.has(name) ? writesOf(name, exec.arguments, cwd)
        : COMMAND_TOOLS.has(name) ? changedUnder(cwd, since, userHome)
          : changedIn(text, cwd, since, { roots: [cwd, ...outputRoots], userHome });
      if (paths.length === 0) return decision;
      const session = rootOf(exec.agent);
      try {
        if (ctx.get('reconWipe')?.has?.(session) === true) return decision;
      } catch { /* the wipe list is a nicety here */ }
      const sealed = sealedOf(session);
      const mode = modeOf(session);
      for (const path of paths) {
        try {
          store.record({ path, sessionId: session, mode, sealed });
        } catch (error) {
          warn(`could not keep a version of ${basename(path)} (${error?.message ?? error})`);
        }
      }
    } catch (error) {
      warn(`could not note what a tool made (${error?.message ?? error})`);
    }
    return decision;
  });

  // ---- the app's trash: Put back for a clean-up -------------------------------------------------------

  let trashHandle = null;
  let trashService = null;
  ctx.inject(['coworkTrash'], (inner) => {
    try {
      trashService = inner.coworkTrash;
      trashHandle = inner.coworkTrash.register({
        owner: 'artifacts',
        label: 'Artifacts',
        // The trash keeps only the clean-up's name; what it moved is written down in Artifacts' trash folder.
        putBack: async ({ data = [] } = {}) => {
          const done = [];
          const failed = [];
          const notes = [];
          for (const piece of data) {
            try {
              const stamp = piece?.ownerData?.stamp;
              const result = stamp ? store.putBackStamp(trashDir, String(stamp)) : store.putBack(piece?.ownerData?.manifest ?? {});
              notes.push(...result.notes);
              if (result.left.length === 0) done.push(piece.item);
              else failed.push({ item: piece.item, reason: `${result.left.length} of them could not be put back yet: ${result.notes.join(' ')}`.slice(0, 300) });
            } catch (error) {
              warn(`could not put back a clean-up (${error?.message ?? error})`);
              failed.push({ item: piece?.item, reason: String(error?.message ?? error).slice(0, 300) });
            }
          }
          return { done, failed, notes: notes.slice(0, 10) };
        },
      });
      inner.effect(() => () => { trashHandle?.dispose?.(); trashHandle = null; trashService = null; }, 'artifacts: trash');
      // Conversations deleted for good take their Scratch artifacts with them.
      inner.effect(() => inner.coworkTrash.onErased((ids) => store.erased(ids)), 'artifacts: deleted conversations');
    } catch (error) {
      warn(`the trash is not available (${error?.message ?? error})`);
    }
  });
  /** Clean-ups on their way to the trash: never tidied meanwhile. */
  const pendingStamps = new Set();
  /**
   * What the trash erased for good (its 30 days, Delete permanently) leaves Artifacts' trash folder too. Only
   * while the trash is up (before then it lists nothing), only a clean-up the trash had taken, never one on
   * its way; a clean-up cut short before the trash took it (the app closed meanwhile) is put back instead.
   * A folder without a manifest is left alone.
   */
  const tidyTrash = () => {
    if (!trashHandle || !trashDir || !existsSync(trashDir)) return;
    if (typeof trashService?.ready !== 'function' || trashService.ready() !== true) return;
    try {
      const rows = trashHandle.items?.();
      if (!Array.isArray(rows)) return;
      const kept = new Set(rows.flatMap((row) => (Array.isArray(row?.data) ? row.data : []))
        .map((piece) => piece?.ownerData?.stamp ?? piece?.ownerData?.manifest?.stamp).filter(Boolean).map(String));
      for (const stamp of store.stamps(trashDir)) {
        if (kept.has(stamp) || pendingStamps.has(stamp)) continue;
        const manifest = store.readManifest(trashDir, stamp);
        if (!manifest) continue;
        if (manifest.inTrash === true) rmSync(join(trashDir, stamp), { recursive: true, force: true });
        else {
          const result = store.putBackStamp(trashDir, stamp);
          if (result.notes.length > 0) warn(`a clean-up cut short was put back: ${result.notes.join(' ')}`);
        }
      }
    } catch (error) {
      warn(`could not tidy the trash folder (${error?.message ?? error})`);
    }
  };
  const tidy = setInterval(tidyTrash, 15 * 60_000);
  tidy.unref?.();
  ctx.effect?.(() => () => clearInterval(tidy), 'artifacts: tidy the trash');
  standIns.tidy?.(tidyTrash);
  /**
   * Recon's End and wipe (review B2): a conversation on Recon's wipe list is forgotten here at once, so no
   * entry or copy of what it wrote stays under artifacts/. Looked at every few seconds and on every change.
   */
  const forgetWiped = () => {
    purgeOld();
    try {
      const ids = ctx.get('reconWipe')?.list?.();
      if (Array.isArray(ids) && ids.length > 0) store.forgetSessions(ids.map(String));
    } catch (error) {
      warn(`could not forget a wiped conversation (${error?.message ?? error})`);
    }
  };
  const forgetTimer = setInterval(forgetWiped, 5000);
  forgetTimer.unref?.();
  ctx.effect?.(() => () => clearInterval(forgetTimer), 'artifacts: forget wiped conversations');
  standIns.forget?.(forgetWiped);
  forgetWiped();
  // Told the moment Recon puts a conversation on its wipe list (and again when it is gone).
  try {
    const off = ctx.get('reconWipe')?.onChange?.((id) => { try { store.forgetSessions([String(id)]); } catch { /* the timer tries again */ } });
    if (typeof off === 'function') ctx.effect?.(() => off, 'artifacts: Recon wipe events');
  } catch { /* Recon is not running: the timer still asks */ }

  /**
   * Clean-up: the picked artifacts (never a starred, sealed or Bench backup one) go to the app's trash, with
   * their kept versions and, when asked, their current files. Without the Cowork sidebar's trash it is
   * refused: a clean-up is never a deletion for good.
   */
  const cleanUp = async (ids, alsoFiles) => {
    if (!trashHandle) throw new Error('Clean-up needs the app\'s trash (the Cowork sidebar). Nothing was removed.');
    const stamp = store.newStamp();
    pendingStamps.add(stamp);
    try {
      const manifest = store.remove(ids, { alsoFiles: alsoFiles === true, trashDir, stamp });
      if (manifest.moved.length === 0) return { moved: 0 };
      try {
        await trashHandle.add({
          key: `cleanup.${stamp}`.slice(0, 100),
          title: `Artifacts clean-up: ${manifest.moved.length} artifact${manifest.moved.length === 1 ? '' : 's'}${alsoFiles ? ' and their files' : ''}`.slice(0, 200),
          tab: 'chat',
          data: { ownerData: { stamp } },
        });
      } catch (error) {
        // Not in the trash: put it all back rather than leave it where no Put back can reach it.
        store.putBackStamp(trashDir, stamp);
        throw new Error(`The trash did not take it, so nothing was removed (${error?.message ?? error}).`);
      }
      try {
        store.markInTrash(trashDir, stamp);
      } catch (error) {
        warn(`could not note that the trash took a clean-up (${error?.message ?? error}); it is kept until put back`);
      }
      return { moved: manifest.moved.length };
    } finally {
      pendingStamps.delete(stamp);
    }
  };

  // ---- the route --------------------------------------------------------------------------------------

  /** Is this sealed artifact hidden from a conversation? Shown only to a sealed one among those that made it, or with the Danger zone's switch. */
  const sealedHidden = (item, asking) => item.sealed === true && !danger('dangerShowSealed') && !(asking && item.sessions.includes(asking) && sealedOf(asking));
  /** May this conversation see this artifact? Never a Bench backup's content; a sealed one only inside its own conversation. */
  const mayShow = (item, asking) => {
    if (!item) return 'There is no such artifact.';
    if (item.noRender && !danger('dangerShowBackups')) return 'A Devices backup is listed and never shown: it can hold passwords and keys.';
    if (sealedHidden(item, asking)) return 'This artifact belongs to a sealed conversation (Recon) and shows only there.';
    return '';
  };
  /** Every change of the Danger zone is noted (`danger.jsonl`). */
  let lastDanger = '';
  const dangerState = () => {
    const on = Object.keys(DANGERS).filter((key) => danger(key));
    if (on.join(',') !== lastDanger && home) {
      try {
        mkdirSync(home, { recursive: true, mode: 0o700 });
        appendFileSync(join(home, 'danger.jsonl'), `${JSON.stringify({ at: Date.now(), on })}\n`, { mode: 0o600 });
      } catch (error) {
        warn(`could not note the Danger zone (${error?.message ?? error})`);
      }
    }
    lastDanger = on.join(',');
    return on.map((name) => ({ name, what: DANGERS[name] }));
  };
  const open = standIns.open ?? ((path) => new Promise((done, fail) => execFile('/usr/bin/open', [path], { timeout: 15_000 }, (error) => (error ? fail(error) : done()))));
  /** Show a file in its folder (Finder), without opening it. */
  const reveal = standIns.reveal ?? ((path) => new Promise((done, fail) => execFile('/usr/bin/open', ['-R', path], { timeout: 15_000 }, (error) => (error ? fail(error) : done()))));

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: DATA_PATH,
      handler: async (req, res) => {
        const refused = inner.connection.requestRejection(req);
        if (refused !== undefined) {
          res.statusCode = refused;
          res.end();
          return;
        }
        res.setHeader('cache-control', 'no-store');
        try {
          const url = new URL(req.url ?? '/', 'http://local');
          const q = url.searchParams;
          if (req.method === 'GET' && q.get('content')) {
            if (!enabled()) throw new Error('Artifacts is switched off.');
            const item = store.get(q.get('content'));
            const why = mayShow(item, q.get('session') ?? '');
            if (why) throw new Error(why);
            const file = store.versionFile(item.id, q.get('v') ?? item.versions);
            if (!file || !existsSync(file)) throw new Error('That version is not there any more.');
            // Plain data only: never a page the app's own address would run.
            res.setHeader('content-type', 'application/octet-stream');
            res.setHeader('x-content-type-options', 'nosniff');
            res.setHeader('content-security-policy', "sandbox; default-src 'none'");
            res.setHeader('content-disposition', 'attachment');
            res.setHeader('x-artifact-kind', item.kind);
            res.setHeader('content-length', String(statSync(file).size));
            // Never through a link put in the file's place meanwhile.
            createReadStream(file, { flags: constants.O_RDONLY | constants.O_NOFOLLOW }).on('error', () => res.destroy?.()).pipe(res);
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          if (req.method === 'GET') {
            if (q.get('item')) {
              const item = enabled() ? store.get(q.get('item')) : null;
              // A sealed one's details (its path, its conversations) only for a sealed conversation that made it.
              const shown = item && !sealedHidden(item, q.get('session') ?? '')
                ? { ...item, ...(item.noRender && danger('dangerShowBackups') ? { noRender: false } : {}), ...(item.sealed && danger('dangerShowSealed') ? { sealed: false } : {}) }
                : null;
              res.end(JSON.stringify({ item: shown, pageStart: danger('dangerPagesInternet') ? 'internet' : danger('dangerPagesRun') ? 'run' : 'safe' }));
              return;
            }
            if (q.get('diff')) {
              if (!enabled()) throw new Error('Artifacts is switched off.');
              const item = store.get(q.get('diff'));
              const why = mayShow(item, q.get('session') ?? '');
              if (why) throw new Error(why);
              if (!TEXT_KINDS.has(item.kind)) throw new Error('Only text files are compared line by line.');
              const read = (n) => {
                const file = store.versionFile(item.id, n);
                try {
                  return file ? readNoFollow(file) : '';
                } catch {
                  return '';
                }
              };
              res.end(JSON.stringify(diffLines(read(q.get('a')), read(q.get('b')))));
              return;
            }
            if (q.get('match')) {
              const filter = JSON.parse(q.get('match') || '{}');
              res.end(JSON.stringify({ ids: enabled() ? store.matching(filter) : [] }));
              return;
            }
            if (q.get('session')) {
              const session = q.get('session');
              const cards = enabled() ? store.cardsOf(session, Number(q.get('from')) || 0, Number(q.get('to')) || Number.MAX_SAFE_INTEGER) : [];
              // A sealed conversation sees its own cards; nobody else sees them.
              res.end(JSON.stringify({ enabled: enabled(), cards: cards.filter((card) => !card.sealed || sealedOf(session) || danger('dangerShowSealed')) }));
              return;
            }
            const list = enabled() ? store.list({ mode: q.get('mode') ?? '', folder: q.get('folder') ?? '', kind: q.get('kind') ?? '', from: Number(q.get('from')) || 0, to: Number(q.get('to')) || Number.MAX_SAFE_INTEGER }) : [];
            const sealedToo = enabled() && danger('dangerShowSealed') ? store.listSealed() : [];
            res.end(JSON.stringify({ enabled: enabled(), trash: Boolean(trashHandle), notice: store.notice(), items: [...list, ...sealedToo], danger: enabled() ? dangerState() : [] }));
            return;
          }
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 65536) throw new Error('request too large');
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          if (!enabled()) throw new Error('Artifacts is switched off in Settings → Artifacts.');
          if (body.action === 'star') {
            res.end(JSON.stringify({ ok: store.star(body.id, body.on === true) }));
            return;
          }
          if (body.action === 'cleanup') {
            const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 5000) : [];
            res.end(JSON.stringify({ ok: true, ...(await cleanUp(ids, body.alsoFiles === true)) }));
            return;
          }
          const item = store.get(body.id);
          const why = mayShow(item, String(body.session ?? ''));
          if (why) throw new Error(why);
          // Recon's files leave Recon only through its own Export… button, even from inside Recon.
          if (item.sealed && !danger('dangerShowSealed') && ['openApp', 'reveal', 'saveTo'].includes(body.action)) {
            throw new Error('Recon\'s files leave Recon only through its own Export… button, once its run is done.');
          }
          if (body.action === 'openApp') {
            const refused = openRefusal(item);
            if (refused) throw new Error(refused);
            await open(item.path);
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (body.action === 'reveal') {
            if (!existsSync(item.path)) throw new Error('The file is not in its folder any more.');
            await reveal(item.path);
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (body.action === 'saveTo') {
            const wanted = String(body.folder ?? '').trim();
            if (!isAbsolute(wanted)) throw new Error('Give the folder as a full path.');
            const folder = normalize(wanted).replace(/(.)\/+$/, '$1');
            // Where it really goes, through any link, is looked at before any folder is made.
            let base = folder;
            while (base !== '/' && !existsSync(base)) base = dirname(base);
            const realBase = realOf(base);
            if (!realBase || !statSync(realBase).isDirectory()) throw new Error(`${base} is not a folder.`);
            const realFolder = join(realBase, relative(base, folder));
            if (inReconRoom(folder) || RECON_ROOM.test(realFolder)) throw new Error('Not into Recon\'s room.');
            const source = store.versionFile(item.id, body.version ?? item.versions);
            if (!source) throw new Error('That version is not there any more.');
            mkdirSync(realFolder, { recursive: true });
            if (RECON_ROOM.test(realOf(realFolder))) throw new Error('Not into Recon\'s room.');
            const target = join(realFolder, item.name);
            if (thereAt(target)) throw new Error(`${item.name} is already in that folder; nothing was overwritten.`);
            copyFileSync(source, target, constants.COPYFILE_EXCL);
            res.end(JSON.stringify({ ok: true, where: target }));
            return;
          }
          throw new Error('unknown action');
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 400) }));
        }
      },
    }), 'artifacts: data route');
  });
}

export const testing = { kindOf, changedIn, changedUnder, writesOf, openRefusal };
