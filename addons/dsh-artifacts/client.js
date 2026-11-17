/**
 * Artifacts, browser half. A card under each turn for every file that turn made or changed (every tab the
 * same way); a click shows it: in a normal chat, in the app's own preview (its right-hand sidebar), and in
 * a Split pane, in a quick viewer to the right of that pane (the app's preview cannot open there; the
 * owner's answer: both). The Artifacts page lists everything made, from every tab, with filters and a
 * clean-up. Rendering is safe: a web page is shown cleaned; set running, it runs in a closed box that never
 * reaches the app, your files or another pane and fetches nothing (it can still send itself to another
 * address, and is closed when it does); "Allow internet for this file" lets it reach the internet.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-artifacts',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    const NS = 'artifacts';
    const DICT = { en: { 'section.title': 'Artifacts', 'page.title': 'Artifacts' }, zh: { 'section.title': 'Artifacts', 'page.title': '产物' } };
    const KIND_LABEL = { markdown: 'Markdown', html: 'Web page', pdf: 'PDF', word: 'Word document', sheet: 'Spreadsheet', slides: 'Slides', csv: 'Table (CSV)', json: 'JSON', image: 'Picture', audio: 'Audio', video: 'Video', code: 'Code', text: 'Text', other: 'File' };
    const TEXT_KINDS = new Set(['markdown', 'html', 'csv', 'json', 'code', 'text']);
    const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4' };

    const CSS = `
.dsh-af-cards { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
.dsh-af-card { display: inline-flex; align-items: center; gap: 8px; max-width: 320px; padding: 6px 10px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
.dsh-af-card:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-af-card .kind { flex: none; font-size: 10px; font-weight: 600; padding: 0 5px; line-height: 16px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dsh-af-card .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.dsh-af-card .ver { flex: none; color: var(--dsw-alias-label-secondary); }
.dsh-af-card .quick { flex: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 0 2px; font: inherit; }
.dsh-af-panel { position: absolute; z-index: 40; top: 32px; right: 0; bottom: 0; width: min(62%, 600px); display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); border-left: 0.5px solid var(--dsw-alias-border-l2); box-shadow: -8px 0 24px rgba(0,0,0,.14); color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-af-panel[data-floating="true"] { position: fixed; top: 48px; right: 12px; bottom: 12px; width: min(560px, 46vw); border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 14px; }
@container (max-width: 520px) { .dsh-af-panel { width: 100%; } }
.dsh-af-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); flex-wrap: wrap; }
.dsh-af-head .title { flex: 1; min-width: 120px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-af-body { flex: 1; min-height: 0; overflow: auto; padding: 10px 14px; }
.dsh-af-btn { height: 26px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-af-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-af-btn[data-main="true"] { color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); border-color: transparent; }
.dsh-af-btn:disabled { opacity: .5; cursor: default; }
.dsh-af-select, .dsh-af-input { height: 26px; padding: 0 6px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-af-note { margin: 6px 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-af-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-af-pre { margin: 0; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; overflow: auto; }
.dsh-af-pre .ln { display: inline-block; width: 3.5em; color: var(--dsw-alias-label-secondary); user-select: none; }
.dsh-af-diff .add { background: color-mix(in srgb, #2da44e 18%, transparent); }
.dsh-af-diff .del { background: color-mix(in srgb, #cf222e 18%, transparent); }
.dsh-af-md h1, .dsh-af-md h2, .dsh-af-md h3 { margin: 14px 0 6px; } .dsh-af-md h1 { font-size: 20px; } .dsh-af-md h2 { font-size: 17px; } .dsh-af-md h3 { font-size: 15px; }
.dsh-af-md p, .dsh-af-md li { line-height: 20px; } .dsh-af-md code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; padding: 0 3px; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover); }
.dsh-af-md blockquote { margin: 6px 0; padding-left: 10px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dsh-af-md .link { text-decoration: underline dotted; cursor: copy; }
.dsh-af-table { border-collapse: collapse; font-size: 12px; } .dsh-af-table td, .dsh-af-table th { border: 0.5px solid var(--dsw-alias-border-l2); padding: 3px 6px; text-align: left; vertical-align: top; }
.dsh-af-frame { width: 100%; height: 100%; min-height: 360px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: #fff; }
.dsh-af-json details { margin-left: 14px; } .dsh-af-json summary { cursor: pointer; } .dsh-af-json .leaf { margin-left: 14px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.dsh-af-page { height: 100%; overflow-y: auto; box-sizing: border-box; padding: 24px clamp(16px, 4vw, 40px) 40px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-af-page h1 { margin: 0 0 4px; font-size: 18px; }
.dsh-af-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; }
.dsh-af-rows { width: 100%; border-collapse: collapse; } .dsh-af-rows td, .dsh-af-rows th { padding: 6px 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); text-align: left; font-size: 12px; } .dsh-af-rows th { color: var(--dsw-alias-label-secondary); font-weight: 600; }
.dsh-af-box { margin: 18px 0; padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; }
.dsh-af-switch { position: relative; width: 36px; height: 20px; flex: none; border: 0; border-radius: 10px; cursor: pointer; background: var(--dsw-alias-border-l2); padding: 0; }
.dsh-af-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 8px; background: var(--dsw-alias-bg-base); transition: transform .15s; }
.dsh-af-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); } .dsh-af-switch[aria-checked="true"]::after { transform: translateX(16px); }
`;

    async function call(body, query = '') {
      const response = await fetch(new URL(`dsh-artifacts/data${query}`, document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `error ${response.status}`);
      return data;
    }
    /** A version's content, as plain data (never a page from the app's address). */
    async function content(id, version, session) {
      const response = await fetch(new URL(`dsh-artifacts/data?content=${encodeURIComponent(id)}&v=${encodeURIComponent(version)}&session=${encodeURIComponent(session ?? '')}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `error ${response.status}`);
      return response.blob();
    }
    const extOf = (name) => String(name ?? '').toLowerCase().split('.').pop();
    const sizeText = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : bytes >= 1000 ? `${Math.round(bytes / 1000)} KB` : `${bytes} bytes`);

    /** Shared on/off and "open this file once the main chat shows" (from a pane to the app's own preview). */
    function openFlags() {
      let on = false;
      const listeners = new Set();
      const pending = new Map();
      return {
        get: () => on,
        set(value) { if (on !== value) { on = value; for (const listener of listeners) listener(); } },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        pending,
      };
    }

    // ---- safe renderers ------------------------------------------------------------------------------

    /** Inline Markdown as React (no HTML from the file): bold, italics, code; links shown, copied on click, never opened. */
    function inline(text, key = '') {
      const out = [];
      const re = /(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\*[^*\s][^*]*\*)/g;
      let last = 0;
      let match;
      let n = 0;
      while ((match = re.exec(text))) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const part = match[0];
        const k = `${key}-${n += 1}`;
        if (part.startsWith('**')) out.push(h('strong', { key: k }, part.slice(2, -2)));
        else if (part.startsWith('`')) out.push(h('code', { key: k }, part.slice(1, -1)));
        else if (part.startsWith('![')) out.push(h('em', { key: k }, `[picture: ${part.slice(2, part.indexOf(']')) || 'no description'}, not loaded]`));
        else if (part.startsWith('[')) {
          const label = part.slice(1, part.indexOf(']'));
          const url = part.slice(part.indexOf('](') + 2, -1);
          out.push(h('span', { key: k, className: 'link', title: `${url} (click to copy; links are never opened from here)`, onClick: () => navigator.clipboard?.writeText?.(url) }, label));
        } else out.push(h('em', { key: k }, part.slice(1, -1)));
        last = match.index + part.length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    }
    function MarkdownView({ text }) {
      const blocks = [];
      const lines = String(text ?? '').split('\n');
      for (let i = 0; i < lines.length && blocks.length < 2000;) {
        const line = lines[i];
        if (/^```/.test(line)) {
          const body = [];
          i += 1;
          while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i += 1; }
          i += 1;
          blocks.push(h('pre', { key: i, className: 'dsh-af-pre' }, body.join('\n')));
        } else if (/^#{1,6}\s/.test(line)) {
          const level = Math.min(3, line.match(/^#+/)[0].length);
          blocks.push(h(`h${level}`, { key: i }, inline(line.replace(/^#+\s/, ''), i)));
          i += 1;
        } else if (/^\s*\|.*\|\s*$/.test(line)) {
          const rows = [];
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i += 1; }
          const cells = rows.filter((row) => !/^\s*\|[\s:|-]+\|\s*$/.test(row)).map((row) => row.trim().slice(1, -1).split('|').map((cell) => cell.trim()));
          blocks.push(h('table', { key: i, className: 'dsh-af-table' }, h('tbody', null, cells.map((row, r) => h('tr', { key: r }, row.map((cell, c) => h(r === 0 ? 'th' : 'td', { key: c }, inline(cell, `${i}-${r}-${c}`))))))));
        } else if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
          const items = [];
          const ordered = /^\s*\d+\./.test(line);
          while (i < lines.length && /^\s*([-*+]|\d+\.)\s/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s/, '')); i += 1; }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: i }, items.map((item, n) => h('li', { key: n }, inline(item, `${i}-${n}`)))));
        } else if (/^>\s?/.test(line)) {
          const quote = [];
          while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
          blocks.push(h('blockquote', { key: i }, inline(quote.join(' '), i)));
        } else if (!line.trim()) {
          i += 1;
        } else {
          const para = [];
          while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*\||\s*([-*+]|\d+\.)\s|>)/.test(lines[i])) { para.push(lines[i]); i += 1; }
          blocks.push(h('p', { key: i }, inline(para.join(' '), i)));
        }
      }
      return h('div', { className: 'dsh-af-md' }, blocks);
    }
    function CodeView({ text }) {
      const lines = String(text ?? '').split('\n').slice(0, 20000);
      return h('pre', { className: 'dsh-af-pre' }, lines.map((line, n) => h('div', { key: n }, h('span', { className: 'ln' }, n + 1), line)));
    }
    function DiffView({ diff }) {
      if (diff.summary) return h('p', { className: 'dsh-af-note' }, diff.summary);
      return h('pre', { className: 'dsh-af-pre dsh-af-diff' }, h('div', { className: 'dsh-af-note' }, `${diff.added} line${diff.added === 1 ? '' : 's'} added, ${diff.removed} removed`),
        diff.lines.map((line, n) => h('div', { key: n, className: line.op === '+' ? 'add' : line.op === '-' ? 'del' : '' }, `${line.op} ${line.text}`)));
    }
    function csvRows(text) {
      const rows = [];
      const delimiter = String(text).split('\n')[0].includes('\t') ? '\t' : ',';
      for (const line of String(text).split(/\r?\n/).slice(0, 501)) {
        if (!line) continue;
        const cells = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
          } else if (ch === '"') quoted = true;
          else if (ch === delimiter) { cells.push(cell); cell = ''; } else cell += ch;
        }
        cells.push(cell);
        rows.push(cells);
      }
      return rows;
    }
    function TableView({ text }) {
      const rows = csvRows(text);
      return h('div', null, rows.length > 500 ? h('p', { className: 'dsh-af-note' }, 'The first 500 rows.') : null,
        h('table', { className: 'dsh-af-table' }, h('tbody', null, rows.slice(0, 500).map((row, r) => h('tr', { key: r }, row.map((cell, c) => h(r === 0 ? 'th' : 'td', { key: c }, cell)))))));
    }
    function JsonNode({ name, value, depth }) {
      if (value !== null && typeof value === 'object') {
        const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
        return h('details', { open: depth < 2 }, h('summary', null, `${name !== undefined ? `${name}: ` : ''}${Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}`),
          entries.slice(0, 1000).map(([key, item]) => h(JsonNode, { key, name: key, value: item, depth: depth + 1 })));
      }
      return h('div', { className: 'leaf' }, `${name !== undefined ? `${name}: ` : ''}${JSON.stringify(value)}`);
    }
    function JsonView({ text }) {
      try {
        return h('div', { className: 'dsh-af-json' }, h(JsonNode, { value: JSON.parse(text), depth: 0 }));
      } catch {
        return h(CodeView, { text });
      }
    }
    /** The box's rules: shown safely (nothing runs, nothing is fetched), or running with nothing fetched. */
    const SAFE_POLICY = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
    const RUN_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
    /** Shown safely, these never stay: they run, load, lead somewhere or come alive later. */
    const SAFE_DROP = new Set(['script', 'meta', 'base', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'portal', 'template', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard']);
    /** Shown safely, attributes that lead somewhere or load something (a `src` stays only as data). */
    const SAFE_DROP_ATTRS = new Set(['href', 'xlink:href', 'srcset', 'formaction', 'action', 'target', 'ping', 'srcdoc', 'data', 'codebase', 'lowsrc', 'dynsrc', 'longdesc', 'background', 'manifest', 'http-equiv', 'imagesrcset']);
    /**
     * Clean a parsed page before it is shown. Safe: nothing that runs, loads or leads anywhere (scripts, frames,
     * links' addresses, forms' targets, `on…` handlers, outside pictures). Run: its scripts stay; what sends it
     * elsewhere by itself goes (a refresh, a base address, link targets).
     */
    function cleanPage(doc, step) {
      for (const node of [...doc.querySelectorAll('*')]) {
        const name = String(node.localName ?? node.tagName ?? '').toLowerCase();
        if (step === 'safe') {
          if (SAFE_DROP.has(name)) {
            node.remove();
            continue;
          }
          // A form's fields stay to be read; the form that would send them goes.
          if (name === 'form') {
            node.replaceWith(...node.childNodes);
            continue;
          }
          for (const attr of [...node.attributes]) {
            const key = String(attr.name).toLowerCase();
            const value = String(attr.value ?? '').trim().toLowerCase();
            if (key.startsWith('on') || SAFE_DROP_ATTRS.has(key) || ((key === 'src' || key === 'poster') && !value.startsWith('data:'))) node.removeAttribute(attr.name);
          }
        } else {
          if (name === 'base' || (name === 'meta' && /refresh/i.test(String(node.getAttribute('http-equiv') ?? '')))) {
            node.remove();
            continue;
          }
          for (const attr of [...node.attributes]) if (['target', 'ping'].includes(String(attr.name).toLowerCase())) node.removeAttribute(attr.name);
        }
      }
      return doc;
    }
    /** The page as the box gets it: cleaned, with the box's rules first in its head. With the internet allowed, as it is. */
    function preparePage(text, step) {
      if (step === 'internet') return String(text ?? '');
      const doc = new DOMParser().parseFromString(String(text ?? ''), 'text/html');
      cleanPage(doc, step);
      const meta = doc.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', step === 'run' ? RUN_POLICY : SAFE_POLICY);
      doc.head.prepend(meta);
      return `<!doctype html>${doc.documentElement.outerHTML}`;
    }
    /** The box. A page that goes to another address (its first load is its own) is closed at once. */
    function PageFrame({ doc, step, onLeft }) {
      const loads = useRef(0);
      return h('iframe', {
        className: 'dsh-af-frame', title: 'Web page artifact', srcDoc: doc, sandbox: step === 'safe' ? '' : 'allow-scripts', referrerPolicy: 'no-referrer',
        onLoad: () => {
          loads.current += 1;
          if (loads.current > 1 && step !== 'internet') onLeft();
        },
      });
    }
    /**
     * A web page in three steps (the owner's answer): safe (no scripts, nothing from the internet), Run (its
     * scripts in a closed box that fetches nothing; it can still try to go to another address, and the app
     * has no guard of its own for that), Allow internet for this file. Never the app's origin.
     */
    function HtmlView({ text, artifactId, start = 'safe' }) {
      const [step, setStep] = useState(start);
      const [left, setLeft] = useState(false);
      useEffect(() => { setStep(start); setLeft(false); }, [artifactId, start]);
      const doc = useMemo(() => {
        try {
          return preparePage(text, step);
        } catch {
          return null;
        }
      }, [text, step]);
      const note = step === 'safe' ? 'Shown safely: no scripts, nothing from the internet, no links that lead anywhere.'
        : step === 'run' ? 'Running in a closed box: its scripts run and cannot fetch anything or reach the app, your files or another pane. It can still try to go to another address, which may reach the internet; if it does, it is closed.'
          : 'This file may load things from the internet (its server sees that you opened it) and reach machines on your local network.';
      let body;
      if (doc === null) body = h('div', null, h('p', { className: 'dsh-af-note' }, 'This page could not be prepared to be shown safely; here is its text.'), h(CodeView, { text }));
      else if (left) body = h('div', null, h('p', { className: 'dsh-af-note', 'data-error': 'true' }, 'This page went to another address, so it was closed. What it asked for may already have reached the internet.'), h('button', { type: 'button', className: 'dsh-af-btn', onClick: () => setLeft(false) }, 'Show it again'));
      else body = h(PageFrame, { key: `${artifactId}:${step}`, doc, step, onLeft: () => setLeft(true) });
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
        h('div', { className: 'dsh-af-head', style: { border: 0, padding: 0 } },
          h('span', { className: 'dsh-af-note', style: { flex: 1 } }, note),
          step === 'safe' ? h('button', { type: 'button', className: 'dsh-af-btn', onClick: () => { setLeft(false); setStep('run'); } }, 'Run page (it may reach the internet)') : null,
          step !== 'internet' ? h('button', { type: 'button', className: 'dsh-af-btn', onClick: () => { setLeft(false); setStep('internet'); }, title: 'For this file only' }, 'Allow internet for this file') : null),
        body);
    }
    function BlobView({ blob, kind, name, onAppPreview }) {
      const [url, setUrl] = useState('');
      useEffect(() => {
        const typed = new Blob([blob], { type: MIME[extOf(name)] ?? (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream') });
        const made = URL.createObjectURL(typed);
        setUrl(made);
        return () => URL.revokeObjectURL(made);
      }, [blob, kind, name]);
      if (kind === 'pdf') {
        // The app's window may not show a PDF inside a page: the app's own preview does.
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, height: '100%' } },
          h('p', { className: 'dsh-af-note' }, typeof onAppPreview === 'function' ? 'If this stays blank, use App preview. ' : 'If this stays blank, open it in its own app. ',
            typeof onAppPreview === 'function' ? h('button', { type: 'button', className: 'dsh-af-btn', onClick: onAppPreview }, 'App preview') : null),
          url ? h('embed', { src: url, type: 'application/pdf', className: 'dsh-af-frame', style: { height: '100%' } }) : null);
      }
      if (!url) return null;
      if (kind === 'image') return h('img', { src: url, alt: name, style: { maxWidth: '100%' } });
      if (kind === 'audio') return h('audio', { src: url, controls: true });
      if (kind === 'video') return h('video', { src: url, controls: true, style: { maxWidth: '100%' } });
      return null;
    }

    /** Kinds opened in their own app from here (the server holds the same rule); anything else is shown in Finder. */
    const OPENABLE = new Set(['markdown', 'text', 'csv', 'json', 'pdf', 'word', 'sheet', 'slides', 'image', 'audio', 'video']);
    const NEVER_OPEN = new Set(['svg', 'svgz', 'html', 'htm', 'xhtml', 'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppsm', 'ppam', 'sldm']);
    const openable = (item) => OPENABLE.has(item.kind) && String(item.name).includes('.') && !NEVER_OPEN.has(extOf(item.name));

    /**
     * What you can do with an artifact. A Bench backup: nothing that shows it. A sealed (Recon) one: nothing
     * that takes it out of Recon (no app, no Finder, no copy to a folder or the clipboard, no send); Recon's
     * own Export… button does that once its run is done.
     */
    function ViewerActions({ item, shown, sessionId, version, act, appPreview, setNote, setItem }) {
      const sealed = item.sealed === true;
      const backup = item.noRender === true;
      return [
        !backup && !sealed ? h('button', { key: 'preview', type: 'button', className: 'dsh-af-btn', onClick: appPreview, title: 'Show this conversation on its own, with the file in the app\'s own preview' }, 'App preview') : null,
        !backup && !sealed && openable(item) ? h('button', { key: 'open', type: 'button', className: 'dsh-af-btn', onClick: () => void act(() => call({ action: 'openApp', id: item.id, session: sessionId }), 'Opened in its own app.') }, 'Open in its app') : null,
        !backup && !sealed ? h('button', { key: 'reveal', type: 'button', className: 'dsh-af-btn', title: 'Show it in its folder, without opening it', onClick: () => void act(() => call({ action: 'reveal', id: item.id, session: sessionId }), 'Shown in Finder.') }, 'Show in Finder') : null,
        !backup && !sealed ? h('button', { key: 'save', type: 'button', className: 'dsh-af-btn', onClick: () => { const folder = window.prompt('Save a copy into which folder? (full path)'); if (folder) void act(async () => { const done = await call({ action: 'saveTo', id: item.id, session: sessionId, folder, version }); setNote(`Saved: ${done.where}`); }); } }, 'Save to folder') : null,
        !sealed ? h('button', { key: 'copy', type: 'button', className: 'dsh-af-btn', onClick: () => void act(async () => { await navigator.clipboard.writeText(shown?.text ?? item.path); }, shown?.text ? 'Copied.' : 'The path is copied.') }, 'Copy') : null,
        !sealed ? h('button', { key: 'send', type: 'button', className: 'dsh-af-btn', onClick: () => window.dispatchEvent(new CustomEvent('dsh-split-plus:send-file', { detail: { sessionId, path: item.path } })), title: 'Send it to another pane or chat (Split Plus)' }, 'Send to…') : null,
        sealed ? h('span', { key: 'sealed', className: 'dsh-af-note' }, 'Recon\'s files stay in Recon: its own Export… button takes them out once its run is done.') : null,
        h('button', { key: 'star', type: 'button', className: 'dsh-af-btn', onClick: () => void act(async () => { await call({ action: 'star', id: item.id, on: !item.star }); setItem({ ...item, star: !item.star }); }) }, item.star ? '★ Kept' : '☆ Keep'),
      ];
    }

    /** The quick viewer: an artifact, its versions and what changed, and what you can do with it. */
    function Viewer({ appCtx, flags, artifactId, sessionId, floating, onClose }) {
      const [item, setItem] = useState(null);
      const [pageStart, setPageStart] = useState('safe');
      const [version, setVersion] = useState(0);
      const [shown, setShown] = useState(null);
      const [diff, setDiff] = useState(null);
      const [note, setNote] = useState('');
      const [error, setError] = useState(false);
      useEffect(() => {
        let alive = true;
        call(null, `?item=${encodeURIComponent(artifactId)}&session=${encodeURIComponent(sessionId ?? '')}`).then((value) => {
          if (!alive) return;
          setItem(value.item);
          setPageStart(value.pageStart ?? 'safe');
          setVersion(value.item?.versions ?? 0);
        }, (problem) => { if (alive) { setNote(problem.message); setError(true); } });
        return () => { alive = false; };
      }, [artifactId, sessionId]);
      useEffect(() => {
        let alive = true;
        setShown(null);
        setDiff(null);
        if (!item || !version || item.noRender) return undefined;
        content(item.id, version, sessionId).then(async (blob) => {
          if (!alive) return;
          setShown(TEXT_KINDS.has(item.kind) ? { text: await blob.text() } : { blob });
        }, (problem) => { if (alive) { setNote(problem.message); setError(true); } });
        return () => { alive = false; };
      }, [item, version, sessionId]);
      const act = async (work, done) => {
        setNote('');
        setError(false);
        try { await work(); if (done) setNote(done); } catch (problem) { setNote(problem.message); setError(true); }
      };
      const appPreview = () => {
        // The app's own preview lives in its right-hand sidebar: show this conversation on its own, then open it there.
        flags.pending.set(sessionId, item.path);
        appCtx.get('uiWorkspace')?.openSession?.(sessionId);
        onClose();
      };
      let body = null;
      if (!item) body = h('p', { className: 'dsh-af-note', 'data-error': error ? 'true' : 'false' }, note || 'Loading…');
      else if (item.noRender) body = h('p', { className: 'dsh-af-note' }, 'A Bench backup is listed and never shown: it can hold passwords and keys.');
      else if (diff) body = h(DiffView, { diff });
      else if (!shown) body = h('p', { className: 'dsh-af-note', 'data-error': error ? 'true' : 'false' }, note || 'Loading…');
      else if (item.kind === 'markdown') body = h(MarkdownView, { text: shown.text });
      else if (item.kind === 'html') body = h(HtmlView, { text: shown.text, artifactId: `${item.id}:${version}`, start: pageStart });
      else if (item.kind === 'csv') body = h(TableView, { text: shown.text });
      else if (item.kind === 'json') body = h(JsonView, { text: shown.text });
      else if (TEXT_KINDS.has(item.kind)) body = h(CodeView, { text: shown.text });
      else if (['image', 'audio', 'video', 'pdf'].includes(item.kind)) body = h(BlobView, { blob: shown.blob, kind: item.kind, name: item.name, onAppPreview: item.sealed ? null : appPreview });
      else body = h('div', null, h('p', null, h('strong', null, item.name)), h('p', { className: 'dsh-af-note' }, `${KIND_LABEL[item.kind] ?? 'File'}, ${sizeText(item.size)}. ${['word', 'sheet', 'slides'].includes(item.kind) ? 'Shown by the app\'s own preview (with LibreOffice installed) or in its own app.' : 'Open it in its own app.'}`));
      const list = item?.versionList ?? [];
      return h('div', { className: 'dsh-af-panel', 'data-floating': floating ? 'true' : 'false', role: 'dialog', 'aria-label': 'Artifact' },
        h('style', null, CSS),
        h('div', { className: 'dsh-af-head' },
          h('span', { className: 'title', title: item?.path ?? '' }, item ? `${item.name}` : 'Artifact'),
          item && list.length > 1 ? h('select', { className: 'dsh-af-select', value: version, onChange: (event) => { setVersion(Number(event.target.value)); setDiff(null); } }, list.map((one) => h('option', { key: one.n, value: one.n }, `v${one.n} · ${new Date(one.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`))) : item ? h('span', { className: 'dsh-af-note' }, 'v1') : null,
          item && TEXT_KINDS.has(item.kind) && version > 1 && !item.noRender ? h('button', { type: 'button', className: 'dsh-af-btn', onClick: () => (diff ? setDiff(null) : void act(async () => setDiff(await call(null, `?diff=${encodeURIComponent(item.id)}&a=${version - 1}&b=${version}&session=${encodeURIComponent(sessionId ?? '')}`)))) }, diff ? 'Show the file' : 'What changed') : null,
          h('button', { type: 'button', className: 'dsh-af-btn', 'aria-label': 'Close', onClick: onClose }, '×')),
        h('div', { className: 'dsh-af-body' }, body),
        item ? h('div', { className: 'dsh-af-head', style: { borderTop: '0.5px solid var(--dsw-alias-border-l1)', borderBottom: 0 } },
          h(ViewerActions, { item, shown, sessionId, version, act, appPreview, setNote, setItem }),
          note ? h('span', { className: 'dsh-af-note', 'data-error': error ? 'true' : 'false' }, note) : null) : null);
    }

    /** The cards under a turn: every file that turn made or changed. */
    const turnCache = new Map();
    function TurnCards({ appCtx, flags, sessionId, turn, openFile }) {
      const on = useSyncExternalStore(flags.subscribe, flags.get);
      const from = turn?.start?.time;
      const to = turn?.end?.time;
      const key = `${sessionId}:${from}:${to ?? 'open'}`;
      const [cards, setCards] = useState(turnCache.get(key) ?? null);
      const [viewing, setViewing] = useState(null);
      const anchor = useRef(null);
      useEffect(() => {
        if (!on || !sessionId || !Number.isFinite(from)) return undefined;
        let alive = true;
        const read = () => call(null, `?session=${encodeURIComponent(sessionId)}&from=${from}&to=${Number.isFinite(to) ? to + 2000 : ''}`).then((value) => {
          if (!alive) return;
          setCards(value.cards ?? []);
          if (Number.isFinite(to)) turnCache.set(key, value.cards ?? []);
        }, () => {});
        if (!turnCache.has(key)) read();
        // A turn still running keeps looking for what it makes.
        const timer = Number.isFinite(to) ? null : setInterval(read, 4000);
        return () => { alive = false; if (timer) clearInterval(timer); };
      }, [on, sessionId, from, to, key]);
      // A file asked for from a pane: open it in the app's own preview once this conversation shows on its own.
      useEffect(() => {
        if (!on || !openFile || !flags.pending.has(sessionId) || anchor.current?.closest?.('[data-split-pane]')) return;
        const path = flags.pending.get(sessionId);
        if (!(cards ?? []).some((card) => card.path === path)) return;
        flags.pending.delete(sessionId);
        try { openFile(path); } catch { /* the app's preview is not there */ }
      }, [on, cards, openFile, sessionId]);
      if (!on || !cards || cards.length === 0) return h('span', { ref: anchor, style: { display: 'none' } });
      const show = (card, quick) => {
        const pane = anchor.current?.closest?.('[data-split-pane]');
        if (!pane && !quick && typeof openFile === 'function' && !card.noRender) {
          try { openFile(card.path); return; } catch { /* fall back to the quick viewer */ }
        }
        setViewing({ id: card.id, pane });
      };
      const seen = new Set();
      const unique = [...cards].reverse().filter((card) => (seen.has(card.id) ? false : (seen.add(card.id), true))).reverse();
      return h('div', { ref: anchor },
        h('style', null, CSS),
        h('div', { className: 'dsh-af-cards' }, unique.map((card) => h('div', { key: card.id, className: 'dsh-af-card', role: 'button', tabIndex: 0, title: card.path, onClick: () => show(card, false), onKeyDown: (event) => { if (event.key === 'Enter') show(card, false); } },
          h('span', { className: 'kind' }, KIND_LABEL[card.kind] ?? 'File'),
          h('span', { className: 'name' }, card.name),
          h('span', { className: 'ver' }, `v${card.version}`),
          h('button', { type: 'button', className: 'quick', title: 'Quick view beside the chat', 'aria-label': 'Quick view', onClick: (event) => { event.stopPropagation(); show(card, true); } }, '◫')))),
        viewing ? ReactDOM.createPortal(h(Viewer, { appCtx, flags, artifactId: viewing.id, sessionId, floating: !viewing.pane, onClose: () => setViewing(null) }), (() => {
          const pane = viewing.pane;
          if (pane && getComputedStyle(pane).position === 'static') pane.style.position = 'relative';
          return pane ?? document.body;
        })()) : null);
    }

    // ---- the Artifacts page --------------------------------------------------------------------------

    function ArtifactsPage({ appCtx, flags }) {
      const [data, setData] = useState(null);
      const [filters, setFilters] = useState({ mode: '', folder: '', kind: '', days: '' });
      const [viewing, setViewing] = useState(null);
      const [clean, setClean] = useState({ kinds: '', minMB: '', olderThanDays: '', newerThanDays: '', alsoFiles: false });
      const [picked, setPicked] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const query = useMemo(() => {
        const from = filters.days ? Date.now() - Number(filters.days) * 86_400_000 : 0;
        return `?mode=${encodeURIComponent(filters.mode)}&folder=${encodeURIComponent(filters.folder)}&kind=${encodeURIComponent(filters.kind)}&from=${from}`;
      }, [filters]);
      const read = useCallback(() => call(null, query).then(setData, (problem) => setNote(problem.message)), [query]);
      useEffect(() => { void read(); }, [read]);
      if (data && data.enabled !== true) return h('div', { className: 'dsh-af-page' }, h('style', null, CSS), h('h1', null, 'Artifacts'), h('p', { className: 'dsh-af-note' }, 'Artifacts is off. Switch it on in Settings → Artifacts.'));
      const items = data?.items ?? [];
      const modesSeen = [...new Set(items.flatMap((one) => one.modes))].sort();
      const kindsSeen = [...new Set(items.map((one) => one.kind))].sort();
      const filter = { kinds: clean.kinds ? clean.kinds.split(',').map((one) => one.trim()).filter(Boolean) : [], minBytes: clean.minMB ? Number(clean.minMB) * 1_000_000 : 0, olderThanDays: Number(clean.olderThanDays) || 0, newerThanDays: Number(clean.newerThanDays) || 0, mode: filters.mode };
      return h('div', { className: 'dsh-af-page' },
        h('style', null, CSS),
        h('h1', null, 'Artifacts'),
        h('p', { className: 'dsh-af-note' }, 'Every file a conversation made or changed, from every tab, newest first. The file in its folder is the artifact; older versions are kept here. Recon\'s files show only inside Recon.'),
        h('div', { className: 'dsh-af-filters' },
          h('select', { className: 'dsh-af-select', value: filters.mode, onChange: (event) => setFilters({ ...filters, mode: event.target.value }) }, h('option', { value: '' }, 'Every tab'), modesSeen.map((mode) => h('option', { key: mode, value: mode }, mode))),
          h('select', { className: 'dsh-af-select', value: filters.kind, onChange: (event) => setFilters({ ...filters, kind: event.target.value }) }, h('option', { value: '' }, 'Every kind'), kindsSeen.map((kind) => h('option', { key: kind, value: kind }, KIND_LABEL[kind] ?? kind))),
          h('select', { className: 'dsh-af-select', value: filters.days, onChange: (event) => setFilters({ ...filters, days: event.target.value }) }, h('option', { value: '' }, 'Any date'), h('option', { value: '1' }, 'Today'), h('option', { value: '7' }, 'Last 7 days'), h('option', { value: '30' }, 'Last 30 days')),
          h('input', { className: 'dsh-af-input', style: { width: 260 }, placeholder: 'Folder (full path)', value: filters.folder, onChange: (event) => setFilters({ ...filters, folder: event.target.value }) }),
          h('span', { className: 'dsh-af-note' }, `${items.length} artifact${items.length === 1 ? '' : 's'}`),
          (data?.danger ?? []).length > 0 ? h('span', { className: 'dsh-af-note', style: { color: 'var(--dsw-alias-state-error-primary)' }, title: data.danger.map((one) => one.what).join('\n') }, `⚠ Danger zone: ${data.danger.length} rule${data.danger.length === 1 ? '' : 's'} off`) : null),
        h('table', { className: 'dsh-af-rows' },
          h('thead', null, h('tr', null, ['', 'Name', 'Kind', 'Tab', 'Folder', 'Changed', 'Versions', ''].map((label, n) => h('th', { key: n }, label)))),
          h('tbody', null, items.slice(0, 1000).map((one) => h('tr', { key: one.id },
            h('td', null, one.star ? '★' : ''),
            h('td', { title: one.path }, one.exists ? one.name : `${one.name} (not in its folder)`),
            h('td', null, KIND_LABEL[one.kind] ?? one.kind),
            h('td', null, one.lastMode),
            h('td', { title: one.folder }, one.folder.split('/').slice(-2).join('/')),
            h('td', null, new Date(one.lastAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
            h('td', null, one.versions),
            h('td', null,
              h('button', { type: 'button', className: 'dsh-af-btn', disabled: one.noRender, onClick: () => setViewing({ id: one.id, sessionId: one.lastSession }) }, 'View'), ' ',
              h('button', { type: 'button', className: 'dsh-af-btn', title: 'Open the conversation that made it', onClick: () => appCtx.get('uiWorkspace')?.openSession?.(one.lastSession) }, 'Its conversation')))))),
        h('div', { className: 'dsh-af-box' },
          h('strong', null, 'Clean up'),
          h('p', { className: 'dsh-af-note' }, 'Pick by kind, size and age, see what matches, then move it to the app\'s trash (30 days, with Put back). A starred (kept) artifact is never picked. Without the tick, the files in your folders stay where they are; only the kept versions and the list entries go.'),
          h('div', { className: 'dsh-af-filters' },
            h('input', { className: 'dsh-af-input', style: { width: 200 }, placeholder: 'Kinds, e.g. code, text', value: clean.kinds, onChange: (event) => setClean({ ...clean, kinds: event.target.value }) }),
            h('input', { className: 'dsh-af-input', style: { width: 110 }, placeholder: 'At least MB', value: clean.minMB, onChange: (event) => setClean({ ...clean, minMB: event.target.value }) }),
            h('input', { className: 'dsh-af-input', style: { width: 150 }, placeholder: 'Older than days', value: clean.olderThanDays, onChange: (event) => setClean({ ...clean, olderThanDays: event.target.value }) }),
            h('input', { className: 'dsh-af-input', style: { width: 150 }, placeholder: 'Newer than days', value: clean.newerThanDays, onChange: (event) => setClean({ ...clean, newerThanDays: event.target.value }) }),
            h('label', { className: 'dsh-af-note' }, h('input', { type: 'checkbox', checked: clean.alsoFiles, onChange: (event) => setClean({ ...clean, alsoFiles: event.target.checked }) }), ' Also move the files in my folders to the trash'),
            h('button', { type: 'button', className: 'dsh-af-btn', disabled: busy, onClick: () => void call(null, `?match=${encodeURIComponent(JSON.stringify(filter))}`).then((value) => setPicked(value.ids ?? []), (problem) => setNote(problem.message)) }, 'See what matches')),
          picked ? h('div', null,
            h('p', { className: 'dsh-af-note' }, `${picked.length} artifact${picked.length === 1 ? '' : 's'} match${clean.alsoFiles ? '; their files go too' : ''}.`),
            h('button', { type: 'button', className: 'dsh-af-btn', 'data-main': 'true', disabled: busy || picked.length === 0 || data?.trash !== true, onClick: () => { if (!window.confirm(`Move ${picked.length} artifact${picked.length === 1 ? '' : 's'}${clean.alsoFiles ? ' and their files' : ''} to the trash? You can put them back from the trash for 30 days.`)) return; setBusy(true); void call({ action: 'cleanup', ids: picked, alsoFiles: clean.alsoFiles }).then((done) => { setNote(`${done.moved} moved to the trash.`); setPicked(null); return read(); }, (problem) => setNote(problem.message)).finally(() => setBusy(false)); } }, 'Move to the trash'),
            data?.trash !== true ? h('p', { className: 'dsh-af-note' }, 'Clean-up needs the app\'s trash (the Cowork sidebar).') : null) : null),
        note ? h('p', { className: 'dsh-af-note' }, note) : null,
        viewing ? h(Viewer, { appCtx, flags, artifactId: viewing.id, sessionId: viewing.sessionId, floating: true, onClose: () => setViewing(null) }) : null);
    }

    function PageIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4' }));
    }

    const DANGER_SWITCHES = [
      ['dangerShowBackups', 'Show Bench backups', 'Bench backups are shown and opened like any file. They can hold passwords and keys.'],
      ['dangerShowSealed', 'Show Recon\'s files outside Recon', 'Recon\'s files are listed on the Artifacts page and shown in any conversation.'],
      ['dangerPagesRun', 'Open web pages running', 'Web pages open with their scripts running. They cannot fetch anything, but a page can still send itself to another address, which may reach the internet.'],
      ['dangerPagesInternet', 'Open web pages with the internet', 'Web pages open with the internet allowed: their servers see that you opened them, and they can reach machines on your local network.'],
    ];
    function SettingsPage({ appCtx, onChanged }) {
      const [data, setData] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const read = useCallback(() => call().then(setData, (problem) => setNote(problem.message)), []);
      useEffect(() => { void read(); }, [read]);
      const setDanger = async (key, value) => {
        setBusy(true);
        try {
          const settings = appCtx.remote.settings;
          const rowOf = async () => { const result = await settings.describe(); return result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined; };
          let done = await settings.mutate(NS, [{ op: 'set', path: [key], value }], (await rowOf())?.revision);
          if (!done.ok && done.error.code === 'settings/conflict') done = await settings.mutate(NS, [{ op: 'set', path: [key], value }], (await rowOf())?.revision);
          if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
          setNote(value ? 'Switched off. It stays off until you switch it back.' : 'Back on: the rule holds again.');
          await read();
        } catch (problem) {
          setNote(`Not saved: ${problem.message}`);
        } finally {
          setBusy(false);
        }
      };
      const toggle = async () => {
        setBusy(true);
        try {
          const settings = appCtx.remote.settings;
          const rowOf = async () => { const result = await settings.describe(); return result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined; };
          const row = await rowOf();
          let done = await settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: data.enabled !== true }], row?.revision);
          if (!done.ok && done.error.code === 'settings/conflict') done = await settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: data.enabled !== true }], (await rowOf())?.revision);
          if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
          setNote(data.enabled ? 'Switched off.' : 'Switched on.');
          await read();
          onChanged();
        } catch (problem) {
          setNote(`Not saved: ${problem.message}`);
        } finally {
          setBusy(false);
        }
      };
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } },
        h('style', null, CSS),
        h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
          h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 500 } }, 'Artifacts'), h('div', { className: 'dsh-af-note' }, 'A card under each turn for every file it made or changed, from every tab; a click opens it in the app\'s own preview, or beside the chat in a Split pane. Every version is kept in Artifacts\' own folder, and the Artifacts page lists them all. Web pages are shown safely: their scripts run only after "Run page" (a running page may still reach the internet by going to another address), and the internet is allowed only after "Allow internet for this file".')),
          data ? h('button', { type: 'button', role: 'switch', className: 'dsh-af-switch', 'aria-checked': data.enabled === true, 'aria-label': 'Artifacts', disabled: busy, onClick: () => void toggle() }) : null),
        data?.enabled === true ? h('div', { style: { marginTop: 14 } },
          h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-state-error-primary)' } }, '⚠ DANGER ZONE'),
          h('p', { className: 'dsh-af-note' }, 'Each rule below starts on. Switch one off only when you need to: it stays off until you switch it back, the Artifacts page shows it in red, and each change is noted in Artifacts\' log.'),
          DANGER_SWITCHES.map(([key, name, desc]) => {
            const off = (data.danger ?? []).some((one) => one.name === key);
            return h('div', { key, style: { display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0' } },
              h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 500 } }, name), h('div', { className: 'dsh-af-note', style: { margin: 0 } }, desc)),
              h('button', { type: 'button', role: 'switch', className: 'dsh-af-switch', 'aria-checked': off, 'aria-label': name, style: off ? { background: 'var(--dsw-alias-state-error-primary)' } : undefined, disabled: busy, onClick: () => void setDanger(key, !off) }));
          })) : null,
        note ? h('p', { className: 'dsh-af-note' }, note) : null);
    }

    const plugin = {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        const flags = openFlags();
        ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'dsh-artifacts' }, (props) => h(TurnCards, { ...props, appCtx: ctx, flags }))), 'artifacts: cards');
        let pageOff = null;
        const sync = async () => {
          let on = false;
          try { on = (await call()).enabled === true; } catch { on = false; }
          flags.set(on);
          try {
            if (on && !pageOff) {
              const main = ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'artifacts' }, () => h(ArtifactsPage, { appCtx: ctx, flags }))), 'artifacts: page');
              const row = ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'artifacts', order: 22, label: () => t('page.title') }, PageIcon)), 'artifacts: sidebar row');
              pageOff = () => { row(); main(); };
            } else if (!on && pageOff) {
              pageOff();
              pageOff = null;
            }
          } catch (error) {
            if (!/inactive context/.test(String(error?.message ?? error))) throw error;
          }
        };
        void sync().catch(() => { /* this copy was replaced while it started */ });
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'artifacts', order: 119, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx, onChanged: () => void sync().catch(() => {}) }))), 'artifacts: settings');
        ctx.effect(() => () => { pageOff?.(); pageOff = null; });
      },
    };
    // For the add-on's own tests only (not enumerable: the app never sees it).
    Object.defineProperty(plugin, 'testing', { value: Object.freeze({ cleanPage, preparePage, HtmlView, PageFrame, BlobView, ViewerActions, SAFE_POLICY, RUN_POLICY }) });
    return plugin;
  },
});
