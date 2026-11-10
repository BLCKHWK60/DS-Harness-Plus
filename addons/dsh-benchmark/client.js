/**
 * Browser half of Benchmark: a read-only "Benchmark" page in Settings. It lists jobs and shows the
 * report of the one you pick (score, spread, latency, errors, cost per cell, the recommended cell per
 * category and target, and the sampling-presets fragment the export would write).
 *
 * It reads the fenced `GET dsh-benchmark/jobs` and `GET dsh-benchmark/report?job=` routes of the host
 * half (same origin, login cookie). It cannot start, cancel or change anything: use `/bench run`,
 * `/bench cancel` and the Sampling page for that. No prompts or answers are ever sent to the browser.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-benchmark',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const DICT = {
      en: {
        'section.title': 'Benchmark',
        'head.hint': 'Results of benchmark jobs: every model, temperature and output cap you listed, scored on your suites. Start a job with /bench run <suite> in a chat; this page only shows results and cannot change anything. A failed or timed-out request is counted as an error and never scored.',
        'suites': 'Suites you can run',
        'jobs.title': 'Jobs',
        'jobs.empty': 'No jobs yet. Run one with /bench run <suite>.',
        'col.job': 'Job',
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
        'updated': 'Updated {time}',
        'report.title': 'Report for job {id}',
        'report.partial': 'Still running: these numbers are partial.',
        'report.errors': 'Why runs were not scored',
        'report.none': 'No results in this job yet.',
        'r.category': 'Category',
        'r.target': 'Target',
        'r.temp': 'Temp',
        'r.max': 'Max tokens',
        'r.n': 'Runs',
        'r.seeds': 'Seeds',
        'r.score': 'Score',
        'r.spread': '± seeds',
        'r.latency': 'Latency ms',
        'r.errors': 'Errors',
        'r.cost': 'Cost USD',
        'r.pick': 'Recommended',
        'r.low': 'Low confidence',
        'picks.title': 'Recommended per category and target',
        'picks.none': 'Nothing recommended yet.',
        'picks.caveat': 'Caveats',
        'export.title': 'Sampling presets fragment',
        'export.hint': 'Only confident picks are exported. Nothing is applied: merge what you want into the Sampling page or the plugin config.',
        'export.copy': 'Copy',
        'export.copied': 'Copied',
        'export.failed': 'Select the text and copy it',
        'cost.total': 'Total cost',
        'failed': 'Could not read the benchmark jobs. Is the Benchmark plugin loaded and configured (targets and suites) in this profile?',
        'loading': 'Loading benchmark…',
        'dash': '–',
      },
      zh: {
        'section.title': '基准测试',
        'head.hint': '基准测试任务的结果：你列出的每个模型、温度和输出上限，在你的测试集上的得分。在聊天中用 /bench run <测试集> 启动任务；本页只显示结果，不能修改任何内容。失败或超时的请求记为错误，不计分。',
        'suites': '可运行的测试集',
        'jobs.title': '任务',
        'jobs.empty': '还没有任务。用 /bench run <测试集> 运行一个。',
        'col.job': '任务',
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
        'updated': '更新于 {time}',
        'report.title': '任务 {id} 的报告',
        'report.partial': '仍在运行：以下数字尚不完整。',
        'report.errors': '部分运行未计分的原因',
        'report.none': '此任务还没有结果。',
        'r.category': '类别',
        'r.target': '目标',
        'r.temp': '温度',
        'r.max': '最大 token',
        'r.n': '运行数',
        'r.seeds': '种子数',
        'r.score': '得分',
        'r.spread': '± 种子',
        'r.latency': '延迟 ms',
        'r.errors': '错误',
        'r.cost': '费用 USD',
        'r.pick': '推荐',
        'r.low': '置信度低',
        'picks.title': '每个类别和目标的推荐',
        'picks.none': '暂无推荐。',
        'picks.caveat': '注意',
        'export.title': '采样预设片段',
        'export.hint': '只导出置信度足够的推荐。不会自动应用：把需要的部分合并到“采样”页面或插件配置中。',
        'export.copy': '复制',
        'export.copied': '已复制',
        'export.failed': '请选中文本后复制',
        'cost.total': '总费用',
        'failed': '无法读取基准测试任务。此配置是否加载并配置了基准测试插件（目标和测试集）？',
        'loading': '正在加载基准测试…',
        'dash': '–',
      },
    };

    const CSS = `
.dsh-bm-page { display: flex; flex-direction: column; gap: 16px; padding: 2px 0 36px; }
.dsh-bm-head h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-bm-head p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
.dsh-bm-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-bm-spacer { flex: 1; }
.dsh-bm-stamp { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-btn { height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-bm-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-bm-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
.dsh-bm-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-bm-card > h3 { margin: 0; font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-bm-note { margin: 0; font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
.dsh-bm-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-bm-chip { padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; font-size: 12px; color: var(--dsw-alias-label-primary); }
.dsh-bm-scroll { overflow-x: auto; }
.dsh-bm-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.dsh-bm-table th { text-align: right; font-weight: 600; font-size: 11px; color: var(--dsw-alias-label-secondary); padding: 0 0 6px 10px; white-space: nowrap; }
.dsh-bm-table th button { all: unset; cursor: pointer; }
.dsh-bm-table th button:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 2px; }
.dsh-bm-table td { text-align: right; padding: 6px 0 6px 10px; border-top: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dsh-bm-table th.l, .dsh-bm-table td.l { text-align: left; padding-left: 0; padding-right: 14px; }
.dsh-bm-table tr[data-sel="true"] td { background: var(--dsw-alias-bg-layer-2); }
.dsh-bm-table tr[data-click="true"] { cursor: pointer; }
.dsh-bm-table tr[data-click="true"]:hover td { background: var(--dsw-alias-bg-layer-2); }
.dsh-bm-table tr[data-click="true"]:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: -2px; }
.dsh-bm-state { padding: 0 6px; border: 1px solid currentColor; border-radius: 6px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-state[data-s="running"] { color: var(--dsw-alias-state-info-primary, var(--dsw-alias-label-primary)); }
.dsh-bm-state[data-s="finished"] { color: var(--dsw-alias-state-success-primary); }
.dsh-bm-state[data-s="failed"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bm-prog { display: inline-block; vertical-align: middle; width: 56px; height: 4px; margin-right: 6px; border-radius: 2px; background: var(--dsw-alias-border-l1); overflow: hidden; }
.dsh-bm-prog i { display: block; height: 100%; background: var(--dsw-alias-label-secondary); }
.dsh-bm-score { display: inline-block; vertical-align: middle; width: 40px; height: 4px; margin-right: 6px; border-radius: 2px; background: var(--dsw-alias-border-l1); overflow: hidden; }
.dsh-bm-score i { display: block; height: 100%; background: var(--dsw-alias-label-secondary); }
.dsh-bm-pick { margin-left: 6px; padding: 0 6px; border: 1px solid currentColor; border-radius: 6px; font-size: 10px; color: var(--dsw-alias-state-success-primary); }
.dsh-bm-pick[data-low="true"] { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.dsh-bm-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-bm-pre { margin: 0; padding: 10px 12px; max-height: 260px; overflow: auto; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); white-space: pre; }
`;

    const REFRESH_FAST = 3000;
    const REFRESH_SLOW = 15000;

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };

    const num = (value, digits) => (value === null || value === undefined ? null : Number(value).toFixed(digits));

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

    function BenchmarkPage({ appCtx }) {
      const t = appCtx.locale.bind('benchmark');
      const [list, setList] = useState({ status: 'loading', data: null, at: 0 });
      const [selected, setSelected] = useState('');
      const [report, setReport] = useState(null);
      const current = useRef('');

      const loadList = useCallback(async () => {
        try {
          const data = await get('dsh-benchmark/jobs');
          setList({ status: 'ready', data, at: Date.now() });
          setSelected((prev) => (prev && data.jobs.some((job) => job.id === prev) ? prev : data.jobs[0]?.id ?? ''));
        } catch {
          setList((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
        }
      }, []);

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

      const selectedRunning = !!list.data && list.data.jobs.some((job) => job.id === selected && String(job.state) === 'running');

      useEffect(() => {
        current.current = selected;
        setReport((prev) => (prev && prev.job.id === selected ? prev : null));
        void loadReport(selected);
        if (!selectedRunning) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void loadReport(selected); }, REFRESH_FAST);
        return () => clearInterval(timer);
      }, [selected, selectedRunning, loadReport]);

      let body;
      if (list.status === 'loading') body = h('p', { className: 'dsh-bm-note' }, t('loading'));
      else if (list.status === 'error') body = h('p', { className: 'dsh-bm-note', 'data-bad': 'true' }, t('failed'));
      else {
        body = h(
          React.Fragment,
          null,
          h('section', { className: 'dsh-bm-card' }, h('h3', null, t('suites')), h('div', { className: 'dsh-bm-chips' }, list.data.suites.map((name) => h('span', { key: name, className: 'dsh-bm-chip' }, name)))),
          h(
            'section',
            { className: 'dsh-bm-card' },
            h('h3', null, t('jobs.title')),
            list.data.jobs.length === 0 ? h('p', { className: 'dsh-bm-note' }, t('jobs.empty')) : h(JobsTable, { t, jobs: list.data.jobs, selected, onSelect: setSelected }),
          ),
          report ? h(ReportView, { t, data: report }) : null,
        );
      }

      return h(
        'div',
        { className: 'dsh-bm-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-bm-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-bm-bar' },
          h('span', { className: 'dsh-bm-spacer' }),
          list.at ? h('span', { className: 'dsh-bm-stamp' }, t('updated').replace('{time}', new Date(list.at).toLocaleTimeString())) : null,
          h('button', { type: 'button', className: 'dsh-bm-btn', onClick: () => { void loadList(); void loadReport(selected); } }, t('refresh')),
        ),
        body,
      );
    }

    return {
      inject: ['slots', 'locale'],
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
