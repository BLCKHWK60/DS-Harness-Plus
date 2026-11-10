/**
 * Browser half of Model arena: a read-only "Arena" page in Settings that lays a round's answers
 * side by side, one column per label (A, B, C, D).
 *
 * The page keeps the arena blind: until you reveal a round it shows only the label, the redacted
 * answer text, a generic failure word, the judge's result in labels and your pick. Model names,
 * providers, latency and token counts appear only for a round you have revealed (`/arena reveal`).
 * While a round is still being asked it shows only how many answers are in, not which, because
 * live text or finish order would show which model is fastest.
 *
 * It reads the fenced `GET dsh-model-arena/rounds` and `GET dsh-model-arena/round?id=` routes
 * (same origin, login cookie). It cannot ask, judge, pick or reveal: use /arena for those.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-model-arena',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const DICT = {
      en: {
        'section.title': 'Arena',
        'panel.title': 'Model Arena',
        'head.hint': 'One prompt, several models, side by side. Answers stay blind (labels only) until you reveal the round. Ask with /arena ask <prompt>, then /arena judge, /arena pick <label> and /arena reveal in a chat. This page only shows rounds and cannot change anything.',
        'info.candidates': '{n} candidates configured',
        'info.judge': 'Judge set',
        'info.nojudge': 'No judge set',
        'rounds.title': 'Rounds',
        'rounds.empty': 'No rounds yet. Start one with /arena ask <prompt>.',
        'rounds.none': 'The arena has no candidates configured, so there is nothing to show.',
        'chip.judged': 'judged',
        'chip.picked': 'picked',
        'chip.revealed': 'revealed',
        'chip.blind': 'blind',
        'chip.running': 'running',
        'running': '{done} of {total} answers in. Which ones stays hidden so the test stays blind.',
        'refresh': 'Refresh',
        'updated': 'Updated {time}',
        'prompt': 'Prompt',
        'answer': 'Answer {label}',
        'no.answer': 'No answer: {reason}',
        'judge.win': 'Judge: Answer {label} wins{both}.',
        'judge.both': ', in both rounds',
        'judge.tie': 'Judge: tie.',
        'judge.split': 'Judge: tie (the two rounds disagreed, so the judge was split).',
        'judge.family': 'The judge shares a provider or model with at least one contestant, so it may favour its own family.',
        'judge.none': 'Not judged yet. Use /arena judge {id}.',
        'pick.yours': 'Your pick',
        'pick.judge': "Judge's pick",
        'pick.none': 'No pick yet. Use /arena pick <label> {id}.',
        'agree': 'You and the judge agree.',
        'disagree': 'You and the judge disagree.',
        'reveal.hint': 'Names, latency and tokens stay hidden until you reveal: /arena reveal {id}.',
        'score': 'score {n}',
        'ms': '{n} ms',
        'tokens': '{a} in / {b} out',
        'failed': 'Could not read the arena. Is the Model arena plugin loaded in this profile?',
        'loading': 'Loading arena…',
        'gone': 'This round is no longer available.',
      },
      zh: {
        'section.title': '竞技场',
        'panel.title': '模型竞技场',
        'head.hint': '同一个提示词，多个模型并排作答。在你揭晓这一轮之前，回答保持盲评（只显示标签）。在聊天中用 /arena ask <提示词> 提问，再用 /arena judge、/arena pick <标签> 和 /arena reveal。本页只显示各轮结果，不能修改任何内容。',
        'info.candidates': '已配置 {n} 个候选',
        'info.judge': '已设置评审',
        'info.nojudge': '未设置评审',
        'rounds.title': '各轮',
        'rounds.empty': '还没有轮次。用 /arena ask <提示词> 开始一轮。',
        'rounds.none': '竞技场没有配置候选模型，因此没有可显示的内容。',
        'chip.judged': '已评审',
        'chip.picked': '已选择',
        'chip.revealed': '已揭晓',
        'chip.blind': '盲评',
        'chip.running': '进行中',
        'running': '已收到 {done} / {total} 个回答。具体是哪几个会保持隐藏，以保证盲评。',
        'refresh': '刷新',
        'updated': '更新于 {time}',
        'prompt': '提示词',
        'answer': '回答 {label}',
        'no.answer': '无回答：{reason}',
        'judge.win': '评审：回答 {label} 获胜{both}。',
        'judge.both': '，两轮均如此',
        'judge.tie': '评审：平局。',
        'judge.split': '评审：平局（两轮结果不一致，因此评审意见分歧）。',
        'judge.family': '评审与至少一个参赛者使用相同的提供方或模型，可能偏向自己所属的家族。',
        'judge.none': '尚未评审。用 /arena judge {id}。',
        'pick.yours': '你的选择',
        'pick.judge': '评审的选择',
        'pick.none': '尚未选择。用 /arena pick <标签> {id}。',
        'agree': '你和评审意见一致。',
        'disagree': '你和评审意见不一致。',
        'reveal.hint': '揭晓之前，名称、延迟和 token 数保持隐藏：/arena reveal {id}。',
        'score': '得分 {n}',
        'ms': '{n} ms',
        'tokens': '输入 {a} / 输出 {b}',
        'failed': '无法读取竞技场。此配置是否加载了模型竞技场插件？',
        'loading': '正在加载竞技场…',
        'gone': '这一轮已不可用。',
      },
    };

    const CSS = `
.dsh-ar-page { display: flex; flex-direction: column; gap: 16px; padding: 2px 0 36px; }
.dsh-ar-head h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-ar-head p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
.dsh-ar-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-ar-spacer { flex: 1; }
.dsh-ar-stamp { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-ar-btn { height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-ar-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-ar-btn:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
.dsh-ar-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.dsh-ar-card > h3 { margin: 0; font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ar-note { margin: 0; font-size: 12px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
.dsh-ar-note[data-bad="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ar-list { display: flex; flex-direction: column; }
.dsh-ar-row { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-top: 1px solid var(--dsw-alias-border-l1); cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-primary); border-radius: 6px; }
.dsh-ar-row:first-child { border-top: 0; }
.dsh-ar-row:hover, .dsh-ar-row[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); }
.dsh-ar-row:focus-visible { outline: 2px solid var(--dsw-alias-label-secondary); outline-offset: -2px; }
.dsh-ar-row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-ar-row .d { color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; }
.dsh-ar-chip { padding: 0 6px; border: 1px solid currentColor; border-radius: 6px; font-size: 10px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dsh-ar-chip[data-k="judged"], .dsh-ar-chip[data-k="picked"] { color: var(--dsw-alias-state-info-primary, var(--dsw-alias-label-primary)); }
.dsh-ar-chip[data-k="revealed"] { color: var(--dsw-alias-state-success-primary); }
.dsh-ar-prompt { margin: 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-ar-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; align-items: start; }
.dsh-ar-col { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; display: flex; flex-direction: column; min-width: 0; }
.dsh-ar-col[data-win="true"] { border-color: var(--dsw-alias-state-success-primary); }
.dsh-ar-col header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dsh-ar-col header b { font-size: 13px; color: var(--dsw-alias-label-primary); }
.dsh-ar-col header .n { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ar-tag { padding: 0 6px; border: 1px solid currentColor; border-radius: 6px; font-size: 10px; color: var(--dsw-alias-state-success-primary); white-space: nowrap; }
.dsh-ar-tag[data-k="you"] { color: var(--dsw-alias-state-info-primary, var(--dsw-alias-label-primary)); }
.dsh-ar-text { margin: 0; padding: 10px; max-height: 380px; overflow: auto; font: inherit; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.dsh-ar-text[data-err="true"] { color: var(--dsw-alias-label-secondary); font-style: italic; }
.dsh-ar-foot { padding: 6px 10px 8px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.dsh-ar-sum { display: flex; flex-direction: column; gap: 4px; }
`;

    const POLL_SLOW = 10000;
    const POLL_FAST = 2000;

    const get = async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    };
    const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.split('{' + key + '}').join(String(value)), text);

    function Columns({ t, round }) {
      const names = new Map((round.names ?? []).map((item) => [item.label, item]));
      const winner = round.judge?.winner ?? null;
      const judgeLine = !round.judge
        ? fill(t('judge.none'), { id: round.id })
        : round.judge.winner
          ? fill(t('judge.win'), { label: round.judge.winner, both: round.judge.rounds > 1 ? t('judge.both') : '' })
          : round.judge.consistent
            ? t('judge.tie')
            : t('judge.split');
      return h(
        React.Fragment,
        null,
        h('div', { className: 'dsh-ar-sum' }, h('p', { className: 'dsh-ar-note' }, judgeLine), round.judge?.sameFamily ? h('p', { className: 'dsh-ar-note' }, t('judge.family')) : null, !round.pick ? h('p', { className: 'dsh-ar-note' }, fill(t('pick.none'), { id: round.id })) : null),
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
                winner === slot.label ? h('span', { className: 'dsh-ar-tag' }, t('pick.judge')) : null,
                round.pick === slot.label ? h('span', { className: 'dsh-ar-tag', 'data-k': 'you' }, t('pick.yours')) : null,
              ),
              slot.error ? h('p', { className: 'dsh-ar-text', 'data-err': 'true' }, fill(t('no.answer'), { reason: slot.error })) : h('pre', { className: 'dsh-ar-text', tabIndex: 0 }, slot.text),
              (typeof score === 'number' || (round.revealed && name && !slot.error))
                ? h(
                    'div',
                    { className: 'dsh-ar-foot' },
                    typeof score === 'number' ? h('span', null, fill(t('score'), { n: score })) : null,
                    round.revealed && name && !slot.error ? h('span', null, fill(t('ms'), { n: name.latencyMs })) : null,
                    round.revealed && name && !slot.error ? h('span', null, fill(t('tokens'), { a: name.input, b: name.output })) : null,
                  )
                : null,
            );
          }),
        ),
        round.revealed
          ? round.judge?.winner && round.pick
            ? h('p', { className: 'dsh-ar-note' }, round.judge.winner === round.pick ? t('agree') : t('disagree'))
            : null
          : h('p', { className: 'dsh-ar-note' }, fill(t('reveal.hint'), { id: round.id })),
      );
    }

    function ArenaPage({ appCtx }) {
      const t = appCtx.locale.bind('modelArena');
      const [list, setList] = useState({ status: 'loading', data: null, at: 0 });
      const [selected, setSelected] = useState('');
      const [detail, setDetail] = useState(null);
      const current = useRef('');

      const loadList = useCallback(async () => {
        try {
          const data = await get('dsh-model-arena/rounds');
          setList({ status: 'ready', data, at: Date.now() });
          setSelected((prev) => {
            const all = [...data.running.map((item) => item.id), ...data.rounds.map((item) => item.id)];
            return prev && all.includes(prev) ? prev : all[0] ?? '';
          });
        } catch {
          setList((prev) => (prev.data ? prev : { status: 'error', data: null, at: 0 }));
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
        void loadDetail(selected);
        // A running round turns into a saved one; keep looking until it does.
        if (!selectedRunning) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void loadDetail(selected); }, POLL_FAST);
        return () => clearInterval(timer);
      }, [selected, selectedRunning, loadDetail]);

      let body;
      if (list.status === 'loading') body = h('p', { className: 'dsh-ar-note' }, t('loading'));
      else if (list.status === 'error') body = h('p', { className: 'dsh-ar-note', 'data-bad': 'true' }, t('failed'));
      else {
        const data = list.data;
        const rows = [
          ...data.running.map((item) => ({ id: item.id, prompt: item.prompt, createdAt: item.createdAt, running: true })),
          ...data.rounds.map((item) => ({ ...item, running: false })),
        ];
        body = h(
          React.Fragment,
          null,
          h('p', { className: 'dsh-ar-note' }, fill(t('info.candidates'), { n: data.candidates }) + ' · ' + (data.judge ? t('info.judge') : t('info.nojudge'))),
          h(
            'section',
            { className: 'dsh-ar-card' },
            h('h3', null, t('rounds.title')),
            data.candidates === 0 && rows.length === 0
              ? h('p', { className: 'dsh-ar-note' }, t('rounds.none'))
              : rows.length === 0
                ? h('p', { className: 'dsh-ar-note' }, t('rounds.empty'))
                : h(
                    'div',
                    { className: 'dsh-ar-list' },
                    rows.map((row) =>
                      h(
                        'button',
                        { key: row.id, type: 'button', className: 'dsh-ar-row', 'aria-pressed': row.id === selected, onClick: () => setSelected(row.id) },
                        h('span', { className: 't' }, row.prompt),
                        row.running ? h('span', { className: 'dsh-ar-chip' }, t('chip.running')) : null,
                        !row.running && !row.revealed ? h('span', { className: 'dsh-ar-chip' }, t('chip.blind')) : null,
                        row.judged ? h('span', { className: 'dsh-ar-chip', 'data-k': 'judged' }, t('chip.judged')) : null,
                        row.picked ? h('span', { className: 'dsh-ar-chip', 'data-k': 'picked' }, t('chip.picked')) : null,
                        row.revealed ? h('span', { className: 'dsh-ar-chip', 'data-k': 'revealed' }, t('chip.revealed')) : null,
                        h('span', { className: 'd' }, new Date(row.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })),
                      ),
                    ),
                  ),
          ),
          detail && detail.id === selected
            ? h(
                'section',
                { className: 'dsh-ar-card' },
                h('h3', null, t('prompt')),
                h('p', { className: 'dsh-ar-prompt' }, detail.round?.prompt ?? detail.running?.prompt ?? ''),
                detail.gone
                  ? h('p', { className: 'dsh-ar-note' }, t('gone'))
                  : detail.running
                    ? h('p', { className: 'dsh-ar-note', role: 'status' }, fill(t('running'), { done: detail.running.answered, total: detail.running.total }))
                    : h(Columns, { t, round: detail.round }),
              )
            : null,
        );
      }

      return h(
        'div',
        { className: 'dsh-ar-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dsh-ar-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h(
          'div',
          { className: 'dsh-ar-bar' },
          h('span', { className: 'dsh-ar-spacer' }),
          list.at ? h('span', { className: 'dsh-ar-stamp' }, fill(t('updated'), { time: new Date(list.at).toLocaleTimeString() })) : null,
          h('button', { type: 'button', className: 'dsh-ar-btn', onClick: () => { void loadList(); void loadDetail(selected); } }, t('refresh')),
        ),
        body,
      );
    }

    /** Sidebar row icon: two crossed lines (the arena's blind side-by-side), drawn like the app's icons. */
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
      inject: ['slots', 'locale'],
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
