/**
 * One sync round between this Mac's settings and the shared file.
 *
 * Talks to the app only through two narrow functions passed in (`settings.describe` and
 * `settings.replace` of the app's settings service, plus a map of entry ids to package names),
 * so it can be tested with a fake.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  FILE_NAME,
  deepMerge,
  digest,
  fieldDigests,
  mergeSection,
  onlyPaths,
  readShared,
  renderShared,
  secretPaths,
  withoutPaths,
  writeAtomic,
} from './core.mjs';

/** How many backups of replaced local settings to keep. */
const KEEP_BACKUPS = 30;

export class SharedSettingsEngine {
  /**
   * @param {object} options - see fields.
   * @param {{describe: Function, replace: Function}} options.settings - the app's settings service.
   * @param {() => Map<string,string>} options.entryNames - entry id to package name.
   * @param {string} options.folder - absolute shared folder ('' = off).
   * @param {string} options.dataDir - this Mac's own folder for the sync record and backups.
   * @param {(ns: string, name: string|undefined) => boolean} options.share - which entries to share.
   * @param {Map<string, string[][]>} options.skip - fields per entry that stay on this Mac.
   * @param {() => Date} [options.now] - clock.
   * @param {(file: string) => void} [options.onPlaceholder] - asked to download an iCloud placeholder.
   */
  constructor({ settings, entryNames, folder, dataDir, share, skip, now = () => new Date(), onPlaceholder }) {
    this.settings = settings;
    this.entryNames = entryNames;
    this.folder = folder;
    this.dataDir = dataDir;
    this.share = share;
    this.skip = skip;
    this.now = now;
    this.onPlaceholder = onPlaceholder;
    this.status = { state: folder ? 'starting' : 'off', at: undefined, problems: [], warnings: [], applied: [], exported: [], conflicts: [], shared: [] };
  }

  /** Path of the shared file, or '' when off. */
  get file() {
    return this.folder ? join(this.folder, FILE_NAME) : '';
  }

  /** Path of this Mac's sync record. */
  get stateFile() {
    return join(this.dataDir, 'state.json');
  }

  /** @returns {{file: string, sections: Record<string, Record<string,string>>}} sync record for the current file. */
  loadState() {
    try {
      const data = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      if (data?.file === this.file && data.sections && typeof data.sections === 'object') return data;
    } catch {
      // No record yet, or unreadable: start fresh (the file wins on first contact).
    }
    return { file: this.file, sections: {} };
  }

  /** @param {object} state - sync record. */
  saveState(state) {
    writeAtomic(this.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }

  /**
   * Keep a copy of this Mac's settings for one entry before the file replaces them.
   * @param {string} ns - entry id.
   * @param {object} values - settings as they were.
   */
  backup(ns, values) {
    const dir = join(this.dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    writeAtomic(join(dir, `${stamp}-${ns}.json`), `${JSON.stringify(values, null, 2)}\n`);
    const files = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    for (const name of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      try {
        unlinkSync(join(dir, name));
      } catch {
        // Best effort.
      }
    }
  }

  /**
   * Finish a round with a status.
   * @param {string} state - short state word.
   * @param {object} [extra] - fields to merge.
   * @returns {object} the status.
   */
  finish(state, extra = {}) {
    this.status = { ...this.status, applied: [], exported: [], conflicts: [], problems: [], warnings: [], ...extra, state, at: this.now().toISOString() };
    return this.status;
  }

  /**
   * Run one round: read the file, merge every shared entry, apply here, write the file.
   * @returns {Promise<object>} status, with `retry: true` when the file changed under us.
   */
  async run() {
    if (!this.folder) return this.finish('off');
    if (!existsSync(this.folder)) {
      return this.finish('waiting', { problems: [`The folder ${this.folder} is not there (yet). If it is in iCloud Drive, it may still be downloading.`] });
    }
    const file = this.file;
    const read = readShared(file);
    if (read.error) return this.finish('blocked', { problems: [read.error] });
    if (!read.exists && existsSync(join(this.folder, `.${FILE_NAME}.icloud`))) {
      this.onPlaceholder?.(file);
      return this.finish('waiting', { problems: ['iCloud has not downloaded settings.json to this Mac yet.'] });
    }
    const fileSettings = read.exists ? read.settings : {};

    const names = this.entryNames();
    const redacted = this.settings.describe({ redactSecrets: true });
    const raw = new Map(this.settings.describe().map((row) => [row.ns, row]));
    const state = this.loadState();
    const next = {};
    const applied = [];
    const exported = [];
    const conflicts = [];
    const problems = [];
    const shared = [];

    for (const desc of redacted) {
      const ns = desc.ns;
      if (!this.share(ns, names.get(ns))) continue;
      shared.push(ns);
      const user = raw.get(ns)?.user ?? {};
      const keep = [
        ...(this.skip.get(ns) ?? []),
        ...(desc.secrets ?? []).map((secret) => secret.path.map(String)),
        ...secretPaths(user),
      ];
      const local = withoutPaths(user, keep);
      const fromFile = fileSettings[ns] === undefined ? undefined : withoutPaths(fileSettings[ns], keep);
      const result = mergeSection(local, fromFile, state.sections[ns]);
      if (result.toLocal) {
        try {
          this.backup(ns, user);
          await this.settings.replace(ns, deepMerge(result.merged, onlyPaths(user, keep)), desc.revision);
          applied.push(ns);
        } catch (error) {
          problems.push(`Could not apply the shared settings of "${ns}" here: ${error?.message ?? error}`);
          continue;
        }
      }
      for (const field of result.conflicts) conflicts.push(`${ns}.${field}`);
      next[ns] = result.merged;
      if (result.toFile) exported.push(ns);
    }

    if (exported.length) {
      // Someone else (the other Mac, through iCloud) may have written meanwhile: never overwrite that.
      const again = readShared(file);
      if (again.error || again.exists !== read.exists || (again.exists && again.digest !== read.digest)) {
        return this.finish('retry', { retry: true, applied, warnings: ['settings.json changed during the sync; trying again.'] });
      }
      writeAtomic(file, renderShared({ ...fileSettings, ...next }, this.now()));
    }
    for (const [ns, section] of Object.entries(next)) state.sections[ns] = fieldDigests(section);
    this.saveState(state);

    const warnings = [];
    try {
      const copies = readdirSync(this.folder).filter((name) => name !== FILE_NAME && /^settings[ (].*\.json$/i.test(name));
      if (copies.length) warnings.push(`iCloud made conflict copies (${copies.join(', ')}). The app uses settings.json only; delete the copies once you have checked them.`);
    } catch {
      // Folder listing is only for this warning.
    }
    if (conflicts.length) warnings.push(`Changed on both Macs; the shared copy was kept: ${conflicts.join(', ')}. This Mac's values are in ${join(this.dataDir, 'backups')}.`);
    return this.finish(problems.length ? 'partly' : 'ok', { applied, exported, conflicts, problems, warnings, shared, fileDigest: digest(next) });
  }
}
