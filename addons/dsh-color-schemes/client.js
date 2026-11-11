// Colour schemes: the browser half. A scheme is a set of colour overrides laid over the app's own
// light or dark palette through the theme service (`theme.overrideTokens`). "Stock" adds nothing,
// so the app looks exactly as shipped. The choice lives in this add-on's settings (Settings > Colours).
window.__ModuleLoader__.load({
  id: '@local/dsh-color-schemes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState, useSyncExternalStore } = React;

    const NS = 'colorSchemes';
    const SETTINGS_NS = 'color-schemes';
    const SOURCE = 'dsh-color-schemes';
    const LOCAL_KEY = 'dsh-color-schemes.choice';

    const DICT = {
      en: {
        'section.title': 'Colours',
        'head.hint': 'Colours for the whole app. Each scheme has a light and a dark version and follows Settings → General → Appearance. Stock is DeepSeek Harness as shipped.',
        'in.use': 'In use',
        'use': 'Use',
        'light': 'Light',
        'dark': 'Dark',
        'mac.opaque': 'Solid sidebar on the Mac',
        'mac.opaque.hint': 'On the Mac desktop app, paint the sidebar in the scheme\'s colour instead of see-through. Stock keeps the app\'s own look.',
        'custom.title': 'Custom scheme',
        'custom.hint': 'For advanced use: JSON with "label", "dark" and "light" maps of colour names (for example "--dsw-alias-bg-base") to colours. Names you leave out keep the app\'s value.',
        'custom.save': 'Save custom scheme',
        'custom.bad': 'Not valid: {message}',
        'custom.saved': 'Saved.',
        'failed': 'Could not save: {message}',
        'loading': 'Loading…',
        'unavailable': 'The settings for colour schemes could not be read.',
        'scheme.stock': 'DeepSeek Harness',
        'scheme.stock.d': 'The app\'s own colours, exactly as shipped.',
        'scheme.mindshub': 'MindsHub Cowork',
        'scheme.mindshub.d': 'Deep navy with teal accents.',
        'scheme.graphite': 'Graphite',
        'scheme.graphite.d': 'Neutral greys with amber accents.',
        'scheme.forest': 'Forest',
        'scheme.forest.d': 'Deep green with mint accents.',
        'scheme.custom': 'Custom',
        'scheme.custom.d': 'Your own colours (below).',
      },
      zh: {
        'section.title': '配色',
        'head.hint': '整个应用的配色。每个方案都有浅色和深色版本，跟随 设置 → 通用 → 外观。原版即 DeepSeek Harness 出厂配色。',
        'in.use': '使用中',
        'use': '使用',
        'light': '浅色',
        'dark': '深色',
        'mac.opaque': 'Mac 上使用不透明侧边栏',
        'mac.opaque.hint': '在 Mac 桌面应用中，用方案颜色绘制侧边栏，而不是半透明。原版保持应用自身外观。',
        'custom.title': '自定义方案',
        'custom.hint': '高级用法：JSON，包含 "label"、"dark" 和 "light"，把颜色名（例如 "--dsw-alias-bg-base"）映射到颜色。未列出的保持应用原值。',
        'custom.save': '保存自定义方案',
        'custom.bad': '无效：{message}',
        'custom.saved': '已保存。',
        'failed': '无法保存：{message}',
        'loading': '加载中…',
        'unavailable': '无法读取配色设置。',
        'scheme.stock': 'DeepSeek Harness',
        'scheme.stock.d': '应用自身配色，与出厂一致。',
        'scheme.mindshub': 'MindsHub Cowork',
        'scheme.mindshub.d': '深海军蓝配青色强调色。',
        'scheme.graphite': 'Graphite',
        'scheme.graphite.d': '中性灰配琥珀色强调色。',
        'scheme.forest': 'Forest',
        'scheme.forest.d': '深绿配薄荷色强调色。',
        'scheme.custom': '自定义',
        'scheme.custom.d': '你自己的配色（见下方）。',
      },
    };

    /** The app's own values (DeepSeek Harness 0.2.2-rc.1) for every colour a built-in scheme changes. */
    const S = (n) => `var(--dsw-static-neutral-bluish-${n})`;
    const STOCK = {
      '--dsw-alias-bg-base': [S('00'), S('950')],
      '--dsw-specific-sidebar-fill': [S('50'), S('900')],
      '--dsw-alias-bg-layer-1': [S('00'), S('875')],
      '--dsw-alias-bg-layer-2': [S('00'), S('850')],
      '--dsw-alias-bg-layer-3': [S('00'), S('800')],
      '--dsw-alias-bg-overlay': [S('150'), S('700')],
      '--dsw-alias-bg-module-platform': [S('60'), S('800')],
      '--dsw-specific-input-major': [S('00'), S('850')],
      '--dsw-alias-markdown-code-block': [S('50'), S('900')],
      '--dsw-alias-border-l1': ['#0000000a', '#ffffff0f'],
      '--dsw-alias-border-l2': ['#0000001a', '#ffffff1f'],
      '--dsw-alias-border-l3': ['#0000001f', '#ffffff29'],
      '--dsw-alias-border-l4': ['#00000029', '#fff3'],
      '--dsw-alias-label-primary': [S('1000'), S('50')],
      '--dsw-alias-label-secondary': [S('700'), S('300')],
      '--dsw-alias-label-primary-inverted': [S('00'), S('800')],
      '--dsw-alias-button-elevated-fill': [S('00'), S('750')],
      '--dsw-alias-button-floating-fill': [S('00'), S('850')],
      '--dsw-alias-button-floating-hover': [S('75'), S('800')],
      '--dsw-alias-button-primary-dimmed': [S('100'), S('750')],
      '--dsw-alias-button-ghost-active-fill': [S('100'), S('750')],
      '--dsw-alias-interactive-bg-hover': ['#2631480f', '#ffffff14'],
      '--dsw-alias-interactive-bg-active': ['#2631481a', '#ffffff24'],
      '--dsw-alias-interactive-bg-hover-solid': [S('75'), S('800')],
      '--dsw-alias-state-business-primary': ['var(--dsw-static-deepseek-500)', 'var(--dsw-static-deepseek-400)'],
      '--dsw-alias-state-business-tertiary': ['var(--dsw-static-deepseek-100)', 'var(--dsw-static-deepseek-800)'],
      '--dsw-alias-brand-primary': [S('1000'), S('50')],
      '--dsw-alias-button-primary-hover': [S('750'), S('100')],
      '--dsw-alias-button-info-fill': ['var(--dsw-static-deepseek-500)', 'var(--dsw-static-deepseek-400)'],
      '--dsw-alias-tooltip-bg': [S('850'), S('750')],
      '--dsw-alias-toast-bg': [S('800'), S('750')],
      '--dsw-menu-surface-fill': ['#fcfdfeb3', '#303136a3'],
      '--dsw-specific-bubble': ['var(--dsw-static-deepseek-50)', S('850')],
      '--dsw-specific-bubble-highlight': ['var(--dsw-static-deepseek-200)', S('750')],
      '--dsw-specific-selector': [S('60'), S('800')],
      '--dsw-specific-sidebar-nav-item-active': [S('100'), S('750')],
      '--dsw-specific-sidebar-nav-item-active-accent': ['var(--dsw-static-deepseek-100)', S('800')],
      '--dsw-specific-tip': [S('60'), S('800')],
      '--dsw-specific-login-input': [S('50'), S('900')],
    };

    /**
     * Built-in schemes. Each lists only what it changes; everything else keeps the app's value.
     * MindsHub Cowork's dark colours were sampled from MindsHub screenshots.
     */
    const SCHEMES = [
      { id: 'stock', light: {}, dark: {} },
      {
        id: 'mindshub',
        dark: {
          '--dsw-alias-bg-base': '#091425',
          '--dsw-specific-sidebar-fill': '#0e1b2e',
          '--dsw-alias-bg-layer-1': '#0d1828',
          '--dsw-alias-bg-layer-2': '#111e32',
          '--dsw-alias-bg-layer-3': '#16243b',
          '--dsw-alias-bg-overlay': '#1a2a45',
          '--dsw-alias-bg-module-platform': '#16243b',
          '--dsw-specific-input-major': '#0d1828',
          '--dsw-alias-markdown-code-block': '#0e1b2e',
          '--dsw-alias-border-l1': '#9fc3ff12',
          '--dsw-alias-border-l2': '#9fc3ff1f',
          '--dsw-alias-border-l3': '#9fc3ff2b',
          '--dsw-alias-border-l4': '#9fc3ff3d',
          '--dsw-alias-label-primary': '#e6eef8',
          '--dsw-alias-label-secondary': '#909daf',
          '--dsw-alias-label-primary-inverted': '#091425',
          '--dsw-alias-button-elevated-fill': '#1a263f',
          '--dsw-alias-button-floating-fill': '#0d1828',
          '--dsw-alias-button-floating-hover': '#16243b',
          '--dsw-alias-button-primary-dimmed': '#16243b',
          '--dsw-alias-button-ghost-active-fill': '#16243b',
          '--dsw-alias-interactive-bg-hover': '#9fc3ff12',
          '--dsw-alias-interactive-bg-active': '#9fc3ff1f',
          '--dsw-alias-interactive-bg-hover-solid': '#16243b',
          '--dsw-alias-state-business-primary': '#5cc1da',
          '--dsw-alias-state-business-tertiary': '#112e42',
          '--dsw-alias-brand-primary': '#5cc1da',
          '--dsw-alias-button-primary-hover': '#7fd0e4',
          '--dsw-alias-button-info-fill': '#5cc1da',
          '--dsw-alias-tooltip-bg': '#1a2a45',
          '--dsw-alias-toast-bg': '#1a2a45',
          '--dsw-menu-surface-fill': '#13203af2',
          '--dsw-specific-bubble': '#16243b',
          '--dsw-specific-bubble-highlight': '#1e3150',
          '--dsw-specific-selector': '#16243b',
          '--dsw-specific-sidebar-nav-item-active': '#1a263f',
          '--dsw-specific-sidebar-nav-item-active-accent': '#112e42',
          '--dsw-specific-tip': '#16243b',
          '--dsw-specific-login-input': '#0e1b2e',
          '--dsh-cs-dot': '#9fc3ff2e',
        },
        light: {
          '--dsw-alias-bg-base': '#f7fafc',
          '--dsw-specific-sidebar-fill': '#eef3f8',
          '--dsw-alias-bg-overlay': '#e3eaf2',
          '--dsw-alias-label-primary': '#0f1d30',
          '--dsw-alias-label-secondary': '#4e5d73',
          '--dsw-alias-state-business-primary': '#0e8ca6',
          '--dsw-alias-state-business-tertiary': '#d9f1f6',
          '--dsw-alias-brand-primary': '#0e7f96',
          '--dsw-alias-button-primary-hover': '#0b6d81',
          '--dsw-alias-button-info-fill': '#0e8ca6',
          '--dsw-alias-interactive-bg-hover': '#0e3a5a0f',
          '--dsw-alias-interactive-bg-active': '#0e3a5a1a',
          '--dsw-specific-bubble': '#e3f1f6',
          '--dsw-specific-bubble-highlight': '#c9e7f0',
          '--dsw-specific-sidebar-nav-item-active-accent': '#d9f1f6',
          '--dsh-cs-dot': '#0e3a5a29',
        },
        pattern: 'dots',
        swatch: ['#091425', '#0e1b2e', '#111e32', '#5cc1da', '#e6eef8'],
        swatchLight: ['#f7fafc', '#eef3f8', '#ffffff', '#0e8ca6', '#0f1d30'],
      },
      {
        id: 'graphite',
        dark: {
          '--dsw-alias-bg-base': '#141414',
          '--dsw-specific-sidebar-fill': '#1b1b1b',
          '--dsw-alias-bg-layer-1': '#1d1d1d',
          '--dsw-alias-bg-layer-2': '#222222',
          '--dsw-alias-bg-layer-3': '#2a2a2a',
          '--dsw-alias-bg-overlay': '#303030',
          '--dsw-alias-bg-module-platform': '#2a2a2a',
          '--dsw-specific-input-major': '#1d1d1d',
          '--dsw-alias-markdown-code-block': '#1b1b1b',
          '--dsw-alias-label-primary': '#ececec',
          '--dsw-alias-label-secondary': '#a3a3a3',
          '--dsw-alias-label-primary-inverted': '#141414',
          '--dsw-alias-button-elevated-fill': '#2e2e2e',
          '--dsw-alias-button-floating-fill': '#1d1d1d',
          '--dsw-alias-button-floating-hover': '#2a2a2a',
          '--dsw-alias-interactive-bg-hover-solid': '#2a2a2a',
          '--dsw-alias-state-business-primary': '#f2a93b',
          '--dsw-alias-state-business-tertiary': '#3a2c14',
          '--dsw-alias-brand-primary': '#f2a93b',
          '--dsw-alias-button-primary-hover': '#f5bc66',
          '--dsw-alias-button-info-fill': '#f2a93b',
          '--dsw-menu-surface-fill': '#262626f2',
          '--dsw-specific-bubble': '#262626',
          '--dsw-specific-bubble-highlight': '#333333',
          '--dsw-specific-selector': '#2a2a2a',
          '--dsw-specific-sidebar-nav-item-active': '#2e2e2e',
          '--dsw-specific-sidebar-nav-item-active-accent': '#3a2c14',
          '--dsw-specific-tip': '#2a2a2a',
          '--dsw-specific-login-input': '#1b1b1b',
        },
        light: {
          '--dsw-alias-bg-base': '#fafafa',
          '--dsw-specific-sidebar-fill': '#f1f1f1',
          '--dsw-alias-label-primary': '#1a1a1a',
          '--dsw-alias-label-secondary': '#5c5c5c',
          '--dsw-alias-state-business-primary': '#b86e00',
          '--dsw-alias-state-business-tertiary': '#fbeed8',
          '--dsw-alias-brand-primary': '#a86400',
          '--dsw-alias-button-primary-hover': '#8c5300',
          '--dsw-alias-button-info-fill': '#b86e00',
          '--dsw-specific-bubble': '#f3ede3',
          '--dsw-specific-bubble-highlight': '#ead9bd',
          '--dsw-specific-sidebar-nav-item-active-accent': '#fbeed8',
        },
        swatch: ['#141414', '#1b1b1b', '#222222', '#f2a93b', '#ececec'],
        swatchLight: ['#fafafa', '#f1f1f1', '#ffffff', '#b86e00', '#1a1a1a'],
      },
      {
        id: 'forest',
        dark: {
          '--dsw-alias-bg-base': '#0d1512',
          '--dsw-specific-sidebar-fill': '#121d18',
          '--dsw-alias-bg-layer-1': '#131f1a',
          '--dsw-alias-bg-layer-2': '#182620',
          '--dsw-alias-bg-layer-3': '#1e3028',
          '--dsw-alias-bg-overlay': '#24382e',
          '--dsw-alias-bg-module-platform': '#1e3028',
          '--dsw-specific-input-major': '#131f1a',
          '--dsw-alias-markdown-code-block': '#121d18',
          '--dsw-alias-border-l1': '#b4ffd412',
          '--dsw-alias-border-l2': '#b4ffd41f',
          '--dsw-alias-border-l3': '#b4ffd42b',
          '--dsw-alias-border-l4': '#b4ffd43d',
          '--dsw-alias-label-primary': '#e5efe9',
          '--dsw-alias-label-secondary': '#93a89c',
          '--dsw-alias-label-primary-inverted': '#0d1512',
          '--dsw-alias-button-elevated-fill': '#22362c',
          '--dsw-alias-button-floating-fill': '#131f1a',
          '--dsw-alias-button-floating-hover': '#1e3028',
          '--dsw-alias-interactive-bg-hover': '#b4ffd412',
          '--dsw-alias-interactive-bg-active': '#b4ffd41f',
          '--dsw-alias-interactive-bg-hover-solid': '#1e3028',
          '--dsw-alias-state-business-primary': '#6fcf97',
          '--dsw-alias-state-business-tertiary': '#183626',
          '--dsw-alias-brand-primary': '#6fcf97',
          '--dsw-alias-button-primary-hover': '#8fdbae',
          '--dsw-alias-button-info-fill': '#6fcf97',
          '--dsw-menu-surface-fill': '#18261ff2',
          '--dsw-specific-bubble': '#1c2c24',
          '--dsw-specific-bubble-highlight': '#24382e',
          '--dsw-specific-selector': '#1e3028',
          '--dsw-specific-sidebar-nav-item-active': '#22362c',
          '--dsw-specific-sidebar-nav-item-active-accent': '#183626',
          '--dsw-specific-tip': '#1e3028',
          '--dsw-specific-login-input': '#121d18',
        },
        light: {
          '--dsw-alias-bg-base': '#f6faf7',
          '--dsw-specific-sidebar-fill': '#ecf3ee',
          '--dsw-alias-label-primary': '#13261b',
          '--dsw-alias-label-secondary': '#4c6155',
          '--dsw-alias-state-business-primary': '#1f8a4c',
          '--dsw-alias-state-business-tertiary': '#dcf2e5',
          '--dsw-alias-brand-primary': '#1f7a45',
          '--dsw-alias-button-primary-hover': '#18653a',
          '--dsw-alias-button-info-fill': '#1f8a4c',
          '--dsw-specific-bubble': '#e3f1e8',
          '--dsw-specific-bubble-highlight': '#c6e5d2',
          '--dsw-specific-sidebar-nav-item-active-accent': '#dcf2e5',
        },
        swatch: ['#0d1512', '#121d18', '#182620', '#6fcf97', '#e5efe9'],
        swatchLight: ['#f6faf7', '#ecf3ee', '#ffffff', '#1f8a4c', '#13261b'],
      },
    ];
    const STOCK_SWATCH = {
      dark: [S('950'), S('900'), S('850'), 'var(--dsw-static-deepseek-400)', S('50')],
      light: [S('00'), S('50'), S('00'), 'var(--dsw-static-deepseek-500)', S('1000')],
    };

    function readObject(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected a JSON object');
      return parsed;
    }

    const COLOUR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color-mix|var)\([^;{}<>]*\)|transparent)$/;
    const NAME = /^--[a-z0-9-]{3,80}$/;
    /** A colour value only: no url(), images, comments or escapes, and the browser must accept it as a colour. */
    function isColour(value) {
      if (!COLOUR.test(value) || /url\(|image|\/\*|\\/i.test(value)) return false;
      if (value.startsWith('var(')) return true; // resolved later; the name pattern above keeps it a plain reference
      try {
        return typeof CSS === 'undefined' || CSS.supports('color', value);
      } catch {
        return false;
      }
    }

    /** Validate a custom scheme; throws with a readable message. */
    function parseCustom(text) {
      const raw = readObject(text);
      const out = { id: 'custom', label: typeof raw.label === 'string' ? raw.label.slice(0, 40) : '', light: {}, dark: {} };
      for (const mode of ['light', 'dark']) {
        const map = raw[mode] === undefined ? {} : raw[mode];
        if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error(`"${mode}" must be an object`);
        for (const [name, value] of Object.entries(map)) {
          if (!NAME.test(name)) throw new Error(`"${name}" is not a colour name`);
          if (typeof value !== 'string' || !isColour(value.trim())) throw new Error(`"${name}": "${value}" is not a colour`);
          out[mode][name] = value.trim();
        }
      }
      if (typeof raw.opaqueMacSidebar === 'boolean') out.opaqueMacSidebar = raw.opaqueMacSidebar;
      if (raw.pattern === 'dots') out.pattern = 'dots';
      return out;
    }

    /** Overrides for the theme service: every changed name gets a { light, dark } pair. */
    function tokensOf(scheme) {
      const names = new Set([...Object.keys(scheme.light ?? {}), ...Object.keys(scheme.dark ?? {})]);
      const tokens = {};
      for (const name of names) {
        const stock = STOCK[name];
        const light = scheme.light?.[name] ?? stock?.[0];
        const dark = scheme.dark?.[name] ?? stock?.[1];
        if (light === undefined || dark === undefined) continue; // an unknown name set for one mode only
        tokens[name] = { light, dark };
      }
      return tokens;
    }

    /** A subtle dot grid on the main area, like MindsHub (schemes with `pattern: 'dots'`). */
    const DOTS_CSS = `body [class*='_centerCol']{background-image:radial-gradient(circle,var(--dsh-cs-dot,transparent) 1.1px,transparent 1.7px)!important;background-size:22px 22px!important;background-position:11px 11px!important}`;
    const MAC_CSS = `html[data-platform='darwin'] body [class*='_sidebarCol']{background:var(--dsw-specific-sidebar-fill)!important}`;

    /**
     * The applied state, shared by the page and the applier. One override layer at a time.
     */
    function createApplier(ctx) {
      let choice = readLocal();
      let theme = null;
      let dispose = null;
      const macStyle = document.createElement('style');
      macStyle.setAttribute('data-color-schemes-mac', '');
      const listeners = new Set();
      const emit = () => { for (const l of listeners) l(); };

      function readLocal() {
        try {
          const v = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || 'null');
          if (v && typeof v.scheme === 'string') return { scheme: v.scheme, custom: String(v.custom ?? ''), opaque: v.opaque !== false };
        } catch {
          // ignore
        }
        return { scheme: 'stock', custom: '', opaque: true };
      }

      function resolve(next) {
        if (next.scheme === 'custom') {
          try {
            return parseCustom(next.custom);
          } catch {
            return SCHEMES[0];
          }
        }
        return SCHEMES.find((s) => s.id === next.scheme) ?? SCHEMES[0];
      }

      function apply() {
        dispose?.();
        dispose = null;
        const scheme = resolve(choice);
        if (theme && scheme.id !== 'stock') {
          try {
            dispose = theme.overrideTokens(SOURCE, tokensOf(scheme));
          } catch (error) {
            console.warn('color-schemes: could not apply', error);
          }
        }
        const opaque = scheme.id !== 'stock' && (scheme.opaqueMacSidebar ?? choice.opaque);
        macStyle.textContent = (opaque ? MAC_CSS : '') + (scheme.pattern === 'dots' ? DOTS_CSS : '');
        if (!macStyle.isConnected) document.head.appendChild(macStyle);
      }

      return {
        get: () => choice,
        subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
        attachTheme(service) {
          theme = service;
          apply();
          return () => {
            dispose?.();
            dispose = null;
            theme = null;
          };
        },
        set(next) {
          const same = next.scheme === choice.scheme && next.custom === choice.custom && next.opaque === choice.opaque;
          choice = next;
          try {
            window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
          } catch {
            // private mode
          }
          if (!same) {
            apply();
            emit();
          }
        },
        remove() {
          dispose?.();
          dispose = null;
          macStyle.remove();
        },
      };
    }

    async function describe(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.value.namespaces.find((item) => item.ns === SETTINGS_NS);
    }

    async function write(ctx, ops) {
      let entry = await describe(ctx);
      if (!entry) throw new Error('settings namespace not mounted');
      let result = await ctx.remote.settings.mutate(SETTINGS_NS, ops, entry.revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        entry = await describe(ctx);
        result = await ctx.remote.settings.mutate(SETTINGS_NS, ops, entry.revision);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.value;
    }

    function fromValue(value) {
      return {
        scheme: typeof value?.scheme === 'string' ? value.scheme : 'stock',
        custom: typeof value?.custom === 'string' ? value.custom : '',
        opaque: value?.opaqueMacSidebar !== false,
      };
    }

    const CSS = `
.dsh-cs-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-cs-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-cs-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-cs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.dsh-cs-card { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; cursor: pointer; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); }
.dsh-cs-card:hover:not(:disabled) { border-color: var(--dsw-alias-label-secondary); }
.dsh-cs-card[aria-checked='true'] { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary); }
.dsh-cs-card:disabled { opacity: .5; cursor: default; }
.dsh-cs-card:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cs-name { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-cs-chip { font-size: 11px; line-height: 18px; font-weight: 500; padding: 0 8px; border-radius: 12px; border: 0.5px solid currentColor; color: var(--dsw-alias-brand-primary); white-space: nowrap; }
.dsh-cs-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cs-strip { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-cs-strip span.l { width: 34px; }
.dsh-cs-sw { display: flex; flex: 1; height: 18px; border-radius: 6px; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-cs-sw i { flex: 1; }
/* A simple on/off setting: a row, like the app's own. */
.dsh-cs-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cs-row + .dsh-cs-row { border-top: 0; }
.dsh-cs-row .t { flex: 1; min-width: 0; }
.dsh-cs-row .t div:first-child { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsh-cs-row .t div:last-child { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cs-switch { position: relative; box-sizing: border-box; width: 36px; height: 20px; flex: none; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; padding: 0; }
.dsh-cs-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-secondary)); transition: left .15s; }
.dsh-cs-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dsh-cs-switch[aria-checked='true']::after { left: 18px; background: var(--dsw-alias-bg-base); }
.dsh-cs-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cs-switch:disabled { opacity: .5; cursor: default; }
.dsh-cs-custom { color: var(--dsw-alias-label-primary); }
.dsh-cs-custom textarea { width: 100%; min-height: 120px; box-sizing: border-box; padding: 10px 14px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); font-family: var(--ds-font-family-code, monospace); font-size: 12px; line-height: 18px; resize: vertical; }
.dsh-cs-custom textarea:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 0; }
.dsh-cs-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-cs-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-cs-btn[disabled] { opacity: .5; cursor: default; }
.dsh-cs-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-cs-msg { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cs-msg[data-tone=bad] { color: var(--dsw-alias-state-error-primary); }
`;

    function Swatch({ label, colours }) {
      return h('div', { className: 'dsh-cs-strip' }, h('span', { className: 'l' }, label),
        h('span', { className: 'dsh-cs-sw', 'aria-hidden': true }, colours.map((c, i) => h('i', { key: i, style: { background: c } }))));
    }

    function ColoursPage({ appCtx, applier }) {
      const t = appCtx.locale.bind(NS);
      const choice = useSyncExternalStore(applier.subscribe, applier.get);
      const [status, setStatus] = useState('loading');
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState({ text: '', tone: '' });
      const [draft, setDraft] = useState(null);

      const load = useCallback(async () => {
        try {
          const entry = await describe(appCtx);
          if (!entry) { setStatus('missing'); return; }
          applier.set(fromValue(entry.value));
          setStatus('ready');
        } catch {
          setStatus((prev) => (prev === 'ready' ? prev : 'error'));
        }
      }, [appCtx, applier]);

      useEffect(() => { void load(); }, [load]);

      const save = async (ops, next) => {
        setBusy(true);
        setMsg({ text: '', tone: '' });
        const before = applier.get();
        applier.set(next);
        try {
          await write(appCtx, ops);
          return true;
        } catch (error) {
          applier.set(before);
          setMsg({ text: t('failed').replace('{message}', error.message), tone: 'bad' });
          return false;
        } finally {
          setBusy(false);
        }
      };

      if (status === 'loading') return h('p', null, t('loading'));
      if (status !== 'ready') return h('p', null, t('unavailable'));

      const cards = [...SCHEMES, { id: 'custom' }].map((scheme) => {
        const selected = choice.scheme === scheme.id;
        let custom = null;
        if (scheme.id === 'custom') {
          try { custom = parseCustom(choice.custom); } catch { custom = null; }
        }
        const label = scheme.id === 'custom' && custom?.label ? custom.label : t('scheme.' + scheme.id);
        const dark = scheme.id === 'stock' ? STOCK_SWATCH.dark : scheme.id === 'custom' ? null : scheme.swatch;
        const light = scheme.id === 'stock' ? STOCK_SWATCH.light : scheme.id === 'custom' ? null : scheme.swatchLight;
        const disabled = busy || (scheme.id === 'custom' && !custom);
        return h('button', {
          key: scheme.id, type: 'button', role: 'radio', className: 'dsh-cs-card', 'aria-checked': selected, disabled,
          onClick: () => { if (!selected) void save([{ op: 'set', path: ['scheme'], value: scheme.id }], { ...choice, scheme: scheme.id }); },
        },
        h('div', { className: 'dsh-cs-name' }, h('span', null, label), selected ? h('span', { className: 'dsh-cs-chip' }, t('in.use')) : null),
        h('div', { className: 'dsh-cs-desc' }, t('scheme.' + scheme.id + '.d')),
        light ? h(Swatch, { label: t('light'), colours: light }) : null,
        dark ? h(Swatch, { label: t('dark'), colours: dark }) : null);
      });

      const text = draft ?? choice.custom ?? '';
      return h('div', { className: 'dsh-cs-page' },
        h('div', { className: 'dsh-cs-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h('div', { className: 'dsh-cs-grid', role: 'radiogroup', 'aria-label': t('section.title') }, cards),
        h('div', { className: 'dsh-cs-row' },
          h('div', { className: 't' }, h('div', null, t('mac.opaque')), h('div', null, t('mac.opaque.hint'))),
          h('button', {
            type: 'button', role: 'switch', className: 'dsh-cs-switch', 'aria-checked': choice.opaque, 'aria-label': t('mac.opaque'), disabled: busy,
            onClick: () => void save([{ op: 'set', path: ['opaqueMacSidebar'], value: !choice.opaque }], { ...choice, opaque: !choice.opaque }),
          })),
        h('div', { className: 'dsh-cs-row dsh-cs-custom', style: { flexDirection: 'column', alignItems: 'stretch' } },
          h('div', { className: 't' }, h('div', null, t('custom.title')), h('div', null, t('custom.hint'))),
          h('textarea', { value: text, spellCheck: false, 'aria-label': t('custom.title'), placeholder: '{ "label": "My scheme", "dark": { "--dsw-alias-bg-base": "#101418" }, "light": {} }', onChange: (e) => setDraft(e.target.value) }),
          h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
            h('button', {
              type: 'button', className: 'dsh-cs-btn', disabled: busy,
              onClick: async () => {
                try {
                  if (text.trim()) parseCustom(text);
                } catch (error) {
                  setMsg({ text: t('custom.bad').replace('{message}', error.message), tone: 'bad' });
                  return;
                }
                if (await save([{ op: 'set', path: ['custom'], value: text }], { ...choice, custom: text })) {
                  setDraft(null);
                  setMsg({ text: t('custom.saved'), tone: '' });
                }
              },
            }, t('custom.save')),
            msg.text ? h('span', { className: 'dsh-cs-msg', 'data-tone': msg.tone, role: 'status' }, msg.text) : null)));
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const style = document.createElement('style');
        style.setAttribute('data-color-schemes-style', '');
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        const applier = createApplier(ctx);
        ctx.effect(() => () => applier.remove());
        // The theme service is optional: without it the page still works and nothing is recoloured.
        ctx.inject(['theme'], (inner) => {
          inner.effect(() => applier.attachTheme(inner.theme), 'color-schemes: overrides');
        });

        // Follow the saved choice (also changes made in another window).
        const refresh = async () => {
          try {
            const entry = await describe(ctx);
            if (entry) applier.set(fromValue(entry.value));
          } catch {
            // keep the last known choice
          }
        };
        void refresh();
        const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
        ctx.effect(() => () => clearInterval(timer));

        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'color-schemes', order: 4, label: () => t('section.title') },
              (props) => h(ColoursPage, { ...props, appCtx: ctx, applier }),
            ),
          ),
        );
      },
    };
  },
});
