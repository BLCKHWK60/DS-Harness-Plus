/**
 * PDF reader: lets a model read PDF files properly, with page numbers.
 *
 * It uses the parts that come with macOS (PDFKit and Vision), so there is nothing
 * to install and nothing leaves the Mac. Five tools:
 *   pdf_info        pages, title, contents list, which pages are scans
 *   pdf_read        the text of a range of pages, each under its page number
 *   pdf_search      where a phrase appears, with page numbers
 *   pdf_page_image  one page saved as a picture, for charts, formulas and scans
 *   pdf_ocr         the text of a scanned page, recognised from its picture
 * and one skill, `read-pdf`, that tells the model how to use them.
 *
 * The tools may open PDFs in the conversation's folder and in folders the owner
 * lists; anywhere else only if the owner allows it. Extracted text is kept in
 * memory only. Page pictures are saved under the dsh home and removed after a day.
 *
 * Service `pdfReader` (apiVersion 1): `info(path, cwd?)`, `read(path, options?, cwd?)`.
 * Route: `GET /dsh-pdf/status`. Command: `/pdf <file>`.
 */
import z from '@deepseek-ai/schemastery';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePdf } from './lib/access.js';
import { createReader } from './lib/reader.js';
import { SKILLS } from './skills.js';

export const name = 'dsh-pdf';
export const inject = ['tools'];

export const STATUS_PATH = '/dsh-pdf/status';
const PAGE_FILE_DAYS = 1;

export const Config = z.object({
  /** Master switch. Off makes every tool say so. */
  enabled: z.boolean().default(true).volatile(),
  /** Extra folders whose PDFs may be read, besides the conversation's own folder. */
  folders: z.array(z.string()).default([]).volatile(),
  /** Allow any PDF on this Mac. Off keeps the tools to the folders above. */
  anywhere: z.boolean().default(false).volatile(),
  /** Most characters of text one pdf_read answer holds (about four per token). */
  readChars: z.number().min(4000).max(200000).default(30000).volatile(),
  /** Register the read-pdf skill. */
  skills: z.boolean().default(true),
  /** Slash command; empty registers none. */
  commandName: z.string().default('pdf'),
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
 * @returns {{enabled: boolean, folders: string[], anywhere: boolean, readChars: number}} settings.
 */
export function readSettings(config) {
  const folders = plain(config.folders);
  const chars = Number(plain(config.readChars));
  return {
    enabled: plain(config.enabled) !== false,
    folders: Array.isArray(folders) ? folders.map((folder) => String(folder).trim()).filter(Boolean).slice(0, 30) : [],
    anywhere: plain(config.anywhere) === true,
    readChars: Number.isFinite(chars) ? Math.min(200000, Math.max(4000, Math.round(chars))) : 30000,
  };
}

/**
 * The tools, as plain definitions. Exported for tests.
 * @param {object} deps - what the tools need.
 * @param {object} deps.reader - from `createReader`.
 * @param {() => object} deps.settings - current settings.
 * @param {(exec: object) => Promise<string>} deps.folderOf - the working folder of the calling conversation.
 * @param {(file: string, page: number) => string} deps.pagePath - where a page picture is saved.
 * @returns {object[]} tool definitions.
 */
export function buildTools({ reader, settings, folderOf, pagePath }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  /**
   * @param {(ref: object, args: object, exec: object, now: object) => Promise<string>} answer - builds the text.
   * @returns {(args: object, exec: object) => Promise<{text: string}>} the tool body.
   */
  const withPdf = (answer) => async (args, exec) => {
    const now = settings();
    if (!now.enabled) return { text: 'The PDF reader is switched off in Settings → PDF reader.' };
    let cwd = '';
    try {
      cwd = await folderOf(exec);
    } catch {
      cwd = '';
    }
    const ref = resolvePdf(args?.path, { cwd, folders: now.folders, anywhere: now.anywhere });
    if (ref.error) return { text: ref.error };
    try {
      return { text: await answer(ref, args ?? {}, exec, now) };
    } catch (error) {
      return { text: `The PDF could not be read: ${String(error?.message ?? error).slice(0, 200)}` };
    }
  };
  const path = { type: 'string', description: 'Path of the PDF: absolute, starting with ~, or relative to the working folder.' };
  const page = { type: 'integer', minimum: 1, description: 'Page number, starting at 1.' };
  const common = { output, isConcurrencySafe: () => true };
  return [
    {
      name: 'pdf_info',
      description: 'Facts about a PDF: number of pages, title, its contents list with page numbers, and which pages are scans. Call this first.',
      parameters: { type: 'object', properties: { path }, required: ['path'], additionalProperties: false },
      ...common,
      timeoutMs: 120_000,
      execute: withPdf((ref, _args, exec) => reader.info(ref, exec?.signal)),
    },
    {
      name: 'pdf_read',
      description: 'The text of a range of pages of a PDF, each under its page number. Long ranges stop early and say where to continue. Set layout=true for tables, forms and columns.',
      parameters: {
        type: 'object',
        properties: {
          path,
          from: { ...page, description: 'First page to read (default 1).' },
          to: { ...page, description: 'Last page to read (default: the last page).' },
          layout: { type: 'boolean', description: 'Keep columns apart, for tables and forms. Reads at most 12 pages per call.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      ...common,
      timeoutMs: 120_000,
      execute: withPdf((ref, args, exec, now) => reader.read(ref, { from: args.from, to: args.to, layout: args.layout === true, maxChars: now.readChars }, exec?.signal)),
    },
    {
      name: 'pdf_search',
      description: 'Find a word or phrase in a PDF. Returns the page numbers and the words around each hit. Upper and lower case and line breaks do not matter.',
      parameters: {
        type: 'object',
        properties: { path, query: { type: 'string', description: 'The word or phrase to find.' }, limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Most hits to show (default 20).' } },
        required: ['path', 'query'],
        additionalProperties: false,
      },
      ...common,
      timeoutMs: 120_000,
      execute: withPdf((ref, args, exec) => reader.search(ref, String(args.query ?? ''), args.limit, exec?.signal)),
    },
    {
      name: 'pdf_page_image',
      description: 'Save one page of a PDF as a PNG picture and return its path. For charts, diagrams, formulas, handwriting and scans; then open the picture with read_image.',
      parameters: {
        type: 'object',
        properties: { path, page, scale: { type: 'number', minimum: 1, maximum: 4, description: 'Sharpness: 1 small, 2 normal (default), 4 very sharp.' } },
        required: ['path', 'page'],
        additionalProperties: false,
      },
      ...common,
      timeoutMs: 120_000,
      execute: withPdf(async (ref, args, exec) => {
        const out = pagePath(ref.file, Math.round(Number(args.page) || 0));
        const made = await reader.image(ref, args.page, args.scale, out, exec?.signal);
        return `Page ${Math.round(Number(args.page))} was saved as a picture, ${made.width} × ${made.height} pixels:\n${made.out}\nLook at it with the read_image tool (file_path = that path); this needs a model that can see images. The file is removed after a day.`;
      }),
    },
    {
      name: 'pdf_ocr',
      description: 'Recognise the text on one page of a PDF from its picture. For scanned pages and pages without a text layer. Runs on this Mac.',
      parameters: { type: 'object', properties: { path, page }, required: ['path', 'page'], additionalProperties: false },
      ...common,
      timeoutMs: 240_000,
      execute: withPdf((ref, args, exec) => reader.ocr(ref, args.page, exec?.signal)),
    },
  ];
}

/**
 * Remove page pictures older than a day.
 * @param {string} dir - the pictures folder.
 * @param {number} [now] - the time to measure from.
 * @returns {number} how many files were removed.
 */
export function sweepPages(dir, now = Date.now()) {
  let removed = 0;
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const entry of names) {
    if (!entry.endsWith('.png')) continue;
    const file = join(dir, entry);
    try {
      if (now - statSync(file).mtimeMs > PAGE_FILE_DAYS * 86_400_000) {
        rmSync(file, { force: true });
        removed += 1;
      }
    } catch {
      // Leave what cannot be read.
    }
  }
  return removed;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const reader = createReader();
  const settings = () => readSettings(config);
  const home = ctx.get('dshHomePath');
  const pagesDir = typeof home === 'function' ? join(home('pdf-reader'), 'pages') : '';
  if (pagesDir) {
    try {
      mkdirSync(pagesDir, { recursive: true });
      sweepPages(pagesDir);
    } catch (error) {
      ctx.logger?.warn?.(`pdf: could not prepare the pictures folder: ${error?.message ?? error}`);
    }
  }

  /** A stable, harmless file name for a page picture. */
  const pagePath = (file, page) => {
    if (!pagesDir) throw new Error('There is no folder to save page pictures in.');
    return join(pagesDir, `${createHash('sha256').update(file).digest('hex').slice(0, 12)}-p${page}.png`);
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

  for (const tool of buildTools({ reader, settings, folderOf: (exec) => folderOfAgent(exec?.agent, exec?.signal), pagePath })) {
    ctx.effect(() => ctx.tools.register(tool), `pdf tool ${tool.name}`);
  }

  if (plain(config.skills) !== false) {
    const skills = ctx.get('skills');
    if (skills?.register) {
      for (const skill of SKILLS) {
        ctx.effect(() => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }), `pdf skill ${skill.name}`);
      }
    } else ctx.logger?.warn?.('pdf: the skills service is not available; the read-pdf skill is not registered');
  }

  const refOf = (path, cwd) => {
    const now = settings();
    const ref = resolvePdf(path, { cwd, folders: now.folders, anywhere: now.anywhere });
    if (ref.error) throw new Error(ref.error);
    return ref;
  };
  ctx.effect(
    () =>
      ctx.provide(
        'pdfReader',
        Object.freeze({
          apiVersion: 1,
          info: (path, cwd) => reader.info(refOf(path, cwd)),
          read: (path, options = {}, cwd) => reader.read(refOf(path, cwd), { ...options, maxChars: options.maxChars ?? settings().readChars }),
        }),
      ),
    'pdf service',
  );

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
          handler: (req, res) => {
            const refused = inner.connection.requestRejection(req);
            if (refused !== undefined) {
              res.statusCode = refused;
              res.end();
              return;
            }
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET');
              res.end();
              return;
            }
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(JSON.stringify({ settings: settings(), mac: process.platform === 'darwin', skill: plain(config.skills) !== false }));
          },
        }),
      'pdf: GET status route',
    );
  });

  const commandName = String(plain(config.commandName) ?? '').trim();
  if (!commandName) return;
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: commandName,
          description: 'PDF reader: `/pdf <file>` shows the facts about a PDF (pages, contents, scans)',
          input: { hint: '<file.pdf>' },
          handler: async ({ agent, rawInput }) => {
            const now = settings();
            if (!now.enabled) return { kind: 'success', text: 'The PDF reader is switched off (Settings → PDF reader).' };
            const path = String(rawInput ?? '').trim().replace(/^["']|["']$/g, '');
            if (!path) return { kind: 'success', text: `Usage: /${commandName} <file.pdf>. PDFs may be read from this conversation's folder${now.folders.length > 0 ? `, ${now.folders.join(', ')}` : ''}${now.anywhere ? ' and anywhere on this Mac' : ''}.` };
            try {
              const cwd = await folderOfAgent(agent);
              return { kind: 'success', text: await reader.info(refOf(path, cwd)) };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error) };
            }
          },
        }),
      'pdf command',
    );
  });
}
