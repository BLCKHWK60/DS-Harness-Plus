/**
 * A device that is not in the catalogue (plan B11). Bench identifies it from what it reports, the model
 * looks for the maker's manual with the web tools the mode has, and drafts a recipe at the Read level:
 * how it is identified, what can be read and through which door, the sources. The draft is a plain file
 * the user reads; it becomes a recipe only when the user approves it on Settings → Bench (route only).
 * Adjust and Write steps never come from a draft: for a new recipe they are not built, and Bench says so.
 * Bench runs no step of a recipe by itself; it reads through its own doors.
 */
import { OFFICIAL, ownSource } from './esp32.js';
import { mask } from './cards.js';
import { clean } from './usb.js';

export const DRAFTS = 'recipe-drafts.json';
const slugOf = (text) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** A source of a draft: https only; marked when it is not the maker's or an official project's page. */
export function sourceOf(text, extra = []) {
  let url;
  try {
    url = new URL(String(text ?? '').trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  const official = OFFICIAL.some((entry) => entry.host.test(url.hostname.toLowerCase()) && (!entry.path || entry.path.test(url.pathname))) || ownSource(url, extra);
  return { url: url.href.slice(0, 400), official };
}

/** @returns {string} the draft as a plain file. */
export function draftText(draft) {
  return [
    `# Recipe draft: ${draft.title}`,
    '',
    `Status: ${draft.status === 'approved' ? 'approved by you at the Read level' : draft.status === 'declined' ? 'declined by you' : 'a draft: it is not used until you approve it on Settings → Devices'}.`,
    `Made for: ${draft.device} · ${new Date(draft.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    '## How it is identified',
    '',
    draft.identify,
    '',
    '## What can be read, and through which door',
    '',
    ...draft.read.map((step) => `- ${step}`),
    '',
    '## Sources',
    '',
    ...(draft.sources.length ? draft.sources.map((source) => `- ${source.url}${source.official ? '' : ' (not the maker\'s or an official page: it may explain, it is never the source of a step)'}`) : ['- none given']),
    '',
    '## Adjust and Write',
    '',
    'Not built for a new recipe. Devices adds them only from the maker\'s or the open project\'s own documentation, when you ask, in a later version.',
    '',
  ].join('\n');
}

/**
 * @param {{bench: object, kit: object, sources: () => object[], now?: () => Date}} options - the Bench folder and the shared helpers.
 * @returns {object} the tool.
 */
export function buildRecipeTool({ bench, kit, sources = () => [], now = () => new Date() }) {
  const { common, safely, cardOf } = kit;
  const drafts = () => {
    const list = bench.readTop(DRAFTS);
    return Array.isArray(list) ? list : [];
  };
  const text = { type: 'string', maxLength: 1500 };
  return {
    name: 'bench_recipe',
    description: 'For a device that is not in the catalogue (bench_catalogue describe found no family). action "draft": a Read-level recipe from what the device reports and the maker\'s manual you found with the web tools: how it is identified, what can be read and through which of Devices\' doors, and the sources (the maker\'s pages first; a forum may explain, never be a step). It is saved as a draft the user reads, and used only after the user approves it on Settings → Devices. Adjust and Write steps never come from a draft: for a new recipe they are not built. action "list": the drafts and their status. Devices never runs a step of a recipe by itself.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['draft', 'list'] },
        name: { type: 'string', maxLength: 80, description: 'The device\'s card.' },
        title: { type: 'string', maxLength: 120, description: 'The kind of device, such as "Victron SmartShunt".' },
        identify: text,
        read: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 400 } },
        sources: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 400 } },
      },
      required: ['action'],
      additionalProperties: false,
    },
    ...common,
    execute: safely(async (args) => {
      if (args.action === 'list') {
        const list = drafts();
        if (list.length === 0) return 'No recipe drafts yet.';
        return ['Recipe drafts (the user approves them on Settings → Devices):', ...list.map((draft) => `- ${draft.id}: ${draft.title} for ${draft.device}, ${draft.status}`)].join('\n');
      }
      if (args.action !== 'draft') throw new Error('The action is draft or list.');
      const card = cardOf(args.name);
      const title = clean(args.title, 120);
      if (!title) throw new Error('Give the kind of device as the title.');
      const identify = mask(clean(args.identify, 1500));
      const read = (Array.isArray(args.read) ? args.read : []).map((step) => mask(clean(step, 400))).filter(Boolean).slice(0, 20);
      if (!identify || read.length === 0) throw new Error('A draft needs how the device is identified and at least one thing that can be read.');
      const found = (Array.isArray(args.sources) ? args.sources : []).map((source) => sourceOf(source, sources())).filter(Boolean);
      const id = `${slugOf(title) || 'device'}-${now().getTime().toString(36)}`;
      const draft = { id, title, device: card.name, at: now().getTime(), identify, read, sources: found, status: 'draft' };
      bench.writeTop(DRAFTS, [...drafts(), draft].slice(-100));
      bench.writeOnce('recipes/drafts', `${id}.md`, draftText(draft));
      bench.record(card, { title: 'Recipe draft made', asked: `a recipe for ${title}`, done: `saved as recipes/drafts/${id}.md`, next: 'the user reads it and approves or declines it on Settings → Devices' }, now());
      return `Saved the draft "${title}" (${id}) as recipes/drafts/${id}.md, at the Read level. It is used only after the user approves it on Settings → Devices. Adjust and Write are not built for a new recipe.${found.some((source) => !source.official) ? ' Some sources are not the maker\'s pages: they are marked as explaining, never as a step.' : ''}`;
    }),
  };
}

/** The user's decision on a draft, from the page: approved (at the Read level) or declined. */
export function decideDraft(bench, id, approve, now = new Date()) {
  const list = bench.readTop(DRAFTS);
  const drafts = Array.isArray(list) ? list : [];
  const draft = drafts.find((entry) => entry.id === String(id));
  if (!draft) throw new Error('There is no such recipe draft.');
  const decided = { ...draft, status: approve ? 'approved' : 'declined', decided: now.getTime() };
  bench.writeTop(DRAFTS, drafts.map((entry) => (entry.id === draft.id ? decided : entry)));
  if (approve) bench.writeOnce('recipes', `custom-${draft.id}.md`, draftText(decided));
  return decided;
}
