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
.dsh-rc-account { padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-rc-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.dsh-rc-fields .dsh-rc-input { flex: 1 1 150px; max-width: 240px; margin-top: 0; }
.dsh-rc-fields .dsh-rc-port { flex: 0 0 84px; }
.dsh-rc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.dsh-rc-tag { margin-left: 8px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 500; vertical-align: 1px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
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

    /** A news server's name, as a Usenet provider gives it. */
    const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
    /** As many accounts as the add-on takes. */
    const MAX = 8;
    /** @returns {number | undefined} the port, when what was typed is one. Nothing typed is 563. */
    const portOf = (typed) => {
      const text = String(typed ?? '').trim();
      if (text === '') return 563;
      const port = Math.trunc(Number(text));
      return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : undefined;
    };
    /** An id for a new account: short, and the Keychain item it names stays readable. */
    const newId = () => {
      const bytes = new Uint8Array(6);
      try {
        window.crypto.getRandomValues(bytes);
      } catch {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      }
      return `a${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
    };
    /** The accounts as the configuration takes them: only the four fields it knows. */
    const stored = (accounts) => (Array.isArray(accounts) ? accounts : []).map((one) => ({ id: String(one.id ?? ''), label: String(one.label ?? ''), host: String(one.host ?? ''), port: Number(one.port) || 563 }));

    /** One Usenet account: what it is called, which server it is, and where its login stands. */
    function AccountRow({ account, busy, isDefault, onSave, onDefault, onRemove }) {
      const [label, setLabel] = useState(account.label ?? '');
      const [host, setHost] = useState(account.host ?? '');
      const [port, setPort] = useState(String(account.port ?? 563));
      const saved = JSON.stringify([account.label ?? '', account.host ?? '', account.port ?? 563]);
      const seen = useRef(saved);
      useEffect(() => {
        if (seen.current === saved) return;
        seen.current = saved;
        setLabel(account.label ?? '');
        setHost(account.host ?? '');
        setPort(String(account.port ?? 563));
      }, [saved, account.label, account.host, account.port]);
      const name = label.trim().slice(0, 40);
      const server = host.trim().toLowerCase();
      const portNumber = portOf(port);
      const changed = name !== (account.label ?? '') || server !== (account.host ?? '') || portNumber !== (account.port ?? 563);
      const usable = HOST.test(server) && portNumber !== undefined;
      return h('div', { className: 'dsh-rc-account' },
        h('div', { className: 'dsh-rc-rowtitle' }, name || account.host || 'This account has no server yet', isDefault ? h('span', { className: 'dsh-rc-tag' }, 'default') : null),
        h('div', { className: 'dsh-rc-rowdesc' }, account.hasLogin
          ? 'Login stored in the Keychain. Recon reads it only to sign in; it is never shown, saved in a file or given to the model.'
          : 'No login stored in the Keychain yet. Recon can sign in to this account only once you have stored it.'),
        h('div', { className: 'dsh-rc-fields' },
          h('input', { className: 'dsh-rc-input', type: 'text', value: label, placeholder: 'Name (optional)', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'Account name', onChange: (event) => setLabel(event.target.value) }),
          h('input', { className: 'dsh-rc-input', type: 'text', value: host, placeholder: 'news.example.com', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'News server', onChange: (event) => setHost(event.target.value) }),
          h('input', { className: 'dsh-rc-input dsh-rc-port', type: 'text', value: port, inputMode: 'numeric', placeholder: '563', spellCheck: false, 'aria-label': 'Port', onChange: (event) => setPort(event.target.value) })),
        h('div', { className: 'dsh-rc-actions' },
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || !changed || !usable, title: usable ? 'Save this account' : 'A server name like news.example.com, and a port from 1 to 65535', onClick: () => onSave({ id: account.id, label: name, host: server, port: portNumber }) }, 'Save'),
          isDefault ? null : h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, title: 'Use this account when a request names none', onClick: onDefault }, 'Make default'),
          h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy, title: 'Take this account out of Settings. Its login stays in the Keychain.', onClick: onRemove }, 'Remove')),
        account.hasLogin
          ? h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To remove this account\'s login from the Keychain, type this in the Terminal:'), h('div', { className: 'dsh-rc-sql' }, account.removeCommand ?? ''))
          : h('div', null, h('div', { className: 'dsh-rc-rowdesc' }, 'To store this account\'s login, type this in the Terminal with your user name in place of YOUR_USERNAME. It asks for the password, which stays hidden:'), h('div', { className: 'dsh-rc-sql' }, account.storeCommand ?? '')));
    }

    function ReconPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const alive = useRef(true);
      const [add, setAdd] = useState({ label: '', host: '', port: '' });
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
      const more = data.more ?? {};
      const accounts = usenet.accounts ?? [];
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
      /** Save the accounts, and make sure the one server of older versions does not come back. */
      const saveAccounts = (next, done, more) => void save({ usenetAccounts: stored(next), usenetHost: '', ...(more ?? {}) }, done);
      const removeAccount = (account) => saveAccounts(
        accounts.filter((one) => one.id !== account.id),
        `Removed ${account.label || account.host}. Its login stays in the Keychain; to delete it, type this in the Terminal: ${account.removeCommand ?? ''}`,
        // The default account must not point at one that is gone.
        account.id === usenet.defaultAccount ? { usenetDefaultAccount: '' } : {},
      );
      const makeDefault = (account) => void save({ usenetDefaultAccount: account.id }, `${account.label || account.host} is the default account.`);
      const addPort = portOf(add.port);
      const addOk = HOST.test(add.host.trim().toLowerCase()) && addPort !== undefined && accounts.length < MAX;
      const addAccount = () => {
        const id = newId();
        const name = add.label.trim().slice(0, 40);
        const server = add.host.trim().toLowerCase();
        const values = { usenetAccounts: stored([...accounts, { id, label: name, host: server, port: addPort }]), usenetHost: '' };
        // The first account is the default one until the user picks another.
        if (!usenet.defaultAccount) values.usenetDefaultAccount = id;
        setAdd({ label: '', host: '', port: '' });
        void save(values, `Added ${name || server}. Store its login in the Keychain as shown, then it is ready.`);
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
        h('p', { className: 'dsh-rc-desc' }, 'An isolated tab for research on .onion sites and Usenet text newsgroups. It searches and reads .onion sites through Tor and text newsgroups through your Usenet accounts, as text only.'),
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
        h('p', { className: 'dsh-rc-desc' }, 'The test connects this Mac to the Tor network and opens no site. Your internet provider can see that Tor was used. WireGuard is a later step.'),
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
            h('div', { className: 'dsh-rc-rowdesc' }, 'Off: Usenet is not reached at all. On: an encrypted connection straight to the news server of the account a request names. That server sees your internet address and knows that account, as with any newsreader. Tor is not used for Usenet.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(usenet.route === 'direct'), 'aria-label': 'Connect to Usenet', disabled: busy || !data.enabled, onClick: () => void save({ usenetRoute: usenet.route === 'direct' ? 'off' : 'direct' }, usenet.route === 'direct' ? 'Usenet is off.' : 'Usenet is on, through a direct encrypted connection.') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, accounts.length === 1 ? 'Usenet account' : 'Usenet accounts'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Each account is a news server with its own login in the Keychain. A search or a read names the account to use; one that names none uses the default account, or the first. Up to ${MAX}.`))),
        accounts.map((account) => h(AccountRow, {
          key: account.id,
          account,
          busy,
          isDefault: account.id === (usenet.defaultAccount || accounts[0]?.id),
          onSave: (next) => saveAccounts(accounts.map((one) => (one.id === next.id ? next : one)), 'Saved.'),
          onDefault: () => makeDefault(account),
          onRemove: () => removeAccount(account),
        })),
        accounts.length < MAX
          ? h('div', { className: 'dsh-rc-row' },
            h('div', { className: 'dsh-rc-rowtext' },
              h('div', { className: 'dsh-rc-rowtitle' }, 'Add another account'),
              h('div', { className: 'dsh-rc-rowdesc' }, 'The server name your provider gives you, for encrypted connections. Each account needs its own login in the Keychain.'),
              h('div', { className: 'dsh-rc-fields' },
                h('input', { className: 'dsh-rc-input', type: 'text', value: add.label, placeholder: 'Name (optional)', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'New account name', onChange: (event) => setAdd({ ...add, label: event.target.value }) }),
                h('input', { className: 'dsh-rc-input', type: 'text', value: add.host, placeholder: 'news.example.com', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'aria-label': 'New news server', onChange: (event) => setAdd({ ...add, host: event.target.value }) }),
                h('input', { className: 'dsh-rc-input dsh-rc-port', type: 'text', value: add.port, inputMode: 'numeric', placeholder: '563', spellCheck: false, 'aria-label': 'New port', onChange: (event) => setAdd({ ...add, port: event.target.value }) }))),
            h('button', { type: 'button', className: 'dsh-rc-btn', disabled: busy || !addOk, onClick: addAccount }, 'Add'))
          : null,

        h('div', { className: 'dsh-rc-group' }, 'More sources'),
        h('p', { className: 'dsh-rc-desc' }, 'Two services on the normal web. Recon reaches them only through its own Tor and only at their own addresses, as text. Both limit automated use, and more so through Tor: expect "asked to slow down" or "refused" now and then. Recon does not try another way.'),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'Internet Archive'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Dated copies of web pages (${more.archiveHost ?? ''}). The assistant can list the copies of a page and read one as text. This is the only way a page from the normal web is read in Recon. The Archive sees the request come from Tor, and which page was asked for.`)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.archive === true), 'aria-label': 'Internet Archive', disabled: busy || !data.enabled, onClick: () => void save({ archiveOn: more.archive !== true }, more.archive === true ? 'The Internet Archive is off.' : 'The Internet Archive is on.') })),
        h('div', { className: 'dsh-rc-row' },
          h('div', { className: 'dsh-rc-rowtext' },
            h('div', { className: 'dsh-rc-rowtitle' }, 'GDELT news index'),
            h('div', { className: 'dsh-rc-rowdesc' }, `Where a topic was reported, worldwide (${more.newsHost ?? ''}). It gives titles, addresses, publishers and dates, not the articles; an article is read as an Internet Archive copy. GDELT allows one request every five seconds, and sees your search words come from Tor.`)),
          h('button', { type: 'button', role: 'switch', className: 'dsh-rc-switch', 'aria-checked': String(more.news === true), 'aria-label': 'GDELT news index', disabled: busy || !data.enabled, onClick: () => void save({ newsOn: more.news !== true }, more.news === true ? 'GDELT is off.' : 'GDELT is on.') })),

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
          item('A conversation that already holds what Recon found takes no step on a cloud model you did not agree to, also after switching models, in a Rerun copy, or once its history was condensed. The step stops with a message; nothing is sent. Condensing a long conversation itself sends the history to the model the app uses for condensing, which Recon does not check: use a local one for it.'),
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
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'recon', order: 114, label: () => t('section.title') }, (props) => h(ReconPage, { ...props, appCtx: ctx }))),
        );
      },
    };
  },
});
