// Helpers for the installer scripts, run with the Node.js that ships inside the app.
//   range <app-version> <tiers.json>                  exit 0 if the app version is supported, 1 if not
//   plan <addons-dir> <tiers.json> <package.json> <core|everything|keep>
//        one line per add-on folder: folder, package name, tier, installed, include, new, off-after
//   labels <tiers.json>                                prints "name<TAB>Label" lines (Beta / Experimental only)
//   separate <tiers.json>                              folders of the add-ons that are their own download
//   data <tiers.json> <dsh-home>                       the Plus data folders that exist, "folder<TAB>what"
//   kept <tiers.json> <dsh-home>                       folders of YOURS that an uninstall never removes and that are worth naming (learned skills, plugins)
//   returning <tiers.json> <dsh-home>                  exit 0 if this app data folder shows an earlier Plus install (a marker an uninstall leaves, or Plus data folders)
//   version-state <app-version>                        prints "ok" for a readable version number, "unreadable" otherwise
// The list of tiers and the supported app range live in addon-tiers.json, the one place to edit.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const triple = (version) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

/** Whether an app version is inside the range the add-ons were written for (min up to, not including, below). */
export function inRange(version, range) {
  const v = triple(version), min = triple(range.min), below = triple(range.below);
  if (!v || !min || !below) return false;
  return compare(v, min) >= 0 && compare(v, below) < 0;
}

export function readTiers(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

/** What to do with every add-on folder in a download, for a choice of "core", "everything" or "keep". */
export function plan(addonsDir, tiers, profileFile, choice) {
  const deps = readJson(profileFile).dependencies ?? {};
  const rows = [];
  for (const folder of readdirSync(addonsDir).sort()) {
    const pkg = readJson(join(addonsDir, folder, 'package.json'));
    if (!pkg.dsh?.bundle) continue;
    const tier = tiers.addons?.[folder]?.tier ?? 'beta'; // an add-on nobody listed is treated with care: off
    const installed = pkg.name in deps;
    const include = installed || tier === 'core' || tier === 'beta' || (tier === 'experimental' && choice === 'everything');
    // A new add-on that is not Core stays off until the person switches it on. An add-on already installed is never touched.
    const offAfter = include && !installed && tier !== 'core';
    rows.push({ folder, name: pkg.name, tier, installed, include, isNew: !installed, offAfter });
  }
  return rows;
}

/** Marker an uninstall leaves, so a later install knows this person had Plus before. */
export const UNINSTALL_MARKER = join('backups', 'deepseek-harness-plus', 'uninstalled.txt');

/** Whether an app data folder shows an earlier Plus install: the uninstall marker, or a Plus data folder (older uninstallers leave no marker). */
export function returning(tiers, home) {
  if (existsSync(join(home, UNINSTALL_MARKER))) return true;
  for (const row of tiers.dataFolders ?? []) {
    try { if (lstatSync(join(home, row.folder)).isDirectory()) return true; } catch { /* not there */ }
  }
  return false;
}

const flag = (b) => (b ? 1 : 0);
export function main(argv) {
  const [cmd, ...a] = argv;
  if (cmd === 'range') {
    const tiers = readTiers(a[1]);
    return inRange(a[0], tiers.supportedApp) ? 0 : 1;
  }
  if (cmd === 'plan') {
    for (const r of plan(a[0], readTiers(a[1]), a[2], a[3])) {
      console.log([r.folder, r.name, r.tier, flag(r.installed), flag(r.include), flag(r.isNew), flag(r.offAfter)].join('\t'));
    }
    return 0;
  }
  if (cmd === 'labels') {
    const tiers = readTiers(a[0]);
    for (const [folder, info] of Object.entries(tiers.addons)) {
      if (info.tier === 'beta' || info.tier === 'experimental') console.log(`${folder}\t${tiers.tiers[info.tier].label}\t${info.label}`);
    }
    return 0;
  }
  if (cmd === 'separate') {
    for (const [folder, info] of Object.entries(readTiers(a[0]).addons)) if (info.tier === 'separate') console.log(folder);
    return 0;
  }
  if (cmd === 'data') {
    const tiers = readTiers(a[0]);
    for (const row of tiers.dataFolders ?? []) {
      const path = join(a[1], row.folder);
      // Only real folders directly inside the app data folder; a link is never followed.
      try { if (lstatSync(path).isDirectory() && existsSync(path)) console.log(`${row.folder}\t${row.what}`); } catch { /* not there */ }
    }
    return 0;
  }
  if (cmd === 'kept') {
    for (const row of readTiers(a[0]).dataNeverRemoved ?? []) {
      if (!row.listed) continue;
      try { if (lstatSync(join(a[1], row.folder)).isDirectory()) console.log(`${row.folder}\t${row.what}`); } catch { /* not there */ }
    }
    return 0;
  }
  if (cmd === 'returning') return returning(readTiers(a[0]), a[1]) ? 0 : 1;
  if (cmd === 'version-state') { console.log(triple(a[0]) ? 'ok' : 'unreadable'); return 0; }
  console.error('usage: plus-lib.mjs range|plan|labels|separate|data|kept|returning|version-state ...');
  return 2;
}

// Run as a command (a folder reached through a link, such as /tmp, counts too).
const ranAs = () => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return ''; } };
if (process.argv[1] && import.meta.url === ranAs()) process.exit(main(process.argv.slice(2)));
