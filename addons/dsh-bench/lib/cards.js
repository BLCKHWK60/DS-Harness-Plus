/**
 * The Bench folder: one card and one logbook per device.
 *
 *   <Bench folder>/
 *     devices/<device>/card.json   what Bench reads
 *     devices/<device>/card.md     the same card, for people
 *     devices/<device>/logbook.md  every action, added and never changed
 *     recipes/                     one per family of device (later steps)
 *
 * Rules, enforced here:
 * - Bench writes only inside its folder, and never through a link.
 * - A card's permissions start at Read and Ask-Auto and are never set from what the model sends.
 * - Logbook entries are appended; nothing in a logbook is rewritten.
 * - Passwords, keys and other secrets are masked in cards and logbooks.
 */
import { familyOfText } from './gate.js';
import { closeSync, constants as fsConstants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join, sep } from 'node:path';

/** The four levels of touch, and the permission modes, with the names the plan gives them. */
export const LEVELS = [
  { id: 'identify', label: 'Identify' },
  { id: 'read', label: 'Read' },
  { id: 'adjust', label: 'Adjust' },
  { id: 'write', label: 'Write' },
];
export const ASKS = [
  { id: 'restricted', label: 'Restricted' },
  { id: 'ask-auto', label: 'Ask-Auto' },
  { id: 'full-auto', label: 'Full Auto' },
];
/** Where every new card starts. Only the user changes it (a later step adds the controls). */
export const START_PERMISSIONS = Object.freeze({ level: 'read', asks: 'ask-auto' });

/**
 * Add lines to a log file, never through a link: the file is opened with O_NOFOLLOW, so a link put in
 * its place is refused rather than followed.
 */
export function appendNoLink(file, text) {
  const fd = openSync(file, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

/** The card's fields the model may fill in, with their labels on card.md. */
export const FIELDS = [
  { id: 'maker', label: 'Maker' },
  { id: 'model', label: 'Model' },
  { id: 'chip', label: 'Chip' },
  { id: 'firmware', label: 'Firmware version' },
  { id: 'connects', label: 'How it connects' },
  { id: 'identifiers', label: 'Identifiers' },
  { id: 'manual', label: 'Manual and documentation' },
  { id: 'firmwareSource', label: 'Where its firmware comes from' },
  { id: 'recipe', label: 'Recipe' },
  { id: 'recovery', label: 'Recovery path' },
  { id: 'protectedParts', label: 'Protected parts' },
  { id: 'notes', label: 'Notes' },
];
export const FIELD_MAX = 2000;
export const ENTRY_MAX = 8000;

/** Names of secrets, as a whole word or a part of an identifier (WIFI_PASSWORD, ap_psk, client-secret). */
const SECRET_NAMES = String.raw`pass(?:word|wd|phrase)?|pwd|psk|wpa[_-]?(?:key|psk|passphrase)|secret|token|api[_-]?key|auth[_-]?key|access[_-]?key|private[_-]?key|pin`;
/** A named secret and its value: `password: x`, `"password": "x"`, `WIFI_PASS=x`, `#define WIFI_PASSWORD "x"`, `token is x`. Each try is bounded, so long input stays fast. */
const LABELLED = new RegExp(String.raw`(?<![A-Za-z0-9])((?:[A-Za-z0-9]{1,40}[_-]){0,4}(?:${SECRET_NAMES})(?:[_-][A-Za-z0-9]{1,40}){0,4})(["']?)(\s{0,8}[:=]\s{0,8}|\s{1,8}is\s{1,8}|\s{1,8}(?=["']))("[^"\n]{0,2000}"|'[^'\n]{0,2000}'|[^\s,;}\]"']{1,2000})`, 'gi');
const PRIVATE_BLOCK = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g;
/** A web address: a datasheet's or a release's address stays readable. */
const WEB_ADDRESS = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const LONG_RUN = /[A-Za-z0-9+/_-]{32,}={0,2}/g;

/** Long key-like runs: letters and digits, and one stretch of at least 20 without a / _ or -. A checksum after a word that names one stays. */
function maskRuns(text) {
  return text.replace(LONG_RUN, (run, offset, whole) => {
    const bare = run.replace(/=+$/, '');
    if (!/\d/.test(bare) || !/[A-Za-z]/.test(bare)) return run;
    if (Math.max(...bare.split(/[/_-]/).map((part) => part.length)) < 20) return run;
    if (/^[0-9a-fA-F]+$/.test(bare) && /(sha-?\d*|md5|checksum|hash|digest)\W{0,12}$/i.test(whole.slice(Math.max(0, offset - 24), offset))) return run;
    return '[masked]';
  });
}

/**
 * Mask what looks like a secret: named values (`password: x`, `"psk": "x"`, `WIFI_PASS=x`), private key
 * blocks, and long key-like runs outside web addresses. It takes time in step with the length of the text.
 * @param {unknown} value - a text.
 * @returns {string} the text with secrets replaced by [masked].
 */
export function mask(value) {
  const text = String(value ?? '')
    .replace(PRIVATE_BLOCK, '[masked private key]')
    .replace(LABELLED, (_all, key, quote, between) => `${key}${quote}${between}[masked]`);
  let out = '';
  let last = 0;
  for (const found of text.matchAll(WEB_ADDRESS)) {
    out += maskRuns(text.slice(last, found.index)) + found[0];
    last = found.index + found[0].length;
  }
  return out + maskRuns(text.slice(last));
}

/** Cut first (a tool call's lengths are not checked by the app), then mask, then cut to size. */
const clip = (value, max = FIELD_MAX) => mask(String(value ?? '').slice(0, max * 2).replace(/\r\n?/g, '\n').trim()).slice(0, max);

/**
 * A device's folder name.
 * @param {unknown} name - the name the user gave the device.
 * @returns {string} lowercase words joined by dashes.
 */
export function slugOf(name) {
  const slug = String(name ?? '').slice(0, 400).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  // Cut by characters, never inside one.
  return Array.from(slug).slice(0, 60).join('').replace(/-+$/, '');
}

const stamp = (at) => at.toISOString().slice(0, 16).replace('T', ' ');

/** A folder inside the Bench folder, made when missing; never a link. */
function folderIn(root, ...pieces) {
  let path = root;
  for (const piece of pieces) {
    path = join(path, piece);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      stat = undefined;
    }
    if (stat?.isSymbolicLink()) throw new Error(`${piece} in the Bench folder is a link; Bench does not write through links.`);
    if (stat && !stat.isDirectory()) throw new Error(`${piece} in the Bench folder is a file, not a folder.`);
    if (!stat) mkdirSync(path, { mode: 0o700 });
  }
  // Right before use: the folder still leads inside the Bench folder.
  const base = realpathSync.native(root);
  if (path !== root && !realpathSync.native(path).toLowerCase().startsWith(`${base.toLowerCase()}${sep}`)) throw new Error('A folder inside the Bench folder now leads somewhere else; nothing was written.');
  return path;
}

/** Write a file in full by way of a new file beside it, so a crash never leaves half a card. Never through a link. */
function replaceFile(path, text) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`${path} is a link; Bench does not write through links.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
}

/** The kinds of device a card is linked to, as people read them. */
const LINK_KINDS = { usb: 'USB device', mac: 'ESP32 chip with MAC', adb: 'phone with serial' };

/** @returns {string} the devices a card is linked to, or that none is yet. */
export function linkedText(card) {
  const bound = card?.permissions?.bound ?? {};
  const parts = Object.entries(LINK_KINDS).filter(([kind]) => bound[kind]?.id).map(([kind, label]) => `${label} ${bound[kind].label || bound[kind].id}`);
  return parts.length > 0 ? parts.join('; ') : 'no device yet (Bench links it the first time it is used, with your yes)';
}

/** The card for people. */
export function cardText(card) {
  const level = LEVELS.find((entry) => entry.id === card.permissions?.level)?.label ?? 'Read';
  const asks = ASKS.find((entry) => entry.id === card.permissions?.asks)?.label ?? 'Ask-Auto';
  const rows = FIELDS.filter((field) => field.id !== 'protectedParts' && field.id !== 'notes' && card[field.id])
    .map((field) => `| ${field.label} | ${String(card[field.id]).replace(/\|/g, '\\|').replace(/\n/g, '<br>')} |`);
  return [
    `# ${card.name}`,
    '',
    rows.length > 0 ? ['| | |', '| --- | --- |', ...rows].join('\n') : 'Nothing is known about this device yet.',
    '',
    '## Permissions',
    '',
    `- Highest level: ${level} (the levels are Identify, Read, Adjust and Write)`,
    `- How it asks: ${asks}`,
    `- Protected parts: ${card.protectedParts ? card.protectedParts.replace(/\n/g, '; ') : 'none named yet'}${card.permissions?.ranges ? ` · protected by you: ${card.permissions.ranges}` : ''}`,
    `- Dry run by default: ${card.permissions?.dryRun === true ? 'yes' : 'no'}`,
    `- Opening its serial port: ${card.permissions?.portAgreed === true ? 'agreed by you (opening it restarts some boards)' : 'not agreed yet: Bench asks before the first open'}`,
    `- Linked to: ${linkedText(card)}`,
    ...(card.permissions?.lookOnly ? [`- Look-only: one of the ${card.permissions.lookOnly}. Bench only reads it; only you can lift this, on Settings → Bench.`] : []),
    ...(card.notes ? ['', '## Notes', '', card.notes] : []),
    '',
    `Made ${stamp(new Date(card.created))} UTC, updated ${stamp(new Date(card.updated))} UTC. Kept by Bench; the logbook is logbook.md beside this file.`,
    '',
  ].join('\n');
}

/** The undo list for people. */
export function undoText(card, list) {
  const lines = list.map((entry) => `- ${entry.undone ? '~~' : ''}${new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${entry.what}: ${entry.old === null ? '(not set)' : entry.old} → ${entry.new}${entry.undone ? '~~ (set back)' : ''}`);
  return [`# Undo list: ${card.name}`, '', 'Every change Bench made that can be set back, newest last. "Undo last" and "Undo all since" set them back, newest first.', '', ...(lines.length > 0 ? lines : ['Nothing yet.']), ''].join('\n');
}

/**
 * The Bench folder.
 * @param {() => string} folderOf - where it is (it can change in Settings).
 * @returns {object} the cards and logbooks.
 */
export function openBench(folderOf) {
  const root = () => {
    const folder = String(folderOf() ?? '').trim();
    if (!folder) throw new Error('There is no Bench folder. Set one in Settings → Bench.');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    if (lstatSync(folder).isSymbolicLink()) throw new Error('The Bench folder is a link; Bench does not write through links. Pick a real folder in Settings → Bench.');
    return folder;
  };
  const devicesDir = () => folderIn(root(), 'devices');
  /** Where the cards are, without making anything: reading never creates the Bench folder. */
  const devicesPath = () => {
    const folder = String(folderOf() ?? '').trim();
    return folder ? join(folder, 'devices') : '';
  };
  const readCard = (slug) => {
    if (!devicesPath()) return undefined;
    try {
      const card = JSON.parse(readFileSync(join(devicesPath(), slug, 'card.json'), 'utf8'));
      return card && typeof card === 'object' && typeof card.name === 'string' ? { ...card, slug } : undefined;
    } catch {
      return undefined;
    }
  };
  const all = () => {
    let names = [];
    try {
      names = devicesPath() ? readdirSync(devicesPath(), { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];
    } catch {
      names = [];
    }
    return names.map(readCard).filter(Boolean);
  };
  /** The card a name means: its folder name, or the same name in other letters. */
  const find = (name) => {
    const slug = slugOf(name);
    if (!slug) return undefined;
    return readCard(slug) ?? all().find((card) => slugOf(card.name) === slug || card.name.toLowerCase() === String(name).trim().toLowerCase());
  };
  const logFile = (slug) => join(devicesPath(), slug, 'logbook.md');
  const entries = (slug) => {
    try {
      return readFileSync(logFile(slug), 'utf8').split(/\n(?=## \d+\. )/).filter((part) => /^## \d+\. /.test(part));
    } catch {
      return [];
    }
  };
  /** Append one entry; the logbook is never rewritten. @returns {number} its number. */
  const append = (card, title, lines, at) => {
    folderIn(root(), 'devices', card.slug);
    const file = logFile(card.slug);
    if (!existsSync(file)) {
      // `wx`: a logbook is made once, never replaced.
      let fd;
      try {
        fd = openSync(file, 'wx', 0o600);
        writeSync(fd, `# Logbook: ${card.name}\n\nEvery action on this device, newest last. Entries are added and never changed.\n`);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
    if (lstatSync(file).isSymbolicLink()) throw new Error('The logbook is a link; Bench does not write through links.');
    const number = entries(card.slug).length + 1;
    const body = lines.filter(([, value]) => value).map(([label, value]) => `- ${label}: ${clip(value, ENTRY_MAX).replace(/\n/g, '\n  ')}`).join('\n');
    appendNoLink(file, `\n## ${number}. ${stamp(at)} UTC: ${clip(title, 200).replace(/\n/g, ' ')}\n\n${body}\n`);
    return number;
  };

  /** A small JSON list kept in a device's folder (backups, undo). */
  const readList = (card, file) => {
    try {
      const value = JSON.parse(readFileSync(join(devicesPath(), card.slug, file), 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const writeList = (card, file, list) => {
    replaceFile(join(folderIn(root(), 'devices', card.slug), file), `${JSON.stringify(list.slice(-500), null, 2)}\n`);
    return list;
  };
  const writePermissions = (card, next, before, at, title) => {
    const updated = { ...card, permissions: next, updated: at.getTime() };
    const dir = folderIn(root(), 'devices', card.slug);
    const { slug: _slug, entries: _entries, ...stored } = updated;
    replaceFile(join(dir, 'card.json'), `${JSON.stringify(stored, null, 2)}\n`);
    replaceFile(join(dir, 'card.md'), cardText(updated));
    const show = (value) => `level ${value.level ?? 'read'}, asks ${value.asks ?? 'ask-auto'}, dry run ${value.dryRun === true ? 'yes' : 'no'}, protected ${value.ranges || 'none'}, port ${value.portAgreed === true ? 'agreed' : 'not agreed'}, linked to ${linkedText({ permissions: value })}${value.lookOnly ? `, look-only (${value.lookOnly})` : ''}`;
    append(updated, title, [['Before', show(before)], ['After', show(next)]], at);
    return updated;
  };

  return {
    root,
    /** @returns {string} where the Bench folder is, without making it. */
    where: () => String(folderOf() ?? '').trim(),
    /** @returns {object[]} every card, newest change first. */
    list() {
      return all().sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)).map((card) => ({ ...card, entries: entries(card.slug).length }));
    },
    /** @returns {{card: object, last: string[]} | undefined} one card and its newest logbook entries. */
    get(name, last = 5) {
      const card = find(name);
      return card ? { card, last: entries(card.slug).slice(-last) } : undefined;
    },
    /**
     * Make a card, or update the fields given. Permissions are never taken from `fields`.
     * @returns {{card: object, made: boolean, changed: string[], file: string}} what happened.
     */
    saveCard(fields, at = new Date()) {
      const name = clip(fields?.name, 80).replace(/\n/g, ' ');
      const slug = slugOf(name);
      if (!slug) throw new Error('Give the device a name, such as "ESP32 board 1" or "Living room router".');
      const had = find(name);
      const card = had ? { ...had } : { name, slug, created: at.getTime(), permissions: { ...START_PERMISSIONS } };
      const changed = [];
      for (const field of FIELDS) {
        if (fields?.[field.id] === undefined) continue;
        const value = Array.isArray(fields[field.id]) ? fields[field.id].map((item) => clip(item, 200)).filter(Boolean).join(', ') : clip(fields[field.id]);
        if (value && value !== card[field.id]) {
          card[field.id] = value;
          changed.push(field.label.toLowerCase());
        }
      }
      if (had && changed.length === 0) return { card, made: false, changed, file: join(devicesDir(), card.slug, 'card.md') };
      card.updated = at.getTime();
      card.permissions = had?.permissions && LEVELS.some((entry) => entry.id === had.permissions.level) && ASKS.some((entry) => entry.id === had.permissions.asks) ? had.permissions : { ...START_PERMISSIONS };
      // A card whose words name a look-only family is marked so, and stays so whatever its words say later.
      const family = (had ? familyOfText(had) : '') || familyOfText(card);
      const marked = Boolean(family) && !card.permissions.lookOnly;
      if (marked) card.permissions = { ...card.permissions, lookOnly: family };
      const dir = folderIn(root(), 'devices', card.slug);
      const { slug: _slug, ...stored } = card;
      replaceFile(join(dir, 'card.json'), `${JSON.stringify(stored, null, 2)}\n`);
      replaceFile(join(dir, 'card.md'), cardText(card));
      append(card, had ? 'Card updated' : 'Card made', [['Changed', had ? changed.join(', ') : 'new card'], ['Permissions', had ? '' : 'start at Read and Ask-Auto; only the user changes them'], ['Look-only', marked ? `marked: one of the ${family}; Bench only reads it, and only the user lifts this on Settings → Bench` : '']], at);
      return { card, made: !had, changed, file: join(dir, 'card.md') };
    },
    /**
     * Add a logbook entry to a device that has a card.
     * @returns {number} the entry's number.
     */
    addLog(name, { title, asked, done, found, next }, at = new Date()) {
      const card = find(name);
      if (!card) throw new Error(`There is no card for "${clip(name, 80)}". Make one with bench_card first.`);
      if (![asked, done, found].some((value) => String(value ?? '').trim())) throw new Error('Say what was asked, what was done or what was found.');
      return append(card, title || 'Note', [['Asked', asked], ['Done', done], ['Found', found], ['Next', next], ['Commands sent to the device', 'none'], ['Signed off', 'no']], at);
    },
    /** The card a name means, or undefined. */
    find,
    /**
     * An entry Bench itself writes for an action above Identify: the commands it ran, before and after.
     * @returns {number} the entry's number.
     */
    record(card, { title, asked, done, found, before, after, check, commands, next }, at = new Date()) {
      return append(card, title, [['Asked', asked], ['Done', done], ['Before', before], ['After', after], ['Found', found], ['Check', check], ['Next', next], ['Commands sent to the device', commands && commands.length > 0 ? commands.join('\n') : 'none'], ['Signed off', 'no']], at);
    },
    /**
     * A folder inside a device's folder (logs, backups, firmware), made when missing; never through a link.
     * @returns {string} its path.
     */
    deviceFolder(card, sub) {
      if (!/^[a-z]{1,20}$/.test(sub)) throw new Error('not a device folder');
      return folderIn(root(), 'devices', card.slug, sub);
    },
    /**
     * The user's own settings for a device, from Settings → Bench: its highest level, how it asks, dry
     * run by default, the parts they protect. Never from the model.
     */
    setPermissions(name, { level, asks, dryRun, ranges, clearLookOnly = false }, at = new Date()) {
      const card = find(name);
      if (!card) throw new Error(`There is no card for "${clip(name, 80)}".`);
      if (!LEVELS.some((entry) => entry.id === level)) throw new Error('Pick a level: Identify, Read, Adjust or Write.');
      if (!ASKS.some((entry) => entry.id === asks)) throw new Error('Pick how it asks: Restricted, Ask-Auto or Full Auto.');
      const kept = String(ranges ?? '').trim().slice(0, 400);
      if (kept && !/^(\s*0x[0-9a-f]{1,8}\s*-\s*0x[0-9a-f]{1,8}\s*)([,;\n](\s*0x[0-9a-f]{1,8}\s*-\s*0x[0-9a-f]{1,8}\s*))*$/i.test(kept)) throw new Error('Protected parts are address ranges such as 0x9000-0xF000, separated by commas.');
      const before = card.permissions ?? {};
      const next = { ...before, level, asks, dryRun: dryRun === true, ranges: kept };
      if (clearLookOnly === true) delete next.lookOnly;
      const updated = writePermissions(card, next, before, at, 'Permissions changed by the user on Settings → Bench');
      // A device set to Write gets its firmware folder, where the user puts the file to be written.
      if (level === 'write') folderIn(root(), 'devices', card.slug, 'firmware');
      return updated;
    },
    /**
     * The user said yes to opening this device's serial port (it restarts some boards), for the USB
     * device on it: the card is linked to that device.
     */
    agreePort(card, device, at = new Date()) {
      const before = card.permissions ?? START_PERMISSIONS;
      return writePermissions(card, { ...before, portAgreed: true, bound: { ...(before.bound ?? {}), usb: { id: String(device.id), label: clip(device.label, 200), at: at.getTime() } } }, card.permissions ?? {}, at, `The user agreed to opening its serial port, and linked the card to ${clip(device.label, 200)}`);
    },
    /** Link the card to one device of a kind (mac: an ESP32 chip, adb: a phone), after the user's yes or a first read. */
    link(card, kind, device, at = new Date()) {
      if (!LINK_KINDS[kind]) throw new Error('not a kind of link');
      const before = card.permissions ?? START_PERMISSIONS;
      return writePermissions(card, { ...before, bound: { ...(before.bound ?? {}), [kind]: { id: String(device.id), label: clip(device.label, 200), at: at.getTime() } } }, card.permissions ?? {}, at, `Linked to the ${LINK_KINDS[kind]} ${clip(device.label || device.id, 200)}`);
    },
    /** The user unlinks a card from its devices on Settings → Bench (a new cable, a new board): Bench asks again at the next use. */
    unlink(name, at = new Date()) {
      const card = find(name);
      if (!card) throw new Error(`There is no card for "${clip(name, 80)}".`);
      const before = card.permissions ?? START_PERMISSIONS;
      const { bound: _bound, portAgreed: _agreed, ...rest } = before;
      return writePermissions(card, rest, before, at, 'The user unlinked the card from its devices on Settings → Bench');
    },
    /** The firmware writes Bench made on the device, newest last. */
    writesOf(card) {
      return readList(card, 'writes.json');
    },
    addWrite(card, entry) {
      return writeList(card, 'writes.json', [...readList(card, 'writes.json'), entry]);
    },
    /** The device's backups, newest last. */
    backupsOf(card) {
      return readList(card, 'backups.json');
    },
    addBackup(card, entry) {
      return writeList(card, 'backups.json', [...readList(card, 'backups.json'), entry]);
    },
    /** The device's undo list: every Adjust that can be set back, newest last. */
    undoOf(card) {
      return readList(card, 'undo.json');
    },
    addUndo(card, entry) {
      const list = [...readList(card, 'undo.json'), { id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, undone: false, ...entry }];
      writeList(card, 'undo.json', list);
      replaceFile(join(folderIn(root(), 'devices', card.slug), 'undo.md'), undoText(card, list));
      return list.at(-1);
    },
    markUndone(card, ids, at = new Date()) {
      const list = readList(card, 'undo.json').map((entry) => (ids.includes(entry.id) ? { ...entry, undone: true, undoneAt: at.getTime() } : entry));
      writeList(card, 'undo.json', list);
      replaceFile(join(folderIn(root(), 'devices', card.slug), 'undo.md'), undoText(card, list));
    },
  };
}
