/**
 * Host half of Notify.
 *
 * dsh has no desktop notification feature. This plugin watches session events
 * and, when one of your rules matches, runs the command you wrote for it, for
 * example `osascript` to show a macOS notification. Rules:
 *
 *   on: turnEnd   a top-level turn ended (completed, error, ...), optionally
 *                 only if it ran at least `minSeconds`
 *   on: approval  dsh is asking you to approve a tool call
 *
 * The command is run without a shell, from your list of arguments. The message
 * is fixed generic text built here (never the prompt or the model's words) and
 * reaches the command in environment variables; `{message}`-style placeholders
 * in the arguments are filtered to a safe character set. The plugin never
 * blocks a turn: the command runs in the background with a timeout, a failure
 * is only logged, and a per-rule interval and a per-minute cap stop floods.
 * Nothing is configured by default.
 */
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import z from '@deepseek-ai/schemastery';

export const name = 'notify';

const REASONS = ['completed', 'error', 'aborted', 'blocked', 'interrupted'];

export const Config = z.object({
  enabled: z.boolean().default(true),
  rules: z
    .array(
      z.object({
        id: z.string().required(),
        on: z.union([z.const('turnEnd'), z.const('approval')]).required(),
        reasons: z.array(z.string()).default(['completed', 'error']),
        minSeconds: z.number().min(0).max(86400).default(0),
        topLevelOnly: z.boolean().default(true),
        minIntervalSeconds: z.number().min(0).max(86400).default(5),
        timeoutMs: z.number().min(500).max(60000).default(5000),
        command: z.array(z.string()).required(),
      }),
    )
    .default([]),
  maxPerMinute: z.number().min(1).max(600).default(20),
  commandName: z.string().default('notify'),
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

/** The command runner; replaceable by tests. */
export const hooks = {
  /**
   * Run a program without a shell.
   * @param {string} file - program.
   * @param {string[]} args - arguments.
   * @param {{env: object, timeout: number}} options - environment and timeout.
   * @returns {Promise<void>} resolves when it exits 0, rejects otherwise.
   */
  run(file, args, options) {
    return new Promise((resolve, reject) => {
      execFile(file, args, { env: options.env, timeout: options.timeout, windowsHide: true, stdio: 'ignore' }, (error) => (error ? reject(error) : resolve()));
    });
  },
};

// ---- pure helpers (exported for tests) -------------------------------------------------

/**
 * Keep only characters that are harmless inside a program argument or a script.
 * @param {unknown} value - any text.
 * @returns {string} at most 120 characters of letters, digits and `space . _ : / - ( ) ,`; anything else becomes `?`.
 */
export function strict(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9 ._:/(),-]/g, '?').slice(0, 120);
}

/**
 * Remove control characters and cap the length.
 * @param {unknown} value - any text.
 * @returns {string} cleaned text.
 */
export function light(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
}

/**
 * The fixed message for an event. It never contains prompt or answer text.
 * @param {{event: string, reason?: string, tool?: string, project?: string}} info - what happened.
 * @returns {string} the message.
 */
export function messageFor(info) {
  const where = info.project ? ` in ${info.project}` : '';
  if (info.event === 'approval') return `Waiting for your approval${info.tool ? ` (${info.tool})` : ''}${where}`;
  if (info.reason === 'completed') return `Finished${where}`;
  if (info.reason === 'error') return `Stopped with an error${where}`;
  if (info.reason === 'aborted') return `Cancelled${where}`;
  return `Turn ended (${info.reason ?? 'unknown'})${where}`;
}

/**
 * Check rules; throws on one that must not run.
 * @param {Array<object>} rules - configured rules.
 */
export function checkRules(rules) {
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`notify: duplicate rule id "${rule.id}"`);
    ids.add(rule.id);
    if (!Array.isArray(rule.command) || !rule.command.length || !String(rule.command[0]).trim()) throw new Error(`notify: rule "${rule.id}" needs a non-empty \`command\` list (program first)`);
    for (const reason of rule.reasons ?? []) if (!REASONS.includes(reason)) throw new Error(`notify: rule "${rule.id}": unknown reason "${reason}". Use ${REASONS.join(', ')}`);
  }
}

/**
 * Fill placeholders in one argument.
 * @param {string} arg - argument text with optional `{message}`, `{event}`, `{reason}`, `{tool}`, `{project}`.
 * @param {Record<string, string>} values - values, already filtered with `strict`.
 * @returns {string} the argument.
 */
export function fill(arg, values) {
  return String(arg).replace(/\{(message|event|reason|tool|project)\}/g, (_all, key) => values[key] ?? '');
}

// ---- plugin ----------------------------------------------------------------------------

/**
 * Plugin entry.
 * @param {object} ctx - Cordis context.
 * @param {object} config - plugin config.
 */
export function apply(ctx, config) {
  const cfg = plain(config) ?? {};
  if (cfg.enabled === false) return;
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  checkRules(rules);
  const commandName = String(cfg.commandName ?? 'notify').trim();
  const maxPerMinute = Number(cfg.maxPerMinute) || 20;
  const startedAt = Date.now();

  /** Session id -> turn start time (ms). */
  const turnStarts = new Map();
  /** Rule id -> last fire time. */
  const lastFired = new Map();
  /** Fire times in the last minute, all rules. */
  let recent = [];
  const stats = { fired: 0, skippedRate: 0, failed: 0, lastError: '' };

  /**
   * Run one rule's command in the background.
   * @param {object} rule - the rule.
   * @param {{event: string, reason?: string, tool?: string, project?: string}} info - what happened.
   * @param {{force?: boolean}} [options] - force: ignore the rate limits (for the test command).
   * @returns {boolean} true when the command was started.
   */
  function fire(rule, info, options = {}) {
    const now = Date.now();
    if (!options.force) {
      recent = recent.filter((time) => now - time < 60000);
      if (recent.length >= maxPerMinute || now - (lastFired.get(rule.id) ?? 0) < (Number(rule.minIntervalSeconds) || 0) * 1000) {
        stats.skippedRate += 1;
        return false;
      }
    }
    recent.push(now);
    lastFired.set(rule.id, now);
    const message = messageFor(info);
    const values = { message: strict(message), event: strict(info.event), reason: strict(info.reason), tool: strict(info.tool), project: strict(info.project) };
    const [file, ...args] = rule.command.map(String);
    const env = {
      ...process.env,
      DSH_NOTIFY_MESSAGE: light(message),
      DSH_NOTIFY_EVENT: light(info.event),
      DSH_NOTIFY_REASON: light(info.reason),
      DSH_NOTIFY_TOOL: light(info.tool),
      DSH_NOTIFY_PROJECT: light(info.project),
    };
    stats.fired += 1;
    Promise.resolve()
      .then(() => hooks.run(file, args.map((arg) => fill(arg, values)), { env, timeout: Number(rule.timeoutMs) || 5000 }))
      .catch((error) => {
        stats.failed += 1;
        stats.lastError = String(error?.code ?? error?.message ?? error).slice(0, 120);
        ctx.logger?.('notify')?.warn?.(`rule ${rule.id}: command failed (${stats.lastError})`);
      });
    return true;
  }

  /**
   * Is this a top-level session (not a sub-agent child)?
   * @param {object} session - session.
   * @returns {boolean} true for a top-level session.
   */
  const isTopLevel = (session) => {
    const header = session?.header ?? session;
    return !(header?.origin === 'subagent' || header?.parentSession || Number(header?.delegationDepth) > 0);
  };

  if (rules.length) {
    ctx.on('session/event', (session, event) => {
      try {
        const stamp = event?.time ? new Date(event.time).getTime() : Date.now();
        if (Number.isFinite(stamp) && stamp < startedAt - 5000) return; // history being replayed
        const id = session?.id;
        const cwd = (session?.header ?? session)?.cwd;
        const project = cwd ? basename(String(cwd)) : '';
        if (event?.type === 'turn/start' && id) {
          if (turnStarts.size > 500) turnStarts.clear();
          turnStarts.set(id, Date.now());
          return;
        }
        if (event?.type === 'turn/end') {
          const started = turnStarts.get(id);
          turnStarts.delete(id);
          const reason = String(event.data?.reason?.kind ?? 'unknown');
          const seconds = started ? (Date.now() - started) / 1000 : 0;
          for (const rule of rules) {
            if (rule.on !== 'turnEnd') continue;
            if (rule.topLevelOnly !== false && !isTopLevel(session)) continue;
            if (!(rule.reasons ?? ['completed', 'error']).includes(reason)) continue;
            if (seconds < (Number(rule.minSeconds) || 0)) continue;
            fire(rule, { event: 'turnEnd', reason, project });
          }
          return;
        }
        if (event?.type === 'approval/asked') {
          for (const rule of rules) {
            if (rule.on !== 'approval') continue;
            if (rule.topLevelOnly !== false && !isTopLevel(session)) continue;
            fire(rule, { event: 'approval', tool: String(event.data?.toolName ?? ''), project });
          }
        }
      } catch (error) {
        ctx.logger?.('notify')?.warn?.(`could not handle an event: ${error?.message ?? error}`);
      }
    });
  }

  ctx.effect(() => ctx.provide('notify', Object.freeze({ apiVersion: 1, rules: () => rules.map((rule) => rule.id), test: (id) => testRule(id), stats: () => ({ ...stats }) })), 'notify service');

  /**
   * Fire a rule with a sample event, ignoring rate limits.
   * @param {string} [id] - rule id (default: all rules).
   * @returns {string} what was started.
   */
  function testRule(id) {
    if (!rules.length) throw new Error('no rules configured');
    const chosen = id ? rules.filter((rule) => rule.id === id) : rules;
    if (!chosen.length) throw new Error(`no rule "${id}". Rules: ${rules.map((rule) => rule.id).join(', ')}`);
    for (const rule of chosen) fire(rule, rule.on === 'approval' ? { event: 'approval', tool: 'example_tool', project: 'example' } : { event: 'turnEnd', reason: 'completed', project: 'example' }, { force: true });
    return `Started ${chosen.length} test command(s): ${chosen.map((rule) => rule.id).join(', ')}.`;
  }

  if (!commandName) return;
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: commandName,
          description: 'Notify: `test [rule]` runs a rule with a sample event; no argument shows status',
          input: { hint: 'test [rule] | status' },
          handler: async ({ rawInput }) => {
            const [verb, arg] = String(rawInput ?? '').trim().split(/\s+/);
            try {
              if (verb === 'test') return { kind: 'success', text: testRule(arg) };
              if (!verb || verb === 'status') {
                if (!rules.length) return { kind: 'success', text: 'No notification rules configured.' };
                const lines = rules.map((rule) => `${rule.id}: on ${rule.on}${rule.on === 'turnEnd' ? ` (${(rule.reasons ?? ['completed', 'error']).join('/')}${rule.minSeconds ? `, at least ${rule.minSeconds}s` : ''})` : ''}`);
                lines.push(`Started ${stats.fired}, failed ${stats.failed}${stats.lastError ? ` (last: ${stats.lastError})` : ''}, skipped by rate limit ${stats.skippedRate}.`);
                return { kind: 'success', text: lines.join('\n') };
              }
              return { kind: 'error', text: `Usage: /${commandName} test [rule] | status` };
            } catch (error) {
              return { kind: 'error', text: error.message };
            }
          },
        }),
      'notify command',
    );
  });
}
