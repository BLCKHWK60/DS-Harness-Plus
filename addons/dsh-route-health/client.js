/**
 * Browser half of Route health: a small status badge in the composer.
 * Reads the read-only, fenced `GET dsh-route-health/state` route of the host half
 * (same origin, the login cookie rides along). Shows nothing until routes are configured.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-route-health',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const DICT = {
      en: {
        'badge.label': 'Model routes',
        'badge.up': 'All routes reachable',
        'badge.slow': 'A route is slow',
        'badge.down': 'A route is down',
        'badge.unknown': 'Routes not checked yet',
        'row.up': 'up',
        'row.slow': 'slow',
        'row.down': 'down',
        'row.unknown': 'not checked',
        'row.never': 'never probed',
        'row.ago': '{n} s ago',
      },
      zh: {
        'badge.label': '模型路由',
        'badge.up': '所有路由可用',
        'badge.slow': '有路由响应较慢',
        'badge.down': '有路由不可用',
        'badge.unknown': '路由尚未检查',
        'row.up': '正常',
        'row.slow': '较慢',
        'row.down': '不可用',
        'row.unknown': '未检查',
        'row.never': '从未探测',
        'row.ago': '{n} 秒前',
      },
    };

    const CSS = `
.dsh-rh { position: relative; display: inline-flex; align-items: center; }
.dsh-rh-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; max-width: 200px; }
.dsh-rh-btn > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.dsh-rh-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-rh-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
.dsh-rh-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsh-rh-colour); border: 1.5px solid var(--dsh-rh-colour); }
.dsh-rh[data-state="unknown"] .dsh-rh-dot { background: transparent; }
.dsh-rh[data-state="up"] { --dsh-rh-colour: var(--dsw-alias-state-success-primary, #3aa676); }
.dsh-rh[data-state="slow"] { --dsh-rh-colour: var(--dsw-alias-state-warn-primary, #d69a2d); }
.dsh-rh[data-state="down"] { --dsh-rh-colour: var(--dsw-alias-state-error-primary, #d6453d); }
.dsh-rh[data-state="unknown"] { --dsh-rh-colour: var(--dsw-alias-label-secondary, #888); }
.dsh-rh-pop { position: absolute; bottom: 34px; left: 0; z-index: 20; min-width: 240px; max-width: 360px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #1b1b1b); color: var(--dsw-alias-label-primary); box-shadow: 0 8px 24px #0004; font-size: 12px; }
.dsh-rh-row { display: grid; grid-template-columns: 8px 1fr auto; gap: 4px 8px; align-items: baseline; padding: 4px 0; }
.dsh-rh-row + .dsh-rh-row { border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-rh-row .dsh-rh-dot { margin-top: 3px; }
.dsh-rh-row small { grid-column: 2 / 4; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rh-row[data-state="up"] { --dsh-rh-colour: var(--dsw-alias-state-success-primary, #3aa676); }
.dsh-rh-row[data-state="slow"] { --dsh-rh-colour: var(--dsw-alias-state-warn-primary, #d69a2d); }
.dsh-rh-row[data-state="down"] { --dsh-rh-colour: var(--dsw-alias-state-error-primary, #d6453d); }
.dsh-rh-row[data-state="unknown"] { --dsh-rh-colour: var(--dsw-alias-label-secondary, #888); }
.dsh-rh-row[data-state="unknown"] .dsh-rh-dot { background: transparent; }
`;

    const RANK = { down: 3, slow: 2, unknown: 1, up: 0 };
    const POLL_MS = 10000;

    /**
     * @param {Array<{state: string}>} routes - route snapshots.
     * @returns {'up' | 'slow' | 'down' | 'unknown'} the worst state.
     */
    function worst(routes) {
      return routes.reduce((acc, row) => ((RANK[row.state] ?? 1) > RANK[acc] ? row.state : acc), 'up');
    }

    function RouteBadge({ appCtx }) {
      const t = appCtx.locale.bind('routeHealth');
      const [routes, setRoutes] = useState(null);
      const [open, setOpen] = useState(false);
      const box = useRef(null);

      const refresh = useCallback(async () => {
        if (document.hidden) return;
        try {
          const response = await fetch(new URL('dsh-route-health/state?probe=1', document.baseURI), { cache: 'no-store' });
          if (!response.ok) return;
          const body = await response.json();
          if (Array.isArray(body.routes)) setRoutes(body.routes);
        } catch {
          // Offline or the host restarted: keep the last picture.
        }
      }, []);

      useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), POLL_MS);
        const visible = () => { if (!document.hidden) void refresh(); };
        document.addEventListener('visibilitychange', visible);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
      }, [refresh]);

      useEffect(() => {
        if (!open) return undefined;
        const away = (event) => { if (box.current && !box.current.contains(event.target)) setOpen(false); };
        const key = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
      }, [open]);

      if (!routes || routes.length === 0) return null;
      const state = worst(routes);
      const down = routes.filter((row) => row.state === 'down');
      const summary = t('badge.' + state);
      const text = state === 'down' ? down.map((row) => row.label).join(', ') : state === 'slow' ? routes.filter((row) => row.state === 'slow').map((row) => row.label).join(', ') : '';
      const age = (row) => (row.lastProbeAt ? t('row.ago').replace('{n}', String(Math.max(0, Math.round((Date.now() - row.lastProbeAt) / 1000)))) : t('row.never'));
      return h(
        'div',
        { className: 'dsh-rh', 'data-state': state, ref: box },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'button',
          { type: 'button', className: 'dsh-rh-btn', 'aria-expanded': open, 'aria-label': t('badge.label') + ': ' + summary, title: summary, onClick: () => setOpen((value) => !value) },
          h('span', { className: 'dsh-rh-dot', 'aria-hidden': true }),
          text ? h('span', null, text) : null,
        ),
        open
          ? h(
              'div',
              { className: 'dsh-rh-pop', role: 'status' },
              routes.map((row) =>
                h(
                  'div',
                  { key: row.route, className: 'dsh-rh-row', 'data-state': row.state },
                  h('span', { className: 'dsh-rh-dot', 'aria-hidden': true }),
                  h('span', null, row.label),
                  h('span', null, t('row.' + row.state) + (row.latencyMs != null && row.state !== 'down' ? ' · ' + row.latencyMs + ' ms' : '')),
                  h('small', null, row.error ? row.error + ' · ' + age(row) : age(row)),
                ),
              ),
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('routeHealth', DICT));
        ctx.effect(() =>
          ctx.slots.inject('conversation.input.left', () =>
            ctx.slots.register(
              { name: 'conversation.input.left', id: 'route-health-badge', order: -21, label: () => DICT.en['badge.label'] },
              (props) => h(RouteBadge, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
