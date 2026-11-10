window.__ModuleLoader__.load({
  id: '@local/dsh-model-tiers',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'model-tiers';
    const TIER_IDS = ['haiku', 'sonnet', 'opus', 'fable', 'code'];
    const EFFORTS = [
      { id: 'off', label: 'Off' },
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'extra-high', label: 'Extra high' },
      { id: 'ultra', label: 'Ultra Code' },
    ];
    const EFFORT_IDS = EFFORTS.map((effort) => effort.id);
    const ROLES = [
      { id: 'plan', label: 'Plan' },
      { id: 'implement', label: 'Implement' },
      { id: 'review', label: 'Review' },
      { id: 'fast', label: 'Fast' },
    ];
    const ROLE_IDS = ROLES.map((role) => role.id);

    const TIER_META = {
      haiku: {
        label: 'Haiku',
        short: 'H',
        role: 'Fast, cheap work: search, small edits, quick checks.',
      },
      sonnet: {
        label: 'Sonnet',
        short: 'S',
        role: 'Balanced default: planning and everyday coding.',
      },
      opus: {
        label: 'Opus',
        short: 'O',
        role: 'Deepest reasoning for hard problems.',
      },
      fable: {
        label: 'Fable',
        short: 'F',
        role: 'Long-context creative and exploratory work.',
      },
      code: {
        label: 'Code',
        short: 'C',
        role: 'Review-only tier: check, fix, and verify code.',
      },
    };

    const DEFAULT_TIERS = {
      haiku: {
        provider: 'omlx-max',
        model: 'Ornith-1.5-122B-oQ4e-mtp',
        effort: 'low',
        webSearch: true,
        webFetch: true,
        browser: true,
        subagents: true,
      },
      sonnet: {
        provider: 'omlx-max',
        model: 'claude-sonnet',
        effort: 'medium',
        webSearch: true,
        webFetch: true,
        browser: true,
        subagents: true,
      },
      opus: {
        provider: 'omlx-max',
        model: 'claude-opus',
        effort: 'high',
        webSearch: true,
        webFetch: true,
        browser: true,
        subagents: true,
      },
      fable: {
        provider: 'omlx-max',
        model: 'Qwen3.8-27B-TURBO-Fable-Cold-Fusion-735-882-Heretic-Uncensored-NM-DAU-mlx-oQ4e-1M',
        effort: 'medium',
        webSearch: true,
        webFetch: true,
        browser: true,
        subagents: true,
      },
      code: {
        provider: 'omlx-max',
        model: 'claude-opus',
        effort: 'ultra',
        webSearch: true,
        webFetch: true,
        browser: true,
        subagents: true,
      },
    };

    const DICT = {
      en: {
        'section.title': 'Model Tiers',
        'section.description':
          'Five model slots for planning, coding, and review. Each tier carries its own model, effort, internet access, and sub-agent policy.',
        'tier.haiku': 'Haiku',
        'tier.sonnet': 'Sonnet',
        'tier.opus': 'Opus',
        'tier.fable': 'Fable',
        'tier.code': 'Code',
        'effort.off': 'Off',
        'effort.low': 'Low',
        'effort.medium': 'Medium',
        'effort.high': 'High',
        'effort.extra-high': 'Extra high',
        'effort.ultra': 'Ultra Code',
        'settings.model': 'Model',
        'settings.provider': 'Provider',
        'settings.customModel': 'Model id',
        'settings.effort': 'Effort',
        'settings.webSearch': 'Web search',
        'settings.webFetch': 'Web fetch',
        'settings.browser': 'Browser',
        'settings.subagents': 'Sub-agents',
        'settings.cap': 'Max concurrent sub-agents',
        'settings.capHint': 'Applies to every tier. Default is 4.',
        'settings.ultraAuto': 'Ultra Code auto-delegation',
        'settings.ultraAutoHint':
          'At Ultra Code, push the model to split independent work across sub-agents instead of waiting to be asked.',
        'settings.active': 'Active session tiers',
        'settings.activeHint':
          'Sessions with a tier pinned in the composer. Clearing this returns every session to its normal model selection.',
        'settings.clearActive': 'Clear active tiers',
        'settings.saved': 'Saved',
        'settings.saving': 'Saving…',
        'settings.reset': 'Reset to defaults',
        'settings.loading': 'Loading model tiers…',
        'settings.noCatalog': 'No model catalog available. Enter provider and model ids manually.',
        'settings.writable': 'These tiers save to the active profile patch.',
        'composer.tier': 'Tier',
        'composer.configure': 'Configure tiers in Settings → Model Tiers',
        'composer.clear': 'Use normal model selection',
        'composer.noConfig': 'Model tiers are not configured yet.',
        'composer.busy': 'Switching…',
        'composer.failed': 'Could not switch tier',
        'composer.codeHint': 'Review, check, and fix code',
        'composer.net': 'Internet',
      },
      zh: {
        'section.title': '模型层级',
        'section.description':
          '用于规划、编码和审查的五个模型位。每个层级都有自己的模型、推理强度、网络权限和子代理策略。',
        'tier.haiku': 'Haiku',
        'tier.sonnet': 'Sonnet',
        'tier.opus': 'Opus',
        'tier.fable': 'Fable',
        'tier.code': 'Code',
        'effort.off': '关闭',
        'effort.low': '低',
        'effort.medium': '中',
        'effort.high': '高',
        'effort.extra-high': '极高',
        'effort.ultra': 'Ultra Code',
        'settings.model': '模型',
        'settings.provider': '提供商',
        'settings.customModel': '模型 ID',
        'settings.effort': '推理强度',
        'settings.webSearch': '网页搜索',
        'settings.webFetch': '网页抓取',
        'settings.browser': '浏览器',
        'settings.subagents': '子代理',
        'settings.cap': '最大并发的子代理数',
        'settings.capHint': '对所有层级生效，默认 4。',
        'settings.ultraAuto': 'Ultra Code 自动委派',
        'settings.ultraAutoHint': '在 Ultra Code 下主动把独立工作拆给子代理，而不是等待指令。',
        'settings.active': '当前会话的层级',
        'settings.activeHint': '在输入框中固定了层级的会话。清除后所有会话恢复普通模型选择。',
        'settings.clearActive': '清除已激活层级',
        'settings.saved': '已保存',
        'settings.saving': '保存中…',
        'settings.reset': '恢复默认值',
        'settings.loading': '正在加载模型层级…',
        'settings.noCatalog': '没有可用的模型目录，请手动填写提供商和模型 ID。',
        'settings.writable': '这些设置会写入当前配置补丁。',
        'composer.tier': '层级',
        'composer.configure': '在 设置 → 模型层级 中配置',
        'composer.clear': '使用普通模型选择',
        'composer.noConfig': '尚未配置模型层级。',
        'composer.busy': '切换中…',
        'composer.failed': '无法切换层级',
        'composer.codeHint': '审查、检查并修复代码',
        'composer.net': '网络',
      },
    };

    const CSS = `
.dsh-mt-wrap { position: relative; display: inline-flex; align-items: center; }
.dsh-mt-trigger {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12px; line-height: 1; cursor: pointer; white-space: nowrap;
}
.dsh-mt-trigger:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mt-trigger[data-open="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mt-trigger[disabled] { opacity: .55; cursor: default; }
.dsh-mt-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 5px; font-size: 10px; font-weight: 700;
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
}
.dsh-mt-chevron { font-size: 9px; opacity: .7; }
.dsh-mt-pop {
  position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 60; width: 356px;
  max-height: min(70vh, 520px); overflow: auto; padding: 6px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  box-shadow: 0 14px 36px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent);
}
.dsh-mt-pickerbox {
  display: flex; flex-direction: column; gap: 10px;
  padding: 2px 8px 10px; margin-bottom: 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mt-pophead {
  padding: 6px 8px 3px; font-size: 10px; font-weight: 650; letter-spacing: .03em;
  text-transform: uppercase; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-sampling { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; }
.dsh-mt-samplinghead {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  cursor: pointer; list-style: none;
}
.dsh-mt-samplinghead::-webkit-details-marker { display: none; }
.dsh-mt-sampling[open] > .dsh-mt-samplinghead { margin-bottom: 6px; }
.dsh-mt-samplingbody { display: flex; flex-direction: column; gap: 8px; }
.dsh-mt-rolelanes { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 4px; }
.dsh-mt-rolelanebuttons { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 8px 8px; }
.dsh-mt-rolelane {
  display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  padding: 4px 8px; font: inherit; font-size: 10px; cursor: pointer;
}
.dsh-mt-rolelane:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mt-rolelane[data-active="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
.dsh-mt-rolelaneroute {
  max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 9px; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-check {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dsh-mt-check input { accent-color: var(--dsw-alias-brand-primary); }
.dsh-mt-row {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px;
  border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; text-align: left; cursor: pointer;
}
.dsh-mt-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mt-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-mt-row[disabled] { opacity: .5; cursor: default; }
.dsh-mt-rowmain { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.dsh-mt-rowtitle { font-size: 13px; font-weight: 600; }
.dsh-mt-rowmeta { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mt-effort {
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 1px 6px; white-space: nowrap;
}
.dsh-mt-dots { display: inline-flex; gap: 3px; }
.dsh-mt-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-border-l2); }
.dsh-mt-dot[data-on="true"] { background: var(--dsw-alias-state-success-primary); }
.dsh-mt-foot {
  border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 6px; padding: 8px;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 11px; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-link {
  border: 0; background: transparent; color: var(--dsw-alias-brand-primary);
  font: inherit; font-size: 11px; cursor: pointer; padding: 0;
}
.dsh-mt-error { padding: 8px; font-size: 11px; color: var(--dsw-alias-state-error-primary); }
.dsh-mt-page { display: flex; flex-direction: column; gap: 16px; padding: 2px 0 36px; }
.dsh-mt-head h2 { margin: 0 0 4px; font-size: 18px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-mt-head p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); max-width: 68ch; }
.dsh-mt-tabs {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  position: sticky; top: 0; z-index: 2;
  padding: 6px 0; background: var(--dsw-alias-bg-base);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mt-tab {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px;
  padding: 6px 9px; cursor: pointer;
}
.dsh-mt-tab:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mt-tab[data-active="true"] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  color: var(--dsw-alias-brand-primary); font-weight: 650;
}
.dsh-mt-tabcount {
  font-size: 9px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px; padding: 0 4px; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-tabstatus {
  margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-tabstatus[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-mt-section { display: flex; flex-direction: column; gap: 16px; }
.dsh-mt-section[data-hidden="true"] { display: none; }
.dsh-mt-healthgrid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px;
}
.dsh-mt-healthcard {
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2); padding: 9px 10px;
}
.dsh-mt-healthvalue { font-size: 18px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-mt-healthlabel { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-healthrow {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mt-healthroute {
  display: inline-flex; align-items: center; gap: 7px; min-width: 0;
  font-size: 11px; color: var(--dsw-alias-label-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-healthmeta { font-size: 10px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-healthbadge {
  margin-left: auto; font-size: 10px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px; padding: 1px 7px; color: var(--dsw-alias-label-secondary);
}
.dsh-mt-healthbadge[data-state="ok"] { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
.dsh-mt-healthbadge[data-state="warning"] { color: var(--dsw-alias-state-warning-primary); border-color: currentColor; }
.dsh-mt-issue {
  font-size: 11px; line-height: 1.45; color: var(--dsw-alias-state-warning-primary);
  padding: 6px 0; border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; }
.dsh-mt-card {
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1); padding: 14px; display: flex; flex-direction: column; gap: 12px;
}
.dsh-mt-cardhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-mt-cardtitle { font-size: 14px; font-weight: 650; color: var(--dsw-alias-label-primary); }
.dsh-mt-cardrole { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.45; margin-top: -6px; }
.dsh-mt-profiles { display: flex; flex-direction: column; gap: 8px; }
.dsh-mt-profile {
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
  background: var(--dsw-alias-bg-base);
}
.dsh-mt-profilehead {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px;
  cursor: pointer; border-radius: 10px; list-style: none;
}
.dsh-mt-profilehead::-webkit-details-marker { display: none; }
.dsh-mt-profilehead:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mt-profilechevron {
  font-size: 10px; color: var(--dsw-alias-label-secondary);
  transition: transform .12s ease; transform: rotate(0deg);
}
.dsh-mt-profile[open] .dsh-mt-profilechevron { transform: rotate(90deg); }
.dsh-mt-profilebody { padding: 0 10px 10px; }
.dsh-mt-profilemeta {
  flex: 1; min-width: 0; font-size: 10px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-profilebadges { display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.dsh-mt-profilebadge {
  font-size: 9px; color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 1px 5px;
  white-space: nowrap;
}
.dsh-mt-profileused {
  font-size: 9px; color: var(--dsw-alias-brand-primary); white-space: nowrap;
}
.dsh-mt-customlist { display: flex; flex-direction: column; gap: 10px; }
.dsh-mt-customtier { display: block; padding: 0; }
.dsh-mt-customhead {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 14px; cursor: pointer; list-style: none; border-radius: 12px;
}
.dsh-mt-customhead::-webkit-details-marker { display: none; }
.dsh-mt-customhead:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mt-customtier[open] .dsh-mt-profilechevron { transform: rotate(90deg); }
.dsh-mt-custombody { padding: 0 14px 14px; }
.dsh-mt-customgrid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px;
}
.dsh-mt-span2 { grid-column: 1 / -1; }
.dsh-mt-textarea {
  width: 100%; box-sizing: border-box; min-height: 72px; padding: 7px 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px; line-height: 1.45; resize: vertical;
}
.dsh-mt-textarea:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); outline-offset: 1px; }
.dsh-mt-variantlist { display: flex; flex-direction: column; gap: 4px; }
.dsh-mt-variant {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: 11px; color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; padding: 4px 7px;
}
.dsh-mt-customtools {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  flex-wrap: wrap; margin-top: 12px; padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.dsh-mt-tierchecks { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.dsh-mt-tiercheck {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dsh-mt-tiercheck input { accent-color: var(--dsw-alias-brand-primary); }
.dsh-mt-projectassign {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px;
}
.dsh-mt-projectrow { display: flex; flex-direction: column; gap: 4px; }
.dsh-mt-projectname {
  font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsh-mt-profilegrid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px; margin-top: 8px;
}
.dsh-mt-profiletools {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-top: 10px;
}
.dsh-mt-addrow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dsh-mt-addrow .dsh-mt-input { flex: 1 1 120px; width: auto; }
.dsh-mt-addbox { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; }
.dsh-mt-addbox > summary { cursor: pointer; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-addbox[open] > summary { margin-bottom: 6px; }
.dsh-mt-fallback { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 8px; }
.dsh-mt-fallbackhead {
  cursor: pointer; list-style: none; font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-mt-fallbackhead::-webkit-details-marker { display: none; }
.dsh-mt-fallback[open] > .dsh-mt-fallbackhead { margin-bottom: 6px; }
.dsh-mt-fallbackbody { display: flex; flex-direction: column; gap: 6px; }
.dsh-mt-rolerow {
  display: grid; grid-template-columns: 62px minmax(0, 1fr) minmax(0, 1.3fr);
  gap: 6px; align-items: center;
}
.dsh-mt-rolelabel { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-mt-danger { color: var(--dsw-alias-state-error-primary); }
.dsh-mt-field { display: flex; flex-direction: column; gap: 5px; }
.dsh-mt-label { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.dsh-mt-select, .dsh-mt-input {
  width: 100%; box-sizing: border-box; height: 30px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
}
.dsh-mt-select:focus, .dsh-mt-input:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); outline-offset: 1px; }
.dsh-mt-backup {
  width: 100%; box-sizing: border-box; min-height: 140px; resize: vertical;
  padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45;
}
.dsh-mt-importopts { display: flex; flex-wrap: wrap; gap: 6px 12px; }
.dsh-mt-pair { display: grid; grid-template-columns: 1fr 1.6fr; gap: 6px; }
.dsh-mt-range { width: 100%; accent-color: var(--dsw-alias-brand-primary); margin: 4px 0 0; }
.dsh-mt-rangehead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-mt-rangevalue { font-size: 11px; font-weight: 650; color: var(--dsw-alias-brand-primary); }
.dsh-mt-ticks { display: flex; justify-content: space-between; font-size: 9px; color: var(--dsw-alias-label-secondary); gap: 2px; }
.dsh-mt-switches { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dsh-mt-switch {
  display: inline-flex; align-items: center; gap: 7px; border: 0; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; padding: 2px 0; text-align: left;
}
.dsh-mt-track {
  width: 26px; height: 15px; border-radius: 999px; flex: none;
  background: var(--dsw-alias-border-l2); position: relative; transition: background .12s ease;
}
.dsh-mt-track[data-on="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-mt-knob {
  position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%;
  background: var(--dsw-alias-bg-base); transition: transform .12s ease;
}
.dsh-mt-track[data-on="true"] .dsh-mt-knob { transform: translateX(11px); }
.dsh-mt-switch[aria-checked="true"] { color: var(--dsw-alias-label-primary); }
.dsh-mt-global { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; align-items: start; }
.dsh-mt-num { width: 92px; }
.dsh-mt-status { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); min-height: 16px; }
.dsh-mt-status[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-mt-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-mt-btn {
  height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer;
}
.dsh-mt-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-mt-btn[data-primary="true"] { background: var(--dsw-alias-brand-primary); border-color: transparent; color: var(--dsw-alias-bg-base); }
.dsh-mt-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.45; }
`;

    function Styles() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } });
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function parseActiveTiers(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    /**
     * Parse and normalize the per-model sampling registry.
     * @param {unknown} value - JSON string or object from settings.
     * @returns {Record<string, Record<string, object>>} provider -> model -> profile.
     */
    function normalizeModelProfiles(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : {};
        } catch {
          return {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result = {};
      for (const [provider, models] of Object.entries(parsed)) {
        if (!provider || !models || typeof models !== 'object' || Array.isArray(models)) continue;
        const normalizedModels = {};
        for (const [model, profile] of Object.entries(models)) {
          if (!model || !profile || typeof profile !== 'object' || Array.isArray(profile)) continue;
          const temperature =
            typeof profile.temperature === 'number' && Number.isFinite(profile.temperature)
              ? clamp(profile.temperature, 0, 2)
              : undefined;
          const maxTokens =
            typeof profile.maxTokens === 'number' &&
            Number.isFinite(profile.maxTokens) &&
            profile.maxTokens > 0
              ? Math.min(1_000_000, Math.floor(profile.maxTokens))
              : undefined;
          normalizedModels[model] = {
            label:
              typeof profile.label === 'string' && profile.label.trim()
                ? profile.label.trim()
                : model,
            wireEffort:
              typeof profile.wireEffort === 'string' && profile.wireEffort.trim()
                ? profile.wireEffort.trim()
                : undefined,
            temperature,
            maxTokens,
            enabled: profile.enabled !== false,
          };
        }
        if (Object.keys(normalizedModels).length > 0) result[provider] = normalizedModels;
      }
      return result;
    }

    /**
     * Resolve one enabled profile by exact route.
     * @param {Record<string, Record<string, object>>} profiles - normalized registry.
     * @param {string} provider - provider id.
     * @param {string} model - model id.
     * @returns {object | undefined} profile.
     */
    function profileFor(profiles, provider, model) {
      const profile = profiles?.[provider]?.[model];
      return profile?.enabled === false ? undefined : profile;
    }

    /**
     * Seed one model profile per distinct tier route.
     * @param {Record<string, object>} tiers - normalized tier definitions.
     * @returns {Record<string, Record<string, object>>} profile registry.
     */
    function profilesFromTiers(tiers) {
      const result = {};
      for (const tier of Object.values(tiers ?? {})) {
        if (!tier?.provider || !tier?.model) continue;
        const routes = [
          { provider: tier.provider, model: tier.model },
          ...(Array.isArray(tier.variants) ? tier.variants : []),
        ];
        for (const route of routes) {
          if (!route?.provider || !route?.model) continue;
          result[route.provider] ??= {};
          result[route.provider][route.model] ??= {
            label: route.model,
            wireEffort: undefined,
            temperature: undefined,
            maxTokens: undefined,
            enabled: true,
          };
        }
      }
      return result;
    }

    /**
     * Normalize one user-created tier. Invalid/duplicate ids are ignored so a
     * malformed custom entry can never break the built-in deck.
     */
    function normalizeCustomTier(value, index, usedIds) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const id = typeof value.id === 'string' ? value.id.trim().toLowerCase() : '';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || usedIds.has(id)) return undefined;
      const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
      const model = typeof value.model === 'string' ? value.model.trim() : '';
      if (!provider || !model) return undefined;
      const variants = [];
      if (Array.isArray(value.variants)) {
        for (const variant of value.variants) {
          if (!variant || typeof variant !== 'object') continue;
          const variantProvider = typeof variant.provider === 'string' ? variant.provider.trim() : '';
          const variantModel = typeof variant.model === 'string' ? variant.model.trim() : '';
          if (!variantProvider || !variantModel) continue;
          if (
            !variants.some(
              (entry) => entry.provider === variantProvider && entry.model === variantModel,
            )
          ) {
            variants.push({ provider: variantProvider, model: variantModel });
          }
        }
      }
      const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id;
      usedIds.add(id);
      return {
        id,
        name,
        short:
          typeof value.short === 'string' && value.short.trim()
            ? value.short.trim().slice(0, 2)
            : name.slice(0, 1).toUpperCase(),
        role: typeof value.role === 'string' ? value.role : '',
        prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 4000) : '',
        provider,
        model,
        effort: EFFORT_IDS.includes(value.effort) ? value.effort : 'medium',
        webSearch: value.webSearch !== false,
        webFetch: value.webFetch !== false,
        browser: value.browser !== false,
        subagents: value.subagents !== false,
        order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 100 + index,
        variants,
        custom: true,
      };
    }

    /**
     * Parse the custom-tier array from a JSON string or array.
     * @param {unknown} value - settings value.
     * @returns {object[]} normalized custom tiers.
     */
    function parseCustomTiers(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : [];
        } catch {
          return [];
        }
      }
      if (!Array.isArray(parsed)) return [];
      const usedIds = new Set(TIER_IDS);
      const result = [];
      for (const [index, entry] of parsed.entries()) {
        const tier = normalizeCustomTier(entry, index, usedIds);
        if (tier) result.push(tier);
      }
      result.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      return result;
    }

    function tierHasRoute(tier, provider, model) {
      if (!tier) return false;
      if (tier.provider === provider && tier.model === model) return true;
      return Array.isArray(tier.variants)
        ? tier.variants.some((variant) => variant.provider === provider && variant.model === model)
        : false;
    }

    function tierLabel(tier) {
      return tier?.name ?? tier?.id ?? 'Tier';
    }

    function tierMeta(config, id) {
      const tier = config?.tiers?.[id];
      if (tier) {
        return {
          label: tier.name ?? TIER_META[id]?.label ?? id,
          short: tier.short ?? TIER_META[id]?.short ?? '?',
          role: tier.role ?? TIER_META[id]?.role ?? '',
        };
      }
      return TIER_META[id] ?? { label: id, short: '?', role: '' };
    }

    /**
     * Normalize named tier decks and per-project assignments.
     * @param {unknown} value - JSON string or object.
     * @param {string[]} tierIds - currently valid tier ids.
     * @returns {{profiles: object[], projects: Record<string, {profileId: string}>}} normalized state.
     */
    function normalizeProjectProfiles(value, tierIds) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : {};
        } catch {
          parsed = {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { profiles: [], projects: {} };
      }
      const profiles = [];
      const usedIds = new Set();
      for (const [index, raw] of (Array.isArray(parsed.profiles) ? parsed.profiles : []).entries()) {
        if (!raw || typeof raw !== 'object') continue;
        const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || usedIds.has(id)) continue;
        const selectedTiers = Array.isArray(raw.tierIds)
          ? [...new Set(raw.tierIds.filter((tierId) => tierIds.includes(tierId)))]
          : [];
        if (selectedTiers.length === 0) continue;
        const name =
          typeof raw.name === 'string' && raw.name.trim()
            ? raw.name.trim()
            : `Profile ${index + 1}`;
        const defaultTierId = selectedTiers.includes(raw.defaultTierId)
          ? raw.defaultTierId
          : selectedTiers[0];
        usedIds.add(id);
        profiles.push({ id, name, tierIds: selectedTiers, defaultTierId });
      }
      const validProfileIds = new Set(profiles.map((profile) => profile.id));
      const projects = {};
      if (parsed.projects && typeof parsed.projects === 'object' && !Array.isArray(parsed.projects)) {
        for (const [key, project] of Object.entries(parsed.projects)) {
          if (!project || typeof project !== 'object') continue;
          if (typeof project.profileId === 'string' && validProfileIds.has(project.profileId)) {
            projects[key] = { profileId: project.profileId };
          }
        }
      }
      return { profiles, projects };
    }

    /**
     * Normalize per-session profile overrides, dropping ids no longer defined.
     * @param {unknown} value - JSON string or object.
     * @param {{profiles: object[]}} projectProfiles - normalized project profiles.
     * @returns {Record<string, string>} session id -> profile id.
     */
    function normalizeSessionProfiles(value, projectProfiles) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : {};
        } catch {
          parsed = {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const valid = new Set((projectProfiles?.profiles ?? []).map((profile) => profile.id));
      const result = {};
      for (const [sessionId, profileId] of Object.entries(parsed)) {
        if (typeof profileId === 'string' && valid.has(profileId)) result[sessionId] = profileId;
      }
      return result;
    }

    function normalizeFallbackChains(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : {};
        } catch {
          return {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result = {};
      for (const [tierId, routes] of Object.entries(parsed)) {
        if (!tierId || !Array.isArray(routes)) continue;
        const chain = [];
        for (const route of routes) {
          if (!route || typeof route !== 'object') continue;
          const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
          const model = typeof route.model === 'string' ? route.model.trim() : '';
          if (!provider || !model) continue;
          if (!chain.some((entry) => entry.provider === provider && entry.model === model)) {
            chain.push({ provider, model });
          }
        }
        if (chain.length > 0) result[tierId] = chain;
      }
      return result;
    }

    function normalizeRoleModels(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : {};
        } catch {
          return {};
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result = {};
      for (const [tierId, roles] of Object.entries(parsed)) {
        if (!tierId || !roles || typeof roles !== 'object' || Array.isArray(roles)) continue;
        const normalizedRoles = {};
        for (const role of ROLE_IDS) {
          const route = roles[role];
          if (!route || typeof route !== 'object') continue;
          const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
          const model = typeof route.model === 'string' ? route.model.trim() : '';
          if (provider && model) normalizedRoles[role] = { provider, model };
        }
        if (Object.keys(normalizedRoles).length > 0) result[tierId] = normalizedRoles;
      }
      return result;
    }

    function normalizeConfig(value) {
      const source = value ?? {};
      const tiers = {};
      for (const [index, id] of TIER_IDS.entries()) {
        const tier = source.tiers?.[id] ?? {};
        const fallback = DEFAULT_TIERS[id];
        tiers[id] = {
          id,
          name: TIER_META[id].label,
          short: TIER_META[id].short,
          role: TIER_META[id].role,
          prompt: '',
          custom: false,
          order: index,
          variants: [],
          provider: typeof tier.provider === 'string' ? tier.provider : fallback.provider,
          model: typeof tier.model === 'string' ? tier.model : fallback.model,
          effort: EFFORT_IDS.includes(tier.effort) ? tier.effort : fallback.effort,
          webSearch: tier.webSearch !== false,
          webFetch: tier.webFetch !== false,
          browser: tier.browser !== false,
          subagents: tier.subagents !== false,
        };
      }
      const customTiers = parseCustomTiers(source.customTiers);
      for (const tier of customTiers) tiers[tier.id] = tier;
      const deck = [...TIER_IDS.map((id) => tiers[id]), ...customTiers];
      const tierIds = deck.map((tier) => tier.id);
      const projectProfiles = normalizeProjectProfiles(source.projectProfiles, tierIds);
      const sessionProfiles = normalizeSessionProfiles(source.sessionProfiles, projectProfiles);
      const max = Number(source.maxSubagents);
      return {
        tiers,
        deck,
        tierIds,
        customTiers,
        projectProfiles,
        sessionProfiles,
        fallbackChains: normalizeFallbackChains(source.fallbackChains),
        roleModels: normalizeRoleModels(source.roleModels),
        maxSubagents: Number.isFinite(max) ? clamp(Math.round(max), 1, 8) : 4,
        ultraAutoDelegate: source.ultraAutoDelegate !== false,
        activeTiers: parseActiveTiers(source.activeTiers),
        modelProfiles: normalizeModelProfiles(source.modelProfiles),
        modelProfilesMigrated: source.modelProfilesMigrated === true,
      };
    }

    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw new Error('Settings service is unavailable in this Client.');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) {
        throw new Error(
          'The Model Tiers settings namespace is not mounted. Enable the Model Tiers plugin and reload the profile.',
        );
      }
      return { config: normalizeConfig(view.value), revision: view.revision };
    }

    async function loadCatalog(ctx) {
      if (!ctx.remote?.session) return null;
      try {
        const result = await ctx.remote.session.modelCatalog();
        return result.ok ? result.value : null;
      } catch {
        return null;
      }
    }

    function findCatalogModel(catalog, provider, model) {
      const group = catalog?.groups?.find((entry) => entry.id === provider);
      return group?.models?.find((entry) => entry.id === model);
    }

    function chooseEffort(levels, level) {
      const ids = (levels ?? []).map((entry) => ({ id: entry.id, key: String(entry.id).toLowerCase() }));
      if (ids.length === 0) return undefined;
      const preferences = {
        off: ['off', 'none', 'disabled', 'minimal'],
        low: ['low', 'minimal', 'light'],
        medium: ['medium', 'mid', 'moderate', 'default'],
        high: ['high', 'deep', 'extended'],
        'extra-high': ['xhigh', 'extra-high', 'extra_high', 'very-high', 'max'],
        ultra: ['ultra', 'max', 'xhigh', 'extra-high', 'high'],
      };
      for (const candidate of preferences[level] ?? []) {
        const hit = ids.find((entry) => entry.key === candidate);
        if (hit) return hit.id;
      }
      if (level === 'off') return ids[0].id;
      if (level === 'ultra') return ids[ids.length - 1].id;
      if (level === 'extra-high') return ids[Math.max(0, ids.length - 2)].id;
      return undefined;
    }

    async function mutateSettings(ctx, operations, revision) {
      let current = revision;
      let result = await ctx.remote.settings.mutate(NS, operations, current);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        current = fresh.revision;
        result = await ctx.remote.settings.mutate(NS, operations, current);
      }
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return { config: normalizeConfig(result.value.value), revision: result.value.revision };
    }

    /**
     * One-time migration: seed the route-keyed model registry from the current
     * tier routes so existing installs gain per-model sampling without a manual
     * step. The marker prevents re-seeding after a user edits or removes profiles.
     * @param {object} ctx - client plugin context.
     * @param {{config: object, revision: number}} settings - loaded settings.
     * @returns {Promise<{config: object, revision: number}>} migrated settings.
     */
    async function ensureModelProfiles(ctx, settings) {
      if (settings.config.modelProfilesMigrated) return settings;
      const seeded =
        Object.keys(settings.config.modelProfiles).length > 0
          ? settings.config.modelProfiles
          : profilesFromTiers(settings.config.tiers);
      try {
        return await mutateSettings(
          ctx,
          [
            { op: 'set', path: ['modelProfiles'], value: JSON.stringify(seeded) },
            { op: 'set', path: ['modelProfilesMigrated'], value: true },
          ],
          settings.revision,
        );
      } catch {
        // Manual import remains available in the Model profiles card.
        return settings;
      }
    }

    function Switch({ checked, label, onChange, disabled }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          className: 'dsh-mt-switch',
          disabled: disabled === true,
          onClick: () => onChange(!checked),
        },
        h('span', { className: 'dsh-mt-track', 'data-on': String(checked) }, h('span', { className: 'dsh-mt-knob' })),
        h('span', null, label),
      );
    }

    function ModelPicker({ tier, catalog, onChange }) {
      const [providerDraft, setProviderDraft] = useState(tier.provider);
      const [modelDraft, setModelDraft] = useState(tier.model);
      const [modelQuery, setModelQuery] = useState('');

      useEffect(() => {
        setProviderDraft(tier.provider);
        setModelDraft(tier.model);
      }, [tier.provider, tier.model]);

      const commit = () => {
        const provider = providerDraft.trim();
        const model = modelDraft.trim();
        if (!provider || !model) return;
        if (provider !== tier.provider || model !== tier.model) onChange(provider, model);
      };
      const onEnter = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      };

      const groups = catalog?.groups ?? [];
      const filter = modelQuery.trim().toLowerCase();
      const filteredGroups = filter
        ? groups
            .map((group) => {
              const groupMatch = `${group.name} ${group.id}`.toLowerCase().includes(filter);
              return {
                ...group,
                models: groupMatch
                  ? group.models
                  : group.models.filter((model) =>
                      `${model.name} ${model.id}`.toLowerCase().includes(filter),
                    ),
              };
            })
            .filter((group) => group.models.length > 0)
        : groups;
      const value = `${tier.provider}\u0000${tier.model}`;
      const known = groups.some(
        (group) => group.id === tier.provider && group.models.some((model) => model.id === tier.model),
      );
      const visible =
        known &&
        filteredGroups.some(
          (group) =>
            group.id === tier.provider && group.models.some((model) => model.id === tier.model),
        );
      const options = [];
      if ((!known || !visible) && tier.model) {
        options.push(
          h('option', { key: 'custom-current', value }, `${tier.provider} / ${tier.model}`),
        );
      }
      for (const group of filteredGroups) {
        options.push(
          h(
            'optgroup',
            { key: group.id, label: group.name },
            group.models.map((model) =>
              h('option', { key: `${group.id}:${model.id}`, value: `${group.id}\u0000${model.id}` }, model.name),
            ),
          ),
        );
      }
      return h(
        'div',
        { className: 'dsh-mt-field' },
        h('span', { className: 'dsh-mt-label' }, 'Model'),
        h('input', {
          className: 'dsh-mt-input',
          type: 'search',
          placeholder: 'Filter models…',
          value: modelQuery,
          'aria-label': 'Filter models',
          onChange: (event) => setModelQuery(event.target.value),
        }),
        h(
          'select',
          {
            className: 'dsh-mt-select',
            value,
            onChange: (event) => {
              const [provider, model] = event.target.value.split('\u0000');
              if (provider && model) onChange(provider, model);
            },
          },
          options,
        ),
        filter && filteredGroups.length === 0
          ? h('span', { className: 'dsh-mt-hint' }, 'No models match that filter.')
          : null,
        h(
          'div',
          { className: 'dsh-mt-pair' },
          h('input', {
            className: 'dsh-mt-input',
            value: providerDraft,
            spellCheck: false,
            'aria-label': 'Provider id',
            onChange: (event) => setProviderDraft(event.target.value),
            onBlur: commit,
            onKeyDown: onEnter,
          }),
          h('input', {
            className: 'dsh-mt-input',
            value: modelDraft,
            spellCheck: false,
            'aria-label': 'Model id',
            onChange: (event) => setModelDraft(event.target.value),
            onBlur: commit,
            onKeyDown: onEnter,
          }),
        ),
      );
    }

    function EffortRange({ effort, onChange }) {
      const index = Math.max(0, EFFORT_IDS.indexOf(effort));
      return h(
        'div',
        { className: 'dsh-mt-field' },
        h(
          'div',
          { className: 'dsh-mt-rangehead' },
          h('span', { className: 'dsh-mt-label' }, 'Effort'),
          h('span', { className: 'dsh-mt-rangevalue' }, EFFORTS[index].label),
        ),
        h('input', {
          className: 'dsh-mt-range',
          type: 'range',
          min: 0,
          max: EFFORTS.length - 1,
          step: 1,
          value: index,
          'aria-label': 'Effort level',
          onChange: (event) => onChange(EFFORT_IDS[Number(event.target.value)]),
        }),
        h(
          'div',
          { className: 'dsh-mt-ticks', 'aria-hidden': true },
          EFFORTS.map((entry) => h('span', { key: entry.id }, entry.label === 'Extra high' ? 'XHigh' : entry.label)),
        ),
      );
    }

    /**
     * Compact summary of one model profile.
     * @param {object | undefined} profile - enabled normalized profile.
     * @param {object | undefined} [rawProfile] - registry entry, including disabled.
     * @returns {string} display text.
     */
    function profileSummary(profile, rawProfile) {
      if (rawProfile && rawProfile.enabled === false) {
        return 'Model profile disabled; adapter defaults.';
      }
      if (!profile) return 'No model profile; adapter defaults.';
      const parts = [];
      if (profile.wireEffort) parts.push(`wire ${profile.wireEffort}`);
      if (typeof profile.temperature === 'number') parts.push(`temp ${profile.temperature}`);
      if (typeof profile.maxTokens === 'number') parts.push(`max ${profile.maxTokens}`);
      return parts.length > 0 ? `Model defaults: ${parts.join(' · ')}` : 'Model defaults: adapter defaults';
    }

    /** Parse an optional number input, clamped when present. */
    function optionalNumber(value, min, max) {
      if (String(value ?? '').trim() === '') return undefined;
      const number = Number(value);
      if (!Number.isFinite(number)) return undefined;
      return Math.min(max, Math.max(min, number));
    }

    /** Parse an optional positive integer input. */
    function optionalInteger(value) {
      if (String(value ?? '').trim() === '') return undefined;
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? Math.min(1_000_000, number) : undefined;
    }

    function ProfileRow({ provider, model, profile, efforts, usedBy = [], onChange, onDelete }) {
      const [label, setLabel] = useState(profile.label ?? model);
      const [wireEffort, setWireEffort] = useState(profile.wireEffort ?? '');
      const [temperature, setTemperature] = useState(
        profile.temperature === undefined ? '' : String(profile.temperature),
      );
      const [maxTokens, setMaxTokens] = useState(
        profile.maxTokens === undefined ? '' : String(profile.maxTokens),
      );
      const [confirmDelete, setConfirmDelete] = useState(false);

      useEffect(() => {
        setLabel(profile.label ?? model);
        setWireEffort(profile.wireEffort ?? '');
        setTemperature(profile.temperature === undefined ? '' : String(profile.temperature));
        setMaxTokens(profile.maxTokens === undefined ? '' : String(profile.maxTokens));
        setConfirmDelete(false);
      }, [provider, model, profile.label, profile.wireEffort, profile.temperature, profile.maxTokens]);

      const commit = (overrides = {}) => {
        onChange({
          label: (overrides.label ?? label).trim() || model,
          wireEffort: Object.hasOwn(overrides, 'wireEffort')
            ? overrides.wireEffort
            : wireEffort || undefined,
          temperature: optionalNumber(
            overrides.temperature !== undefined ? overrides.temperature : temperature,
            0,
            2,
          ),
          maxTokens: optionalInteger(
            overrides.maxTokens !== undefined ? overrides.maxTokens : maxTokens,
          ),
          enabled: overrides.enabled !== undefined ? overrides.enabled : profile.enabled !== false,
        });
      };
      const blurOnEnter = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.target.blur();
        }
      };

      const effortOptions = (efforts ?? []).map((entry) => ({ id: entry.id, name: entry.name ?? entry.id }));
      const staleEffort =
        wireEffort && !effortOptions.some((entry) => entry.id === wireEffort) ? wireEffort : undefined;

      return h(
        'details',
        { className: 'dsh-mt-profile' },
        h(
          'summary',
          { className: 'dsh-mt-profilehead' },
          h('span', { className: 'dsh-mt-profilechevron', 'aria-hidden': true }, '▸'),
          h('span', { className: 'dsh-mt-rowtitle' }, label || model),
          h('span', { className: 'dsh-mt-profilemeta' }, `${provider}/${model}`),
          h(
            'span',
            { className: 'dsh-mt-profilebadges' },
            h(
              'span',
              { className: 'dsh-mt-effort' },
              profile.enabled === false ? 'Disabled' : 'Enabled',
            ),
            h(
              'span',
              { className: 'dsh-mt-profilebadge' },
              profile.enabled === false
                ? 'ignored'
                : profileSummary(profile).replace('Model defaults: ', ''),
            ),
          ),
          usedBy.length > 0
            ? h('span', { className: 'dsh-mt-profileused' }, `Used by ${usedBy.join(', ')}`)
            : null,
        ),
        h(
          'div',
          { className: 'dsh-mt-profilebody' },
          h(
            'div',
            { className: 'dsh-mt-profilegrid' },
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Label'),
            h('input', {
              className: 'dsh-mt-input',
              value: label,
              'aria-label': 'Profile label',
              onChange: (event) => setLabel(event.target.value),
              onBlur: () => commit(),
              onKeyDown: blurOnEnter,
            }),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Wire effort'),
            h(
              'select',
              {
                className: 'dsh-mt-select',
                value: wireEffort,
                'aria-label': 'Wire effort',
                onChange: (event) => {
                  const next = event.target.value;
                  setWireEffort(next);
                  commit({ wireEffort: next || undefined });
                },
              },
              h('option', { value: '' }, 'Auto (from tier)'),
              effortOptions.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name)),
              staleEffort ? h('option', { value: staleEffort }, `Stale: ${staleEffort}`) : null,
            ),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Temperature'),
            h('input', {
              className: 'dsh-mt-input',
              type: 'number',
              min: 0,
              max: 2,
              step: 0.05,
              placeholder: 'Auto',
              value: temperature,
              'aria-label': 'Profile temperature',
              onChange: (event) => setTemperature(event.target.value),
              onBlur: () => commit(),
              onKeyDown: blurOnEnter,
            }),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Max tokens'),
            h('input', {
              className: 'dsh-mt-input',
              type: 'number',
              min: 1,
              max: 1000000,
              step: 1,
              placeholder: 'Auto',
              value: maxTokens,
              'aria-label': 'Profile max output tokens',
              onChange: (event) => setMaxTokens(event.target.value),
              onBlur: () => commit(),
              onKeyDown: blurOnEnter,
            }),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Enabled'),
            h(Switch, {
              checked: profile.enabled !== false,
              label: 'Use profile',
              onChange: (value) => commit({ enabled: value }),
            }),
          ),
        ),
          h(
            'div',
            { className: 'dsh-mt-profiletools' },
            usedBy.length > 0
              ? h(
                  'span',
                  { className: 'dsh-mt-hint' },
                  `Removing this profile falls back to adapter defaults for ${usedBy.join(', ')}.`,
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn dsh-mt-danger',
                onClick: () => {
                  if (usedBy.length > 0 && !confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete();
                },
              },
              confirmDelete ? 'Click again to remove' : 'Remove',
            ),
          ),
        ),
      );
    }

    function ModelProfilesEditor({ profiles, tiers, catalog, onSave }) {
      const [provider, setProvider] = useState('');
      const [model, setModel] = useState('');
      const [label, setLabel] = useState('');
      const [profileQuery, setProfileQuery] = useState('');
      const [addError, setAddError] = useState('');

      const entries = [];
      for (const [providerId, models] of Object.entries(profiles ?? {})) {
        for (const [modelId, profile] of Object.entries(models ?? {})) {
          entries.push({ provider: providerId, model: modelId, profile });
        }
      }
      entries.sort((a, b) =>
        `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`),
      );
      const query = profileQuery.trim().toLowerCase();
      const visibleEntries = query
        ? entries.filter((entry) =>
            `${entry.provider}/${entry.model} ${entry.profile.label}`
              .toLowerCase()
              .includes(query),
          )
        : entries;
      const usedBy = (providerId, modelId) =>
        Object.values(tiers ?? {})
          .filter((tier) => tierHasRoute(tier, providerId, modelId))
          .map((tier) => tierLabel(tier));

      const update = (providerId, modelId, nextProfile) => {
        const next = JSON.parse(JSON.stringify(profiles ?? {}));
        next[providerId] ??= {};
        next[providerId][modelId] = nextProfile;
        onSave(next);
      };
      const remove = (providerId, modelId) => {
        const next = JSON.parse(JSON.stringify(profiles ?? {}));
        if (next[providerId]) {
          delete next[providerId][modelId];
          if (Object.keys(next[providerId]).length === 0) delete next[providerId];
        }
        onSave(next);
      };
      const add = () => {
        const nextProvider = provider.trim();
        const nextModel = model.trim();
        if (!nextProvider || !nextModel) {
          setAddError('Provider and model are required.');
          return;
        }
        if (profiles?.[nextProvider]?.[nextModel]) {
          setAddError('That route already has a profile.');
          return;
        }
        const next = JSON.parse(JSON.stringify(profiles ?? {}));
        next[nextProvider] ??= {};
        next[nextProvider][nextModel] = {
          label: label.trim() || nextModel,
          wireEffort: undefined,
          temperature: undefined,
          maxTokens: undefined,
          enabled: true,
        };
        onSave(next);
        setAddError('');
        setProvider('');
        setModel('');
        setLabel('');
      };
      const importTiers = () => {
        setAddError('');
        const next = JSON.parse(JSON.stringify(profiles ?? {}));
        const seeded = profilesFromTiers(tiers);
        for (const [providerId, models] of Object.entries(seeded)) {
          next[providerId] ??= {};
          for (const [modelId, profile] of Object.entries(models)) {
            next[providerId][modelId] ??= profile;
          }
        }
        onSave(next);
      };

      return h(
        'div',
        { className: 'dsh-mt-card' },
        h(
          'div',
          { className: 'dsh-mt-cardhead' },
          h('span', { className: 'dsh-mt-cardtitle' }, 'Model profiles'),
          h('span', { className: 'dsh-mt-effort' }, `${entries.length} configured`),
          h(
            'button',
            { type: 'button', className: 'dsh-mt-btn', onClick: importTiers },
            'Import tier routes',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-hint' },
          'Sampling defaults attach to a provider/model route and are shared by every tier using that model. Wire effort is pinned only when the adapter advertises it; otherwise the tier behavior chooses the nearest effort.',
        ),
        entries.length > 0
          ? h('input', {
              className: 'dsh-mt-input',
              type: 'search',
              placeholder: 'Filter profiles…',
              value: profileQuery,
              'aria-label': 'Filter model profiles',
              onChange: (event) => setProfileQuery(event.target.value),
            })
          : null,
        entries.length > 0
          ? h(
              'div',
              { className: 'dsh-mt-profiles' },
              visibleEntries.map((entry) =>
                h(ProfileRow, {
                  key: `${entry.provider}:${entry.model}`,
                  provider: entry.provider,
                  model: entry.model,
                  profile: entry.profile,
                  usedBy: usedBy(entry.provider, entry.model),
                  efforts: findCatalogModel(catalog, entry.provider, entry.model)?.reasoning?.efforts,
                  onChange: (nextProfile) => update(entry.provider, entry.model, nextProfile),
                  onDelete: () => remove(entry.provider, entry.model),
                }),
              ),
              query && visibleEntries.length === 0
                ? h('div', { className: 'dsh-mt-hint' }, 'No profiles match that filter.')
                : null,
            )
          : h(
              'div',
              { className: 'dsh-mt-hint' },
              'No model profiles yet. Import the current tier routes or add a model below.',
            ),
        h(
          'details',
          { className: 'dsh-mt-addbox' },
          h('summary', null, 'Add a model manually'),
          h(
            'div',
            { className: 'dsh-mt-addrow' },
            h('input', {
              className: 'dsh-mt-input',
              placeholder: 'Provider',
              value: provider,
              spellCheck: false,
              'aria-label': 'Provider id',
              onChange: (event) => {
                setProvider(event.target.value);
                setAddError('');
              },
            }),
            h('input', {
              className: 'dsh-mt-input',
              placeholder: 'Model id',
              value: model,
              spellCheck: false,
              'aria-label': 'Model id',
              onChange: (event) => {
                setModel(event.target.value);
                setAddError('');
              },
            }),
            h('input', {
              className: 'dsh-mt-input',
              placeholder: 'Label (optional)',
              value: label,
              'aria-label': 'Profile label',
              onChange: (event) => {
                setLabel(event.target.value);
                setAddError('');
              },
            }),
            h('button', { type: 'button', className: 'dsh-mt-btn', onClick: add }, 'Add model'),
          ),
          addError ? h('div', { className: 'dsh-mt-error' }, addError) : null,
        ),
      );
    }

    function RoleRouteRow({ role, label, route, onChange }) {
      const [provider, setProvider] = useState(route?.provider ?? '');
      const [model, setModel] = useState(route?.model ?? '');
      useEffect(() => {
        setProvider(route?.provider ?? '');
        setModel(route?.model ?? '');
      }, [route?.provider, route?.model]);

      const commit = () => {
        const nextProvider = provider.trim();
        const nextModel = model.trim();
        onChange(nextProvider && nextModel ? { provider: nextProvider, model: nextModel } : null);
      };

      return h(
        'div',
        { className: 'dsh-mt-rolerow' },
        h('span', { className: 'dsh-mt-rolelabel' }, label),
        h('input', {
          className: 'dsh-mt-input',
          placeholder: 'provider',
          value: provider,
          spellCheck: false,
          'aria-label': `${label} role provider`,
          onChange: (event) => setProvider(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.target.blur();
            }
          },
        }),
        h('input', {
          className: 'dsh-mt-input',
          placeholder: 'model',
          value: model,
          spellCheck: false,
          'aria-label': `${label} role model`,
          onChange: (event) => setModel(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.target.blur();
            }
          },
        }),
      );
    }

    function RoleModelsEditor({ tierId, roles, onChange }) {
      const tierRoles = roles?.[tierId] ?? {};
      const configured = ROLE_IDS.filter((role) => tierRoles[role]);
      const update = (role, route) => {
        const nextRoles = { ...tierRoles };
        if (route) nextRoles[role] = route;
        else delete nextRoles[role];
        const next = { ...(roles ?? {}) };
        if (Object.keys(nextRoles).length > 0) next[tierId] = nextRoles;
        else delete next[tierId];
        onChange(next);
      };

      return h(
        'details',
        { className: 'dsh-mt-fallback dsh-mt-roles' },
        h(
          'summary',
          { className: 'dsh-mt-fallbackhead' },
          `Role models (${configured.length})`,
        ),
        h(
          'div',
          { className: 'dsh-mt-fallbackbody' },
          h(
            'span',
            { className: 'dsh-mt-hint' },
            'Used by delegate_role, review_lanes, and run_pipeline. Children keep this tier as their access and delegation policy.',
          ),
          ROLES.map((role) =>
            h(RoleRouteRow, {
              key: role.id,
              role: role.id,
              label: role.label,
              route: tierRoles[role.id],
              onChange: (route) => update(role.id, route),
            }),
          ),
        ),
      );
    }

    function FallbackEditor({ tierId, chains, onChange }) {
      const chain = chains?.[tierId] ?? [];
      const [provider, setProvider] = useState('');
      const [model, setModel] = useState('');

      const save = (nextChain) => {
        const next = { ...(chains ?? {}) };
        if (nextChain.length > 0) next[tierId] = nextChain;
        else delete next[tierId];
        onChange(next);
      };
      const add = () => {
        const nextProvider = provider.trim();
        const nextModel = model.trim();
        if (!nextProvider || !nextModel) return;
        if (chain.some((route) => route.provider === nextProvider && route.model === nextModel)) return;
        save([...chain, { provider: nextProvider, model: nextModel }]);
        setProvider('');
        setModel('');
      };
      const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= chain.length) return;
        const next = [...chain];
        [next[index], next[target]] = [next[target], next[index]];
        save(next);
      };

      return h(
        'details',
        { className: 'dsh-mt-fallback' },
        h(
          'summary',
          { className: 'dsh-mt-fallbackhead' },
          `Fallback chain (${chain.length})`,
        ),
        h(
          'div',
          { className: 'dsh-mt-fallbackbody' },
          chain.length > 0
          ? h(
              'div',
              { className: 'dsh-mt-variantlist' },
              chain.map((route, index) =>
                h(
                  'div',
                  { className: 'dsh-mt-variant', key: `${route.provider}:${route.model}` },
                  h('span', null, `${index + 1}. ${route.provider}/${route.model}`),
                  h(
                    'span',
                    { className: 'dsh-mt-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-link',
                        disabled: index === 0,
                        onClick: () => move(index, -1),
                      },
                      '↑',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-link',
                        disabled: index === chain.length - 1,
                        onClick: () => move(index, 1),
                      },
                      '↓',
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-link',
                        onClick: () => save(chain.filter((_, position) => position !== index)),
                      },
                      'Remove',
                    ),
                  ),
                ),
              ),
            )
          : h('span', { className: 'dsh-mt-hint' }, 'No fallback routes. Primary/variant remains the only route.'),
        h(
          'div',
          { className: 'dsh-mt-addrow' },
          h('input', {
            className: 'dsh-mt-input',
            placeholder: 'Fallback provider',
            value: provider,
            spellCheck: false,
            'aria-label': `Fallback provider for ${tierId}`,
            onChange: (event) => setProvider(event.target.value),
          }),
          h('input', {
            className: 'dsh-mt-input',
            placeholder: 'Fallback model',
            value: model,
            spellCheck: false,
            'aria-label': `Fallback model for ${tierId}`,
            onChange: (event) => setModel(event.target.value),
          }),
          h('button', { type: 'button', className: 'dsh-mt-btn', onClick: add }, 'Add fallback'),
        ),
        ),
      );
    }

    function CustomTierCard({
      tier,
      tiers,
      catalog,
      profiles,
      fallbacks,
      roles,
      activeCount,
      canMoveUp,
      canMoveDown,
      onChange,
      onDelete,
      onDuplicate,
      onMoveUp,
      onMoveDown,
      onFallbacks,
      onRoles,
    }) {
      const [name, setName] = useState(tier.name);
      const [short, setShort] = useState(tier.short);
      const [role, setRole] = useState(tier.role);
      const [prompt, setPrompt] = useState(tier.prompt);
      const [variantProvider, setVariantProvider] = useState('');
      const [variantModel, setVariantModel] = useState('');
      const [confirmDelete, setConfirmDelete] = useState(false);

      useEffect(() => {
        setName(tier.name);
        setShort(tier.short);
        setRole(tier.role);
        setPrompt(tier.prompt);
        setConfirmDelete(false);
      }, [tier.id, tier.name, tier.short, tier.role, tier.prompt]);

      const commit = (overrides = {}) => {
        onChange({
          ...tier,
          name: (overrides.name ?? name).trim() || tier.name,
          short: (overrides.short ?? short).trim().slice(0, 2) || tier.short,
          role: overrides.role ?? role,
          prompt: (overrides.prompt ?? prompt).slice(0, 4000),
        });
      };
      const blurOnEnter = (event) => {
        if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          event.target.blur();
        }
      };
      const addVariant = () => {
        const provider = variantProvider.trim();
        const model = variantModel.trim();
        if (!provider || !model) return;
        if (tier.variants.some((variant) => variant.provider === provider && variant.model === model)) return;
        onChange({ ...tier, variants: [...tier.variants, { provider, model }] });
        setVariantProvider('');
        setVariantModel('');
      };
      const removeVariant = (index) => {
        onChange({ ...tier, variants: tier.variants.filter((_, position) => position !== index) });
      };

      return h(
        'details',
        { className: 'dsh-mt-card dsh-mt-customtier' },
        h(
          'summary',
          { className: 'dsh-mt-customhead' },
          h('span', { className: 'dsh-mt-profilechevron', 'aria-hidden': true }, '▸'),
          h('span', { className: 'dsh-mt-badge' }, short),
          h('span', { className: 'dsh-mt-cardtitle' }, name),
          h('span', { className: 'dsh-mt-profilemeta' }, `${tier.id} · ${customRouteLabel(tier)}`),
          activeCount > 0
            ? h('span', { className: 'dsh-mt-profileused' }, `${activeCount} active session${activeCount === 1 ? '' : 's'}`)
            : null,
        ),
        h(
          'div',
          { className: 'dsh-mt-custombody' },
          h(
            'div',
            { className: 'dsh-mt-customgrid' },
            h(
              'div',
              { className: 'dsh-mt-field' },
              h('span', { className: 'dsh-mt-label' }, 'Name'),
              h('input', {
                className: 'dsh-mt-input',
                value: name,
                'aria-label': 'Tier name',
                onChange: (event) => setName(event.target.value),
                onBlur: () => commit(),
                onKeyDown: blurOnEnter,
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field' },
              h('span', { className: 'dsh-mt-label' }, 'Badge'),
              h('input', {
                className: 'dsh-mt-input',
                value: short,
                maxLength: 2,
                'aria-label': 'Tier badge',
                onChange: (event) => setShort(event.target.value),
                onBlur: () => commit(),
                onKeyDown: blurOnEnter,
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Role summary'),
              h('input', {
                className: 'dsh-mt-input',
                value: role,
                placeholder: 'e.g. Fast frontend checks',
                'aria-label': 'Tier role summary',
                onChange: (event) => setRole(event.target.value),
                onBlur: () => commit(),
                onKeyDown: blurOnEnter,
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-span2' },
              h(ModelPicker, {
                tier,
                catalog,
                onChange: (provider, model) => onChange({ ...tier, provider, model }),
              }),
              h(
                'div',
                { className: 'dsh-mt-hint' },
                profileSummary(
                  profileFor(profiles, tier.provider, tier.model),
                  profiles?.[tier.provider]?.[tier.model],
                ),
              ),
            ),
            h(
              'div',
              { className: 'dsh-mt-span2' },
              h(EffortRange, {
                effort: tier.effort,
                onChange: (effort) => onChange({ ...tier, effort }),
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Access'),
              h(
                'div',
                { className: 'dsh-mt-switches' },
                h(Switch, {
                  checked: tier.webSearch,
                  label: 'Web search',
                  onChange: (value) => onChange({ ...tier, webSearch: value }),
                }),
                h(Switch, {
                  checked: tier.webFetch,
                  label: 'Web fetch',
                  onChange: (value) => onChange({ ...tier, webFetch: value }),
                }),
                h(Switch, {
                  checked: tier.browser,
                  label: 'Browser',
                  onChange: (value) => onChange({ ...tier, browser: value }),
                }),
                h(Switch, {
                  checked: tier.subagents,
                  label: 'Sub-agents',
                  onChange: (value) => onChange({ ...tier, subagents: value }),
                }),
              ),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Tier instructions'),
              h('textarea', {
                className: 'dsh-mt-textarea',
                rows: 4,
                value: prompt,
                placeholder: 'Optional role and behavior instructions injected when this tier is active.',
                'aria-label': 'Tier instructions',
                onChange: (event) => setPrompt(event.target.value),
                onBlur: () => commit(),
                onKeyDown: blurOnEnter,
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, `Variants (${tier.variants.length})`),
              tier.variants.length > 0
                ? h(
                    'div',
                    { className: 'dsh-mt-variantlist' },
                    tier.variants.map((variant, index) =>
                      h(
                        'div',
                        { className: 'dsh-mt-variant', key: `${variant.provider}:${variant.model}` },
                        h('span', null, `${variant.provider}/${variant.model}`),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-mt-link',
                            onClick: () => removeVariant(index),
                          },
                          'Remove',
                        ),
                      ),
                    ),
                  )
                : h('span', { className: 'dsh-mt-hint' }, 'No variants. The primary model is the only route.'),
              h(
                'div',
                { className: 'dsh-mt-addrow' },
                h('input', {
                  className: 'dsh-mt-input',
                  placeholder: 'Variant provider',
                  value: variantProvider,
                  spellCheck: false,
                  'aria-label': 'Variant provider',
                  onChange: (event) => setVariantProvider(event.target.value),
                }),
                h('input', {
                  className: 'dsh-mt-input',
                  placeholder: 'Variant model',
                  value: variantModel,
                  spellCheck: false,
                  'aria-label': 'Variant model',
                  onChange: (event) => setVariantModel(event.target.value),
                }),
                h('button', { type: 'button', className: 'dsh-mt-btn', onClick: addVariant }, 'Add variant'),
              ),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h(FallbackEditor, {
                tierId: tier.id,
                chains: fallbacks,
                onChange: onFallbacks,
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h(RoleModelsEditor, {
                tierId: tier.id,
                roles,
                onChange: onRoles,
              }),
            ),
          ),
          h(
            'div',
            { className: 'dsh-mt-customtools' },
            h(
              'div',
              { className: 'dsh-mt-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mt-btn',
                  disabled: !canMoveUp,
                  onClick: onMoveUp,
                },
                'Move up',
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-mt-btn',
                  disabled: !canMoveDown,
                  onClick: onMoveDown,
                },
                'Move down',
              ),
              h('button', { type: 'button', className: 'dsh-mt-btn', onClick: onDuplicate }, 'Duplicate'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn dsh-mt-danger',
                onClick: () => {
                  if (activeCount > 0 && !confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete();
                },
              },
              confirmDelete ? 'Click again to delete' : 'Delete tier',
            ),
          ),
        ),
      );
    }

    function CustomTiersEditor({
      customTiers,
      tiers,
      catalog,
      profiles,
      fallbacks,
      roles,
      activeTiers,
      onSave,
      onFallbacks,
      onRoles,
    }) {
      const nextOrder = () =>
        customTiers.reduce((max, tier) => Math.max(max, tier.order ?? 0), 0) + 10;

      const addTier = () => {
        const template = tiers.haiku ?? Object.values(tiers ?? {})[0] ?? {};
        const id = uniqueCustomId('New tier', tiers);
        const next = [
          ...customTiers,
          {
            id,
            name: 'New tier',
            short: 'N',
            role: '',
            prompt: '',
            provider: template.provider ?? '',
            model: template.model ?? '',
            effort: 'medium',
            webSearch: true,
            webFetch: true,
            browser: true,
            subagents: true,
            order: nextOrder(),
            variants: [],
            custom: true,
          },
        ];
        onSave(next);
      };
      const update = (id, nextTier) =>
        onSave(customTiers.map((tier) => (tier.id === id ? nextTier : tier)));
      const remove = (id) => onSave(customTiers.filter((tier) => tier.id !== id));
      const duplicate = (tier) => {
        const id = uniqueCustomId(`${tier.name} copy`, tiers);
        onSave([
          ...customTiers,
          {
            ...tier,
            id,
            name: `${tier.name} copy`,
            order: nextOrder(),
            variants: tier.variants.map((variant) => ({ ...variant })),
          },
        ]);
      };
      const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= customTiers.length) return;
        const next = [...customTiers];
        [next[index], next[target]] = [next[target], next[index]];
        onSave(next.map((tier, position) => ({ ...tier, order: position * 10 })));
      };

      return h(
        'div',
        { className: 'dsh-mt-card' },
        h(
          'div',
          { className: 'dsh-mt-cardhead' },
          h('span', { className: 'dsh-mt-cardtitle' }, 'Custom tiers'),
          h('span', { className: 'dsh-mt-effort' }, `${customTiers.length} custom`),
          h('button', { type: 'button', className: 'dsh-mt-btn', onClick: addTier }, 'New tier'),
        ),
        h(
          'div',
          { className: 'dsh-mt-hint' },
          'Custom tiers are additive. Built-in tiers stay untouched; custom tiers inherit the same access, sub-agent, Ultra, and model-profile behavior.',
        ),
        customTiers.length > 0
          ? h(
              'div',
              { className: 'dsh-mt-customlist' },
              customTiers.map((tier, index) =>
                h(CustomTierCard, {
                  key: tier.id,
                  tier,
                  tiers,
                  catalog,
                  profiles,
                  fallbacks,
                  roles,
                  activeCount: activeTierCount(activeTiers, tier.id),
                  canMoveUp: index > 0,
                  canMoveDown: index < customTiers.length - 1,
                  onChange: (nextTier) => update(tier.id, nextTier),
                  onDelete: () => remove(tier.id),
                  onDuplicate: () => duplicate(tier),
                  onMoveUp: () => move(index, -1),
                  onMoveDown: () => move(index, 1),
                  onFallbacks,
                  onRoles,
                }),
              ),
            )
          : h(
              'div',
              { className: 'dsh-mt-hint' },
              'No custom tiers yet. Use New tier to create one; the five built-ins remain available.',
            ),
      );
    }

    function ProjectProfileCard({ profile, deck, assignedCount, onChange, onDelete }) {
      const [name, setName] = useState(profile.name);
      const [confirmDelete, setConfirmDelete] = useState(false);
      useEffect(() => {
        setName(profile.name);
        setConfirmDelete(false);
      }, [profile.id, profile.name]);

      const commitName = () => {
        const next = name.trim() || profile.name;
        setName(next);
        if (next !== profile.name) onChange({ ...profile, name: next });
      };
      const toggleTier = (tierId) => {
        const selected = profile.tierIds.includes(tierId);
        const nextTiers = selected
          ? profile.tierIds.filter((id) => id !== tierId)
          : [...profile.tierIds, tierId];
        if (nextTiers.length === 0) return;
        onChange({
          ...profile,
          tierIds: nextTiers,
          defaultTierId: nextTiers.includes(profile.defaultTierId)
            ? profile.defaultTierId
            : nextTiers[0],
        });
      };
      const defaultTier = deck.find((tier) => tier.id === profile.defaultTierId);

      return h(
        'details',
        { className: 'dsh-mt-card dsh-mt-customtier' },
        h(
          'summary',
          { className: 'dsh-mt-customhead' },
          h('span', { className: 'dsh-mt-profilechevron', 'aria-hidden': true }, '▸'),
          h('span', { className: 'dsh-mt-cardtitle' }, name),
          h(
            'span',
            { className: 'dsh-mt-profilemeta' },
            `${profile.tierIds.length} tiers · default ${defaultTier ? tierLabel(defaultTier) : '—'}`,
          ),
          assignedCount > 0
            ? h('span', { className: 'dsh-mt-profileused' }, `${assignedCount} project${assignedCount === 1 ? '' : 's'}`)
            : null,
        ),
        h(
          'div',
          { className: 'dsh-mt-custombody' },
          h(
            'div',
            { className: 'dsh-mt-customgrid' },
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Profile name'),
              h('input', {
                className: 'dsh-mt-input',
                value: name,
                'aria-label': 'Project profile name',
                onChange: (event) => setName(event.target.value),
                onBlur: commitName,
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.target.blur();
                  }
                },
              }),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Default tier'),
              h(
                'select',
                {
                  className: 'dsh-mt-select',
                  value: profile.defaultTierId,
                  'aria-label': 'Profile default tier',
                  onChange: (event) =>
                    onChange({ ...profile, defaultTierId: event.target.value }),
                },
                profile.tierIds.map((tierId) => {
                  const tier = deck.find((entry) => entry.id === tierId);
                  return h('option', { key: tierId, value: tierId }, tierLabel(tier));
                }),
              ),
            ),
            h(
              'div',
              { className: 'dsh-mt-field dsh-mt-span2' },
              h('span', { className: 'dsh-mt-label' }, 'Tiers in this profile'),
              h(
                'div',
                { className: 'dsh-mt-tierchecks' },
                deck.map((tier) => {
                  const checked = profile.tierIds.includes(tier.id);
                  const isLast = checked && profile.tierIds.length === 1;
                  return h(
                    'label',
                    { className: 'dsh-mt-tiercheck', key: tier.id },
                    h('input', {
                      type: 'checkbox',
                      checked,
                      disabled: isLast,
                      onChange: () => toggleTier(tier.id),
                    }),
                    h('span', null, tierLabel(tier)),
                  );
                }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsh-mt-customtools' },
            h('span', { className: 'dsh-mt-hint' }, 'Profiles only filter the selector; tiers and routing are unchanged.'),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn dsh-mt-danger',
                onClick: () => {
                  if (assignedCount > 0 && !confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete();
                },
              },
              confirmDelete ? 'Click again to delete' : 'Delete profile',
            ),
          ),
        ),
      );
    }

    function ProjectProfilesEditor({ projectProfiles, deck, workspaceRows, onSave }) {
      const profiles = projectProfiles?.profiles ?? [];
      const projects = projectProfiles?.projects ?? {};
      const assignedCount = (profileId) =>
        Object.values(projects).filter((project) => project?.profileId === profileId).length;
      const update = (nextProfile) =>
        onSave({
          profiles: profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile)),
          projects,
        });
      const remove = (profileId) =>
        onSave({
          profiles: profiles.filter((profile) => profile.id !== profileId),
          projects: Object.fromEntries(
            Object.entries(projects).filter(([, project]) => project?.profileId !== profileId),
          ),
        });
      const add = () => {
        const used = new Set(profiles.map((profile) => profile.id));
        let id = `profile-${slugify('New profile') || 'new'}`;
        let suffix = 2;
        while (used.has(id)) id = `profile-new-${suffix++}`;
        onSave({
          profiles: [
            ...profiles,
            {
              id,
              name: 'New profile',
              tierIds: deck.map((tier) => tier.id),
              defaultTierId: deck[0]?.id ?? '',
            },
          ],
          projects,
        });
      };
      const assign = (key, profileId) => {
        const nextProjects = { ...projects };
        if (profileId) nextProjects[key] = { profileId };
        else delete nextProjects[key];
        onSave({ profiles, projects: nextProjects });
      };

      const projectKeys = [
        { key: 'ungrouped', label: 'Ungrouped sessions' },
        ...workspaceRows.map((workspace) => ({
          key: workspace.workspaceId,
          label: workspace.title || workspace.path || workspace.workspaceId,
        })),
      ];
      for (const key of Object.keys(projects)) {
        if (!projectKeys.some((entry) => entry.key === key)) {
          projectKeys.push({ key, label: key });
        }
      }

      return h(
        'div',
        { className: 'dsh-mt-card' },
        h(
          'div',
          { className: 'dsh-mt-cardhead' },
          h('span', { className: 'dsh-mt-cardtitle' }, 'Project profiles'),
          h('span', { className: 'dsh-mt-effort' }, `${profiles.length} profiles`),
          h('button', { type: 'button', className: 'dsh-mt-btn', onClick: add }, 'New profile'),
        ),
        h(
          'div',
          { className: 'dsh-mt-hint' },
          'Named tier decks scoped to Workspaces. A project profile filters the composer selector and supplies its default tier; it does not change tier definitions or host routing.',
        ),
        profiles.length > 0
          ? h(
              'div',
              { className: 'dsh-mt-customlist' },
              profiles.map((profile) =>
                h(ProjectProfileCard, {
                  key: profile.id,
                  profile,
                  deck,
                  assignedCount: assignedCount(profile.id),
                  onChange: update,
                  onDelete: () => remove(profile.id),
                }),
              ),
            )
          : h('div', { className: 'dsh-mt-hint' }, 'No project profiles yet. Create one to give a project its own tier menu.'),
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Project assignment'),
          h(
            'div',
            { className: 'dsh-mt-projectassign' },
            projectKeys.map((entry) =>
              h(
                'label',
                { className: 'dsh-mt-projectrow', key: entry.key },
                h('span', { className: 'dsh-mt-projectname' }, entry.label),
                h(
                  'select',
                  {
                    className: 'dsh-mt-select',
                    value: projects[entry.key]?.profileId ?? '',
                    disabled: profiles.length === 0,
                    'aria-label': `Profile for ${entry.label}`,
                    onChange: (event) => assign(entry.key, event.target.value || undefined),
                  },
                  h('option', { value: '' }, 'All tiers'),
                  profiles.map((profile) =>
                    h('option', { key: profile.id, value: profile.id }, profile.name),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function exportSnapshot(config) {
      const tiers = {};
      for (const id of TIER_IDS) {
        const tier = config.tiers[id];
        tiers[id] = {
          provider: tier.provider,
          model: tier.model,
          effort: tier.effort,
          webSearch: tier.webSearch,
          webFetch: tier.webFetch,
          browser: tier.browser,
          subagents: tier.subagents,
        };
      }
      return {
        app: 'dsh-model-tiers',
        version: 1,
        exportedAt: new Date().toISOString(),
        tiers,
        customTiers: config.customTiers,
        modelProfiles: config.modelProfiles,
        projectProfiles: config.projectProfiles,
        fallbackChains: config.fallbackChains,
        roleModels: config.roleModels,
        maxSubagents: config.maxSubagents,
        ultraAutoDelegate: config.ultraAutoDelegate,
      };
    }

    function buildImportOps(config, imported, include = {}) {
      if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
        throw new Error('Import must be a JSON object.');
      }
      const selected = (key) => include?.[key] !== false;
      const ops = [];
      const tierIds = new Set(config.tierIds);

      if (
        selected('tiers') &&
        imported.tiers &&
        typeof imported.tiers === 'object' &&
        !Array.isArray(imported.tiers)
      ) {
        for (const id of TIER_IDS) {
          const raw = imported.tiers[id];
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
          const fields = {};
          if (typeof raw.provider === 'string' && raw.provider.trim()) fields.provider = raw.provider.trim();
          if (typeof raw.model === 'string' && raw.model.trim()) fields.model = raw.model.trim();
          if (EFFORT_IDS.includes(raw.effort)) fields.effort = raw.effort;
          for (const flag of ['webSearch', 'webFetch', 'browser', 'subagents']) {
            if (typeof raw[flag] === 'boolean') fields[flag] = raw[flag];
          }
          for (const [field, value] of Object.entries(fields)) {
            ops.push({ op: 'set', path: ['tiers', id, field], value });
          }
        }
      }

      let customTiers = config.customTiers;
      if (selected('customTiers') && Object.prototype.hasOwnProperty.call(imported, 'customTiers')) {
        const incoming = parseCustomTiers(imported.customTiers);
        const merged = new Map(config.customTiers.map((tier) => [tier.id, tier]));
        for (const tier of incoming) {
          merged.set(tier.id, tier);
          tierIds.add(tier.id);
        }
        customTiers = [...merged.values()].sort(
          (a, b) => a.order - b.order || a.name.localeCompare(b.name),
        );
        ops.push({ op: 'set', path: ['customTiers'], value: JSON.stringify(customTiers) });
      }

      if (selected('modelProfiles') && Object.prototype.hasOwnProperty.call(imported, 'modelProfiles')) {
        const incoming = normalizeModelProfiles(imported.modelProfiles);
        if (Object.keys(incoming).length > 0) {
          const merged = { ...config.modelProfiles };
          for (const [provider, models] of Object.entries(incoming)) {
            merged[provider] = { ...(merged[provider] ?? {}), ...models };
          }
          ops.push({ op: 'set', path: ['modelProfiles'], value: JSON.stringify(merged) });
          if (!config.modelProfilesMigrated) {
            ops.push({ op: 'set', path: ['modelProfilesMigrated'], value: true });
          }
        }
      }

      if (selected('projectProfiles') && Object.prototype.hasOwnProperty.call(imported, 'projectProfiles')) {
        const incoming = normalizeProjectProfiles(imported.projectProfiles, [...tierIds]);
        if (incoming.profiles.length > 0 || Object.keys(incoming.projects).length > 0) {
          const mergedProfiles = new Map(
            config.projectProfiles.profiles.map((profile) => [profile.id, profile]),
          );
          for (const profile of incoming.profiles) mergedProfiles.set(profile.id, profile);
          const merged = {
            profiles: [...mergedProfiles.values()],
            projects: { ...config.projectProfiles.projects, ...incoming.projects },
          };
          ops.push({ op: 'set', path: ['projectProfiles'], value: JSON.stringify(merged) });
        }
      }

      if (selected('fallbackChains') && Object.prototype.hasOwnProperty.call(imported, 'fallbackChains')) {
        const incoming = normalizeFallbackChains(imported.fallbackChains);
        if (Object.keys(incoming).length > 0) {
          ops.push({
            op: 'set',
            path: ['fallbackChains'],
            value: JSON.stringify({ ...config.fallbackChains, ...incoming }),
          });
        }
      }

      if (selected('roleModels') && Object.prototype.hasOwnProperty.call(imported, 'roleModels')) {
        const incoming = normalizeRoleModels(imported.roleModels);
        if (Object.keys(incoming).length > 0) {
          const merged = { ...config.roleModels };
          for (const [tierId, roles] of Object.entries(incoming)) {
            merged[tierId] = { ...(merged[tierId] ?? {}), ...roles };
          }
          ops.push({ op: 'set', path: ['roleModels'], value: JSON.stringify(merged) });
        }
      }

      if (selected('limits')) {
        if (typeof imported.maxSubagents === 'number' && Number.isFinite(imported.maxSubagents)) {
          ops.push({
            op: 'set',
            path: ['maxSubagents'],
            value: clamp(Math.round(imported.maxSubagents), 1, 8),
          });
        }
        if (typeof imported.ultraAutoDelegate === 'boolean') {
          ops.push({ op: 'set', path: ['ultraAutoDelegate'], value: imported.ultraAutoDelegate });
        }
      }

      if (ops.length === 0) throw new Error('No recognized Model Tiers settings found in the import.');
      return ops;
    }

    const IMPORT_SECTIONS = [
      { id: 'tiers', label: 'Built-in tiers' },
      { id: 'customTiers', label: 'Custom tiers' },
      { id: 'modelProfiles', label: 'Model profiles' },
      { id: 'projectProfiles', label: 'Project profiles' },
      { id: 'fallbackChains', label: 'Fallbacks' },
      { id: 'roleModels', label: 'Role routes' },
      { id: 'limits', label: 'Limits' },
    ];

    function BackupPanel({ config, save }) {
      const [text, setText] = useState('');
      const [status, setStatus] = useState('');
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [include, setInclude] = useState(() =>
        Object.fromEntries(IMPORT_SECTIONS.map((section) => [section.id, true])),
      );
      const exportText = JSON.stringify(exportSnapshot(config), null, 2);
      let preview = null;
      let previewError = '';
      if (text.trim()) {
        try {
          preview = buildImportOps(config, JSON.parse(text), include);
        } catch (failure) {
          previewError = failure instanceof Error ? failure.message : String(failure);
        }
      }

      const copyExport = async () => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(exportText);
            setStatus('Export copied to clipboard.');
          }
        } catch {
          setError('Clipboard access failed; use Download JSON instead.');
        }
      };
      const downloadExport = () => {
        if (typeof document === 'undefined') return;
        const blob = new Blob([exportText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'model-tiers-export.json';
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus('Export downloaded.');
      };
      const importMerge = async () => {
        setError('');
        setStatus('');
        setBusy(true);
        try {
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new Error('Import is not valid JSON.');
          }
          const ops = buildImportOps(config, parsed, include);
          const next = await save(ops);
          if (!next) throw new Error('Import was rejected by the settings service.');
          setStatus(`Merged ${ops.length} setting update${ops.length === 1 ? '' : 's'}.`);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
          setBusy(false);
        }
      };

      return h(
        'div',
        { className: 'dsh-mt-section' },
        h(
          'div',
          { className: 'dsh-mt-card' },
          h(
            'div',
            { className: 'dsh-mt-cardhead' },
            h('span', { className: 'dsh-mt-cardtitle' }, 'Backup & restore'),
            h('button', { type: 'button', className: 'dsh-mt-btn', onClick: copyExport }, 'Copy export'),
            h('button', { type: 'button', className: 'dsh-mt-btn', onClick: downloadExport }, 'Download JSON'),
          ),
          h(
            'p',
            { className: 'dsh-mt-hint' },
            'Export includes tiers, custom tiers, model profiles, project profiles, fallbacks, and role routes. Session pins and session-profile overrides are intentionally excluded.',
          ),
          h(
            'p',
            { className: 'dsh-mt-hint' },
            'Import is merge-only: existing entries not present in the file are preserved. Matching custom tiers, model profiles, project profiles, fallbacks, and role routes are updated.',
          ),
          h(
            'div',
            { className: 'dsh-mt-importopts' },
            IMPORT_SECTIONS.map((section) =>
              h(
                'label',
                { className: 'dsh-mt-tiercheck', key: section.id },
                h('input', {
                  type: 'checkbox',
                  checked: include[section.id] !== false,
                  onChange: (event) =>
                    setInclude((current) => ({ ...current, [section.id]: event.target.checked })),
                }),
                h('span', null, section.label),
              ),
            ),
          ),
          h('textarea', {
            className: 'dsh-mt-backup',
            value: text,
            placeholder: 'Paste a Model Tiers export JSON here to merge it…',
            spellCheck: false,
            rows: 8,
            onChange: (event) => {
              setText(event.target.value);
              setError('');
              setStatus('');
            },
          }),
          previewError
            ? h('div', { className: 'dsh-mt-status', 'data-error': 'true' }, previewError)
            : preview
              ? h(
                  'div',
                  { className: 'dsh-mt-hint' },
                  `Recognized ${preview.length} setting update${preview.length === 1 ? '' : 's'} for the selected sections.`,
                )
              : null,
          h(
            'div',
            { className: 'dsh-mt-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn',
                disabled: busy || !text.trim() || Boolean(previewError) || !preview,
                onClick: importMerge,
              },
              busy ? 'Importing…' : 'Import merge',
            ),
          ),
          error ? h('div', { className: 'dsh-mt-status', 'data-error': 'true' }, error) : null,
          status ? h('div', { className: 'dsh-mt-hint' }, status) : null,
        ),
      );
    }

    function HealthPanel({ config, catalog, workspaceRows }) {
      const [copied, setCopied] = useState(false);
      const tiers = config.deck ?? [];
      const tierIds = new Set(tiers.map((tier) => tier.id));
      const issues = [];
      const checks = tiers.map((tier) => {
        const tierIssues = [];
        const routeMissing = (label, route) => {
          if (!catalog || !route?.provider || !route?.model) return;
          if (!findCatalogModel(catalog, route.provider, route.model)) {
            tierIssues.push(`${label}: ${route.provider}/${route.model} is not in the model catalog.`);
          }
        };
        routeMissing('Primary', { provider: tier.provider, model: tier.model });
        for (const variant of tier.variants ?? []) routeMissing('Variant', variant);
        for (const fallback of config.fallbackChains?.[tier.id] ?? []) routeMissing('Fallback', fallback);
        const roleRoutes = config.roleModels?.[tier.id] ?? {};
        for (const role of ROLE_IDS) {
          if (roleRoutes[role]) routeMissing(`Role ${role}`, roleRoutes[role]);
        }
        const fallbacks = config.fallbackChains?.[tier.id] ?? [];
        if (fallbacks.some((route) => route.provider === tier.provider && route.model === tier.model)) {
          tierIssues.push('Fallback chain repeats the primary route.');
        }
        for (const issue of tierIssues) issues.push(`${tierLabel(tier)}: ${issue}`);
        return {
          tier,
          fallbacks: fallbacks.length,
          roles: Object.keys(roleRoutes).length,
          status: tierIssues.length > 0 ? 'warning' : catalog ? 'ok' : 'unknown',
        };
      });

      const activeEntries = Object.entries(config.activeTiers ?? {});
      for (const [sessionId, entry] of activeEntries) {
        const tierId = typeof entry === 'string' ? entry : entry?.tier;
        if (tierId && !tierIds.has(tierId)) {
          issues.push(`Session ${sessionId}: pinned tier "${tierId}" no longer exists.`);
        }
      }
      for (const [key, project] of Object.entries(config.projectProfiles?.projects ?? {})) {
        const profileId = project?.profileId;
        if (profileId && !config.projectProfiles.profiles.some((profile) => profile.id === profileId)) {
          issues.push(`Project ${key}: assigned profile "${profileId}" no longer exists.`);
        }
      }
      for (const profile of config.projectProfiles?.profiles ?? []) {
        if (!tierIds.has(profile.defaultTierId)) {
          issues.push(`Profile "${profile.name}": default tier "${profile.defaultTierId}" no longer exists.`);
        }
      }

      const fallbackCount = Object.values(config.fallbackChains ?? {}).reduce(
        (sum, chain) => sum + chain.length,
        0,
      );
      const roleCount = Object.values(config.roleModels ?? {}).reduce(
        (sum, roles) => sum + Object.keys(roles).length,
        0,
      );
      const summaryCards = [
        { label: 'Tiers', value: tiers.length },
        { label: 'Role routes', value: roleCount },
        { label: 'Fallbacks', value: fallbackCount },
        { label: 'Project profiles', value: config.projectProfiles?.profiles?.length ?? 0 },
        { label: 'Active sessions', value: activeEntries.length },
        { label: 'Workspaces', value: workspaceRows.length },
      ];
      const report = [
        'Model Tiers health',
        `Catalog: ${catalog ? 'loaded' : 'unavailable'}`,
        ...summaryCards.map((card) => `${card.label}: ${card.value}`),
        '',
        ...checks.map(
          (check) =>
            `${tierLabel(check.tier)}: ${check.tier.provider}/${check.tier.model} · ${check.fallbacks} fallback · ${check.roles} roles · ${check.status}`,
        ),
        '',
        issues.length > 0 ? `Warnings:\n${issues.map((issue) => `- ${issue}`).join('\n')}` : 'Warnings: none',
      ].join('\n');

      const copyReport = async () => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(report);
            setCopied(true);
          }
        } catch {
          // Clipboard access is optional.
        }
      };

      return h(
        'div',
        { className: 'dsh-mt-section' },
        h(
          'div',
          { className: 'dsh-mt-card' },
          h(
            'div',
            { className: 'dsh-mt-cardhead' },
            h('span', { className: 'dsh-mt-cardtitle' }, 'Health'),
            h(
              'button',
              { type: 'button', className: 'dsh-mt-btn', onClick: copyReport },
              copied ? 'Copied report' : 'Copy report',
            ),
          ),
          h(
            'p',
            { className: 'dsh-mt-hint' },
            'Read-only checks for route coverage, stale session pins, and project-profile references. Warnings do not change runtime behavior.',
          ),
          h(
            'div',
            { className: 'dsh-mt-healthgrid' },
            summaryCards.map((card) =>
              h(
                'div',
                { className: 'dsh-mt-healthcard', key: card.label },
                h('span', { className: 'dsh-mt-healthvalue' }, card.value),
                h('span', { className: 'dsh-mt-healthlabel' }, card.label),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-card' },
          h('div', { className: 'dsh-mt-cardtitle' }, 'Route coverage'),
          h('div', { className: 'dsh-mt-hint' }, catalog ? 'Routes checked against the current model catalog.' : 'Model catalog is unavailable; route existence was not checked.'),
          checks.map((check) =>
            h(
              'div',
              { className: 'dsh-mt-healthrow', key: check.tier.id },
              h(
                'div',
                { className: 'dsh-mt-healthroute' },
                h('span', { className: 'dsh-mt-badge' }, tierMeta(config, check.tier.id).short),
                h('span', null, `${tierLabel(check.tier)} · ${check.tier.provider}/${check.tier.model}`),
              ),
              h(
                'span',
                { className: 'dsh-mt-healthmeta' },
                `${check.fallbacks} fallback · ${check.roles} roles`,
              ),
              h(
                'span',
                { className: 'dsh-mt-healthbadge', 'data-state': check.status },
                check.status === 'ok' ? 'Healthy' : check.status === 'warning' ? 'Check' : 'Unknown',
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-card' },
          h('div', { className: 'dsh-mt-cardtitle' }, `Warnings (${issues.length})`),
          issues.length > 0
            ? issues.map((issue, index) =>
                h('div', { className: 'dsh-mt-issue', key: `${index}:${issue}` }, issue),
              )
            : h('div', { className: 'dsh-mt-hint' }, 'No stale references or missing routes detected.'),
        ),
      );
    }

    function SettingsPage({ appCtx, useWorkspaces }) {
      const workspaceSnapshot =
        typeof useWorkspaces === 'function' ? useWorkspaces((value) => value) : undefined;
      const workspaceRows = Array.isArray(workspaceSnapshot)
        ? workspaceSnapshot
        : workspaceSnapshot?.items ?? [];
      const [state, setState] = useState({ status: 'loading', config: null, revision: 0, catalog: null, error: null, saving: false });
      const [section, setSection] = useState('tiers');

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const [settings, catalog] = await Promise.all([loadSettings(appCtx), loadCatalog(appCtx)]);
            const next = await ensureModelProfiles(appCtx, settings);
            if (!alive) return;
            setState((prev) => ({
              ...prev,
              status: 'ready',
              config: next.config,
              revision: next.revision,
              catalog,
            }));
          } catch (error) {
            if (!alive) return;
            setState((prev) => ({ ...prev, status: 'error', error: error instanceof Error ? error.message : String(error) }));
          }
        })();
        return () => {
          alive = false;
        };
      }, [appCtx]);

      const save = useCallback(
        async (operations) => {
          setState((prev) => ({ ...prev, saving: true, error: null }));
          try {
            const next = await mutateSettings(appCtx, operations, state.revision);
            setState((prev) => ({ ...prev, saving: false, config: next.config, revision: next.revision }));
            return next;
          } catch (error) {
            setState((prev) => ({
              ...prev,
              saving: false,
              error: error instanceof Error ? error.message : String(error),
            }));
            return undefined;
          }
        },
        [appCtx, state.revision],
      );

      if (state.status === 'loading') {
        return h('div', { className: 'dsh-mt-page' }, h(Styles), h('div', { className: 'dsh-mt-hint' }, 'Loading model tiers…'));
      }
      if (state.status === 'error' || !state.config) {
        return h(
          'div',
          { className: 'dsh-mt-page' },
          h(Styles),
          h('div', { className: 'dsh-mt-head' }, h('h2', null, 'Model Tiers')),
          h('div', { className: 'dsh-mt-status', 'data-error': 'true' }, state.error ?? 'Model tiers are unavailable.'),
        );
      }

      const config = state.config;
      const activeCount = Object.keys(config.activeTiers).length;

      const setTier = (id, patch) => {
        const ops = Object.entries(patch).map(([field, value]) => ({
          op: 'set',
          path: ['tiers', id, field],
          value,
        }));
        save(ops);
      };
      const saveFallbacks = (next) =>
        save([{ op: 'set', path: ['fallbackChains'], value: JSON.stringify(next) }]);
      const saveRoles = (next) =>
        save([{ op: 'set', path: ['roleModels'], value: JSON.stringify(next) }]);
      const copyTier = (id) => {
        const source = config.tiers[id];
        const meta = TIER_META[id];
        if (!source || !meta) return;
        const customId = uniqueCustomId(`${meta.label} copy`, config.tiers);
        const order =
          config.customTiers.reduce((max, tier) => Math.max(max, tier.order ?? 0), 0) + 10;
        const tier = {
          id: customId,
          name: `${meta.label} copy`,
          short: `${meta.short}c`.slice(0, 2),
          role: meta.role,
          prompt: '',
          provider: source.provider,
          model: source.model,
          effort: source.effort,
          webSearch: source.webSearch,
          webFetch: source.webFetch,
          browser: source.browser,
          subagents: source.subagents,
          order,
          variants: [],
          custom: true,
        };
        save([
          {
            op: 'set',
            path: ['customTiers'],
            value: JSON.stringify([...config.customTiers, tier]),
          },
        ]);
        setSection('custom');
      };

      return h(
        'div',
        { className: 'dsh-mt-page' },
        h(Styles),
        h(
          'div',
          { className: 'dsh-mt-head' },
          h('h2', null, 'Model Tiers'),
          h(
            'p',
            null,
            'Built-in and custom tiers for planning, coding, and review. Use the tabs to manage tiers, models, projects, and delegation.',
          ),
          h(
            'p',
            null,
            'Models come from the providers you configured in Settings → Models. If a provider is missing from the dropdown, add its credentials there first, then assign its model here.',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-tabs', role: 'tablist', 'aria-label': 'Model tiers sections' },
          [
            { id: 'tiers', label: 'Built-in tiers', count: TIER_IDS.length },
            { id: 'custom', label: 'Custom tiers', count: config.customTiers.length },
            {
              id: 'models',
              label: 'Model profiles',
              count: Object.values(config.modelProfiles).reduce(
                (sum, models) => sum + Object.keys(models).length,
                0,
              ),
            },
            {
              id: 'projects',
              label: 'Project profiles',
              count: config.projectProfiles.profiles.length,
            },
            { id: 'backup', label: 'Backup' },
            { id: 'health', label: 'Health' },
            { id: 'advanced', label: 'Advanced' },
          ].map((tab) =>
            h(
              'button',
              {
                key: tab.id,
                type: 'button',
                role: 'tab',
                className: 'dsh-mt-tab',
                'data-active': String(section === tab.id),
                'aria-selected': section === tab.id,
                onClick: () => setSection(tab.id),
              },
              tab.label,
              tab.count === undefined
                ? null
                : h('span', { className: 'dsh-mt-tabcount' }, tab.count),
            ),
          ),
          h(
            'span',
            {
              className: 'dsh-mt-tabstatus',
              role: 'status',
              'aria-live': 'polite',
              'data-error': state.error ? 'true' : 'false',
            },
            state.error ? 'Error' : state.saving ? 'Saving…' : 'Saved',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'models') },
          h(ModelProfilesEditor, {
            profiles: config.modelProfiles,
            tiers: config.tiers,
            catalog: state.catalog,
            onSave: (next) =>
              save([{ op: 'set', path: ['modelProfiles'], value: JSON.stringify(next) }]),
          }),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'tiers') },
          h(
            'div',
            { className: 'dsh-mt-grid' },
            TIER_IDS.map((id) => {
            const tier = config.tiers[id];
            const meta = TIER_META[id];
            const rawProfile = config.modelProfiles?.[tier.provider]?.[tier.model];
            const profile = profileFor(config.modelProfiles, tier.provider, tier.model);
            return h(
              'div',
              { className: 'dsh-mt-card', key: id },
              h(
                'div',
                { className: 'dsh-mt-cardhead' },
                h('span', { className: 'dsh-mt-badge' }, meta.short),
                h('span', { className: 'dsh-mt-cardtitle' }, meta.label),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-mt-link',
                    style: { marginLeft: 'auto' },
                    title: 'Copy as an editable custom tier',
                    onClick: () => copyTier(id),
                  },
                  'Copy',
                ),
              ),
              h('div', { className: 'dsh-mt-cardrole' }, meta.role),
              h(ModelPicker, {
                tier,
                catalog: state.catalog,
                onChange: (provider, model) => setTier(id, { provider, model }),
              }),
              h('div', { className: 'dsh-mt-hint' }, profileSummary(profile, rawProfile)),
              h(FallbackEditor, {
                tierId: id,
                chains: config.fallbackChains,
                onChange: saveFallbacks,
              }),
              h(RoleModelsEditor, {
                tierId: id,
                roles: config.roleModels,
                onChange: saveRoles,
              }),
              h(EffortRange, { effort: tier.effort, onChange: (effort) => setTier(id, { effort }) }),
              h(
                'div',
                { className: 'dsh-mt-field' },
                h('span', { className: 'dsh-mt-label' }, 'Access'),
                h(
                  'div',
                  { className: 'dsh-mt-switches' },
                  h(Switch, {
                    checked: tier.webSearch,
                    label: 'Web search',
                    onChange: (value) => setTier(id, { webSearch: value }),
                  }),
                  h(Switch, {
                    checked: tier.webFetch,
                    label: 'Web fetch',
                    onChange: (value) => setTier(id, { webFetch: value }),
                  }),
                  h(Switch, {
                    checked: tier.browser,
                    label: 'Browser',
                    onChange: (value) => setTier(id, { browser: value }),
                  }),
                  h(Switch, {
                    checked: tier.subagents,
                    label: 'Sub-agents',
                    onChange: (value) => setTier(id, { subagents: value }),
                  }),
                ),
              ),
            );
          }),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'custom') },
          h(CustomTiersEditor, {
            customTiers: config.customTiers,
            tiers: config.tiers,
            catalog: state.catalog,
            profiles: config.modelProfiles,
            fallbacks: config.fallbackChains,
            roles: config.roleModels,
            activeTiers: config.activeTiers,
            onSave: (next) =>
              save([{ op: 'set', path: ['customTiers'], value: JSON.stringify(next) }]),
            onFallbacks: saveFallbacks,
            onRoles: saveRoles,
          }),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'projects') },
          h(ProjectProfilesEditor, {
            projectProfiles: config.projectProfiles,
            deck: config.deck,
            workspaceRows,
            onSave: (next) =>
              save([{ op: 'set', path: ['projectProfiles'], value: JSON.stringify(next) }]),
          }),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'backup') },
          h(BackupPanel, { config, save }),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'health') },
          h(HealthPanel, {
            config,
            catalog: state.catalog,
            workspaceRows,
          }),
        ),
        h(
          'div',
          { className: 'dsh-mt-section', 'data-hidden': String(section !== 'advanced') },
          h(
            'div',
            { className: 'dsh-mt-card' },
            h('div', { className: 'dsh-mt-cardtitle' }, 'Delegation limits'),
          h(
            'div',
            { className: 'dsh-mt-global' },
            h(
              'div',
              { className: 'dsh-mt-field' },
              h('span', { className: 'dsh-mt-label' }, 'Max concurrent sub-agents'),
              h('input', {
                className: 'dsh-mt-input dsh-mt-num',
                type: 'number',
                min: 1,
                max: 8,
                step: 1,
                value: config.maxSubagents,
                onChange: (event) => {
                  const value = clamp(Math.round(Number(event.target.value) || 4), 1, 8);
                  save([{ op: 'set', path: ['maxSubagents'], value }]);
                },
              }),
              h('span', { className: 'dsh-mt-hint' }, 'Applies to every tier. Default is 4.'),
            ),
            h(
              'div',
              { className: 'dsh-mt-field' },
              h(Switch, {
                checked: config.ultraAutoDelegate,
                label: 'Ultra Code auto-delegation',
                onChange: (value) => save([{ op: 'set', path: ['ultraAutoDelegate'], value }]),
              }),
              h(
                'span',
                { className: 'dsh-mt-hint' },
                'At Ultra Code, push the model to split independent work across sub-agents instead of waiting to be asked.',
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-card' },
          h(
            'div',
            { className: 'dsh-mt-cardhead' },
            h('span', { className: 'dsh-mt-cardtitle' }, 'Active session tiers'),
            h('span', { className: 'dsh-mt-effort' }, `${activeCount} pinned`),
          ),
          h(
            'div',
            { className: 'dsh-mt-hint' },
            'Clearing the pinned tiers returns every Session to its normal model selection. The next request keeps the current model and stops applying tier effort and access rules.',
          ),
          h(
            'div',
            { className: 'dsh-mt-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn',
                disabled: activeCount === 0 || state.saving,
                onClick: () => save([{ op: 'set', path: ['activeTiers'], value: '{}' }]),
              },
              'Clear active tiers',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-mt-btn',
                disabled: state.saving,
                onClick: () => {
                  const ops = [];
                  for (const id of TIER_IDS) {
                    for (const [field, value] of Object.entries(DEFAULT_TIERS[id])) {
                      ops.push({ op: 'set', path: ['tiers', id, field], value });
                    }
                  }
                  ops.push({ op: 'set', path: ['maxSubagents'], value: 4 });
                  ops.push({ op: 'set', path: ['ultraAutoDelegate'], value: true });
                  save(ops);
                },
              },
              'Reset to defaults',
            ),
          ),
        ),
        ),
        h(
          'div',
          { className: 'dsh-mt-status', 'data-error': state.error ? 'true' : 'false' },
          state.error ?? (state.saving ? 'Saving…' : 'Saved to the active profile patch.'),
        ),
      );
    }

    /**
     * Resolve the composer's current per-Session selection. Older string
     * entries are tier ids; newer object entries carry a model/effort override.
     * @param {object | null} config - normalized settings value.
     * @param {string} sessionId - owning Session.
     * @returns {object | undefined} normalized selection.
     */
    function resolveSelection(config, sessionId) {
      const entry = config?.activeTiers?.[sessionId];
      if (!entry) return undefined;

      let base;
      let tierId;
      let provider;
      let model;
      let effort;
      let sessionTemperature;
      let sessionMaxTokens;

      if (typeof entry === 'string') {
        const tier = config.tiers[entry];
        if (!tier) return undefined;
        tierId = entry;
        base = tier;
        provider = tier.provider;
        model = tier.model;
        effort = tier.effort;
      } else {
        if (typeof entry !== 'object' || Array.isArray(entry)) return undefined;
        tierId =
          typeof entry.tier === 'string' && Object.hasOwn(config.tiers, entry.tier)
            ? entry.tier
            : undefined;
        const tier = tierId ? config.tiers[tierId] : undefined;
        provider =
          typeof entry.provider === 'string' && entry.provider.length > 0
            ? entry.provider
            : tier?.provider;
        model =
          typeof entry.model === 'string' && entry.model.length > 0 ? entry.model : tier?.model;
        if (!provider || !model) return undefined;

        const matched =
          tierId ??
          (config.deck ?? []).find((tier) => tierHasRoute(tier, provider, model))?.id;
        base = matched
          ? config.tiers[matched]
          : { webSearch: true, webFetch: true, browser: true, subagents: true };
        tierId = matched;
        effort = EFFORT_IDS.includes(entry.effort)
          ? entry.effort
          : matched
            ? config.tiers[matched].effort
            : 'medium';
        sessionTemperature =
          typeof entry.temperature === 'number' && Number.isFinite(entry.temperature)
            ? Math.min(2, Math.max(0, entry.temperature))
            : undefined;
        sessionMaxTokens =
          typeof entry.maxTokens === 'number' &&
          Number.isFinite(entry.maxTokens) &&
          entry.maxTokens > 0
            ? Math.min(1_000_000, Math.floor(entry.maxTokens))
            : undefined;
      }

      const profile = profileFor(config.modelProfiles, provider, model);
      return {
        ...base,
        tierId,
        provider,
        model,
        effort,
        temperature: sessionTemperature,
        modelTemperature: profile?.temperature,
        effectiveTemperature: sessionTemperature ?? profile?.temperature,
        maxTokens: sessionMaxTokens,
        modelMaxTokens: profile?.maxTokens,
        effectiveMaxTokens: sessionMaxTokens ?? profile?.maxTokens,
        wireEffort: profile?.wireEffort,
      };
    }

    /**
     * Find the first tier whose configured route matches.
     * @param {object | null} config - normalized settings value.
     * @param {string} provider - provider id.
     * @param {string} model - model id.
     * @returns {string | undefined} tier id.
     */
    function matchTierId(config, provider, model) {
      if (!config) return undefined;
      return (config.deck ?? []).find((tier) => tierHasRoute(tier, provider, model))?.id;
    }

    /** Build a stable custom-tier slug from a display name. */
    function slugify(value) {
      return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    }

    /** Allocate a unique custom-tier id. */
    function uniqueCustomId(name, tiers) {
      const base = `custom-${slugify(name) || 'tier'}`;
      let id = base;
      let suffix = 2;
      while (tiers?.[id]) id = `${base}-${suffix++}`;
      return id;
    }

    /** Count active sessions pinned to one tier id. */
    function activeTierCount(activeTiers, id) {
      return Object.values(activeTiers ?? {}).filter((entry) =>
        (typeof entry === 'string' ? entry : entry?.tier) === id,
      ).length;
    }

    /** Primary route plus variant count. */
    function customRouteLabel(tier) {
      const route = tier?.provider && tier?.model ? `${tier.provider}/${tier.model}` : 'No model';
      return tier?.variants?.length ? `${route} +${tier.variants.length}` : route;
    }

    const SHORT_EFFORTS = {
      off: 'Off',
      low: 'Low',
      medium: 'Med',
      high: 'High',
      'extra-high': 'XH',
      ultra: 'Ultra',
    };

    /**
     * Short display name for a custom model id.
     * @param {string} model - full model id.
     * @returns {string} last path segment, truncated.
     */
    function shortModel(model) {
      const value = String(model ?? '');
      const tail = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value;
      return tail.length > 22 ? `${tail.slice(0, 20)}…` : tail || 'Custom';
    }

    function TierControl({ appCtx, sessionId, useWorkspaces }) {
      const workspaceSnapshot =
        typeof useWorkspaces === 'function' ? useWorkspaces((value) => value) : undefined;
      const workspaceRows = Array.isArray(workspaceSnapshot)
        ? workspaceSnapshot
        : workspaceSnapshot?.items ?? [];
      const workspace = workspaceRows.find(
        (row) => Array.isArray(row.sessionIds) && row.sessionIds.includes(sessionId),
      );
      const projectKey = workspace?.workspaceId ?? 'ungrouped';
      const [open, setOpen] = useState(false);
      const [draftEffort, setDraftEffort] = useState('medium');
      const [draftTemperature, setDraftTemperature] = useState(0.7);
      const [autoTemperature, setAutoTemperature] = useState(true);
      const [draftMaxTokens, setDraftMaxTokens] = useState(4096);
      const [autoMaxTokens, setAutoMaxTokens] = useState(true);
      const [modelQuery, setModelQuery] = useState('');
      const [state, setState] = useState({
        status: 'loading',
        config: null,
        revision: 0,
        catalog: null,
        error: null,
        busy: null,
      });
      const rootRef = useRef(null);
      const triggerRef = useRef(null);
      const popRef = useRef(null);
      const autoProfileAppliedRef = useRef(false);
      const [anchor, setAnchor] = useState({ left: 8, bottom: 80 });

      useEffect(() => {
        autoProfileAppliedRef.current = false;
      }, [sessionId]);

      const place = useCallback(() => {
        const element = triggerRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const width = 356;
        const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
        setAnchor({ left, bottom: Math.max(8, window.innerHeight - rect.top + 8) });
      }, []);

      const openMenu = useCallback(() => {
        place();
        setModelQuery('');
        setOpen(true);
      }, [place]);

      const reload = useCallback(async () => {
        try {
          const [settings, catalog] = await Promise.all([loadSettings(appCtx), loadCatalog(appCtx)]);
          const next = await ensureModelProfiles(appCtx, settings);
          setState((prev) => ({
            ...prev,
            status: 'ready',
            config: next.config,
            revision: next.revision,
            catalog,
            error: null,
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }, [appCtx]);

      useEffect(() => {
        reload();
      }, [reload]);

      useEffect(() => {
        if (!open) return undefined;
        reload();
        place();
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        const onPointer = (event) => {
          const target = event.target;
          if (!target) return;
          const inside =
            (rootRef.current && rootRef.current.contains(target)) ||
            (popRef.current && popRef.current.contains(target));
          if (!inside) setOpen(false);
        };
        const onViewport = () => place();
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer, true);
        window.addEventListener('resize', onViewport);
        window.addEventListener('scroll', onViewport, true);
        return () => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('pointerdown', onPointer, true);
          window.removeEventListener('resize', onViewport);
          window.removeEventListener('scroll', onViewport, true);
        };
      }, [open, reload, place]);

      const config = state.config;
      const selection = resolveSelection(config, sessionId);
      const activeId = selection?.tierId;
      const activeMeta = activeId ? tierMeta(config, activeId) : null;
      const sessionProfileId = config?.sessionProfiles?.[sessionId];
      const projectProfileId = config?.projectProfiles?.projects?.[projectKey]?.profileId;
      const projectProfile = config?.projectProfiles?.profiles?.find(
        (profile) => profile.id === projectProfileId,
      );
      const activeProfileId = sessionProfileId ?? projectProfileId;
      const activeProfile = config?.projectProfiles?.profiles?.find(
        (profile) => profile.id === activeProfileId,
      );
      const visibleDeck = activeProfile
        ? (config?.deck ?? []).filter((tier) => activeProfile.tierIds.includes(tier.id))
        : config?.deck ?? [];
      const projectDefaultTierId = activeProfile?.defaultTierId;
      const projectDefaultTier = projectDefaultTierId
        ? config?.tiers?.[projectDefaultTierId]
        : undefined;
      const outsideProfile =
        selection?.tierId !== undefined &&
        activeProfile !== undefined &&
        !activeProfile.tierIds.includes(selection.tierId);
      const activeRoleRoutes = activeId ? config.roleModels?.[activeId] : undefined;
      const configuredRoleIds = activeRoleRoutes
        ? ROLE_IDS.filter((role) => activeRoleRoutes[role])
        : [];
      const activeRole = selection
        ? configuredRoleIds.find((role) => {
            const route = activeRoleRoutes?.[role];
            return route?.provider === selection.provider && route?.model === selection.model;
          })
        : undefined;

      useEffect(() => {
        if (selection?.effort) setDraftEffort(selection.effort);
      }, [selection?.effort, sessionId]);

      useEffect(() => {
        if (selection) {
          setAutoTemperature(selection.temperature === undefined);
          setDraftTemperature(selection.effectiveTemperature ?? 0.7);
        }
      }, [selection?.temperature, selection?.modelTemperature, sessionId]);

      useEffect(() => {
        if (selection) {
          setAutoMaxTokens(selection.maxTokens === undefined);
          setDraftMaxTokens(selection.effectiveMaxTokens ?? 4096);
        }
      }, [selection?.maxTokens, selection?.modelMaxTokens, sessionId]);

      const applySelection = async ({ tierId, provider, model, effort, temperature, maxTokens }) => {
        if (!config) return;
        if (!provider || !model) {
          setState((prev) => ({ ...prev, error: 'Choose a model or configure this tier first.' }));
          return;
        }
        setState((prev) => ({ ...prev, busy: 'apply', error: null }));
        let saved;
        try {
          const nextMap = {
            ...config.activeTiers,
            [sessionId]: {
              tier: tierId ?? null,
              provider,
              model,
              effort,
              ...(typeof temperature === 'number' ? { temperature } : {}),
              ...(typeof maxTokens === 'number' && maxTokens > 0
                ? { maxTokens: Math.floor(maxTokens) }
                : {}),
            },
          };
          saved = await mutateSettings(
            appCtx,
            [{ op: 'set', path: ['activeTiers'], value: JSON.stringify(nextMap) }],
            state.revision,
          );
          const catalogModel = findCatalogModel(state.catalog, provider, model);
          const actualEffort = chooseEffort(catalogModel?.reasoning?.efforts, effort);
          const result = await appCtx.remote.session.selectModel({
            sessionId,
            provider,
            model,
            ...(actualEffort === undefined ? {} : { reasoningEffort: actualEffort }),
          });
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
          setState((prev) => ({
            ...prev,
            busy: null,
            config: saved.config,
            revision: saved.revision,
            error: null,
          }));
        } catch (error) {
          // A failed model switch must not leave a misleading per-Session
          // override behind; restore the previous map when the write landed.
          if (saved) {
            try {
              await mutateSettings(
                appCtx,
                [{ op: 'set', path: ['activeTiers'], value: JSON.stringify(config.activeTiers) }],
                saved.revision,
              );
            } catch {
              // Keep the original failure visible; the next write will reconcile.
            }
          }
          setDraftEffort(selection?.effort ?? 'medium');
          setState((prev) => ({
            ...prev,
            busy: null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      };

      const applyTier = (id) => {
        const tier = config?.tiers?.[id];
        if (!tier?.provider || !tier?.model) {
          setState((prev) => ({ ...prev, error: 'Set a provider and model for this tier first.' }));
          return;
        }
        applySelection({
          tierId: id,
          provider: tier.provider,
          model: tier.model,
          effort: tier.effort,
        });
      };

      const applyRole = (role) => {
        if (!activeId) return;
        const tier = config?.tiers?.[activeId];
        const route = config?.roleModels?.[activeId]?.[role];
        if (!tier || !route) return;
        applySelection({
          tierId: activeId,
          provider: route.provider,
          model: route.model,
          effort: tier.effort,
        });
      };

      const applyModel = (value) => {
        const [provider, model] = value.split('\u0000');
        if (!provider || !model) return;
        if (selection && selection.provider === provider && selection.model === model) return;
        const matched = matchTierId(config, provider, model);
        const effort = selection?.effort ?? (matched ? config.tiers[matched].effort : 'medium');
        applySelection({
          tierId: matched,
          provider,
          model,
          effort,
        });
      };

      const commitEffort = (effort) => {
        if (!selection || effort === selection.effort) return;
        applySelection({
          tierId: selection.tierId,
          provider: selection.provider,
          model: selection.model,
          effort,
          temperature: selection.temperature,
          maxTokens: selection.maxTokens,
        });
      };

      const commitTemperature = (temperature) => {
        if (!selection) return;
        if (temperature === selection.temperature) return;
        applySelection({
          tierId: selection.tierId,
          provider: selection.provider,
          model: selection.model,
          effort: selection.effort,
          temperature,
          maxTokens: selection.maxTokens,
        });
      };

      const commitMaxTokens = (maxTokens) => {
        if (!selection) return;
        if (maxTokens === selection.maxTokens) return;
        applySelection({
          tierId: selection.tierId,
          provider: selection.provider,
          model: selection.model,
          effort: selection.effort,
          temperature: selection.temperature,
          maxTokens,
        });
      };

      const setProfile = async (profileId) => {
        if (!config) return;
        setState((prev) => ({ ...prev, busy: 'profile', error: null }));
        const nextMap = { ...config.sessionProfiles };
        if (profileId) nextMap[sessionId] = profileId;
        else delete nextMap[sessionId];
        try {
          const saved = await mutateSettings(
            appCtx,
            [{ op: 'set', path: ['sessionProfiles'], value: JSON.stringify(nextMap) }],
            state.revision,
          );
          const nextProfile = profileId
            ? config.projectProfiles.profiles.find((profile) => profile.id === profileId)
            : config.projectProfiles.profiles.find((profile) => profile.id === projectProfileId);
          setState((prev) => ({
            ...prev,
            busy: null,
            config: saved.config,
            revision: saved.revision,
            error: null,
          }));
          if (
            nextProfile?.defaultTierId &&
            (!selection || !nextProfile.tierIds.includes(selection.tierId))
          ) {
            await applyTier(nextProfile.defaultTierId);
          }
        } catch (error) {
          setState((prev) => ({
            ...prev,
            busy: null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      };

      const clearTier = async () => {
        if (!config) return;
        setState((prev) => ({ ...prev, busy: 'clear', error: null }));
        try {
          const nextMap = { ...config.activeTiers };
          delete nextMap[sessionId];
          const saved = await mutateSettings(
            appCtx,
            [{ op: 'set', path: ['activeTiers'], value: JSON.stringify(nextMap) }],
            state.revision,
          );
          setState((prev) => ({ ...prev, busy: null, config: saved.config, revision: saved.revision, error: null }));
          setOpen(false);
        } catch (error) {
          setState((prev) => ({
            ...prev,
            busy: null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      };

      // A new Session in a profiled project inherits the profile's default tier
      // once. The ref prevents re-applying after a user explicitly clears it.
      useEffect(() => {
        if (autoProfileAppliedRef.current) return;
        if (!config || selection || !projectDefaultTierId) return;
        autoProfileAppliedRef.current = true;
        applyTier(projectDefaultTierId);
      }, [config, selection, projectDefaultTierId, applyTier]);

      const label = selection ? (activeMeta ? activeMeta.label : shortModel(selection.model)) : 'Tier';
      const effortLabel = selection
        ? EFFORTS.find((entry) => entry.id === selection.effort)?.label ?? selection.effort
        : undefined;
      const badge = selection ? (activeMeta ? activeMeta.short : 'C') : 'T';
      const modelGroups = state.catalog?.groups ?? [];
      const currentValue = selection ? `${selection.provider}\u0000${selection.model}` : '';
      const modelFilter = modelQuery.trim().toLowerCase();
      const filteredGroups = modelFilter
        ? modelGroups
            .map((group) => {
              const groupMatch = `${group.name} ${group.id}`.toLowerCase().includes(modelFilter);
              return {
                ...group,
                models: groupMatch
                  ? group.models
                  : group.models.filter((model) =>
                      `${model.name} ${model.id}`.toLowerCase().includes(modelFilter),
                    ),
              };
            })
            .filter((group) => group.models.length > 0)
        : modelGroups;
      const visibleCurrent =
        selection !== undefined &&
        filteredGroups.some(
          (group) =>
            group.id === selection.provider && group.models.some((model) => model.id === selection.model),
        );
      const draftIndex = Math.max(0, EFFORT_IDS.indexOf(draftEffort));

      return h(
        'div',
        { className: 'dsh-mt-wrap', ref: rootRef },
        h(Styles),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mt-trigger',
            ref: triggerRef,
            'data-open': String(open),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            title: selection
              ? `${label} · ${effortLabel} · ${selection.provider}/${selection.model}`
              : 'Choose a model, tier, and effort for this Session',
            onClick: () => {
              if (open) setOpen(false);
              else openMenu();
            },
          },
          h('span', { className: 'dsh-mt-badge' }, badge),
          h('span', null, selection ? `${label} · ${effortLabel}` : 'Tier'),
          h('span', { className: 'dsh-mt-chevron', 'aria-hidden': true }, open ? '▾' : '▴'),
        ),
        open && typeof document !== 'undefined'
          ? ReactDOM.createPortal(
              h(
                'div',
                {
                  className: 'dsh-mt-pop',
                  role: 'dialog',
                  'aria-label': 'Model tier selector',
                  ref: popRef,
                  style: {
                    position: 'fixed',
                    left: anchor.left,
                    bottom: anchor.bottom,
                    width: 356,
                    maxHeight: Math.min(520, Math.max(180, window.innerHeight - anchor.bottom - 16)),
                  },
                },
                h(
                  'div',
                  { className: 'dsh-mt-foot', style: { borderTop: 0, marginTop: 0, paddingTop: 2 } },
                  h('span', null, 'Model and effort for this Session'),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-mt-link',
                      disabled: !selection || state.busy !== null,
                      onClick: clearTier,
                    },
                    'Use normal selection',
                  ),
                ),
                h(
                  'div',
                  { className: 'dsh-mt-pickerbox' },
                  h(
                    'div',
                    { className: 'dsh-mt-field' },
                    h('span', { className: 'dsh-mt-label' }, 'Project profile'),
                    h(
                      'select',
                      {
                        className: 'dsh-mt-select',
                        value: sessionProfileId ?? '',
                        disabled: state.busy !== null,
                        'aria-label': 'Project profile',
                        onChange: (event) => setProfile(event.target.value || undefined),
                      },
                      h(
                        'option',
                        { value: '' },
                        projectProfile
                          ? `Project default · ${projectProfile.name}`
                          : 'All tiers',
                      ),
                      config.projectProfiles.profiles.map((profile) =>
                        h('option', { key: profile.id, value: profile.id }, profile.name),
                      ),
                    ),
                    h(
                      'span',
                      { className: 'dsh-mt-hint' },
                      workspace?.title
                        ? `Project: ${workspace.title}`
                        : 'Project: ungrouped session',
                    ),
                    config.projectProfiles.profiles.length === 0
                      ? h(
                          'span',
                          { className: 'dsh-mt-hint' },
                          'No project profiles yet. Create one in Settings → Project profiles.',
                        )
                      : null,
                  ),
                  h(
                    'div',
                    { className: 'dsh-mt-field' },
                    h('span', { className: 'dsh-mt-label' }, 'Model'),
                    h('input', {
                      className: 'dsh-mt-input',
                      type: 'search',
                      placeholder: 'Filter models…',
                      value: modelQuery,
                      disabled: state.busy !== null,
                      'aria-label': 'Filter models',
                      onChange: (event) => setModelQuery(event.target.value),
                    }),
                    h(
                      'select',
                      {
                        className: 'dsh-mt-select',
                        value: currentValue,
                        disabled: state.busy !== null,
                        'aria-label': 'Session model',
                        onChange: (event) => applyModel(event.target.value),
                      },
                      selection
                        ? null
                        : h('option', { value: '' }, 'Choose a model…'),
                      selection && !visibleCurrent
                        ? h(
                            'option',
                            { value: currentValue },
                            `${selection.provider} / ${selection.model}`,
                          )
                        : null,
                      filteredGroups.map((group) =>
                        h(
                          'optgroup',
                          { key: group.id, label: group.name },
                          group.models.map((model) =>
                            h(
                              'option',
                              { key: `${group.id}:${model.id}`, value: `${group.id}\u0000${model.id}` },
                              model.name,
                            ),
                          ),
                        ),
                      ),
                    ),
                    modelFilter && filteredGroups.length === 0
                      ? h('span', { className: 'dsh-mt-hint' }, 'No models match that filter.')
                      : modelGroups.length === 0
                        ? h(
                            'span',
                            { className: 'dsh-mt-hint' },
                            'No models available. Configure a provider in Settings → Models.',
                          )
                        : null,
                  ),
                  h(
                    'div',
                    { className: 'dsh-mt-field' },
                    h(
                      'div',
                      { className: 'dsh-mt-rangehead' },
                      h('span', { className: 'dsh-mt-label' }, 'Effort'),
                      h(
                        'span',
                        { className: 'dsh-mt-rangevalue' },
                        EFFORTS[draftIndex].label,
                      ),
                    ),
                    h('input', {
                      className: 'dsh-mt-range',
                      type: 'range',
                      min: 0,
                      max: EFFORTS.length - 1,
                      step: 1,
                      value: draftIndex,
                      disabled: !selection || state.busy !== null,
                      'aria-label': 'Session effort level',
                      onChange: (event) => setDraftEffort(EFFORT_IDS[Number(event.target.value)]),
                      onPointerUp: (event) =>
                        commitEffort(EFFORT_IDS[Number(event.target.value)]),
                      onKeyUp: (event) => commitEffort(EFFORT_IDS[Number(event.target.value)]),
                      onBlur: () => commitEffort(draftEffort),
                    }),
                    h(
                      'div',
                      { className: 'dsh-mt-ticks', 'aria-hidden': true },
                      EFFORT_IDS.map((id) => h('span', { key: id }, SHORT_EFFORTS[id])),
                    ),
                    selection?.wireEffort
                      ? h(
                          'span',
                          { className: 'dsh-mt-hint' },
                          `Model pins wire effort: ${selection.wireEffort}`,
                        )
                      : null,
                  ),
                  h(
                    'details',
                    { className: 'dsh-mt-sampling' },
                    h(
                      'summary',
                      { className: 'dsh-mt-samplinghead' },
                      h('span', { className: 'dsh-mt-label' }, 'Sampling'),
                      h('span', { className: 'dsh-mt-hint' }, 'Temperature and max tokens'),
                    ),
                    h(
                      'div',
                      { className: 'dsh-mt-samplingbody' },
                    h(
                      'div',
                      { className: 'dsh-mt-field' },
                      h(
                        'div',
                        { className: 'dsh-mt-rangehead' },
                        h('span', { className: 'dsh-mt-label' }, 'Temperature'),
                      h(
                        'span',
                        { className: 'dsh-mt-rangevalue' },
                        autoTemperature
                          ? selection?.effectiveTemperature !== undefined
                            ? `Model ${selection.effectiveTemperature.toFixed(2)}`
                            : 'Auto'
                          : draftTemperature.toFixed(2),
                      ),
                    ),
                    h(
                      'label',
                      { className: 'dsh-mt-check' },
                      h('input', {
                        type: 'checkbox',
                        checked: autoTemperature,
                        disabled: !selection || state.busy !== null,
                        onChange: (event) => {
                          const auto = event.target.checked;
                          setAutoTemperature(auto);
                          commitTemperature(auto ? undefined : draftTemperature);
                        },
                      }),
                      h('span', null, 'Use model default'),
                    ),
                    h('input', {
                      className: 'dsh-mt-range',
                      type: 'range',
                      min: 0,
                      max: 2,
                      step: 0.05,
                      value: draftTemperature,
                      disabled: autoTemperature || !selection || state.busy !== null,
                      'aria-label': 'Session temperature',
                      onChange: (event) => setDraftTemperature(Number(event.target.value)),
                      onPointerUp: (event) => commitTemperature(Number(event.target.value)),
                      onKeyUp: (event) => commitTemperature(Number(event.target.value)),
                      onBlur: () => commitTemperature(draftTemperature),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'dsh-mt-field' },
                    h(
                      'div',
                      { className: 'dsh-mt-rangehead' },
                      h('span', { className: 'dsh-mt-label' }, 'Max output tokens'),
                      h(
                        'span',
                        { className: 'dsh-mt-rangevalue' },
                        autoMaxTokens
                          ? selection?.effectiveMaxTokens !== undefined
                            ? `Model ${selection.effectiveMaxTokens}`
                            : 'Auto'
                          : String(draftMaxTokens),
                      ),
                    ),
                    h(
                      'label',
                      { className: 'dsh-mt-check' },
                      h('input', {
                        type: 'checkbox',
                        checked: autoMaxTokens,
                        disabled: !selection || state.busy !== null,
                        onChange: (event) => {
                          const auto = event.target.checked;
                          setAutoMaxTokens(auto);
                          commitMaxTokens(auto ? undefined : draftMaxTokens);
                        },
                      }),
                      h('span', null, 'Use model default'),
                    ),
                    h('input', {
                      className: 'dsh-mt-input',
                      type: 'number',
                      min: 1,
                      max: 1000000,
                      step: 1,
                      value: autoMaxTokens ? '' : draftMaxTokens,
                      placeholder: 'Model default',
                      disabled: autoMaxTokens || !selection || state.busy !== null,
                      'aria-label': 'Session max output tokens',
                      onChange: (event) => setDraftMaxTokens(Number(event.target.value)),
                      onBlur: () => {
                        const value = Math.floor(Number(draftMaxTokens));
                        if (value > 0) commitMaxTokens(value);
                        else setDraftMaxTokens(selection?.maxTokens ?? 4096);
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.target.blur();
                        }
                      },
                    }),
                  ),
                    ),
                  ),
                ),
                h('div', { className: 'dsh-mt-pophead' }, 'Tier presets'),
                outsideProfile
                  ? h(
                      'div',
                      { className: 'dsh-mt-hint', style: { padding: '0 8px 6px' } },
                      `Current tier is outside ${activeProfile.name}. Pick a tier below or use the profile default.`,
                    )
                  : null,
                projectDefaultTier && selection?.tierId !== projectDefaultTierId
                  ? h(
                      'div',
                      { className: 'dsh-mt-foot', style: { borderTop: 0, paddingTop: 0 } },
                      h('span', null, 'Profile default'),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-mt-link',
                          onClick: () => applyTier(projectDefaultTierId),
                        },
                        `Use ${tierLabel(projectDefaultTier)}`,
                      ),
                    )
                  : null,
                visibleDeck.map((tier) => {
                  const id = tier.id;
                  const meta = tierMeta(config, id);
                  const isActive =
                    selection !== undefined &&
                    id === selection.tierId &&
                    tierHasRoute(tier, selection.provider, selection.model);
                  const disabled = !tier?.provider || !tier?.model || state.busy !== null;
                  const fallbackCount = config.fallbackChains?.[tier.id]?.length ?? 0;
                  const routeLabel = tier
                    ? `${tier.provider}/${tier.model}${tier.variants?.length ? ` +${tier.variants.length}` : ''}${fallbackCount ? ` · ${fallbackCount} fallback` : ''}`
                    : 'Not configured';
                  return h(
                    'button',
                    {
                      key: id,
                      type: 'button',
                      'aria-pressed': isActive,
                      'data-active': String(isActive),
                      className: 'dsh-mt-row',
                      disabled,
                      onClick: () => applyTier(id),
                    },
                    h('span', { className: 'dsh-mt-badge' }, meta.short),
                    h(
                      'span',
                      { className: 'dsh-mt-rowmain' },
                      h('span', { className: 'dsh-mt-rowtitle' }, meta.label),
                      h(
                        'span',
                        { className: 'dsh-mt-rowmeta' },
                        routeLabel,
                      ),
                    ),
                    h(
                      'span',
                      { className: 'dsh-mt-dots', title: 'Web search · Web fetch · Browser' },
                      h('span', { className: 'dsh-mt-dot', 'data-on': String(tier?.webSearch === true) }),
                      h('span', { className: 'dsh-mt-dot', 'data-on': String(tier?.webFetch === true) }),
                      h('span', { className: 'dsh-mt-dot', 'data-on': String(tier?.browser === true) }),
                    ),
                    h('span', { className: 'dsh-mt-effort' }, state.busy !== null ? 'Switching…' : tier ? EFFORTS.find((entry) => entry.id === (isActive ? selection.effort : tier.effort))?.label ?? (isActive ? selection.effort : tier.effort) : '—'),
                  );
                }),
                configuredRoleIds.length > 0
                  ? h(
                      'div',
                      { className: 'dsh-mt-rolelanes' },
                      h('div', { className: 'dsh-mt-pophead' }, 'Role lanes'),
                      h(
                        'div',
                        { className: 'dsh-mt-rolelanebuttons' },
                        configuredRoleIds.map((role) => {
                          const route = activeRoleRoutes?.[role];
                          const meta = ROLES.find((entry) => entry.id === role);
                          return h(
                            'button',
                            {
                              key: role,
                              type: 'button',
                              className: 'dsh-mt-rolelane',
                              'data-active': String(role === activeRole),
                              disabled: state.busy !== null,
                              title: route ? `${route.provider}/${route.model}` : '',
                              onClick: () => applyRole(role),
                            },
                            h('span', null, meta?.label ?? role),
                            h(
                              'span',
                              { className: 'dsh-mt-rolelaneroute' },
                              route ? shortModel(route.model) : '',
                            ),
                          );
                        }),
                      ),
                    )
                  : null,
                state.error ? h('div', { className: 'dsh-mt-error' }, state.error) : null,
                h(
                  'div',
                  { className: 'dsh-mt-foot' },
                  h('span', null, 'Configure models, effort, and access in Settings → Model Tiers.'),
                ),
              ),
              document.body,
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('model-tiers', DICT));
        const t = ctx.locale.bind('model-tiers');

        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              {
                name: 'settings.section',
                id: 'model-tiers',
                order: 17,
                label: () => t('section.title'),
              },
              (props) => h(SettingsPage, { ...props, appCtx: ctx }),
            ),
          ),
        );

        ctx.effect(() =>
          ctx.slots.inject('conversation.input.left', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.left',
                id: 'model-tier',
                order: -20,
                label: () => t('composer.tier'),
              },
              (props) => h(TierControl, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
