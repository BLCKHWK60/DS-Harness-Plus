/**
 * Not a test: what the add-on puts on conversations (tool masks, instruction sections, the tool finder's answers), collected in a
 * stand-in app, so a test can compare "Tool access off" with what the add-on did before Tool access existed.
 *
 * `off-baseline.json` is NOT written by hand and NOT made from the current add-on: `node test/make-off-baseline.mjs` rebuilds it from
 * the add-on as committed before Tool access (`git archive` of the commit named in that script, unpacked into a temporary folder and
 * run there), so "identical while off" compares against the real earlier behaviour.
 *
 * The scenario is the way the real app has it: Cowork, Code and Data (tools loaded as needed, with the finder), Chat, a tab with its
 * own list, Recon and Devices, with Web On and Web Off, and helpers of several of them. When the current add-on runs, the two Tool
 * access tools are among the tools the app knows (the app lists a tool even while its `when` is false), as in the real app.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const BASE_KNOWN = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'todo_write', 'skill', 'web_fetch', 'web_search', 'recon_cite', 'mcp__mail__send', 'run_code', 'brand_new_tool', 'pdf_read', 'data_query', 'subagent', 'deep_research', 'plugin_manager', 'workflow', 'generate_image', 'other_search'];
export const BASE_MODES = {
  lab: { label: 'Lab', tools: 'all' },
  safe: { label: 'Safe', tools: ['read', 'grep'] },
  recon: { label: 'Recon', tools: ['recon_cite'], isolated: true },
  bench: { label: 'Devices', tools: ['read'] },
  data: { label: 'Data', tools: 'all', startFamilies: ['data', 'pdf'] },
};
export const BASE_SESSIONS = { l1: 'lab', lw: 'lab', s1: 'safe', c1: 'chat', cw1: 'cowork', cww: 'cowork', k1: 'code', kw: 'code', d1: 'data', dw: 'data', r1: 'recon', rw: 'recon', b1: 'bench' };
/** Conversations with Web Off. */
export const WEB_OFF = { lw: false, cww: false, kw: false, dw: false, rw: false };
/** Helpers: helper id -> the conversation that started it. */
export const HELPERS = { hl: 'l1', hs: 's1', hk: 'k1', hd: 'd1', hr: 'r1', hw: 'kw' };

/**
 * @param {{boot: Function, makeWorld: Function, maskNow: Function}} app - the stand-in app (test/app.mjs of the version under test).
 * @param {object} [fields] - extra settings.
 * @param {string[]} [moreKnown] - tools the app knows besides the usual ones (the two Tool access tools, in the current add-on).
 * @returns {Promise<object>} per conversation: its mask, the text of each section Modes adds, and what the tool finder answers.
 */
export async function collect({ boot, makeWorld, maskNow }, fields = {}, moreKnown = []) {
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(BASE_MODES), sessionModes: JSON.stringify(BASE_SESSIONS), sessionWeb: JSON.stringify(WEB_OFF), webMarksCleared: true, ...fields });
  const app = boot(world, { known: [...BASE_KNOWN, 'tools_find', ...moreKnown], home: mkdtempSync(path.join(tmpdir(), 'dsh-off-')) });
  const out = {};
  try {
    for (const id of Object.keys(BASE_SESSIONS)) {
      const one = await app.open(id);
      await app.firstTurn(one.agent);
      out[id] = await seen(app, one, id, maskNow);
    }
    for (const [id, parent] of Object.entries(HELPERS)) {
      const one = await app.open(id, { header: { parentSession: parent } });
      out[id] = await seen(app, one, id, maskNow);
    }
    out.tools = { toolsFind: Boolean(app.tool('tools_find')), catalogue: app.tool('tools_catalog')?.options?.when?.() ?? 'not registered', request: app.tool('request_tool_access')?.options?.when?.() ?? 'not registered' };
  } finally {
    app.stop();
  }
  return out;
}

async function seen(app, one, id, maskNow) {
  const finder = app.tool('tools_find');
  const entry = {
    mask: maskNow(one.masks),
    mode: app.prompt(id),
    lens: app.section(id, 'modes:lens').text,
    access: app.section(id, 'modes:tool-access').text,
  };
  // The tool finder (Cowork, Code and Data): what it lists and what it says when it is asked for something.
  if (finder?.options?.when?.({ agent: one.agent })) {
    entry.finder = (await finder.definition.execute({}, { agent: one.agent })).text;
    entry.finderAsk = (await finder.definition.execute({ need: 'catalogue request tool access' }, { agent: one.agent })).text;
  }
  return entry;
}
