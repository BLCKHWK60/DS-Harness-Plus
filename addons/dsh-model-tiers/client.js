window.__ModuleLoader__.load({
  id: '@local/dsh-model-tiers',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'model-tiers';
    /** Width of the chat box's model panel. */
    const POP_WIDTH = 340;
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

    /** Starter tiers. The ids are historical; people see the labels (or their own name for a tier). */
    const TIER_META = {
      haiku: {
        label: 'Fast',
        short: 'F',
        role: 'Quick, cheap work: search, small edits, quick checks.',
      },
      sonnet: {
        label: 'Balanced',
        short: 'B',
        role: 'Everyday default: plan briefly, do the work, check it.',
      },
      opus: {
        label: 'Deep',
        short: 'D',
        role: 'Careful reasoning for hard problems.',
      },
      fable: {
        label: 'Creative',
        short: 'C',
        role: 'Long-context writing and exploratory work.',
      },
      code: {
        label: 'Code review',
        short: 'R',
        role: 'Review only: check, fix, and verify code.',
      },
    };

    /** Starter rules. No model is preconfigured: a tier with no model uses the conversation's model. */
    const STARTER_RULES = { webSearch: true, webFetch: true, browser: true, subagents: true };
    const DEFAULT_TIERS = {
      haiku: { provider: '', model: '', effort: 'low', ...STARTER_RULES },
      sonnet: { provider: '', model: '', effort: 'medium', ...STARTER_RULES },
      opus: { provider: '', model: '', effort: 'high', ...STARTER_RULES },
      fable: { provider: '', model: '', effort: 'medium', ...STARTER_RULES },
      code: { provider: '', model: '', effort: 'ultra', ...STARTER_RULES },
    };

    /** Where the Settings page reads the skills and connectors a tier can pick. */
    const CATALOG_PATH = '/dsh-model-tiers/catalog';

    const DICT = {
      en: {
        'section.title': 'Model Tiers',
        'section.description':
          'Five model slots for planning, coding, and review. Each tier carries its own model, effort, internet access, and sub-agent policy.',
        'tier.haiku': 'Fast',
        'tier.sonnet': 'Balanced',
        'tier.opus': 'Deep',
        'tier.fable': 'Creative',
        'tier.code': 'Code review',
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
        'composer.tier': 'Model',
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
        'tier.haiku': 'Fast',
        'tier.sonnet': 'Balanced',
        'tier.opus': 'Deep',
        'tier.fable': 'Creative',
        'tier.code': 'Code review',
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
        'composer.tier': '模型',
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
/* ---- chat box: the one model control ---- */
/* The app's own model menu steps aside while this control is on; it returns when the add-on is off. */
body:has(.dsh-mc-wrap) [data-slot="conversation.input.model"] { display: none !important; }
.dsh-mc-wrap { position: relative; display: inline-flex; align-items: center; min-width: 0; }
.dsh-mc-trigger {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; max-width: 230px; padding: 0 8px;
  border: 1px solid transparent; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 1;
  cursor: pointer; white-space: nowrap;
}
.dsh-mc-trigger:hover, .dsh-mc-trigger[data-open="true"] { background: var(--dsw-alias-bg-layer-2); }
.dsh-mc-trigger:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-mc-triggername { overflow: hidden; text-overflow: ellipsis; font-weight: 550; }
.dsh-mc-triggereffort { color: var(--dsw-alias-label-secondary); }
.dsh-mc-chevron { font-size: 9px; opacity: .6; }
.dsh-mc-pop {
  z-index: 1000; display: flex; flex-direction: column; overflow: hidden auto; padding: 6px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; font-size: 12px;
  box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent);
}
.dsh-mc-search, .dsh-mc-input, .dsh-mc-select {
  width: 100%; box-sizing: border-box; height: 28px; padding: 0 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
}
.dsh-mc-search { border-color: transparent; background: transparent; flex: none; }
.dsh-mc-search:focus, .dsh-mc-input:focus, .dsh-mc-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.dsh-mc-list { flex: 0 1 auto; min-height: 72px; max-height: 232px; overflow: auto; margin: 2px 0 4px; }
.dsh-mc-group {
  position: sticky; top: 0; padding: 6px 8px 3px; font-size: 10px; font-weight: 650; letter-spacing: .03em;
  text-transform: uppercase; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1));
}
.dsh-mc-item {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 30px; padding: 4px 8px;
  border: 0; border-radius: 7px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.dsh-mc-item:hover, .dsh-mc-item:focus-visible { background: var(--dsw-alias-bg-layer-2); outline: none; }
.dsh-mc-item[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-mc-item[disabled] { opacity: .55; cursor: default; }
.dsh-mc-itemmain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dsh-mc-itemname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mc-itemmeta { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-mc-check { color: var(--dsw-alias-brand-primary); font-size: 12px; }
.dsh-mc-empty { padding: 14px 8px; color: var(--dsw-alias-label-secondary); text-align: center; }
.dsh-mc-block { flex: none; display: flex; flex-direction: column; gap: 6px; padding: 9px 8px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-mc-rowhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-mc-label { font-weight: 600; }
.dsh-mc-value { margin-left: auto; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.dsh-mc-rowhead .dsh-mc-value { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.dsh-mc-details > summary { cursor: pointer; list-style: none; }
.dsh-mc-details > summary::-webkit-details-marker { display: none; }
.dsh-mc-details > summary .dsh-mc-label::before { content: '▸'; display: inline-block; width: 12px; font-size: 9px; opacity: .7; }
.dsh-mc-details[open] > summary .dsh-mc-label::before { content: '▾'; }
.dsh-mc-details > summary .dsh-mc-value { color: var(--dsw-alias-label-secondary); font-weight: 400; }
/* Effort slider: a slim track with six stops and a round thumb. */
.dsh-mc-slider { position: relative; height: 20px; display: flex; align-items: center; }
.dsh-mc-slider::before {
  content: ''; position: absolute; left: 0; right: 0; height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--dsw-alias-brand-primary) var(--dsh-mc-fill, 0%), var(--dsw-alias-border-l1) var(--dsh-mc-fill, 0%));
}
.dsh-mc-slider[data-unset="true"]::before { background: var(--dsw-alias-border-l1); }
.dsh-mc-stops { position: absolute; left: 7px; right: 7px; display: flex; justify-content: space-between; pointer-events: none; }
.dsh-mc-stops span { width: 4px; height: 4px; border-radius: 50%; background: var(--dsw-alias-label-secondary); opacity: .55; }
.dsh-mc-stops span[data-on="true"] { background: var(--dsw-alias-bg-base); opacity: .9; }
.dsh-mc-slider input[type="range"] {
  position: relative; z-index: 1; width: 100%; height: 20px; margin: 0; background: transparent;
  -webkit-appearance: none; appearance: none; cursor: pointer;
}
.dsh-mc-slider input[type="range"]::-webkit-slider-runnable-track { height: 4px; background: transparent; }
.dsh-mc-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%;
  background: var(--dsw-alias-bg-base); border: 2px solid var(--dsw-alias-brand-primary);
  box-shadow: 0 1px 4px color-mix(in srgb, #000 30%, transparent);
}
.dsh-mc-slider[data-unset="true"] input[type="range"]::-webkit-slider-thumb { border-color: var(--dsw-alias-label-secondary); }
.dsh-mc-slider input[type="range"]:focus-visible { outline: none; }
.dsh-mc-slider input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); }
.dsh-mc-slider input[type="range"]:disabled { cursor: default; opacity: .5; }
.dsh-mc-ends { display: flex; justify-content: space-between; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.dsh-mc-note { font-size: 10px; line-height: 1.35; color: var(--dsw-alias-label-secondary); }
.dsh-mc-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.dsh-mc-chip {
  height: 24px; padding: 0 9px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 11px; cursor: pointer;
}
.dsh-mc-chip:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mc-chip[data-active="true"] {
  border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.dsh-mc-chip[disabled] { opacity: .55; cursor: default; }
.dsh-mc-chip-quiet { border-style: dashed; }
.dsh-mc-link { border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11px; cursor: pointer; padding: 0; }
.dsh-mc-link[disabled] { opacity: .5; cursor: default; }
.dsh-mc-field { display: flex; flex-direction: column; gap: 4px; }
.dsh-mc-checkrow { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.dsh-mc-checkrow input { accent-color: var(--dsw-alias-brand-primary); margin: 0; }
.dsh-mc-range { width: 100%; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.dsh-mc-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dsh-mc-actions .dsh-mc-input { flex: 1 1 140px; width: auto; }
.dsh-mc-btn {
  height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--dsw-alias-border-l1);
  background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 11px; cursor: pointer;
}
.dsh-mc-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-mc-btn[disabled] { opacity: .5; cursor: default; }
.dsh-mc-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-mc-error { flex: none; margin: 2px 8px 6px; padding: 6px 8px; border-radius: 7px; font-size: 11px;
  color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.dsh-mc-foot { flex: none; padding: 7px 8px 3px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 10px; color: var(--dsw-alias-label-secondary); }
@media (prefers-reduced-motion: no-preference) {
  .dsh-mc-item, .dsh-mc-chip, .dsh-mc-trigger, .dsh-mc-btn { transition: background .12s ease; }
}
/* ---- settings: tier extras and model versions ---- */
.dsh-mt-extras { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-mt-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-primary); }
.dsh-mt-inline .dsh-mt-select { width: auto; min-width: 64px; }
.dsh-mt-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-mt-pill {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 4px 0 9px; border-radius: 12px; font-size: 11px;
  color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.dsh-mt-pill[data-missing="true"] { color: var(--dsw-alias-state-warning-primary); background: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 12%, transparent); }
.dsh-mt-pill button { border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 1; cursor: pointer; padding: 0 4px; }
.dsh-mt-textarea { height: auto; min-height: 64px; padding: 6px 8px; line-height: 1.4; resize: vertical; font-family: inherit; }
.dsh-mt-versiongrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.dsh-mt-btn[data-danger="true"] { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
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
     * Normalize one user-created tier. Invalid/duplicate ids are ignored so a
     * malformed custom entry can never break the built-in deck.
     */
    function normalizeCustomTier(value, index, usedIds) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const id = typeof value.id === 'string' ? value.id.trim().toLowerCase() : '';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || usedIds.has(id)) return undefined;
      const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
      const model = typeof value.model === 'string' ? value.model.trim() : '';
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
        maxSubagents: readTierCap(value.maxSubagents),
        minSubagents: readMinSubagents(value.minSubagents),
        version: typeof value.version === 'string' ? value.version.trim().toLowerCase() : '',
        skills: readNameList(value.skills),
        connectors: readConnectors(value.connectors),
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

    /** Optional per-tier cap on concurrent sub-agents: 1..8, or undefined for the global cap. */
    function readTierCap(value) {
      const number = Number(value);
      return value === undefined || value === null || value === '' || !Number.isFinite(number)
        ? undefined
        : clamp(Math.round(number), 1, 8);
    }

    /** How many sub-agents a tier asks for: 0..8. */
    function readMinSubagents(value) {
      const number = Number(value);
      return Number.isFinite(number) ? clamp(Math.round(number), 0, 8) : 0;
    }

    /** A list of names stored as a JSON array or an array. */
    function readNameList(value) {
      let raw = value;
      if (typeof raw === 'string') {
        if (raw.trim() === '') return [];
        try {
          raw = JSON.parse(raw);
        } catch {
          return [];
        }
      }
      if (!Array.isArray(raw)) return [];
      const names = [];
      for (const item of raw) {
        const name = typeof item === 'string' ? item.trim() : '';
        if (name && !names.includes(name)) names.push(name);
      }
      return names;
    }

    /** Connectors a tier may use: null for all, or a list of server names. */
    function readConnectors(value) {
      if (value === undefined || value === null) return null;
      if (typeof value === 'string') {
        if (value.trim() === '') return null;
        try {
          if (!Array.isArray(JSON.parse(value))) return null;
        } catch {
          return null;
        }
      } else if (!Array.isArray(value)) return null;
      return readNameList(value);
    }

    /**
     * Parse the saved model versions.
     * @param {unknown} value - JSON string or array from settings.
     * @returns {object[]} normalized versions, in stored order.
     */
    function normalizeModelVersions(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try {
          parsed = value.trim() ? JSON.parse(value) : [];
        } catch {
          return [];
        }
      }
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      const result = [];
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
        const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
        const model = typeof raw.model === 'string' ? raw.model.trim() : '';
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || seen.has(id) || !provider || !model) continue;
        seen.add(id);
        result.push({
          id,
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : model,
          provider,
          model,
          effort: EFFORT_IDS.includes(raw.effort) ? raw.effort : undefined,
          wireEffort: typeof raw.wireEffort === 'string' && raw.wireEffort.trim() ? raw.wireEffort.trim() : undefined,
          temperature:
            typeof raw.temperature === 'number' && Number.isFinite(raw.temperature)
              ? clamp(raw.temperature, 0, 2)
              : undefined,
          maxTokens:
            typeof raw.maxTokens === 'number' && Number.isFinite(raw.maxTokens) && raw.maxTokens > 0
              ? Math.min(1_000_000, Math.floor(raw.maxTokens))
              : undefined,
          note: typeof raw.note === 'string' ? raw.note.slice(0, 200) : '',
        });
      }
      return result;
    }

    /** The stored form of a version: only the fields it sets. */
    function versionForStorage(version) {
      return {
        id: version.id,
        name: version.name,
        provider: version.provider,
        model: version.model,
        ...(version.effort ? { effort: version.effort } : {}),
        ...(version.wireEffort ? { wireEffort: version.wireEffort } : {}),
        ...(typeof version.temperature === 'number' ? { temperature: version.temperature } : {}),
        ...(typeof version.maxTokens === 'number' ? { maxTokens: version.maxTokens } : {}),
        ...(version.note ? { note: version.note } : {}),
      };
    }

    /** A unique id for a new version. */
    function uniqueVersionId(name, versions) {
      const base =
        String(name ?? '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'version';
      let id = base;
      for (let n = 2; versions.some((version) => version.id === id); n += 1) id = `${base}-${n}`;
      return id;
    }

    /** One line describing what a version sets. */
    function versionSummary(version) {
      const parts = [];
      if (version.effort) parts.push(EFFORTS.find((entry) => entry.id === version.effort)?.label ?? version.effort);
      if (typeof version.temperature === 'number') parts.push(`temp ${version.temperature.toFixed(2)}`);
      if (typeof version.maxTokens === 'number') parts.push(`${version.maxTokens} tokens`);
      return parts.length > 0 ? parts.join(' · ') : 'default settings';
    }

    /** Point a tier at its saved version: the version supplies the model. */
    function bindVersion(tier, versionsById) {
      const version = tier.version ? versionsById[tier.version] : undefined;
      if (!version) return tier;
      return { ...tier, provider: version.provider, model: version.model, versionId: version.id, versionName: version.name };
    }

    function tierHasRoute(tier, provider, model) {
      if (!tier || !provider || !model) return false;
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
      const modelVersions = normalizeModelVersions(source.modelVersions);
      const versionsById = Object.fromEntries(modelVersions.map((version) => [version.id, version]));
      const tiers = {};
      for (const [index, id] of TIER_IDS.entries()) {
        const tier = source.tiers?.[id] ?? {};
        const fallback = DEFAULT_TIERS[id];
        const ownLabel = typeof tier.label === 'string' ? tier.label.trim().slice(0, 40) : '';
        const name = ownLabel || TIER_META[id].label;
        tiers[id] = bindVersion({
          id,
          name,
          label: ownLabel,
          short: ownLabel ? name.slice(0, 1).toUpperCase() : TIER_META[id].short,
          role: TIER_META[id].role,
          prompt: typeof tier.instructions === 'string' ? tier.instructions.slice(0, 4000) : '',
          custom: false,
          order: index,
          variants: [],
          provider: typeof tier.provider === 'string' ? tier.provider.trim() : fallback.provider,
          model: typeof tier.model === 'string' ? tier.model.trim() : fallback.model,
          ownProvider: typeof tier.provider === 'string' ? tier.provider.trim() : fallback.provider,
          ownModel: typeof tier.model === 'string' ? tier.model.trim() : fallback.model,
          effort: EFFORT_IDS.includes(tier.effort) ? tier.effort : fallback.effort,
          webSearch: tier.webSearch !== false,
          webFetch: tier.webFetch !== false,
          browser: tier.browser !== false,
          subagents: tier.subagents !== false,
          maxSubagents: readTierCap(tier.maxSubagents),
          minSubagents: readMinSubagents(tier.minSubagents),
          version: typeof tier.version === 'string' ? tier.version.trim().toLowerCase() : '',
          skills: readNameList(tier.skills),
          connectors: readConnectors(tier.connectors),
        }, versionsById);
      }
      const customTiers = parseCustomTiers(source.customTiers);
      for (const tier of customTiers) {
        tiers[tier.id] = bindVersion({ ...tier, ownProvider: tier.provider, ownModel: tier.model }, versionsById);
      }
      const deck = [...TIER_IDS.map((id) => tiers[id]), ...customTiers.map((tier) => tiers[tier.id])];
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
        modelVersions,
        versionsById,
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

    /**
     * Write settings. `operations` may be a function `(config) => ops`: on a revision conflict it is
     * rebuilt from the freshly loaded config, so a retry never overwrites a newer change.
     */
    async function mutateSettings(ctx, operations, revision) {
      let current = revision;
      const first = typeof operations === 'function' ? null : operations;
      let ops = first;
      if (typeof operations === 'function') {
        const fresh = await loadSettings(ctx);
        current = fresh.revision;
        ops = operations(fresh.config);
      }
      let result = await ctx.remote.settings.mutate(NS, ops, current);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        current = fresh.revision;
        if (typeof operations === 'function') ops = operations(fresh.config);
        result = await ctx.remote.settings.mutate(NS, ops, current);
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
      // Per-model defaults were replaced by saved model versions in 0.10. Nothing is seeded any more.
      return settings;
    }

    /**
     * The skills and connectors a tier can pick from. Never throws: an older
     * server half, or a failed request, gives empty lists.
     * @returns {Promise<{skills: object[], connectors: object[]}>} lists.
     */
    async function loadExtras() {
      try {
        const response = await fetch(CATALOG_PATH, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) return { skills: [], connectors: [] };
        const body = await response.json();
        return {
          skills: Array.isArray(body.skills) ? body.skills : [],
          connectors: Array.isArray(body.connectors) ? body.connectors : [],
        };
      } catch {
        return { skills: [], connectors: [] };
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
              h(TierExtras, { tier, onPatch: (patch) => onChange({ ...tier, ...patch }) }),
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
                tier.version
                  ? 'The model version above is in charge of this tier’s model.'
                  : tier.provider && tier.model
                    ? 'Picking this tier switches the conversation to this model, with default settings.'
                    : 'No model set: this tier keeps whatever model the conversation is on.',
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
        const id = uniqueCustomId('New tier', tiers);
        const next = [
          ...customTiers,
          {
            id,
            name: 'New tier',
            short: 'N',
            role: '',
            prompt: '',
            // No model: a new tier follows the model the conversation is on until you pick one.
            provider: '',
            model: '',
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
          h('span', { className: 'dsh-mt-cardtitle' }, 'Your tiers'),
          h('span', { className: 'dsh-mt-effort' }, `${customTiers.length} of your own`),
          h('button', { type: 'button', className: 'dsh-mt-btn', onClick: addTier }, 'New tier'),
        ),
        h(
          'div',
          { className: 'dsh-mt-hint' },
          'Tiers you add yourself. The five starter tiers stay as they are; your tiers have the same settings, plus a short badge, a role line and model variants.',
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
              'No tiers of your own yet. Use New tier, or Copy on a starter tier. The five starters stay as they are.',
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
          provider: tier.ownProvider ?? '',
          model: tier.ownModel ?? '',
          effort: tier.effort,
          webSearch: tier.webSearch,
          webFetch: tier.webFetch,
          browser: tier.browser,
          subagents: tier.subagents,
          label: tier.label ?? '',
          instructions: tier.prompt ?? '',
          version: tier.version ?? '',
          minSubagents: tier.minSubagents ?? 0,
          ...(tier.maxSubagents === undefined ? {} : { maxSubagents: tier.maxSubagents }),
          skills: tier.skills ?? [],
          connectors: tier.connectors ?? null,
        };
      }
      return {
        app: 'dsh-model-tiers',
        version: 1,
        exportedAt: new Date().toISOString(),
        tiers,
        customTiers: config.customTiers,
        modelProfiles: config.modelProfiles,
        modelVersions: config.modelVersions.map(versionForStorage),
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
          if (typeof raw.label === 'string') fields.label = raw.label.trim().slice(0, 40);
          if (typeof raw.instructions === 'string') fields.instructions = raw.instructions.slice(0, 4000);
          if (typeof raw.version === 'string') fields.version = raw.version.trim().toLowerCase();
          if (raw.minSubagents !== undefined) fields.minSubagents = readMinSubagents(raw.minSubagents);
          if (readTierCap(raw.maxSubagents) !== undefined) fields.maxSubagents = readTierCap(raw.maxSubagents);
          if (Array.isArray(raw.skills)) fields.skills = JSON.stringify(readNameList(raw.skills));
          if (Array.isArray(raw.connectors)) fields.connectors = JSON.stringify(readNameList(raw.connectors));
          else if (raw.connectors === null) fields.connectors = '';
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

      // Saved versions travel with the model settings section.
      if (selected('modelProfiles') && Object.prototype.hasOwnProperty.call(imported, 'modelVersions')) {
        const incoming = normalizeModelVersions(imported.modelVersions);
        if (incoming.length > 0) {
          const merged = new Map(config.modelVersions.map((version) => [version.id, version]));
          for (const version of incoming) merged.set(version.id, version);
          ops.push({ op: 'set', path: ['modelVersions'], value: JSON.stringify([...merged.values()].map(versionForStorage)) });
        }
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
      { id: 'tiers', label: 'Starter tiers' },
      { id: 'customTiers', label: 'Your tiers' },
      { id: 'modelProfiles', label: 'Model versions' },
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
            'The export holds starter tiers, your tiers, model versions, project profiles, fallbacks and role routes. What each conversation picked is left out on purpose.',
          ),
          h(
            'p',
            { className: 'dsh-mt-hint' },
            'An import only adds and updates: anything that is not in the file stays as it is. Tiers, model versions, project profiles, fallbacks and role routes with the same id are updated.',
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
        if (tier.version && !config.versionsById?.[tier.version]) {
          tierIssues.push(`Model version "${tier.version}" no longer exists; the tier uses its own model, or the conversation's.`);
        }
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

    /** What the Settings page shares with every tier card: saved versions, pickable skills and connectors, the global cap. */
    const TierExtrasContext = React.createContext({
      versions: [],
      extras: { skills: [], connectors: [] },
      globalMax: 4,
    });

    /**
     * The parts of a tier beyond model, effort and access: its saved model version,
     * sub-agent limits, skills and connectors. Used by starter and custom tier cards.
     * @param {{tier: object, onPatch: (patch: object) => void}} props - `onPatch` receives
     *   `version` (string), `minSubagents` (0..8), `maxSubagents` (1..8 or undefined),
     *   `skills` (string[]) and `connectors` (null for all, or string[]).
     */
    function TierExtras({ tier, onPatch }) {
      const { versions, extras, globalMax } = React.useContext(TierExtrasContext);
      const [skillDraft, setSkillDraft] = useState('');
      const skills = tier.skills ?? [];
      const connectors = tier.connectors ?? null;
      const version = versions.find((item) => item.id === tier.version);
      const max = tier.maxSubagents ?? globalMax;
      const knownSkills = extras.skills.filter((skill) => !skills.includes(skill.name));
      const connectorNames = [
        ...extras.connectors.map((item) => item.name),
        ...(connectors ?? []).filter((name) => !extras.connectors.some((item) => item.name === name)),
      ];
      const addSkill = (name) => {
        const clean = String(name ?? '').trim();
        if (!clean || skills.includes(clean)) return;
        onPatch({ skills: [...skills, clean] });
        setSkillDraft('');
      };

      return h(
        'div',
        { className: 'dsh-mt-extras' },
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Model version'),
          h(
            'select',
            {
              className: 'dsh-mt-select',
              value: version ? version.id : '',
              'aria-label': 'Model version',
              onChange: (event) => onPatch({ version: event.target.value }),
            },
            h('option', { value: '' }, 'None: use the model above with default settings'),
            tier.version && !version ? h('option', { value: tier.version }, `Missing version (${tier.version})`) : null,
            versions.map((item) =>
              h('option', { key: item.id, value: item.id }, `${item.name} (${shortModel(item.model)} · ${versionSummary(item)})`),
            ),
          ),
          h(
            'span',
            { className: 'dsh-mt-hint' },
            version
              ? `This tier runs on ${version.provider}/${version.model} with that version's settings.`
              : versions.length === 0
                ? 'Create versions on the Model versions tab, or with “Save as new version…” in the chat box.'
                : 'A saved version supplies the tier’s model and its sampling settings.',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Sub-agents'),
          h(
            'div',
            { className: 'dsh-mt-inline' },
            h('span', null, 'Ask for at least'),
            h(
              'select',
              {
                className: 'dsh-mt-select dsh-mt-num',
                value: String(Math.min(tier.minSubagents ?? 0, max)),
                disabled: tier.subagents === false,
                'aria-label': 'Fewest sub-agents to ask for',
                onChange: (event) => onPatch({ minSubagents: Number(event.target.value) }),
              },
              Array.from({ length: max + 1 }, (_, n) => h('option', { key: n, value: String(n) }, n === 0 ? 'none' : String(n))),
            ),
            h('span', null, 'and allow at most'),
            h(
              'select',
              {
                className: 'dsh-mt-select dsh-mt-num',
                value: tier.maxSubagents === undefined ? '' : String(tier.maxSubagents),
                disabled: tier.subagents === false,
                'aria-label': 'Most sub-agents at once',
                onChange: (event) => {
                  const next = event.target.value === '' ? undefined : Number(event.target.value);
                  onPatch({
                    maxSubagents: next,
                    minSubagents: Math.min(tier.minSubagents ?? 0, next ?? globalMax),
                  });
                },
              },
              h('option', { value: '' }, `${globalMax} (app-wide)`),
              Array.from({ length: 8 }, (_, n) => h('option', { key: n + 1, value: String(n + 1) }, String(n + 1))),
            ),
            h('span', null, 'at once'),
          ),
          h(
            'span',
            { className: 'dsh-mt-hint' },
            tier.subagents === false
              ? 'Sub-agents are switched off for this tier.'
              : 'The most is enforced. The least is an instruction to the model: the app cannot force a model to delegate.',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Skills loaded with this tier'),
          skills.length > 0
            ? h(
                'div',
                { className: 'dsh-mt-pills' },
                skills.map((name) =>
                  h(
                    'span',
                    { key: name, className: 'dsh-mt-pill', 'data-missing': String(extras.skills.length > 0 && !extras.skills.some((skill) => skill.name === name)) },
                    name,
                    h(
                      'button',
                      {
                        type: 'button',
                        'aria-label': `Remove skill ${name}`,
                        onClick: () => onPatch({ skills: skills.filter((item) => item !== name) }),
                      },
                      '×',
                    ),
                  ),
                ),
              )
            : null,
          knownSkills.length > 0
            ? h(
                'select',
                {
                  className: 'dsh-mt-select',
                  value: '',
                  'aria-label': 'Add a skill',
                  onChange: (event) => addSkill(event.target.value),
                },
                h('option', { value: '' }, 'Add a skill…'),
                knownSkills.map((skill) =>
                  h('option', { key: skill.name, value: skill.name, title: skill.description }, skill.name),
                ),
              )
            : extras.skills.length === 0
              ? h('input', {
                  className: 'dsh-mt-input',
                  placeholder: 'Skill name, then Enter',
                  value: skillDraft,
                  'aria-label': 'Add a skill by name',
                  onChange: (event) => setSkillDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSkill(skillDraft);
                    }
                  },
                })
              : null,
          h(
            'span',
            { className: 'dsh-mt-hint' },
            'The skill’s instructions are added to the model’s instructions whenever this tier is active. Good for a skill written for a small, fast model. Up to 6.',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Connectors'),
          h(
            'select',
            {
              className: 'dsh-mt-select',
              value: connectors === null ? 'all' : 'some',
              'aria-label': 'Which connectors this tier may use',
              onChange: (event) => onPatch({ connectors: event.target.value === 'all' ? null : [] }),
            },
            h('option', { value: 'all' }, 'All connectors'),
            h('option', { value: 'some' }, 'Only the ones ticked below'),
          ),
          connectors !== null
            ? connectorNames.length > 0
              ? h(
                  'div',
                  { className: 'dsh-mt-switches' },
                  connectorNames.map((name) =>
                    h(Switch, {
                      key: name,
                      checked: connectors.includes(name),
                      label: name,
                      onChange: (value) =>
                        onPatch({
                          connectors: value ? [...connectors, name] : connectors.filter((item) => item !== name),
                        }),
                    }),
                  ),
                )
              : h('span', { className: 'dsh-mt-hint' }, 'No connectors are set up yet, so this tier uses none.')
            : null,
          h(
            'span',
            { className: 'dsh-mt-hint' },
            'Connectors are your MCP servers. Tools of a connector that is not ticked are hidden from the model in this tier.',
          ),
        ),
      );
    }

    /**
     * One saved model version: a named copy of a model with its own effort and sampling.
     */
    function VersionRow({ version, catalog, usedBy, onChange, onDuplicate, onDelete }) {
      const [name, setName] = useState(version.name);
      const [temperature, setTemperature] = useState(version.temperature === undefined ? '' : String(version.temperature));
      const [maxTokens, setMaxTokens] = useState(version.maxTokens === undefined ? '' : String(version.maxTokens));
      const [confirmDelete, setConfirmDelete] = useState(false);
      useEffect(() => {
        setName(version.name);
        setTemperature(version.temperature === undefined ? '' : String(version.temperature));
        setMaxTokens(version.maxTokens === undefined ? '' : String(version.maxTokens));
      }, [version.id, version.name, version.temperature, version.maxTokens]);

      const groups = catalog?.groups ?? [];
      const inCatalog = groups.some(
        (group) => group.id === version.provider && group.models.some((model) => model.id === version.model),
      );
      const blurOnEnter = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.target.blur();
        }
      };
      return h(
        'div',
        { className: 'dsh-mt-card dsh-mt-version' },
        h(
          'div',
          { className: 'dsh-mt-versiongrid' },
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Name'),
            h('input', {
              className: 'dsh-mt-input',
              value: name,
              maxLength: 80,
              'aria-label': 'Version name',
              onChange: (event) => setName(event.target.value),
              onKeyDown: blurOnEnter,
              onBlur: () => {
                const clean = name.trim();
                if (clean && clean !== version.name) onChange({ ...version, name: clean });
                else setName(version.name);
              },
            }),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Model'),
            h(
              'select',
              {
                className: 'dsh-mt-select',
                value: `${version.provider}\u0000${version.model}`,
                'aria-label': 'Model of this version',
                onChange: (event) => {
                  const [provider, model] = event.target.value.split('\u0000');
                  if (provider && model) onChange({ ...version, provider, model });
                },
              },
              inCatalog
                ? null
                : h('option', { value: `${version.provider}\u0000${version.model}` }, `${version.provider} / ${version.model} (not available now)`),
              groups.map((group) =>
                h(
                  'optgroup',
                  { key: group.id, label: group.name },
                  group.models.map((model) =>
                    h('option', { key: `${group.id}:${model.id}`, value: `${group.id}\u0000${model.id}` }, model.name),
                  ),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Effort'),
            h(
              'select',
              {
                className: 'dsh-mt-select',
                value: version.effort ?? '',
                'aria-label': 'Effort of this version',
                onChange: (event) => onChange({ ...version, effort: event.target.value || undefined }),
              },
              h('option', { value: '' }, 'Not set (the tier or slider decides)'),
              EFFORTS.map((effort) => h('option', { key: effort.id, value: effort.id }, effort.label)),
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
              placeholder: 'Default',
              value: temperature,
              'aria-label': 'Temperature, 0 to 2, empty for the default',
              onChange: (event) => setTemperature(event.target.value),
              onKeyDown: blurOnEnter,
              onBlur: () => {
                const next = optionalNumber(temperature, 0, 2);
                if (next !== version.temperature) onChange({ ...version, temperature: next });
                setTemperature(next === undefined ? '' : String(next));
              },
            }),
          ),
          h(
            'div',
            { className: 'dsh-mt-field' },
            h('span', { className: 'dsh-mt-label' }, 'Max output tokens'),
            h('input', {
              className: 'dsh-mt-input',
              type: 'number',
              min: 1,
              max: 1000000,
              step: 1,
              placeholder: 'Default',
              value: maxTokens,
              'aria-label': 'Max output tokens, empty for the default',
              onChange: (event) => setMaxTokens(event.target.value),
              onKeyDown: blurOnEnter,
              onBlur: () => {
                const next = optionalInteger(maxTokens);
                if (next !== version.maxTokens) onChange({ ...version, maxTokens: next });
                setMaxTokens(next === undefined ? '' : String(next));
              },
            }),
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-actions' },
          h(
            'span',
            { className: 'dsh-mt-hint', style: { marginRight: 'auto' } },
            usedBy.length > 0 ? `Used by: ${usedBy.join(', ')}` : 'Not used by a tier. Pick it in the chat box, or assign it to a tier.',
          ),
          h('button', { type: 'button', className: 'dsh-mt-btn', onClick: onDuplicate }, 'Duplicate'),
          confirmDelete
            ? h(
                React.Fragment,
                null,
                h('button', { type: 'button', className: 'dsh-mt-btn', 'data-danger': 'true', onClick: onDelete }, 'Delete for good'),
                h('button', { type: 'button', className: 'dsh-mt-btn', onClick: () => setConfirmDelete(false) }, 'Keep'),
              )
            : h('button', { type: 'button', className: 'dsh-mt-btn', onClick: () => setConfirmDelete(true) }, 'Delete'),
        ),
      );
    }

    /**
     * The "Model versions" tab: named copies of a model with their own settings.
     */
    function VersionsEditor({ versions, deck, catalog, onSave }) {
      const [pick, setPick] = useState('');
      const groups = catalog?.groups ?? [];
      const write = (next) => onSave(next.map(versionForStorage));
      const add = (value) => {
        const [provider, model] = String(value).split('\u0000');
        if (!provider || !model) return;
        const modelName = groups.find((group) => group.id === provider)?.models.find((item) => item.id === model)?.name ?? model;
        let name = `${modelName} copy`;
        for (let n = 2; versions.some((item) => item.name === name); n += 1) name = `${modelName} copy ${n}`;
        write([...versions, { id: uniqueVersionId(name, versions), name, provider, model }]);
        setPick('');
      };
      return h(
        'div',
        { className: 'dsh-mt-grid' },
        h(
          'div',
          { className: 'dsh-mt-card' },
          h('div', { className: 'dsh-mt-cardtitle' }, 'Saved versions of a model'),
          h(
            'div',
            { className: 'dsh-mt-hint' },
            'A version is a named copy of a model with its own effort, temperature and max tokens, for example one for writing and one for coding. ' +
              'The plain model always stays in the chat box list with default settings. ' +
              'The app sends temperature and max tokens only: top-p, top-k and similar settings stay on your model server.',
          ),
          h(
            'div',
            { className: 'dsh-mt-actions' },
            groups.length > 0
              ? h(
                  'select',
                  {
                    className: 'dsh-mt-select',
                    style: { maxWidth: 320 },
                    value: pick,
                    'aria-label': 'New version of which model',
                    onChange: (event) => add(event.target.value),
                  },
                  h('option', { value: '' }, 'New version of…'),
                  groups.map((group) =>
                    h(
                      'optgroup',
                      { key: group.id, label: group.name },
                      group.models.map((model) =>
                        h('option', { key: `${group.id}:${model.id}`, value: `${group.id}\u0000${model.id}` }, model.name),
                      ),
                    ),
                  ),
                )
              : h('span', { className: 'dsh-mt-hint' }, 'Add a model in Settings → Models first.'),
          ),
        ),
        versions.length === 0
          ? h('div', { className: 'dsh-mt-hint' }, 'No saved versions yet.')
          : versions.map((version) =>
              h(VersionRow, {
                key: version.id,
                version,
                catalog,
                usedBy: deck.filter((tier) => tier.version === version.id).map((tier) => tierLabel(tier)),
                onChange: (next) => write(versions.map((item) => (item.id === version.id ? next : item))),
                onDuplicate: () => {
                  let name = `${version.name} copy`;
                  for (let n = 2; versions.some((item) => item.name === name); n += 1) name = `${version.name} copy ${n}`;
                  write([...versions, { ...version, id: uniqueVersionId(name, versions), name }]);
                },
                onDelete: () => write(versions.filter((item) => item.id !== version.id)),
              }),
            ),
      );
    }

    /** A starter tier's own name and instructions, saved when the field loses focus. */
    function StarterText({ tier, meta, onPatch }) {
      const [label, setLabel] = useState(tier.label ?? '');
      const [instructions, setInstructions] = useState(tier.prompt ?? '');
      useEffect(() => {
        setLabel(tier.label ?? '');
        setInstructions(tier.prompt ?? '');
      }, [tier.id, tier.label, tier.prompt]);
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dsh-mt-field' },
          h('span', { className: 'dsh-mt-label' }, 'Name'),
          h('input', {
            className: 'dsh-mt-input',
            value: label,
            maxLength: 40,
            placeholder: meta.label,
            'aria-label': 'Tier name',
            onChange: (event) => setLabel(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.target.blur();
              }
            },
            onBlur: () => {
              const clean = label.trim();
              if (clean !== (tier.label ?? '')) onPatch({ label: clean });
            },
          }),
        ),
        h(
          'div',
          { className: 'dsh-mt-field' },
          h(
            'div',
            { className: 'dsh-mt-rangehead' },
            h('span', { className: 'dsh-mt-label' }, 'Instructions'),
            h('span', { className: 'dsh-mt-hint' }, `${instructions.length} / 4000`),
          ),
          h('textarea', {
            className: 'dsh-mt-input dsh-mt-textarea',
            rows: 3,
            maxLength: 4000,
            value: instructions,
            placeholder: 'Leave empty to use this starter’s built-in guidance. What you write here is given to the model whenever this tier is active.',
            'aria-label': 'Tier instructions',
            onChange: (event) => setInstructions(event.target.value),
            onBlur: () => {
              if (instructions !== (tier.prompt ?? '')) onPatch({ instructions });
            },
          }),
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
      const [extras, setExtras] = useState({ skills: [], connectors: [] });
      useEffect(() => {
        let alive = true;
        loadExtras().then((value) => {
          if (alive) setExtras(value);
        });
        return () => {
          alive = false;
        };
      }, []);

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
        const ops = [];
        for (const [field, raw] of Object.entries(patch)) {
          let value = raw;
          if (field === 'skills') value = JSON.stringify(raw ?? []);
          if (field === 'connectors') value = raw === null || raw === undefined ? '' : JSON.stringify(raw);
          // An unset cap falls back to the app-wide one.
          if (field === 'maxSubagents' && raw === undefined) {
            ops.push({ op: 'unset', path: ['tiers', id, field] });
            continue;
          }
          ops.push({ op: 'set', path: ['tiers', id, field], value });
        }
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
        const customId = uniqueCustomId(`${source.name} copy`, config.tiers);
        const order =
          config.customTiers.reduce((max, tier) => Math.max(max, tier.order ?? 0), 0) + 10;
        const tier = {
          id: customId,
          name: `${source.name} copy`,
          short: `${source.short}c`.slice(0, 2),
          role: meta.role,
          prompt: source.prompt ?? '',
          provider: source.ownProvider ?? '',
          model: source.ownModel ?? '',
          effort: source.effort,
          webSearch: source.webSearch,
          webFetch: source.webFetch,
          browser: source.browser,
          subagents: source.subagents,
          maxSubagents: source.maxSubagents,
          minSubagents: source.minSubagents ?? 0,
          version: source.version ?? '',
          skills: source.skills ?? [],
          connectors: source.connectors ?? null,
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
        TierExtrasContext.Provider,
        { value: { versions: config.modelVersions, extras, globalMax: config.maxSubagents } },
        h(
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
            'A tier is a way of working: how hard the model thinks, what it may use, how many sub-agents it runs, its own instructions, skills and connectors. ' +
              'A model version is a named copy of a model with its own sampling settings. A tier can point at a version, or simply follow the model you pick in the chat box.',
          ),
          h(
            'p',
            null,
            'Models come from Settings → Models. If a model is missing from a list here, add it there first.',
          ),
        ),
        h(
          'div',
          { className: 'dsh-mt-tabs', role: 'tablist', 'aria-label': 'Model tiers sections' },
          [
            { id: 'tiers', label: 'Starter tiers', count: TIER_IDS.length },
            { id: 'custom', label: 'Your tiers', count: config.customTiers.length },
            { id: 'models', label: 'Model versions', count: config.modelVersions.length },
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
          h(VersionsEditor, {
            versions: config.modelVersions,
            deck: config.deck,
            catalog: state.catalog,
            onSave: (next) =>
              save([{ op: 'set', path: ['modelVersions'], value: JSON.stringify(next) }]),
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
            return h(
              'div',
              { className: 'dsh-mt-card', key: id },
              h(
                'div',
                { className: 'dsh-mt-cardhead' },
                h('span', { className: 'dsh-mt-badge' }, tier.short),
                h('span', { className: 'dsh-mt-cardtitle' }, tier.name),
                tier.name !== meta.label
                  ? h('span', { className: 'dsh-mt-hint' }, `starter: ${meta.label}`)
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-mt-link',
                    style: { marginLeft: 'auto' },
                    title: 'Make a copy under Your tiers',
                    onClick: () => copyTier(id),
                  },
                  'Copy',
                ),
              ),
              h('div', { className: 'dsh-mt-cardrole' }, meta.role),
              h(StarterText, { tier, meta, onPatch: (patch) => setTier(id, patch) }),
              h(ModelPicker, {
                tier: { ...tier, provider: tier.ownProvider, model: tier.ownModel },
                catalog: state.catalog,
                onChange: (provider, model) => setTier(id, { provider, model }),
              }),
              h(
                'div',
                { className: 'dsh-mt-hint' },
                tier.versionId
                  ? `The model version below is in charge: ${tier.versionName}.`
                  : tier.ownProvider && tier.ownModel
                    ? 'Picking this tier switches the conversation to this model, with default settings.'
                    : 'No model set: this tier keeps whatever model the conversation is on.',
                tier.ownProvider && tier.ownModel && !tier.versionId
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mt-link',
                        style: { marginLeft: 8 },
                        onClick: () => setTier(id, { provider: '', model: '' }),
                      },
                      'Clear model',
                    )
                  : null,
              ),
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
              h(TierExtras, { tier, onPatch: (patch) => setTier(id, patch) }),
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
                  // Rules only: a reset never removes the models, names or instructions you set.
                  for (const id of TIER_IDS) {
                    for (const [field, value] of Object.entries(DEFAULT_TIERS[id])) {
                      if (field === 'provider' || field === 'model') continue;
                      ops.push({ op: 'set', path: ['tiers', id, field], value });
                    }
                  }
                  ops.push({ op: 'set', path: ['maxSubagents'], value: 4 });
                  ops.push({ op: 'set', path: ['ultraAutoDelegate'], value: true });
                  save(ops);
                },
              },
              'Reset tier rules',
            ),
          ),
        ),
        ),
        h(
          'div',
          { className: 'dsh-mt-status', 'data-error': state.error ? 'true' : 'false' },
          state.error ?? (state.saving ? 'Saving…' : 'Changes are saved as you make them.'),
        ),
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

      let tierId;
      let provider;
      let model;
      let effort;
      let picked;
      let sessionTemperature;
      let sessionMaxTokens;

      if (typeof entry === 'string') {
        const tier = config.tiers[entry];
        if (!tier || !tier.provider || !tier.model) return undefined;
        tierId = entry;
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
        picked = typeof entry.version === 'string' ? config.versionsById?.[entry.version] : undefined;
        provider =
          picked?.provider ??
          (typeof entry.provider === 'string' && entry.provider.length > 0 ? entry.provider : tier?.provider);
        model =
          picked?.model ??
          (typeof entry.model === 'string' && entry.model.length > 0 ? entry.model : tier?.model);
        if (!provider || !model) return undefined;

        tierId = tierId ?? (config.deck ?? []).find((item) => tierHasRoute(item, provider, model))?.id;
        effort = EFFORT_IDS.includes(entry.effort) ? entry.effort : undefined;
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

      const matched = tierId ? config.tiers[tierId] : undefined;
      // A tier's own version follows the tier's own model only.
      const version =
        picked ??
        (matched?.versionId && matched.provider === provider && matched.model === model
          ? config.versionsById?.[matched.versionId]
          : undefined);
      const profile = version ? undefined : profileFor(config.modelProfiles, provider, model);
      const defaults = version ?? profile;
      const rules = matched ?? { webSearch: true, webFetch: true, browser: true, subagents: true };
      return {
        webSearch: rules.webSearch,
        webFetch: rules.webFetch,
        browser: rules.browser,
        subagents: rules.subagents,
        tierId,
        provider,
        model,
        effort: effort ?? version?.effort ?? matched?.effort ?? 'medium',
        versionId: version?.id,
        versionName: version?.name,
        pickedVersionId: picked?.id,
        temperature: sessionTemperature,
        modelTemperature: defaults?.temperature,
        effectiveTemperature: sessionTemperature ?? defaults?.temperature,
        maxTokens: sessionMaxTokens,
        modelMaxTokens: defaults?.maxTokens,
        effectiveMaxTokens: sessionMaxTokens ?? defaults?.maxTokens,
        wireEffort: defaults?.wireEffort,
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

    /**
     * The one model control of the chat box: model or saved version, effort slider,
     * tier, and sampling for this conversation. It replaces the app's own model menu
     * while this add-on is on.
     */
    function ModelControl({ appCtx, sessionId, useWorkspaces }) {
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
      const [query, setQuery] = useState('');
      const [draftEffort, setDraftEffort] = useState(null);
      const [draftTemperature, setDraftTemperature] = useState(0.7);
      const [autoTemperature, setAutoTemperature] = useState(true);
      const [draftMaxTokens, setDraftMaxTokens] = useState(4096);
      const [autoMaxTokens, setAutoMaxTokens] = useState(true);
      const [saveName, setSaveName] = useState(null);
      const [current, setCurrent] = useState(null);
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
      const [anchor, setAnchor] = useState({ left: 8, bottom: 80, maxHeight: 520 });

      useEffect(() => {
        autoProfileAppliedRef.current = false;
        setDraftEffort(null);
        setSaveName(null);
      }, [sessionId]);

      // The app's own record of this conversation's model, so the button is right even when no tier is set.
      const directory = (() => {
        try {
          return appCtx.get('modelDirectories')?.directoryFor?.(sessionId) ?? null;
        } catch {
          return null;
        }
      })();
      useEffect(() => {
        if (!directory?.store) {
          setCurrent(null);
          return undefined;
        }
        const read = () => {
          try {
            const snapshot = directory.store.getSnapshot();
            setCurrent(snapshot?.pending ?? snapshot?.current ?? null);
          } catch {
            setCurrent(null);
          }
        };
        read();
        try {
          directory.load?.().catch(() => {});
        } catch {
          // Addressed sub-agent sessions have no model directory.
        }
        const stop = directory.store.subscribe?.(read);
        return typeof stop === 'function' ? stop : undefined;
      }, [directory]);

      const place = useCallback(() => {
        const element = triggerRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const width = Math.min(POP_WIDTH, window.innerWidth - 16);
        // Right edges aligned, as the app's own menus do; kept inside the window.
        const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
        const bottom = Math.max(8, window.innerHeight - rect.top + 8);
        setAnchor({ left, bottom, width, maxHeight: Math.max(220, window.innerHeight - bottom - 12) });
      }, []);

      const reload = useCallback(async () => {
        try {
          const [settings, catalog] = await Promise.all([loadSettings(appCtx), loadCatalog(appCtx)]);
          setState((prev) => ({
            ...prev,
            status: 'ready',
            config: settings.config,
            revision: settings.revision,
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
      }, [reload, sessionId]);

      useEffect(() => {
        if (!open) return undefined;
        reload();
        place();
        const onKey = (event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            triggerRef.current?.focus?.();
          }
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
        return () => {
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('pointerdown', onPointer, true);
          window.removeEventListener('resize', onViewport);
        };
      }, [open, reload, place]);

      const config = state.config;
      const selection = config ? resolveSelection(config, sessionId) : undefined;
      // The route in use: this conversation's tier choice, else what the app has selected.
      const route = selection
        ? { provider: selection.provider, model: selection.model }
        : current?.provider && current?.model
          ? { provider: current.provider, model: current.model }
          : null;
      const activeTierId = selection?.tierId ?? (route ? matchTierId(config, route.provider, route.model) : undefined);
      const activeTier = activeTierId ? config?.tiers?.[activeTierId] : undefined;
      const activeVersion = selection?.versionId ? config?.versionsById?.[selection.versionId] : undefined;
      const catalogModel = route ? findCatalogModel(state.catalog, route.provider, route.model) : undefined;
      const hasThinking = (catalogModel?.reasoning?.efforts ?? []).length > 0;

      const sessionProfileId = config?.sessionProfiles?.[sessionId];
      const projectProfileId = config?.projectProfiles?.projects?.[projectKey]?.profileId;
      const activeProfileId = sessionProfileId ?? projectProfileId;
      const profiles = config?.projectProfiles?.profiles ?? [];
      const projectProfile = profiles.find((profile) => profile.id === projectProfileId);
      const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
      const visibleDeck = activeProfile
        ? (config?.deck ?? []).filter((tier) => activeProfile.tierIds.includes(tier.id))
        : config?.deck ?? [];
      const projectDefaultTierId = activeProfile?.defaultTierId;
      const roleRoutes = activeTierId ? config?.roleModels?.[activeTierId] : undefined;
      const roleIds = roleRoutes ? ROLE_IDS.filter((role) => roleRoutes[role]) : [];

      const effort = draftEffort ?? selection?.effort ?? null;
      const effortIndex = effort ? Math.max(0, EFFORT_IDS.indexOf(effort)) : EFFORT_IDS.indexOf('medium');

      useEffect(() => {
        setDraftEffort(null);
      }, [selection?.effort, selection?.provider, selection?.model]);
      useEffect(() => {
        setAutoTemperature(selection?.temperature === undefined);
        setDraftTemperature(selection?.effectiveTemperature ?? 0.7);
      }, [selection?.temperature, selection?.modelTemperature, sessionId]);
      useEffect(() => {
        setAutoMaxTokens(selection?.maxTokens === undefined);
        setDraftMaxTokens(selection?.effectiveMaxTokens ?? 4096);
      }, [selection?.maxTokens, selection?.modelMaxTokens, sessionId]);

      const fail = (error) =>
        setState((prev) => ({
          ...prev,
          busy: null,
          error: error instanceof Error ? error.message : String(error),
        }));

      /**
       * Record this conversation's choice and switch the app to its model.
       * @param {object} choice - tierId, version, provider, model, effort, temperature, maxTokens.
       * @param {(latest: object) => object[]} [extraOps] - more settings changes for the same save.
       */
      const applySelection = async (choice, extraOps) => {
        if (!config) return;
        if (!choice.provider || !choice.model) {
          setState((prev) => ({ ...prev, error: 'Pick a model first.' }));
          return;
        }
        setState((prev) => ({ ...prev, busy: 'apply', error: null }));
        let saved;
        try {
          const entry = {
            tier: choice.tierId ?? null,
            ...(choice.version ? { version: choice.version } : {}),
            provider: choice.provider,
            model: choice.model,
            effort: choice.effort,
            ...(typeof choice.temperature === 'number' ? { temperature: choice.temperature } : {}),
            ...(typeof choice.maxTokens === 'number' && choice.maxTokens > 0
              ? { maxTokens: Math.floor(choice.maxTokens) }
              : {}),
          };
          saved = await mutateSettings(
            appCtx,
            (latest) => [
              ...(extraOps ? extraOps(latest) : []),
              { op: 'set', path: ['activeTiers'], value: JSON.stringify({ ...latest.activeTiers, [sessionId]: entry }) },
            ],
            state.revision,
          );
          const target = findCatalogModel(state.catalog, choice.provider, choice.model);
          const pinned = choice.wireEffort;
          const advertised = (target?.reasoning?.efforts ?? []).map((item) => item.id);
          const wire = pinned && advertised.includes(pinned) ? pinned : chooseEffort(target?.reasoning?.efforts, choice.effort);
          const request = {
            provider: choice.provider,
            model: choice.model,
            ...(wire === undefined ? {} : { reasoningEffort: wire }),
          };
          const result = directory?.select
            ? await directory.select(request)
            : await appCtx.remote.session.selectModel({ sessionId, ...request });
          if (result && result.ok === false) throw new Error(`${result.error.code}: ${result.error.message}`);
          setState((prev) => ({ ...prev, busy: null, config: saved.config, revision: saved.revision, error: null }));
        } catch (error) {
          // A failed model switch must not leave a misleading choice behind:
          // put back only this conversation's earlier entry.
          if (saved) {
            try {
              const previous = config.activeTiers?.[sessionId];
              await mutateSettings(
                appCtx,
                (latest) => {
                  const next = { ...latest.activeTiers };
                  if (previous === undefined) delete next[sessionId];
                  else next[sessionId] = previous;
                  return [{ op: 'set', path: ['activeTiers'], value: JSON.stringify(next) }];
                },
                saved.revision,
              );
            } catch {
              // Keep the original failure visible; the next write will reconcile.
            }
          }
          setDraftEffort(null);
          // Reload first: it clears the error line, and the failure must stay visible.
          await reload();
          fail(error);
        }
      };

      /** What the conversation has now, as a choice to change one part of. */
      const baseChoice = () =>
        route
          ? {
              tierId: activeTierId,
              version: selection?.pickedVersionId,
              provider: route.provider,
              model: route.model,
              effort: selection?.effort ?? activeTier?.effort ?? 'medium',
              temperature: selection?.temperature,
              maxTokens: selection?.maxTokens,
              wireEffort: selection?.wireEffort,
            }
          : null;

      const pickModel = (provider, model) => {
        if (route && route.provider === provider && route.model === model && !selection?.versionId) {
          return;
        }
        // The plain model: default settings, whatever tier is active.
        applySelection({
          tierId: selection?.tierId,
          provider,
          model,
          effort: selection?.effort ?? activeTier?.effort ?? 'medium',
        });
      };

      const pickVersion = (version) => {
        applySelection({
          tierId: selection?.tierId,
          version: version.id,
          provider: version.provider,
          model: version.model,
          effort: version.effort ?? selection?.effort ?? activeTier?.effort ?? 'medium',
          wireEffort: version.wireEffort,
        });
      };

      const pickTier = (id) => {
        const tier = config?.tiers?.[id];
        if (!tier) return;
        // A tier with no model of its own keeps the model the conversation is on.
        const provider = tier.provider || route?.provider;
        const model = tier.model || route?.model;
        if (!provider || !model) {
          setState((prev) => ({ ...prev, error: 'Pick a model first, or give this tier a model in Settings.' }));
          return;
        }
        const version = tier.versionId ? config.versionsById[tier.versionId] : undefined;
        applySelection({
          tierId: id,
          ...(tier.provider && tier.model && version ? { version: version.id, wireEffort: version.wireEffort } : {}),
          provider,
          model,
          effort: tier.effort,
        });
      };

      const pickRole = (role) => {
        const target = roleRoutes?.[role];
        if (!activeTier || !target) return;
        applySelection({ tierId: activeTierId, provider: target.provider, model: target.model, effort: activeTier.effort });
      };

      const commitEffort = (next) => {
        const base = baseChoice();
        if (!base || (selection && next === selection.effort)) return;
        applySelection({ ...base, effort: next });
      };

      const commitTemperature = (temperature) => {
        const base = baseChoice();
        if (!base || temperature === selection?.temperature) return;
        applySelection({ ...base, temperature });
      };

      const commitMaxTokens = (maxTokens) => {
        const base = baseChoice();
        if (!base || maxTokens === selection?.maxTokens) return;
        applySelection({ ...base, maxTokens });
      };

      /** Save the settings in use as a new named version of this model, and switch to it. */
      const saveAsVersion = () => {
        const name = String(saveName ?? '').trim();
        const base = baseChoice();
        if (!base || !name) return;
        if ((config.modelVersions ?? []).some((version) => version.name.toLowerCase() === name.toLowerCase())) {
          setState((prev) => ({ ...prev, error: `A version named "${name}" already exists. Pick another name.` }));
          return;
        }
        const id = uniqueVersionId(name, config.modelVersions ?? []);
        const version = {
          id,
          name,
          provider: base.provider,
          model: base.model,
          effort: base.effort,
          wireEffort: activeVersion?.wireEffort,
          temperature: selection?.effectiveTemperature,
          maxTokens: selection?.effectiveMaxTokens,
        };
        applySelection(
          { tierId: base.tierId, version: id, provider: base.provider, model: base.model, effort: base.effort, wireEffort: version.wireEffort },
          (latest) => [
            {
              op: 'set',
              path: ['modelVersions'],
              value: JSON.stringify([
                ...latest.modelVersions.filter((item) => item.id !== id).map(versionForStorage),
                versionForStorage(version),
              ]),
            },
          ],
        ).then(() => setSaveName(null));
      };

      /** Write the settings in use back into the saved version that is active. */
      const updateVersion = () => {
        const base = baseChoice();
        if (!base || !activeVersion) return;
        const next = {
          ...activeVersion,
          effort: base.effort,
          temperature: selection?.effectiveTemperature,
          maxTokens: selection?.effectiveMaxTokens,
        };
        applySelection(
          { tierId: base.tierId, version: activeVersion.id, provider: base.provider, model: base.model, effort: base.effort, wireEffort: activeVersion.wireEffort },
          (latest) => [
            {
              op: 'set',
              path: ['modelVersions'],
              value: JSON.stringify(
                latest.modelVersions.map((item) => versionForStorage(item.id === activeVersion.id ? next : item)),
              ),
            },
          ],
        );
      };

      const setProfile = async (profileId) => {
        if (!config) return;
        setState((prev) => ({ ...prev, busy: 'profile', error: null }));
        try {
          const saved = await mutateSettings(
            appCtx,
            (latest) => {
              const nextMap = { ...latest.sessionProfiles };
              if (profileId) nextMap[sessionId] = profileId;
              else delete nextMap[sessionId];
              return [{ op: 'set', path: ['sessionProfiles'], value: JSON.stringify(nextMap) }];
            },
            state.revision,
          );
          const nextProfile = profiles.find((profile) => profile.id === (profileId || projectProfileId));
          setState((prev) => ({ ...prev, busy: null, config: saved.config, revision: saved.revision, error: null }));
          if (nextProfile?.defaultTierId && (!selection || !nextProfile.tierIds.includes(selection.tierId))) {
            pickTier(nextProfile.defaultTierId);
          }
        } catch (error) {
          fail(error);
        }
      };

      /** Forget this conversation's tier and settings; the model it is on stays. */
      const clearChoice = async () => {
        if (!config) return;
        setState((prev) => ({ ...prev, busy: 'clear', error: null }));
        try {
          const saved = await mutateSettings(
            appCtx,
            (latest) => {
              const nextMap = { ...latest.activeTiers };
              delete nextMap[sessionId];
              return [{ op: 'set', path: ['activeTiers'], value: JSON.stringify(nextMap) }];
            },
            state.revision,
          );
          setDraftEffort(null);
          setState((prev) => ({ ...prev, busy: null, config: saved.config, revision: saved.revision, error: null }));
        } catch (error) {
          fail(error);
        }
      };

      // A new conversation in a project with a tier set starts on that set's default tier, once.
      useEffect(() => {
        if (autoProfileAppliedRef.current) return;
        if (!config || selection || !projectDefaultTierId || !route) return;
        autoProfileAppliedRef.current = true;
        pickTier(projectDefaultTierId);
      }, [config, selection, projectDefaultTierId, route?.provider, route?.model]);

      const busy = state.busy !== null;
      const effortLabel = selection ? EFFORTS.find((entry) => entry.id === (effort ?? selection.effort))?.label : null;
      const modelName = activeVersion?.name ?? catalogModel?.name ?? (route ? shortModel(route.model) : null);
      const triggerText = modelName ?? 'Select model';
      const filter = query.trim().toLowerCase();
      const versions = (config?.modelVersions ?? []).filter(
        (version) => !filter || `${version.name} ${version.model} ${version.provider}`.toLowerCase().includes(filter),
      );
      const groups = (state.catalog?.groups ?? [])
        .map((group) => {
          const groupMatch = !filter || `${group.name} ${group.id}`.toLowerCase().includes(filter);
          return {
            ...group,
            models: groupMatch
              ? group.models
              : group.models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(filter)),
          };
        })
        .filter((group) => group.models.length > 0);
      const changedFromVersion =
        activeVersion !== undefined &&
        (selection.temperature !== undefined ||
          selection.maxTokens !== undefined ||
          (activeVersion.effort !== undefined && activeVersion.effort !== selection.effort));

      const check = h('span', { className: 'dsh-mc-check', 'aria-hidden': true }, '✓');

      const panel = !open
        ? null
        : h(
            'div',
            {
              className: 'dsh-mc-pop',
              role: 'dialog',
              'aria-label': 'Model, effort and tier for this conversation',
              ref: popRef,
              style: {
                position: 'fixed',
                left: anchor.left,
                bottom: anchor.bottom,
                width: anchor.width ?? POP_WIDTH,
                maxHeight: anchor.maxHeight,
              },
            },
            // ---- model list
            h('input', {
              className: 'dsh-mc-search',
              type: 'search',
              placeholder: 'Search models and saved versions',
              value: query,
              autoFocus: true,
              'aria-label': 'Search models and saved versions',
              onChange: (event) => setQuery(event.target.value),
            }),
            h(
              'div',
              { className: 'dsh-mc-list', role: 'listbox', 'aria-label': 'Models' },
              versions.length > 0 ? h('div', { className: 'dsh-mc-group' }, 'Saved versions') : null,
              versions.map((version) => {
                const active = selection?.versionId === version.id;
                return h(
                  'button',
                  {
                    key: `v:${version.id}`,
                    type: 'button',
                    role: 'option',
                    'aria-selected': active,
                    className: 'dsh-mc-item',
                    'data-active': String(active),
                    disabled: busy,
                    title: `${version.provider}/${version.model}`,
                    onClick: () => pickVersion(version),
                  },
                  h(
                    'span',
                    { className: 'dsh-mc-itemmain' },
                    h('span', { className: 'dsh-mc-itemname' }, version.name),
                    h('span', { className: 'dsh-mc-itemmeta' }, `${shortModel(version.model)} · ${versionSummary(version)}`),
                  ),
                  active ? check : null,
                );
              }),
              groups.map((group) =>
                h(
                  React.Fragment,
                  { key: `g:${group.id}` },
                  h('div', { className: 'dsh-mc-group' }, group.name),
                  group.models.map((model) => {
                    const active =
                      route?.provider === group.id && route?.model === model.id && !selection?.versionId;
                    return h(
                      'button',
                      {
                        key: `m:${group.id}:${model.id}`,
                        type: 'button',
                        role: 'option',
                        'aria-selected': active,
                        className: 'dsh-mc-item',
                        'data-active': String(active),
                        disabled: busy,
                        title: `${group.id}/${model.id}`,
                        onClick: () => pickModel(group.id, model.id),
                      },
                      h('span', { className: 'dsh-mc-itemmain' }, h('span', { className: 'dsh-mc-itemname' }, model.name)),
                      active ? check : null,
                    );
                  }),
                ),
              ),
              versions.length === 0 && groups.length === 0
                ? h(
                    'div',
                    { className: 'dsh-mc-empty' },
                    filter ? 'Nothing matches that search.' : 'No models yet. Add one in Settings → Models.',
                  )
                : null,
            ),
            // ---- effort
            h(
              'div',
              { className: 'dsh-mc-block' },
              h(
                'div',
                { className: 'dsh-mc-rowhead' },
                h('span', { className: 'dsh-mc-label' }, 'Effort'),
                h('span', { className: 'dsh-mc-value' }, effort ? EFFORTS[effortIndex].label : 'Default'),
              ),
              h(
                'div',
                { className: 'dsh-mc-slider', 'data-unset': String(!effort), style: { '--dsh-mc-fill': `${(effortIndex / (EFFORTS.length - 1)) * 100}%` } },
                h('input', {
                  type: 'range',
                  min: 0,
                  max: EFFORTS.length - 1,
                  step: 1,
                  value: effortIndex,
                  disabled: !route || busy,
                  'aria-label': 'Effort',
                  'aria-valuetext': effort ? EFFORTS[effortIndex].label : 'Default',
                  onChange: (event) => setDraftEffort(EFFORT_IDS[Number(event.target.value)]),
                  onPointerUp: (event) => commitEffort(EFFORT_IDS[Number(event.target.value)]),
                  onKeyUp: (event) => commitEffort(EFFORT_IDS[Number(event.target.value)]),
                }),
                h(
                  'div',
                  { className: 'dsh-mc-stops', 'aria-hidden': true },
                  EFFORT_IDS.map((id, index) => h('span', { key: id, 'data-on': String(Boolean(effort) && index <= effortIndex) })),
                ),
              ),
              h(
                'div',
                { className: 'dsh-mc-ends', 'aria-hidden': true },
                h('span', null, 'Off'),
                h('span', null, 'Ultra Code'),
              ),
              route && !hasThinking && state.catalog
                ? h('div', { className: 'dsh-mc-note' }, 'This model has no thinking control. Effort still changes how carefully it is told to work.')
                : null,
            ),
            // ---- tier
            h(
              'div',
              { className: 'dsh-mc-block' },
              h(
                'div',
                { className: 'dsh-mc-rowhead' },
                h('span', { className: 'dsh-mc-label' }, 'Tier'),
                selection
                  ? h('button', { type: 'button', className: 'dsh-mc-link', disabled: busy, onClick: clearChoice }, 'Reset')
                  : null,
              ),
              h(
                'div',
                { className: 'dsh-mc-chips' },
                visibleDeck.map((tier) =>
                  h(
                    'button',
                    {
                      key: tier.id,
                      type: 'button',
                      className: 'dsh-mc-chip',
                      'aria-pressed': tier.id === activeTierId,
                      'data-active': String(tier.id === activeTierId),
                      disabled: busy,
                      title: [
                        tier.role,
                        tier.provider && tier.model
                          ? `Model: ${tier.versionName ?? `${tier.provider}/${tier.model}`}`
                          : 'Keeps the model you are on',
                      ]
                        .filter(Boolean)
                        .join('\n'),
                      onClick: () => pickTier(tier.id),
                    },
                    tierLabel(tier),
                  ),
                ),
              ),
              profiles.length > 0
                ? h(
                    'select',
                    {
                      className: 'dsh-mc-select',
                      value: sessionProfileId ?? '',
                      disabled: busy,
                      'aria-label': 'Project profile',
                      onChange: (event) => setProfile(event.target.value || undefined),
                    },
                    h('option', { value: '' }, projectProfile ? `Project profile · ${projectProfile.name}` : 'All tiers'),
                    profiles.map((profile) => h('option', { key: profile.id, value: profile.id }, profile.name)),
                  )
                : null,
              roleIds.length > 0
                ? h(
                    'div',
                    { className: 'dsh-mc-chips' },
                    roleIds.map((role) =>
                      h(
                        'button',
                        {
                          key: role,
                          type: 'button',
                          className: 'dsh-mc-chip dsh-mc-chip-quiet',
                          'data-active': String(
                            roleRoutes[role].provider === route?.provider && roleRoutes[role].model === route?.model,
                          ),
                          disabled: busy,
                          title: `Switch to the ${role} model: ${roleRoutes[role].provider}/${roleRoutes[role].model}`,
                          onClick: () => pickRole(role),
                        },
                        ROLES.find((entry) => entry.id === role)?.label ?? role,
                      ),
                    ),
                  )
                : null,
            ),
            // ---- sampling
            h(
              'details',
              { className: 'dsh-mc-block dsh-mc-details' },
              h(
                'summary',
                { className: 'dsh-mc-rowhead' },
                h('span', { className: 'dsh-mc-label' }, 'Sampling'),
                h(
                  'span',
                  { className: 'dsh-mc-value' },
                  selection?.effectiveTemperature === undefined && selection?.effectiveMaxTokens === undefined
                    ? 'Default'
                    : [
                        selection.effectiveTemperature === undefined ? null : `temp ${selection.effectiveTemperature.toFixed(2)}`,
                        selection.effectiveMaxTokens === undefined ? null : `${selection.effectiveMaxTokens} tokens`,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                ),
              ),
              h(
                'div',
                { className: 'dsh-mc-field' },
                h(
                  'label',
                  { className: 'dsh-mc-checkrow' },
                  h('input', {
                    type: 'checkbox',
                    checked: !autoTemperature,
                    disabled: !route || busy,
                    onChange: (event) => {
                      const custom = event.target.checked;
                      setAutoTemperature(!custom);
                      commitTemperature(custom ? draftTemperature : undefined);
                    },
                  }),
                  h('span', null, 'Temperature'),
                  h(
                    'span',
                    { className: 'dsh-mc-value' },
                    autoTemperature
                      ? selection?.modelTemperature !== undefined
                        ? `${selection.modelTemperature.toFixed(2)} (saved)`
                        : 'Default'
                      : draftTemperature.toFixed(2),
                  ),
                ),
                h('input', {
                  className: 'dsh-mc-range',
                  type: 'range',
                  min: 0,
                  max: 2,
                  step: 0.05,
                  value: draftTemperature,
                  disabled: autoTemperature || !route || busy,
                  'aria-label': 'Temperature',
                  onChange: (event) => setDraftTemperature(Number(event.target.value)),
                  onPointerUp: (event) => commitTemperature(Number(event.target.value)),
                  onKeyUp: (event) => commitTemperature(Number(event.target.value)),
                }),
              ),
              h(
                'div',
                { className: 'dsh-mc-field' },
                h(
                  'label',
                  { className: 'dsh-mc-checkrow' },
                  h('input', {
                    type: 'checkbox',
                    checked: !autoMaxTokens,
                    disabled: !route || busy,
                    onChange: (event) => {
                      const custom = event.target.checked;
                      setAutoMaxTokens(!custom);
                      commitMaxTokens(custom ? draftMaxTokens : undefined);
                    },
                  }),
                  h('span', null, 'Max output tokens'),
                  h(
                    'span',
                    { className: 'dsh-mc-value' },
                    autoMaxTokens
                      ? selection?.modelMaxTokens !== undefined
                        ? `${selection.modelMaxTokens} (saved)`
                        : 'Default'
                      : '',
                  ),
                ),
                autoMaxTokens
                  ? null
                  : h('input', {
                      className: 'dsh-mc-input',
                      type: 'number',
                      min: 1,
                      max: 1000000,
                      step: 1,
                      value: draftMaxTokens,
                      disabled: !route || busy,
                      'aria-label': 'Max output tokens',
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
              h('div', { className: 'dsh-mc-note' }, 'The app sends temperature and max tokens only. Other sampling settings stay on your model server.'),
              saveName === null
                ? h(
                    'div',
                    { className: 'dsh-mc-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-mc-btn',
                        disabled: !route || busy,
                        title: 'Keep these settings as a named version of this model. The plain model stays as it is.',
                        onClick: () => setSaveName(''),
                      },
                      'Save as new version…',
                    ),
                    changedFromVersion
                      ? h(
                          'button',
                          { type: 'button', className: 'dsh-mc-btn', disabled: busy, onClick: updateVersion },
                          `Update “${activeVersion.name}”`,
                        )
                      : null,
                  )
                : h(
                    'form',
                    {
                      className: 'dsh-mc-actions',
                      onSubmit: (event) => {
                        event.preventDefault();
                        saveAsVersion();
                      },
                    },
                    h('input', {
                      className: 'dsh-mc-input',
                      type: 'text',
                      autoFocus: true,
                      maxLength: 80,
                      placeholder: 'Name, for example “Writing”',
                      value: saveName,
                      'aria-label': 'Name of the new version',
                      onChange: (event) => setSaveName(event.target.value),
                    }),
                    h('button', { type: 'submit', className: 'dsh-mc-btn dsh-mc-btn-primary', disabled: busy || !saveName.trim() }, 'Save'),
                    h('button', { type: 'button', className: 'dsh-mc-btn', onClick: () => setSaveName(null) }, 'Cancel'),
                  ),
            ),
            state.error ? h('div', { className: 'dsh-mc-error', role: 'alert' }, state.error) : null,
            h('div', { className: 'dsh-mc-foot' }, 'Tiers and saved versions: Settings → Model Tiers'),
          );

      return h(
        'div',
        { className: 'dsh-mc-wrap', ref: rootRef },
        h(Styles),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-mc-trigger',
            ref: triggerRef,
            'data-open': String(open),
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': route
              ? `Model ${triggerText}${activeTier ? `, tier ${tierLabel(activeTier)}` : ''}${effortLabel ? `, effort ${effortLabel}` : ''}`
              : 'Select model',
            title: route ? `${route.provider}/${route.model}` : 'Select a model for this conversation',
            onClick: () => {
              if (open) setOpen(false);
              else {
                place();
                setQuery('');
                setSaveName(null);
                setOpen(true);
              }
            },
          },
          activeTier ? h('span', { className: 'dsh-mt-badge', title: `Tier: ${tierLabel(activeTier)}` }, activeTier.short) : null,
          h('span', { className: 'dsh-mc-triggername' }, triggerText),
          effortLabel ? h('span', { className: 'dsh-mc-triggereffort' }, effortLabel) : null,
          h('span', { className: 'dsh-mc-chevron', 'aria-hidden': true }, busy ? '…' : '▾'),
        ),
        panel && typeof document !== 'undefined' ? ReactDOM.createPortal(panel, document.body) : null,
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
          // Beside the send button, where the app's own model menu sits.
          ctx.slots.inject('conversation.input.right', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.right',
                id: 'model-tier',
                order: 900,
                label: () => t('composer.tier'),
              },
              (props) => h(ModelControl, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
