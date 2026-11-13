/**
 * Activity indicator, browser half: draws the bar, the rings and the text, and
 * the settings page. It asks the server half "what is happening now?" a few
 * times a second while something runs, and rarely while nothing does.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-activity',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const NS = 'activity';
    const DICT = { en: { 'section.title': 'Activity' }, zh: { 'section.title': '活动指示' } };

    /** Every kind of work: its name on the settings page, what it means, and its built-in colour. */
    const KINDS = [
      { id: 'prompt', label: 'Prompt processing', hint: 'The model is reading the prompt; no token has come back yet.', color: '#3fb8c9', speed: 0.5 },
      { id: 'reason', label: 'Thinking', hint: 'Reasoning tokens are arriving.', color: '#7f77dd', speed: 0.5 },
      { id: 'write', label: 'Token generation', hint: 'The answer, or the arguments of a tool call, is being written.', color: '#1d9e75', speed: 1 },
      { id: 'tool', label: 'Tool calls', hint: 'A tool is running.', color: '#ef9f27', speed: 0.6 },
      { id: 'web', label: 'Web search', hint: 'A web search or fetch tool is running.', color: '#378add', speed: 0.7 },
      { id: 'script', label: 'Scripts and commands', hint: 'A shell command or script tool is running.', color: '#639922', speed: 0.45 },
      { id: 'sub', label: 'Sub-agents', hint: 'Helpers of this conversation are working.', color: '#d85a30', speed: 0.5 },
      { id: 'other', label: 'Other conversations', hint: 'Another conversation is working.', color: '#9a988f', speed: 0.3 },
      { id: 'wait', label: 'Waiting for you', hint: 'The app waits for your approval. Everything pulses in this colour.', color: '#d4537e', speed: 0 },
      { id: 'error', label: 'Errors and retries', hint: 'A turn failed, or the model request is being retried. Everything pulses in this colour.', color: '#e24b4a', speed: 0 },
    ];
    const KIND = Object.fromEntries(KINDS.map((kind) => [kind.id, kind]));
    const ORDER = ['prompt', 'reason', 'write', 'tool', 'web', 'script', 'sub', 'other'];

    const DESIGNS = [
      { id: 'pulse', label: 'Pulse line', hint: 'One line above the chat box with flowing dots.' },
      { id: 'lanes', label: 'Lanes', hint: 'One hairline per running thing on the lower window edge.' },
      { id: 'threads', label: 'Threads', hint: 'A rounded lane above the chat box; each running thing is a thread.' },
      { id: 'tape', label: 'Ticker tape', hint: 'A history strip on the lower window edge. Now is at the left.' },
      { id: 'rings', label: 'Rings', hint: 'Small spinning rings beside the model button, one per kind of work.' },
      { id: 'pulse+tape', label: 'Pulse line + Ticker tape', hint: 'Now above the chat box, history on the window edge.' },
      { id: 'threads+rings', label: 'Threads + Rings', hint: 'How much is going on in the lane, which kinds in the rings.' },
    ];
    /** Which pieces a design draws, and which piece carries the text. */
    const PIECES = {
      pulse: { dock: 'pulse', text: 'dock' },
      lanes: { edge: 'lanes', text: 'edge' },
      threads: { dock: 'threads', text: 'dock' },
      tape: { edge: 'tape', text: 'edge' },
      rings: { inline: 'rings', text: 'inline' },
      'pulse+tape': { dock: 'pulse', edge: 'tape', text: 'dock' },
      'threads+rings': { dock: 'threads', inline: 'rings', text: 'dock' },
    };
    const DEMO_NAMES = [
      ['prompt', 'Reading prompt'],
      ['reason', 'Thinking'],
      ['write', 'Writing'],
      ['tool', 'Tool call'],
      ['web', 'Web search'],
      ['background', 'Only background work'],
      ['all', 'Everything at once'],
      ['wait', 'Waiting for you'],
      ['error', 'Error'],
      ['idle', 'Idle'],
    ];

    const CSS = `
.dsh-ac-dock { display: flex; flex-direction: column; gap: 3px; padding: 0 12px 6px; min-width: 0; }
.dsh-ac-preview .dsh-ac-dock { padding: 0 0 8px; }
/* Fitted to the message box: it becomes the box's top part. Width, colour, corners and shadow are taken from the box itself. */
.dsh-ac-fit { box-sizing: border-box; max-width: 100%; }
.dsh-ac-fit[data-joined="true"] { position: relative; z-index: 1; clip-path: inset(-40px -40px 0 -40px); }
.dsh-ac-fit[data-joined="true"] .dsh-ac-dock { padding: 12px 24px 2px; }
/* The arrow that folds the message box away. Folded, the line is all that is left of the box. */
.dsh-ac-fit[data-arrow="true"] { position: relative; }
.dsh-ac-fit[data-arrow="true"] .dsh-ac-dock { padding-right: 44px; }
.dsh-ac-fit[data-joined="true"][data-arrow="true"] .dsh-ac-dock { padding-right: 52px; }
.dsh-ac-fit[data-folded="true"] { clip-path: none; }
.dsh-ac-fit[data-folded="true"] .dsh-ac-dock { padding-top: 10px; padding-bottom: 10px; }
.dsh-ac-fit[data-joined="true"][data-folded="true"] .dsh-ac-dock { padding-top: 10px; padding-bottom: 8px; }
.dsh-ac-bare { min-height: 24px; }
.dsh-ac-fold {
  position: absolute; right: 10px; top: 50%; width: 26px; height: 26px; margin-top: -13px; padding: 0; border: 0; border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); background: transparent; z-index: 2;
}
.dsh-ac-fit[data-joined="true"] .dsh-ac-fold { right: 16px; }
.dsh-ac-fit[data-joined="true"]:not([data-folded="true"]) .dsh-ac-fold { top: 12px; margin-top: 0; }
.dsh-ac-fold:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ac-fold:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ac-fold svg { display: block; transition: transform .16s ease; }
.dsh-ac-fit[data-folded="true"] .dsh-ac-fold svg { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .dsh-ac-fold svg { transition: none; } }
.dsh-ac-edge { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; pointer-events: none; display: flex; flex-direction: column; gap: 2px; }
.dsh-ac-inline { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.dsh-ac-canvas { display: block; width: 100%; color: var(--dsw-alias-label-secondary); }
.dsh-ac-text {
  height: 16px; font-size: 11px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; min-width: 0;
}
.dsh-ac-edge .dsh-ac-text { align-self: flex-start; max-width: calc(100% - 24px); margin-left: 12px; padding: 0 6px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-bg-base) 86%, transparent); }
.dsh-ac-edge .dsh-ac-text:empty { visibility: hidden; }
.dsh-ac-inline .dsh-ac-text { max-width: 240px; }
.dsh-ac-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ac-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ac-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ac-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ac-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); display: flex; align-items: center; gap: 8px; }
.dsh-ac-group > span:first-child { flex: 1; }
.dsh-ac-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ac-rowtext { flex: 1; min-width: 0; }
.dsh-ac-rowtitle { font-size: 14px; line-height: 22px; display: flex; align-items: center; gap: 8px; }
.dsh-ac-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ac-dot { flex: none; width: 10px; height: 10px; border-radius: 3px; }
.dsh-ac-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ac-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ac-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-ac-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ac-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ac-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-ac-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ac-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
select.dsh-ac-field { max-width: 260px; }
input.dsh-ac-field { width: 260px; }
.dsh-ac-color { flex: none; width: 36px; height: 28px; padding: 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; cursor: pointer; }
.dsh-ac-btn {
  height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.dsh-ac-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ac-btn[data-on="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-ac-range { flex: none; width: 180px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.dsh-ac-rangevalue { flex: none; width: 40px; text-align: right; font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dsh-ac-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-ac-preview { margin-top: 12px; padding: 16px; border-radius: 20px; border: 0.5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; gap: 0; }
.dsh-ac-fakebox { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 16px; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.dsh-ac-fakeline { font-size: 13px; color: var(--dsw-alias-label-secondary); opacity: .7; }
.dsh-ac-fakerow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); min-height: 22px; }
.dsh-ac-fakemodel { border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 2px 8px; }
.dsh-ac-fakeedge { margin-top: 14px; display: flex; flex-direction: column; gap: 2px; }
.dsh-ac-fakeedge .dsh-ac-text { padding: 0 2px; }
@media (max-width: 720px) {
  .dsh-ac-row { flex-wrap: wrap; }
  input.dsh-ac-field, select.dsh-ac-field { width: 100%; max-width: none; }
}
`;

    // ---------------------------------------------------------------- sounds

    /**
     * The alert sounds. Each is a few notes: [pitch in Hz, start in s, length in s, wave].
     * They are made here, in the browser; there are no sound files.
     */
    const SOUNDS = [
      { id: 'none', label: 'No sound', notes: [] },
      { id: 'chime', label: 'Chime (two rising notes)', notes: [[660, 0, 0.16, 'sine'], [880, 0.17, 0.3, 'sine']] },
      { id: 'beep', label: 'Beep', notes: [[880, 0, 0.2, 'sine']] },
      { id: 'double', label: 'Double beep', notes: [[880, 0, 0.11, 'sine'], [880, 0.19, 0.11, 'sine']] },
      { id: 'triple', label: 'Triple beep', notes: [[988, 0, 0.09, 'sine'], [988, 0.16, 0.09, 'sine'], [988, 0.32, 0.09, 'sine']] },
      { id: 'bell', label: 'Bell', notes: [[1318, 0, 0.9, 'sine'], [2637, 0, 0.5, 'sine']] },
      { id: 'ping', label: 'Ping (short and high)', notes: [[1760, 0, 0.09, 'sine']] },
      { id: 'low', label: 'Low (two falling notes)', notes: [[392, 0, 0.22, 'triangle'], [294, 0.24, 0.4, 'triangle']] },
      { id: 'alarm', label: 'Alarm (high and low, twice)', notes: [[988, 0, 0.16, 'triangle'], [740, 0.18, 0.16, 'triangle'], [988, 0.36, 0.16, 'triangle'], [740, 0.54, 0.16, 'triangle']] },
      { id: 'siren', label: 'Siren (insistent)', notes: [[1175, 0, 0.12, 'square'], [1175, 0.2, 0.12, 'square'], [1175, 0.4, 0.12, 'square'], [1175, 0.6, 0.12, 'square'], [1175, 0.8, 0.12, 'square']] },
    ];
    const audio = { context: null };

    /** Browsers only allow sound after a click or a key press in the page; this gets the sound ready then. */
    function unlockSound() {
      try {
        const Context = window.AudioContext ?? window.webkitAudioContext;
        if (!Context) return;
        audio.context ??= new Context();
        if (audio.context.state === 'suspended') audio.context.resume().catch(() => {});
      } catch {
        // No sound on this machine.
      }
    }

    /**
     * Play one of the sounds.
     * @param {string} id - which sound.
     * @param {number} volume - 0 to 100.
     */
    function playSound(id, volume) {
      const sound = SOUNDS.find((item) => item.id === id);
      const level = clamp(Number(volume) || 0, 0, 100) / 100;
      if (!sound || sound.notes.length === 0 || level === 0) return;
      unlockSound();
      const context = audio.context;
      if (!context || context.state !== 'running') return;
      // Squared, so the low end of the slider is really quiet.
      const peak = level * level * 0.5;
      const start = context.currentTime + 0.02;
      for (const [pitch, at, length, wave] of sound.notes) {
        const tone = context.createOscillator();
        const gain = context.createGain();
        tone.type = wave;
        tone.frequency.value = pitch;
        const loud = wave === 'square' ? peak * 0.35 : peak;
        gain.gain.setValueAtTime(0.0001, start + at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, loud), start + at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
        tone.connect(gain).connect(context.destination);
        tone.start(start + at);
        tone.stop(start + at + length + 0.03);
      }
    }

    /** What was sounding at the last look, so a sound plays when something starts, not all the time. */
    const alert = { waiting: false, failed: false, lastWait: 0 };

    /** Play the waiting or error sound when that state begins (and again later, if asked). */
    function soundFor(snap) {
      const S = snap?.settings ?? {};
      const waiting = Boolean(snap?.kinds?.wait);
      const failed = Boolean(snap?.kinds?.error) && !snap.kinds.error.retry;
      const now = Date.now();
      if (S.enabled && S.sound) {
        const again = Number(S.soundRepeat) > 0 && waiting && now - alert.lastWait >= Number(S.soundRepeat) * 1000;
        if (waiting && (!alert.waiting || again)) {
          playSound(S.waitSound, S.soundVolume);
          alert.lastWait = now;
        } else if (failed && !alert.failed) playSound(S.errorSound, S.soundVolume);
      }
      alert.waiting = waiting;
      alert.failed = failed;
    }

    // ---------------------------------------------------------------- shared state

    /** One copy of the live state for every piece on screen. */
    const store = { snap: null, session: null, listeners: new Set(), users: 0, timer: null, sampler: null, hist: [] };
    const HIST_STEP_MS = 250;

    function notify() {
      for (const listener of store.listeners) listener();
    }

    async function fetchStatus(extra = {}) {
      const headers = { ...extra };
      if (store.session && !extra['x-dsh-demo']) headers['x-dsh-session'] = store.session;
      const response = await fetch(new URL('dsh-activity/status', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response.json();
    }

    async function poll() {
      clearTimeout(store.timer);
      let delay = 700;
      try {
        store.snap = await fetchStatus();
        soundFor(store.snap);
        notify();
        if (Object.keys(store.snap.kinds ?? {}).length > 0) delay = 350;
      } catch {
        delay = 4000;
      }
      if (document.hidden) delay = Math.max(delay, 3000);
      if (store.users > 0) store.timer = setTimeout(poll, delay);
    }

    /** What the tape remembers of one moment: the special state, or up to four kinds. */
    function momentOf(snap) {
      const acts = actsOf(snap);
      const special = specialOf(snap);
      return special ? [special] : acts.slice(0, 4).map((act) => act.k);
    }

    function start() {
      store.users += 1;
      if (store.users > 1) return;
      poll();
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', unlockSound, true);
      store.sampler = setInterval(() => {
        if (!store.snap) return;
        const keep = Math.max(1, Number(store.snap.settings?.tapeMinutes) || 1) * 60 * (1000 / HIST_STEP_MS);
        store.hist.push(momentOf(store.snap));
        if (store.hist.length > keep) store.hist.splice(0, store.hist.length - keep);
      }, HIST_STEP_MS);
    }

    /** Sending a message is the usual start of work: look again right away, not at the next slow check. */
    function onKey(event) {
      unlockSound();
      if (event.key === 'Enter' && !event.shiftKey) setTimeout(poll, 150);
    }

    function stop() {
      store.users -= 1;
      if (store.users > 0) return;
      clearTimeout(store.timer);
      clearInterval(store.sampler);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', unlockSound, true);
    }

    /** Live state for a component; `sessionId` tells the server which conversation is on screen. */
    function useLive(sessionId) {
      const [, bump] = useState(0);
      useEffect(() => {
        const listener = () => bump((n) => n + 1);
        store.listeners.add(listener);
        start();
        return () => {
          store.listeners.delete(listener);
          stop();
        };
      }, []);
      useEffect(() => {
        if (sessionId && store.session !== sessionId) {
          store.session = sessionId;
          poll();
        }
      }, [sessionId]);
      return store.snap;
    }

    // ---------------------------------------------------------------- what to draw

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    /** The running things that are switched on, in display order, with a speed and a count each. */
    function actsOf(snap) {
      const hidden = new Set(snap?.settings?.hidden ?? []);
      const kinds = snap?.kinds ?? {};
      const acts = [];
      for (const k of ORDER) {
        const detail = kinds[k];
        if (!detail || hidden.has(k)) continue;
        let v = KIND[k].speed;
        if ((k === 'reason' || k === 'write') && detail.rate > 0) v = clamp(detail.rate / 40, 0.3, 2.5);
        acts.push({ k, v, n: Math.max(1, Number(detail.count) || 1) });
      }
      return acts;
    }

    /** `wait` or `error` when one of them is active and switched on: then everything pulses. */
    function specialOf(snap) {
      const hidden = new Set(snap?.settings?.hidden ?? []);
      const kinds = snap?.kinds ?? {};
      if (kinds.wait && !hidden.has('wait')) return 'wait';
      if (kinds.error && !hidden.has('error')) return 'error';
      return null;
    }

    function colorOf(snap, kind) {
      return snap?.settings?.colors?.[kind] ?? KIND[kind]?.color ?? '#888888';
    }

    function alpha(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
    }

    /** One row per running thing; several sub-agents get a row each, up to `cap`. */
    function spread(acts, cap) {
      const rows = [];
      for (const act of acts) for (let i = 0; i < Math.min(act.n, act.k === 'sub' ? 3 : 1); i += 1) rows.push(act);
      return rows.slice(0, cap);
    }

    function roundRect(x, left, top, width, height, radius) {
      const r = Math.min(radius, height / 2, width / 2);
      x.beginPath();
      x.moveTo(left + r, top);
      x.arcTo(left + width, top, left + width, top + height, r);
      x.arcTo(left + width, top + height, left, top + height, r);
      x.arcTo(left, top + height, left, top, r);
      x.arcTo(left, top, left + width, top, r);
      x.closePath();
    }

    /** Height in pixels of each piece, for a thickness of 1 to 3. */
    function heightOf(piece, weight, withDots) {
      if (piece === 'pulse') return weight + 1 + (withDots ? 9 : 0);
      if (piece === 'lanes') return 6 * (weight + 2);
      if (piece === 'threads' || piece === 'tape') return 8 + weight * 2;
      return 22;
    }

    /**
     * Draw one piece.
     * @param {CanvasRenderingContext2D} x - canvas.
     * @param {string} piece - pulse, lanes, threads, tape or rings.
     * @param {number} W - width.
     * @param {number} H - height.
     * @param {number} t - seconds; 0 when movement is off.
     * @param {object} snap - live state with its settings.
     * @param {object} env - `neutral` (track colour), `hist` (tape history), `dots` (pulse: draw background dots).
     */
    function paint(x, piece, W, H, t, snap, env) {
      const S = snap?.settings ?? {};
      const still = S.still === true;
      const weight = clamp(Number(S.weight) || 2, 1, 3);
      const acts = actsOf(snap);
      const special = specialOf(snap);
      const beat = still ? 1 : 0.25 + 0.75 * Math.abs(Math.sin(t * 3.2));
      const col = (kind) => colorOf(snap, kind);
      const track = (a) => {
        x.globalAlpha = a;
        x.fillStyle = env.neutral;
      };
      const solid = () => {
        x.globalAlpha = 1;
      };

      if (piece === 'pulse') {
        const th = weight + 1;
        if (special) {
          x.fillStyle = alpha(col(special), beat);
          x.fillRect(0, 0, W, th);
        } else if (acts.length === 0) {
          track(0.28);
          x.fillRect(0, 0, W, Math.min(th, 2));
          solid();
        } else {
          const first = acts[0];
          x.fillStyle = alpha(col(first.k), still ? 0.9 : 0.28);
          x.fillRect(0, 0, W, th);
          if (!still) {
            x.fillStyle = col(first.k);
            for (let i = 0; i < 5; i += 1) x.fillRect((((t * first.v * 0.5 + i / 5) % 1.1) - 0.05) * W, 0, 10, th);
          }
        }
        if (env.dots) {
          let n = 0;
          for (const act of acts.slice(special ? 0 : 1)) {
            x.fillStyle = col(act.k);
            x.beginPath();
            x.arc(W - 8 - n * 9, th + 5, 2.5, 0, 7);
            x.fill();
            n += 1;
          }
        }
        return;
      }

      if (piece === 'lanes') {
        const lane = weight === 1 ? 1.5 : weight;
        const step = weight + 2;
        const rows = spread(acts, 6);
        if (rows.length === 0 && !special) {
          track(0.28);
          x.fillRect(0, H - 1, W, 1);
          solid();
          return;
        }
        const count = Math.max(rows.length, 1);
        for (let i = 0; i < count; i += 1) {
          const y = H - lane - i * step;
          if (special) {
            x.fillStyle = alpha(col(special), beat);
            x.fillRect(0, y, W, lane);
            continue;
          }
          const act = rows[i];
          x.fillStyle = alpha(col(act.k), still ? 0.9 : 0.22);
          x.fillRect(0, y, W, lane);
          if (!still) {
            x.fillStyle = col(act.k);
            x.fillRect((((t * act.v * 0.45 + i * 0.37) % 1.2) - 0.1) * W, y, 36, lane);
          }
        }
        return;
      }

      if (piece === 'threads') {
        const rows = spread(acts, 7);
        roundRect(x, 0, 0, W, H, H / 2);
        if (special) {
          x.fillStyle = alpha(col(special), 0.12 + 0.25 * beat);
          x.fill();
        } else {
          track(0.12);
          x.fill();
          solid();
        }
        x.save();
        roundRect(x, 0, 0, W, H, H / 2);
        x.clip();
        if (rows.length === 0 && !special) {
          track(0.3);
          x.fillRect(0, H / 2, W, 1);
          solid();
        }
        const lines = special ? Math.max(rows.length, 1) : rows.length;
        const amp = H / 2 - 2.5;
        for (let i = 0; i < lines; i += 1) {
          const act = rows[i];
          x.strokeStyle = special ? alpha(col(special), beat) : col(act.k);
          x.lineWidth = weight === 3 ? 2 : 1.5;
          x.beginPath();
          for (let px = 0; px <= W; px += 4) {
            const flat = (i - (lines - 1) / 2) * 3;
            const y = H / 2 + (special || still ? flat : Math.sin(px * 0.035 * (1 + i * 0.13) - t * act.v * 7 + i * 1.9) * amp);
            if (px === 0) x.moveTo(px, y);
            else x.lineTo(px, y);
          }
          x.stroke();
        }
        x.restore();
        return;
      }

      if (piece === 'tape') {
        const hist = env.hist ?? [];
        const slots = Math.max(1, Number(S.tapeMinutes) || 1) * 240;
        const step = W / slots;
        roundRect(x, 0, 0, W, H, H / 2);
        track(0.12);
        x.fill();
        solid();
        x.save();
        roundRect(x, 0, 0, W, H, H / 2);
        x.clip();
        const blocks = S.tapeBlocks !== false;
        const width = blocks ? step + 0.5 : Math.max(1, step - 1);
        for (let i = 0; i < slots && i < hist.length; i += 1) {
          const moment = hist[hist.length - 1 - i];
          if (!moment || moment.length === 0) continue;
          const px = i * step;
          const fade = S.tapeFade !== false ? 1 - (i / slots) * 0.75 : 1;
          const part = (H - 2) / moment.length;
          for (let j = 0; j < moment.length; j += 1) {
            const kind = moment[j];
            const urgent = (kind === 'wait' || kind === 'error') && i < 3;
            x.fillStyle = alpha(col(kind), fade * (urgent ? beat : 1));
            x.fillRect(px, 1 + j * part, width, blocks ? part : Math.max(1, part - 1));
          }
        }
        if (S.tapeMarks !== false) {
          track(0.45);
          for (let i = 40; i < slots; i += 40) x.fillRect(i * step, 0, 1, H);
          solid();
        }
        if (special) {
          x.fillStyle = alpha(col(special), beat);
          x.fillRect(0, 0, 6, H);
        }
        x.restore();
        return;
      }

      // rings
      const hidden = new Set(S.hidden ?? []);
      const kinds = ORDER.filter((kind) => !hidden.has(kind));
      const big = clamp((Number(snap?.context) || 0) / 60000, 0, 1) * 2.2;
      kinds.forEach((kind, i) => {
        const cx = 10 + i * 20;
        const act = acts.find((item) => item.k === kind);
        x.lineCap = 'round';
        if (special) {
          x.lineWidth = 2;
          x.strokeStyle = alpha(col(special), beat);
          x.beginPath();
          x.arc(cx, H / 2, 5, 0, 7);
          x.stroke();
        } else if (act) {
          const model = kind === 'prompt' || kind === 'reason' || kind === 'write';
          const r = 5 + (model ? big : 0);
          const turn = still ? -1.2 : t * act.v * 10 + i;
          x.lineWidth = 2;
          x.strokeStyle = alpha(col(kind), 0.22);
          x.beginPath();
          x.arc(cx, H / 2, r, 0, 7);
          x.stroke();
          x.strokeStyle = col(kind);
          x.beginPath();
          x.arc(cx, H / 2, r, turn, turn + 3.6);
          x.stroke();
          if (act.n > 1) {
            x.beginPath();
            x.arc(cx, H / 2, r, turn + 4.4, turn + 5.4);
            x.stroke();
          }
        } else {
          x.lineWidth = 1;
          x.globalAlpha = 0.3;
          x.strokeStyle = env.neutral;
          x.beginPath();
          x.arc(cx, H / 2, 3.5, 0, 7);
          x.stroke();
          x.globalAlpha = 1;
        }
      });
    }

    // ---------------------------------------------------------------- pieces

    /** A canvas that redraws itself: every frame while something runs, rarely while nothing does. */
    function Piece({ piece, snap, hist, dots, width }) {
      const ref = useRef(null);
      const live = useRef({ snap, hist, dots, piece });
      live.current = { snap, hist, dots, piece };
      const weight = clamp(Number(snap?.settings?.weight) || 2, 1, 3);
      const height = heightOf(piece, weight, dots);
      useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return undefined;
        let frame = 0;
        let timer = 0;
        let alive = true;
        const draw = (ms) => {
          if (!alive) return;
          const now = live.current;
          const rect = canvas.getBoundingClientRect();
          const scale = window.devicePixelRatio || 1;
          if (rect.width > 0) {
            const w = Math.round(rect.width * scale);
            const hh = Math.round(rect.height * scale);
            if (canvas.width !== w || canvas.height !== hh) {
              canvas.width = w;
              canvas.height = hh;
            }
            const x = canvas.getContext('2d');
            x.setTransform(scale, 0, 0, scale, 0, 0);
            x.clearRect(0, 0, rect.width, rect.height);
            const still = now.snap?.settings?.still === true;
            paint(x, now.piece, rect.width, rect.height, still ? 0 : (ms ?? performance.now()) / 1000, now.snap, {
              neutral: getComputedStyle(canvas).color || '#888',
              hist: now.hist,
              dots: now.dots,
            });
          }
          const busy = !now.snap?.settings?.still && (actsOf(now.snap).length > 0 || specialOf(now.snap) !== null);
          if (busy && !document.hidden) frame = requestAnimationFrame(draw);
          else timer = setTimeout(() => draw(), now.piece === 'tape' ? 250 : 500);
        };
        draw();
        return () => {
          alive = false;
          cancelAnimationFrame(frame);
          clearTimeout(timer);
        };
      }, []);
      return h('canvas', { ref, className: 'dsh-ac-canvas', 'aria-hidden': 'true', style: { height, width: width ?? '100%' } });
    }

    function Text({ snap }) {
      const special = specialOf(snap);
      const label = snap?.label?.text ?? '';
      return h('div', { className: 'dsh-ac-text', title: label, style: special ? { color: colorOf(snap, special) } : undefined }, label);
    }

    /** Is there anything to show? Used for "hide when idle". */
    function isIdle(snap) {
      return actsOf(snap).length === 0 && specialOf(snap) === null;
    }

    function hiddenNow(snap, place) {
      if (!snap?.settings?.enabled) return true;
      const pieces = PIECES[snap.settings.design] ?? PIECES.pulse;
      if (!pieces[place]) return true;
      return snap.settings.hideIdle === true && isIdle(snap);
    }

    /** Above the chat box: the pulse line or the threads lane. */
    function Dock({ snap, hist }) {
      if (hiddenNow(snap, 'dock')) return null;
      const pieces = PIECES[snap.settings.design];
      const text = snap.settings.text !== false && pieces.text === 'dock';
      return h(
        'div',
        { className: 'dsh-ac-dock', role: 'status', 'aria-label': snap.label?.text || 'Nothing is running' },
        h(Piece, { piece: pieces.dock, snap, hist, dots: pieces.dock === 'pulse' && !text }),
        text ? h(Text, { snap }) : null,
      );
    }

    /** Beside the model button: the rings. */
    function Inline({ snap, hist }) {
      if (hiddenNow(snap, 'inline')) return null;
      const pieces = PIECES[snap.settings.design];
      const text = snap.settings.text !== false && pieces.text === 'inline';
      const count = ORDER.filter((kind) => !(snap.settings.hidden ?? []).includes(kind)).length;
      return h('div', { className: 'dsh-ac-inline', title: snap.label?.text || 'Nothing is running' }, h(Piece, { piece: 'rings', snap, hist, width: Math.max(20, count * 20) }), text ? h(Text, { snap }) : null);
    }

    /** On the lower window edge: the lanes or the ticker tape. */
    function Edge({ snap, hist, fixed }) {
      if (hiddenNow(snap, 'edge')) return null;
      const pieces = PIECES[snap.settings.design];
      const text = snap.settings.text !== false && pieces.text === 'edge';
      return h('div', { className: fixed ? 'dsh-ac-edge' : 'dsh-ac-fakeedge' }, text ? h(Text, { snap }) : null, h(Piece, { piece: pieces.edge, snap, hist }));
    }

    /**
     * The line above the message box. Fitted, it is exactly as wide as the box and sits on it, so the
     * two read as one. The width is taken from the box itself, so it follows the window and the app.
     */
    /** Whether the message box is folded away. One answer for the whole app, kept across restarts. */
    const FOLD_KEY = 'dsh-activity.folded';
    const fold = {
      on: (() => { try { return window.localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } })(),
      listeners: new Set(),
      set(on) {
        fold.on = on === true;
        try { window.localStorage.setItem(FOLD_KEY, fold.on ? '1' : '0'); } catch { /* private mode: it lasts until the app closes */ }
        for (const listener of fold.listeners) listener();
      },
    };
    function useFolded() {
      const [, bump] = useState(0);
      useEffect(() => {
        const listener = () => bump((n) => n + 1);
        fold.listeners.add(listener);
        return () => { fold.listeners.delete(listener); };
      }, []);
      return fold.on;
    }
    /** The styles that take the message box out of sight while keeping its width measurable. */
    const FOLDED_CARD = { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderWidth: '0px', overflow: 'hidden', visibility: 'hidden', boxShadow: 'none' };

    function LiveDock({ sessionId }) {
      const snap = useLive(sessionId);
      const wrap = useRef(null);
      const fit = snap?.settings?.fit !== false;
      const canFold = snap?.settings?.collapse !== false;
      const folded = useFolded() && canFold;
      useEffect(() => {
        const node = wrap.current;
        if (!node) return undefined;
        let card = null;
        const showCard = () => {
          if (!card) return;
          for (const key of Object.keys(FOLDED_CARD)) card.style[key] = '';
          card.removeAttribute('inert');
          card.removeAttribute('aria-hidden');
        };
        const hideCard = () => {
          if (!card) return;
          Object.assign(card.style, FOLDED_CARD);
          // Nothing in a folded box can be reached with the keyboard either.
          card.setAttribute('inert', '');
          card.setAttribute('aria-hidden', 'true');
        };
        const clear = () => {
          for (const key of ['width', 'marginLeft', 'marginBottom', 'background', 'boxShadow', 'borderRadius']) node.style[key] = '';
          node.removeAttribute('data-joined');
          if (card) { card.style.borderTopLeftRadius = ''; card.style.borderTopRightRadius = ''; }
        };
        const stack = node.closest('[class*="_composerStack"]') ?? node.parentElement?.parentElement;
        card = stack?.querySelector('[class*="_card"]') ?? null;
        if (!stack || !card) { clear(); return undefined; }
        if (typeof ResizeObserver !== 'function') { clear(); if (folded) hideCard(); return () => { showCard(); }; }
        const place = () => {
          // Read the box as the app draws it, then fold it again if it is folded. One pass, nothing is painted in between.
          showCard();
          card.style.borderTopLeftRadius = '';
          card.style.borderTopRightRadius = '';
          const box = card.getBoundingClientRect();
          const area = stack.getBoundingClientRect();
          const look = getComputedStyle(card);
          const radius = look.borderTopLeftRadius;
          const style = { background: look.backgroundColor, shadow: look.boxShadow };
          if (folded) hideCard();
          // Nothing to show (hidden while idle), or no box to sit on: leave the box as the app draws it.
          if (!fit || box.width < 50 || !node.firstElementChild) { clear(); return; }
          node.style.width = `${Math.round(box.width)}px`;
          node.style.marginLeft = `${Math.max(0, Math.round(box.left - area.left))}px`;
          node.style.background = style.background;
          node.style.boxShadow = style.shadow;
          node.setAttribute('data-joined', 'true');
          if (folded) {
            // The line is the whole box now: all four corners, and it keeps the box's place at the bottom.
            node.style.borderRadius = radius;
            node.style.marginBottom = '';
            return;
          }
          node.style.borderRadius = `${radius} ${radius} 0 0`;
          // Close the space between the two, and cover the box's top edge by one pixel so no seam shows.
          const now = parseFloat(node.style.marginBottom) || 0;
          const space = box.top - node.getBoundingClientRect().bottom - now;
          node.style.marginBottom = `${-(Math.max(0, Math.round(space)) + 1)}px`;
          card.style.borderTopLeftRadius = '0';
          card.style.borderTopRightRadius = '0';
        };
        const watch = new ResizeObserver(place);
        watch.observe(card);
        watch.observe(stack);
        watch.observe(node);
        // The box changes its look when it gets the cursor, and with the colour scheme.
        card.addEventListener('focusin', place);
        card.addEventListener('focusout', place);
        const theme = new MutationObserver(place);
        theme.observe(document.documentElement, { attributes: true });
        place();
        return () => { watch.disconnect(); theme.disconnect(); card.removeEventListener('focusin', place); card.removeEventListener('focusout', place); showCard(); clear(); };
      }, [fit, folded, Boolean(snap)]);
      const line = snap ? h(Dock, { snap, hist: store.hist }) : null;
      const shown = snap ? !hiddenNow(snap, 'dock') : false;
      // The arrow rides on the line. Folded with no line to ride on, a bare strip carries it, so the box can always come back.
      const arrow = canFold && snap && (shown || folded)
        ? h('button', {
          type: 'button', className: 'dsh-ac-fold', 'aria-expanded': !folded, title: folded ? 'Show the message box' : 'Fold the message box away', 'aria-label': folded ? 'Show the message box' : 'Fold the message box away',
          onClick: () => fold.set(!folded),
        }, h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M4 6.5l4 4 4-4' })))
        : null;
      return h(React.Fragment, null, h('style', null, CSS),
        h('div', { ref: wrap, className: 'dsh-ac-fit', 'data-fit': String(fit), 'data-arrow': String(Boolean(arrow)), 'data-folded': String(folded) },
          shown ? line : folded ? h('div', { className: 'dsh-ac-dock dsh-ac-bare' }) : null,
          arrow));
    }
    function LiveInline({ sessionId }) {
      const snap = useLive(sessionId);
      return snap ? h(Inline, { snap, hist: store.hist }) : null;
    }
    /**
     * The strip on the lower window edge. While it shows, the app is made that much
     * shorter, so the strip never covers the app's own bottom line.
     */
    function LiveEdge() {
      const snap = useLive();
      const shown = Boolean(snap) && !hiddenNow(snap, 'edge');
      const pieces = snap ? PIECES[snap.settings.design] ?? PIECES.pulse : PIECES.pulse;
      const weight = clamp(Number(snap?.settings?.weight) || 2, 1, 3);
      const room = shown ? heightOf(pieces.edge, weight, false) + (snap.settings.text !== false && pieces.text === 'edge' ? 18 : 0) + 2 : 0;
      useEffect(() => {
        if (room === 0 || !document.getElementById('root')) return undefined;
        const style = document.createElement('style');
        style.textContent = `#root { height: calc(100vh - ${room}px) !important; min-height: 0 !important; }`;
        document.head.appendChild(style);
        return () => style.remove();
      }, [room]);
      return h(React.Fragment, null, h('style', null, CSS), shown ? h(Edge, { snap, hist: store.hist, fixed: true }) : null);
    }

    // ---------------------------------------------------------------- settings page

    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw new Error('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-ac-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, dot, children }) {
      return h(
        'div',
        { className: 'dsh-ac-row' },
        h('div', { className: 'dsh-ac-rowtext' }, h('div', { className: 'dsh-ac-rowtitle' }, dot ? h('span', { className: 'dsh-ac-dot', style: { background: dot } }) : null, title), hint ? h('div', { className: 'dsh-ac-rowdesc' }, hint) : null),
        children,
      );
    }

    /** A text field for a list of words, saved when you leave it or press Enter. */
    function WordsField({ value, placeholder, label, onCommit }) {
      const shown = (value ?? []).join(', ');
      const [draft, setDraft] = useState(shown);
      useEffect(() => setDraft(shown), [shown]);
      const commit = () => {
        const next = draft.split(',').map((word) => word.trim()).filter(Boolean);
        if (next.join(', ') !== shown) onCommit(next);
      };
      return h('input', { className: 'dsh-ac-field', value: draft, placeholder, 'aria-label': label, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => event.key === 'Enter' && commit() });
    }

    /** A slider that shows its value while you drag and saves when you let go. */
    function VolumeField({ value, onCommit }) {
      const [draft, setDraft] = useState(value);
      useEffect(() => setDraft(value), [value]);
      const commit = () => {
        if (draft !== value) onCommit(draft);
      };
      return h(
        React.Fragment,
        null,
        h('input', { type: 'range', className: 'dsh-ac-range', min: 0, max: 100, step: 1, value: draft, 'aria-label': 'Volume', onChange: (event) => setDraft(Number(event.target.value)), onPointerUp: commit, onKeyUp: commit, onBlur: commit }),
        h('span', { className: 'dsh-ac-rangevalue' }, `${draft}%`),
      );
    }

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [demo, setDemo] = useState('all');
      const [sample, setSample] = useState(null);
      const hist = useRef([]);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, error: true }));
        return () => {
          alive.current = false;
        };
      }, [appCtx]);

      // The preview: a sample state from the server, drawn by the same code as the real thing.
      useEffect(() => {
        let stopped = false;
        const load = () =>
          fetchStatus({ 'x-dsh-demo': demo })
            .then((data) => {
              if (stopped) return;
              setSample(data);
              const keep = Math.max(1, Number(data.settings?.tapeMinutes) || 1) * 240;
              hist.current.push(momentOf(data));
              if (hist.current.length > keep) hist.current.splice(0, hist.current.length - keep);
            })
            .catch(() => {});
        load();
        const timer = setInterval(load, HIST_STEP_MS);
        return () => {
          stopped = true;
          clearInterval(timer);
        };
      }, [demo]);

      if (!settings) {
        return h('div', { className: 'dsh-ac-page' }, h('style', null, CSS), h('h2', { className: 'dsh-ac-title' }, 'Activity indicator'), h('p', { className: 'dsh-ac-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }

      const value = settings.value;
      const now = sample?.settings ?? {};
      const save = async (ops) => {
        try {
          const next = await mutateSettings(appCtx, ops, settings.revision);
          if (!alive.current) return;
          setSettings(next);
          setNote({ text: 'Saved.', error: false });
          poll();
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, error: true });
        }
      };
      const set = (field, next) => save([{ op: 'set', path: [field], value: next }]);
      const on = (field, fallback) => (typeof value[field] === 'boolean' ? value[field] : fallback);
      const hidden = Array.isArray(value.hidden) ? value.hidden : [];
      const colors = value.colors && typeof value.colors === 'object' ? value.colors : {};
      const toggle = (field, title, hint, fallback) => h(Row, { title, hint }, h(Switch, { checked: on(field, fallback), label: title, onChange: (next) => set(field, next) }));
      const pieces = PIECES[now.design] ?? PIECES.pulse;
      const usesTape = pieces.edge === 'tape';

      return h(
        'div',
        { className: 'dsh-ac-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ac-title' }, 'Activity indicator'),
        h('p', { className: 'dsh-ac-desc' }, 'A thin bar that shows what the model and its helpers are doing: reading the prompt, thinking, writing, running tools, searching the web, or working in the background. It keeps no text of your conversations and sends nothing anywhere.'),
        note.text ? h('p', { className: 'dsh-ac-desc', 'data-error': String(note.error), role: 'status' }, note.text) : null,

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Preview')),
        h('div', { className: 'dsh-ac-chips' }, DEMO_NAMES.map(([id, label]) => h('button', { key: id, type: 'button', className: 'dsh-ac-btn', 'data-on': String(demo === id), onClick: () => setDemo(id) }, label))),
        sample
          ? h(
              'div',
              { className: 'dsh-ac-preview' },
              h(Dock, { snap: sample, hist: hist.current }),
              h(
                'div',
                { className: 'dsh-ac-fakebox' },
                h('div', { className: 'dsh-ac-fakeline' }, 'Ask anything'),
                h('div', { className: 'dsh-ac-fakerow' }, h('span', { className: 'dsh-ac-fakemodel' }, 'Model'), h(Inline, { snap: sample, hist: hist.current })),
              ),
              h(Edge, { snap: sample, hist: hist.current, fixed: false }),
              !now.enabled ? h('p', { className: 'dsh-ac-desc' }, 'The indicator is switched off.') : now.hideIdle && isIdle(sample) ? h('p', { className: 'dsh-ac-desc' }, 'Hidden, because nothing is running.') : null,
            )
          : null,
        h('p', { className: 'dsh-ac-desc' }, 'The preview uses made-up figures. The real indicator sits above the chat box, beside the model button, or on the lower edge of the window, depending on the design.'),

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Look')),
        toggle('enabled', 'Show the activity indicator', 'Off removes it everywhere.', true),
        h(
          Row,
          { title: 'Design', hint: DESIGNS.find((design) => design.id === (value.design ?? 'pulse'))?.hint },
          h('select', { className: 'dsh-ac-field', value: value.design ?? 'pulse', 'aria-label': 'Design', onChange: (event) => set('design', event.target.value) }, DESIGNS.map((design) => h('option', { key: design.id, value: design.id }, design.label))),
        ),
        h(
          Row,
          { title: 'Thickness', hint: 'How heavy the lines are.' },
          h('select', { className: 'dsh-ac-field', value: String(value.weight ?? 2), 'aria-label': 'Thickness', onChange: (event) => set('weight', Number(event.target.value)) }, h('option', { value: '1' }, 'Thin'), h('option', { value: '2' }, 'Normal'), h('option', { value: '3' }, 'Bold')),
        ),
        toggle('collapse', 'Arrow to fold the message box away', 'Adds a small arrow at the right end of the line. A click folds the message box down so only the line is left, and more of the conversation shows. Another click brings the box back. It stays folded in every conversation, and after a restart, until you click.', true),
        toggle('fit', 'Fit the message box', 'On keeps the line above the message box exactly as wide as the box, so the two look like one. Off lets it span the whole chat area.', true),
        toggle('hideIdle', 'Hide when nothing is running', 'Off keeps a faint resting line, so the chat box does not jump.', false),
        toggle('still', 'No movement', 'Colour only: nothing flows, spins or pulses.', false),

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'What to track'), h('button', { type: 'button', className: 'dsh-ac-btn', onClick: () => set('hidden', []) }, 'Track everything')),
        KINDS.map((kind) =>
          h(
            Row,
            { key: kind.id, title: kind.label, hint: kind.hint, dot: colors[kind.id] ?? kind.color },
            h('input', {
              type: 'color',
              className: 'dsh-ac-color',
              value: /^#[0-9a-fA-F]{6}$/.test(colors[kind.id] ?? '') ? colors[kind.id] : kind.color,
              'aria-label': `Colour for ${kind.label}`,
              title: 'Colour',
              onChange: (event) => set('colors', { ...colors, [kind.id]: event.target.value }),
            }),
            h(Switch, { checked: !hidden.includes(kind.id), label: kind.label, onChange: (next) => set('hidden', next ? hidden.filter((id) => id !== kind.id) : [...hidden.filter((id) => id !== kind.id), kind.id]) }),
          ),
        ),
        Object.keys(colors).length > 0 ? h('div', { style: { paddingTop: 12 } }, h('button', { type: 'button', className: 'dsh-ac-btn', onClick: () => set('colors', {}) }, 'Use the built-in colours')) : null,

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Sounds')),
        toggle('sound', 'Play a sound when it needs you', 'When the app starts waiting for your approval, and when a turn fails. Retries make no sound.', true),
        h(Row, { title: 'Volume', hint: 'From barely audible to loud. Press Try to hear it.' }, h(VolumeField, { value: Number.isFinite(Number(value.soundVolume)) ? Number(value.soundVolume) : 30, onCommit: (next) => set('soundVolume', next) })),
        [
          ['waitSound', 'Sound for "waiting for you"', 'chime'],
          ['errorSound', 'Sound for an error', 'low'],
        ].map(([field, title, fallback]) =>
          h(
            Row,
            { key: field, title },
            h('select', { className: 'dsh-ac-field', value: value[field] ?? fallback, 'aria-label': title, onChange: (event) => { set(field, event.target.value); playSound(event.target.value, value.soundVolume ?? 30); } }, SOUNDS.map((sound) => h('option', { key: sound.id, value: sound.id }, sound.label))),
            h('button', { type: 'button', className: 'dsh-ac-btn', onClick: () => playSound(value[field] ?? fallback, value.soundVolume ?? 30) }, 'Try'),
          ),
        ),
        h(
          Row,
          { title: 'Repeat while it still waits', hint: 'Plays the waiting sound again until you answer.' },
          h('select', { className: 'dsh-ac-field', value: String(value.soundRepeat ?? 0), 'aria-label': 'Repeat while it still waits', onChange: (event) => set('soundRepeat', Number(event.target.value)) }, [[0, 'Once only'], [10, 'Every 10 seconds'], [30, 'Every 30 seconds'], [60, 'Every minute'], [300, 'Every 5 minutes']].map(([seconds, label]) => h('option', { key: seconds, value: String(seconds) }, label))),
        ),

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Text')),
        toggle('text', 'Show the text', 'A short line that says what is running. It has its own row, so the bar never gets shorter.', true),
        toggle('figures', 'Figures', 'Tokens per second, seconds and counts.', true),
        toggle('words', 'Words, not short codes', '"Writing" for TG, "Reading prompt" for PP, "Sub-agents" for BG, "Other chats" for OC.', false),
        toggle('promptSpeed', 'Last prompt speed', 'Adds "PP 1,850 t/s" while the model thinks or writes. It is known once the first token arrives.', true),
        toggle('context', 'Conversation size', 'Adds "ctx 12.4k": the tokens the last request held.', true),

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Ticker tape')),
        usesTape ? null : h('p', { className: 'dsh-ac-desc', style: { margin: '0 0 4px' } }, 'These apply to the designs with a ticker tape.'),
        h(
          Row,
          { title: 'History', hint: 'How much time the tape holds from end to end.' },
          h('select', { className: 'dsh-ac-field', value: String(value.tapeMinutes ?? 1), 'aria-label': 'History', onChange: (event) => set('tapeMinutes', Number(event.target.value)) }, [1, 2, 5, 15].map((minutes) => h('option', { key: minutes, value: String(minutes) }, `${minutes} minute${minutes === 1 ? '' : 's'}`))),
        ),
        toggle('tapeBlocks', 'Solid blocks', 'Off draws separate ticks.', true),
        toggle('tapeFade', 'Fade older work', 'The further right, the fainter.', true),
        toggle('tapeMarks', 'A mark every 10 seconds', '', true),

        h('div', { className: 'dsh-ac-group' }, h('span', null, 'Tool names')),
        h(
          Row,
          { title: 'Counts as web search', hint: `A tool counts when its name contains one of these words. Empty uses: ${(sample?.defaults?.web ?? []).join(', ')}.` },
          h(WordsField, { value: value.webTools, placeholder: 'words, separated by commas', label: 'Counts as web search', onCommit: (next) => set('webTools', next) }),
        ),
        h(
          Row,
          { title: 'Counts as a script or command', hint: `Empty uses: ${(sample?.defaults?.script ?? []).join(', ')}.` },
          h(WordsField, { value: value.scriptTools, placeholder: 'words, separated by commas', label: 'Counts as a script or command', onCommit: (next) => set('scriptTools', next) }),
        ),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('activity', DICT));
        const t = ctx.locale.bind('activity');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register({ name: 'settings.section', id: 'activity', order: 21, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx })),
          ),
        );
        // Above the chat box.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'activity', order: 5 }, (props) => h(LiveDock, props))));
        // Beside the model button.
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'activity', order: 890 }, (props) => h(LiveInline, props))));
        // The lower window edge.
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'activity', order: 50 }, (props) => h(LiveEdge, props))));
      },
    };
  },
});
