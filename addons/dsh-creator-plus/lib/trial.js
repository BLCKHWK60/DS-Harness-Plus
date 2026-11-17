/**
 * The trial copy and the way back (build prompt, part 7; fixed rules 1 and 2).
 *
 * The trial copy is a throwaway app-data folder inside Creator Plus's own folder, with its own setup made
 * from the app's web template, as `scripts/check.sh` makes one: a new or changed plugin is installed and
 * loaded there first. Every command runs with DSH_HOME set to the trial folder; a trial folder that would be
 * the real app-data folder, or outside Creator Plus's own folder, is refused before anything runs.
 *
 * Backups: every change and install keeps the version before it in `<home>/backups/<time>-<what>/`, and
 * one action puts it back, exactly as it was (its tests too, links as links). Nothing is deleted; old backups
 * stay until the user removes them.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { real, within } from './rules.js';
import { ownFolder } from './runs.js';

export const TRIAL_PROFILE = 'trial';
/** A trial copy's port, when it is started to watch a plugin load (never the lab's 3391). */
export const TRIAL_PORT = 3393;

/** The app's programs, found from the running app (never a path of the user's). */
export function appPrograms(execPath = process.execPath) {
  const at = String(execPath ?? '').indexOf('.app/');
  if (at < 0) return { node: '', dsh: '' };
  const bundle = String(execPath).slice(0, at + 4);
  return { bundle, node: String(execPath), dsh: join(bundle, 'Contents/Resources/runtime/cli/bin/dsh') };
}

/** A stamp for a backup's folder name. */
const stamp = (at) => new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

/** Copy a plugin folder, leaving out its tests (the installer does the same) and anything that is a link. */
function copyPlugin(from, to) {
  cpSync(from, to, {
    recursive: true,
    dereference: false,
    errorOnExist: false,
    filter: (path) => {
      const name = basename(path);
      if (name === '.DS_Store') return false;
      try {
        if (lstatSync(path).isSymbolicLink()) return false;
      } catch {
        return false;
      }
      return !(name === 'test' && statSync(path).isDirectory() && path !== from);
    },
  });
}

/** Copy a folder exactly as it is, for a backup and its way back: its tests too, and links kept as links. */
function copyExact(from, to) {
  cpSync(from, to, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: false, force: true });
}

/**
 * Open the trial copy. Each trial is a fresh throwaway app-data folder inside a run folder of its own
 * (lib/runs.js): the host copies the plugins in first, from copies only the host can write, and only then
 * do the app's `dsh` commands run there, sandboxed; afterwards the host reads only their output and the run
 * folder is removed. The host never acts on a folder a sandboxed program could write.
 * @param {object} options - `home` (Creator Plus's own folder), `realHome` (the app's real data folder,
 *   which the trial must never be), `programs` ({dsh, node}), `runs` (lib/runs.js), `now`.
 * @returns {object} the trial copy.
 */
export function openTrial({ home, realHome = '', programs = appPrograms(), runs, now = () => Date.now() }) {
  return {
    /**
     * Install plugin folders in a fresh trial copy and compose it the way the app does at start: a plugin
     * that does not install or load shows here.
     * @param {string[]} dirs - plugin folders only the host writes (a checked copy, a prepared change).
     * @returns {Promise<{ok: boolean, layers: number, warnings: string, problem: string}>} how it went.
     */
    async check(dirs) {
      if (!programs.dsh) return { ok: false, layers: 0, warnings: '', problem: 'The app\'s own command-line tool was not found, so there is no trial copy here.' };
      return runs.with((dir) => {
        const trialHome = join(dir, 'trial');
        // Never the real app data, and only inside Creator Plus's own folder (fixed rule 2).
        if (!within(resolve(trialHome), resolve(home)) || (realHome && real(trialHome) === real(realHome))) throw new Error('The trial copy would be the real setup; nothing was run.');
        const copies = dirs.map((from) => {
          const to = join(trialHome, 'addons', 'trial', basename(from));
          copyPlugin(from, to);
          return to;
        });
        return { trialHome, copies };
      }, async ({ trialHome, copies, run }) => {
        // The app's own programs only (none of the plugin's code runs here), so they may start their child processes.
        const dsh = (args, timeoutMs = 180_000) => run(programs.dsh, args, { env: { DSH_HOME: trialHome }, cwd: trialHome, timeoutMs, fork: true });
        const tail = (result, n) => String(result.stderr || result.stdout).trim().split('\n').slice(-n).join(' ').slice(0, 400);
        const made = await dsh(['--profile', TRIAL_PROFILE, '--from-default-profile', 'web', '--dump-config']);
        if (made.code !== 0) return { ok: false, layers: 0, warnings: '', problem: `The trial setup could not be made: ${tail(made, 2)}` };
        const added = await dsh(['plugin', '--profile', TRIAL_PROFILE, 'add', ...copies], 600_000);
        if (added.code !== 0) return { ok: false, layers: 0, warnings: '', problem: `The trial install failed: ${tail(added, 3)}` };
        const composed = await dsh(['--profile', TRIAL_PROFILE, '--dump-config']);
        const layers = (String(composed.stdout).match(/^# == @local\//gm) ?? []).length;
        const warnings = String(composed.stderr ?? '').trim();
        return { ok: composed.code === 0 && !warnings, layers, warnings: warnings.slice(0, 2000), problem: composed.code === 0 ? '' : tail(composed, 3) };
      });
    },
    backups: openBackups({ home, now }),
  };
}

/**
 * Backups and the way back (fixed rule 1).
 * @param {{home: string, now?: () => number}} options - Creator Plus's own folder.
 * @returns {object} the backups.
 */
export function openBackups({ home, now = () => Date.now() }) {
  const root = join(home, 'backups');
  return {
    root,
    /**
     * Keep a copy of a plugin folder (or a file) before it changes.
     * @returns {string} the backup's folder.
     */
    keep(from, what) {
      if (!existsSync(from)) throw new Error(`There is nothing at ${from} to back up.`);
      const label = String(what ?? basename(from)).replace(/[^\w.-]+/g, '-').slice(0, 60);
      ownFolder(home, 'backups');
      // Each backup in a folder of its own, also two of the same plugin in the same second.
      let to = join(root, `${stamp(now())}-${label}`);
      for (let n = 2; existsSync(to); n += 1) to = join(root, `${stamp(now())}-${label}-${n}`);
      mkdirSync(to, { recursive: true, mode: 0o700 });
      copyExact(from, join(to, basename(from)));
      return to;
    },
    /** @returns {string[]} the backups, newest first. */
    list() {
      try {
        return readdirSync(root).filter((name) => !name.startsWith('.')).sort().reverse();
      } catch {
        return [];
      }
    },
    /**
     * Put a backed-up folder back where it was (the folder there now is backed up first, so this too can be undone).
     * @returns {string} the backup of what was there.
     */
    restore(backup, to) {
      const from = join(root, basename(backup));
      const inside = readdirSync(from).filter((name) => !name.startsWith('.'));
      if (inside.length !== 1) throw new Error('That backup does not hold one plugin folder.');
      const before = existsSync(to) ? this.keep(to, `${basename(to)}-before-restore`) : '';
      if (existsSync(to)) rmSync(to, { recursive: true, force: true });
      copyExact(join(from, inside[0]), to);
      return before;
    },
  };
}
