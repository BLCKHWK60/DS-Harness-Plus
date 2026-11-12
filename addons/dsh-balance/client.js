/**
 * Balance, browser half: one line at the bottom of the sidebar with your DeepSeek balance.
 * Press it to read the balance again. The reading itself is in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-balance',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    /** How often the sidebar asks again by itself. */
    const EVERY_MS = 5 * 60 * 1000;

    const CSS = `
.dsh-bl { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; min-height: 32px; padding: 0 10px; border: 0; border-radius: 10px;
  cursor: pointer; font: inherit; font-size: 13px; line-height: 20px; text-align: left; color: var(--dsw-alias-label-secondary); background: transparent; }
.dsh-bl:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-bl:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-bl[data-busy="true"] { opacity: .6; }
.dsh-bl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-bl-amount { flex: none; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.dsh-bl[data-problem="true"] .dsh-bl-amount { color: var(--dsw-alias-label-secondary); }
.dsh-bl[data-wide="false"] { justify-content: center; padding: 0 2px; font-size: 11px; }
.dsh-bl[data-wide="false"] .dsh-bl-name { display: none; }
`;

    async function call(fresh) {
      const response = await fetch(new URL('dsh-balance/data', document.baseURI), { method: fresh ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }

    /** What the pointer shows: every balance, where it is from, and when it was read. */
    function hint(data, failed) {
      if (failed) return `The balance could not be read: ${failed}. Press to try again.`;
      const lines = [];
      for (const source of data.sources ?? []) lines.push(`${source.label}: ${source.wallets.length > 0 ? source.wallets.map((wallet) => wallet.text).join(', ') : source.problem}`);
      if (lines.length === 0 && data.problem) lines.push(data.problem);
      if (data.at) lines.push(`Read at ${new Date(data.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Press to read again.`);
      return lines.join('\n');
    }

    function Balance({ wide }) {
      const [data, setData] = useState(undefined);
      const [failed, setFailed] = useState('');
      const [busy, setBusy] = useState(false);
      const alive = useRef(true);
      const load = useCallback(async (fresh) => {
        setBusy(true);
        try {
          const next = await call(fresh);
          if (!alive.current) return;
          setData(next);
          setFailed('');
        } catch (error) {
          if (alive.current) setFailed(String(error?.message ?? error));
        } finally {
          if (alive.current) setBusy(false);
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load(false);
        const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(false); }, EVERY_MS);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      if (!data && !failed) return null;
      if (data && data.enabled === false) return null;
      const amount = failed || !data?.text ? '—' : wide ? data.text : data.text.replace(/\.\d+/, '');
      const title = hint(data ?? {}, failed);
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', {
          type: 'button', className: 'dsh-bl', 'data-wide': String(wide !== false), 'data-busy': String(busy), 'data-problem': String(Boolean(failed) || !data?.text),
          title, 'aria-label': `DeepSeek balance: ${amount}. ${title}`, onClick: () => { if (!busy) void load(true); },
        },
        h('span', { className: 'dsh-bl-name' }, 'Balance'),
        h('span', { className: 'dsh-bl-amount' }, amount)));
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-balance', order: 0 }, (seat) => h(Balance, { wide: seat?.wide }))));
      },
    };
  },
});
