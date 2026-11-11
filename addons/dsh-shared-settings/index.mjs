/**
 * Host half of Shared settings (dsh-shared-settings).
 *
 * Keeps the settings you change in the app's own pages (Modes, Tiers, tabs, sampling presets,
 * colours, ...) in one `settings.json` in a folder you choose, for example in iCloud Drive, so two
 * Macs share one setup. A change on either Mac is written to the file; a change in the file is
 * applied on the other Mac within a minute.
 *
 *   /shared-settings          show what is shared and the last result
 *   /shared-settings now      sync now
 *
 * Nothing is shared until a folder is set: either `folder` in this add-on's settings, or the folder
 * the installer recorded (`Install.command --settings <folder>`) in <dsh home>/shared-settings/folder.txt.
 * Secrets never go into the file: fields the app marks secret, and any field whose name looks like a
 * key, token or password, stay on each Mac. So do the per-conversation fields listed in `skipFields`.
 */
import { spawn } from 'node:child_process';
import { readFileSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { FILE_NAME, parseFieldList, resolveFolder } from './lib/core.mjs';
import { SharedSettingsEngine } from './lib/engine.mjs';

export const name = 'shared-settings';

/** Per-conversation choices: they change all the time and mean little on the other Mac. */
export const DEFAULT_SKIP = [
  'modes.sessionModes',
  'modes.sessionWeb',
  'modes.sessionResearch',
  'model-tiers.activeTiers',
  'model-tiers.sessionProfiles',
  'model-tiers.modelProfilesMigrated',
];

/** Package scope of the Plus add-ons; their entries are shared unless excluded. */
const PLUS_SCOPE = '@local/dsh-';
/** Plus entries that are about this Mac (paths, keys) rather than about your setup. */
const NEVER = new Set(['@local/dsh-sync', '@local/dsh-shared-settings']);

export const Config = z.object({
  folder: z.string().default(''),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  skipFields: z.array(z.string()).default(DEFAULT_SKIP),
  pollSeconds: z.natural().min(5).max(3600).default(30),
  commandName: z.string().default('shared-settings'),
});

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) return value.map(plain);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

/**
 * Decide which entries are shared.
 * @param {{include?: string[], exclude?: string[]}} options - lists of entry ids.
 * @returns {(ns: string, name: string|undefined) => boolean} rule.
 */
export function shareRule({ include = [], exclude = [] } = {}) {
  const yes = new Set(include);
  const no = new Set(exclude);
  return (ns, pkg) => {
    if (no.has(ns)) return false;
    if (yes.has(ns)) return true;
    return typeof pkg === 'string' && pkg.startsWith(PLUS_SCOPE) && !NEVER.has(pkg);
  };
}

/**
 * The folder to use: the add-on setting, else the one the installer recorded.
 * @param {string} configured - `folder` setting.
 * @param {string} dataDir - this add-on's dsh home folder.
 * @returns {string} absolute folder or ''.
 */
export function pickFolder(configured, dataDir) {
  const home = homedir();
  const own = resolveFolder(configured, home);
  if (own || String(configured ?? '').trim()) return own;
  try {
    return resolveFolder(readFileSync(join(dataDir, 'folder.txt'), 'utf8').split('\n')[0], home);
  } catch {
    return '';
  }
}

/**
 * Render a status for the command.
 * @param {SharedSettingsEngine} engine - engine.
 * @returns {string} text.
 */
function describeStatus(engine) {
  const s = engine.status;
  if (!engine.folder) {
    return 'Shared settings is off: no folder is set. Set `folder` in Settings > Shared settings, or run Install.command --settings <folder>.';
  }
  const lines = [`Shared file: ${engine.file}`, `Last sync: ${s.at ?? 'not yet'} (${s.state})`];
  if (s.shared?.length) lines.push(`Shared: ${s.shared.join(', ')}`);
  if (s.applied?.length) lines.push(`Taken from the file: ${s.applied.join(', ')}`);
  if (s.exported?.length) lines.push(`Written to the file: ${s.exported.join(', ')}`);
  for (const problem of s.problems ?? []) lines.push(`PROBLEM: ${problem}`);
  for (const warning of s.warnings ?? []) lines.push(`Note: ${warning}`);
  return lines.join('\n');
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live plugin Config.
 */
export function apply(ctx, config) {
  const dataDir = String(ctx.get('dshHomePath')?.('shared-settings') ?? '');
  if (!dataDir.startsWith('/')) {
    ctx.logger.warn('shared-settings: no dsh home folder is available; staying off');
    return;
  }
  const folder = pickFolder(plain(config.folder), dataDir);
  if (String(plain(config.folder) ?? '').trim() && !folder) {
    ctx.logger.warn('shared-settings: `folder` must be an absolute path (or start with ~/); staying off');
  }
  const settingsService = () => ctx.get('settings');
  const engine = new SharedSettingsEngine({
    settings: {
      describe: (options) => settingsService()?.describe(options) ?? [],
      replace: (ns, section, revision) => {
        const service = settingsService();
        if (!service) throw new Error('the app settings service is not available');
        return service.replace(ns, section, revision);
      },
    },
    entryNames: () => {
      const map = new Map();
      try {
        for (const entry of ctx.get('configEditor')?.entries() ?? []) map.set(entry.options?.id, entry.options?.name);
      } catch {
        // Without names only `include` decides.
      }
      return map;
    },
    folder,
    dataDir,
    share: shareRule({ include: plain(config.include) ?? [], exclude: plain(config.exclude) ?? [] }),
    skip: parseFieldList(plain(config.skipFields) ?? DEFAULT_SKIP),
    onPlaceholder: (file) => {
      // Ask iCloud to download the file; harmless if it is already coming.
      try {
        spawn('/usr/bin/brctl', ['download', file], { stdio: 'ignore', detached: false }).on('error', () => {});
      } catch {
        // brctl is macOS only.
      }
    },
  });

  let disposed = false;
  let chain = Promise.resolve();
  let lastReport = '';
  /** Run one round after the previous one, and log changes of outcome once. */
  const runNow = () => {
    chain = chain.then(async () => {
      if (disposed) return engine.status;
      let status;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          status = await engine.run();
        } catch (error) {
          status = engine.finish('error', { problems: [String(error?.message ?? error)] });
        }
        if (!status.retry || disposed) break;
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));
      }
      const report = [...(status.problems ?? []), ...(status.warnings ?? [])].join(' | ');
      if (report && report !== lastReport) ctx.logger.warn(`shared-settings: ${report}`);
      if (status.applied?.length) ctx.logger.info(`shared-settings: took ${status.applied.join(', ')} from ${engine.file}`);
      lastReport = report;
      return status;
    });
    return chain;
  };
  const timers = new Set();
  /** Run once after `ms` of quiet; repeated calls push the run back. */
  const debounced = (() => {
    let timer;
    return (ms) => {
      if (disposed) return;
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
      timer = setTimeout(() => {
        timers.delete(timer);
        timer = undefined;
        void runNow();
      }, ms);
      timers.add(timer);
    };
  })();

  ctx.effect(() => () => {
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }, 'shared-settings timers');

  if (folder) {
    // Local edits (any Settings page) arrive here; ignore entries that are not shared.
    ctx.on('settings/document-updated', () => debounced(1500));

    // The other Mac's edits arrive through the folder. iCloud replaces files by renaming, so watch the
    // folder, not the file; a slow poll covers watchers that miss events.
    let watcher;
    const startWatch = () => {
      if (watcher || disposed) return;
      try {
        watcher = watch(folder, { persistent: false }, (_event, changed) => {
          if (!changed || String(changed).includes(FILE_NAME)) debounced(1000);
        });
        watcher.on('error', () => {
          watcher?.close();
          watcher = undefined;
        });
      } catch {
        watcher = undefined; // Folder not there yet; the poll retries.
      }
    };
    ctx.effect(() => () => watcher?.close(), 'shared-settings watcher');
    const pollMs = Number(plain(config.pollSeconds) ?? 30) * 1000;
    const poll = setInterval(() => {
      startWatch();
      void runNow();
    }, pollMs);
    poll.unref?.();
    ctx.effect(() => () => clearInterval(poll), 'shared-settings poll');
    startWatch();
    // Give the other add-ons a moment to finish loading before the first round.
    debounced(3000);
  }

  const commandName = String(plain(config.commandName) ?? '').trim();
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show the shared settings status, or sync now',
            input: { hint: '[now]' },
            handler: async ({ rawInput }) => {
              const wanted = String(rawInput ?? '').trim().toLowerCase();
              if (wanted === 'now' && engine.folder) await runNow();
              else if (wanted && wanted !== 'now') return { kind: 'error', text: 'Usage: /' + commandName + ' [now]' };
              return { kind: 'success', text: describeStatus(engine) };
            },
          }),
        'shared-settings command',
      );
    });
  }
}
