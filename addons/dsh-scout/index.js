/**
 * Scout: a mode and tab that searches for work (jobs, freelance projects, contracts, tenders),
 * researches the field first, and plans how to approach the best opportunities. Research, not a
 * tracker: nothing is sent or applied for.
 *
 * Switched on, it adds:
 *   - the Scout mode (through the Modes add-on) with its method and a fixed tool list;
 *   - the Scout tab, with title, place, pay, work type and markets on the start page;
 *   - tools that only Scout conversations get: the source registry, search, posting text, research,
 *     and (never for the helpers they start) the user's files, the profile, and saving the report;
 *   - a guard that stops web_fetch on sources whose terms allow search engine results only;
 *   - `/scout`: which model the conversation uses.
 *
 * Scout works with any model, local or cloud (unlike Recon). Route: `/dsh-scout/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { MODE_ID, OWN_TOOLS, TOP_ONLY, withScout } from './lib/mode.js';
import { DEFAULT_MARKETS, KINDS, MARKETS, WORK_TYPES, addressProblem, cleanExtra, isSearchOnly, keyRef, readRegistry, searchOnlyHosts } from './lib/registry.js';
import { openPins, readSelection, selectionNote } from './lib/selection.js';
import { openStore } from './lib/store.js';
import { openFolder, openProfile } from './lib/private.js';
import { providerPlace, staysHome } from './lib/model.js';
import { buildTools } from './lib/tools.js';

export const name = 'dsh-scout';
/** The tools service: for the tools, and for the guard that keeps search-engine-only sources unfetched. */
export const inject = ['tools'];
export const DATA_PATH = '/dsh-scout/data';
const NS = 'scout';
const MODES_NS = 'modes';

export const Config = z.object({
  /** The Scout mode and tab. Off leaves nothing of it in the app. */
  enabled: z.boolean().default(false).volatile(),
  /** The start page: the work, in the user's words. */
  title: z.string().default('').volatile(),
  /** The start page: town, region or "remote". */
  location: z.string().default('').volatile(),
  /** The start page: the pay target, as the user writes it. */
  salary: z.string().default('').volatile(),
  /** The start page: any, employee, freelance, contract, internship or tender. */
  workType: z.string().default('any').volatile(),
  /** The markets searched. */
  markets: z.array(z.string()).default([...DEFAULT_MARKETS]).volatile(),
  /** The folder for the user's files and the saved reports. Empty: `scout/files` in the app's home. */
  folder: z.string().default('').volatile(),
  /** Changes to the starting sources: `{ [id]: { on?: boolean, hidden?: boolean } }` as JSON. */
  sourceState: z.string().default('{}').volatile(),
  /** The user's own sources as JSON. Keys are never here: each is kept in the app's secret store. */
  extraSources: z.string().default('[]').volatile(),
});

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
  return value;
}

/** Settings as plain checked values. */
export function readSettings(config) {
  return {
    enabled: plain(config?.enabled) === true,
    selection: readSelection({ title: plain(config?.title), location: plain(config?.location), salary: plain(config?.salary), workType: plain(config?.workType), markets: plain(config?.markets) ?? DEFAULT_MARKETS }),
    folder: String(plain(config?.folder) ?? '').trim(),
    registry: readRegistry(plain(config?.sourceState), plain(config?.extraSources)),
    sourceState: String(plain(config?.sourceState) ?? '{}'),
    extraSources: String(plain(config?.extraSources) ?? '[]'),
  };
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  const warn = (text) => ctx.logger?.warn?.(`scout: ${text}`);
  const home = ctx.get('dshHomePath');
  const scoutHome = typeof home === 'function' ? home('scout') : '';
  const folderPath = () => settings().folder || (scoutHome ? join(scoutHome, 'files') : '');
  const pins = openPins(scoutHome ? join(scoutHome, 'conversations.json') : '');
  const profile = openProfile(scoutHome ? join(scoutHome, 'profile.md') : '');
  const store = openStore(scoutHome ? join(scoutHome, 'postings') : '');
  const pdf = async (path, root) => {
    const reader = ctx.get('pdfReader');
    if (typeof reader?.read !== 'function') throw new Error('reading PDFs needs the PDF reader add-on: switch it on in Settings → PDF reader');
    return reader.read(path, {}, root);
  };
  let folder = openFolder(folderPath(), { pdf });
  const currentFolder = () => {
    if (folder.root !== folderPath()) folder = openFolder(folderPath(), { pdf });
    return folder;
  };

  // ---- keys of sources: in the app's secret store, never in the settings ------------------------

  let keys = {};
  const secrets = () => {
    const service = ctx.get('credentials');
    if (!service?.resolve) throw new Error('The app\'s secret store is not available, so a key cannot be kept safely.');
    return service;
  };
  const keyOf = async (id) => String((await secrets().resolve(keyRef(id)))?.value ?? '');
  const refreshKeys = async () => {
    const next = {};
    for (const source of settings().registry) {
      if (source.key !== 'required') continue;
      try {
        const info = await secrets().describe(keyRef(source.id));
        next[source.id] = { set: info?.configured === true, masked: typeof info?.masked === 'string' ? info.masked : '' };
      } catch {
        next[source.id] = { set: false, masked: '' };
      }
    }
    keys = next;
  };
  void refreshKeys().catch(() => {});

  // ---- the mode: kept in step with the switch ------------------------------------------------

  let problem = '';
  let syncing = false;
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === MODES_NS);
      if (!row) {
        problem = 'The Modes add-on is not running, so there is no Scout tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = settings().enabled;
      const ops = [];
      const next = withScout(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Scout tab could not be ${settings().enabled ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };
  void syncMode();
  const timer = setInterval(() => {
    void syncMode();
    void refreshKeys().catch(() => {});
    syncTools();
  }, 3000);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), 'scout: follow the switch');

  // ---- which conversation, which model --------------------------------------------------------

  const modes = () => {
    try {
      return ctx.get('modes');
    } catch {
      return undefined;
    }
  };
  /** The conversation an agent works for: itself, or the one that started it. */
  const rootOf = (agent) => String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');
  /** A helper (for example Deep research's) started by a conversation, rather than the conversation itself. */
  const isHelper = (agent) => Boolean(agent?.header?.parentSession ?? agent?.session?.header?.parentSession);
  const inScout = (agent) => {
    const id = rootOf(agent);
    try {
      return Boolean(id) && modes()?.get?.(id) === MODE_ID;
    } catch {
      return false;
    }
  };
  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };
  const modelOf = (agent) => {
    let route;
    try {
      const now = agent?.model?.current?.();
      if (now && typeof now.provider === 'string' && typeof now.model === 'string' && now.provider && now.model) route = { provider: now.provider, model: now.model };
    } catch {
      route = undefined;
    }
    return { route, place: providerPlace(settingsOf('llm-pi-ai')?.providers, route?.provider) };
  };
  // Scout works with any model, local or cloud: the user's files and profile are open to it.
  const gate = () => ({ files: { ok: true, why: '' }, profile: { ok: true, why: '' } });
  const placeText = (agent) => {
    const { route, place } = modelOf(agent);
    if (!route) return 'not known';
    return `${route.model} (${staysHome(place) ? 'on the user\'s own machines' : place.where === 'cloud' ? `cloud: ${place.name || route.provider}` : 'location unknown, treated as cloud'})`;
  };

  // ---- the note in every Scout conversation -----------------------------------------------------

  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () => agent.ctx.systemPrompt.section({
          name: 'scout:selection',
          order: 59,
          interpolate: false,
          text: () => {
            try {
              const now = settings();
              if (!now.enabled || !inScout(agent)) return '';
              const root = rootOf(agent);
              // Helpers do not get the user's files or profile, so their note does not mention them.
              if (isHelper(agent)) return selectionNote(pins.get(root) ?? now.selection, { model: placeText(agent) });
              const count = currentFolder().list().length;
              const files = `${count} file${count === 1 ? '' : 's'} in the Scout folder (scout_files)`;
              const profileText = profile.read().trim() ? 'saved (scout_profile)' : 'none yet';
              return selectionNote(pins.get(root) ?? now.selection, { files, profile: profileText, model: placeText(agent) });
            } catch {
              return '';
            }
          },
        }),
        'scout selection note',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the selection note: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => install(agent));
  ctx.on('agent/disposed', ({ agent }) => {
    sections.delete(agent?.id);
    store.forget(agent?.id);
  });
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) install(agent);
  } catch {
    /* agents appear later */
  }
  ctx.effect(() => () => {
    for (const dispose of sections.values()) {
      try {
        dispose?.();
      } catch {
        /* closing */
      }
    }
    sections.clear();
  }, 'scout: selection notes');

  // What was selected when a conversation started stays that conversation's selection.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'turn/start' || session?.header?.origin === 'subagent') return;
      const id = session?.id;
      const now = settings();
      if (!id || !now.enabled || pins.get(id) || modes()?.get?.(id) !== MODE_ID) return;
      pins.pin(id, now.selection);
    } catch (error) {
      warn(`could not remember a conversation's selection: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the tools: only in Scout conversations ---------------------------------------------------

  let toolsOff;
  function syncTools() {
    const on = settings().enabled;
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      const built = buildTools({
        enabled: () => settings().enabled,
        registry: () => settings().registry,
        // The selection the conversation started with, so the tools' defaults match its note.
        selection: (exec) => pins.get(rootOf(exec?.agent)) ?? settings().selection,
        keyOf,
        hasKey: (id) => keys[id]?.set === true,
        store,
        folder: { list: () => currentFolder().list(), read: (file) => currentFolder().read(file), ensure: () => currentFolder().ensure() },
        profile,
        gate,
        idOf: (exec) => rootOf(exec?.agent),
      });
      const offered = (tool, agent) => settings().enabled && inScout(agent) && !(TOP_ONLY.includes(tool.name) && isHelper(agent));
      toolsOff = built.map((tool) => tools.register(tool, { when: ({ agent }) => offered(tool, agent) }));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  }
  try {
    syncTools();
  } catch (error) {
    warn(`could not add the tools: ${String(error?.message ?? error)}`);
  }
  ctx.effect(() => () => {
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    toolsOff = undefined;
  }, 'scout: tools');

  // Sources whose terms allow search engine results only are never fetched from a Scout conversation.
  ctx.effect(
    () => ctx.tools.guard((exec) => {
      try {
        if (exec?.name !== 'web_fetch' || !settings().enabled || !inScout(exec.agent)) return undefined;
        const url = exec.arguments?.url;
        if (!isSearchOnly(url, searchOnlyHosts(settings().registry))) return undefined;
        return 'that site\'s terms allow search engine results only, so Scout does not fetch its pages. Use what web_search showed, and give the user the link to open.';
      } catch {
        return undefined;
      }
    }),
    'scout: search engine only sources',
  );

  // ---- /scout -----------------------------------------------------------------------------------

  const status = (agent) => {
    if (!settings().enabled) return 'Scout is switched off (Settings → Scout).';
    if (!inScout(agent)) return 'This is not a Scout conversation. Start one from the Scout tab.';
    return [
      `Model: ${placeText(agent)}.`,
      `Your files: ${currentFolder().list().length} in the Scout folder, readable by this model.`,
      `Your profile: ${profile.read().trim() ? 'saved, available to this model' : 'none yet'}.`,
      `Folder: ${folderPath()}`,
    ].join('\n');
  };
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () => inner.commands.register({
        name: 'scout',
        description: 'Scout conversation: show which model it uses and what it can read',
        input: { hint: '[status]' },
        handler: async ({ agent, rawInput }) => {
          try {
            const word = String(rawInput ?? '').trim().toLowerCase();
            if (!word || word === 'status') return { kind: 'success', text: status(agent) };
            if (word === 'cloud') return { kind: 'success', text: 'Scout works with any model, local or cloud. There is nothing to agree to.' };
            return { kind: 'error', text: 'Use /scout.' };
          } catch (error) {
            return { kind: 'error', text: String(error?.message ?? error).slice(0, 300) };
          }
        },
      }),
      'scout: command',
    );
  });

  // ---- the pages' data --------------------------------------------------------------------------

  const writeOwn = async (field, value) => {
    const service = ctx.get('settings');
    if (!service?.mutate) throw new Error('The app\'s settings cannot be changed just now.');
    await service.mutate(NS, [{ op: 'set', path: [field], value }]);
  };
  const stateOf = () => {
    try {
      const parsed = JSON.parse(settings().sourceState || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const extrasOf = () => {
    try {
      const parsed = JSON.parse(settings().extraSources || '[]');
      return Array.isArray(parsed) ? parsed.map(cleanExtra).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const view = () => {
    const now = settings();
    let files = [];
    try {
      files = currentFolder().list();
    } catch {
      files = [];
    }
    return {
      at: Date.now(),
      enabled: now.enabled,
      selection: now.selection,
      problem,
      folder: folderPath(),
      files,
      profile: profile.read(),
      knownMarkets: Object.keys(MARKETS),
      workTypes: WORK_TYPES,
      kinds: KINDS,
      sources: now.registry.map((source) => ({ ...source, keySet: keys[source.id]?.set === true, keyShown: keys[source.id]?.masked ?? '' })),
      tools: OWN_TOOLS,
      toolsOn: Boolean(toolsOff),
    };
  };
  const act = async (body) => {
    const registry = settings().registry;
    const source = registry.find((item) => item.id === String(body?.id ?? ''));
    switch (body?.action) {
      case 'toggle': {
        if (!source) throw new Error('unknown source');
        if (source.extra) await writeOwn('extraSources', JSON.stringify(extrasOf().map((item) => (item.id === source.id ? { ...item, on: body.on === true } : item))));
        else await writeOwn('sourceState', JSON.stringify({ ...stateOf(), [source.id]: { ...stateOf()[source.id], on: body.on === true } }));
        break;
      }
      case 'hide':
      case 'unhide': {
        if (!source || source.extra) throw new Error('unknown source');
        await writeOwn('sourceState', JSON.stringify({ ...stateOf(), [source.id]: { ...stateOf()[source.id], hidden: body.action === 'hide' } }));
        break;
      }
      case 'add': {
        const raw = body.source ?? {};
        const reason = addressProblem(raw.url);
        if (reason) throw new Error(reason);
        const base = String(raw.name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'source';
        let id = base;
        for (let n = 2; registry.some((item) => item.id === id); n += 1) id = `${base}-${n}`.slice(0, 30);
        const added = cleanExtra({ ...raw, id });
        if (!added) throw new Error('That source could not be added. Check its name, address, markets and work types.');
        await writeOwn('extraSources', JSON.stringify([...extrasOf(), added]));
        break;
      }
      case 'remove': {
        if (!source?.extra) throw new Error('Only sources you added can be removed; hide a starting source instead.');
        await writeOwn('extraSources', JSON.stringify(extrasOf().filter((item) => item.id !== source.id)));
        break;
      }
      case 'key': {
        if (!source || source.key !== 'required') throw new Error('That source takes no key.');
        const value = String(body.value ?? '').trim();
        if (value.length < 4 || value.length > 500 || /\s/.test(value)) throw new Error('That does not look like a key.');
        await secrets().set(keyRef(source.id), value);
        await refreshKeys();
        break;
      }
      case 'forget': {
        if (!/^[a-z0-9-]{1,30}$/.test(String(body.id ?? ''))) throw new Error('unknown source');
        await secrets().unset(keyRef(String(body.id)));
        await refreshKeys();
        break;
      }
      case 'profile':
        profile.save(body.text);
        break;
      case 'upload':
        currentFolder().save(body.name, body.data);
        break;
      case 'reveal': {
        const path = currentFolder().ensure();
        if (process.platform !== 'darwin') throw new Error(`The folder is ${path}`);
        await new Promise((done) => execFile('/usr/bin/open', [path], () => done()));
        break;
      }
      default:
        throw new Error('unknown action');
    }
  };

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: DATA_PATH,
        handler: async (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) {
            res.statusCode = refused;
            res.end();
            return;
          }
          if (req.method !== 'GET' && req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'GET, POST');
            res.end();
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          try {
            if (req.method === 'POST') {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 22 * 1024 * 1024) throw new Error('The file is too large.');
                chunks.push(chunk);
              }
              await act(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            }
            res.end(JSON.stringify(view()));
            void syncMode();
          } catch (error) {
            res.statusCode = req.method === 'POST' ? 400 : 500;
            res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
          }
        },
      }),
      'scout: data route',
    );
  });
}
