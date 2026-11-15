/**
 * Renders the Settings page's browser half without a browser: the module is loaded in a sandbox, a
 * small stand-in for React runs its hooks, and the built-in fetch answers with the data the host
 * really sends. It catches a page that cannot render; it is not a test of React itself.
 * Run with `node test/page.test.mjs` in the add-on's folder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

let fails = 0;
let ran = 0;
const check = (name, ok, detail = '') => {
  ran += 1;
  if (ok) {
    console.log('ok   ', name);
  } else {
    fails += 1;
    console.log('FAIL ', name, detail);
  }
};

// ---- a small stand-in for React --------------------------------------------------------------

const states = new Map();
let current = null;

const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, key: props?.key, children: children.flat(Infinity) };
  },
  useState(initial) {
    const slot = current.hooks[current.index++] ?? (current.hooks[current.index - 1] = { value: undefined });
    if (!('value' in slot) || (!slot.touched && slot.value === undefined && initial !== undefined)) slot.value = typeof initial === 'function' ? initial() : initial;
    return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; slot.touched = true; }];
  },
  useEffect(effect, deps) {
    const index = current.index++;
    const slot = current.hooks[index] ?? (current.hooks[index] = {});
    const first = !('deps' in slot);
    const changed = first || (Array.isArray(deps) && (deps.length !== slot.deps.length || deps.some((one, n) => !Object.is(one, slot.deps[n]))));
    if (changed) {
      slot.deps = deps;
      const cleanup = effect();
      slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  },
  useRef(initial) {
    const index = current.index++;
    if (!(index in current.hooks)) current.hooks[index] = { current: initial };
    return current.hooks[index];
  },
  useCallback(fn) {
    return fn;
  },
};

/** Render one function component of the tree. */
const renderInstance = (element) => {
  const name = `${element.type.name}|${element.key ?? ''}`;
  if (!states.has(name)) states.set(name, []);
  current = { hooks: states.get(name), index: 0 };
  return element.type(element.props);
};

/** The whole tree, as plain elements and text. */
const walk = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }];
  if (typeof node.type === 'function') return walk(renderInstance(node));
  return [{ element: node, children: walk(node.children) }];
};

/** Every piece of text in a part of the tree. */
const allText = (nodes) => {
  const out = [];
  const visit = (list) => {
    for (const node of list) {
      if (node.text !== undefined) out.push(node.text);
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return out.join(' | ');
};
const elementsOf = (nodes) => {
  const out = [];
  const visit = (list) => {
    for (const node of list) {
      if (node.element) out.push(node.element);
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return out;
};
/** The parts of the tree with one class name, so the text of each can be read on its own. */
const nodesOfClass = (nodes, name) => {
  const out = [];
  const visit = (list) => {
    for (const node of list) {
      if (node.element && String(node.element.props.className ?? '').split(' ').includes(name)) out.push(node);
      if (node.children) visit(node.children);
    }
  };
  visit(nodes);
  return out;
};

// ---- the page's data, as the host sends it ---------------------------------------------------

const state = {
  room: '/private/tmp/dsh-recon-room',
  exportFolder: '/Users/someone/.dsh/recon/exports',
  waitingToWipe: 0,
  usenet: {
    route: 'direct',
    defaultAccount: 'default',
    accounts: [
      { id: 'default', label: '', host: 'news.provider.example', port: 563, hasLogin: true, storeCommand: 'security add-generic-password -U -s dsh-recon-usenet -a YOUR_USERNAME -w', removeCommand: 'security delete-generic-password -s dsh-recon-usenet' },
      { id: 'a1', label: 'Work', host: 'news.work.example', port: 119, hasLogin: false, storeCommand: 'security add-generic-password -U -s dsh-recon-usenet-a1 -a YOUR_USERNAME -w', removeCommand: 'security delete-generic-password -s dsh-recon-usenet-a1' },
    ],
  },
  at: 1,
  enabled: true,
  problem: '',
  toolsOn: true,
  tools: ['recon_onion_search', 'recon_onion_read', 'recon_usenet_groups', 'recon_usenet_search', 'recon_usenet_read', 'recon_cite'],
  network: true,
  tor: { state: 'stopped', path: '/opt/homebrew/bin/tor', version: '0.4.8', test: { state: 'none', text: '' } },
  blocklist: { size: 0, at: 0 },
  engine: { builtIn: 'ahmia', other: false, host: '' },
  more: { archive: true, archiveDirect: true, news: false, archiveHost: 'web.archive.org', newsHost: 'api.gdeltproject.org' },
};

/** What the route tells the start page's status bar about its conversation. */
const bar = { tab: 'recon', asked: 0, conversation: { known: true, recon: true, inRoom: true, model: 'small', provider: 'Mine', where: 'local', may: true, agreed: false } };

// ---- load and render the page ----------------------------------------------------------------

const source = readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8');
let page = null;
const sandbox = {
  window: { __ModuleLoader__: { load: (module) => { page = module; } } },
  document: { hidden: false, baseURI: 'http://127.0.0.1:55314/', documentElement: { getAttribute: (name) => (name === 'data-cws-tab' ? bar.tab : null), style: { setProperty: () => {}, removeProperty: () => {} } } },
  fetch: async (address) => {
    if (!String(address).includes('session=')) return { ok: true, json: async () => state };
    bar.asked += 1;
    bar.last = String(address);
    return { ok: true, json: async () => ({ ...state, conversation: bar.conversation }) };
  },
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  URL,
  console,
};
vm.runInNewContext(source, sandbox);
check('the browser half loads', page?.id === '@local/dsh-recon' && typeof page.factory === 'function');

const module = page.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected require(${name})`);
});

let section = null;
/** Every slot the module fills, by name. */
const filled = new Map();
/** Every write the page asks for, so what it saves can be read. */
const mutations = [];
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  locale: { register: () => {}, bind: () => (key) => key },
  slots: { inject: (_name, fn) => fn(), register: (decl, component) => { filled.set(decl.name, { decl, component }); if (decl.name === 'settings.section') section = { decl, component }; } },
  remote: {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [{ ns: 'recon', revision: 1, value: {} }] } }),
      mutate: async (ns, ops) => { mutations.push({ ns, ops }); return { ok: true }; },
    },
  },
};
module.apply(ctx);
check('the page is registered in Settings', section?.decl?.id === 'recon' && typeof section?.component === 'function');

const first = walk(section.component({}));
check('before its data arrives it says so', allText(first).includes('Loading'), allText(first).slice(0, 200));

// The page asks its route for the data in an effect; let that promise settle.
await new Promise((resolve) => setTimeout(resolve, 50));
const tree = walk(section.component({}));
const text = allText(tree);
const elements = elementsOf(tree);
const classes = (name) => elements.filter((element) => String(element.props.className ?? '').split(' ').includes(name));

check('the page renders its data', text.includes('Connect to Usenet') && text.includes('Tor'), text.slice(0, 200));
check('the accounts group is there', text.includes('Usenet accounts'), text.slice(0, 400));
check('it shows a row for each account', classes('dsh-rc-account').length === 2, `${classes('dsh-rc-account').length} rows`);
const titles = nodesOfClass(tree, 'dsh-rc-rowtitle').map((node) => allText([node]));
const values = elements.filter((element) => element.type === 'input').map((input) => String(input.props.value ?? ''));
check('each row names its server or its name', titles.some((one) => one.includes('news.provider.example')) && titles.some((one) => one.includes('Work')), titles.join(' / '));
check('each row carries its server and port', values.includes('news.provider.example') && values.includes('news.work.example') && values.includes('119'), values.join(' / '));
check('the default account is marked', classes('dsh-rc-tag').length === 1 && text.includes('default'));

const buttons = elements.filter((element) => element.type === 'button');
const labels = buttons.map((button) => walk(button.children).map((node) => node.text ?? '').join());
check('each account can be saved and removed', buttons.filter((button) => walk(button.children).some((node) => node.text === 'Save')).length === 2 && buttons.filter((button) => walk(button.children).some((node) => node.text === 'Remove')).length === 2, labels.join(', '));
check('only the other account can be made the default', buttons.filter((button) => walk(button.children).some((node) => node.text === 'Make default')).length === 1, labels.join(', '));
check('a new account can be added', buttons.filter((button) => walk(button.children).some((node) => node.text === 'Add')).length === 1 && text.includes('Add another account'));

const inputs = elements.filter((element) => element.type === 'input');
check('every account has its three fields, and the add form too', inputs.length === 9, `${inputs.length} inputs`);
check('the fields say which server and port they take', inputs.some((input) => input.props.placeholder === 'news.example.com') && inputs.some((input) => input.props.placeholder === '563'));

check('an account without a login is shown how to store it', text.includes('security add-generic-password -U -s dsh-recon-usenet-a1 -a YOUR_USERNAME -w'));
check('an account with a login shows how to remove it', text.includes('security delete-generic-password -s dsh-recon-usenet'));
check('the page says where the account is used', text.includes('names the account to use'));

// ---- what the buttons write -----------------------------------------------------------------

const labelOf = (button) => allText(walk(button));
const buttonsOf = (nodes) => elementsOf(nodes).filter((element) => element.type === 'button');
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

{
  // Adding an account: the server typed in, then Add.
  const typed = elementsOf(tree).find((element) => element.type === 'input' && element.props['aria-label'] === 'New news server');
  typed.props.onChange({ target: { value: 'news.new.example' } });
  const next = walk(section.component({}));
  const add = buttonsOf(next).find((button) => labelOf(button) === 'Add');
  check('the Add button wakes up once a server is typed', add !== undefined && add.props.disabled === false, JSON.stringify(add?.props.disabled));
  add.props.onClick();
  await tick();
  const saved = mutations.at(-1);
  const set = Object.fromEntries((saved?.ops ?? []).map((op) => [op.path.join('.'), op.value]));
  check('adding an account writes the whole list', Array.isArray(set.usenetAccounts) && set.usenetAccounts.length === 3, JSON.stringify(set));
  check('the new account is the one typed', set.usenetAccounts?.[2]?.host === 'news.new.example' && set.usenetAccounts[2].port === 563, JSON.stringify(set.usenetAccounts?.[2]));
  check('each account is written with its four fields only', (set.usenetAccounts ?? []).every((one) => JSON.stringify(Object.keys(one).sort()) === '["host","id","label","port"]'), JSON.stringify(set.usenetAccounts));
  check('the older single server is cleared, so it cannot come back', set.usenetHost === '');
  check('the default account is left alone when there is one', !('usenetDefaultAccount' in set), JSON.stringify(set));
}

{
  // Removing the default account: it goes, and the default is cleared with it.
  const before = mutations.length;
  const remove = buttonsOf(tree).find((button) => labelOf(button) === 'Remove');
  remove.props.onClick();
  await tick();
  const set = Object.fromEntries((mutations.at(-1)?.ops ?? []).map((op) => [op.path.join('.'), op.value]));
  check('removing an account writes the list without it', mutations.length > before && set.usenetAccounts?.length === 1 && set.usenetAccounts[0].id === 'a1', JSON.stringify(set));
  check('removing the default account clears the default', set.usenetDefaultAccount === '', JSON.stringify(set));
}

{
  // Making the other account the default.
  const before = mutations.length;
  const make = buttonsOf(tree).find((button) => labelOf(button) === 'Make default');
  make.props.onClick();
  await tick();
  const set = Object.fromEntries((mutations.at(-1)?.ops ?? []).map((op) => [op.path.join('.'), op.value]));
  check('another account can be made the default', mutations.length > before && set.usenetDefaultAccount === 'a1', JSON.stringify(set));
}

// ---- the Internet Archive's route ---------------------------------------------------------------

{
  const now = walk(section.component({}));
  const toggle = elementsOf(now).find((element) => element.props['aria-label'] === 'Read Internet Archive copies directly (not through Tor)');
  check('the page has the switch for reading the Archive directly', toggle?.props.role === 'switch' && toggle.props['aria-checked'] === 'true', JSON.stringify(toggle?.props ?? null));
  check('its description says the Archive then sees this Mac\'s address', allText(now).includes('The Archive then sees this Mac\'s internet address.') && allText(now).includes('GDELT and .onion sites always go through Tor.'));
  const before = mutations.length;
  toggle.props.onClick();
  await tick();
  const set = Object.fromEntries((mutations.at(-1)?.ops ?? []).map((op) => [op.path.join('.'), op.value]));
  check('switching it off writes archiveDirect', mutations.length > before && set.archiveDirect === false, JSON.stringify(set));
}

// ---- the status bar on the Recon tab's start page -----------------------------------------------

{
  const slot = filled.get('conversation.hero.options');
  check('the status bar is registered on the start page', slot?.decl?.id === 'recon-bar' && typeof slot.component === 'function');
  const draw = async (sessionId) => {
    walk(slot.component({ sessionId }));
    await tick();
    const nodes = walk(slot.component({ sessionId }));
    return { nodes, text: allText(nodes), pills: nodesOfClass(nodes, 'dsh-rc-pill').map((node) => ({ text: allText([node]), state: node.element.props['data-state'] })), hint: nodesOfClass(nodes, 'dsh-rc-hint')[0] };
  };
  const shown = await draw('s1');
  check('it asks the route about its own conversation', bar.asked === 1 && bar.last === 'http://127.0.0.1:55314/dsh-recon/state?session=s1', bar.last);
  check('it shows Tor, Usenet, the Archive\'s route and the model', ['Tor starts with the first search', 'Usenet on, 2 accounts', 'Internet Archive read directly', 'small, on this Mac', 'Findings go to this model'].every((text) => shown.pills.some((pill) => pill.text === text)), JSON.stringify(shown.pills));
  check('a local model is shown as fine', shown.pills.find((pill) => pill.text === 'Findings go to this model')?.state === 'ok');
  check('it says the conversation is isolated', allText([shown.hint]).startsWith('Isolated:') && shown.hint.element.props['data-error'] === 'false');
  check('it says what isolation means, and not that nothing goes out', allText([shown.hint]).includes('nothing from other conversations comes in, and nothing of it goes to them') && !allText([shown.hint]).includes('nothing goes out'), allText([shown.hint]));
  check('it has no button: agreeing to a cloud model stays typed', elementsOf(shown.nodes).every((element) => element.type !== 'button'));

  bar.conversation = { ...bar.conversation, model: 'big', provider: 'DeepSeek', where: 'cloud', may: false };
  const cloud = await draw('s2');
  check('a cloud model shows findings held back', cloud.pills.some((pill) => pill.text === 'big, in the cloud' && pill.state === 'warn') && cloud.pills.some((pill) => pill.text === 'Findings held back' && pill.state === 'warn'), JSON.stringify(cloud.pills));
  check('and says to type /recon cloud', allText([cloud.hint]).includes('Type /recon cloud to agree for this conversation') && cloud.hint.element.props['data-error'] === 'true');

  bar.conversation = { ...bar.conversation, may: true, agreed: true, inRoom: false };
  const outside = await draw('s3');
  check('a conversation outside Recon\'s folder is told to start a new one', allText([outside.hint]).includes('not in Recon\'s own folder'));

  bar.conversation = { known: false };
  const unknown = await draw('s4');
  check('a conversation the app has not loaded shows its model as not known yet', unknown.pills.some((pill) => pill.text === 'Model not known yet' && pill.state === 'none') && !unknown.pills.some((pill) => pill.text === 'No model picked'), JSON.stringify(unknown.pills));
  check('and does not ask to pick a model', !allText([unknown.hint]).startsWith('Pick a model') && allText([unknown.hint]).includes('once the app has loaded this conversation') && unknown.hint.element.props['data-error'] === 'false', allText([unknown.hint]));

  bar.conversation = { known: true, recon: true, inRoom: true, model: '', provider: '', where: '', may: false, agreed: false };
  const none = await draw('s4b');
  check('with no model it asks for one', none.pills.some((pill) => pill.text === 'No model picked' && pill.state === 'warn') && allText([none.hint]).startsWith('Pick a model in the chat box.'), JSON.stringify(none.pills));

  bar.tab = 'cowork';
  const asked = bar.asked;
  await draw('s5');
  check('on another tab it does not ask the route', bar.asked === asked);
}

console.log(fails === 0 ? `ALL OK (${ran})` : `${fails} of ${ran} FAILED`);
process.exitCode = fails === 0 ? 0 : 1;
