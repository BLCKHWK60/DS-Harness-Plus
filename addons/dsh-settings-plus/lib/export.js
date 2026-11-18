/**
 * Export of one conversation (the Export button beside the gear in the chat box): the stored log of the
 * conversation, as a file, at one of three levels and in one of four formats. Pure functions: they read
 * the events the app stored (`sessionQuery.readSession(id).events`) and return text. Nothing is written,
 * nothing is changed in the conversation.
 *
 * Levels
 *  - `conversation`: what was said: your messages and the assistant's replies.
 *  - `thinking`: the same, with the assistant's thinking blocks before each reply.
 *  - `full`: everything the app stored: the model and its settings, the instructions (system prompt), your
 *    messages, thinking, every tool call and its result, the other log events, and the raw log itself.
 * Formats: `md` (Markdown), `txt` (plain text), `html` (one page, prints well), `json`.
 */

export const LEVELS = ['conversation', 'thinking', 'full'];
export const FORMATS = ['md', 'txt', 'html', 'json'];

const MIME = { md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8' };

/** Log events that only say how the log was kept: left out of the readable formats (they stay in the raw log). */
const QUIET = new Set(['agent/inbox/spliced', 'session-log-deepseek/delivery-accepted', 'step/start', 'step/end', 'turn/start', 'turn/end', 'subagent/catalog', 'session/title-llm-request']);

const asList = (value) => (Array.isArray(value) ? value : []);
const plainText = (value) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value));

/** The readable text of a message's content blocks (text only; images and files become labels). */
function textOf(content) {
  if (typeof content === 'string') return content;
  return asList(content).map((part) => {
    if (!part || typeof part !== 'object') return plainText(part);
    if (part.type === 'text') return plainText(part.text);
    if (part.type === 'image') return `[image${part.name ? `: ${part.name}` : ''}]`;
    if (part.type === 'file') return `[file${part.name ? `: ${part.name}` : ''}]`;
    return '';
  }).filter((piece) => piece !== '').join('\n');
}

/** An argument string the model wrote, laid out when it is JSON. */
function prettyArguments(raw) {
  if (typeof raw !== 'string') return plainText(raw);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const stamp = (time) => {
  const n = Number(time);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '';
};

/**
 * The conversation as a list of blocks, in the order it was stored.
 * @param {object[]} events - the stored events.
 * @param {'conversation'|'thinking'|'full'} level - how much to keep.
 * @returns {{title: string, header: object, blocks: object[], models: object[]}} the pieces every format is made from.
 */
export function readable(events, level = 'conversation') {
  const list = asList(events).filter((event) => event && typeof event === 'object');
  const header = list.find((event) => event.type === 'session') ?? {};
  let title = '';
  const blocks = [];
  const models = [];
  const seenSystem = new Map();
  const remember = (model) => {
    const key = JSON.stringify(model);
    if (!models.some((one) => JSON.stringify(one.model) === key)) models.push({ seq: model.seq, time: stamp(model.time), model });
  };
  for (const event of list) {
    const data = event.data ?? {};
    const where = { seq: event.seq, time: stamp(event.time), turn: data.turn, step: data.step };
    switch (event.type) {
      case 'session/title':
        if (typeof data.title === 'string' && data.title.trim()) title = data.title.trim();
        break;
      case 'user/message': {
        const message = data.message ?? data;
        const own = !message.source || message.source.kind === 'user';
        if (!own && level !== 'full') break;
        const text = textOf(message.content);
        if (text !== '') blocks.push({ kind: 'user', label: own ? 'You' : `Added to the conversation (${message.source?.kind ?? 'other'})`, text, ...where });
        break;
      }
      case 'assistant/message': {
        const message = data.message ?? data;
        for (const part of asList(message.content)) {
          if (part?.type === 'reasoning' && level !== 'conversation') blocks.push({ kind: 'thinking', label: 'Thinking', text: plainText(part.text), ...where });
          else if (part?.type === 'text' && plainText(part.text) !== '') blocks.push({ kind: 'assistant', label: 'Assistant', text: plainText(part.text), ...where });
          else if (part?.type === 'tool-call' && level === 'full') blocks.push({ kind: 'tool-call', label: `Tool call: ${part.name ?? ''}`, text: prettyArguments(part.arguments), callId: part.id, ...where });
        }
        break;
      }
      case 'tool/result':
        if (level === 'full') {
          const message = data.message ?? data;
          blocks.push({ kind: 'tool-result', label: message.isError ? 'Tool result (error)' : 'Tool result', text: textOf(message.content), callId: message.toolCallId, ...where });
        }
        break;
      case 'system/message':
        if (level === 'full') {
          const text = textOf((data.message ?? data).content);
          const key = text;
          const earlier = seenSystem.get(key);
          if (earlier) earlier.repeats += 1;
          else {
            const block = { kind: 'system', label: 'Instructions (system prompt)', text, repeats: 0, ...where };
            seenSystem.set(key, block);
            blocks.push(block);
          }
        }
        break;
      case 'developer/message':
        if (level === 'full') blocks.push({ kind: 'developer', label: 'Developer message', text: JSON.stringify(data.message ?? data, null, 2), ...where });
        break;
      case 'request/header':
        if (level === 'full') {
          const config = data.header?.config;
          if (config) remember({ ...config, seq: event.seq, time: event.time });
          const tools = asList(data.header?.tools).map((tool) => tool?.name).filter(Boolean);
          blocks.push({ kind: 'model', label: 'Request header (model and tools)', text: JSON.stringify({ config: data.header?.config, adapterDefaults: data.header?.adapterDefaults, tools }, null, 2), ...where });
        }
        break;
      case 'request/context':
      case 'model/selection':
        if (level === 'full') {
          remember({ ...data, seq: event.seq, time: event.time });
          blocks.push({ kind: 'model', label: event.type === 'model/selection' ? 'Model chosen' : 'Request context', text: JSON.stringify(data, null, 2), ...where });
        }
        break;
      default:
        if (level === 'full' && event.type !== 'session' && event.type !== 'session/title' && !QUIET.has(event.type)) {
          blocks.push({ kind: 'event', label: `Log event: ${event.type}`, text: JSON.stringify(data, null, 2), ...where });
        }
    }
  }
  return { title: title || 'Untitled conversation', header, blocks, models };
}

const fenceOf = (text) => '`'.repeat(Math.max(3, (String(text).match(/`+/g) ?? []).reduce((most, run) => Math.max(most, run.length), 0) + 1));
const fenced = (text, lang = '') => {
  const fence = fenceOf(text);
  return `${fence}${lang}\n${text}\n${fence}`;
};
const quote = (text) => String(text).split('\n').map((line) => `> ${line}`).join('\n');
const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (block) => [block.time, block.turn !== undefined ? `turn ${block.turn}` : '', block.step !== undefined ? `step ${block.step}` : ''].filter(Boolean).join(' · ');

function facts(pieces, level, sessionId) {
  const header = pieces.header ?? {};
  return [
    ['Conversation', pieces.title],
    ['Session id', sessionId || header.id || ''],
    ['Started', stamp(header.createdAt)],
    ['Working folder', header.cwd ?? ''],
    ['Agent preset', header.agentPreset ?? ''],
    ['Export level', level],
  ].filter(([, value]) => value !== '' && value !== undefined);
}

function toMarkdown(pieces, level, sessionId, rawLines) {
  const out = [`# ${pieces.title}`, ''];
  for (const [name, value] of facts(pieces, level, sessionId)) out.push(`- **${name}:** ${value}`);
  out.push('');
  if (level === 'full' && pieces.models.length) {
    out.push('## Models and settings', '');
    for (const item of pieces.models) out.push(`- ${item.time || `seq ${item.seq}`}: \`${JSON.stringify({ ...item.model, seq: undefined, time: undefined })}\``);
    out.push('');
  }
  out.push('## Conversation', '');
  for (const block of pieces.blocks) {
    const note = when(block);
    if (block.kind === 'user') out.push(`### ${block.label}${note ? ` · ${note}` : ''}`, '', quote(block.text), '');
    else if (block.kind === 'assistant') out.push(`### ${block.label}${note ? ` · ${note}` : ''}`, '', block.text, '');
    else if (block.kind === 'thinking') out.push(`<details><summary>${block.label}${note ? ` · ${note}` : ''}</summary>`, '', fenced(block.text), '', '</details>', '');
    else {
      const extra = block.kind === 'system' && block.repeats > 0 ? ` (the same text came ${block.repeats} more time${block.repeats === 1 ? '' : 's'})` : '';
      out.push(`#### ${block.label}${extra}${note ? ` · ${note}` : ''}`, '', fenced(block.text), '');
    }
  }
  if (rawLines !== undefined) out.push('## Raw log', '', 'The log exactly as the app stored it, one JSON event per line.', '', fenced(rawLines, 'jsonl'), '');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function toText(pieces, level, sessionId, rawLines) {
  const line = '-'.repeat(60);
  const out = [pieces.title, '='.repeat(Math.min(60, Math.max(8, pieces.title.length))), ''];
  for (const [name, value] of facts(pieces, level, sessionId)) out.push(`${name}: ${value}`);
  out.push('');
  if (level === 'full' && pieces.models.length) {
    out.push(line, 'MODELS AND SETTINGS', line);
    for (const item of pieces.models) out.push(`${item.time || `seq ${item.seq}`}: ${JSON.stringify({ ...item.model, seq: undefined, time: undefined })}`);
    out.push('');
  }
  for (const block of pieces.blocks) {
    const note = when(block);
    out.push(line, `${block.label.toUpperCase()}${note ? ` (${note})` : ''}${block.kind === 'system' && block.repeats > 0 ? ` [same text ${block.repeats} more times]` : ''}`, line, block.text, '');
  }
  if (rawLines !== undefined) out.push(line, 'RAW LOG (one JSON event per line, as stored)', line, rawLines, '');
  return `${out.join('\n').trimEnd()}\n`;
}

const HTML_CSS = 'body{font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:860px;margin:32px auto;padding:0 18px;color:#1d1d1f}h1{font-size:24px}h2{font-size:18px;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:4px}section{margin:14px 0;padding:10px 14px;border-radius:10px;border:1px solid #e3e3e6}.user{background:#f2f6ff}.assistant{background:#fff}.thinking{background:#fafaf5;color:#555}.tool-call,.tool-result,.system,.developer,.model,.event{background:#f7f7f8;font-size:13px}.who{font-weight:600;font-size:13px;color:#444}.when{font-weight:400;color:#888;margin-left:6px}pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font:12.5px/1.45 ui-monospace,Menlo,monospace}details>summary{cursor:pointer}dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px}dt{font-weight:600}dd{margin:0}@media print{body{margin:0;max-width:none}section{break-inside:avoid-page}details{display:block}details>*{display:block}}';

function toHtml(pieces, level, sessionId, rawLines) {
  const out = [`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(pieces.title)}</title><style>${HTML_CSS}</style></head><body>`, `<h1>${escapeHtml(pieces.title)}</h1>`, '<dl>'];
  for (const [name, value] of facts(pieces, level, sessionId)) out.push(`<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd>`);
  out.push('</dl>');
  if (level === 'full' && pieces.models.length) {
    out.push('<h2>Models and settings</h2><section class="model"><pre>');
    for (const item of pieces.models) out.push(escapeHtml(`${item.time || `seq ${item.seq}`}: ${JSON.stringify({ ...item.model, seq: undefined, time: undefined })}`));
    out.push('</pre></section>');
  }
  out.push('<h2>Conversation</h2>');
  for (const block of pieces.blocks) {
    const note = when(block);
    const head = `<div class="who">${escapeHtml(block.label)}${block.kind === 'system' && block.repeats > 0 ? ` (same text ${block.repeats} more times)` : ''}<span class="when">${escapeHtml(note)}</span></div>`;
    const body = `<pre>${escapeHtml(block.text)}</pre>`;
    const folded = block.kind === 'thinking' || block.kind === 'system' || block.kind === 'developer';
    out.push(folded ? `<section class="${block.kind}"><details><summary>${head}</summary>${body}</details></section>` : `<section class="${block.kind}">${head}${body}</section>`);
  }
  if (rawLines !== undefined) out.push(`<h2>Raw log</h2><section class="event"><details><summary>The log exactly as the app stored it (one JSON event per line)</summary><pre>${escapeHtml(rawLines)}</pre></details></section>`);
  out.push('</body></html>');
  return out.join('\n');
}

const messagesOf = (pieces) => {
  const list = [];
  for (const block of pieces.blocks) {
    if (block.kind === 'user') list.push({ role: 'user', seq: block.seq, time: block.time, turn: block.turn, text: block.text });
    else if (block.kind === 'assistant') list.push({ role: 'assistant', seq: block.seq, time: block.time, turn: block.turn, text: block.text });
    else if (block.kind === 'thinking') list.push({ role: 'thinking', seq: block.seq, time: block.time, turn: block.turn, text: block.text });
  }
  return list;
};

/** A short, safe file name for an export. */
export function fileName(title, level, sessionId, format) {
  const slug = String(title ?? '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'conversation';
  const short = String(sessionId ?? '').replace(/^session-/, '').slice(0, 8);
  return `${slug}${short ? `-${short}` : ''}-${level}.${format}`;
}

/**
 * One export, made.
 * @param {object[]} events - the stored events of the conversation.
 * @param {{level?: string, format?: string, sessionId?: string, now?: number}} [options]
 * @returns {{filename: string, mime: string, body: string, title: string, counts: object}} the file.
 */
export function buildExport(events, options = {}) {
  const level = LEVELS.includes(options.level) ? options.level : 'conversation';
  const format = FORMATS.includes(options.format) ? options.format : 'md';
  const sessionId = String(options.sessionId ?? '');
  const list = asList(events).filter((event) => event && typeof event === 'object');
  const pieces = readable(list, level);
  const rawLines = level === 'full' ? list.map((event) => JSON.stringify(event)).join('\n') : undefined;
  let body;
  if (format === 'json') {
    const base = { exportedAt: new Date(options.now ?? Date.now()).toISOString(), level, title: pieces.title, session: { id: sessionId || pieces.header.id, createdAt: stamp(pieces.header.createdAt), cwd: pieces.header.cwd, agentPreset: pieces.header.agentPreset } };
    body = JSON.stringify(level === 'full' ? { ...base, models: pieces.models.map((item) => ({ at: item.time, ...item.model, seq: undefined, time: undefined })), events: list } : { ...base, messages: messagesOf(pieces) }, null, 2);
  } else if (format === 'html') body = toHtml(pieces, level, sessionId, rawLines);
  else if (format === 'txt') body = toText(pieces, level, sessionId, rawLines);
  else body = toMarkdown(pieces, level, sessionId, rawLines);
  return { filename: fileName(pieces.title, level, sessionId, format), mime: MIME[format], body, title: pieces.title, counts: { events: list.length, blocks: pieces.blocks.length } };
}
