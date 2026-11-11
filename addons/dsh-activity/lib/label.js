/**
 * The short text beside the bar: what is running, with figures when wanted.
 * Only kinds that are active and not switched off appear.
 */

const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * A token count in short form: 840, 12.4k, 1.2M.
 * @param {number} n - tokens.
 * @returns {string} short form.
 */
export function shortCount(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return thousands(value);
}

/**
 * A duration in short form: 4s, 1m 12s, 1h 3m.
 * @param {number} seconds - duration.
 * @param {boolean} [fine] - show tenths of a second below ten seconds.
 * @returns {string} short form.
 */
export function shortTime(seconds, fine = false) {
  if (fine && Number(seconds) < 10) return `${(Math.max(0, Number(seconds) || 0)).toFixed(1)}s`;
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

const rate = (value) => (value >= 100 ? thousands(value) : String(Math.round(value * 10) / 10));

/**
 * The kinds that are active and shown, in display order.
 * @param {object} snapshot - tracker snapshot.
 * @param {{hidden: string[]}} settings - display settings.
 * @returns {string[]} kinds.
 */
export function shownKinds(snapshot, settings) {
  const hidden = new Set(settings?.hidden ?? []);
  return ['wait', 'error', 'prompt', 'reason', 'write', 'tool', 'web', 'script', 'sub', 'other'].filter((kind) => snapshot?.kinds?.[kind] && !hidden.has(kind));
}

/**
 * Build the text.
 * @param {object} snapshot - tracker snapshot.
 * @param {object} settings - display settings (`figures`, `words`, `promptSpeed`, `context`, `hidden`).
 * @returns {{text: string, parts: Array<{kind: string, text: string}>}} the text and its parts.
 */
export function labelOf(snapshot, settings) {
  const figures = settings?.figures !== false;
  const words = settings?.words === true;
  const kinds = snapshot?.kinds ?? {};
  const parts = [];
  for (const kind of shownKinds(snapshot, settings)) {
    const detail = kinds[kind];
    let text = '';
    switch (kind) {
      case 'wait':
        text = `Waiting for you${detail.tool ? `: ${detail.tool}` : ''}${figures ? ` ${shortTime(detail.seconds)}` : ''}`;
        break;
      case 'error':
        text = detail.retry ? `Retry ${detail.retry}` : `Error${detail.text ? `: ${detail.text}` : ''}`;
        break;
      case 'prompt':
        text = words ? 'Reading prompt' : 'PP';
        if (figures) {
          text += ` ${shortTime(detail.seconds, true)}`;
          if (detail.tokens > 0) text += ` · ~${shortCount(detail.tokens)} tokens`;
          if (detail.lastRate > 0) text += ` · last ${rate(detail.lastRate)} t/s`;
        }
        break;
      case 'reason':
        text = 'Thinking';
        if (figures) text += `${detail.rate > 0 ? ` ${rate(detail.rate)} t/s` : ''} · ${shortTime(detail.seconds)}`;
        break;
      case 'write':
        text = words ? 'Writing' : 'TG';
        if (figures) text += `${detail.rate > 0 ? ` ${rate(detail.rate)} t/s` : ''}${detail.tokens > 0 ? ` · ${shortCount(detail.tokens)} tokens` : ''}`;
        break;
      case 'tool':
      case 'web':
      case 'script':
        text = `${{ tool: 'Tool', web: 'Web', script: words ? 'Script' : 'Run' }[kind]} ${detail.name}${detail.count > 1 ? ` +${detail.count - 1}` : ''}${figures ? ` ${shortTime(detail.seconds)}` : ''}`;
        break;
      case 'sub':
        text = `${words ? (detail.count === 1 ? 'Sub-agent' : 'Sub-agents') : 'BG'} ${detail.count}${figures ? ` · ${shortTime(detail.seconds)}` : ''}`;
        break;
      case 'other':
        text = `${words ? (detail.count === 1 ? 'Other chat' : 'Other chats') : 'OC'} ${detail.count}`;
        break;
      default:
        break;
    }
    if (text) parts.push({ kind, text });
  }
  const modelBusy = parts.some((part) => part.kind === 'reason' || part.kind === 'write');
  if (figures && modelBusy) {
    if (settings?.promptSpeed !== false && snapshot?.lastPrompt?.rate > 0) parts.push({ kind: 'extra', text: `PP ${rate(snapshot.lastPrompt.rate)} t/s` });
  }
  if (figures && settings?.context !== false && snapshot?.context > 0 && parts.some((part) => ['prompt', 'reason', 'write'].includes(part.kind))) {
    parts.push({ kind: 'extra', text: `${words ? 'context' : 'ctx'} ${shortCount(snapshot.context)}` });
  }
  return { text: parts.map((part) => part.text).join(' · '), parts };
}

/** Sample states for the preview on the settings page. No real data is involved. */
export const DEMOS = {
  prompt: { kinds: { prompt: { seconds: 3.2, tokens: 12400, lastRate: 1850 } }, context: 12400 },
  reason: { kinds: { reason: { rate: 38, seconds: 6, tokens: 228 } }, context: 12400, lastPrompt: { rate: 1850, tokens: 12400, seconds: 6.7 } },
  write: { kinds: { write: { rate: 42, seconds: 9, tokens: 378 } }, context: 12800, lastPrompt: { rate: 1850, tokens: 12400, seconds: 6.7 } },
  tool: { kinds: { tool: { count: 1, name: 'read_file', seconds: 2 } }, context: 12800 },
  web: { kinds: { web: { count: 1, name: 'web_search', seconds: 4 } }, context: 12800 },
  background: { kinds: { sub: { count: 3, seconds: 72, tools: 2 }, script: { count: 1, name: 'bash', seconds: 31 } }, context: 12800 },
  all: {
    kinds: { write: { rate: 42, seconds: 9, tokens: 378 }, tool: { count: 1, name: 'read_file', seconds: 2 }, web: { count: 1, name: 'web_search', seconds: 4 }, script: { count: 1, name: 'bash', seconds: 31 }, sub: { count: 2, seconds: 72, tools: 1 }, other: { count: 1 } },
    context: 46200,
    lastPrompt: { rate: 1850, tokens: 12400, seconds: 6.7 },
  },
  wait: { kinds: { wait: { tool: 'bash', seconds: 12, count: 1, from: 'main' }, sub: { count: 1, seconds: 40, tools: 0 } }, context: 12800 },
  error: { kinds: { error: { text: 'The model server did not answer', retry: 0 } }, context: 12800 },
  idle: { kinds: {}, context: 12800 },
};

/**
 * A sample state by name.
 * @param {string} name - one of the DEMOS keys.
 * @returns {object | undefined} a snapshot, or undefined for an unknown name.
 */
export function demoSnapshot(name) {
  const demo = DEMOS[name];
  if (!demo) return undefined;
  return { at: Date.now(), session: 'demo', running: Object.keys(demo.kinds).length > 0, lastPrompt: null, lastRates: null, turnSeconds: 0, ...structuredClone(demo) };
}
