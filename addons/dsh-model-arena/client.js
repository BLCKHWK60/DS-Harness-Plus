/**
 * Browser half of Model arena: the "Arena" page in Settings (and the same page from the sidebar).
 *
 * The page does three things:
 *  - Setup: pick the models to compare, the judge and the options. It reads and writes the add-on's
 *    own settings through the app's settings channel, so a change applies at once.
 *  - Ask: send one prompt to the models, then Judge, Pick and Reveal with buttons. These go to the
 *    fenced `POST dsh-model-arena/action` route of the host half.
 *  - Rounds: the answers side by side, one column per label (A, B, C, D), read from the fenced
 *    `GET dsh-model-arena/rounds` and `GET dsh-model-arena/round?id=` routes.
 *
 * The arena stays blind: until you reveal a round the routes carry only the label, the answer text
 * with model names removed, a generic failure word, the judge's result in labels and your pick.
 * The Setup area does show which models are in the arena (you chose them), but never which model
 * wrote which answer. While a round is being asked the page shows only how many answers are in.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-model-arena',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    /** The add-on's settings namespace (its id in the bundle's cordis.patch.yml). */
    const NS = 'model-arena';
    const DEFAULT_CRITERIA = ['accuracy', 'completeness', 'clarity', 'relevance'];

    const EN = {
      'section.title': 'Arena',
      'panel.title': 'Model Arena',
      'head.hint': 'Send one question to several models at once and read the answers side by side. The answers are only labelled A, B, C, D, so you judge the text, not the name. When you are ready, Reveal shows which model wrote what.',
      'setup.title': 'Setup',
      'setup.need': 'Pick at least two models to compare.',
      'setup.ready': '{n} models are in the arena.',
      'models.head': 'Models to compare',
      'models.add': 'Add a model…',
      'models.none': 'No models in the app yet. Add one in Settings → Models first.',
      'models.remove': 'Remove',
      'models.missing': 'not available right now',
      'effort.label': 'Effort',
      'effort.default': 'Default',
      'judge.head': 'Judge',
      'judge.title': 'Judge model',
      'judge.desc': 'A model that compares the answers without knowing who wrote them. Optional: you can always pick the winner yourself.',
      'judge.noneopt': 'No judge',
      'judge.noservice': 'The judge needs the Code power add-on, which is switched off.',
      'opt.head': 'Options',
      'opt.max.title': 'Answers per round',
      'opt.max.desc': 'With more models than this, each round draws this many at random.',
      'opt.blind.title': 'Hide the names until I reveal',
      'opt.blind.desc': 'Off shows who wrote what straight away when you ask with /arena in a chat.',
      'opt.redact.title': 'Remove model names from answers',
      'opt.redact.desc': 'If a model says its own name, the name is replaced by [model].',
      'opt.twice.title': 'Judge twice',
      'opt.twice.desc': 'The judge reads the answers a second time in reverse order. If the two results differ, it is a tie.',
      'opt.criteria.title': 'What the judge looks at',
      'opt.criteria.desc': 'Words separated by commas. Empty uses: accuracy, completeness, clarity, relevance.',
      'opt.timeout.title': 'Time limit per answer',
      'opt.timeout.desc': 'Seconds. A model that takes longer counts as "no answer".',
      'opt.tokens.title': 'Longest answer',
      'opt.tokens.desc': 'Max output tokens per answer. 0 means no limit.',
      'opt.days.title': 'Keep rounds for',
      'opt.days.desc': 'Days. Older rounds are deleted.',
      'saved': 'Saved',
      'saving': 'Saving…',
      'save.failed': 'Could not save: {reason}',
      'ask.title': 'Ask',
      'ask.placeholder': 'Type a question or task for all the models…',
      'ask.button': 'Ask the models',
      'ask.busy': 'Asking…',
      'ask.need': 'Pick at least two models in Setup first.',
      'rounds.title': 'Rounds',
      'rounds.empty': 'No rounds yet. Type a question above and press "Ask the models".',
      'chip.judged': 'judged',
      'chip.picked': 'picked',
      'chip.revealed': 'revealed',
      'chip.blind': 'blind',
      'chip.running': 'running',
      'running': '{done} of {total} answers in. Which ones stays hidden so the test stays blind.',
      'refresh': 'Refresh',
      'prompt': 'Question',
      'answer': 'Answer {label}',
      'no.answer': 'No answer: {reason}',
      'judge.win': 'Judge: Answer {label} wins{both}.',
      'judge.both': ', in both readings',
      'judge.tie': 'Judge: tie.',
      'judge.split': 'Judge: tie (the two readings disagreed).',
      'judge.family': 'The judge shares a provider or model with at least one contestant, so it may favour its own family.',
      'act.judge': 'Ask the judge',
      'act.judging': 'Judging…',
      'act.judge.none': 'Pick a judge model in Setup to use the judge.',
      'act.pick': 'Pick this answer',
      'act.reveal': 'Reveal the models',
      'act.delete': 'Delete round',
      'act.delete.sure': 'Delete for good',
      'act.cancel': 'Keep',
      'pick.yours': 'Your pick',
      'pick.judge': "Judge's pick",
      'agree': 'You and the judge agree.',
      'disagree': 'You and the judge disagree.',
      'reveal.hint': 'Names, speed and token counts stay hidden until you reveal.',
      'score': 'score {n}',
      'ms': '{n} ms',
      'tokens': '{a} in / {b} out',
      'failed': 'Could not read the arena. Is the Model arena add-on switched on?',
      'loading': 'Loading arena…',
      'gone': 'This round is no longer available.',
    };
    const DICT = {
      en: EN,
      // Strings without a translation yet fall back to English.
      zh: {
        ...EN,
        'section.title': '竞技场',
        'panel.title': '模型竞技场',
        'rounds.title': '各轮',
        'chip.judged': '已评审',
        'chip.picked': '已选择',
        'chip.revealed': '已揭晓',
        'chip.blind': '盲评',
        'chip.running': '进行中',
        'running': '已收到 {done} / {total} 个回答。具体是哪几个会保持隐藏，以保证盲评。',
        'refresh': '刷新',
        'prompt': '提示词',
        'answer': '回答 {label}',
        'no.answer': '无回答：{reason}',
        'judge.tie': '评审：平局。',
        'pick.yours': '你的选择',
        'pick.judge': '评审的选择',
        'agree': '你和评审意见一致。',
        'disagree': '你和评审意见不一致。',
        'score': '得分 {n}',
        'tokens': '输入 {a} / 输出 {b}',
        'loading': '正在加载竞技场…',
        'gone': '这一轮已不可用。',
      },
    };

    // Looks follow docs/UI-STYLE.md: colours only from the app's variables, sizes from its table.
    const FIELD_FILL = 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)';
    const CSS = `
.dsh-ar-page { display: flex; flex-direction: column; gap: 20px; padding: 2px 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-ar-head h2 { margin: 0 0 4px; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-ar-head p { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-ar-group { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ar-sec { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-ar-sechead { display: flex; align-items: center; gap: 10px; }
.dsh-ar-spacer { flex: 1; }
.dsh-ar-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ar-stamp[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ar-btn { height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.dsh-ar-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ar-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-ar-btn:disabled { opacity: .5; cursor: default; }
.dsh-ar-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-ar-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-ar-card { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-ar-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ar-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ar-note[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-ar-field { height: 36px; box-sizing: border-box; border: 0; border-radius: 12px; padding: 0 14px; background: ${FIELD_FILL}; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; min-width: 0; }
.dsh-ar-field:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ar-field:disabled { opacity: .5; }
select.dsh-ar-field { padding-right: 8px; cursor: pointer; }
textarea.dsh-ar-field { height: auto; min-height: 76px; padding: 10px 14px; line-height: 22px; resize: vertical; width: 100%; }
.dsh-ar-num { width: 110px; }
.dsh-ar-rows { display: flex; flex-direction: column; }
.dsh-ar-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ar-row:first-child { border-top: 0; padding-top: 4px; }
.dsh-ar-row:last-child { padding-bottom: 4px; }
.dsh-ar-rowtext { flex: 1; min-width: 0; }
.dsh-ar-rowtitle { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dsh-ar-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ar-rowctl { display: flex; align-items: center; gap: 8px; flex: none; max-width: 60%; }
.dsh-ar-rowctl .dsh-ar-field { max-width: 100%; }
.dsh-ar-wide { width: 260px; }
.dsh-ar-switch { position: relative; width: 36px; height: 20px; padding: 2px; box-sizing: border-box; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; flex: none; }
.dsh-ar-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
/* The knob takes the app's own knob colours: on a pale accent (the stock scheme) a white knob would vanish. */
.dsh-ar-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb); transition: transform .12s ease; }
.dsh-ar-switch[aria-checked="true"]::after { background: var(--dsw-alias-bg-base); }
.dsh-ar-switch[aria-checked="true"]::after { transform: translateX(16px); }
.dsh-ar-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ar-switch:disabled { opacity: .5; cursor: default; }
.dsh-ar-askbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dsh-ar-list { display: flex; flex-direction: column; }
.dsh-ar-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-top: 0.5px solid var(--dsw-alias-border-l1); cursor: pointer; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); border-radius: 8px; }
.dsh-ar-item:first-child { border-top: 0; }
.dsh-ar-item:hover, .dsh-ar-item[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ar-item:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dsh-ar-item .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-ar-item .d { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.dsh-ar-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 11px; white-space: nowrap; color: var(--dsw-alias-label-secondary); background: ${FIELD_FILL}; }
.dsh-ar-chip[data-k="good"] { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.dsh-ar-chip[data-k="you"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-ar-prompt { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-ar-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; align-items: start; }
.dsh-ar-col { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; display: flex; flex-direction: column; min-width: 0; }
.dsh-ar-col[data-win="true"] { border-color: var(--dsw-alias-state-success-primary); }
.dsh-ar-col header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ar-col header b { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-ar-col header .n { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ar-text { margin: 0; padding: 12px; max-height: 380px; overflow: auto; font: inherit; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-ar-text[data-err="true"] { color: var(--dsw-alias-label-secondary); font-style: italic; }
.dsh-ar-foot { padding: 8px 12px; border-top: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
@media (max-width: 620px) {
  .dsh-ar-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .dsh-ar-rowctl { max-width: 100%; }
  .dsh-ar-wide { width: 100%; }
}
`;

    const POLL_SLOW = 10000;
    const POLL_FAST = 2000;
    const SEP = '\u0000';

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };
    /** Send one action to the host half; throws the plain reason when it is refused. */
    const act = async (body) => {
      const response = await fetch(new URL('dsh-model-arena/action', document.baseURI), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) throw new Error(data?.error ?? `the app answered ${response.status}`);
      return data;
    };
    const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.split('{' + key + '}').join(String(value)), text);

    /** The add-on's settings as the page uses them; anything unusable is left out. */
    function normalize(value) {
      const source = value ?? {};
      const seen = new Set();
      const candidates = [];
      for (const item of Array.isArray(source.candidates) ? source.candidates : []) {
        const id = String(item?.id ?? '').trim();
        if (!id || seen.has(id) || !item.provider || !item.model) continue;
        seen.add(id);
        candidates.push({ id, provider: String(item.provider), model: String(item.model), reasoningEffort: String(item.reasoningEffort ?? '') });
      }
      return {
        candidates,
        maxContestants: Math.min(4, Math.max(2, Number(source.maxContestants) || 4)),
        blindByDefault: source.blindByDefault !== false,
        redactNames: source.redactNames !== false,
        consistencyCheck: source.consistencyCheck !== false,
        judge: source.judge?.provider && source.judge?.model ? { provider: String(source.judge.provider), model: String(source.judge.model) } : null,
        criteria: (Array.isArray(source.criteria) ? source.criteria : []).map((item) => String(item ?? '').trim()).filter(Boolean),
        timeoutMs: Number(source.limits?.timeoutMs) || 120000,
        maxTokens: Math.max(0, Number(source.limits?.maxTokens) || 0),
        storeDays: Number(source.storeDays) || 30,
      };
    }

    async function loadSettings(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('the Model arena add-on is switched off');
      return { config: normalize(view.value), revision: view.revision };
    }

    /** Write fields; on a clash with a newer change, reload and try once more. */
    async function saveSettings(ctx, fields, revision) {
      const ops = Object.entries(fields).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return { config: normalize(result.value.value), revision: result.value.revision };
    }

    async function loadCatalog(ctx) {
      try {
        const result = await ctx.remote.session.modelCatalog();
        return result.ok ? result.value : null;
      } catch {
        return null;
      }
    }

    const findModel = (catalog, provider, model) => catalog?.groups?.find((group) => group.id === provider)?.models?.find((item) => item.id === model);
    const providerName = (catalog, provider) => catalog?.groups?.find((group) => group.id === provider)?.name ?? provider;

    /** A short, unique name for a contestant, made from its model id. */
    function contestantId(model, taken) {
      const base = String(model).split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'model';
      let id = base.length >= 3 ? base : `${base}-model`;
      for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
      return id;
    }

    function Switch({ checked, label, onChange, disabled }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-ar-switch', 'aria-checked': checked, 'aria-label': label, disabled, onClick: () => onChange(!checked) });
    }

    /** One settings row: text on the left, the control on the right. */
    function Row({ title, desc, children }) {
      return h('div', { className: 'dsh-ar-row' }, h('div', { className: 'dsh-ar-rowtext' }, h('div', { className: 'dsh-ar-rowtitle' }, title), desc ? h('div', { className: 'dsh-ar-rowdesc' }, desc) : null), h('div', { className: 'dsh-ar-rowctl' }, children));
    }

    /** A model list grouped by provider. `value` and `onChange` use `provider\0model`. */
    function ModelSelect({ catalog, value, onChange, first, label, exclude, className, disabled }) {
      const groups = (catalog?.groups ?? [])
        .map((group) => ({ ...group, models: group.models.filter((model) => !exclude?.has(group.id + SEP + model.id)) }))
        .filter((group) => group.models.length > 0);
      const known = !value || (catalog?.groups ?? []).some((group) => group.models.some((model) => group.id + SEP + model.id === value));
      return h(
        'select',
        { className: 'dsh-ar-field ' + (className ?? ''), value: value ?? '', 'aria-label': label, disabled, onChange: (event) => onChange(event.target.value) },
        h('option', { value: '' }, first),
        known ? null : h('option', { value }, value.split(SEP).join(' / ')),
        groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((model) => h('option', { key: model.id, value: group.id + SEP + model.id }, model.name)))),
      );
    }

    /** A number box that saves when you leave it or press Enter. */
    function NumberField({ value, min, max, label, onCommit, disabled }) {
      const [text, setText] = useState(String(value));
      useEffect(() => setText(String(value)), [value]);
      const commit = () => {
        const number = Math.round(Number(text));
        if (!Number.isFinite(number) || text.trim() === '') return setText(String(value));
        const next = Math.min(max, Math.max(min, number));
        setText(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', {
        className: 'dsh-ar-field dsh-ar-num', type: 'number', min, max, step: 1, value: text, 'aria-label': label, disabled,
        onChange: (event) => setText(event.target.value), onBlur: commit,
        onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } },
      });
    }

    function Setup({ t, cfg, catalog, save, saving, judgeService }) {
      const [criteria, setCriteria] = useState(cfg.criteria.join(', '));
      useEffect(() => setCriteria(cfg.criteria.join(', ')), [cfg.criteria.join(SEP)]);
      const taken = new Set(cfg.candidates.map((item) => item.provider + SEP + item.model));
      const stored = (list) => list.map(({ id, provider, model, reasoningEffort }) => ({ id, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }));
      const add = (value) => {
        const [provider, model] = value.split(SEP);
        if (!provider || !model) return;
        const id = contestantId(model, new Set(cfg.candidates.map((item) => item.id)));
        save({ candidates: stored([...cfg.candidates, { id, provider, model, reasoningEffort: '' }]) });
      };
      const hasModels = (catalog?.groups ?? []).some((group) => group.models.length > 0);
      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsh-ar-sec' },
          h('h3', { className: 'dsh-ar-group' }, t('models.head')),
          h(
            'div',
            { className: 'dsh-ar-card' },
            h('p', { className: 'dsh-ar-note', 'data-warn': String(cfg.candidates.length < 2), role: 'status' }, cfg.candidates.length < 2 ? t('setup.need') : fill(t('setup.ready'), { n: cfg.candidates.length })),
            cfg.candidates.length > 0
              ? h(
                  'div',
                  { className: 'dsh-ar-rows' },
                  cfg.candidates.map((item) => {
                    const model = findModel(catalog, item.provider, item.model);
                    const efforts = (model?.reasoning?.efforts ?? []).map((effort) => String(effort.id));
                    if (item.reasoningEffort && !efforts.includes(item.reasoningEffort)) efforts.push(item.reasoningEffort);
                    return h(
                      Row,
                      { key: item.id, title: model?.name ?? item.model, desc: providerName(catalog, item.provider) + (catalog && !model ? ' · ' + t('models.missing') : '') },
                      efforts.length > 0
                        ? h(
                            'select',
                            {
                              className: 'dsh-ar-field', value: item.reasoningEffort, disabled: saving, 'aria-label': t('effort.label') + ': ' + (model?.name ?? item.model),
                              onChange: (event) => save({ candidates: stored(cfg.candidates.map((other) => (other.id === item.id ? { ...other, reasoningEffort: event.target.value } : other))) }),
                            },
                            h('option', { value: '' }, t('effort.label') + ': ' + t('effort.default')),
                            efforts.map((effort) => h('option', { key: effort, value: effort }, t('effort.label') + ': ' + effort)),
                          )
                        : null,
                      h('button', { type: 'button', className: 'dsh-ar-btn', disabled: saving, onClick: () => save({ candidates: stored(cfg.candidates.filter((other) => other.id !== item.id)) }) }, t('models.remove')),
                    );
                  }),
                )
              : null,
            hasModels
              ? h(ModelSelect, { catalog, value: '', onChange: add, first: t('models.add'), label: t('models.add'), exclude: taken, className: 'dsh-ar-wide', disabled: saving })
              : h('p', { className: 'dsh-ar-note' }, t('models.none')),
          ),
        ),
        h(
          'section',
          { className: 'dsh-ar-sec' },
          h('h3', { className: 'dsh-ar-group' }, t('judge.head')),
          h(
            'div',
            { className: 'dsh-ar-rows' },
            h(
              Row,
              { title: t('judge.title'), desc: t('judge.desc') + (cfg.judge && !judgeService ? ' ' + t('judge.noservice') : '') },
              h(ModelSelect, {
                catalog, value: cfg.judge ? cfg.judge.provider + SEP + cfg.judge.model : '', first: t('judge.noneopt'), label: t('judge.title'), className: 'dsh-ar-wide', disabled: saving,
                onChange: (value) => { const [provider, model] = value.split(SEP); save({ judge: provider && model ? { provider, model } : {} }); },
              }),
            ),
            h(Row, { title: t('opt.twice.title'), desc: t('opt.twice.desc') }, h(Switch, { checked: cfg.consistencyCheck, label: t('opt.twice.title'), disabled: saving, onChange: (value) => save({ consistencyCheck: value }) })),
            h(
              Row,
              { title: t('opt.criteria.title'), desc: t('opt.criteria.desc') },
              h('input', {
                className: 'dsh-ar-field dsh-ar-wide', type: 'text', value: criteria, placeholder: DEFAULT_CRITERIA.join(', '), 'aria-label': t('opt.criteria.title'), disabled: saving,
                onChange: (event) => setCriteria(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } },
                onBlur: () => {
                  const next = [...new Set(criteria.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 12);
                  if (next.join(SEP) !== cfg.criteria.join(SEP)) save({ criteria: next });
                  else setCriteria(cfg.criteria.join(', '));
                },
              }),
            ),
          ),
        ),
        h(
          'section',
          { className: 'dsh-ar-sec' },
          h('h3', { className: 'dsh-ar-group' }, t('opt.head')),
          h(
            'div',
            { className: 'dsh-ar-rows' },
            h(
              Row,
              { title: t('opt.max.title'), desc: t('opt.max.desc') },
              h('select', { className: 'dsh-ar-field', value: String(cfg.maxContestants), disabled: saving, 'aria-label': t('opt.max.title'), onChange: (event) => save({ maxContestants: Number(event.target.value) }) }, [2, 3, 4].map((n) => h('option', { key: n, value: String(n) }, String(n)))),
            ),
            h(Row, { title: t('opt.blind.title'), desc: t('opt.blind.desc') }, h(Switch, { checked: cfg.blindByDefault, label: t('opt.blind.title'), disabled: saving, onChange: (value) => save({ blindByDefault: value }) })),
            h(Row, { title: t('opt.redact.title'), desc: t('opt.redact.desc') }, h(Switch, { checked: cfg.redactNames, label: t('opt.redact.title'), disabled: saving, onChange: (value) => save({ redactNames: value }) })),
            h(Row, { title: t('opt.timeout.title'), desc: t('opt.timeout.desc') }, h(NumberField, { value: Math.round(cfg.timeoutMs / 1000), min: 1, max: 1800, label: t('opt.timeout.title'), disabled: saving, onCommit: (value) => save({ limits: { timeoutMs: value * 1000, maxTokens: cfg.maxTokens } }) })),
            h(Row, { title: t('opt.tokens.title'), desc: t('opt.tokens.desc') }, h(NumberField, { value: cfg.maxTokens, min: 0, max: 1000000, label: t('opt.tokens.title'), disabled: saving, onCommit: (value) => save({ limits: { timeoutMs: cfg.timeoutMs, maxTokens: value } }) })),
            h(Row, { title: t('opt.days.title'), desc: t('opt.days.desc') }, h(NumberField, { value: cfg.storeDays, min: 1, max: 3650, label: t('opt.days.title'), disabled: saving, onCommit: (value) => save({ storeDays: value }) })),
          ),
        ),
      );
    }

    function Columns({ t, round, busy, onPick }) {
      const names = new Map((round.names ?? []).map((item) => [item.label, item]));
      const winner = round.judge?.winner ?? null;
      const judgeLine = !round.judge
        ? null
        : round.judge.winner
          ? fill(t('judge.win'), { label: round.judge.winner, both: round.judge.rounds > 1 ? t('judge.both') : '' })
          : round.judge.consistent
            ? t('judge.tie')
            : t('judge.split');
      return h(
        React.Fragment,
        null,
        judgeLine ? h('p', { className: 'dsh-ar-note', role: 'status' }, judgeLine) : null,
        round.judge?.sameFamily ? h('p', { className: 'dsh-ar-note', 'data-warn': 'true' }, t('judge.family')) : null,
        h(
          'div',
          { className: 'dsh-ar-cols' },
          round.slots.map((slot) => {
            const name = names.get(slot.label);
            const score = round.judge?.average?.[slot.label];
            return h(
              'section',
              { key: slot.label, className: 'dsh-ar-col', 'data-win': String(winner === slot.label) },
              h(
                'header',
                null,
                h('b', null, fill(t('answer'), { label: slot.label })),
                round.revealed && name ? h('span', { className: 'n' }, name.candidateId + ' · ' + name.provider + '/' + name.model) : null,
                h('span', { className: 'dsh-ar-spacer' }),
                winner === slot.label ? h('span', { className: 'dsh-ar-chip', 'data-k': 'good' }, t('pick.judge')) : null,
                round.pick === slot.label ? h('span', { className: 'dsh-ar-chip', 'data-k': 'you' }, t('pick.yours')) : null,
              ),
              slot.error ? h('p', { className: 'dsh-ar-text', 'data-err': 'true' }, fill(t('no.answer'), { reason: slot.error })) : h('pre', { className: 'dsh-ar-text', tabIndex: 0 }, slot.text),
              h(
                'div',
                { className: 'dsh-ar-foot' },
                typeof score === 'number' ? h('span', null, fill(t('score'), { n: score })) : null,
                round.revealed && name && !slot.error ? h('span', null, fill(t('ms'), { n: name.latencyMs })) : null,
                round.revealed && name && !slot.error ? h('span', null, fill(t('tokens'), { a: name.input, b: name.output })) : null,
                h('span', { className: 'dsh-ar-spacer' }),
                // Picking is for a blind round: once the names are shown there is nothing left to guess.
                !slot.error && !round.revealed && round.pick !== slot.label
                  ? h('button', { type: 'button', className: 'dsh-ar-btn', disabled: busy, 'data-act': 'pick', 'data-label': slot.label, onClick: () => onPick(slot.label) }, t('act.pick'))
                  : null,
              ),
            );
          }),
        ),
        round.revealed
          ? round.judge?.winner && round.pick
            ? h('p', { className: 'dsh-ar-note' }, round.judge.winner === round.pick ? t('agree') : t('disagree'))
            : null
          : h('p', { className: 'dsh-ar-note' }, t('reveal.hint')),
      );
    }

    function ArenaPage({ appCtx }) {
      const t = appCtx.locale.bind('modelArena');
      const [settings, setSettings] = useState({ status: 'loading', config: null, revision: 0, error: '' });
      const [catalog, setCatalog] = useState(null);
      const [saveState, setSaveState] = useState({ saving: false, note: '', bad: false });
      const [list, setList] = useState({ status: 'loading', data: null });
      const [selected, setSelected] = useState('');
      const [detail, setDetail] = useState(null);
      const [prompt, setPrompt] = useState('');
      const [busy, setBusy] = useState('');
      const [actError, setActError] = useState('');
      const [confirmDelete, setConfirmDelete] = useState(false);
      const current = useRef('');

      useEffect(() => {
        let alive = true;
        (async () => {
          const found = await loadCatalog(appCtx);
          if (alive) setCatalog(found);
          try {
            const loaded = await loadSettings(appCtx);
            if (alive) setSettings({ status: 'ready', ...loaded, error: '' });
          } catch (error) {
            if (alive) setSettings({ status: 'error', config: null, revision: 0, error: String(error?.message ?? error) });
          }
        })();
        return () => { alive = false; };
      }, [appCtx]);

      const save = useCallback(async (fields) => {
        setSaveState({ saving: true, note: t('saving'), bad: false });
        try {
          const next = await saveSettings(appCtx, fields, settings.revision);
          setSettings({ status: 'ready', ...next, error: '' });
          setSaveState({ saving: false, note: t('saved'), bad: false });
        } catch (error) {
          setSaveState({ saving: false, note: fill(t('save.failed'), { reason: String(error?.message ?? error) }), bad: true });
        }
      }, [appCtx, settings.revision]);

      const loadList = useCallback(async () => {
        try {
          const data = await get('dsh-model-arena/rounds');
          setList({ status: 'ready', data });
          setSelected((prev) => {
            const all = [...data.running.map((item) => item.id), ...data.rounds.map((item) => item.id)];
            return prev && all.includes(prev) ? prev : all[0] ?? '';
          });
        } catch {
          setList((prev) => (prev.data ? prev : { status: 'error', data: null }));
        }
      }, []);

      const loadDetail = useCallback(async (id) => {
        if (!id) return;
        try {
          const data = await get('dsh-model-arena/round?id=' + encodeURIComponent(id));
          if (current.current === id) setDetail({ id, ...data });
        } catch {
          if (current.current === id) setDetail({ id, gone: true });
        }
      }, []);

      const anyRunning = !!list.data && list.data.running.length > 0;
      useEffect(() => {
        void loadList();
        const timer = setInterval(() => { if (!document.hidden) void loadList(); }, anyRunning ? POLL_FAST : POLL_SLOW);
        return () => clearInterval(timer);
      }, [loadList, anyRunning]);

      const selectedRunning = !!list.data && list.data.running.some((item) => item.id === selected);
      useEffect(() => {
        current.current = selected;
        setDetail((prev) => (prev && prev.id === selected ? prev : null));
        setConfirmDelete(false);
        setActError('');
        void loadDetail(selected);
        // A running round turns into a saved one; keep looking until it does.
        if (!selectedRunning) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void loadDetail(selected); }, POLL_FAST);
        return () => clearInterval(timer);
      }, [selected, selectedRunning, loadDetail]);

      /** Run one button's action, then show the round as it is now. */
      const run = async (kind, body) => {
        setBusy(kind);
        setActError('');
        try {
          const result = await act(body);
          if (kind === 'ask') {
            setPrompt('');
            if (result?.id) setSelected(result.id);
          }
          await loadList();
          if (kind !== 'ask' && kind !== 'delete') await loadDetail(body.id);
        } catch (error) {
          setActError(String(error?.message ?? error));
        }
        setBusy('');
      };

      const cfg = settings.config;
      const ready = !!cfg && cfg.candidates.length >= 2;
      const data = list.data;
      const rows = data
        ? [...data.running.map((item) => ({ id: item.id, prompt: item.prompt, createdAt: item.createdAt, running: true })), ...data.rounds.map((item) => ({ ...item, running: false }))]
        : [];
      const round = detail && detail.id === selected ? detail.round : null;

      // Ask and the rounds.
      const workArea = h(
        React.Fragment,
        null,
        // ---- ask
        h(
          'section',
          { className: 'dsh-ar-sec' },
          h('h3', { className: 'dsh-ar-group' }, t('ask.title')),
          h('textarea', {
            className: 'dsh-ar-field', value: prompt, placeholder: t('ask.placeholder'), 'aria-label': t('ask.title'), maxLength: 20000, disabled: busy === 'ask',
            onChange: (event) => setPrompt(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready && prompt.trim()) void run('ask', { action: 'ask', prompt }); },
          }),
          h(
            'div',
            { className: 'dsh-ar-askbar' },
            h('button', { type: 'button', className: 'dsh-ar-btn', 'data-main': 'true', 'data-act': 'ask', disabled: !ready || !prompt.trim() || busy !== '', onClick: () => void run('ask', { action: 'ask', prompt }) }, busy === 'ask' ? t('ask.busy') : t('ask.button')),
            !ready && cfg ? h('span', { className: 'dsh-ar-stamp', 'data-bad': 'false' }, t('ask.need')) : null,
            actError && !round ? h('span', { className: 'dsh-ar-stamp', 'data-bad': 'true', role: 'alert' }, actError) : null,
          ),
        ),

        // ---- rounds
        h(
          'section',
          { className: 'dsh-ar-sec' },
          h('div', { className: 'dsh-ar-sechead' }, h('h3', { className: 'dsh-ar-group' }, t('rounds.title')), h('span', { className: 'dsh-ar-spacer' }), h('button', { type: 'button', className: 'dsh-ar-btn', onClick: () => { void loadList(); void loadDetail(selected); } }, t('refresh'))),
          list.status === 'loading'
            ? h('p', { className: 'dsh-ar-note' }, t('loading'))
            : list.status === 'error'
              ? h('p', { className: 'dsh-ar-note', 'data-bad': 'true' }, t('failed'))
              : rows.length === 0
                ? h('p', { className: 'dsh-ar-note' }, t('rounds.empty'))
                : h(
                    'div',
                    { className: 'dsh-ar-card' },
                    h(
                      'div',
                      { className: 'dsh-ar-list' },
                      rows.map((row) =>
                        h(
                          'button',
                          { key: row.id, type: 'button', className: 'dsh-ar-item', 'aria-pressed': row.id === selected, onClick: () => setSelected(row.id) },
                          h('span', { className: 't' }, row.prompt),
                          row.running ? h('span', { className: 'dsh-ar-chip' }, t('chip.running')) : null,
                          !row.running && !row.revealed ? h('span', { className: 'dsh-ar-chip' }, t('chip.blind')) : null,
                          row.judged ? h('span', { className: 'dsh-ar-chip', 'data-k': 'you' }, t('chip.judged')) : null,
                          row.picked ? h('span', { className: 'dsh-ar-chip', 'data-k': 'you' }, t('chip.picked')) : null,
                          row.revealed ? h('span', { className: 'dsh-ar-chip', 'data-k': 'good' }, t('chip.revealed')) : null,
                          h('span', { className: 'd' }, new Date(row.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })),
                        ),
                      ),
                    ),
                  ),
          detail && detail.id === selected
            ? h(
                'div',
                { className: 'dsh-ar-card' },
                h('h3', { className: 'dsh-ar-group' }, t('prompt')),
                h('p', { className: 'dsh-ar-prompt' }, detail.round?.prompt ?? detail.running?.prompt ?? ''),
                detail.gone
                  ? h('p', { className: 'dsh-ar-note' }, t('gone'))
                  : detail.running
                    ? h('p', { className: 'dsh-ar-note', role: 'status' }, fill(t('running'), { done: detail.running.answered, total: detail.running.total }))
                    : h(
                        React.Fragment,
                        null,
                        h(Columns, { t, round, busy: busy !== '', onPick: (label) => void run('pick', { action: 'pick', id: round.id, label }) }),
                        h(
                          'div',
                          { className: 'dsh-ar-askbar' },
                          h(
                            'button',
                            {
                              type: 'button', className: 'dsh-ar-btn', 'data-act': 'judge', disabled: busy !== '' || !data?.judge || !data?.judgeService,
                              title: !data?.judge ? t('act.judge.none') : !data?.judgeService ? t('judge.noservice') : undefined,
                              onClick: () => void run('judge', { action: 'judge', id: round.id }),
                            },
                            busy === 'judge' ? t('act.judging') : t('act.judge'),
                          ),
                          round.revealed ? null : h('button', { type: 'button', className: 'dsh-ar-btn', 'data-main': 'true', 'data-act': 'reveal', disabled: busy !== '', onClick: () => void run('reveal', { action: 'reveal', id: round.id }) }, t('act.reveal')),
                          h('span', { className: 'dsh-ar-spacer' }),
                          confirmDelete
                            ? h(
                                React.Fragment,
                                null,
                                h('button', { type: 'button', className: 'dsh-ar-btn', 'data-danger': 'true', 'data-act': 'delete', disabled: busy !== '', onClick: () => void run('delete', { action: 'delete', id: round.id }) }, t('act.delete.sure')),
                                h('button', { type: 'button', className: 'dsh-ar-btn', onClick: () => setConfirmDelete(false) }, t('act.cancel')),
                              )
                            : h('button', { type: 'button', className: 'dsh-ar-btn', disabled: busy !== '', onClick: () => setConfirmDelete(true) }, t('act.delete')),
                        ),
                        !data?.judge ? h('p', { className: 'dsh-ar-note' }, t('act.judge.none')) : !data?.judgeService ? h('p', { className: 'dsh-ar-note', 'data-warn': 'true' }, t('judge.noservice')) : null,
                        actError ? h('p', { className: 'dsh-ar-note', 'data-bad': 'true', role: 'alert' }, actError) : null,
                      ),
              )
            : null,
        ),
      );
      // The setup form.
      const setupArea = h(
        'section',
        { className: 'dsh-ar-sec', style: { gap: 20 } },
        // ---- setup
        h(
          'div',
          { className: 'dsh-ar-sechead' },
          h('h2', { style: { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500 } }, t('setup.title')),
          h('span', { className: 'dsh-ar-spacer' }),
          saveState.note ? h('span', { className: 'dsh-ar-stamp', 'data-bad': String(saveState.bad), role: 'status' }, saveState.note) : null,
        ),
        settings.status === 'loading'
          ? h('p', { className: 'dsh-ar-note' }, t('loading'))
          : settings.status === 'error'
            ? h('p', { className: 'dsh-ar-note', 'data-bad': 'true' }, t('failed') + ' (' + settings.error + ')')
            : h(Setup, { t, cfg, catalog, save, saving: saveState.saving, judgeService: data?.judgeService !== false }),
      );

      return h(
        'div',
        { className: 'dsh-ar-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-ar-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),

        // Until two models are picked, Setup comes first: it is the only thing to do.
        ready ? workArea : setupArea,
        ready ? setupArea : workArea,
      );
    }

    /** Sidebar row icon: two columns side by side, drawn like the app's icons. */
    function ArenaIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 3.5, y: 5, width: 7, height: 14, rx: 2 }), h('rect', { x: 13.5, y: 5, width: 7, height: 14, rx: 2 }));
    }

    /** The same page as Settings > Arena, as a full page opened from the sidebar. */
    function ArenaPanel({ appCtx }) {
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '28px clamp(16px, 4vw, 48px) 40px' } },
        h('div', { style: { maxWidth: 1100, margin: '0 auto' } }, h(ArenaPage, { appCtx })));
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.session'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('modelArena', DICT));
        const t = ctx.locale.bind('modelArena');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'model-arena', order: 26, label: () => t('section.title') },
              (props) => h(ArenaPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
        // A full page with its own sidebar row (the Cowork sidebar lists it under the Chat tab).
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: 'model-arena' },
          () => h(ArenaPanel, { appCtx: ctx }),
        )));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'model-arena', order: 20, label: () => t('panel.title') },
          ArenaIcon,
        )));
      },
    };
  },
});
