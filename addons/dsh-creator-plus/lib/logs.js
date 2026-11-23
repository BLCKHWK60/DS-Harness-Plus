/**
 * Improving what exists, from the session logs (build prompt, part 11). Code reads the logs and keeps
 * only what points at a plugin's weak spots: errors, tool calls that failed or were repeated, turns that
 * did not finish, and the places where the user corrected the assistant, asked twice or gave up. Every
 * text is masked before a model sees it, and it is material, never instructions.
 *
 * Recon (a sealed conversation): by default only its structure is read (which tool failed and the kind
 * of error), never its text; its text is read only after the user agreed in the conversation, and then
 * only by a step with no tools (index.js). What Recon's export door never carries stays out here too.
 */
import { clip, oneLine } from './text.js';

/** Words that mark a correction, a repeat or giving up, in the user's message after an answer. */
const CORRECTION = /\b(no[,.!]|not what i|that'?s wrong|wrong|again|try again|you didn'?t|it didn'?t|doesn'?t work|isn'?t working|still (?:not|broken|wrong)|i said|as i said|stop|undo|never mind|forget it|give up)\b/i;
/** An export from Recon in a conversation's text: never read for learning or improving. */
const EXPORT_MARKS = [/\[Recon export [^\]\n]{1,80}\]/, /origin: Recon · lane:/];

/** The kind of an error, from a fixed list (a sealed conversation's error text is never passed on, not even a part of it). */
const ERROR_KINDS = [
  ['timeout', /timed? ?out|timeout|ETIMEDOUT/i],
  ['not found', /not found|no such|ENOENT|\b404\b/i],
  ['refused', /refused|denied|not allowed|permission|EACCES|EPERM|\b40[13]\b/i],
  ['network', /network|ECONN|ENOTFOUND|EHOSTUNREACH|socket|\bDNS\b/i],
  ['bad input', /invalid|malformed|expected|schema|parse/i],
];
export const errorKind = (text) => ERROR_KINDS.find(([, pattern]) => pattern.test(String(text ?? '')))?.[0] ?? 'other';

const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => (part?.type === 'text' ? String(part.text ?? '') : '')).join('\n') : '');

/** @returns {boolean} whether a text carries a Recon export (with Recon's own detector when it is there). */
export function carriesExport(text, exportsService) {
  const value = String(text ?? '');
  if (EXPORT_MARKS.some((mark) => mark.test(value))) return true;
  try {
    const found = exportsService?.inText?.(value);
    return Array.isArray(found?.ids) && found.ids.length > 0;
  } catch {
    return true;
  }
}

/**
 * What one conversation's events say about the plugins it used.
 * @param {object[]} events - `sessionQuery.readSurface(id).events`.
 * @param {{sealed?: boolean, toolOwner?: (name: string) => string}} [options] - `sealed`: structure only; `toolOwner`: the plugin a tool belongs to.
 * @returns {{findings: object[], turns: number, exported: boolean}} the findings.
 */
export function findingsOf(events, { sealed = false, toolOwner = () => '', exportsService } = {}) {
  const findings = [];
  const calls = new Map();
  const seen = new Map();
  let lastAssistant = '';
  let turns = 0;
  let exported = false;
  const list = Array.isArray(events) ? events : [];
  for (const event of list) {
    const data = event?.data ?? {};
    if (event?.type === 'user/message' && data.source?.kind === 'user') {
      const text = textOf(data.content);
      if (carriesExport(text, exportsService)) exported = true;
      turns += 1;
      if (lastAssistant && CORRECTION.test(text)) findings.push({ kind: 'correction', plugin: '', text: sealed ? '(a correction; Recon text is not read)' : clip(text, 300), before: sealed ? '' : clip(lastAssistant, 300) });
    } else if (event?.type === 'assistant/message') {
      lastAssistant = textOf(data.message?.content ?? data.content);
      if (carriesExport(lastAssistant, exportsService)) exported = true;
    } else if (event?.type === 'tool/call') {
      const name = String(data.name ?? '');
      calls.set(String(data.callId ?? ''), name);
      const key = `${name}\u0000${JSON.stringify(data.arguments ?? {}).slice(0, 2000)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (seen.get(key) === 3) findings.push({ kind: 'repeated', plugin: toolOwner(name), tool: name, text: `${name} was called with the same input three times or more in a row of work.` });
    } else if (event?.type === 'tool/result') {
      const message = data.message ?? {};
      const name = calls.get(String(message.toolCallId ?? '')) ?? '';
      const text = textOf(message.content);
      const failed = message.isError === true || /^(Error:|It did not work)/.test(text.trim());
      if (failed) findings.push({ kind: 'tool-error', plugin: toolOwner(name), tool: name, text: sealed ? `(an error of the kind "${errorKind(text)}"; Recon text is not read)` : clip(text, 400) });
    } else if (event?.type === 'turn/end' || event?.type === 'agent/turn-end') {
      const reason = String(data.reason?.kind ?? data.reason ?? data.outcome ?? '');
      if (/error|max-tokens|cancel|abort|limit/i.test(reason)) findings.push({ kind: 'unfinished', plugin: '', text: `A turn ended without finishing (${oneLine(reason, 40)}).` });
    }
  }
  return { findings, turns, exported };
}

/**
 * Read the logs of the selected plugins' work.
 * @param {object} input - `query` (sessionQuery), `since` (ms), `isSealed` (id → boolean), `toolOwner`,
 *   `wanted` (plugin names; empty = all), `recon` ('structure' | 'content'), `exportsService`, `most`.
 * @returns {Promise<{read: number, left: string[], byPlugin: Record<string, object[]>, general: object[]}>} the findings, grouped.
 */
export async function readLogs({ query, since = 0, isSealed = () => false, toolOwner = () => '', wanted = [], recon = 'structure', exportsService, most = 200 }) {
  if (typeof query?.listSessions !== 'function' || typeof query?.readSurface !== 'function') return { read: 0, left: ['The app\'s thread history is not available here.'], byPlugin: {}, general: [] };
  const records = await query.listSessions();
  const want = new Set(wanted);
  const byPlugin = {};
  const general = [];
  const left = [];
  let read = 0;
  const sorted = [...(Array.isArray(records) ? records : [])].sort((a, b) => Number(b?.header?.createdAt ?? 0) - Number(a?.header?.createdAt ?? 0));
  for (const record of sorted) {
    if (read >= most) break;
    const header = record?.header ?? {};
    const id = String(header.id ?? '');
    if (!id || Number(header.updatedAt ?? header.createdAt ?? 0) < since) continue;
    // Helpers are left out: whether a helper of a sealed conversation is sealed may not be known after a restart.
    if (header.parentSession) {
      left.push(`${id}: a helper's thread, not read.`);
      continue;
    }
    let sealed = false;
    try {
      sealed = isSealed(id) === true;
    } catch {
      sealed = true;
    }
    let surface;
    try {
      surface = await query.readSurface(id);
    } catch {
      continue;
    }
    const result = findingsOf(surface?.events, { sealed: sealed && recon !== 'content', toolOwner, exportsService });
    if (result.exported) {
      left.push(`${id}: it carries a Recon export, which is never read for improving.`);
      continue;
    }
    read += 1;
    for (const finding of result.findings) {
      const item = { ...finding, conversation: id, sealed };
      if (finding.plugin && (want.size === 0 || want.has(finding.plugin))) (byPlugin[finding.plugin] ??= []).push(item);
      else if (!finding.plugin && want.size === 0) general.push(item);
    }
  }
  return { read, left, byPlugin, general };
}

/**
 * The findings as cards: what goes wrong, how often and since when, and the evidence.
 * @returns {object[]} one card per plugin and kind.
 */
export function findingCards({ byPlugin, general }) {
  const cards = [];
  for (const [plugin, items] of Object.entries(byPlugin)) {
    const kinds = {};
    for (const item of items) (kinds[item.kind] ??= []).push(item);
    for (const [kind, list] of Object.entries(kinds)) {
      const what = kind === 'tool-error' ? `${list[0].tool || 'a tool'} failed` : kind === 'repeated' ? `${list[0].tool || 'a tool'} was called again and again with the same input` : kind === 'correction' ? 'you corrected the answer' : 'a turn did not finish';
      cards.push({ id: `${plugin}:${kind}:${list[0].tool ?? ''}`, plugin, kind, title: `${plugin}: ${what} (${list.length} time${list.length === 1 ? '' : 's'})`, evidence: list.slice(0, 5).map((item) => `${item.conversation}${item.sealed ? ' (Recon: structure only)' : ''}: ${item.text}`), count: list.length });
    }
  }
  if (general.length > 0) cards.push({ id: 'general', plugin: '', kind: 'general', title: `Not tied to one add-on: ${general.length} correction${general.length === 1 ? '' : 's'} or unfinished turn${general.length === 1 ? '' : 's'}`, evidence: general.slice(0, 5).map((item) => `${item.conversation}: ${item.text}`), count: general.length });
  return cards.sort((a, b) => b.count - a.count);
}
