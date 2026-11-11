/**
 * Privacy (host half).
 *
 * The switching off is done by this add-on's `cordis.patch.yml`. This code only
 * checks that it took effect, says so in the log at start, and answers `/privacy`.
 * It contacts nothing and reads no conversation.
 */
import z from '@deepseek-ai/schemastery';

export const Config = z.object({
  /** Slash command; empty registers none. */
  commandName: z.string().default('privacy'),
});

/** The app rows that report to its maker. */
export const FEEDBACK_ROW = 'session-telemetry-otel';
export const USAGE_ROW = 'product-analytics';

/**
 * Plain value of a config field that may be a live reference.
 * @param {unknown} value - field value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && !Array.isArray(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Work out what is on and off from the app's loaded rows.
 * @param {Array<{id?: string, disabled?: boolean, options?: {id?: string, config?: object}}>} entries - loader entries.
 * @returns {{feedbackUpload: 'off' | 'on', usageEvents: 'off' | 'on', lines: string[]}} the state, and one plain line per channel.
 */
export function readState(entries) {
  const find = (id) => entries.find((entry) => (entry.options?.id ?? entry.id) === id);
  const feedback = find(FEEDBACK_ROW);
  const usage = find(USAGE_ROW);
  // A row that is absent or switched off reports nothing.
  const feedbackOff = !feedback || feedback.disabled === true || String(plain(plain(feedback.options?.config)?.mode) ?? '') === 'DISABLED';
  const usageOff = !usage || usage.disabled === true || plain(plain(usage.options?.config)?.enabled) === false;
  return {
    feedbackUpload: feedbackOff ? 'off' : 'on',
    usageEvents: usageOff ? 'off' : 'on',
    lines: [
      feedbackOff
        ? 'Conversation upload on feedback: off. Rating an answer stays on this Mac.'
        : 'Conversation upload on feedback: ON. Rating an answer uploads the conversation to the app\'s maker.',
      usageOff
        ? 'Usage events: off.'
        : 'Usage events: ON. Each message sent is reported with its model name, your ids and hardware details.',
    ],
  };
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  /** @returns {ReturnType<typeof readState>} the state now. */
  const state = () => {
    try {
      const loader = ctx.get('loader') ?? ctx.loader;
      return readState(loader ? [...loader.entries()] : []);
    } catch (error) {
      return { feedbackUpload: 'on', usageEvents: 'on', lines: [`The state could not be read: ${String(error?.message ?? error).slice(0, 120)}`] };
    }
  };

  ctx.effect(() => ctx.provide('privacy', Object.freeze({ apiVersion: 1, state })), 'privacy service');

  // Say once at start whether the switches took effect. Rows load in order, so look a little later.
  const timer = setTimeout(() => {
    const now = state();
    const ok = now.feedbackUpload === 'off' && now.usageEvents === 'off';
    ctx.logger[ok ? 'info' : 'warn'](`privacy: ${now.lines.join(' ')}`);
  }, 3000);
  ctx.effect(() => () => clearTimeout(timer), 'privacy start check');

  const commandName = String(plain(config.commandName) ?? '').trim();
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show whether the app reports to its maker',
            handler: async () => {
              const now = state();
              return {
                kind: now.feedbackUpload === 'off' && now.usageEvents === 'off' ? 'success' : 'error',
                text: [
                  ...now.lines,
                  'Still on, by design: update checks, your DeepSeek sign-in while signed in, the plugin list, and web search when a conversation uses it.',
                ].join('\n'),
              };
            },
          }),
        'privacy command',
      );
    });
  }
}
