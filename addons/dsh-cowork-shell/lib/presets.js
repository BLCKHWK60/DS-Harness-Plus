/**
 * Project types ("presets"): ready-made instructions for a kind of work. The ones that ship are
 * text files in this add-on's `presets` folder; the user's own are the same kind of file in the
 * app's data folder. A preset is a starting point: choosing one copies its instructions into the
 * project, where the user can change them freely.
 *
 * A preset file:
 *   ---
 *   id: research
 *   name: Research
 *   description: one line
 *   tools: data, finance      (optional: the shared tools this kind of work can use)
 *   search: off               (optional: new conversations start with Search switched off)
 *   ---
 *   the instructions
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BLANK = { id: 'blank', name: 'Blank', description: 'No instructions to start with. Cowork as it has always been.', tools: [], searchOff: false, instructions: '', own: false };
/** The order the shipped presets are offered in. */
export const ORDER = ['blank', 'research', 'learn', 'paperwork', 'plan', 'write'];
export const SHARED_TOOLS = ['data', 'finance'];
export const INSTRUCTIONS_MAX = 12000;
export const NAME_MAX = 40;
export const OWN_MAX = 40;
const OWN_PREFIX = 'my-';

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Read one preset file.
 * @param {string} text - the file's content.
 * @returns {{id: string, name: string, description: string, tools: string[], instructions: string} | undefined} the preset; undefined when the file is not one.
 */
export function parsePreset(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text ?? ''));
  if (!match) return undefined;
  const head = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) head[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
  }
  const id = String(head.id ?? '').toLowerCase();
  const name = clean(head.name, NAME_MAX);
  const instructions = match[2].replace(/\r/g, '').trim().slice(0, INSTRUCTIONS_MAX);
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(id) || !name || !instructions) return undefined;
  const tools = String(head.tools ?? '').split(',').map((tool) => tool.trim().toLowerCase()).filter((tool) => SHARED_TOOLS.includes(tool));
  return { id, name, description: clean(head.description, 200), tools: [...new Set(tools)], searchOff: String(head.search ?? '').toLowerCase() === 'off', instructions };
}

/** A preset as the text of its file. */
export function presetText({ id, name, description, tools = [], searchOff = false, instructions }) {
  return `---\nid: ${id}\nname: ${clean(name, NAME_MAX)}\ndescription: ${clean(description, 200)}\ntools: ${tools.filter((tool) => SHARED_TOOLS.includes(tool)).join(', ')}\n${searchOff ? 'search: off\n' : ''}---\n${String(instructions ?? '').replace(/\r/g, '').trim()}\n`;
}

const readFolder = (folder) => {
  const found = [];
  let names = [];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith('.md')).sort();
  } catch {
    return found;
  }
  for (const name of names) {
    try {
      const preset = parsePreset(readFileSync(join(folder, name), 'utf8'));
      if (preset) found.push(preset);
    } catch {
      /* an unreadable file is not a preset */
    }
  }
  return found;
};

/**
 * @param {string} shipped - this add-on's `presets` folder.
 * @param {string} own - the user's presets folder; '' when there is none.
 * @returns {object} listing, finding, saving and removing presets.
 */
export function openPresets(shipped, own) {
  const list = () => {
    const built = readFolder(shipped).filter((preset) => preset.id !== BLANK.id && !preset.id.startsWith(OWN_PREFIX)).map((preset) => ({ ...preset, own: false }));
    built.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
    // The user's own keep their place after the shipped ones and never replace one of them.
    const mine = own ? readFolder(own).filter((preset) => preset.id.startsWith(OWN_PREFIX)).map((preset) => ({ ...preset, own: true })) : [];
    mine.sort((a, b) => a.name.localeCompare(b.name));
    return [{ ...BLANK }, ...built, ...mine];
  };
  return {
    list,
    /** @param {unknown} id @returns {object | undefined} the preset with that id. */
    get: (id) => list().find((preset) => preset.id === String(id ?? '')),
    /**
     * Keep a set of instructions as a preset of the user's own. A name already in use among their
     * own presets is replaced; a shipped preset's name is refused.
     * @param {{name: unknown, description?: unknown, tools?: unknown, instructions: unknown}} input - what to keep.
     * @returns {object} the saved preset.
     */
    save({ name, description, tools, searchOff, instructions }) {
      if (!own) throw new Error('This app has no data folder to keep presets in.');
      const label = clean(name, NAME_MAX);
      const body = String(instructions ?? '').replace(/\r/g, '').trim().slice(0, INSTRUCTIONS_MAX);
      if (!label) throw new Error('Give the preset a name.');
      if (!body) throw new Error('There are no instructions to keep. Write some first.');
      const now = list();
      if (now.some((preset) => !preset.own && preset.name.toLowerCase() === label.toLowerCase())) throw new Error(`"${label}" is the name of a preset that comes with the app. Choose another name.`);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'preset';
      const id = `${OWN_PREFIX}${slug}`;
      if (!now.some((preset) => preset.id === id) && now.filter((preset) => preset.own).length >= OWN_MAX) throw new Error(`You have ${OWN_MAX} presets of your own. Remove one first.`);
      const preset = { id, name: label, description: clean(description, 200), tools: (Array.isArray(tools) ? tools : []).filter((tool) => SHARED_TOOLS.includes(tool)), searchOff: searchOff === true, instructions: body };
      mkdirSync(own, { recursive: true });
      const temp = join(own, `${id}.md.${process.pid}.tmp`);
      writeFileSync(temp, presetText(preset));
      renameSync(temp, join(own, `${id}.md`));
      return { ...preset, own: true };
    },
    /** Remove one of the user's own presets. Projects that used it keep their instructions. */
    remove(id) {
      const key = String(id ?? '');
      if (!own || !key.startsWith(OWN_PREFIX) || !/^[a-z0-9-]+$/.test(key)) throw new Error('Only a preset of your own can be removed.');
      const file = join(own, `${key}.md`);
      if (!existsSync(file)) return false;
      rmSync(file);
      return true;
    },
  };
}
