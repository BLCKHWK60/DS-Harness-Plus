/**
 * Browser half of Agent swarm: a read-only "Swarm" page in Settings with two cards.
 *
 *  - Runs: the model's recent `run_swarm` calls (newest first). Pick one to see every member's
 *    state (waiting, running, done, failed, skipped, cancelled), its route, its round (debate),
 *    its tokens and time, and the swarm's spend against its budget. It refreshes every 2 seconds
 *    while a run is going and every 10 seconds otherwise.
 *  - Swarms: the swarms configured in the plugin entry, with their members and caps.
 *
 * It reads the fenced `GET dsh-agent-swarm/state` route (same origin, login cookie). Runs are kept in
 * the host's memory (the last 20) and are gone after a host restart. The route carries no task text,
 * prompts or member answers: those stay in the conversation where the tool result is shown. The page
 * cannot start, stop or change a swarm.
 *
 * Why a page and not a card in the conversation: a plugin outside the dsh repository cannot add
 * events to a session, and the transcript is built from session events. A plugin outside the dsh repository may not add session events, so this lives in Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-agent-swarm',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const DICT = {
      en: {
        'section.title': 'Swarm',
        'head.hint': 'Named swarms of child agents, started by the model through the run_swarm tool. This page shows the recent runs (who is working, who is done, what it cost) and the swarms you configured. It is read-only; the answers themselves appear in the conversation.',
        'refresh': 'Refresh',
        'updated': 'Updated {time}',
        'runs.title': 'Recent runs',
        'runs.empty': 'No runs yet. A run appears here when the model calls {tool}. Runs are kept in memory (the last 20) and are cleared when the app restarts.',
        'swarms.title': 'Configured swarms',
        'swarms.empty': 'No swarm is set up yet, so the tool is switched off. Add swarms to the agent-swarm entry in the app\'s settings file (see the add-on\'s README).',
        'status.running': 'running',
        'status.done': 'done',
        'status.stopped': 'stopped',
        'status.cancelled': 'cancelled',
        'state.waiting': 'waiting',
        'state.running': 'running',
        'state.done': 'done',
        'state.failed': 'failed',
        'state.skipped': 'skipped',
        'state.cancelled': 'not answered',
        'strategy.fanout': 'fan-out',
        'strategy.pipeline': 'pipeline',
        'strategy.debate': 'debate',
        'run.summary': '{strategy} · {done} of {total} members answered · up to {seen} at once (cap {cap})',
        'run.summary.debate': '{strategy} · round {round} of {rounds} · up to {seen} at once (cap {cap})',
        'run.stopped': 'Stopped early: {reason}.',
        'run.cancelled': 'Cancelled or out of time.',
        'budget.tokens': 'Tokens',
        'budget.usd': 'Dollars',
        'budget.none': 'no cap',
        'budget.pricing': 'Dollar figures use your pricing map; models not in it count as 0.',
        'col.member': 'Member',
        'col.route': 'Model',
        'col.state': 'State',
        'col.round': 'Round',
        'col.tokens': 'Tokens',
        'col.time': 'Time',
        'rebound': 'note',
        'tokens': '{n} tokens',
        'usd': '${n}',
        'ago': '{time}',
        'cap': 'up to {n} at once',
        'minutes': '{n} min limit',
        'rounds': '{n} rounds',
        'members': '{n} members',
        'role': 'role {role}',
        'tier': 'tier {tier}',
        'route.parent': "the parent's model",
        'down': 'When a model is down: {policy}.',
        'failed': 'Could not read the swarm state. Is the Agent swarm add-on switched on?',
        'loading': 'Loading swarm…',
        'gone': 'This run is no longer kept.',
      },
      zh: {
        'section.title': '集群',
        'head.hint': '由模型通过 run_swarm 工具启动的具名子智能体集群。本页显示最近的运行（谁在工作、谁已完成、花了多少）以及你配置的集群。本页只读；回答内容会显示在对话中。',
        'refresh': '刷新',
        'updated': '更新于 {time}',
        'runs.title': '最近的运行',
        'runs.empty': '还没有运行。模型调用 {tool} 后，运行会出现在这里。运行记录保存在内存中（最近 20 次），主机重启后清空。',
        'swarms.title': '已配置的集群',
        'swarms.empty': '尚未配置任何集群，因此该工具未注册。请在配置中的 agent-swarm 条目里添加集群（见插件 README）。',
        'status.running': '进行中',
        'status.done': '已完成',
        'status.stopped': '已停止',
        'status.cancelled': '已取消',
        'state.waiting': '等待中',
        'state.running': '进行中',
        'state.done': '已完成',
        'state.failed': '失败',
        'state.skipped': '已跳过',
        'state.cancelled': '未作答',
        'strategy.fanout': '并行',
        'strategy.pipeline': '流水线',
        'strategy.debate': '辩论',
        'run.summary': '{strategy} · {done} / {total} 个成员已作答 · 最多同时 {seen} 个（上限 {cap}）',
        'run.summary.debate': '{strategy} · 第 {round} / {rounds} 轮 · 最多同时 {seen} 个（上限 {cap}）',
        'run.stopped': '提前停止：{reason}。',
        'run.cancelled': '已取消或已超时。',
        'budget.tokens': 'Token',
        'budget.usd': '美元',
        'budget.none': '无上限',
        'budget.pricing': '美元金额按你的 pricing 表计算；表中没有的模型按 0 计。',
        'col.member': '成员',
        'col.route': '线路',
        'col.state': '状态',
        'col.round': '轮次',
        'col.tokens': 'Token',
        'col.time': '用时',
        'rebound': '备注',
        'tokens': '{n} 个 token',
        'usd': '${n}',
        'ago': '{time}',
        'cap': '最多同时 {n} 个',
        'minutes': '时限 {n} 分钟',
        'rounds': '{n} 轮',
        'members': '{n} 个成员',
        'role': '角色 {role}',
        'tier': '档位 {tier}',
        'route.parent': '父会话的线路',
        'down': '线路健康：线路不可用时 {policy}。',
        'failed': '无法读取集群状态。此配置是否加载了 Agent swarm 插件？',
        'loading': '正在加载集群…',
        'gone': '这次运行已不再保留。',
      },
    };

    const CSS = `
.dsh-sw-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-sw-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-sw-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-sw-spacer { flex: 1; }
.dsh-sw-stamp { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-sw-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-sw-btn[disabled] { opacity: .5; cursor: default; }
.dsh-sw-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-sw-card { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; padding: 16px; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dsh-sw-card > h3 { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-sw-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sw-list { display: flex; flex-direction: column; }
.dsh-sw-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-top: 0.5px solid var(--dsw-alias-border-l1); cursor: pointer; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); border-radius: 8px; }
.dsh-sw-row:first-child { border-top: 0; }
.dsh-sw-row:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-sw-row[aria-pressed="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
.dsh-sw-row:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.dsh-sw-row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sw-row .d { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-sw-chip { padding: 0 8px; border: 0.5px solid currentColor; border-radius: 12px; font-size: 11px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dsh-sw-chip[data-k="running"] { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-label-primary)); }
.dsh-sw-chip[data-k="done"] { color: var(--dsw-alias-state-success-primary); }
.dsh-sw-chip[data-k="failed"], .dsh-sw-chip[data-k="stopped"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sw-chip[data-k="running"]::before { content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 5px; border-radius: 50%; background: currentColor; vertical-align: 1px; animation: dsh-sw-pulse 1.2s ease-in-out infinite; }
@keyframes dsh-sw-pulse { 50% { opacity: .25; } }
@media (prefers-reduced-motion: reduce) { .dsh-sw-chip[data-k="running"]::before { animation: none; } }
.dsh-sw-meters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.dsh-sw-meter { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dsh-sw-meter b { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-bartrack { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); overflow: hidden; }
.dsh-sw-barfill { height: 100%; background: var(--dsw-alias-brand-primary); }
.dsh-sw-barfill[data-over="true"] { background: var(--dsw-alias-state-error-primary); }
.dsh-sw-tablewrap { overflow-x: auto; }
.dsh-sw-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dsh-sw-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 4px 14px 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); white-space: nowrap; }
.dsh-sw-table td { padding: 8px 14px 8px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); vertical-align: top; }
.dsh-sw-table tr:last-child td { border-bottom: 0; }
.dsh-sw-table td.num, .dsh-sw-table th.num { text-align: right; }
.dsh-sw-table .sub { display: block; margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-sw-swarm { border-top: 0.5px solid var(--dsw-alias-border-l1); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.dsh-sw-swarm:first-of-type { border-top: 0; padding-top: 0; }
.dsh-sw-swarm header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-sw-swarm header b { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-sw-facts { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sw-members { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); }
.dsh-sw-members li { display: flex; flex-wrap: wrap; gap: 2px 8px; }
.dsh-sw-members .m { font-weight: 600; }
.dsh-sw-members .w { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
`;

    const POLL_SLOW = 10000;
    const POLL_FAST = 2000;

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };
    const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.split('{' + key + '}').join(String(value)), text);
    const nf = (n) => Number(n).toLocaleString();
    const money = (n) => (n >= 1 ? n.toFixed(2) : n.toFixed(4));
    const span = (ms) => {
      if (!(ms >= 0)) return '';
      const s = Math.round(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
    };
    const chipKind = (state) => (state === 'failed' || state === 'stopped' ? 'failed' : state === 'running' ? 'running' : state === 'done' ? 'done' : 'plain');

    function Meter({ label, used, cap, text, none }) {
      const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
      return h(
        'div',
        { className: 'dsh-sw-meter' },
        h('span', null, label),
        h('b', null, text),
        cap > 0
          ? h('div', { className: 'dsh-sw-bartrack', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': cap, 'aria-valuenow': Math.min(used, cap), 'aria-label': label }, h('div', { className: 'dsh-sw-barfill', 'data-over': String(used >= cap), style: { width: ratio * 100 + '%' } }))
          : h('span', null, none),
      );
    }

    function RunDetail({ t, run, now, pricing }) {
      const answered = run.members.filter((m) => m.state === 'done').length;
      const counted = run.members.filter((m) => m.state !== 'skipped').length;
      return h(
        React.Fragment,
        null,
        h(
          'p',
          { className: 'dsh-sw-note', role: 'status' },
          // A debate member answers once per round, so a count of members that answered would mislead mid-run.
          run.strategy === 'debate'
            ? fill(t('run.summary.debate'), { strategy: t('strategy.debate'), round: run.round, rounds: run.rounds, seen: run.maxObservedActive, cap: run.maxActive })
            : fill(t('run.summary'), { strategy: t('strategy.' + run.strategy), done: answered, total: counted, seen: run.maxObservedActive, cap: run.maxActive }),
        ),
        run.stopped ? h('p', { className: 'dsh-sw-note', 'data-bad': 'true' }, fill(t('run.stopped'), { reason: run.stopped })) : run.status === 'cancelled' ? h('p', { className: 'dsh-sw-note' }, t('run.cancelled')) : null,
        h(
          'div',
          { className: 'dsh-sw-meters' },
          h(Meter, {
            label: t('budget.tokens'),
            used: run.tokens,
            cap: run.budget.tokens,
            text: run.budget.tokens > 0 ? nf(run.tokens) + ' / ' + nf(run.budget.tokens) : nf(run.tokens),
            none: t('budget.none'),
          }),
          h(Meter, {
            label: t('budget.usd'),
            used: run.usd,
            cap: run.budget.usd,
            text: run.budget.usd > 0 ? '$' + money(run.usd) + ' / $' + money(run.budget.usd) : '$' + money(run.usd),
            none: t('budget.none'),
          }),
        ),
        !pricing && run.budget.usd > 0 ? h('p', { className: 'dsh-sw-note' }, t('budget.pricing')) : null,
        h(
          'div',
          { className: 'dsh-sw-tablewrap' },
          h(
            'table',
            { className: 'dsh-sw-table' },
            h('thead', null, h('tr', null, h('th', null, t('col.member')), h('th', null, t('col.route')), h('th', null, t('col.state')), run.strategy === 'debate' ? h('th', { className: 'num' }, t('col.round')) : null, h('th', { className: 'num' }, t('col.tokens')), h('th', { className: 'num' }, t('col.time')))),
            h(
              'tbody',
              null,
              run.members.map((m) =>
                h(
                  'tr',
                  { key: m.id },
                  h('td', null, m.id, m.role ? h('span', { className: 'sub' }, m.role) : null),
                  h('td', null, m.route ?? '—', m.note ? h('span', { className: 'sub' }, m.note) : null),
                  h('td', null, h('span', { className: 'dsh-sw-chip', 'data-k': chipKind(m.state) }, t('state.' + m.state)), m.error ? h('span', { className: 'sub' }, m.error) : null),
                  run.strategy === 'debate' ? h('td', { className: 'num' }, m.round || '—') : null,
                  h('td', { className: 'num' }, m.state === 'skipped' ? '—' : nf(m.tokens)),
                  h('td', { className: 'num' }, m.startedAt ? span((m.endedAt ?? now) - m.startedAt) : '—'),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function Swarms({ t, data }) {
      if (data.swarms.length === 0) return h('p', { className: 'dsh-sw-note' }, t('swarms.empty'));
      return h(
        React.Fragment,
        null,
        data.swarms.map((swarm) =>
          h(
            'div',
            { key: swarm.name, className: 'dsh-sw-swarm' },
            h('header', null, h('b', null, swarm.name), h('span', { className: 'dsh-sw-chip' }, t('strategy.' + swarm.strategy))),
            swarm.description ? h('p', { className: 'dsh-sw-note' }, swarm.description) : null,
            h(
              'div',
              { className: 'dsh-sw-facts' },
              h('span', null, fill(t('members'), { n: swarm.members.length })),
              h('span', null, fill(t('cap'), { n: swarm.maxActive })),
              h('span', null, fill(t('minutes'), { n: swarm.maxMinutes })),
              swarm.strategy === 'debate' ? h('span', null, fill(t('rounds'), { n: swarm.rounds })) : null,
              swarm.budget.tokens > 0 ? h('span', null, fill(t('tokens'), { n: nf(swarm.budget.tokens) })) : null,
              swarm.budget.usd > 0 ? h('span', null, '$' + money(swarm.budget.usd)) : null,
            ),
            h(
              'ul',
              { className: 'dsh-sw-members' },
              swarm.members.map((m) =>
                h(
                  'li',
                  { key: m.id },
                  h('span', { className: 'm' }, m.id),
                  h('span', { className: 'w' }, [m.route ?? (m.role ? fill(t('role'), { role: m.role }) : t('route.parent')), m.tier ? fill(t('tier'), { tier: m.tier }) : '', m.instructions].filter(Boolean).join(' · ')),
                ),
              ),
            ),
          ),
        ),
        h('p', { className: 'dsh-sw-note' }, fill(t('down'), { policy: data.onRouteDown })),
      );
    }

    function SwarmPage({ appCtx }) {
      const t = appCtx.locale.bind('agentSwarm');
      const [state, setState] = useState({ status: 'loading', data: null, at: 0 });
      const [selected, setSelected] = useState('');

      const load = useCallback(async () => {
        try {
          const data = await get('dsh-agent-swarm/state');
          setState({ status: 'ready', data, at: Date.now() });
          setSelected((prev) => (prev && data.runs.some((run) => run.id === prev) ? prev : data.runs[0]?.id ?? ''));
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
        }
      }, []);

      const anyRunning = !!state.data && state.data.runs.some((run) => run.status === 'running');

      useEffect(() => {
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, anyRunning ? POLL_FAST : POLL_SLOW);
        return () => clearInterval(timer);
      }, [load, anyRunning]);

      let body;
      if (state.status === 'loading') body = h('p', { className: 'dsh-sw-note' }, t('loading'));
      else if (state.status === 'error') body = h('p', { className: 'dsh-sw-note', 'data-bad': 'true' }, t('failed'));
      else {
        const data = state.data;
        const run = data.runs.find((item) => item.id === selected);
        body = h(
          React.Fragment,
          null,
          h(
            'section',
            { className: 'dsh-sw-card' },
            h('h3', null, t('runs.title')),
            data.runs.length === 0
              ? h('p', { className: 'dsh-sw-note' }, fill(t('runs.empty'), { tool: data.toolName }))
              : h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'dsh-sw-list' },
                    data.runs.map((item) =>
                      h(
                        'button',
                        { key: item.id, type: 'button', className: 'dsh-sw-row', 'aria-pressed': item.id === selected, onClick: () => setSelected(item.id) },
                        h('span', { className: 't' }, item.swarm),
                        h('span', { className: 'dsh-sw-chip', 'data-k': chipKind(item.status) }, t('status.' + item.status)),
                        h('span', { className: 'd' }, fill(t('tokens'), { n: nf(item.tokens) })),
                        h('span', { className: 'd' }, new Date(item.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })),
                      ),
                    ),
                  ),
                  run ? h(RunDetail, { t, run, now: data.at, pricing: data.pricing }) : h('p', { className: 'dsh-sw-note' }, t('gone')),
                ),
          ),
          h('section', { className: 'dsh-sw-card' }, h('h3', null, t('swarms.title')), h(Swarms, { t, data })),
        );
      }

      return h(
        'div',
        { className: 'dsh-sw-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-sw-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-sw-bar' },
          h('span', { className: 'dsh-sw-spacer' }),
          state.at ? h('span', { className: 'dsh-sw-stamp' }, fill(t('updated'), { time: new Date(state.at).toLocaleTimeString() })) : null,
          h('button', { type: 'button', className: 'dsh-sw-btn', onClick: () => void load() }, t('refresh')),
        ),
        body,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('agentSwarm', DICT));
        const t = ctx.locale.bind('agentSwarm');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'agent-swarm', order: 28, label: () => t('section.title') },
              (props) => h(SwarmPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
