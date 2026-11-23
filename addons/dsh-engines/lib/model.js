/**
 * An engine offered to dsh as a model. In the model menu it stands beside the real models; picking
 * it for a Code conversation makes that conversation's answers come from the engine.
 *
 * What dsh sends a model (its instructions, its tools, the whole history) is not passed on. The
 * engine gets the user's newest message as its task, works in its copy of the project inside the
 * lock, and carries on from its own earlier session in that conversation. Its text is streamed
 * back as the answer, followed by what it changed and whether that was put into the project.
 */

/** Said when the app asks again after the newest message was already answered (nothing runs). */
export const AGAIN_TEXT = '(Answered above. The engine did not run again.)';

/** A queue that turns pushed values into something `for await` can read. */
function channel() {
  const items = [];
  let wake;
  let closed = false;
  return {
    push(value) {
      items.push(value);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *read() {
      for (;;) {
        while (items.length > 0) yield items.shift();
        if (closed) return;
        await new Promise((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
    },
  };
}

const textOf = (message) => {
  const content = message?.content;
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n') : '';
};

/** The text of a message when it is the user's own (not a note the app or the scheduler added), else ''. */
function ownText(message) {
  if (message?.role !== 'user') return '';
  const kind = message.source?.kind;
  if (kind !== undefined && kind !== 'user') return '';
  const text = textOf(message).trim();
  return text && !/^<system-reminder>/.test(text) ? text : '';
}

/**
 * The user's newest own message in what dsh sent.
 * @param {object[]} messages - the request's messages.
 * @returns {string} its text, '' when there is none.
 */
export function taskOf(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let at = list.length - 1; at >= 0; at -= 1) {
    const text = ownText(list[at]);
    if (text) return text;
  }
  return '';
}

/**
 * Stage 6b lab fix: whether the user's newest own message already has an answer after it. The app can add a note after
 * an answer (a Scratch thread's folder moved on its first turn) and ask again; the engine must not run that task twice.
 * @param {object[]} messages - the request's messages.
 * @returns {boolean} true when an assistant message follows the newest own user message.
 */
export function answeredAlready(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let at = list.length - 1; at >= 0; at -= 1) {
    if (list[at]?.role === 'assistant') return true;
    if (ownText(list[at])) return false;
  }
  return false;
}

/**
 * @param {object} deps - `adapters` (engine id -> engine file), `models(engine)` (model names the user listed),
 *   `turn({engine, model, task, signal, say})` (does one turn; resolves to `{input, output}`; `say(text)` streams text),
 *   `aside(messages)` (answers a request that is not a conversation's turn, such as a title; returns text),
 *   `again()` (optional: the line said when the newest message was already answered; English by default).
 * @returns {{providers: string[], adapter: object}} what `llm.registerAdapter` takes.
 */
export function engineModels({ adapters, models, turn, aside, again }) {
  const idOf = (engine) => `engine-${engine}`;
  const engineOf = (provider) => String(provider).replace(/^engine-/, '');
  const adapter = {
    providerInfo: (provider) => ({ id: provider, name: `${adapters[engineOf(provider)]?.label ?? provider} (engine)` }),
    providerRetryPolicy: () => undefined,
    imageRequestPricing: () => undefined,
    imageRequestTarget: (_provider, _model, image) => ({ width: image.width, height: image.height, maxBytes: image.bytes }),
    listModels: async (provider) => {
      const engine = engineOf(provider);
      const label = adapters[engine]?.label ?? engine;
      return [{ id: 'default', name: `${label}: its own default model` }, ...models(engine).map((name) => ({ id: name, name: `${label}: ${name}` }))].map((model) => ({ ...model, provider, contextWindow: 1_000_000, maxTokens: 64_000 }));
    },
    // `context` and `defaultMaxTokens` are what the app reads (compaction-basic checks them when an existing
    // thread switches to the engine; without them the switch fails with MODEL_SWITCH_COMPACTION_FAILED).
    resolveModel: async (provider, model) => ({ provider, id: model, name: `${adapters[engineOf(provider)]?.label ?? provider}: ${model === 'default' ? 'its own default model' : model}`, contextWindow: 1_000_000, maxTokens: 64_000, context: { contextWindow: 1_000_000 }, defaultMaxTokens: 64_000 }),
    async prepareCall(provider, model, signal) {
      return { model: await adapter.resolveModel(provider, model, signal), stream: (options) => adapter.stream(options) };
    },
    async *stream(options) {
      const engine = engineOf(options.provider);
      const pipe = channel();
      let usage = { inputTokens: 0, outputTokens: 0 };
      let text = '';
      const say = (piece) => {
        if (!piece) return;
        text += piece;
        pipe.push(piece);
      };
      const work = (async () => {
        try {
          const task = taskOf(options.messages);
          // A conversation's turn comes with the conversation's tools. Other requests (the app asking
          // for a title, a summary) come without, and must not start an engine.
          const isTurn = Array.isArray(options.tools) && options.tools.length > 0;
          // Already answered (the app asked again after its own note): nothing runs, one short line.
          if (isTurn && answeredAlready(options.messages)) {
            say(typeof again === 'function' ? String(again() || '') || AGAIN_TEXT : AGAIN_TEXT);
            return;
          }
          const done = !isTurn ? undefined : await turn({ engine, model: options.model === 'default' ? '' : String(options.model ?? ''), task, messages: options.messages, signal: options.signal, say });
          if (done === undefined) say(await aside(options.messages));
          else usage = { inputTokens: Number(done.input) || 0, outputTokens: Number(done.output) || 0 };
        } catch (error) {
          say(`\n\nThe engine could not do this: ${String(error?.message ?? error).slice(0, 400)}`);
        } finally {
          pipe.close();
        }
      })();
      yield { type: 'block-start', index: 0, blockType: 'text' };
      for await (const piece of pipe.read()) yield { type: 'text-delta', index: 0, text: piece };
      await work;
      if (!text) {
        text = '(the engine gave no answer)';
        yield { type: 'text-delta', index: 0, text };
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'usage', usage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens } };
      yield { type: 'finish', reason: options.signal?.aborted ? { kind: 'aborted' } : { kind: 'stop' } };
    },
  };
  return { providers: Object.keys(adapters).map(idOf), adapter };
}
