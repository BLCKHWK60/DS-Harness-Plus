// ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips); the same block in every page file that uses it.
// The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
// All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
// React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
const dshUi = (() => {
  const STYLE_ID = 'dsh-ui-style';
  const CSS = `
.dshu-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dshu-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dshu-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dshu-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dshu-group { margin: 24px 0 8px; font-size: 12px; line-height: 18px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dshu-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dshu-rowtext { flex: 1; min-width: 0; }
.dshu-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dshu-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dshu-side { flex: none; display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
@media (max-width: 560px) { .dshu-row { flex-wrap: wrap; } .dshu-side { margin-left: auto; } }
.dshu-btn { flex: none; height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.dshu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dshu-btn:disabled { opacity: .5; cursor: default; }
.dshu-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dshu-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshu-field { flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dshu-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dshu-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dshu-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); }
.dshu-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dshu-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dshu-switch[data-danger="true"][aria-checked="true"] { background: var(--dsw-alias-state-error-primary); }
.dshu-switch:disabled { opacity: .5; cursor: default; }
@media (prefers-reduced-motion: no-preference) { .dshu-switch { transition: background .12s ease; } .dshu-switch::after { transition: transform .12s ease; } }
.dshu-btn:focus-visible, .dshu-switch:focus-visible, .dshu-chip:focus-visible, .dshu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshu-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 16px 0 0; padding: 16px; border-radius: 20px; border: 0.5px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dshu-empty-title { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dshu-empty-text { margin: 0; overflow-wrap: anywhere; }
.dshu-empty .dshu-chips { margin-top: 8px; }
.dshu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dshu-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dshu-chip:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dshu-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
.dshu-wait { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshu-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
  const ensureStyle = () => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  };

  /** Copies text and says so. Resolves true when it worked. */
  const copyText = async (text) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(String(text)); return true; }
    } catch { /* fall through to the old way */ }
    try {
      const area = document.createElement('textarea');
      area.value = String(text);
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done === true;
    } catch { return false; }
  };

  const makeParts = (React) => {
    ensureStyle();
    const h = React.createElement;
    /** The page frame: a title, one sentence under it, then the page. */
    const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
      title ? h('h2', { className: 'dshu-title' }, title) : null,
      desc ? h('p', { className: 'dshu-desc' }, desc) : null,
      children);
    const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
    /** A short line in the page's description style; `error` draws it in the error colour. */
    const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
    /** One setting: text on the left, the control(s) on the right. */
    const Row = ({ title, desc, children }) => h('div', { className: 'dshu-row' },
      h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
      children);
    const Side = ({ children }) => h('div', { className: 'dshu-side' }, children);
    /** `danger`: when it is on, the switch is drawn in the error colour (a safety rule that has been turned off). */
    const Switch = ({ on, label, onChange, disabled, danger }) => h('button', {
      type: 'button', role: 'switch', className: 'dshu-switch', 'data-danger': danger ? 'true' : undefined, 'aria-checked': on === true, 'aria-label': label, disabled: disabled === true, onClick: () => onChange(!on),
    });
    const Button = ({ main, danger, children, ...rest }) => h('button', { type: 'button', className: 'dshu-btn', 'data-main': main ? 'true' : undefined, 'data-danger': danger ? 'true' : undefined, ...rest }, children);
    const Field = (props) => h('input', { className: 'dshu-field', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', ...props });
    /** A button that copies `text` and shows "Copied" for a moment (a timer only while it is showing). */
    const CopyButton = ({ text, label = 'Copy', ...rest }) => {
      const [done, setDone] = React.useState(false);
      const timer = React.useRef(0);
      React.useEffect(() => () => clearTimeout(timer.current), []);
      return h(Button, { ...rest, 'aria-live': 'polite', onClick: async () => {
        if (await copyText(typeof text === 'function' ? text() : text)) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1500); }
      } }, done ? 'Copied' : label);
    };
    /** A row of small choices (starter chips). `items` are strings or { label, value }; `onPick(value)`. */
    const Chips = ({ items, onPick, label }) => h('div', { className: 'dshu-chips', role: 'group', 'aria-label': label ?? 'Suggestions' },
      items.map((item) => { const entry = typeof item === 'string' ? { label: item, value: item } : item; return h('button', { key: entry.label, type: 'button', className: 'dshu-chip', onClick: () => onPick(entry.value ?? entry.label) }, entry.label); }));
    /** What a list shows when it has nothing yet: what it is for, then what to do first (optionally as starter chips). */
    const Empty = ({ title, text, chips, onPick, children }) => h('div', { className: 'dshu-empty', role: 'status' },
      title ? h('p', { className: 'dshu-empty-title' }, title) : null,
      text ? h('p', { className: 'dshu-empty-text' }, text) : null,
      chips && chips.length > 0 ? h(Chips, { items: chips, onPick: onPick ?? (() => {}) }) : null,
      children);
    const Wait = ({ children }) => h('p', { className: 'dshu-wait', role: 'status' }, children ?? 'Loading…');
    return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait };
  };
  return { makeParts, ensureStyle, copyText };
})();
// ---- dsh-ui:end ----
