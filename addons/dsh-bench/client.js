/**
 * Bench, browser half: the Settings > Bench page, with the switch for the Bench tab, the Bench folder,
 * the devices that have a card, and what Bench does and does not do. The work is in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bench',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'bench';
    const DICT = { en: { 'section.title': 'Bench' }, zh: { 'section.title': '工作台' } };
    const LEVELS = { identify: 'Identify', read: 'Read', adjust: 'Adjust', write: 'Write' };
    const ASKS = { restricted: 'Restricted', 'ask-auto': 'Ask-Auto', 'full-auto': 'Full Auto' };
    const when = (at) => (at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

    const CSS = `
.dsh-bn-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-bn-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-bn-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-bn-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bn-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-bn-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-bn-rowtext { flex: 1; min-width: 0; }
.dsh-bn-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-bn-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-bn-btn {
  flex: none; height: 30px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-bn-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-bn-btn:disabled { opacity: .5; cursor: default; }
.dsh-bn-input {
  width: 100%; box-sizing: border-box; height: 30px; margin-top: 8px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px;
  font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-bn-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-bn-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-bn-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-bn-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-bn-switch:disabled { opacity: .5; cursor: default; }
.dsh-bn-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-perms { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-select { height: 26px; margin-left: 4px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-bn-rowdesc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bn-rules { margin: 6px 0 0; display: flex; flex-direction: column; gap: 8px; }
.dsh-bn-rule { display: flex; gap: 10px; align-items: flex-start; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-rule b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dsh-bn-tag { flex: none; min-width: 52px; text-align: center; padding: 0 6px; border-radius: 6px; font-size: 11px; line-height: 18px; font-weight: 600; }
.dsh-bn-tag[data-open="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.dsh-bn-tag[data-open="false"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
/* "Bench rules" in the chat box, like the app's own buttons there. */
.dsh-bn-ctl { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; }
.dsh-bn-ctl:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-bn-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: 360px; max-width: calc(100vw - 24px); padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-bn-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-bn-pop .note { margin-top: 10px; color: var(--dsw-alias-label-secondary); }
`;

    /** What is open and closed in Bench, as a list with a tag on each line. */
    function RuleList({ rules }) {
      return h('div', { className: 'dsh-bn-rules' }, (Array.isArray(rules) ? rules : []).map((rule) => h('div', { key: rule.what, className: 'dsh-bn-rule' },
        h('span', { className: 'dsh-bn-tag', 'data-open': String(rule.open === true) }, rule.open ? 'Open' : 'Closed'),
        h('span', null, h('b', null, rule.what), ` · ${rule.why}`))));
    }

    /** "Bench rules" in the chat box of a Bench conversation: what is open and closed there, at a click. */
    function BenchRules({ sessionId }) {
      const [view, setView] = useState(null);
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        let alive = true;
        let timer;
        const tick = async () => {
          try {
            const response = await fetch(new URL(`dsh-bench/data${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
            if (response.ok && alive) setView(await response.json());
          } catch {
            /* tried again shortly */
          }
          if (alive) timer = setTimeout(tick, document.hidden ? 15000 : 5000);
        };
        void tick();
        return () => { alive = false; clearTimeout(timer); };
      }, [sessionId]);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 372)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!view || view.enabled !== true || !view.session?.inBench) return null;
      const rules = Array.isArray(view.closed) ? view.closed : [];
      const shut = rules.filter((rule) => !rule.open).length;
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-bn-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `Bench rules: ${shut} closed, ${rules.length - shut} open`, onClick: () => setOpen(!open) },
          h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' })),
          h('span', null, 'Bench rules')),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-bn-pop', role: 'dialog', 'aria-label': 'Bench rules', style: { left: place.left, bottom: place.bottom, maxHeight: typeof place.bottom === 'number' ? `calc(100vh - ${place.bottom + 12}px)` : 'calc(100vh - 24px)', overflowY: 'auto' } },
                h('style', null, CSS),
                h('div', { className: 'title' }, 'What Bench keeps open and closed'),
                h(RuleList, { rules }),
                h('div', { className: 'note' }, 'When something you ask for is closed, the assistant says so. Long run checks can be switched in Settings → Bench; the other lines are fixed in this version.')),
              document.body,
            )
          : null);
    }


    async function call(body) {
      const response = await fetch(new URL('dsh-bench/data', document.baseURI), {
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

    /** One device on the page, with the user's own settings for it (never set by the model). */
    function DeviceRow({ device, busy, onSave, onUnlink }) {
      const [level, setLevel] = useState(device.level);
      const [asks, setAsks] = useState(device.asks);
      const [dryRun, setDryRun] = useState(device.dryRun === true);
      const [ranges, setRanges] = useState(device.ranges ?? '');
      const changed = level !== device.level || asks !== device.asks || dryRun !== (device.dryRun === true) || ranges !== (device.ranges ?? '');
      const select = (value, options, set, label) => h('select', { className: 'dsh-bn-select', value, 'aria-label': `${label} for ${device.name}`, disabled: busy, onChange: (event) => set(event.target.value) },
        Object.entries(options).map(([id, text]) => h('option', { key: id, value: id }, text)));
      return h('div', { className: 'dsh-bn-row' },
        h('div', { className: 'dsh-bn-rowtext' },
          h('div', { className: 'dsh-bn-rowtitle' }, device.name),
          h('div', { className: 'dsh-bn-rowdesc' }, [[device.maker, device.model].filter(Boolean).join(' '), device.connects, `${device.entries} logbook ${device.entries === 1 ? 'entry' : 'entries'}`, device.backups ? `${device.backups} backup${device.backups === 1 ? '' : 's'}` : '', device.undo ? `${device.undo} change${device.undo === 1 ? '' : 's'} on the undo list` : '', device.portAgreed ? 'serial port: agreed' : '', device.updated ? `changed ${when(device.updated)}` : ''].filter(Boolean).join(' · ')),
          h('div', { className: 'dsh-bn-rowdesc' }, `Linked to: ${device.linked || 'no device yet'}`),
          device.lookOnly ? h('div', { className: 'dsh-bn-rowdesc', 'data-error': 'true' }, `Look-only (${device.lookOnly}): Bench reads it and never changes it, whatever is set here.${device.lookOnlyMarked && !device.lookOnlyFromWords ? ' Its card no longer names it so, but the mark stays until you lift it.' : ''}`) : null,
          h('div', { className: 'dsh-bn-perms' },
            h('label', null, 'Highest level ', select(level, LEVELS, setLevel, 'Highest level')),
            h('label', null, 'How it asks ', select(asks, ASKS, setAsks, 'How it asks')),
            h('label', null, h('input', { type: 'checkbox', checked: dryRun, disabled: busy, onChange: (event) => setDryRun(event.target.checked) }), ' Dry run by default')),
          h('input', { className: 'dsh-bn-input', type: 'text', spellCheck: false, placeholder: 'Your own protected parts, e.g. 0x9000-0xF000 (the start of an ESP32\'s flash is always protected)', value: ranges, 'aria-label': `Protected parts for ${device.name}`, disabled: busy, onChange: (event) => setRanges(event.target.value) })),
        h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !changed, onClick: () => onSave({ name: device.name, level, asks, dryRun, ranges }) }, 'Save'),
        device.isLinked ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, title: 'For the same device on a new cable or adapter, or a card that should move to another device. Bench asks you again at the next use.', onClick: () => onUnlink(device.name) }, 'Unlink') : null,
        device.lookOnlyMarked && !device.lookOnlyFromWords ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, title: 'Only when this device is not one of the look-only families after all.', onClick: () => onSave({ name: device.name, level: device.level, asks: device.asks, dryRun: device.dryRun === true, ranges: device.ranges ?? '', clearLookOnly: true }) }, 'Lift look-only') : null);
    }

    /** Where a network device is and how Bench signs in: set only here. The password goes straight to the Keychain. */
    function NetSettings({ device, busy, run }) {
      const net = device.net ?? {};
      const [address, setAddress] = useState(net.address ?? '');
      const [port, setPort] = useState(String(net.port ?? 22));
      const [user, setUser] = useState(net.user ?? '');
      const [signIn, setSignIn] = useState(net.signIn ?? 'key');
      const [password, setPassword] = useState('');
      const changed = address !== (net.address ?? '') || port !== String(net.port ?? 22) || user !== (net.user ?? '') || signIn !== (net.signIn ?? 'key');
      const field = (value, set, label, placeholder, width) => h('input', { className: 'dsh-bn-input', style: { width, marginTop: 0 }, type: 'text', spellCheck: false, autoComplete: 'off', value, placeholder, 'aria-label': `${label} for ${device.name}`, disabled: busy, onChange: (event) => set(event.target.value) });
      return h('div', { className: 'dsh-bn-row' },
        h('div', { className: 'dsh-bn-rowtext' },
          h('div', { className: 'dsh-bn-rowtitle' }, `${device.name} on your network`),
          h('div', { className: 'dsh-bn-rowdesc' }, 'Its address (a private address such as 192.168.8.1, or a name ending in .local), the SSH port, the user you sign in with, and how: Bench\'s SSH key, or a password kept in the Mac\'s Keychain. Bench goes there only while the Mac is on a network you marked below.'),
          h('div', { className: 'dsh-bn-perms' },
            field(address, setAddress, 'Address', '192.168.8.1', '160px'),
            field(port, setPort, 'Port', '22', '60px'),
            field(user, setUser, 'User', 'root', '120px'),
            h('select', { className: 'dsh-bn-select', value: signIn, 'aria-label': `Sign-in for ${device.name}`, disabled: busy, onChange: (event) => setSignIn(event.target.value) }, h('option', { value: 'key' }, 'SSH key'), h('option', { value: 'password' }, 'Password (Keychain)'))),
          signIn === 'password' ? h('div', { className: 'dsh-bn-perms' },
            h('input', { className: 'dsh-bn-input', style: { width: '220px', marginTop: 0 }, type: 'password', autoComplete: 'new-password', value: password, placeholder: 'Password for this device', 'aria-label': `Password for ${device.name}`, disabled: busy, onChange: (event) => setPassword(event.target.value) }),
            h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !password || !net.address, title: net.address ? 'Kept in the Mac\'s Keychain; never shown, never in a file or a message.' : 'Save the address first.', onClick: () => { const value = password; setPassword(''); void run(async () => { await call({ action: 'password', name: device.name, password: value }); }, `The password for ${device.name} is in the Keychain.`); } }, 'Save password'),
            h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'forgetPassword', name: device.name }); }, `The password for ${device.name} is removed from the Keychain.`) }, 'Forget password')) : null),
        h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !changed, onClick: () => run(async () => { await call({ action: 'net', name: device.name, address: address.trim(), port: Number(port), user: user.trim(), signIn }); }, `Saved where ${device.name} is.`) }, 'Save'));
    }

    /** A short list the user keeps here (networks, sources): each line with Remove, and inputs to add one. */
    function ListEditor({ items, busy, fields, addLabel, onAdd, onRemove, empty, allowEmpty = false }) {
      const [values, setValues] = useState({});
      return h('div', null,
        items.length === 0 ? h('p', { className: 'dsh-bn-desc' }, empty) : null,
        items.map((item) => h('div', { key: item.key, className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' }, h('div', { className: 'dsh-bn-rowtitle' }, item.title), item.desc ? h('div', { className: 'dsh-bn-rowdesc' }, item.desc) : null),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => onRemove(item.key) }, 'Remove'))),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' }, h('div', { className: 'dsh-bn-perms' }, fields.map((field) => (field.options
            ? h('select', { key: field.id, className: 'dsh-bn-select', value: values[field.id] ?? field.options[0][0], 'aria-label': field.label, disabled: busy, onChange: (event) => setValues({ ...values, [field.id]: event.target.value }) }, field.options.map(([id, text]) => h('option', { key: id, value: id }, text)))
            : h('input', { key: field.id, className: 'dsh-bn-input', style: { width: field.width, marginTop: 0 }, type: 'text', spellCheck: false, autoComplete: 'off', value: values[field.id] ?? '', placeholder: field.placeholder, 'aria-label': field.label, disabled: busy, onChange: (event) => setValues({ ...values, [field.id]: event.target.value }) }))))),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || (!allowEmpty && fields.filter((field) => !field.options).every((field) => !(values[field.id] ?? '').trim())), onClick: () => { const next = { ...Object.fromEntries(fields.filter((field) => field.options).map((field) => [field.id, field.options[0][0]])), ...values }; setValues({}); onAdd(next); } }, addLabel)));
    }

    function BenchPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [draft, setDraft] = useState(null);
      const alive = useRef(true);
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

      if (!data) {
        return h('div', { className: 'dsh-bn-page' }, h('style', null, CSS), h('h2', { className: 'dsh-bn-title' }, 'Bench'), h('p', { className: 'dsh-bn-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const run = async (work, done) => {
        setBusy(true);
        try {
          await work();
          if (alive.current && done) setNote({ text: done, error: false });
          setTimeout(() => { if (alive.current) void load(); }, 800);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const flip = (on) => run(async () => {
        await setSettings(appCtx, { enabled: on });
        if (alive.current) setData((d) => ({ ...d, enabled: on }));
      }, on ? 'Switched on. The Bench tab appears in the sidebar in a moment.' : 'Switched off. The Bench tab is taken away in a moment. Cards and logbooks stay in the Bench folder.');
      const saveFolder = () => {
        const value = String(draft ?? '').trim();
        if (value && !value.startsWith('/')) {
          setNote({ text: 'Give the folder as a full path, starting with / (for example /Users/you/Documents/Bench).', error: true });
          return;
        }
        void run(async () => {
          await setSettings(appCtx, { folder: value });
          if (alive.current) setDraft(null);
        }, value ? 'Saved. New cards and logbooks go there. Cards already made stay where they were: move them yourself if you like.' : 'Saved. Bench uses its own folder again.');
      };
      const reveal = () => run(async () => { await call({ action: 'reveal' }); });
      const devices = Array.isArray(data.devices) ? data.devices : [];

      return h('div', { className: 'dsh-bn-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-bn-title' }, 'Bench'),
        h('p', { className: 'dsh-bn-desc' }, 'A tab, beside Chat, Cowork and Code, for the devices you connect to this Mac: maker boards such as an ESP32 or an Arduino, phones, routers and other gadgets. It finds out what a device is, finds the maker\'s documentation, and keeps a card and a logbook for each device.'),
        note.text ? h('p', { className: 'dsh-bn-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,
        data.problem ? h('p', { className: 'dsh-bn-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-bn-group' }, 'The tab'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Show the Bench tab'),
            h('div', { className: 'dsh-bn-rowdesc' }, 'On adds the tab, its instructions and its tools. Off takes them away (a port being watched is closed). Cards and logbooks stay in the Bench folder.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-bn-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Show the Bench tab', disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dsh-bn-group' }, 'The Bench folder'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, data.folder || 'Not set'),
            h('div', { className: 'dsh-bn-rowdesc' }, `Each device gets a folder here with its card (card.md) and its logbook (logbook.md). ${data.ownFolder ? 'This is Bench\'s own folder in the app\'s data folder.' : 'This is the folder you set.'} To use another, give its full path and press Save; leave it empty for Bench's own. For the network door the path must not contain %, $ or " (ssh would read them as part of a command).`),
            h('input', { className: 'dsh-bn-input', type: 'text', spellCheck: false, placeholder: data.folder || '/Users/you/Documents/Bench', value: draft ?? '', 'aria-label': 'Bench folder', onChange: (event) => setDraft(event.target.value) })),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || draft === null, onClick: saveFolder }, 'Save'),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !data.folder, onClick: () => void reveal() }, 'Show in Finder')),

        h('div', { className: 'dsh-bn-group' }, 'Long runs'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Check the work of a Long run'),
            h('div', { className: 'dsh-bn-rowdesc' }, data.longChecks !== false
              ? 'On: after each step the run proves its work with a small check, as in every tab. In Bench those checks run with the Mac\'s device ports closed, so a check cannot open a board\'s port (opening one restarts some boards). A check that tries says so in the run\'s report.'
              : 'Off: Bench\'s Long runs run no checks. The reviewer judges each step by reading the files, as in a Recon run. Nothing reaches a device either way.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-bn-switch', 'aria-checked': data.longChecks !== false, 'aria-label': 'Check the work of a Long run', disabled: busy, onClick: () => void run(async () => {
            await setSettings(appCtx, { longChecks: data.longChecks === false });
            if (alive.current) setData((d) => ({ ...d, longChecks: d.longChecks === false }));
          }, data.longChecks === false ? 'Long run checks are on again. New Long runs in Bench check their work.' : 'Long run checks are off. New Long runs in Bench check nothing by themselves.') })),

        h('div', { className: 'dsh-bn-group' }, 'Open and closed in Bench'),
        h('p', { className: 'dsh-bn-desc' }, 'The same list shows under "Bench rules" in the chat box of a Bench conversation, and a Long run\'s card says which applies when it starts.'),
        h(RuleList, { rules: data.closed }),

        h('div', { className: 'dsh-bn-group' }, `Devices with a card (${devices.length})`),
        devices.length === 0 ? h('p', { className: 'dsh-bn-desc' }, 'None yet. Plug a device in, open the Bench tab and ask "what is plugged in?"') : null,
        devices.length > 0 ? h('p', { className: 'dsh-bn-desc' }, 'Only you set these, never the assistant. A new card starts at Read and Ask-Auto. Restricted: Identify and Read only. Ask-Auto: each change asks you. Full Auto: changes on that device without asking, each one logged. A firmware write asks you every time, whatever is set. Dry run by default: each change is shown first and done only when asked again. Each card is linked to one device the first time it is used; Unlink when the device moves to a new cable or adapter.') : null,
        devices.map((device) => h(DeviceRow, { key: `${device.name}-${device.updated}`, device, busy, onSave: (values) => run(async () => { await call({ action: 'permissions', ...values }); }, `Saved for ${values.name}.`), onUnlink: (name) => run(async () => { await call({ action: 'unlink', name }); }, `${name} is unlinked. Bench asks you again the next time it is used.`) })),
        devices.filter((device) => /network/.test(String(device.connects ?? '')) || device.net).map((device) => h(NetSettings, { key: `net-${device.name}-${device.updated}`, device, busy, run })),

        h('div', { className: 'dsh-bn-group' }, 'Your networks'),
        h('p', { className: 'dsh-bn-desc' }, 'Bench looks at and signs in to network devices only while the Mac is on a network you mark here. Mark it while the Mac is on it: Bench records its address range (yours, or the one you give) and the hardware address of its router. macOS may hide the Wi-Fi name from apps, and many networks share a range (every GL.iNet router starts with 192.168.8.0/24), so the range plus the router\'s hardware address is what counts; the Wi-Fi name is only a label. On a hotel\'s network, even one with the same name or range, Bench does nothing.'),
        h(ListEditor, { busy, allowEmpty: true, empty: 'No network is marked yet.', addLabel: 'Mark this network as mine', items: (data.networks ?? []).map((entry) => ({ key: entry.label, title: entry.label, desc: [entry.ssid ? `Wi-Fi "${entry.ssid}"` : '', entry.cidr ? `range ${entry.cidr}` : '', entry.gatewayMac ? `router ${entry.gatewayMac}` : 'no router recorded: mark it again'].filter(Boolean).join(' · ') })), fields: [{ id: 'label', label: 'Name', placeholder: 'Home', width: '120px' }, { id: 'ssid', label: 'Wi-Fi name (a label)', placeholder: 'Wi-Fi name', width: '160px' }, { id: 'cidr', label: 'Address range', placeholder: 'the Mac\'s own range', width: '150px' }], onAdd: (values) => run(async () => { await call({ action: 'network', label: values.label ?? '', ssid: values.ssid ?? '', cidr: values.cidr ?? '' }); }, 'Network marked as yours.'), onRemove: (label) => run(async () => { await call({ action: 'network', remove: label }); }, `${label} is no longer marked.`) }),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Bench\'s SSH key'),
            h('div', { className: 'dsh-bn-rowdesc' }, data.publicKey ? 'Add this public half to a device once (for a GL.iNet router: its admin page → Advanced (LuCI) → System → Administration → SSH-Keys; for Windows: administrators_authorized_keys). The private half never leaves this Mac.' : 'Not made yet. Bench makes one on this Mac; you add its public half to a device once.'),
            data.publicKey ? h('input', { className: 'dsh-bn-input', type: 'text', readOnly: true, value: data.publicKey, 'aria-label': 'Bench\'s public SSH key', onFocus: (event) => event.target.select() }) : null),
          data.publicKey ? null : h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'key' }); }, 'Bench\'s SSH key is made.') }, 'Make the key')),

        h('div', { className: 'dsh-bn-group' }, 'Firmware sources you added'),
        h('p', { className: 'dsh-bn-desc' }, 'Besides the makers and official projects Bench knows (Espressif, GL.iNet, Google\'s factory images, ESPHome, Tasmota, MicroPython, WLED and others), firmware may come from the sites you add here. Bench still reads the file\'s checksum on that site itself. Each source is for one kind of device, so a router or a phone is never written from another kind\'s source. A GitHub source is one project\'s releases page (github.com/<org>/<project>/releases/). Only you add a source, never the assistant.'),
        h(ListEditor, { busy, empty: 'None added.', addLabel: 'Add source', items: (data.sources ?? []).map((entry) => ({ key: `${entry.host}${entry.path}`, title: `https://${entry.host}${entry.path}`, desc: entry.kind === 'router' ? 'for routers' : entry.kind === 'phone' ? 'for phones' : entry.kind === 'esp32' ? 'for ESP32 boards' : 'for no kind of device: add it again' })), fields: [{ id: 'url', label: 'Source address', placeholder: 'https://firmware.example.com/releases/', width: '320px' }, { id: 'kind', label: 'For which devices', options: [['esp32', 'ESP32 boards'], ['router', 'Routers'], ['phone', 'Phones']] }], onAdd: (values) => run(async () => { await call({ action: 'source', url: values.url ?? '', kind: values.kind ?? 'esp32' }); }, 'Source added.'), onRemove: (key) => run(async () => { await call({ action: 'source', remove: key }); }, 'Source removed.') }),

        (data.recipes ?? []).length > 0 ? h('div', { className: 'dsh-bn-group' }, 'Recipe drafts') : null,
        (data.recipes ?? []).length > 0 ? h('p', { className: 'dsh-bn-desc' }, 'For devices that are not in the catalogue, Bench drafts a recipe at the Read level from the maker\'s pages. It is used only after you approve it; Adjust and Write are never taken from a draft. The draft file is in the Bench folder\'s recipes/drafts.') : null,
        (data.recipes ?? []).map((draft) => h('div', { key: draft.id, className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, `${draft.title} (${draft.status})`),
            h('div', { className: 'dsh-bn-rowdesc' }, `For ${draft.device}. Reads: ${(draft.read ?? []).join('; ')}. Sources: ${(draft.sources ?? []).map((source) => `${source.url}${source.official ? '' : ' (explains only)'}`).join(', ') || 'none'}`)),
          draft.status === 'draft' ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'recipe', id: draft.id, approve: true }); }, `${draft.title} is approved at the Read level.`) }, 'Approve') : null,
          draft.status === 'draft' ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'recipe', id: draft.id, approve: false }); }, `${draft.title} is declined.`) }, 'Decline') : null)),

        h('div', { className: 'dsh-bn-group' }, 'How to use it'),
        h('ul', { className: 'dsh-bn-list' },
          h('li', null, 'Plug the device in with a cable that carries data, open the Bench tab and ask what it is. Bench reads the Mac\'s own list of USB devices and serial ports, and of paired Bluetooth devices.'),
          h('li', null, 'Watching a board: ask Bench to watch its serial port for some minutes (up to an hour per call; a Long run keeps calling for longer). Every line goes into the device\'s log. Opening a port restarts many boards, so Bench asks you once per device first. It only reads; nothing is sent.'),
          h('li', null, 'An ESP32: Bench reads its chip, MAC and flash size, and makes a backup of the whole flash, read twice and compared. To flash firmware: set the device to Write below, put the file from the maker\'s or the project\'s page in the device\'s firmware folder, and give Bench that page\'s address. Bench reads the page itself and finds the file\'s checksum there. It asks you every time.'),
          h('li', null, 'Your router (a GL.iNet such as the Slate 7, or OpenWrt) and your Windows server: mark your network and set the device\'s address, user and sign-in above, then ask Bench to trust its key. It reads them, keeps a router\'s configuration backup on this Mac, changes a short list of settings with undo, and writes router firmware from GL.iNet\'s download centre by sysupgrade (never its loader or radio calibration). On the server it changes a service only when you name it, after a restore point.'),
          h('li', null, 'Bluetooth: besides the Mac\'s list, Bench can scan for nearby devices and read the battery and device information of one you name. The first time it builds a small reader on this Mac (Apple\'s Command Line Tools needed) and macOS asks you to allow Bluetooth. It never changes a device over Bluetooth.'),
          h('li', null, 'An Android phone (USB debugging on): its details, battery, log and settings. The first time, Bench asks you to link the card to that phone. Only a short list of settings can be changed (brightness, screen timeout, text size, sounds, rotation, animation speed, automatic time), only on a phone you set to Adjust; the old value is saved and "undo last" puts it back exactly. Network, debugging, lock and accessibility settings are never touched. Unlocking its bootloader (which ERASES the phone) needs the phone set to Write, a counted backup of its storage, your own message "unlock <device name>" and your yes; then Bench can write the maker\'s factory image.'),
          h('li', null, 'Tools Bench uses, which you install yourself if you want them: esptool (`brew install esptool` or `pipx install esptool`) and adb (`brew install android-platform-tools`). Bench never installs anything.'),
          h('li', null, 'Bench names the chip and the boards it usually sits on, and with Web on looks up the maker\'s manual, datasheet and pinout. It says how sure it is.'),
          h('li', null, 'Say "make a card for it" and give the device a name. The card holds what it is, how it connects, where its manual and firmware are, and how it is brought back if an update fails. Every action is added to the device\'s logbook.'),
          h('li', null, 'Web, Depth, Long run and the Run button work as in every tab. A Long run suits a long look into a device\'s documentation.')),

        h('div', { className: 'dsh-bn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-bn-list' },
          h('li', null, 'A firmware write happens only when all four hold: a checked backup of that chip taken since its last write, the recovery path on its card, firmware from the maker or the official project whose checksum Bench finds published there itself, and your yes on the app\'s own question, every time. After your yes Bench checks again that the file, the chip and the Mac\'s power are as they were. Writing the start of an ESP32\'s flash (its loader, partition table and stored settings) also needs your own message "write protected <device name>". The eFuses, which can never go back, are never touched. After a write Bench reads it back and watches the board start; on a failure it stops and shows the way back, and never tries again by itself.'),
          h('li', null, 'Backups and logs stay on this Mac, in the device\'s folder. Backups are never shown to a model; log lines are, with passwords and keys masked.'),
          h('li', null, 'Only one action at a time on a device or a port.'),
          h('li', null, 'A Bench conversation runs Read Only and has no terminal: Bench refuses every command, program and background job in its conversations and their helpers, and every tool not on its own list, also during a Long run, whose "Files and commands" switch otherwise gives every tool. A Long run\'s own checks are run by Mission, with the Mac\'s device ports closed to them (switch them off under Long runs above). Bench\'s own tools write only cards and logbooks, only into the Bench folder, and no file tool may read or write there or a device\'s port.'),
          h('li', null, 'Start Bench conversations in Standard mode. Under the app\'s PTC preset every tool is called from inside a program, and Bench refuses programs.'),
          h('li', null, 'Only your own devices. A device\'s name, a log line or its admin page is text someone else wrote: the assistant is told never to follow it.'),
          h('li', null, 'Passwords and keys are kept out of cards and logbooks: a named one (password, psk, token, WIFI_PASS and the like) and anything that looks like a key is masked before it is written. Web addresses stay readable. This catches the usual forms, not every one.'),
          h('li', null, 'A new card starts at the level Read with Ask-Auto. Only you change that, above, for each device.'),
          h('li', null, 'Look-only where safety is at stake: vehicles and e-bikes, medical devices, batteries and chargers, locks, alarms, smoke detectors, heating. A card whose words name one of these is marked look-only and stays so, even if its words change later; only you lift the mark, above. The assistant is also told never to change speed limits or radio limits (transmit power, region, frequency); Bench has no tool that sets them.'),
          h('li', null, 'A device Bench has no recipe for: it drafts one at the Read level from the maker\'s pages, and you approve it above. Adjust and Write for it are not built.'),
          h('li', null, 'With Ultra Code on in the chat box, a checker (the conversation\'s own model, with no tools) reads each write plan before you are asked; its verdict is on the question. Only one write runs at a time, on one device.'),
          h('li', null, 'Not built: changing a Bluetooth device, updating a BIOS (the maker\'s own tool does that), relocking a phone.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'bench', order: 116, label: () => t('section.title') }, (props) => h(BenchPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'bench-rules', order: -18, label: () => 'Bench rules' }, (props) => h(BenchRules, { sessionId: props?.sessionId }))));
      },
    };
  },
});
