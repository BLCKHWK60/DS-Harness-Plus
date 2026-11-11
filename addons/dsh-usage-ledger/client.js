/**
 * Browser half of Usage ledger: a read-only "Usage" card in Settings.
 * Reads the fenced `GET dsh-usage-ledger/summary` route of the host half (same origin, login
 * cookie). Shows requests and tokens only; the ledger stores no prompt text and this card
 * cannot change or reset anything (use /usage reset for that).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-usage-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;

    const DICT = {
      en: {
        'section.title': 'Usage',
        'head.title': 'Usage',
        'head.hint': 'Model requests and tokens counted by this app, per day and model. Only numbers are stored: no prompts, no answers. A request is one model call, so a turn with tools counts several.',
        'period.7': '7 days',
        'period.30': '30 days',
        'period.90': '90 days',
        'period.365': 'Year',
        'refresh': 'Refresh',
        'stat.requests': 'Requests',
        'stat.input': 'Input tokens',
        'stat.output': 'Output tokens',
        'stat.cache': 'Cache read',
        'stat.reasoning': 'Reasoning',
        'stat.free': 'Free-model requests',
        'daily.title': 'Requests per day',
        'models.title': 'By model',
        'col.model': 'Model',
        'col.requests': 'Requests',
        'col.input': 'Input',
        'col.output': 'Output',
        'col.cache': 'Cache read',
        'free': 'free',
        'empty': 'No requests recorded in this period yet.',
        'failed': 'Could not read the usage counts. Is the Usage counter add-on switched on?',
        'loading': 'Loading usage…',
        'updated': 'Updated {time}',
      },
      zh: {
        'section.title': '用量',
        'head.title': '用量',
        'head.hint': '本应用按天和模型统计的请求与 token 数。只保存数字，不保存提示词或回答。一次请求即一次模型调用，因此带工具的一轮会计多次。',
        'period.7': '7 天',
        'period.30': '30 天',
        'period.90': '90 天',
        'period.365': '一年',
        'refresh': '刷新',
        'stat.requests': '请求数',
        'stat.input': '输入 token',
        'stat.output': '输出 token',
        'stat.cache': '缓存读取',
        'stat.reasoning': '推理',
        'stat.free': '免费模型请求',
        'daily.title': '每日请求数',
        'models.title': '按模型',
        'col.model': '模型',
        'col.requests': '请求',
        'col.input': '输入',
        'col.output': '输出',
        'col.cache': '缓存读取',
        'free': '免费',
        'empty': '此时间段内还没有记录。',
        'failed': '无法读取用量记录。此配置是否加载了用量账本插件？',
        'loading': '正在加载用量…',
        'updated': '更新于 {time}',
      },
    };

    const CSS = `
.dsh-ul-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-ul-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-ul-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-ul-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-ul-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-ul-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ul-btn[disabled] { opacity: .5; cursor: default; }
.dsh-ul-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-ul-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-ul-spacer { flex: 1; }
.dsh-ul-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.dsh-ul-stat { padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); }
.dsh-ul-stat b { display: block; font-size: 18px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dsh-ul-stat span { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-ul-card { display: block; }
.dsh-ul-card h3 { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ul-card h3 { margin: 0 0 10px; }
.dsh-ul-chart { display: flex; align-items: flex-end; gap: 2px; height: 84px; }
.dsh-ul-col { flex: 1; min-width: 2px; height: 100%; display: flex; align-items: flex-end; }
.dsh-ul-col i { display: block; width: 100%; min-height: 1px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-secondary); opacity: .35; }
.dsh-ul-col[data-has="true"] i { opacity: .9; background: var(--dsw-alias-brand-primary); }
.dsh-ul-axis { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dsh-ul-table th { text-align: right; font-weight: 600; font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 0 0 8px 10px; }
.dsh-ul-table th:first-child, .dsh-ul-table td:first-child { text-align: left; padding-left: 0; }
.dsh-ul-table td { text-align: right; padding: 8px 0 8px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }
.dsh-ul-model { overflow-wrap: anywhere; }
.dsh-ul-share { display: block; height: 3px; margin-top: 4px; border-radius: 2px; background: var(--dsw-alias-brand-primary); opacity: .55; }
.dsh-ul-free { margin-left: 6px; padding: 0 8px; border: 0.5px solid currentColor; border-radius: 12px; font-size: 11px; color: var(--dsw-alias-state-success-primary); }
.dsh-ul-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ul-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
`;

    const PERIODS = [7, 30, 90, 365];
    const REFRESH_MS = 15000;

    /** Compact number: 12.3k, 4.5M. */
    function compact(value) {
      const n = Number(value) || 0;
      if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
      return String(Math.round(n));
    }

    /** Local day key, the same format the host writes. */
    function dayKey(date) {
      const pad = (v) => String(v).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    /** Every day of the period, zero-filled, oldest first. */
    function fillDays(perDay, period) {
      const byDate = new Map(perDay.map((row) => [row.date, row]));
      const out = [];
      const day = new Date();
      day.setDate(day.getDate() - (period - 1));
      for (let i = 0; i < period; i += 1) {
        const key = dayKey(day);
        out.push({ date: key, requests: byDate.get(key)?.requests ?? 0 });
        day.setDate(day.getDate() + 1);
      }
      return out;
    }

    function UsagePage({ appCtx }) {
      const t = appCtx.locale.bind('usageLedger');
      const [period, setPeriod] = useState(30);
      const [state, setState] = useState({ status: 'loading', data: null, at: 0 });

      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-usage-ledger/summary?days=' + period, document.baseURI), { cache: 'no-store' });
          if (!response.ok) throw new Error(String(response.status));
          const data = await response.json();
          setState({ status: 'ready', data, at: Date.now() });
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
        }
      }, [period]);

      useEffect(() => {
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
        return () => clearInterval(timer);
      }, [load]);

      const data = state.data;
      const days = useMemo(() => (data ? fillDays(data.days ?? [], period) : []), [data, period]);
      const peak = Math.max(1, ...days.map((row) => row.requests));
      const freeRequests = data ? (data.models ?? []).filter((m) => m.free).reduce((sum, m) => sum + m.requests, 0) : 0;
      const top = data && data.models.length > 0 ? data.models[0].requests : 1;

      let body;
      if (state.status === 'loading') body = h('p', { className: 'dsh-ul-note' }, t('loading'));
      else if (state.status === 'error') body = h('p', { className: 'dsh-ul-note', 'data-bad': 'true' }, t('failed'));
      else if (data.totals.requests === 0) body = h('p', { className: 'dsh-ul-note' }, t('empty'));
      else {
        const stats = [
          ['stat.requests', data.totals.requests],
          ['stat.input', data.totals.input],
          ['stat.output', data.totals.output],
          ['stat.cache', data.totals.cacheRead],
          ['stat.reasoning', data.totals.reasoning],
          ['stat.free', freeRequests],
        ];
        body = h(
          React.Fragment,
          null,
          h('div', { className: 'dsh-ul-stats' }, stats.map(([key, value]) => h('div', { key, className: 'dsh-ul-stat' }, h('b', null, compact(value)), h('span', null, t(key))))),
          h(
            'section',
            { className: 'dsh-ul-card' },
            h('h3', null, t('daily.title')),
            h('div', { className: 'dsh-ul-chart', role: 'img', 'aria-label': t('daily.title') }, days.map((row) => h('div', { key: row.date, className: 'dsh-ul-col', 'data-has': String(row.requests > 0), title: row.date + ': ' + row.requests }, h('i', { style: { height: Math.max(row.requests > 0 ? 4 : 1, Math.round((row.requests / peak) * 100)) + '%' } })))),
            h('div', { className: 'dsh-ul-axis' }, h('span', null, days[0]?.date), h('span', null, days[days.length - 1]?.date)),
          ),
          h(
            'section',
            { className: 'dsh-ul-card' },
            h('h3', null, t('models.title')),
            h(
              'table',
              { className: 'dsh-ul-table' },
              h('thead', null, h('tr', null, ['col.model', 'col.requests', 'col.input', 'col.output', 'col.cache'].map((key) => h('th', { key, scope: 'col' }, t(key))))),
              h(
                'tbody',
                null,
                data.models.map((row) =>
                  h(
                    'tr',
                    { key: row.model },
                    h('td', { className: 'dsh-ul-model' }, h('span', null, row.model), row.free ? h('span', { className: 'dsh-ul-free' }, t('free')) : null, h('i', { className: 'dsh-ul-share', style: { width: Math.max(2, Math.round((row.requests / top) * 100)) + '%' } })),
                    h('td', null, compact(row.requests)),
                    h('td', null, compact(row.input)),
                    h('td', null, compact(row.output)),
                    h('td', null, compact(row.cacheRead)),
                  ),
                ),
              ),
            ),
          ),
        );
      }

      return h(
        'div',
        { className: 'dsh-ul-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-ul-head' }, h('h2', null, t('head.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-ul-bar', role: 'group', 'aria-label': t('head.title') },
          PERIODS.map((n) => h('button', { key: n, type: 'button', className: 'dsh-ul-btn', 'aria-pressed': period === n, onClick: () => setPeriod(n) }, t('period.' + n))),
          h('span', { className: 'dsh-ul-spacer' }),
          state.at ? h('span', { className: 'dsh-ul-stamp' }, t('updated').replace('{time}', new Date(state.at).toLocaleTimeString())) : null,
          h('button', { type: 'button', className: 'dsh-ul-btn', onClick: () => void load() }, t('refresh')),
        ),
        body,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('usageLedger', DICT));
        const t = ctx.locale.bind('usageLedger');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'usage-ledger', order: 18, label: () => t('section.title') },
              (props) => h(UsagePage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
