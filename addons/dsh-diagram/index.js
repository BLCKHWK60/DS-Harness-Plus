/**
 * Diagram builder: the model describes a diagram, this add-on lays it out, draws
 * it as SVG, checks it, and saves it.
 *
 * Why this way: a model that writes SVG by hand gets positions and overlaps
 * wrong. Here it only says what is in the diagram (boxes, arrows, branches,
 * numbers, formulas). Text is measured, boxes are sized to it, arrows are routed
 * around boxes, and anything a reader would stumble over is reported back so the
 * model can fix it.
 *
 * Tool `diagram_draw`; skill `draw-diagram`; the chat shows the picture inline.
 * Kinds: flow, tree, sequence, timeline, chart (bars, lines, points, formulas).
 * Pictures are saved in a `diagrams` folder inside the conversation's folder.
 * Nothing is installed and nothing leaves the Mac.
 *
 * Service `diagrams` (apiVersion 1): `draw(description)`.
 * Routes: `GET /dsh-diagram/status`, `GET /dsh-diagram/svg` (header `x-dsh-diagram`),
 * `GET /dsh-diagram/list` (headers `x-dsh-session`, `x-dsh-from`, `x-dsh-to`: the drawings of one turn).
 */
import z from '@deepseek-ai/schemastery';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { draw } from './lib/draw.js';
import { CHARTS, KINDS, SHAPES } from './lib/spec.js';
import { COLORS } from './lib/svg.js';
import { SKILLS } from './skills.js';

export const name = 'dsh-diagram';
export const inject = ['tools'];

export const STATUS_PATH = '/dsh-diagram/status';
export const SVG_PATH = '/dsh-diagram/svg';
export const LIST_PATH = '/dsh-diagram/list';
export const ID_HEADER = 'x-dsh-diagram';
/** Every file this add-on writes carries this mark, and only such files are ever replaced. */
export const MARK = '<!-- dsh-diagram -->';
/** Picture files another add-on may hand over to be shown in the chat. */
const PICTURE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const THEMES = ['auto', 'light', 'dark'];

export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true).volatile(),
  /** Colours of the saved file: `auto` follows light or dark mode of whatever shows it. */
  theme: z.string().default('auto').volatile(),
  /** Name of the folder, inside the conversation's folder, that pictures are saved in. */
  folder: z.string().default('diagrams').volatile(),
  /** Save the picture as a file. Off shows it in the chat only. */
  save: z.boolean().default(true).volatile(),
  /** Register the draw-diagram skill. */
  skills: z.boolean().default(true),
});

/**
 * Plain value of a Config field that may be a live reference.
 * @param {unknown} value - field value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Read the settings as plain, checked values.
 * @param {object} config - live Config.
 * @returns {{enabled: boolean, theme: string, folder: string, save: boolean}} settings.
 */
export function readSettings(config) {
  const theme = String(plain(config.theme) ?? 'auto');
  const folder = String(plain(config.folder) ?? 'diagrams').trim().replace(/[^\w .-]+/g, '').replace(/^\.+/, '').slice(0, 40);
  return { enabled: plain(config.enabled) !== false, theme: THEMES.includes(theme) ? theme : 'auto', folder: folder || 'diagrams', save: plain(config.save) !== false };
}

/**
 * A file name made from a title: lower case, dashes, no surprises.
 * @param {string} text - a title or a name the model chose.
 * @returns {string} a safe name without an ending.
 */
export function slug(text) {
  const value = String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.svg$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return value || 'diagram';
}

/**
 * Choose where to save: the wished name if it is free or is one of our own files, otherwise the next free number.
 * @param {string} dir - the pictures folder.
 * @param {string} wanted - name without ending.
 * @param {boolean} replace - the model named the file itself, so it means to replace its earlier drawing.
 * @returns {string} the full path.
 */
export function savePath(dir, wanted, replace) {
  const ours = (file) => {
    try {
      return readFileSync(file, 'utf8').slice(0, 600).includes(MARK);
    } catch {
      return false;
    }
  };
  const first = join(dir, `${wanted}.svg`);
  if (!existsSync(first) || (replace && ours(first))) return first;
  for (let n = 2; n < 500; n += 1) {
    const next = join(dir, `${wanted}-${n}.svg`);
    if (!existsSync(next)) return next;
  }
  return join(dir, `${wanted}-${randomBytes(3).toString('hex')}.svg`);
}

const node = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Short id that arrows refer to.' },
    label: { type: 'string', description: 'Text in the box, 1 to 5 words.' },
    shape: { type: 'string', enum: SHAPES, description: 'box (default), round, pill for a start or end, diamond for a decision, note.' },
    color: { type: 'string', enum: COLORS },
    group: { type: 'string', description: 'Boxes with the same group get a frame with this name.' },
  },
  required: ['id'],
};

/** What the model may send. Kept loose on purpose: mistakes are answered with a sentence, not a schema error. */
export const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: KINDS, description: 'flow: boxes and arrows. tree: one root that branches. sequence: parties exchanging messages. timeline: events in order. chart: numbers or formulas.' },
    title: { type: 'string', description: 'What the diagram shows.' },
    name: { type: 'string', description: 'File name without ending. Use the same name again to replace your earlier drawing after fixing it.' },
    direction: { type: 'string', enum: ['down', 'right'], description: 'flow (default down) and tree (default right).' },
    nodes: { type: 'array', items: node, description: 'flow: the boxes.' },
    edges: {
      type: 'array',
      description: 'flow: the arrows.',
      items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string', description: '1 to 3 words.' }, dashed: { type: 'boolean' } }, required: ['from', 'to'] },
    },
    root: { type: 'object', description: 'tree: {"label": "...", "children": [{"label": "...", "children": [...]}]}.' },
    actors: { type: 'array', description: 'sequence: the parties, left to right.', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id'] } },
    steps: {
      type: 'array',
      description: 'sequence: in order. A message is {from, to, label, reply?}; a note is {note, over: [ids]}.',
      items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, reply: { type: 'boolean' }, note: { type: 'string' }, over: { type: 'array', items: { type: 'string' } } } },
    },
    events: { type: 'array', description: 'timeline: earliest first.', items: { type: 'object', properties: { when: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } }, required: ['when', 'title'] } },
    chart: { type: 'string', enum: CHARTS, description: 'chart: bar or line over categories; scatter or line over numbers; plot for formulas.' },
    categories: { type: 'array', items: { type: 'string' }, description: 'chart: names along the bottom.' },
    series: {
      type: 'array',
      description: 'chart: each {name, values} with one value per category, or {name, points} with [x, y] pairs. For a line over time, x is a date as text: ["2026-03-31", 12.5] or ["2026-03", 12.5]; the axis then shows dates.',
      items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } }, points: { type: 'array', items: { type: 'array', items: { type: ['number', 'string'] } } } } },
    },
    functions: { type: 'array', description: 'chart: formulas in x to plot, each {formula, name?}, for example "x^2 - 3".', items: { type: 'object', properties: { formula: { type: 'string' }, name: { type: 'string' } }, required: ['formula'] } },
    xMin: { type: 'number' },
    xMax: { type: 'number' },
    yMin: { type: 'number' },
    yMax: { type: 'number' },
    xLabel: { type: 'string' },
    yLabel: { type: 'string' },
  },
  required: ['kind'],
};

/**
 * The drawings of one turn of one conversation, newest version of each only: when the
 * model fixed a diagram and drew it again under the same file or title, the earlier one is left out.
 * @param {Array<{id: string, session: string, at: number, title: string, file: string}>} records - every drawing.
 * @param {string} session - the conversation.
 * @param {number} from - start of the turn, in milliseconds.
 * @param {number} to - end of the turn.
 * @returns {object[]} the drawings, in the order they were made.
 */
export function turnDrawings(records, session, from, to) {
  if (!session || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  const last = new Map();
  for (const row of records) {
    if (row.session !== session || row.at < from - 1500 || row.at > to + 1500) continue;
    const key = row.file || row.title;
    last.delete(key);
    last.set(key, row);
  }
  return [...last.values()];
}

/**
 * The answer the model reads after a drawing.
 * @param {object} result - from `draw`.
 * @param {{id: string, file?: string, note?: string}} saved - where it went.
 * @returns {string} text.
 */
export function answerText(result, saved) {
  const lines = [`Drawn: ${result.title} (${result.kind}, ${result.width} × ${result.height}). It is shown to the user in the chat.`];
  if (saved.file) lines.push(`Saved as: ${saved.file}`);
  if (saved.note) lines.push(saved.note);
  lines.push(`Diagram id: ${saved.id}`, '', 'What was drawn:', result.outline);
  if (result.problems.length > 0) lines.push('', `Problems to fix (${result.problems.length}):`, ...result.problems.map((problem) => `- ${problem}`), '', 'Fix the description and call diagram_draw again with the same "name".');
  else lines.push('', 'No problems found. Check the outline against what you meant.');
  return lines.join('\n');
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  /** Diagram id -> the drawing, for the picture in the chat. The newest 80 are kept in memory. */
  const recent = new Map();
  const home = ctx.get('dshHomePath');
  const indexFile = typeof home === 'function' ? join(home('diagrams'), 'index.json') : '';
  /**
   * One line per drawing: which conversation, when, and where it was saved. This is how the
   * chat finds the drawings of a turn, and how a picture still shows after the app restarts.
   * @type {Array<{id: string, session: string, at: number, title: string, file: string, problems: number}>}
   */
  let records = [];
  if (indexFile) {
    try {
      mkdirSync(join(indexFile, '..'), { recursive: true });
      const kept = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : [];
      if (Array.isArray(kept)) records = kept.filter((row) => row && typeof row.id === 'string' && typeof row.session === 'string' && Number.isFinite(row.at));
    } catch {
      records = [];
    }
  }
  const remember = (row) => {
    records.push(row);
    if (records.length > 600) records = records.slice(-600);
    if (!indexFile) return;
    try {
      writeFileSync(indexFile, JSON.stringify(records));
    } catch (error) {
      ctx.logger?.warn?.(`diagram: could not update the list of pictures: ${error?.message ?? error}`);
    }
  };
  /** Is the picture of this drawing still to be had: in memory, or as a saved file of ours? */
  const available = (row) => {
    if (recent.has(row.id)) return true;
    if (!row.file) return false;
    if (row.picture) return existsSync(row.file);
    try {
      return readFileSync(row.file, 'utf8').slice(0, 600).includes(MARK);
    } catch {
      return false;
    }
  };

  /**
   * The working folder of an Agent, as the app sees it now.
   * @param {object} agent - live Agent.
   * @param {AbortSignal} [signal] - stops the lookup.
   * @returns {Promise<string>} absolute folder, or an empty string.
   */
  async function folderOfAgent(agent, signal) {
    let folder = '';
    try {
      const service = ctx.get('workingDirectory');
      if (service?.ensure && agent) folder = String((await service.ensure(agent, signal)) ?? '');
    } catch {
      folder = '';
    }
    if (!folder) {
      const header = agent?.header ?? agent?.session?.header;
      folder = typeof header?.cwd === 'string' ? header.cwd : '';
    }
    return folder;
  }

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'diagram_draw',
        description: 'Draw a diagram from a description: flowchart, tree, sequence, timeline, chart or formula plot. Layout is done for you; never write SVG or coordinates. Returns an outline of what was drawn and any problems to fix.',
        parameters: PARAMETERS,
        output: {
          schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
        },
        timeoutMs: 30_000,
        isConcurrencySafe: () => true,
        execute: async (args, exec) => {
          const now = settings();
          if (!now.enabled) return { text: 'The diagram builder is switched off in Settings → Diagrams.' };
          let result;
          try {
            result = draw(args);
          } catch (error) {
            return { text: `The diagram could not be drawn: ${String(error?.message ?? error).slice(0, 200)}` };
          }
          if (!result.ok) return { text: `Nothing was drawn. Fix this and call diagram_draw again:\n${result.errors.map((error) => `- ${error}`).join('\n')}` };
          const id = randomBytes(6).toString('hex');
          recent.set(id, result);
          while (recent.size > 80) recent.delete(recent.keys().next().value);
          const saved = { id };
          const agent = exec?.agent;
          const session = String(agent?.session?.id ?? agent?.sessionId ?? agent?.id ?? '');
          if (now.save) {
            try {
              const cwd = await folderOfAgent(agent, exec?.signal);
              if (!cwd) saved.note = 'It was not saved as a file, because this conversation has no folder.';
              else {
                const dir = join(cwd, now.folder);
                mkdirSync(dir, { recursive: true });
                const wished = typeof args?.name === 'string' && args.name.trim() !== '';
                saved.file = savePath(dir, slug(wished ? args.name : result.title), wished);
                writeFileSync(saved.file, result.svg({ theme: now.theme }));
              }
            } catch (error) {
              saved.file = undefined;
              saved.note = `It could not be saved as a file (${String(error?.code ?? error?.message ?? error).slice(0, 80)}).`;
            }
          }
          remember({ id, session, at: Date.now(), title: result.title, file: saved.file ?? '', problems: result.problems.length });
          return { text: answerText(result, saved) };
        },
      }),
    'diagram tool',
  );

  if (plain(config.skills) !== false) {
    const skills = ctx.get('skills');
    if (skills?.register) {
      for (const skill of SKILLS) {
        ctx.effect(() => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }), `diagram skill ${skill.name}`);
      }
    } else ctx.logger?.warn?.('diagram: the skills service is not available; the draw-diagram skill is not registered');
  }

  /**
   * For other add-ons: show a picture in the chat, under the turn it was made in. Either a
   * description to draw (the same as diagram_draw takes), or a picture file that add-on made.
   * @param {object} agent - the Agent whose turn it is.
   * @param {{title?: string, description?: object, file?: string}} picture - what to show.
   * @returns {{ok: boolean, id?: string, outline?: string, errors?: string[]}} what happened.
   */
  const show = (agent, picture) => {
    if (!settings().enabled) return { ok: false, errors: ['The diagram builder is switched off in Settings → Diagrams.'] };
    const session = String(agent?.session?.id ?? agent?.sessionId ?? agent?.id ?? '');
    const id = randomBytes(6).toString('hex');
    if (picture?.description) {
      let result;
      try {
        result = draw(picture.description);
      } catch (error) {
        return { ok: false, errors: [String(error?.message ?? error).slice(0, 200)] };
      }
      if (!result.ok) return { ok: false, errors: result.errors };
      recent.set(id, result);
      while (recent.size > 80) recent.delete(recent.keys().next().value);
      remember({ id, session, at: Date.now(), title: String(picture.title || result.title).slice(0, 120), file: '', problems: 0 });
      return { ok: true, id, outline: result.outline };
    }
    const file = String(picture?.file ?? '');
    const mime = PICTURE_TYPES[file.slice(file.lastIndexOf('.')).toLowerCase()];
    try {
      if (!mime || statSync(file).size > 12 * 1024 * 1024) return { ok: false, errors: ['Only PNG, JPEG and SVG pictures up to 12 MB can be shown.'] };
    } catch {
      return { ok: false, errors: ['The picture file is not there.'] };
    }
    remember({ id, session, at: Date.now(), title: String(picture.title || 'Chart').slice(0, 120), file, problems: 0, picture: mime });
    return { ok: true, id };
  };
  ctx.effect(() => ctx.provide('diagrams', Object.freeze({ apiVersion: 2, draw: (description) => draw(description), show })), 'diagram service');

  ctx.inject(['webServer', 'connection'], (inner) => {
    const guard = (req, res) => {
      const refused = inner.connection.requestRejection(req);
      if (refused !== undefined) {
        res.statusCode = refused;
        res.end();
        return false;
      }
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('allow', 'GET');
        res.end();
        return false;
      }
      res.setHeader('cache-control', 'no-store');
      return true;
    };
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
          handler: (req, res) => {
            if (!guard(req, res)) return;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ settings: settings(), skill: plain(config.skills) !== false, kinds: KINDS }));
          },
        }),
      'diagram: GET status route',
    );
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: SVG_PATH,
          handler: (req, res) => {
            if (!guard(req, res)) return;
            const id = String(req.headers?.[ID_HEADER] ?? '');
            const theme = req.headers?.['x-dsh-theme'] === 'dark' ? 'dark' : 'light';
            let svg = '';
            if (/^[0-9a-f]{12}$/.test(id)) {
              const kept = recent.get(id);
              const stored = kept ? undefined : records.find((item) => item.id === id);
              if (stored?.picture) {
                // A picture file another add-on made (a chart from Python, for instance): sent as it is.
                try {
                  const bytes = readFileSync(stored.file);
                  res.setHeader('content-type', stored.picture);
                  res.setHeader('x-content-type-options', 'nosniff');
                  res.end(bytes);
                } catch {
                  res.statusCode = 404;
                  res.end();
                }
                return;
              }
              if (kept) svg = kept.svg({ theme, background: false });
              else {
                // After a restart only the saved file is left. It is shown as it was saved, if it is still one of ours.
                const row = records.find((item) => item.id === id);
                try {
                  const text = row?.file ? readFileSync(row.file, 'utf8') : '';
                  if (text.slice(0, 600).includes(MARK) && text.length < 2_000_000) svg = text;
                } catch {
                  svg = '';
                }
              }
            }
            if (!svg) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
            res.setHeader('x-content-type-options', 'nosniff');
            res.end(svg);
          },
        }),
      'diagram: GET picture route',
    );
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: LIST_PATH,
          handler: (req, res) => {
            if (!guard(req, res)) return;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            const session = String(req.headers?.['x-dsh-session'] ?? '');
            res.end(JSON.stringify({ items: turnDrawings(records, session, Number(req.headers?.['x-dsh-from']), Number(req.headers?.['x-dsh-to'])).filter(available) }));
          },
        }),
      'diagram: GET list route',
    );
  });
}
