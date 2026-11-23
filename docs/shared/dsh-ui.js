// ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips, (i) pop-up, state line, error note); the same block in every page file that uses it.
// The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
// All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
// React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
// Pass ReactDOM too (`dshUi.makeParts(React, ReactDOM)`) where an (i) needs `portal: true` (its pop-up then goes to the page body).
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
.dshu-infowrap { display: inline-flex; vertical-align: middle; margin-left: 4px; }
.dshu-info { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dshu-info:hover, .dshu-info[aria-expanded="true"] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dshu-info svg { display: block; width: 12px; height: 12px; }
.dshu-info:focus-visible, .dshu-pop:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshu-pop { position: fixed; z-index: 2147482000; box-sizing: border-box; width: max-content; max-width: min(320px, calc(100vw - 16px)); overflow: auto; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font-size: 12px; line-height: 18px; font-weight: 400; text-align: left; text-transform: none; white-space: normal; overflow-wrap: anywhere; cursor: auto; }
.dshu-pop:focus:not(:focus-visible) { outline: none; }
.dshu-pop-title { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 600; }
.dshu-pop-line { margin: 6px 0 0; }
.dshu-pop-title + .dshu-pop-line { margin-top: 0; }
.dshu-pop-head { display: block; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dshu-state { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
.dshu-state-dot { flex: none; align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.dshu-state[data-state="ok"] .dshu-state-dot { background: var(--dsw-alias-state-success-primary); }
.dshu-state[data-state="busy"] .dshu-state-dot { background: var(--dsw-alias-brand-primary); }
.dshu-state[data-state="warn"] .dshu-state-dot { background: var(--dsw-alias-state-warn-primary); }
.dshu-state[data-state="error"] .dshu-state-dot { background: var(--dsw-alias-state-error-primary); }
.dshu-state[data-state="off"] .dshu-state-dot { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-label-secondary); }
.dshu-state-next { color: var(--dsw-alias-label-secondary); }
.dshu-errnote { margin: 8px 0 0; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.dshu-errnote-what { margin: 0; color: var(--dsw-alias-state-error-primary); }
.dshu-errnote-fix { margin: 2px 0 0; color: var(--dsw-alias-label-primary); }
.dshu-errnote-act { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
.dshu-errnote-act .dshu-link { font-size: 12px; }
.dshu-errnote-details { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-secondary); font: 11px/16px ui-monospace, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; user-select: text; }
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

  /** The three fixed heads of an (i) pop-up, in this order. `changes` is accepted as another name for `change`. */
  const INFO_HEADS = [['what', 'What it does'], ['when', 'When to use it'], ['change', 'If you change it']];
  /** The same heads, and the button's "About". Plus is English only: every page gets these words. */
  const INFO_WORDS = {
    en: { what: 'What it does', when: 'When to use it', change: 'If you change it', about: (name) => (name ? `About ${name}` : 'About this') },
  };
  /** @returns {object} the (i)'s fixed words. `lang` is still accepted (older callers pass it) but every language gets English. */
  const infoWords = () => INFO_WORDS.en;
  /** What an (i) pop-up shows: the title and only the lines that were given. `lang` is accepted and ignored (English only). */
  const infoLines = ({ title, label, what, when, change, changes } = {}) => {
    const given = { what, when, change: change ?? changes };
    const words = infoWords();
    const blank = (v) => v == null || v === false || (typeof v === 'string' && v.trim() === '');
    return {
      title: blank(title) ? (blank(label) ? '' : label) : title,
      lines: INFO_HEADS.filter(([key]) => !blank(given[key])).map(([key]) => ({ key, head: words[key], text: given[key] })),
    };
  };

  /**
   * Where a pop-up goes: below its button, or above when there is more room there; its left edge follows the button
   * and is pulled in so the whole panel stays on screen. Sizes in pixels; returns { top, left, side, maxHeight }.
   */
  const placePop = ({ anchor, pop, view, gap = 6, margin = 8 }) => {
    const below = view.height - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const side = pop.height <= below || below >= above ? 'below' : 'above';
    const maxHeight = Math.max(80, Math.floor(side === 'below' ? below : above));
    const height = Math.min(pop.height, maxHeight);
    const top = side === 'below' ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height);
    const left = Math.max(margin, Math.min(anchor.left, view.width - margin - pop.width));
    return { top: Math.round(top), left: Math.round(left), side, maxHeight };
  };

  /**
   * A failed call as { text, details }: the plain sentence and the raw text. Uses the error helper's wording
   * (dshKit.plain) when the page also carries the dsh-kit block, so the two never say different things.
   */
  const explainError = (raw) => {
    try {
      // eslint-disable-next-line no-undef
      if (typeof dshKit !== 'undefined' && dshKit && typeof dshKit.plain === 'function') return dshKit.plain(raw);
    } catch { /* no error helper on this page */ }
    const message = typeof raw === 'string' ? raw : String(raw?.message ?? raw?.error ?? '');
    const details = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : message;
    // A message that reads as a sentence is said as it is (as the error helper does); a bare code is not.
    const said = message.trim();
    if (/\s/.test(said) && !/^[a-z][\w-]*(?:\/[\w.-]+)+:/i.test(said)) return { text: said, details: details === message ? '' : details };
    return { text: 'Something went wrong. Try again; the Details say what the app reported.', details };
  };

  /** Raw details as text to show behind Details. */
  const detailText = (details) => {
    if (details == null || details === '') return '';
    if (typeof details === 'string') return details;
    if (details instanceof Error) return details.stack || String(details.message);
    try { return JSON.stringify(details, null, 2); } catch { return String(details); }
  };

  let infoCount = 0;

  /**
   * The words of a row title for its (i): the text itself, or the text written directly inside a simple element
   * title (`h('span', null, 'Keep awake', badge)` gives "Keep awake"; the badge is left out). Anything else gives
   * undefined: then pass `info.label`, or the (i) is only "About this".
   */
  const plainTitle = (title) => {
    if (typeof title === 'string') return title;
    if (typeof title === 'number') return String(title);
    if (!title || typeof title !== 'object') return undefined;
    const kids = [].concat(title.props?.children ?? title.children ?? []);
    const text = kids.filter((kid) => typeof kid === 'string' || typeof kid === 'number').join(' ').replace(/\s+/g, ' ').trim();
    return text || undefined;
  };

  const makeParts = (React, ReactDOM) => {
    ensureStyle();
    // The pop-up of an (i) with `portal: true` is drawn in the page body, out of a box that clips it or moves fixed
    // children (a header with container-type, say). Without ReactDOM it stays where it is, as before.
    const portalTo = (node) => (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(node, document.body) : node);
    const h = React.createElement;
    /** The page frame: a title, one sentence under it, then the page. */
    const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
      title ? h('h2', { className: 'dshu-title' }, title) : null,
      desc ? h('p', { className: 'dshu-desc' }, desc) : null,
      children);
    const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
    /** A short line in the page's description style; `error` draws it in the error colour. */
    const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
    /** One setting: text on the left, the control(s) on the right. `info` ({ what, when, change }) adds an (i) after the title. */
    const Row = ({ title, desc, info, children }) => h('div', { className: 'dshu-row' },
      h('div', { className: 'dshu-rowtext' },
        h('div', { className: 'dshu-rowtitle' }, title, info ? h(Info, { title: plainTitle(title), ...info }) : null),
        desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
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

    const useLayout = React.useLayoutEffect ?? React.useEffect;
    // The (i) drawn as a ring with an "i" in the text colour, like the app's own info icon.
    const infoIcon = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' },
      h('circle', { cx: 8, cy: 8, r: 6.6 }),
      h('path', { d: 'M8 7.3v4' }),
      h('circle', { cx: 8, cy: 4.9, r: 0.45, fill: 'currentColor' }));
    /**
     * A small (i) button that opens a pop-up saying what a control does, when to use it and what changes if you change it.
     * `title` is the bold first line, `label` names the control for screen readers ("About <label>"; defaults to the title).
     * Opens on click, Enter or Space; Esc, a click outside or Tab away closes it; Esc puts the focus back on the (i).
     * `more` is one last line, or a list of lines. `portal: true` draws the pop-up in the page body (needs ReactDOM in makeParts).
     * `lang` is accepted and ignored: the heads and button name are always English.
     */
    const Info = (props) => {
      const { label, more, side, portal } = props;
      const extra = (Array.isArray(more) ? more : [more]).filter((line) => line != null && line !== false && line !== '');
      const { title, lines } = infoLines(props);
      const [open, setOpen] = React.useState(false);
      const [place, setPlace] = React.useState(null);
      const wrap = React.useRef(null);
      const button = React.useRef(null);
      const pop = React.useRef(null);
      const autoId = React.useId ? React.useId() : null;
      const fallbackId = React.useRef(null);
      if (!autoId && fallbackId.current == null) { infoCount += 1; fallbackId.current = `dshu-info-${infoCount}`; }
      const id = `dshu-pop-${String(autoId ?? fallbackId.current).replace(/[^\w-]/g, '')}`;
      const name = label ?? (typeof title === 'string' ? title : '');
      const about = infoWords().about;
      const measure = () => {
        const b = button.current; const p = pop.current;
        if (!b || !p || typeof window === 'undefined') return;
        const r = b.getBoundingClientRect();
        const found = placePop({ anchor: r, pop: { width: p.offsetWidth, height: p.scrollHeight }, view: { width: window.innerWidth, height: window.innerHeight } });
        // `side: 'above'` asks for the top first; it still flips when it does not fit.
        setPlace(side === 'above' && r.top - 6 - 8 >= p.scrollHeight ? { ...found, side: 'above', top: Math.round(r.top - 6 - p.scrollHeight) } : found);
      };
      useLayout(() => {
        if (!open) { setPlace(null); return undefined; }
        measure();
        try { pop.current?.focus({ preventScroll: true }); } catch { /* the panel is gone */ }
        return undefined;
      }, [open]);
      React.useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined;
        // The pop-up may sit in the page body (portal): a click in it is not outside.
        const inPop = (node) => Boolean(pop.current) && typeof pop.current.contains === 'function' && pop.current.contains(node);
        const inside = (node) => Boolean(node) && ((wrap.current && wrap.current.contains(node)) || inPop(node));
        const onDown = (event) => { if (wrap.current && !inside(event.target)) setOpen(false); };
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          // Only while the focus is in the (i) or its pop-up; then only the pop-up closes, not the dialog or menu
          // around it. On the window, first in the capture phase, so it runs before the panels' own Esc listeners
          // on the document; stopImmediatePropagation keeps every later listener from seeing it.
          const focused = typeof document !== 'undefined' ? document.activeElement : null;
          if (!wrap.current || !focused || !inside(focused)) return;
          event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
          setOpen(false);
          try { button.current?.focus(); } catch { /* the button is gone */ }
        };
        const onMove = () => measure();
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        return () => {
          document.removeEventListener('pointerdown', onDown, true);
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onMove);
          window.removeEventListener('scroll', onMove, true);
        };
      }, [open]);
      // Clicks inside never reach a row or menu item the (i) sits in; nor do the keys such a row or menu acts on.
      const stop = (event) => { event.stopPropagation(); };
      const stopKeys = (event) => { if (['Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation(); };
      return h('span', {
        ref: wrap, className: 'dshu-infowrap', onClick: stop, onPointerDown: stop, onMouseDown: stop, onKeyDown: stopKeys,
        onBlur: (event) => { if (open && wrap.current && event.relatedTarget && !wrap.current.contains(event.relatedTarget) && !(pop.current && typeof pop.current.contains === 'function' && pop.current.contains(event.relatedTarget))) setOpen(false); },
      },
      h('button', {
        ref: button, type: 'button', className: 'dshu-info', 'aria-label': about(name), 'aria-expanded': open,
        'aria-haspopup': 'dialog', 'aria-controls': open ? id : undefined, onClick: () => setOpen(!open),
      }, infoIcon()),
      open ? (portal ? portalTo : (node) => node)(h('div', {
        ref: pop, id, className: 'dshu-pop', role: 'dialog', tabIndex: -1, 'data-side': place?.side,
        'aria-label': title ? undefined : about(name), 'aria-labelledby': title ? `${id}-t` : undefined,
        style: place ? { top: place.top, left: place.left, maxHeight: place.maxHeight } : { top: 0, left: 0, visibility: 'hidden' },
      },
      title ? h('p', { id: `${id}-t`, className: 'dshu-pop-title' }, title) : null,
      lines.map((line) => h('p', { key: line.key, className: 'dshu-pop-line' }, h('span', { className: 'dshu-pop-head' }, line.head), line.text)),
      extra.map((line, index) => h('p', { key: `more-${index}`, className: 'dshu-pop-line' }, line)))) : null);
    };

    const STATES = ['ok', 'busy', 'idle', 'off', 'warn', 'error'];
    /**
     * One line that says in words what is happening and what to do next: a coloured dot, `words`, then `next`
     * (text or a button). `state` is ok, busy, idle, off, warn or error; anything else counts as idle.
     * `live: false` keeps the line out of screen readers' announcements (for words that change every few
     * seconds, such as a step count); then announce only the changes that matter somewhere else.
     */
    const StateLine = ({ state, words, next, live = true, children }) => {
      const shown = STATES.includes(state) ? state : 'idle';
      return h('p', { className: 'dshu-state', 'data-state': shown, role: live === false ? undefined : shown === 'error' ? 'alert' : 'status' },
        h('span', { className: 'dshu-state-dot', 'aria-hidden': 'true' }),
        words ? h('span', { className: 'dshu-state-words' }, words) : null,
        next ? h('span', { className: 'dshu-state-next' }, next) : null,
        children);
    };

    /**
     * An error in plain words: what went wrong (`what`), what to do or click (`fix`, and any buttons as children),
     * and the raw text only behind a Details toggle. Give `error` instead of `what` to word a failed call the way
     * the error helper does; `details` (text or an object) wins over the raw text it keeps.
     */
    const ErrorNote = ({ what, fix, details, error, children }) => {
      const [open, setOpen] = React.useState(false);
      const hasError = error !== undefined && error !== null && error !== '';
      const fromError = hasError ? explainError(error) : { text: '', details: '' };
      // With your own `what`, the raw error itself goes behind Details.
      const rawError = hasError ? (fromError.details || (typeof error === 'string' ? error : error.details || error.message || error)) : '';
      const text = what || fromError.text;
      const raw = detailText(details ?? (what ? rawError : fromError.details));
      if (!text && !fix && !raw) return null;
      return h('div', { className: 'dshu-errnote', role: 'alert' },
        h('p', { className: 'dshu-errnote-what' }, text || 'Something went wrong.'),
        fix ? h('p', { className: 'dshu-errnote-fix' }, fix) : null,
        children || raw ? h('div', { className: 'dshu-errnote-act' },
          children,
          raw ? h('button', { type: 'button', className: 'dshu-link', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null) : null,
        open && raw ? h('pre', { className: 'dshu-errnote-details' }, raw) : null);
    };
    return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait, Info, StateLine, ErrorNote };
  };
  return { makeParts, ensureStyle, copyText, infoLines, placePop, explainError };
})();
// ---- dsh-ui:end ----
