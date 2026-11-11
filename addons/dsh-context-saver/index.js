/**
 * Host half of Context Saver.
 *
 * Shortens a large text tool result before the model sees it and keeps the
 * original in a local store that the `context` MCP server (dsh-intel-mcp) can
 * read back. The shortened text, ending with a retrieval marker, is what the
 * session log records and what the model reads, so model-visible input equals
 * the log.
 *
 * Off until `enabled: true`. The transforms are the owner's tested Python
 * code, run by one long-lived helper process (`python -m
 * dsh_intel_mcp.context_saver`). Any helper failure leaves the tool result
 * unchanged: this plugin never fails a tool call.
 */
import { spawn } from 'node:child_process';
import z from '@deepseek-ai/schemastery';

export const name = 'context-saver';

/** Tools whose output must reach the model verbatim: file reads and edits. */
const DEFAULT_SKIP_TOOLS = [
  'read',
  'read_image',
  'write',
  'edit',
  'apply_patch',
  'str_replace_editor',
  'present',
  'ask_user_question',
];

export const Config = z.object({
  enabled: z.boolean().default(false),
  python: z.string(),
  dataDir: z.string(),
  minChars: z.number().min(500).max(1000000).default(4000),
  minGainPercent: z.number().min(1).max(95).default(15),
  perTier: z.dict(z.boolean()).default({}),
  skipTools: z.array(z.string()).default(DEFAULT_SKIP_TOOLS),
  retrieveToolName: z.string().default('mcp__context__context_retrieve'),
  helperTimeoutMs: z.number().min(500).max(120000).default(10000),
  promptSection: z.boolean().default(true),
  commandName: z.string().default('saved'),
});

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
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
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

export function apply(ctx, config) {
  if (plain(config.enabled) !== true) return;
  const python = String(plain(config.python) ?? '').trim();
  const dataDir = String(plain(config.dataDir) ?? '').trim();
  if (!python) throw new Error('context-saver: `python` is required when enabled');
  if (!dataDir.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(dataDir)) {
    throw new Error('context-saver: `dataDir` must be an absolute path when enabled');
  }

  /** @type {import('node:child_process').ChildProcess | null} */
  let helper = null;
  let buffer = '';
  let nextId = 1;
  /** id -> { resolve, reject, timer } */
  const pending = new Map();
  /** Recent helper start times, to stop a crash loop. */
  const starts = [];
  let pausedUntil = 0;
  let disposed = false;

  /**
   * Fail every waiting request.
   * @param {Error} error - reason.
   */
  function failAll(error) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }

  /**
   * Start the helper if it is not running.
   * @returns {import('node:child_process').ChildProcess | null} the helper, or null while paused or disposed.
   */
  function ensureHelper() {
    if (disposed) return null;
    if (helper && helper.exitCode === null && !helper.killed) return helper;
    const now = Date.now();
    if (now < pausedUntil) return null;
    while (starts.length > 0 && now - starts[0] > 60000) starts.shift();
    if (starts.length >= 3) {
      pausedUntil = now + 300000;
      ctx.logger.warn('context-saver: the helper failed 3 times in a minute; paused for 5 minutes');
      return null;
    }
    starts.push(now);
    const child = spawn(python, ['-m', 'dsh_intel_mcp.context_saver'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        PYTHONDONTWRITEBYTECODE: '1',
        DSH_INTEL_HOME: dataDir,
      },
    });
    buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (!line.trim()) continue;
        let reply;
        try {
          reply = JSON.parse(line);
        } catch {
          continue;
        }
        const entry = pending.get(reply.id);
        if (!entry) continue;
        pending.delete(reply.id);
        clearTimeout(entry.timer);
        if (reply.error) entry.reject(new Error(String(reply.error)));
        else entry.resolve(reply.result);
      }
    });
    child.stderr.on('data', () => {
      // The helper logs nothing the plugin needs; draining keeps its pipe from filling.
    });
    child.on('error', (error) => {
      ctx.logger.warn(`context-saver: helper could not start: ${error.message}`);
      failAll(error);
    });
    child.on('exit', () => {
      if (helper === child) helper = null;
      failAll(new Error('context-saver helper exited'));
    });
    helper = child;
    return child;
  }

  /**
   * Send one request to the helper.
   * @param {string} method - helper method.
   * @param {object} params - parameters.
   * @returns {Promise<any>} the helper's result.
   */
  function call(method, params) {
    const child = ensureHelper();
    if (!child) return Promise.reject(new Error('context-saver helper unavailable'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`context-saver helper did not answer within ${Number(plain(config.helperTimeoutMs)) || 10000} ms`));
        // A helper that stops answering is restarted on the next call rather than left hung.
        if (helper === child) {
          helper = null;
          child.kill();
        }
      }, Number(plain(config.helperTimeoutMs)) || 10000);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  ctx.effect(() => () => {
    disposed = true;
    failAll(new Error('context-saver stopped'));
    helper?.kill();
    helper = null;
  }, 'context-saver helper');

  let warned = false;
  /**
   * Log a helper problem once, so a missing interpreter does not flood the log.
   * @param {unknown} error - failure.
   */
  function warnOnce(error) {
    if (warned) return;
    warned = true;
    ctx.logger.warn(`context-saver: leaving tool results unchanged (${error?.message ?? error})`);
  }

  /**
   * Whether a call to this tool by this Agent may be compressed.
   * @param {object} exec - the tool call.
   * @returns {boolean} true when allowed.
   */
  function applies(exec) {
    const skip = new Set(plain(config.skipTools) ?? []);
    skip.add(String(plain(config.retrieveToolName)));
    if (skip.has(exec.name)) return false;
    const perTier = plain(config.perTier) ?? {};
    if (Object.keys(perTier).length > 0) {
      const tier = ctx.get('modelTiers')?.resolveTier?.(exec.agent?.id);
      if (!tier || perTier[tier.id] !== true) return false;
    }
    return true;
  }

  /**
   * Surface the Session is on: its Modes mode when it is one the helper knows.
   * @param {object} exec - the tool call.
   * @returns {'chat' | 'cowork' | 'code'} surface.
   */
  function surfaceOf(exec) {
    const mode = ctx.get('modes')?.get?.(exec.agent?.id);
    return mode === 'chat' || mode === 'code' ? mode : 'cowork';
  }

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try {
      if (decision.kind !== 'accept' || decision.value !== undefined || result.isError) return decision;
      if (!applies(exec)) return decision;
      const blocks = decision.content ?? result.content;
      if (!Array.isArray(blocks)) return decision;
      const minChars = Number(plain(config.minChars));
      const minGain = Number(plain(config.minGainPercent)) / 100;
      const surface = surfaceOf(exec);
      let changed = false;
      const out = [];
      for (const block of blocks) {
        if (block?.type !== 'text' || typeof block.text !== 'string' || block.text.length < minChars) {
          out.push(block);
          continue;
        }
        const compressed = await call('compress', {
          text: block.text,
          surface,
          retrievable: true,
          min_chars: minChars,
          min_gain: minGain,
        });
        if (compressed?.changed && typeof compressed.text === 'string') {
          out.push({ ...block, text: compressed.text });
          changed = true;
        } else {
          out.push(block);
        }
      }
      return changed ? { ...decision, content: out } : decision;
    } catch (error) {
      warnOnce(error);
      return decision;
    }
  });

  // Tell the model what a marker means.
  if (plain(config.promptSection) !== false) {
    const section = {
      name: 'context-saver',
      order: 75,
      interpolate: false,
      text: () =>
        'Long tool results may be shortened to save context. A shortened result ends with a line like ' +
        '`[Context Saver: N→M tokens. Full text: context_retrieve("key")]`. Errors, the first and last items ' +
        'and unusual values are kept in the shortened text. Call ' +
        `\`${plain(config.retrieveToolName)}\` only for detail you need, and fetch a slice with ` +
        '`start_line`/`end_line` or `grep` rather than the whole text.',
    };
    const owned = new Map();
    ctx.effect(() => () => {
      for (const dispose of owned.values()) {
        try {
          dispose?.();
        } catch {
          // The Agent context may already be unwinding.
        }
      }
      owned.clear();
    }, 'context-saver section ownership');
    ctx.on('agent/disposed', ({ agent }) => owned.delete(agent?.id));
    // The section goes when the Agent or this plugin goes, and a failure never blocks a new Session.
    const install = (agent) => {
      const agentCtx = agent?.ctx;
      if (!agentCtx?.systemPrompt || owned.has(agent.id)) return;
      try {
        owned.set(agent.id, agentCtx.effect(() => agentCtx.systemPrompt.section({ ...section, interpolate: false }), 'context-saver prompt section'));
      } catch (error) {
        ctx.logger.warn(`context-saver: prompt section not added: ${error?.message ?? error}`);
      }
    };
    ctx.on('agent/created', ({ agent }) => install(agent));
    for (const agent of ctx.get('agents')?.list() ?? []) install(agent);
  }

  /** Savings API for other plugins and the command. */
  const contextSaver = {
    apiVersion: 1,
    /**
     * @param {number} [days] - days to include.
     * @returns {Promise<object>} the ledger summary.
     */
    savings(days = 30) {
      return call('savings', { days });
    },
    /** @returns {Promise<object>} stored originals count and bytes. */
    storeStats() {
      return call('store_stats', {});
    },
  };
  ctx.effect(() => ctx.provide('contextSaver', Object.freeze(contextSaver)), 'context-saver service');

  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show how many tokens Context Saver has saved',
            handler: async () => {
              const summary = await contextSaver.savings(30);
              const stats = await contextSaver.storeStats();
              const t = summary.today;
              const p = summary.period;
              return {
                kind: 'success',
                text:
                  `Context Saver: today ${t.calls} results, ${t.before}→${t.after} tokens (saved ${t.saved}); ` +
                  `last 30 days ${p.calls} results, ${p.before}→${p.after} tokens (saved ${p.saved}); ` +
                  `${stats.items ?? 0} originals stored.`,
              };
            },
          }),
        'context-saver command',
      );
    });
  }
}
