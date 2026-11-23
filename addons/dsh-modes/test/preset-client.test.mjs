// Preset for each mode (item 7), the browser half: the Settings row's state and what it saves, the lock on the app's
// preset menu (greyed, out of the keyboard order, its clicks and keys stopped, our (i) left alone) and where the (i)s go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const cut = (name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} is in client.js`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(name);
};
const line = (name) => {
  const found = source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'));
  assert.ok(found, `const ${name} is in client.js`);
  return found[0];
};

const parts = new Function(`
  ${line('PRESET_LOCK_CHOICES')}
  ${line('PRESET_CHIP_SLOT')}
  ${cut('presetLocksOf')}
  ${cut('presetRowState')}
  ${cut('nextPresetLocks')}
  ${cut('presetLoosenQuestion')}
  ${cut('presetChipButton')}
  ${cut('applyChipLock')}
  ${cut('chipEventBlocked')}
  ${cut('presetSlotNear')}
  return { presetLocksOf, presetRowState, nextPresetLocks, presetLoosenQuestion, presetChipButton, applyChipLock, chipEventBlocked, presetSlotNear, PRESET_CHIP_SLOT };
`)();

const RECON = { id: 'recon', label: 'Recon', defaultLock: 'standard', warn: 'Unsafe. With Any, a Recon thread can start in PTC.', swap: { standard: '', creator: 'Recon keeps its own tools and rules.' } };
const CHAT = { id: 'chat', label: 'Chat', defaultLock: 'any', warn: '', swap: { standard: '', creator: '' } };
const CREATOR = { id: 'creator-plus', label: 'Creator Plus', defaultLock: 'creator', warn: 'With Any, ...', swap: { standard: 'Creator Plus then works without its two inspection tools.', creator: '' } };

test('the row shows the choice in force: the stored one, else the tab\'s default', () => {
  assert.equal(parts.presetRowState(RECON, {}, {}).choice, 'standard');
  assert.equal(parts.presetRowState(CHAT, {}, {}).choice, 'any');
  assert.equal(parts.presetRowState(CHAT, { chat: 'standard' }, {}).choice, 'standard');
  assert.equal(parts.presetRowState(CREATOR, {}, {}).choice, 'creator');
  assert.deepEqual(parts.presetLocksOf('{"chat":"standard","x":"bad"}'), { chat: 'standard' });
  assert.deepEqual(parts.presetLocksOf('nope'), {});
});

test('loosening a default lock to Any turns the row red with its warning; other changes get a quiet note', () => {
  const loose = parts.presetRowState(RECON, { recon: 'any' }, {});
  assert.equal(loose.loose, true);
  assert.equal(loose.warn, RECON.warn);
  assert.equal(parts.presetRowState(RECON, {}, {}).loose, false);
  assert.equal(parts.presetRowState(CHAT, { chat: 'any' }, {}).loose, false, 'an unlocked tab is never red');
  assert.equal(parts.presetRowState(RECON, { recon: 'creator' }, {}).note, 'Recon keeps its own tools and rules.');
  assert.equal(parts.presetRowState(CREATOR, { 'creator-plus': 'standard' }, {}).note, CREATOR.swap.standard);
  assert.equal(parts.presetRowState(CREATOR, {}, { creator: false }).note, 'missing', 'a missing Creator preset is said');
  assert.equal(parts.presetRowState(CREATOR, {}, { creator: null }).note, '', 'not when the app cannot say');
});

test('a pick back to the default stores no entry; the question starts on Cancel and quotes the warning', () => {
  assert.equal(parts.nextPresetLocks({ recon: 'any', chat: 'standard' }, RECON, 'standard'), '{"chat":"standard"}');
  assert.equal(parts.nextPresetLocks({}, RECON, 'any'), '{"recon":"any"}');
  assert.equal(parts.nextPresetLocks({}, CHAT, 'any'), '{}');
  const t = (key, values) => `${key}${values ? JSON.stringify(values) : ''}`;
  const question = parts.presetLoosenQuestion(t, RECON);
  assert.equal(question.danger, true, 'starts on Cancel');
  assert.equal(question.text, RECON.warn);
  assert.match(question.title, /Recon/);
});

// ---- the app's preset menu ---------------------------------------------------------------------------------

class El {
  constructor(tag, attrs = {}) { this.tagName = tag; this.attrs = { ...attrs }; this.children = []; this.parentElement = null; }
  append(...kids) { for (const kid of kids) { kid.parentElement = this; this.children.push(kid); } return this; }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  matches(selector) {
    if (selector === 'button[aria-haspopup="menu"]') return this.tagName === 'button' && this.attrs['aria-haspopup'] === 'menu';
    if (selector === "[data-slot='conversation.hero.agentPreset']") return this.attrs['data-slot'] === 'conversation.hero.agentPreset';
    if (selector === '.dshu-infowrap') return (this.attrs.class ?? '').split(' ').includes('dshu-infowrap');
    return false;
  }
  querySelector(selector) {
    for (const kid of this.children) { if (kid.matches(selector)) return kid; const deep = kid.querySelector(selector); if (deep) return deep; }
    return null;
  }
  closest(selector) { for (let here = this; here; here = here.parentElement) if (here.matches(selector)) return here; return null; }
}

function page() {
  const menu = new El('button', { 'aria-haspopup': 'menu', title: 'Choose the agent preset' });
  const infoButton = new El('button', { 'aria-haspopup': 'dialog' });
  const info = new El('span', { class: 'dshu-infowrap' }).append(infoButton);
  const slot = new El('div', { 'data-slot': 'conversation.hero.agentPreset' }).append(menu, info);
  const anchor = new El('span');
  const optionSlot = new El('div', { 'data-slot': 'conversation.hero.options' }).append(anchor);
  const options = new El('div').append(optionSlot);
  const row = new El('div').append(new El('button'), slot, options);
  return { row, slot, menu, info, infoButton, anchor };
}

test('the lock greys the app\'s menu and takes it out of the keyboard order; unlocking gives it back', () => {
  const { slot, menu } = page();
  assert.equal(parts.presetChipButton(slot), menu, 'the app\'s menu button, not our (i)');
  assert.equal(parts.applyChipLock(slot, true), true);
  assert.equal(menu.getAttribute('aria-disabled'), 'true');
  assert.equal(menu.getAttribute('tabindex'), '-1');
  assert.equal(menu.getAttribute('data-dsh-preset-lock'), 'true');
  parts.applyChipLock(slot, false);
  assert.equal(menu.getAttribute('aria-disabled'), null);
  assert.equal(menu.getAttribute('tabindex'), null);
  // A button the app itself made unreachable (not ours) is left as it is.
  menu.setAttribute('tabindex', '0');
  parts.applyChipLock(slot, false);
  assert.equal(menu.getAttribute('tabindex'), '0');
  assert.equal(parts.applyChipLock(new El('div'), true), false, 'a renamed slot: nothing to lock');
});

test('while locked, clicks and the opening keys on the menu are stopped; our (i) and other keys pass', () => {
  const { menu, infoButton } = page();
  assert.equal(parts.chipEventBlocked({ type: 'click', target: menu }, true), true);
  assert.equal(parts.chipEventBlocked({ type: 'pointerdown', target: menu }, true), true);
  assert.equal(parts.chipEventBlocked({ type: 'keydown', key: 'Enter', target: menu }, true), true);
  assert.equal(parts.chipEventBlocked({ type: 'keydown', key: ' ', target: menu }, true), true);
  assert.equal(parts.chipEventBlocked({ type: 'keydown', key: 'Tab', target: menu }, true), false, 'Tab moves on');
  assert.equal(parts.chipEventBlocked({ type: 'click', target: infoButton }, true), false, 'the (i) still opens');
  assert.equal(parts.chipEventBlocked({ type: 'click', target: menu }, false), false, 'unlocked: nothing is stopped');
});

test('the (i) finds the menu of its own new-chat row', () => {
  const { anchor, slot } = page();
  assert.equal(parts.presetSlotNear(anchor), slot);
  assert.equal(parts.presetSlotNear(new El('span')), null);
});

test('the (i) is registered beside the menu and beside the started chat\'s label, its pop-up portalled', () => {
  assert.match(source, /name: 'conversation\.hero\.options', id: 'modes-preset-info', order: 1 \}/);
  assert.match(source, /name: 'conversation\.session\.header\.actions', id: 'modes-preset-info', order: -9 \}/);
  const body = (name) => { const at = source.indexOf(`function ${name}(`); return source.slice(at, source.indexOf('\n    function ', at + 10)); };
  const header = body('PresetHeaderInfo');
  assert.match(header, /portal: true/, 'the header moves fixed children: the pop-up goes to the page body');
  assert.ok(source.includes('presetParts ??= dshUi.makeParts(React, ReactDOM)'), 'made once, with ReactDOM');
  const hero = body('PresetHeroInfo');
  assert.match(hero, /ReactDOM\.createPortal\(h\('span', \{ className: 'dsh-mpl-info' \}/, 'the (i) sits inside the menu\'s own slot');
  assert.match(hero, /view\.greyed && view\.blank/, 'only a blank chat in a locked tab is greyed');
  assert.match(source, /'plock\.hint':/);
  assert.match(source, /'plock\.ask\.ok': 'Allow any preset'/);
});

test('Recon\'s Any is marked unsafe in the menu and in the question; its row always shows its plain line', () => {
  const t = (key, values) => `${key}${values ? JSON.stringify(values) : ''}`;
  const unsafe = parts.presetLoosenQuestion(t, { ...RECON, caution: 'Any is unsafe here.' });
  assert.match(unsafe.title, /^plock\.ask\.title\.unsafe/);
  assert.match(parts.presetLoosenQuestion(t, CREATOR).title, /^plock\.ask\.title\{/, 'other tabs keep the plain question');
  assert.match(source, /'plock\.ask\.title\.unsafe': 'Allow PTC in \{tab\}\? This is unsafe\.'/);
  assert.match(source, /'plock\.any\.unsafe': 'Any \(unsafe\)'/);
  assert.match(source, /!row\.loose && tab\.caution \? h\('div'/, 'the caution line shows at the default too');
});

test('the (i) and the lock ask in the page\'s language, and read again at once when the Modes settings change', () => {
  const body = (name) => { const at = source.indexOf(`function ${name}(`); return source.slice(at, source.indexOf('\n    function ', at + 10)); };
  assert.match(source, /'x-dsh-locale': presetLang\(appCtx\)/);
  const view = body('usePresetView');
  assert.match(view, /dshPoll\.onChange\(appCtx, \(ns\) => \{ if \(ns === NS\) \{ timer\.poke\(\); soon\(\); \} \}\)/);
  assert.match(view, /setTimeout\(\(\) => \{ if \(alive\) void load\(\); \}, 1700\)/, 'a second read soon after, so a draft that stays on screen is switched in time');
  assert.match(view, /clearTimeout\(again\); timer\.stop\(\)/, 'and no read after the (i) is gone');
  assert.match(view, /mine === asked/, 'an older answer never replaces a newer one');
  assert.doesNotMatch(source, /label: 'Standard or PTC'/, 'the (i)\'s name comes from the route, in the page\'s language');
});
