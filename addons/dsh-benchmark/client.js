/**
 * Browser half of Benchmark: the "Benchmark" page in Settings.
 *
 * The page does three things:
 *  - Setup: the models to test, the settings to try on each, the suites of prompts with how each
 *    answer is graded, the judge, and the limits. It reads and writes the add-on's own settings
 *    through the app's settings channel, so a change applies at once.
 *  - Run: start a suite and cancel a running job, through the fenced `POST dsh-benchmark/action`
 *    route of the host half.
 *  - Results: the jobs and the report of the one you pick, from the fenced `GET dsh-benchmark/jobs`
 *    and `GET dsh-benchmark/report?job=` routes. Those carry scores, timings, token counts and cost;
 *    never prompts, answers or keys.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-benchmark',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    /** The add-on's settings namespace (its id in the bundle's cordis.patch.yml). */
    const NS = 'benchmark';
    const SEP = '\u0000';
    const SUITE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/;

    /** The ways an answer can be graded, each explained in one line. */
    const GRADERS = [
      { id: 'contains', label: 'Contains this text', hint: 'Passes when the answer contains the text, in any letter case.', field: 'expect', placeholder: 'Text the answer must contain' },
      { id: 'exact', label: 'Is exactly this text', hint: 'Passes only when the whole answer equals the text (spaces at the ends are ignored).', field: 'expect', placeholder: 'The exact answer' },
      { id: 'regex', label: 'Matches a pattern', hint: 'Passes when the answer matches a regular expression. For people who know them.', field: 'expect', placeholder: 'A regular expression, for example ^\\d+$' },
      { id: 'judge', label: 'The judge scores it', hint: 'The judge model reads the answer and scores it from 1 to 5 against your description of a good answer.', field: 'rubric', placeholder: 'Describe what a good answer looks like' },
    ];

    const EN = {
      'section.title': 'Benchmark',
      'head.hint': 'Test models on your own prompts and see which model and which settings score best. Each answer is graded the way you choose, several times over, and the results show score, speed and cost. A request that fails or times out is counted as an error and never scored as a wrong answer.',
      'guide.title': 'Your first run, in three steps',
      'guide.1': 'Pick the models to test.',
      'guide.2': 'Create a suite: a few prompts, and how to tell a good answer.',
      'guide.3': 'Press Run and read the results.',
      'guide.done': 'done',
      'run.title': 'Run',
      'run.suite': 'Suite to run',
      'run.button': 'Run',
      'run.starting': 'Starting…',
      'run.calls': '{n} model calls.',
      'run.need.models': 'Add at least one model in Setup first.',
      'run.need.suite': 'Create a suite in Setup first.',
      'run.problem': 'This suite cannot run yet: {problem}.',
      'run.cancel': 'Cancel',
      'jobs.title': 'Results',
      'jobs.empty': 'No runs yet.',
      'col.job': 'Run',
      'col.suite': 'Suite',
      'col.state': 'State',
      'col.progress': 'Progress',
      'col.errors': 'Errors',
      'col.started': 'Started',
      'state.running': 'running',
      'state.finished': 'finished',
      'state.cancelled': 'cancelled',
      'state.failed': 'failed',
      'refresh': 'Refresh',
      'report.title': 'Report for run {id}',
      'report.partial': 'Still running: these numbers are partial.',
      'report.errors': 'Why some answers were not scored',
      'report.none': 'No results in this run yet.',
      'r.category': 'Category',
      'r.target': 'Model',
      'r.temp': 'Temp',
      'r.max': 'Max tokens',
      'r.n': 'Answers',
      'r.seeds': 'Repeats',
      'r.score': 'Score',
      'r.spread': '± repeats',
      'r.latency': 'Speed ms',
      'r.errors': 'Errors',
      'r.cost': 'Cost USD',
      'r.pick': 'Recommended',
      'r.low': 'Low confidence',
      'picks.title': 'Recommended per category and model',
      'picks.none': 'Nothing recommended yet.',
      'picks.caveat': 'Caveats',
      'export.title': 'For the Sampling page',
      'export.hint': 'The confident recommendations as settings text. Nothing is applied: copy what you want into Settings → Sampling.',
      'export.copy': 'Copy',
      'export.copied': 'Copied',
      'export.failed': 'Select the text and copy it',
      'cost.total': 'Total cost',
      'failed': 'Could not read the benchmark. Is the Benchmark add-on switched on?',
      'loading': 'Loading benchmark…',
      'dash': '–',
      'setup.title': 'Setup',
      'saved': 'Saved',
      'saving': 'Saving…',
      'save.failed': 'Could not save: {reason}',
      'models.head': 'Models to test',
      'models.add': 'Add a model…',
      'models.none': 'No models in the app yet. Add one in Settings → Models first.',
      'models.empty': 'No models picked yet.',
      'models.remove': 'Remove',
      'models.missing': 'not available right now',
      'effort.label': 'Effort',
      'effort.default': 'Default',
      'grid.head': 'Settings to try on each model',
      'grid.temp.title': 'Temperatures',
      'grid.temp.desc': 'Numbers from 0 to 2, separated by commas, for example 0.2, 0.7. Empty uses each model’s default.',
      'grid.max.title': 'Max output tokens',
      'grid.max.desc': 'Whole numbers separated by commas, for example 1024, 4096. Empty uses each model’s default.',
      'grid.seeds.title': 'Repeats',
      'grid.seeds.desc': 'How many times each prompt is asked. More repeats give a steadier score. 3 is a good start.',
      'suites.head': 'Suites',
      'suites.new': 'New suite',
      'suites.example': 'Add an example suite',
      'suites.empty': 'No suites yet. A suite is a set of prompts with a way to grade each answer.',
      'suite.name': 'Name',
      'suite.category': 'Category',
      'suite.category.hint': 'A word for the kind of work, such as code or writing. Recommendations are made per category.',
      'suite.delete': 'Delete suite',
      'suite.delete.sure': 'Delete for good',
      'suite.keep': 'Keep',
      'suite.badname': 'Use letters, digits, spaces, dots, dashes or underscores, and a name no other suite has.',
      'prompt.n': 'Prompt {n}',
      'prompt.text': 'What to ask',
      'prompt.grade': 'How to grade the answer',
      'prompt.add': 'Add a prompt',
      'prompt.remove': 'Remove',
      'judge.head': 'Judge',
      'judge.title': 'Judge model',
      'judge.desc': 'Only needed for prompts graded by "The judge scores it".',
      'judge.noneopt': 'No judge',
      'limits.head': 'Limits',
      'limits.parallel.title': 'At the same time',
      'limits.parallel.desc': 'How many prompts are sent at once. Keep 1 for a model on your own computer.',
      'limits.timeout.title': 'Time limit per answer',
      'limits.timeout.desc': 'Seconds. A slower answer is counted as an error, not as wrong.',
      'limits.job.title': 'Longest run',
      'limits.job.desc': 'Minutes. A run stops when it reaches this.',
      'limits.spend.title': 'Spend limit per run',
      'limits.spend.desc': 'US dollars. 0 means no limit. It only counts models that have a price below.',
      'prices.head': 'Prices (optional)',
      'prices.desc': 'US dollars per million tokens, in and out. Leave at 0 for free or local models. Used for the cost column and the spend limit.',
      'prices.in': 'in',
      'prices.out': 'out',
    };
    const DICT = {
      en: EN,
      // Strings without a translation yet fall back to English.
      zh: {
        ...EN,
        'section.title': '基准测试',
        'col.suite': '测试集',
        'col.state': '状态',
        'col.progress': '进度',
        'col.errors': '错误',
        'col.started': '开始时间',
        'state.running': '运行中',
        'state.finished': '已完成',
        'state.cancelled': '已取消',
        'state.failed': '失败',
        'refresh': '刷新',
        'r.category': '类别',
        'r.temp': '温度',
        'r.max': '最大 token',
        'r.score': '得分',
        'r.errors': '错误',
        'r.cost': '费用 USD',
        'r.pick': '推荐',
        'r.low': '置信度低',
        'export.copy': '复制',
        'export.copied': '已复制',
        'cost.total': '总费用',
        'loading': '正在加载基准测试…',
      },
    };

    // Looks follow docs/UI-STYLE.md: colours only from the app's variables, sizes from its table.
    const FIELD_FILL = 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)';
    const CSS = `
.dsh-bm-page { display: flex; flex-direction: column; gap: 20px; padding: 2px 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-bm-head h2, .dsh-bm-h2 { margin: 0 0 4px; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-bm-head p { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-bm-group, .dsh-bm-card > h3 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-bm-sec { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-bm-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.dsh-bm-spacer { flex: 1; }
.dsh-bm-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-stamp[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bm-btn { height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.dsh-bm-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-bm-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-bm-btn:disabled { opacity: .5; cursor: default; }
.dsh-bm-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-bm-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-bm-card { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-bm-sub { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-bm-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bm-note[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-bm-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 22px; }
.dsh-bm-steps li { display: flex; align-items: center; gap: 10px; }
.dsh-bm-steps .n { flex: none; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; background: ${FIELD_FILL}; color: var(--dsw-alias-label-secondary); }
.dsh-bm-steps li[data-done="true"] .n { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent); color: var(--dsw-alias-state-success-primary); }
.dsh-bm-field { height: 36px; box-sizing: border-box; border: 0; border-radius: 12px; padding: 0 14px; background: ${FIELD_FILL}; color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; min-width: 0; }
.dsh-bm-field:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-bm-field:disabled { opacity: .5; }
.dsh-bm-field[data-bad="true"] { outline: 1px solid var(--dsw-alias-state-error-primary); }
select.dsh-bm-field { padding-right: 8px; cursor: pointer; }
textarea.dsh-bm-field { height: auto; min-height: 60px; padding: 8px 14px; line-height: 22px; resize: vertical; width: 100%; }
.dsh-bm-num { width: 110px; }
.dsh-bm-price { width: 84px; }
.dsh-bm-wide { width: 260px; }
.dsh-bm-full { width: 100%; }
.dsh-bm-rows { display: flex; flex-direction: column; }
.dsh-bm-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-bm-row:first-child { border-top: 0; padding-top: 4px; }
.dsh-bm-row:last-child { padding-bottom: 4px; }
.dsh-bm-rowtext { flex: 1; min-width: 0; }
.dsh-bm-rowtitle { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dsh-bm-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-bm-rowctl { display: flex; align-items: center; gap: 8px; flex: none; max-width: 60%; }
.dsh-bm-rowctl .dsh-bm-field { max-width: 100%; }
.dsh-bm-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.dsh-bm-lab { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-bm-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 12px; color: var(--dsw-alias-label-primary); background: ${FIELD_FILL}; }
.dsh-bm-scroll { overflow-x: auto; }
.dsh-bm-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.dsh-bm-table th { text-align: right; font-weight: 600; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 0 0 8px 10px; white-space: nowrap; }
.dsh-bm-table th button { all: unset; cursor: pointer; }
.dsh-bm-table th button:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-bm-table td { text-align: right; padding: 8px 0 8px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dsh-bm-table th.l, .dsh-bm-table td.l { text-align: left; padding-left: 0; padding-right: 14px; }
.dsh-bm-table tr[data-sel="true"] td { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-bm-table tr[data-click="true"] { cursor: pointer; }
.dsh-bm-table tr[data-click="true"]:hover td { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-bm-table tr[data-click="true"]:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dsh-bm-state { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); background: ${FIELD_FILL}; }
.dsh-bm-state[data-s="running"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-bm-state[data-s="finished"] { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.dsh-bm-state[data-s="failed"] { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dsh-bm-prog { display: inline-block; vertical-align: middle; width: 56px; height: 4px; margin-right: 6px; border-radius: 2px; background: var(--dsw-alias-border-l2); overflow: hidden; }
.dsh-bm-prog i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); }
.dsh-bm-score { display: inline-block; vertical-align: middle; width: 40px; height: 4px; margin-right: 6px; border-radius: 2px; background: var(--dsw-alias-border-l2); overflow: hidden; }
.dsh-bm-score i { display: block; height: 100%; background: var(--dsw-alias-brand-primary); }
.dsh-bm-pick { margin-left: 6px; display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 11px; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.dsh-bm-pick[data-low="true"] { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); }
.dsh-bm-list { margin: 0; padding-left: 18px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-pre { margin: 0; padding: 10px 14px; max-height: 260px; overflow: auto; border-radius: 12px; background: ${FIELD_FILL}; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); white-space: pre; }
@media (max-width: 620px) {
  .dsh-bm-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .dsh-bm-rowctl { max-width: 100%; flex-wrap: wrap; }
  .dsh-bm-wide { width: 100%; }
}
`;

    const REFRESH_FAST = 2000;
    const REFRESH_SLOW = 15000;

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };
    /** Send one action to the host half; throws the plain reason when it is refused. */
    const act = async (body) => {
      const response = await fetch(new URL('dsh-benchmark/action', document.baseURI), {
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
    const num = (value, digits) => (value === null || value === undefined ? null : Number(value).toFixed(digits));

    /** The add-on's settings as the page uses them. Suites keep whatever is stored, so nothing is lost on save. */
    function normalize(value) {
      const source = value ?? {};
      const seen = new Set();
      const targets = [];
      for (const item of Array.isArray(source.targets) ? source.targets : []) {
        const id = String(item?.id ?? '').trim();
        if (!id || seen.has(id) || !item.provider || !item.model) continue;
        seen.add(id);
        targets.push({ id, provider: String(item.provider), model: String(item.model), reasoningEffort: String(item.reasoningEffort ?? '') });
      }
      const suites = {};
      for (const [name, suite] of Object.entries(source.suites && typeof source.suites === 'object' ? source.suites : {})) {
        suites[name] = {
          category: String(suite?.category ?? 'general'),
          prompts: (Array.isArray(suite?.prompts) ? suite.prompts : []).map((prompt, index) => ({
            id: String(prompt?.id ?? `p${index + 1}`),
            prompt: String(prompt?.prompt ?? ''),
            ...(prompt?.system ? { system: String(prompt.system) } : {}),
            grader: {
              type: GRADERS.some((grader) => grader.id === prompt?.grader?.type) ? prompt.grader.type : 'contains',
              expect: String(prompt?.grader?.expect ?? ''),
              rubric: String(prompt?.grader?.rubric ?? ''),
            },
          })),
        };
      }
      const list = (items) => (Array.isArray(items) ? items.map(Number).filter((n) => Number.isFinite(n)) : []);
      const limits = source.limits ?? {};
      const pricing = {};
      for (const [key, price] of Object.entries(source.pricing && typeof source.pricing === 'object' ? source.pricing : {})) {
        pricing[key] = { inputPerMTok: Math.max(0, Number(price?.inputPerMTok) || 0), outputPerMTok: Math.max(0, Number(price?.outputPerMTok) || 0) };
      }
      return {
        targets,
        suites,
        grid: { temperature: list(source.grid?.temperature), maxTokens: list(source.grid?.maxTokens), seeds: Math.min(50, Math.max(1, Math.round(Number(source.grid?.seeds) || 3))) },
        judge: source.judge?.provider && source.judge?.model ? { provider: String(source.judge.provider), model: String(source.judge.model) } : null,
        pricing,
        limits: {
          maxParallel: Math.min(16, Math.max(1, Math.round(Number(limits.maxParallel) || 1))),
          timeoutMs: Number(limits.timeoutMs) || 120000,
          maxJobMinutes: Number(limits.maxJobMinutes) || 60,
          maxCloudUsdPerJob: Math.max(0, Number(limits.maxCloudUsdPerJob) || 0),
        },
      };
    }

    /** A suite as it is stored: only the grader fields its type uses. */
    function suiteForStorage(suite) {
      return {
        category: suite.category.trim() || 'general',
        prompts: suite.prompts.map((prompt) => ({
          id: prompt.id,
          prompt: prompt.prompt,
          ...(prompt.system ? { system: prompt.system } : {}),
          // Both texts are kept, so switching the way of grading and back loses nothing.
          grader: { type: prompt.grader.type, ...(prompt.grader.expect ? { expect: prompt.grader.expect } : {}), ...(prompt.grader.rubric ? { rubric: prompt.grader.rubric } : {}) },
        })),
      };
    }

    async function loadSettings(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('the Benchmark add-on is switched off');
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

    /** A short, unique name for a model under test, made from its model id. */
    function targetId(model, taken) {
      const base = String(model).split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'model';
      let id = base;
      for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
      return id;
    }

    /** One settings row: text on the left, the control on the right. */
    function Row({ title, desc, children }) {
      return h('div', { className: 'dsh-bm-row' }, h('div', { className: 'dsh-bm-rowtext' }, h('div', { className: 'dsh-bm-rowtitle' }, title), desc ? h('div', { className: 'dsh-bm-rowdesc' }, desc) : null), h('div', { className: 'dsh-bm-rowctl' }, children));
    }

    /** A model list grouped by provider. `value` and `onChange` use `provider\0model`. */
    function ModelSelect({ catalog, value, onChange, first, label, exclude, className, disabled }) {
      const groups = (catalog?.groups ?? [])
        .map((group) => ({ ...group, models: group.models.filter((model) => !exclude?.has(group.id + SEP + model.id)) }))
        .filter((group) => group.models.length > 0);
      const known = !value || (catalog?.groups ?? []).some((group) => group.models.some((model) => group.id + SEP + model.id === value));
      return h(
        'select',
        { className: 'dsh-bm-field ' + (className ?? ''), value: value ?? '', 'aria-label': label, disabled, onChange: (event) => onChange(event.target.value) },
        h('option', { value: '' }, first),
        known ? null : h('option', { value }, value.split(SEP).join(' / ')),
        groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((model) => h('option', { key: model.id, value: group.id + SEP + model.id }, model.name)))),
      );
    }

    /** A text box (or text area) that saves when you leave it, or on Enter for one line. */
    function TextField({ value, onCommit, multiline, className, label, placeholder, disabled, bad, rows }) {
      const [text, setText] = useState(value);
      useEffect(() => setText(value), [value]);
      const props = {
        className: 'dsh-bm-field ' + (className ?? ''), value: text, placeholder, disabled, 'aria-label': label, 'data-bad': String(Boolean(bad)),
        onChange: (event) => setText(event.target.value),
        onBlur: () => { if (text !== value) onCommit(text, () => setText(value)); },
      };
      if (multiline) return h('textarea', { ...props, rows: rows ?? 2 });
      return h('input', { ...props, type: 'text', onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } } });
    }

    /** A number box that saves when you leave it or press Enter. */
    function NumberField({ value, min, max, step, label, onCommit, disabled, className }) {
      const [text, setText] = useState(String(value));
      useEffect(() => setText(String(value)), [value]);
      const commit = () => {
        const number = Number(text);
        if (!Number.isFinite(number) || text.trim() === '') return setText(String(value));
        const next = Math.min(max, Math.max(min, step === 1 ? Math.round(number) : number));
        setText(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', {
        className: 'dsh-bm-field ' + (className ?? 'dsh-bm-num'), type: 'number', min, max, step: step ?? 1, value: text, 'aria-label': label, disabled,
        onChange: (event) => setText(event.target.value), onBlur: commit,
        onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); } },
      });
    }

    /** Turn "0.2, 0.7" into numbers within a range; anything else is dropped. */
    function parseNumbers(text, min, max, whole) {
      const out = [];
      for (const part of String(text).split(/[,\s]+/)) {
        if (!part) continue;
        const number = whole ? Math.round(Number(part)) : Number(part);
        if (Number.isFinite(number) && number >= min && number <= max && !out.includes(number)) out.push(number);
      }
      return out;
    }

    function JobsTable({ t, jobs, selected, onSelect }) {
      const stateLabel = (state) => {
        const base = String(state).split(':')[0];
        const known = ['running', 'finished', 'cancelled', 'failed'].includes(base) ? t('state.' + base) : String(state);
        return { key: base, text: known + (String(state).includes(':') ? String(state).slice(String(state).indexOf(':')) : '') };
      };
      return h(
        'div',
        { className: 'dsh-bm-scroll' },
        h(
          'table',
          { className: 'dsh-bm-table' },
          h('thead', null, h('tr', null, ['col.job', 'col.suite', 'col.state', 'col.progress', 'col.errors', 'col.started'].map((key, i) => h('th', { key, scope: 'col', className: i < 2 ? 'l' : '' }, t(key))))),
          h(
            'tbody',
            null,
            jobs.map((job) => {
              const s = stateLabel(job.state);
              const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 100;
              return h(
                'tr',
                {
                  key: job.id,
                  'data-click': 'true',
                  'data-sel': String(job.id === selected),
                  tabIndex: 0,
                  'aria-selected': job.id === selected,
                  onClick: () => onSelect(job.id),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(job.id);
                    }
                  },
                },
                h('td', { className: 'l' }, job.id),
                h('td', { className: 'l' }, job.suite),
                h('td', null, h('span', { className: 'dsh-bm-state', 'data-s': s.key }, s.text)),
                h('td', null, h('span', { className: 'dsh-bm-prog' }, h('i', { style: { width: pct + '%' } })), job.done + '/' + job.total),
                h('td', null, job.errors),
                h('td', null, job.startedAt ? new Date(job.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : t('dash')),
              );
            }),
          ),
        ),
      );
    }

    function ReportView({ t, data }) {
      const [sort, setSort] = useState({ key: 'default', dir: 1 });
      const [copied, setCopied] = useState('');
      const pre = useRef(null);
      const pickKey = (row) => [row.category, row.target, row.temperature, row.maxTokens].join('\u0000');
      const picks = useMemo(() => new Map(data.picks.map((pick) => [pickKey(pick), pick])), [data]);

      const rows = useMemo(() => {
        const list = [...data.cells];
        const byDefault = (a, b) => String(a.category).localeCompare(String(b.category)) || String(a.target).localeCompare(String(b.target)) || b.meanScore - a.meanScore;
        if (sort.key === 'default') return list.sort(byDefault);
        return list.sort((a, b) => ((Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0)) * sort.dir || byDefault(a, b));
      }, [data, sort]);
      const total = data.cells.reduce((sum, cell) => sum + cell.costUsd, 0);

      const header = (key, label, left, sortKey) =>
        h(
          'th',
          { key, scope: 'col', className: left ? 'l' : '', 'aria-sort': sort.key === sortKey ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined },
          sortKey
            ? h('button', { type: 'button', onClick: () => setSort((prev) => ({ key: sortKey, dir: prev.key === sortKey ? -prev.dir : sortKey === 'meanScore' ? -1 : 1 })) }, label + (sort.key === sortKey ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''))
            : label,
        );

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(data.exportYaml);
          setCopied(t('export.copied'));
        } catch {
          const node = pre.current;
          if (node) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
          setCopied(t('export.failed'));
        }
        setTimeout(() => setCopied(''), 2500);
      };

      const running = String(data.job.state) === 'running';
      return h(
        'section',
        { className: 'dsh-bm-card' },
        h('h3', null, t('report.title').replace('{id}', data.job.id)),
        running ? h('p', { className: 'dsh-bm-note' }, t('report.partial')) : null,
        data.job.errorSamples.length > 0
          ? h('div', null, h('p', { className: 'dsh-bm-note' }, t('report.errors')), h('ul', { className: 'dsh-bm-list' }, data.job.errorSamples.map((text) => h('li', { key: text }, text))))
          : null,
        rows.length === 0
          ? h('p', { className: 'dsh-bm-note' }, t('report.none'))
          : h(
              'div',
              { className: 'dsh-bm-scroll' },
              h(
                'table',
                { className: 'dsh-bm-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    header('c', t('r.category'), true),
                    header('t', t('r.target'), true),
                    header('tp', t('r.temp'), false, 'temperature'),
                    header('mx', t('r.max'), false, 'maxTokens'),
                    header('n', t('r.n'), false),
                    header('s', t('r.seeds'), false),
                    header('sc', t('r.score'), false, 'meanScore'),
                    header('sp', t('r.spread'), false, 'seedStdev'),
                    header('l', t('r.latency'), false, 'meanLatencyMs'),
                    header('e', t('r.errors'), false, 'errors'),
                    header('co', t('r.cost'), false, 'costUsd'),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  rows.map((row) => {
                    const pick = picks.get(pickKey(row));
                    return h(
                      'tr',
                      { key: pickKey(row) },
                      h('td', { className: 'l' }, row.category),
                      h('td', { className: 'l' }, row.target, pick ? h('span', { className: 'dsh-bm-pick', 'data-low': String(pick.confidence !== 'ok'), title: pick.caveats.join('; ') }, pick.confidence === 'ok' ? t('r.pick') : t('r.low')) : null),
                      h('td', null, num(row.temperature, 2) ?? t('dash')),
                      h('td', null, row.maxTokens ?? t('dash')),
                      h('td', null, row.n),
                      h('td', null, row.seeds),
                      // A cell with no scored run (every request failed) shows dashes, never a 0 score.
                      h('td', null, row.n === 0 ? t('dash') : [h('span', { key: 'bar', className: 'dsh-bm-score' }, h('i', { style: { width: Math.round(row.meanScore * 100) + '%' } })), num(row.meanScore, 3)]),
                      h('td', null, row.n === 0 ? t('dash') : num(row.seedStdev, 3)),
                      h('td', null, row.n === 0 ? t('dash') : row.meanLatencyMs),
                      h('td', null, row.errors),
                      h('td', null, num(row.costUsd, 4)),
                    );
                  }),
                ),
              ),
            ),
        total > 0 ? h('p', { className: 'dsh-bm-note' }, t('cost.total') + ': ' + total.toFixed(4) + ' USD') : null,
        h('h3', null, t('picks.title')),
        data.picks.length === 0
          ? h('p', { className: 'dsh-bm-note' }, t('picks.none'))
          : h(
              'ul',
              { className: 'dsh-bm-list' },
              data.picks.map((pick) =>
                h(
                  'li',
                  { key: pickKey(pick) },
                  pick.category + ' / ' + pick.target + ': ' + t('r.temp').toLowerCase() + ' ' + (num(pick.temperature, 2) ?? t('dash')) + ', ' + t('r.max').toLowerCase() + ' ' + (pick.maxTokens ?? t('dash')) + ' (' + t('r.score').toLowerCase() + ' ' + num(pick.meanScore, 3) + ', ' + pick.meanLatencyMs + ' ms)' + (pick.confidence === 'ok' ? '' : ' [' + t('picks.caveat') + ': ' + pick.caveats.join('; ') + ']'),
                ),
              ),
            ),
        h('h3', null, t('export.title')),
        h('p', { className: 'dsh-bm-note' }, t('export.hint')),
        h('pre', { className: 'dsh-bm-pre', ref: pre, tabIndex: 0 }, data.exportYaml),
        h('div', { className: 'dsh-bm-bar' }, h('button', { type: 'button', className: 'dsh-bm-btn', onClick: () => void copy() }, t('export.copy')), copied ? h('span', { className: 'dsh-bm-stamp', role: 'status' }, copied) : null),
      );
    }

    /** One suite: its name, category and prompts, each with the way its answer is graded. */
    function SuiteCard({ t, name, suite, names, saving, onRename, onChange, onDelete }) {
      const [confirm, setConfirm] = useState(false);
      const [badName, setBadName] = useState(false);
      const setPrompt = (index, patch) => onChange({ ...suite, prompts: suite.prompts.map((prompt, at) => (at === index ? { ...prompt, ...patch } : prompt)) });
      const addPrompt = () => {
        let n = suite.prompts.length + 1;
        while (suite.prompts.some((prompt) => prompt.id === `p${n}`)) n += 1;
        onChange({ ...suite, prompts: [...suite.prompts, { id: `p${n}`, prompt: '', grader: { type: 'contains', expect: '', rubric: '' } }] });
      };
      return h(
        'div',
        { className: 'dsh-bm-card', 'data-suite': name },
        h(
          'div',
          { className: 'dsh-bm-grid2' },
          h(
            'label',
            { className: 'dsh-bm-lab' },
            t('suite.name'),
            h(TextField, {
              value: name, label: t('suite.name'), disabled: saving, bad: badName,
              onCommit: (text, reset) => {
                const next = text.trim();
                if (!SUITE_NAME.test(next) || (next !== name && names.includes(next))) {
                  setBadName(true);
                  reset();
                  return;
                }
                setBadName(false);
                onRename(next);
              },
            }),
          ),
          h('label', { className: 'dsh-bm-lab' }, t('suite.category'), h(TextField, { value: suite.category, label: t('suite.category'), disabled: saving, onCommit: (text) => onChange({ ...suite, category: text.trim() || 'general' }) })),
        ),
        badName ? h('p', { className: 'dsh-bm-note', 'data-bad': 'true', role: 'alert' }, t('suite.badname')) : h('p', { className: 'dsh-bm-note' }, t('suite.category.hint')),
        suite.prompts.map((prompt, index) => {
          const grader = GRADERS.find((item) => item.id === prompt.grader.type) ?? GRADERS[0];
          return h(
            'div',
            { key: prompt.id, className: 'dsh-bm-sub', 'data-prompt': prompt.id },
            h('div', { className: 'dsh-bm-bar' }, h('span', { className: 'dsh-bm-group' }, fill(t('prompt.n'), { n: index + 1 })), h('span', { className: 'dsh-bm-spacer' }), h('button', { type: 'button', className: 'dsh-bm-btn', disabled: saving, onClick: () => onChange({ ...suite, prompts: suite.prompts.filter((_, at) => at !== index) }) }, t('prompt.remove'))),
            h('label', { className: 'dsh-bm-lab' }, t('prompt.text'), h(TextField, { multiline: true, value: prompt.prompt, label: t('prompt.text'), disabled: saving, onCommit: (text) => setPrompt(index, { prompt: text }) })),
            h(
              'div',
              { className: 'dsh-bm-grid2' },
              h(
                'label',
                { className: 'dsh-bm-lab' },
                t('prompt.grade'),
                h(
                  'select',
                  { className: 'dsh-bm-field', value: grader.id, disabled: saving, 'aria-label': t('prompt.grade'), onChange: (event) => setPrompt(index, { grader: { ...prompt.grader, type: event.target.value } }) },
                  GRADERS.map((item) => h('option', { key: item.id, value: item.id }, item.label)),
                ),
              ),
              h(
                'label',
                { className: 'dsh-bm-lab' },
                grader.placeholder,
                h(TextField, {
                  multiline: grader.id === 'judge', rows: 2, value: prompt.grader[grader.field], label: grader.placeholder, disabled: saving,
                  onCommit: (text) => setPrompt(index, { grader: { ...prompt.grader, [grader.field]: text } }),
                }),
              ),
            ),
            h('p', { className: 'dsh-bm-note' }, grader.hint),
          );
        }),
        h(
          'div',
          { className: 'dsh-bm-bar' },
          h('button', { type: 'button', className: 'dsh-bm-btn', 'data-act': 'add-prompt', disabled: saving, onClick: addPrompt }, t('prompt.add')),
          h('span', { className: 'dsh-bm-spacer' }),
          confirm
            ? h(React.Fragment, null, h('button', { type: 'button', className: 'dsh-bm-btn', 'data-danger': 'true', disabled: saving, onClick: onDelete }, t('suite.delete.sure')), h('button', { type: 'button', className: 'dsh-bm-btn', onClick: () => setConfirm(false) }, t('suite.keep')))
            : h('button', { type: 'button', className: 'dsh-bm-btn', disabled: saving, onClick: () => setConfirm(true) }, t('suite.delete')),
        ),
      );
    }

    function Setup({ t, cfg, catalog, save, saving }) {
      const taken = new Set(cfg.targets.map((item) => item.provider + SEP + item.model));
      const storedTargets = (list) => list.map(({ id, provider, model, reasoningEffort }) => ({ id, provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }));
      const addTarget = (value) => {
        const [provider, model] = value.split(SEP);
        if (!provider || !model) return;
        save({ targets: storedTargets([...cfg.targets, { id: targetId(model, new Set(cfg.targets.map((item) => item.id))), provider, model, reasoningEffort: '' }]) });
      };
      const hasModels = (catalog?.groups ?? []).some((group) => group.models.length > 0);
      const suiteNames = Object.keys(cfg.suites);
      const saveSuites = (entries) => save({ suites: Object.fromEntries(entries.map(([name, suite]) => [name, suiteForStorage(suite)])) });
      const entries = Object.entries(cfg.suites);
      const freeName = (base) => {
        let name = base;
        for (let n = 2; suiteNames.includes(name); n += 1) name = `${base} ${n}`;
        return name;
      };
      const price = (target) => cfg.pricing[`${target.provider}/${target.model}`] ?? { inputPerMTok: 0, outputPerMTok: 0 };
      const savePrice = (target, patch) => {
        const key = `${target.provider}/${target.model}`;
        const next = { ...cfg.pricing, [key]: { ...price(target), ...patch } };
        if (next[key].inputPerMTok === 0 && next[key].outputPerMTok === 0) delete next[key];
        save({ pricing: next });
      };

      return h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('h3', { className: 'dsh-bm-group' }, t('models.head')),
          h(
            'div',
            { className: 'dsh-bm-card' },
            cfg.targets.length === 0 ? h('p', { className: 'dsh-bm-note', 'data-warn': 'true' }, t('models.empty')) : null,
            cfg.targets.length > 0
              ? h(
                  'div',
                  { className: 'dsh-bm-rows' },
                  cfg.targets.map((item) => {
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
                              className: 'dsh-bm-field', value: item.reasoningEffort, disabled: saving, 'aria-label': t('effort.label') + ': ' + (model?.name ?? item.model),
                              onChange: (event) => save({ targets: storedTargets(cfg.targets.map((other) => (other.id === item.id ? { ...other, reasoningEffort: event.target.value } : other))) }),
                            },
                            h('option', { value: '' }, t('effort.label') + ': ' + t('effort.default')),
                            efforts.map((effort) => h('option', { key: effort, value: effort }, t('effort.label') + ': ' + effort)),
                          )
                        : null,
                      h('button', { type: 'button', className: 'dsh-bm-btn', disabled: saving, onClick: () => save({ targets: storedTargets(cfg.targets.filter((other) => other.id !== item.id)) }) }, t('models.remove')),
                    );
                  }),
                )
              : null,
            hasModels
              ? h(ModelSelect, { catalog, value: '', onChange: addTarget, first: t('models.add'), label: t('models.add'), exclude: taken, className: 'dsh-bm-wide', disabled: saving })
              : h('p', { className: 'dsh-bm-note' }, t('models.none')),
          ),
        ),
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('div', { className: 'dsh-bm-bar' }, h('h3', { className: 'dsh-bm-group' }, t('suites.head')), h('span', { className: 'dsh-bm-spacer' }),
            h('button', {
              type: 'button', className: 'dsh-bm-btn', 'data-act': 'example-suite', disabled: saving,
              onClick: () => saveSuites([...entries, [freeName('example'), {
                category: 'general',
                prompts: [
                  { id: 'capital', prompt: 'What is the capital of France? Answer with one word.', grader: { type: 'contains', expect: 'Paris', rubric: '' } },
                  { id: 'sum', prompt: 'What is 17 + 25? Answer with the number only.', grader: { type: 'contains', expect: '42', rubric: '' } },
                ],
              }]]),
            }, t('suites.example')),
            h('button', {
              type: 'button', className: 'dsh-bm-btn', 'data-main': 'true', 'data-act': 'new-suite', disabled: saving,
              onClick: () => saveSuites([...entries, [freeName('suite'), { category: 'general', prompts: [] }]]),
            }, t('suites.new'))),
          entries.length === 0 ? h('p', { className: 'dsh-bm-note' }, t('suites.empty')) : null,
          entries.map(([name, suite]) =>
            h(SuiteCard, {
              key: name, t, name, suite, names: suiteNames, saving,
              onRename: (next) => { if (next !== name) saveSuites(entries.map(([other, value]) => [other === name ? next : other, value])); },
              onChange: (next) => saveSuites(entries.map(([other, value]) => [other, other === name ? next : value])),
              onDelete: () => saveSuites(entries.filter(([other]) => other !== name)),
            }),
          ),
        ),
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('h3', { className: 'dsh-bm-group' }, t('grid.head')),
          h(
            'div',
            { className: 'dsh-bm-rows' },
            h(Row, { title: t('grid.temp.title'), desc: t('grid.temp.desc') }, h(TextField, {
              className: 'dsh-bm-wide', value: cfg.grid.temperature.join(', '), label: t('grid.temp.title'), placeholder: '0.2, 0.7', disabled: saving,
              onCommit: (text, reset) => { const next = parseNumbers(text, 0, 2, false); if (next.join() === cfg.grid.temperature.join()) reset(); else save({ grid: { ...cfg.grid, temperature: next } }); },
            })),
            h(Row, { title: t('grid.max.title'), desc: t('grid.max.desc') }, h(TextField, {
              className: 'dsh-bm-wide', value: cfg.grid.maxTokens.join(', '), label: t('grid.max.title'), placeholder: '1024, 4096', disabled: saving,
              onCommit: (text, reset) => { const next = parseNumbers(text, 1, 1000000, true); if (next.join() === cfg.grid.maxTokens.join()) reset(); else save({ grid: { ...cfg.grid, maxTokens: next } }); },
            })),
            h(Row, { title: t('grid.seeds.title'), desc: t('grid.seeds.desc') }, h(NumberField, { value: cfg.grid.seeds, min: 1, max: 50, step: 1, label: t('grid.seeds.title'), disabled: saving, onCommit: (value) => save({ grid: { ...cfg.grid, seeds: value } }) })),
          ),
        ),
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('h3', { className: 'dsh-bm-group' }, t('judge.head')),
          h(
            'div',
            { className: 'dsh-bm-rows' },
            h(Row, { title: t('judge.title'), desc: t('judge.desc') }, h(ModelSelect, {
              catalog, value: cfg.judge ? cfg.judge.provider + SEP + cfg.judge.model : '', first: t('judge.noneopt'), label: t('judge.title'), className: 'dsh-bm-wide', disabled: saving,
              onChange: (value) => { const [provider, model] = value.split(SEP); save({ judge: provider && model ? { provider, model } : {} }); },
            })),
          ),
        ),
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('h3', { className: 'dsh-bm-group' }, t('limits.head')),
          h(
            'div',
            { className: 'dsh-bm-rows' },
            h(Row, { title: t('limits.parallel.title'), desc: t('limits.parallel.desc') }, h(NumberField, { value: cfg.limits.maxParallel, min: 1, max: 16, step: 1, label: t('limits.parallel.title'), disabled: saving, onCommit: (value) => save({ limits: { ...cfg.limits, maxParallel: value } }) })),
            h(Row, { title: t('limits.timeout.title'), desc: t('limits.timeout.desc') }, h(NumberField, { value: Math.round(cfg.limits.timeoutMs / 1000), min: 1, max: 1800, step: 1, label: t('limits.timeout.title'), disabled: saving, onCommit: (value) => save({ limits: { ...cfg.limits, timeoutMs: value * 1000 } }) })),
            h(Row, { title: t('limits.job.title'), desc: t('limits.job.desc') }, h(NumberField, { value: cfg.limits.maxJobMinutes, min: 1, max: 1440, step: 1, label: t('limits.job.title'), disabled: saving, onCommit: (value) => save({ limits: { ...cfg.limits, maxJobMinutes: value } }) })),
            h(Row, { title: t('limits.spend.title'), desc: t('limits.spend.desc') }, h(NumberField, { value: cfg.limits.maxCloudUsdPerJob, min: 0, max: 100000, step: 0.01, label: t('limits.spend.title'), disabled: saving, onCommit: (value) => save({ limits: { ...cfg.limits, maxCloudUsdPerJob: value } }) })),
          ),
        ),
        cfg.targets.length > 0
          ? h(
              'section',
              { className: 'dsh-bm-sec' },
              h('h3', { className: 'dsh-bm-group' }, t('prices.head')),
              h('p', { className: 'dsh-bm-note' }, t('prices.desc')),
              h(
                'div',
                { className: 'dsh-bm-rows' },
                cfg.targets.map((item) =>
                  h(
                    Row,
                    { key: item.id, title: findModel(catalog, item.provider, item.model)?.name ?? item.model, desc: providerName(catalog, item.provider) },
                    h('span', { className: 'dsh-bm-stamp' }, t('prices.in')),
                    h(NumberField, { className: 'dsh-bm-price', value: price(item).inputPerMTok, min: 0, max: 100000, step: 0.01, label: t('prices.in') + ' ' + item.model, disabled: saving, onCommit: (value) => savePrice(item, { inputPerMTok: value }) }),
                    h('span', { className: 'dsh-bm-stamp' }, t('prices.out')),
                    h(NumberField, { className: 'dsh-bm-price', value: price(item).outputPerMTok, min: 0, max: 100000, step: 0.01, label: t('prices.out') + ' ' + item.model, disabled: saving, onCommit: (value) => savePrice(item, { outputPerMTok: value }) }),
                  ),
                ),
              ),
            )
          : null,
      );
    }

    function BenchmarkPage({ appCtx }) {
      const t = appCtx.locale.bind('benchmark');
      const [settings, setSettings] = useState({ status: 'loading', config: null, revision: 0, error: '' });
      const [catalog, setCatalog] = useState(null);
      const [saveState, setSaveState] = useState({ saving: false, note: '', bad: false });
      const [list, setList] = useState({ status: 'loading', data: null });
      const [selected, setSelected] = useState('');
      const [report, setReport] = useState(null);
      const [suite, setSuite] = useState('');
      const [busy, setBusy] = useState('');
      const [actError, setActError] = useState('');
      const current = useRef('');

      const loadList = useCallback(async () => {
        try {
          const data = await get('dsh-benchmark/jobs');
          setList({ status: 'ready', data });
          setSelected((prev) => (prev && data.jobs.some((job) => job.id === prev) ? prev : data.jobs[0]?.id ?? ''));
          setSuite((prev) => (prev && data.suites.some((item) => item.name === prev) ? prev : data.suites.find((item) => !item.problem)?.name ?? data.suites[0]?.name ?? ''));
        } catch {
          setList((prev) => (prev.data ? prev : { status: 'error', data: null }));
        }
      }, []);

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
          void loadList();
        } catch (error) {
          setSaveState({ saving: false, note: fill(t('save.failed'), { reason: String(error?.message ?? error) }), bad: true });
        }
      }, [appCtx, settings.revision, loadList]);

      const loadReport = useCallback(async (id) => {
        if (!id) {
          setReport(null);
          return;
        }
        try {
          const data = await get('dsh-benchmark/report?job=' + encodeURIComponent(id));
          if (current.current === id) setReport(data);
        } catch {
          setReport(null);
        }
      }, []);

      const anyRunning = !!list.data && list.data.jobs.some((job) => String(job.state) === 'running');
      useEffect(() => {
        void loadList();
        const timer = setInterval(() => { if (!document.hidden) void loadList(); }, anyRunning ? REFRESH_FAST : REFRESH_SLOW);
        return () => clearInterval(timer);
      }, [loadList, anyRunning]);

      const selectedJob = list.data?.jobs.find((job) => job.id === selected);
      const selectedRunning = String(selectedJob?.state) === 'running';
      useEffect(() => {
        current.current = selected;
        setReport((prev) => (prev && prev.job.id === selected ? prev : null));
        void loadReport(selected);
        if (!selectedRunning) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void loadReport(selected); }, REFRESH_FAST);
        return () => clearInterval(timer);
      }, [selected, selectedRunning, loadReport, selectedJob?.state]);

      const run = async (kind, body) => {
        setBusy(kind);
        setActError('');
        try {
          const result = await act(body);
          if (kind === 'run' && result?.id) setSelected(result.id);
          await loadList();
        } catch (error) {
          setActError(String(error?.message ?? error));
        }
        setBusy('');
      };

      const cfg = settings.config;
      const data = list.data;
      const suiteInfo = data?.suites.find((item) => item.name === suite);
      const hasModels = (data?.targets ?? 0) > 0;
      const anySuite = (data?.suites.length ?? 0) > 0;
      // A suite counts once it can run; until then Setup stays on top, where you are working.
      const hasSuite = !!data && data.suites.some((item) => !item.problem);
      const hasRun = (data?.jobs.length ?? 0) > 0;
      const ready = hasModels && hasSuite;
      const runNote = !data ? '' : !hasModels ? t('run.need.models') : !anySuite ? t('run.need.suite') : suiteInfo?.problem ? fill(t('run.problem'), { problem: suiteInfo.problem }) : suiteInfo ? fill(t('run.calls'), { n: suiteInfo.calls }) : '';

      const guide = h(
        'div',
        { className: 'dsh-bm-card' },
        h('h3', null, t('guide.title')),
        h(
          'ol',
          { className: 'dsh-bm-steps' },
          [[t('guide.1'), hasModels], [t('guide.2'), hasSuite], [t('guide.3'), hasRun]].map(([text, done], index) =>
            h('li', { key: index, 'data-done': String(done) }, h('span', { className: 'n', 'aria-hidden': true }, done ? '✓' : String(index + 1)), h('span', null, text), done ? h('span', { className: 'dsh-bm-stamp' }, t('guide.done')) : null),
          ),
        ),
      );

      const workArea = h(
        React.Fragment,
        null,
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('h3', { className: 'dsh-bm-group' }, t('run.title')),
          h(
            'div',
            { className: 'dsh-bm-bar' },
            anySuite
              ? h('select', { className: 'dsh-bm-field dsh-bm-wide', value: suite, 'aria-label': t('run.suite'), onChange: (event) => setSuite(event.target.value) }, data.suites.map((item) => h('option', { key: item.name, value: item.name }, item.name)))
              : null,
            h('button', { type: 'button', className: 'dsh-bm-btn', 'data-main': 'true', 'data-act': 'run', disabled: !ready || !suiteInfo || Boolean(suiteInfo.problem) || busy !== '', onClick: () => void run('run', { action: 'run', suite }) }, busy === 'run' ? t('run.starting') : t('run.button')),
            runNote ? h('span', { className: 'dsh-bm-stamp', 'data-bad': String(Boolean(suiteInfo?.problem) && hasModels), role: 'status' }, runNote) : null,
          ),
          actError ? h('p', { className: 'dsh-bm-note', 'data-bad': 'true', role: 'alert' }, actError) : null,
        ),
        h(
          'section',
          { className: 'dsh-bm-sec' },
          h('div', { className: 'dsh-bm-bar' }, h('h3', { className: 'dsh-bm-group' }, t('jobs.title')), h('span', { className: 'dsh-bm-spacer' }),
            selectedRunning ? h('button', { type: 'button', className: 'dsh-bm-btn', 'data-danger': 'true', 'data-act': 'cancel', disabled: busy !== '', onClick: () => void run('cancel', { action: 'cancel', id: selected }) }, t('run.cancel')) : null,
            h('button', { type: 'button', className: 'dsh-bm-btn', onClick: () => { void loadList(); void loadReport(selected); } }, t('refresh'))),
          list.status === 'loading'
            ? h('p', { className: 'dsh-bm-note' }, t('loading'))
            : list.status === 'error'
              ? h('p', { className: 'dsh-bm-note', 'data-bad': 'true' }, t('failed'))
              : data.jobs.length === 0
                ? h('p', { className: 'dsh-bm-note' }, t('jobs.empty'))
                : h('div', { className: 'dsh-bm-card' }, h(JobsTable, { t, jobs: data.jobs, selected, onSelect: setSelected })),
          report ? h(ReportView, { t, data: report }) : null,
        ),
      );

      const setupArea = h(
        'section',
        { className: 'dsh-bm-sec', style: { gap: 20 } },
        h('div', { className: 'dsh-bm-bar' }, h('h2', { className: 'dsh-bm-h2', style: { margin: 0 } }, t('setup.title')), h('span', { className: 'dsh-bm-spacer' }), saveState.note ? h('span', { className: 'dsh-bm-stamp', 'data-bad': String(saveState.bad), role: 'status' }, saveState.note) : null),
        settings.status === 'loading'
          ? h('p', { className: 'dsh-bm-note' }, t('loading'))
          : settings.status === 'error'
            ? h('p', { className: 'dsh-bm-note', 'data-bad': 'true' }, t('failed') + ' (' + settings.error + ')')
            : h(Setup, { t, cfg, catalog, save, saving: saveState.saving }),
      );

      return h(
        'div',
        { className: 'dsh-bm-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-bm-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        // Until there has been a first run, the three steps lead; Setup comes first while it is incomplete.
        hasRun ? null : guide,
        ready ? workArea : setupArea,
        ready ? setupArea : workArea,
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings', 'remote.session'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('benchmark', DICT));
        const t = ctx.locale.bind('benchmark');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'benchmark', order: 24, label: () => t('section.title') },
              (props) => h(BenchmarkPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
