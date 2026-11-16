/**
 * Format cards: one small Markdown file per kind of piece, saying its shape and where the sources go.
 * The built-in cards are written into Content's formats folder the first time they are needed, and are
 * then the owner's to edit; a card he changed is never written over. A custom card is saved only when
 * the owner approved it.
 *
 *   # Blog post
 *   id: blog-post
 *   sources: links      (links: links in the text and the sources page; page: the sources page only;
 *                        notes: the show notes; description: the video description)
 *   spoken: no
 *   ---
 *   What the writer is told about the shape.
 */
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE_PLACES = ['links', 'page', 'notes', 'description'];

export const BUILT_IN = [
  { id: 'blog-post', title: 'Blog post', sources: 'links', spoken: false, shape: 'An opening that gives the point, sections with headings, a close. Plain words, the strongest material first. Links to sources in the text where a claim is stated; the sources page is linked at the end.' },
  { id: 'article', title: 'Article', sources: 'links', spoken: false, shape: 'The finding first, then the evidence, then the responses of those concerned, then what is still unknown. Every claim attributed as its standing says. Links to sources in the text; the sources page at the end.' },
  { id: 'story', title: 'Story', sources: 'page', spoken: false, shape: 'A narrative told in scenes and in order. Words in quotation marks are copied exactly from a source and cited. Nothing invented is put on a real, named person: no words, no acts, no thoughts. A scene that is reconstructed is labelled "reconstructed". A piece that is fiction is labelled as fiction. The sources page says what is reconstructed.' },
  { id: 'talking-video', title: 'Talking outline, video', sources: 'description', spoken: true, shape: 'Not a script: an opening line, then the points in order, each with the facts under it and what to show on screen, then a close. Each point shows its standing as a tag, such as [Established] or [Claimed by X], so the speaker knows how to phrase it. Exact wording only where precision matters: numbers, names, dates and quotes. Detailed: a few bullet facts under each point.' },
  { id: 'talking-podcast', title: 'Talking outline, podcast', sources: 'notes', spoken: true, shape: 'Not a script: an opening line, the points in order with the facts under each and questions to raise, then a close. No visuals. Each point shows its standing as a tag. Exact wording only for numbers, names, dates and quotes. Detailed: a few bullet facts under each point.' },
  { id: 'full-script', title: 'Full script', sources: 'description', spoken: true, shape: 'Word for word, to be read out. Written only because the owner asked for a full script. Sources go where they go for the outline it replaces.' },
];

/** Read one card's text. @returns {object | undefined} the card. */
export function parseCard(text, fallbackId = '') {
  const [head, ...rest] = String(text ?? '').split(/\n---\n/);
  const lines = head.split('\n');
  const title = (lines.find((line) => line.startsWith('# ')) ?? '').slice(2).trim();
  const field = (name) => (lines.find((line) => line.toLowerCase().startsWith(`${name}:`)) ?? '').slice(name.length + 1).trim();
  const id = (field('id') || fallbackId).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const shape = rest.join('\n---\n').trim();
  if (!id || !shape) return undefined;
  const sources = SOURCE_PLACES.includes(field('sources')) ? field('sources') : 'page';
  return { id, title: title || id, sources, spoken: /^yes$/i.test(field('spoken')), shape };
}

/** A card as its file's text. */
export function cardText(card) {
  return `# ${card.title}\nid: ${card.id}\nsources: ${card.sources}\nspoken: ${card.spoken ? 'yes' : 'no'}\n---\n${card.shape.trim()}\n`;
}

/** Write a new file, never replacing one. @returns {boolean} whether it was written. */
function writeNew(path, text) {
  let fd;
  try {
    fd = openSync(path, 'wx', 0o600);
  } catch {
    return false;
  }
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * The formats folder.
 * @param {() => string} folderOf - where the cards are kept ('' when there is none: built-ins only).
 * @returns {{list: () => object[], get: (id: string) => object | undefined, save: (card: object) => string}} the cards.
 */
export function openFormats(folderOf) {
  const folder = () => {
    const dir = String(folderOf() ?? '');
    if (!dir) return '';
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (lstatSync(dir).isSymbolicLink()) throw new Error('The formats folder is a link; Content does not write through links.');
    // The built-in cards become files the owner can edit; one he changed is never written over.
    for (const card of BUILT_IN) writeNew(join(dir, `${card.id}.md`), cardText(card));
    return dir;
  };
  const fromFiles = () => {
    let dir = '';
    try {
      dir = folder();
    } catch {
      dir = '';
    }
    const cards = new Map(BUILT_IN.map((card) => [card.id, { ...card, file: '' }]));
    if (!dir) return [...cards.values()];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.md')).sort()) {
      try {
        const path = join(dir, name);
        if (!lstatSync(path).isFile()) continue;
        const card = parseCard(readFileSync(path, 'utf8'), name.replace(/\.md$/, ''));
        if (card) cards.set(card.id, { ...card, file: path });
      } catch {
        /* an unreadable card is left out */
      }
    }
    return [...cards.values()];
  };
  return {
    list: fromFiles,
    get: (id) => fromFiles().find((card) => card.id === String(id ?? '').toLowerCase()),
    /** Save a new custom card. @returns {string} its file. */
    save(card) {
      const dir = folder();
      if (!dir) throw new Error('There is no formats folder.');
      const clean = parseCard(cardText({ title: String(card.title ?? '').slice(0, 80), id: card.id ?? card.title, sources: card.sources, spoken: card.spoken === true, shape: String(card.shape ?? '').slice(0, 4000) }));
      if (!clean) throw new Error('A card needs a name and a shape.');
      const path = join(dir, `${clean.id}.md`);
      if (!writeNew(path, cardText(clean))) throw new Error(`A card called ${clean.id} is already there; give the new one another name.`);
      return path;
    },
  };
}
