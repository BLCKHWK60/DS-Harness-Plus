/**
 * Recon, browser half: the Settings > Recon page, with the switch for the Recon tab and a plain
 * account of what the isolation does and does not do.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-recon',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'recon';
    const DICT = { en: { 'section.title': 'Recon' }, zh: { 'section.title': '侦察' } };

    const CSS = `
.dsh-rc-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-rc-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-rc-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rc-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-rc-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-rc-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rc-rowtext { flex: 1; min-width: 0; }
.dsh-rc-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-rc-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-rc-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-rc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-rc-btn:disabled { opacity: .5; cursor: default; }
.dsh-rc-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-rc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-rc-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-rc-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-rc-input { margin-top: 8px; width: 100%; max-width: 360px; height: 30px; padding: 0 10px; box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-rc-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-rc-sql { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
`;

    async function call(body) {
      const response = await fetch(new URL('dsh-recon/state', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }

    async function revision(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return view.revision;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    function ReconPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const alive = useRef(true);
      const [host, setHost] = useState('');
      const hostSeen = useRef(false);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); }
        } catch (problem) {
          if (alive.current) setError(String(problem?.message ?? problem));
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      // The server field starts with what is saved, once.
      const savedHost = data?.usenet?.host;
      useEffect(() => {
        if (savedHost === undefined || hostSeen.current) return;
        hostSeen.current = true;
        setHost(savedHost);
      }, [savedHost]);

      // While a test of Tor runs, look again every second. Before the first return, so the hook order never changes.
      const testing = data?.tor?.test?.state === 'running';
      useEffect(() => {
        if (!testing) return undefined;
        const timer = setInterval(() => void load(), 1000);
        return () => clearInterval(timer);
      }, [testing, load]);

      if (!data) {
        return h('div', { className: 'dsh-rc-page' }, h('style', null, CSS), h('h2', { className: 'dsh-rc-title' }, 'Recon'), h('p', { className: 'dsh-rc-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const flip = async (on) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { enabled: on });
          if (!alive.current) return;
          setData((d) => ({ ...d, enabled: on }));
          setNote({ text: on ? 'Switched on. The Recon tab appears in the sidebar in a moment.' : 'Switched off. The Recon tab is taken away in a moment. Recon conversations you already had stay locked: they have no tools.', error: false });
          setTimeout(() => void load(), 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not change it: ${String(problem?.message ?? problem)}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const tor = data.tor ?? {};
      const usenet = data.usenet ?? {};
      const save = async (values, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (alive.current) setNote({ text: done, error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${String(problem?.message ?? problem)}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const testTor = async () => {
        try {
          const next = await call({ action: 'tor-test' });
          if (alive.current) setData(next);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not test Tor: ${String(problem?.message ?? problem)}`, error: true });
        }
      };
      const item = (text) => h('li', null, text);
      return h('div', { className: 'dsh-rc-page' }, h('style', null, CSS),
        h('h2', { className: 'dsh-rc-title' }, 'Recon'),
        h('p', { className: 'dsh-rc-desc' }, 'An isolated tab for research on .onion sites and Usenet text newsgroups. It searches and reads .onion sites through Tor and text newsgroups through your news server, as text only.'),
        data.problem ? h('p', { className: 'dsh-rc-desc', 'data-error': 'true' }, data.problem) : null,
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Show the Recon tab'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Adds a Recon tab beside Chat, Cowork and Code. Conversations started there are isolated for good.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(data.enabled), 'aria-label': 'Show the Recon tab', disabled: busy, onClick: () => void flip(!data.enabled) })),
        note.text ? h('p', { className: 'dsh-rc-desc', 'data-error': String(note.error) }, note.text) : null,

        h('div', { className: 'dsh-rc-group' }, 'Connection'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Tor'),
            h('div', { className: 'dsh-rc-rowdesc' }, tor.path
              ? `Found: ${tor.path}${tor.version ? ` (version ${tor.version})` : ''}. Recon starts its own copy when it needs one and deletes its temporary folder when it stops.`
              : 'The tor program is not installed. Plus does not install it. In the Terminal: brew install tor'),
            tor.test?.text ? h('div', { className: 'dsh-rc-rowdesc', 'data-error': String(tor.test.state === 'failed') }, tor.test.state === 'running' ? `Connecting… ${tor.percent || 0}%` : tor.test.text) : null),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: !data.enabled || !tor.path || tor.test?.state === 'running', title: 'Connects this Mac to the Tor network, opens no site, then stops', onClick: () => void testTor() }, tor.test?.state === 'running' ? 'Testing…' : 'Test Tor')),
        h('p', { className: 'dsh-rc-desc' }, 'The test connects this Mac to the Tor network and opens no site. Your internet provider can see that Tor was used. Usenet and WireGuard are later steps.'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Blocklist of banned sites'),
            h('div', { className: 'dsh-rc-rowdesc' }, data.blocklist?.size > 0
              ? `${data.blocklist.size.toLocaleString('en-US')} banned sites, fetched ${new Date(data.blocklist.at).toLocaleString()}. Fetched again through Tor when it is older than a day.`
              : 'Not fetched yet. It is fetched through Tor before the first search or page. Without it nothing is searched or read.'))),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Search engine'),
            h('div', { className: 'dsh-rc-rowdesc' }, data.engine?.other && data.engine?.host
              ? `Another engine is set in the configuration file: ${data.engine.host}. The blocklist and the word screen still apply.`
              : `The built-in filtered index (Ahmia), at its .onion address: ${data.engine?.builtIn ?? ''}. It filters abuse material from its index. Another engine can be set in the configuration file (otherEngine, engineHost).`))),

        h('div', { className: 'dsh-rc-group' }, 'Usenet'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Connect to Usenet'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Off: Usenet is not reached at all. On: an encrypted connection straight to your news server. The server sees your internet address and knows your account, as with any newsreader. Tor is not used for Usenet.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(usenet.route === 'direct'), 'aria-label': 'Connect to Usenet', disabled: busy || !data.enabled, onClick: () => void save({ usenetRoute: usenet.route === 'direct' ? 'off' : 'direct' }, usenet.route === 'direct' ? 'Usenet is off.' : 'Usenet is on, through a direct encrypted connection.') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'News server'),
            h('div', { className: 'dsh-rc-rowdesc' }, `The server name your Usenet provider gives you, for encrypted connections (port ${usenet.port ?? 563}).`),
            h('input', { className: 'dsh-rc-input', type: 'text', value: host, placeholder: 'news.example.com', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'News server', onChange: (event) => setHost(event.target.value) })),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || host.trim() === (usenet.host ?? ''), onClick: () => void save({ usenetHost: host.trim().toLowerCase() }, 'Saved.') }, 'Save')),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, usenet.hasLogin ? 'Login: stored in the Keychain' : 'Login: not stored yet'),
            h('div', { className: 'dsh-rc-rowdesc' }, 'Your login is kept in the macOS Keychain and nowhere else. Recon reads it only to sign in; it is never shown, saved in a file or given to the model. To store it, type this in the Terminal with your user name in place of YOUR_USERNAME. It asks for the password, which stays hidden:'),
            h('div', { className: 'dsh-rc-sql' }, usenet.storeCommand ?? ''),
            h('div', { className: 'dsh-rc-rowdesc' }, 'To remove it:'),
            h('div', { className: 'dsh-rc-sql' }, usenet.removeCommand ?? ''))),

        h('div', { className: 'dsh-rc-group' }, 'Export, and End and wipe'),
        h('ul', { className: 'dsh-rc-list' },
          item(`/recon export writes one text file with the research log, every source with its citation and text, and the assistant's notes. Everything from sources and from the assistant is quoted and marked as untrusted, so it cannot act as instructions if you give the file to another tab. Exports go to: ${data.exportFolder ?? ''}`),
          item('/recon end ends a conversation for good: what it read is forgotten, Tor is stopped and its folder deleted, the conversation is closed and its files are deleted. They do not go to the trash. An open conversation is held by the app, so its files go as soon as the app lets go, at the latest at the next start.'),
          item(data.waitingToWipe > 0 ? `Waiting to be deleted: ${data.waitingToWipe} ended conversation${data.waitingToWipe === 1 ? '' : 's'}.` : 'No ended conversation is waiting to be deleted.'),
          item('Export first if you want to keep anything: what Recon reads is held in memory only, and is gone when the app is closed.'),
          item(`Every Recon conversation runs in Recon's own empty folder (${data.room ?? ''}), not in a folder of yours, so the model is told no path of yours. Start one with the New button in the Recon tab. A Recon conversation in another folder has its tools switched off.`)),

        h('div', { className: 'dsh-rc-group' }, 'What a Recon conversation has'),
        h('ul', { className: 'dsh-rc-list' },
          item(`Only these tools: ${(data.tools ?? []).join(', ')}.`),
          item('No programs, no shell, no files, no memory, no skills, no helpers, no web search and no Deep research.'),
          item('No project instructions, no AGENTS.md, no notes from other add-ons.'),
          item('It can never be switched to another tab\'s mode, and a conversation of another tab can never become a Recon conversation.'),
          item('If Recon is switched off, its old conversations stay locked with no tools at all.')),

        h('div', { className: 'dsh-rc-group' }, 'Searching and reading'),
        h('ul', { className: 'dsh-rc-list' },
          item('Text only. A page is asked for by itself: its pictures, scripts and styles are never requested, no cookies are kept, nothing is posted, nothing is logged in to.'),
          item('Only .onion addresses, and only ones that came from a search result, from a page already read, or from your own message.'),
          item('Filters: the filtered index, its blocklist of banned sites, and a word screen on searches, results, addresses and pages. A match is left out: not shown, not kept, not tried again. Only the count is reported. No filter is perfect.'),
          item('Every source gets a number like [S3], with its address, the time it was retrieved and a fingerprint of its text. Ask the assistant to cite a source, or type /recon log for every search and source.'),
          item('What was read is kept in memory until the app is closed, and in the conversation itself. /recon stop stops Tor.')),

        h('div', { className: 'dsh-rc-group' }, 'Models'),
        h('ul', { className: 'dsh-rc-list' },
          item('A model on this Mac or in your own network gets what Recon finds without a question.'),
          item('Any other model counts as cloud. Recon then hands over nothing until you type /recon cloud in that conversation. The agreement holds for that conversation and that model, and is forgotten when the app is closed.'),
          item('Your own questions go to whichever model you picked, as in every tab.'),
          item('Type /recon in a Recon conversation to see its model and what is allowed.')),

        h('div', { className: 'dsh-rc-group' }, 'Good to know'),
        h('ul', { className: 'dsh-rc-list' },
          item('Until you end it with /recon end, the app keeps a Recon conversation on disk like any other, and writes its title with the model set for titles.'),
          item('Plugins from other makers are not covered by the isolation. Plus\'s own add-ons are.'),
          item('Usenet: text newsgroups only. Groups that hold files are never listed or opened, file postings are skipped, and an article that carries a file is refused before its text is fetched. Usenet has no full-text search: subject, author and date are matched.'),
          item('Not built yet: WireGuard and saved searches.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'recon', order: 26, label: () => t('section.title') }, (props) => h(ReconPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
