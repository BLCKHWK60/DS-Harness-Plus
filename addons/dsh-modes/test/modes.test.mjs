import test from 'node:test';
import assert from 'node:assert/strict';
import { maskFor, parentIdOf, RESEARCH_TOOL, rootOf, toolsState, WEB_TOOLS, webDefault } from '../lib/mask.js';

const want = (over = {}) => ({ tools: 'none', web: false, research: false, off: false, child: false, ...over });

test('a conversation: the mode and the Web level (Off means no web and no Deep research)', () => {
  const RESEARCH = ['deep_research', 'web_search', 'web_fetch', 'library_search'];
  // Chat (no tools of its own).
  assert.deepEqual(maskFor(want()), { allow: [] });
  assert.deepEqual(maskFor(want({ web: true })), { allow: WEB_TOOLS });
  // Cowork and Code (all tools).
  assert.equal(maskFor(want({ tools: 'all', web: true })), null);
  assert.deepEqual(maskFor(want({ tools: 'all' })), { deny: [...WEB_TOOLS, RESEARCH_TOOL] }, 'Web off takes Deep research away too');
  // A mode with a list of its own.
  assert.deepEqual(maskFor(want({ tools: ['read', 'web_search'] })), { allow: ['read'] }, 'Web off takes the web tools out of a list');
  assert.deepEqual(maskFor(want({ tools: ['read', 'grep'], web: true })), { allow: ['read', 'grep', ...WEB_TOOLS] });
  // The Research tab lists the research tool and the web.
  assert.deepEqual(maskFor(want({ tools: RESEARCH, web: true, research: true })), { allow: ['deep_research', 'library_search', ...WEB_TOOLS] });
  // The pure mask contract; a top-level Research conversation always has the web (see webFor below).
  assert.deepEqual(maskFor(want({ tools: RESEARCH, research: true })), { allow: ['library_search'] }, 'without web, no research either');
});

test('a helper follows its conversation, and searches for a research conversation', () => {
  const RESEARCH = ['deep_research', 'web_search', 'web_fetch'];
  assert.deepEqual(maskFor(want({ tools: RESEARCH, research: true, child: true })), { allow: ['deep_research', ...WEB_TOOLS] }, 'a research helper searches; the tool refuses its own helpers itself');
  assert.deepEqual(maskFor(want({ web: true, child: true })), { allow: WEB_TOOLS });
  // The Research tab's own list: its helpers keep only what searching needs.
  const TAB = ['deep_research', 'web_search', 'web_fetch', 'library_search', 'library_read', 'diagram_draw', 'ask_user_question', 'todo_write'];
  assert.deepEqual(maskFor(want({ tools: TAB, research: true, child: true })), { allow: ['deep_research', ...WEB_TOOLS] }, 'no Library, drawings, step list or questions for a research helper');
  assert.deepEqual(maskFor(want({ tools: TAB, research: true, web: true })).allow, [...TAB.filter((tool) => !WEB_TOOLS.includes(tool)), ...WEB_TOOLS], 'the conversation itself keeps them all');
  // Scout's helpers keep Scout's own search tools.
  assert.deepEqual(maskFor(want({ tools: ['scout_search', 'scout_posting', 'deep_research', 'web_search', 'web_fetch', 'todo_write'], research: true, child: true })), { allow: ['scout_search', 'scout_posting', 'deep_research', ...WEB_TOOLS] });
  assert.deepEqual(maskFor(want({ child: true })), { allow: [] }, 'a helper of a plain Chat conversation gets nothing, like the conversation');
  assert.equal(maskFor(want({ tools: 'all', web: true, child: true })), null);
  assert.deepEqual(maskFor(want({ tools: 'all', child: true })), { deny: [...WEB_TOOLS, RESEARCH_TOOL] });
});

test('tools switched off means nothing at all, for the conversation and its helpers', () => {
  for (const tools of ['all', 'none', ['read']]) {
    for (const child of [false, true]) assert.deepEqual(maskFor(want({ tools, web: true, research: true, off: true, child })), { allow: [] });
  }
  assert.equal(toolsState(want({ tools: 'all', web: true, off: true })), 'off');
  assert.equal(toolsState(want({ tools: 'all' })), 'on');
  assert.equal(toolsState(want()), 'off', 'plain Chat has no tools');
  assert.equal(toolsState(want({ web: true })), 'on');
});

test('Web off also takes away the other tools that reach the internet', async () => {
  const { webReaching } = await import('../lib/mask.js');
  const known = ['read', 'bash', 'weather', 'multi_search', 'finance_news', 'finance_company_figures', 'scout_search', 'scout_files', 'library_search', 'pdf_read'];
  const offline = webReaching(known);
  assert.deepEqual(offline, ['weather', 'multi_search', 'finance_news', 'finance_company_figures', 'scout_search']);
  assert.deepEqual(maskFor(want({ tools: 'all', offline })), { deny: [...WEB_TOOLS, RESEARCH_TOOL, ...offline] });
  assert.equal(maskFor(want({ tools: 'all', web: true, offline })), null, 'with the web on nothing is taken away');
  assert.deepEqual(maskFor(want({ tools: ['scout_search', 'scout_files', 'web_search'], offline })), { allow: ['scout_files'] });
  assert.deepEqual(maskFor(want({ tools: ['scout_search', 'scout_files', 'web_search'], web: true, offline })), { allow: ['scout_search', 'scout_files', ...WEB_TOOLS] });
});

test('with the web off, shell commands that go online are recognised', async () => {
  const { goesOnline } = await import('../lib/mask.js');
  const online = [
    'curl -s "wttr.in/Nuremberg?format=%C" 2>/dev/null',
    'cd /tmp && wget https://example.com/x',
    'echo a; curl example.org',
    'python3 -c "import urllib.request as u; print(u.urlopen(\'http://x\').read())"',
    'python3 -c "import requests; requests.get(u)"',
    'node -e "fetch(u).then(r=>r.text())"',
    'pip install pandas',
    'npm i left-pad',
    'git clone git@github.com:a/b.git',
    'brew install jq',
    'open https://example.com',
    'ssh user@host',
    'nc -z example.com 443',
    'dig example.com',
    'sudo curl x',
    'x=$(curl -s x)',
    'docker pull alpine',
  ];
  for (const command of online) assert.ok(goesOnline(command), command);
  const local = ['ls -la', 'grep -rn "host" src', 'cat README.md', 'git status', 'git log --oneline', 'npm test', 'python3 script.py', 'echo hostname', 'curlew_count=3; echo $curlew_count', 'find . -name "*.http"', ''];
  for (const command of local) assert.ok(!goesOnline(command), command);
});

test('Recon: the Web levels in words for its own tools, and Off takes its online tools away', async () => {
  const { ISOLATED_LEVEL_PROMPTS, ISOLATED_OFF_PROMPT } = await import('../index.js');
  const { webReaching } = await import('../lib/mask.js');
  assert.deepEqual(Object.keys(ISOLATED_LEVEL_PROMPTS), ['quick', 'standard', 'thorough', 'deep']);
  for (const text of Object.values(ISOLATED_LEVEL_PROMPTS)) assert.doesNotMatch(text, /web_search|web_fetch/);
  assert.match(ISOLATED_OFF_PROMPT, /switched off/);
  const recon = ['recon_onion_search', 'recon_onion_read', 'recon_usenet_groups', 'recon_usenet_search', 'recon_usenet_read', 'recon_news_search', 'recon_archive_find', 'recon_archive_read', 'recon_cite'];
  assert.deepEqual(recon.filter((name) => !webReaching(recon).includes(name)), ['recon_cite'], 'only citing stays when the web is off');
});

test('the Web levels', async () => {
  const { SEARCH_LEVELS, SEARCH_DEPTH_PROMPTS, searchLevel } = await import('../index.js');
  assert.deepEqual(SEARCH_LEVELS, ['quick', 'standard', 'thorough', 'deep']);
  assert.equal(searchLevel('DEEP'), 'deep');
  assert.equal(searchLevel('nonsense'), 'standard');
  assert.match(SEARCH_DEPTH_PROMPTS.deep, /at least ten searches/);
  assert.match(SEARCH_DEPTH_PROMPTS.deep, /at least ten pages/);
  assert.match(SEARCH_DEPTH_PROMPTS.deep, /two independent sources/);
});

test('defaults and family ties', () => {
  assert.equal(webDefault('none'), false);
  assert.equal(webDefault('all'), true);
  assert.equal(webDefault(['read']), false);
  assert.equal(webDefault(['read', 'web_fetch']), true);

  assert.equal(parentIdOf({ parentSession: 'p1' }), 'p1');
  assert.equal(parentIdOf({ parentSession: { id: 'p2' } }), 'p2');
  assert.equal(parentIdOf({ parentSession: { sessionId: 'p3' } }), 'p3');
  assert.equal(parentIdOf({}), null);
  assert.equal(parentIdOf(undefined), null);

  const parents = new Map([['c', 'b'], ['b', 'a']]);
  assert.equal(rootOf('c', parents), 'a');
  assert.equal(rootOf('a', parents), 'a');
  assert.equal(rootOf('stranger', parents), 'stranger');
  const loop = new Map([['x', 'y'], ['y', 'x']]);
  assert.ok(['x', 'y'].includes(rootOf('x', loop)), 'a loop does not hang');
});

test('a conversation that reaches tools through programs is told so', async () => {
  const { programNote, programOnly, PROGRAM_TOOL } = await import('../lib/ptc.js');
  const ptc = { selectExecutor: () => ({ describe: () => ({ knownNames: [PROGRAM_TOOL] }) }) };
  const direct = { selectExecutor: () => ({ describe: () => ({ schemas: [] }) }) };
  const broken = { selectExecutor: () => { throw new Error('no executor'); } };
  assert.equal(programOnly(ptc, {}), true);
  assert.equal(programOnly(direct, {}), false);
  assert.equal(programOnly(broken, {}), false, 'not knowing reads as calling tools directly');
  assert.equal(programOnly(undefined, {}), false);

  const plain = programNote();
  assert.match(plain, /inside a `run_code` program/);
  assert.doesNotMatch(plain, /timeoutMs/, 'no time advice without a slow tool');
  const slow = programNote({ timeout: { defaultMs: 120000, maxMs: 600000 }, slow: ['deep_research'] });
  assert.match(slow, /stopped after 120 seconds/);
  assert.match(slow, /deep_research can take minutes/);
  assert.match(slow, /timeoutMs: 600000/);
  assert.doesNotMatch(programNote({ slow: ['deep_research'] }), /timeoutMs/, 'no numbers are made up when the app gives none');
});

test('a conversation opened by an Automation task gets its own starting mode', async () => {
  const { fromScheduler, scheduledModeId } = await import('../lib/scheduled.js');
  assert.equal(fromScheduler([{ role: 'user', source: { kind: 'schedule' } }]), true);
  assert.equal(fromScheduler([{ message: { source: { kind: 'schedule' } } }]), true);
  assert.equal(fromScheduler([{ role: 'user', source: { kind: 'human' } }, { role: 'user' }]), false);
  assert.equal(fromScheduler(undefined), false);
  assert.equal(fromScheduler([]), false);

  const modes = { chat: { tools: 'none' }, cowork: { tools: 'all' }, code: { tools: 'all' } };
  assert.equal(scheduledModeId(modes, 'code'), 'code');
  assert.equal(scheduledModeId(modes, 'gone'), 'cowork', 'an unknown id falls back to the first mode with all tools');
  assert.equal(scheduledModeId(modes, ''), 'cowork');
  assert.equal(scheduledModeId({ chat: { tools: 'none' } }, 'gone'), undefined, 'nothing suitable leaves the usual rule in charge');
});

test('the sliders: a step is checked, and only Quick and Thorough add words about searching', async () => {
  const { DEPTH_IDS, SEARCH_DEPTH_PROMPTS, depthId } = await import('../index.js');
  assert.deepEqual(DEPTH_IDS, ['quick', 'standard', 'thorough']);
  assert.equal(depthId('Thorough'), 'thorough');
  assert.equal(depthId('deepest'), 'standard');
  assert.equal(depthId(undefined), 'standard');
  assert.equal(SEARCH_DEPTH_PROMPTS.standard, '');
  assert.match(SEARCH_DEPTH_PROMPTS.quick, /one search is usually enough/);
  assert.match(SEARCH_DEPTH_PROMPTS.thorough, /at least five pages/);
});

test('the Code method is short enough to sit beside other instructions and names the step list', async () => {
  const { CODE_METHOD } = await import('../index.js');
  assert.ok(CODE_METHOD.length > 800 && CODE_METHOD.length < 3000, String(CODE_METHOD.length));
  for (const word of ['todo_write', 'path:line', 'not verified']) assert.ok(CODE_METHOD.includes(word), word);
});

test('Stop in a conversation finds the helpers below it', async () => {
  const { helpersBelow, stoppedByUser } = await import('../lib/stop.js');
  const end = (reason) => ({ type: 'turn/end', data: { turn: 1, reason } });
  assert.equal(stoppedByUser(end({ kind: 'aborted', reason: { kind: 'user' } })), true);
  assert.equal(stoppedByUser(end({ kind: 'aborted', reason: { kind: 'parent' } })), false, 'a helper stopped by its parent does not count');
  assert.equal(stoppedByUser(end({ kind: 'completed' })), false);
  assert.equal(stoppedByUser({ type: 'turn/start', data: {} }), false);
  assert.equal(stoppedByUser(undefined), false);

  const agent = (id, parent, status = 'running') => ({ id, status, session: { header: parent ? { origin: 'subagent', parentSession: parent } : {} } });
  const agents = [agent('main'), agent('a', 'main'), agent('b', 'a'), agent('idle', 'main', 'idle'), agent('other'), agent('c', 'other'), agent('lost', 'gone')];
  assert.deepEqual(helpersBelow(agents, 'main').map((one) => one.id), ['a', 'b'], 'its helpers and theirs, only those at work');
  assert.deepEqual(helpersBelow(agents, 'a').map((one) => one.id), ['b']);
  assert.deepEqual(helpersBelow(agents, 'b'), []);
  const loop = [agent('x', 'y'), agent('y', 'x')];
  assert.deepEqual(helpersBelow(loop, 'main'), [], 'a broken chain ends');

  const { onlyStopNotes } = await import('../lib/stop.js');
  const note = (id, stopReason = 'aborted') => ({ role: 'user', source: { kind: 'subagent-settled', stopReason, senderSessionId: id } });
  const was = (id) => id === 'a' || id === 'b';
  assert.equal(onlyStopNotes([note('a'), note('b')], was), true);
  assert.equal(onlyStopNotes([note('a'), { role: 'user', source: { kind: 'human' } }], was), false, 'something the user wrote starts the turn');
  assert.equal(onlyStopNotes([note('a', 'completed')], was), false, 'a helper that finished is heard');
  assert.equal(onlyStopNotes([note('z')], was), false, 'a helper stopped some other way is heard');
  assert.equal(onlyStopNotes([], was), false);
});

test('tool trimming: core set, families, words, requests', async () => {
  const { CORE, FIND_TOOL, allowed, catalog, familyOf, mentioned, others, resolveRequest } = await import('../lib/trim.js');
  const known = [...CORE.filter((name) => name !== FIND_TOOL), 'web_search', 'web_fetch', 'pdf_read', 'pdf_search', 'data_chart', 'data_python', 'finance_news', 'diagram_draw', 'present', 'schedule_create', 'subagent', 'deep_research', 'remember', 'mac_find_files', 'mcp__lab-echo__echo', 'odd_tool'];
  assert.ok(CORE.includes(FIND_TOOL));
  const start = allowed(known, []);
  assert.ok(start.includes('read') && start.includes(FIND_TOOL));
  assert.ok(!start.includes('pdf_read') && !start.includes('data_chart'), 'families are not there at first');
  const later = allowed(known, ['pdf', 'odd_tool']);
  assert.ok(later.includes('pdf_read') && later.includes('pdf_search') && later.includes('odd_tool'));
  assert.ok(!later.includes('data_chart'));
  assert.equal(familyOf('pdf_ocr'), 'pdf');
  assert.equal(familyOf('mcp__lab-echo__echo'), 'connectors');
  assert.equal(familyOf('read'), undefined);
  assert.deepEqual(others(known), ['odd_tool']);
  assert.deepEqual(mentioned('Read this PDF and make a chart of the numbers'), ['pdf', 'data']);
  assert.deepEqual(mentioned('Remind me every morning'), ['schedule']);
  assert.deepEqual(mentioned('hello'), []);
  const definitions = known.map((name) => ({ name, description: name === 'mac_find_files' ? 'Find files anywhere on this Mac with Spotlight' : '' }));
  assert.deepEqual(resolveRequest('pdf', definitions), ['pdf']);
  assert.deepEqual(resolveRequest('data_python', definitions), ['data']);
  assert.ok(resolveRequest('make a chart', definitions).includes('data'));
  assert.ok(resolveRequest('spotlight search', definitions).includes('mac'));
  assert.deepEqual(resolveRequest('', definitions), []);
  const list = catalog(known, ['pdf']);
  assert.match(list, /- pdf \(added\): PDF files/);
  assert.match(list, /- finance: /);
  assert.doesNotMatch(list, /- learn:/, 'families the app does not have are not offered');
  assert.match(list, /other single tools: odd_tool/);
});

test('tools_find finds hidden tools: it is matched against every tool the app has, not only those offered', async () => {
  const { CORE, resolveRequest } = await import('../lib/trim.js');
  const known = [...CORE, 'pdf_read', 'data_python', 'odd_tool', 'generate_image', 'office_render'];
  const describe = (name) => ({ name, description: name === 'generate_image' ? 'Generate an image from a text prompt' : '' });
  // What the conversation can see while trimmed: the core only. Matching against that finds nothing.
  const visible = CORE.map(describe);
  assert.deepEqual(resolveRequest('odd_tool', visible), [], 'the old way: a hidden tool is not found');
  const all = known.map(describe);
  assert.deepEqual(resolveRequest('odd_tool', all), ['odd_tool']);
  assert.deepEqual(resolveRequest('pdf_read', all), ['pdf']);
  assert.deepEqual(resolveRequest('data_python', all), ['data']);
  assert.deepEqual(resolveRequest('office_render', all), ['office']);
  assert.ok(resolveRequest('generate an image', all).includes('generate_image'));
});

test('exit_plan_mode is a core tool, and the Office tools are a family a skill brings', async () => {
  const { CORE, allowed, brings, mentioned, others, skillFamilies } = await import('../lib/trim.js');
  const known = [...CORE, 'office_render', 'office_convert', 'office_recalculate', 'load_workspace_dependencies', 'present'];
  assert.ok(allowed(known, []).includes('exit_plan_mode'));
  assert.deepEqual(others(known), [], 'nothing is left over as a single tool');
  const office = allowed(known, ['office']);
  for (const name of ['office_render', 'office_convert', 'office_recalculate', 'load_workspace_dependencies', 'present']) assert.ok(office.includes(name), name);
  assert.ok(mentioned('Make slides for the meeting').includes('office'));
  assert.deepEqual(skillFamilies('office-pptx'), ['office']);
  assert.deepEqual(skillFamilies('office'), ['office']);
  assert.deepEqual(skillFamilies('officer'), []);
  assert.deepEqual(skillFamilies(undefined), []);
  assert.equal(brings('office', office), true);
  assert.equal(brings('office', CORE), false);
});

test('tools_find adds only what brings a tool: an add-on that is off, or Web Off, brings nothing', async () => {
  const { toolMaskFor } = await import('../lib/mask.js');
  const { CORE, brings } = await import('../lib/trim.js');
  const mode = { tools: 'all' };
  const offered = (known, entry, web) => toolMaskFor({ mode, trimmed: true, known, added: [entry], web }).allow.filter((name) => known.includes(name));
  const withoutFinance = [...CORE, 'pdf_read'];
  assert.equal(brings('finance', offered(withoutFinance, 'finance', true)), false, 'Finance switched off: nothing to add');
  assert.equal(brings('pdf', offered(withoutFinance, 'pdf', true)), true);
  const withFinance = [...CORE, 'finance_news', 'finance_profile_save'];
  assert.equal(brings('finance', offered(withFinance, 'finance', true)), true);
  assert.deepEqual(offered(withFinance, 'finance', false).filter((name) => name.startsWith('finance_')), ['finance_profile_save'], 'Web Off keeps only the local profile tool');
  assert.equal(brings('web_search', offered([...CORE, 'web_search'], 'web_search', false)), false, 'no web search with Web Off');
  assert.equal(brings('odd_tool', offered([...CORE, 'odd_tool'], 'odd_tool', true)), true);
});

test('Web Off keeps the Finance profile tool, which only writes a local line', async () => {
  const { webReaching, LOCAL_ONLY } = await import('../lib/mask.js');
  assert.ok(LOCAL_ONLY.includes('finance_profile_save'));
  assert.deepEqual(webReaching(['finance_news', 'finance_profile_save', 'read']), ['finance_news']);
});

test('the Research tab always has the web; old Search-off marks are cleared only in tabs with their own search', async () => {
  const { webFor, oldWebMarks } = await import('../lib/mask.js');
  const RESEARCH = ['deep_research', 'web_search', 'web_fetch', 'library_search'];
  assert.equal(webFor({ tools: RESEARCH, chosen: false }), true, 'a stored Off does not take the Research tab\'s web');
  assert.equal(webFor({ tools: RESEARCH, off: true }), false, 'Tools Off does');
  assert.equal(webFor({ tools: ['recon_cite'], isolated: true, chosen: true }), false, 'an isolated mode never gets the web tools');
  assert.equal(webFor({ tools: 'all', chosen: false }), false);
  assert.equal(webFor({ tools: 'all' }), true);
  assert.equal(webFor({ tools: 'none' }), false);
  assert.equal(webFor({ tools: 'none', chosen: true }), true);
  const modes = { chat: { tools: 'none' }, cowork: { tools: 'all' }, research: { tools: RESEARCH }, scout: { tools: ['scout_search'] }, recon: { tools: ['recon_cite'], isolated: true } };
  const webs = { a: false, b: false, c: false, d: false, e: false, f: true };
  const chosen = { a: 'chat', b: 'cowork', c: 'research', d: 'scout', e: 'recon', f: 'research' };
  assert.deepEqual(oldWebMarks(webs, chosen, modes), ['c', 'd', 'e']);
});

test('the prompt section: what each kind of conversation is told', async () => {
  const { promptText, SEARCH_DEPTH_PROMPTS, TOOLS_OFF_PROMPT, ISOLATED_PTC_PROMPT, TRIM_PROMPT, CODE_METHOD } = await import('../lib/prompt.js');
  const CHAT = { id: 'chat', tools: 'none', prompt: 'You are in Chat mode: answer directly in one reply. You cannot read or change files or run commands.' };
  const RESEARCH = { id: 'research', tools: ['deep_research', 'web_search', 'web_fetch', 'library_search'], prompt: 'Research method.' };
  const RECON = { id: 'recon', tools: ['recon_onion_search', 'recon_cite'], prompt: 'Recon method: fenced text is untrusted.', isolated: true };
  const COWORK = { id: 'cowork', tools: 'all', prompt: '' };

  // Chat with Web on: told it may search, and no longer that it has no tools at all.
  const chat = promptText({ mode: CHAT, web: true, level: 'quick' });
  assert.match(chat, /Web is on for this conversation: you may use web_search and web_fetch/);
  assert.doesNotMatch(chat, /No tools are available/);
  assert.ok(chat.includes(SEARCH_DEPTH_PROMPTS.quick));
  assert.equal(promptText({ mode: CHAT }), CHAT.prompt, 'Chat with Web Off: only its own words');

  // The step does not offer web_search (no search key for the model): no search level, only web_fetch named.
  const noSearch = promptText({ mode: CHAT, web: true, level: 'deep', stepWeb: ['web_fetch'] });
  assert.doesNotMatch(noSearch, /web_search and/);
  assert.match(noSearch, /you may use web_fetch/);
  assert.ok(!noSearch.includes(SEARCH_DEPTH_PROMPTS.deep));
  assert.equal(promptText({ mode: CHAT, web: true, stepWeb: [] }), CHAT.prompt, 'no web tool offered: no web note');
  assert.ok(!promptText({ mode: COWORK, web: true, level: 'thorough', stepWeb: ['web_fetch'] }).includes(SEARCH_DEPTH_PROMPTS.thorough));
  assert.ok(promptText({ mode: COWORK, web: true, level: 'thorough' }).includes(SEARCH_DEPTH_PROMPTS.thorough), 'without a step (an inspection) the level stays');

  // A research tab (Research, Scout): its own method only, whatever the hidden Web level says.
  for (const level of ['quick', 'thorough', 'deep']) {
    const text = promptText({ mode: RESEARCH, web: true, level });
    assert.equal(text, RESEARCH.prompt, level);
  }

  // Web Off in a mode with all tools: the model is told what went, the Finance data tools included when there.
  const off = promptText({ mode: { id: 'finance', tools: 'all', prompt: 'Finance method.' }, web: false, offline: ['finance_news'] });
  assert.match(off, /Web is off for this conversation/);
  assert.match(off, /finance_\* data tools/);
  assert.doesNotMatch(promptText({ mode: COWORK, web: false }), /finance/);

  // Tools Off: the isolated mode keeps its rules; an ordinary list mode does not.
  const reconOff = promptText({ mode: RECON, off: true });
  assert.ok(reconOff.includes(RECON.prompt) && reconOff.includes(TOOLS_OFF_PROMPT));
  assert.equal(promptText({ mode: COWORK, off: true }), TOOLS_OFF_PROMPT);
  assert.ok(promptText({ mode: RECON, alone: true }).includes(RECON.prompt), 'a model version that stands alone keeps an isolated mode\'s rules');
  assert.equal(promptText({ mode: { ...CHAT }, alone: true, web: false }), '', 'an ordinary mode\'s words go when the version stands alone');

  // Under the PTC preset an isolated mode says it cannot work there, and never says to write programs.
  const reconPtc = promptText({ mode: RECON, programOnly: true, programs: 'call it from inside a `run_code` program' });
  assert.ok(reconPtc.includes(ISOLATED_PTC_PROMPT));
  assert.doesNotMatch(reconPtc, /inside a `run_code` program/);
  assert.ok(!promptText({ mode: RECON }).includes(ISOLATED_PTC_PROMPT));

  // Code with its method, trimmed; and a helper gets only the note about programs.
  const code = promptText({ mode: { id: 'code', tools: 'all', prompt: '' }, web: true, trimmed: true });
  assert.ok(code.includes(CODE_METHOD) && code.includes(TRIM_PROMPT));
  assert.match(CODE_METHOD, /tools_find\("code"\)/);
  assert.equal(promptText({ mode: RECON, child: true, programs: 'note' }), 'note');
});

test('Settings → Modes accepts an add-on\'s mode as the default and offers trimming for its all-tools modes', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  // The page's pure helpers, taken from the browser half as they are.
  const grab = (name) => {
    const start = source.indexOf(`    function ${name}(`);
    assert.ok(start > 0, name);
    return source.slice(start, source.indexOf('\n    }\n', start) + 6);
  };
  const readObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
  const { validate, extraModesOf } = new Function('ID_RE', 'readObject', `${grab('validate')}\n${grab('extraModesOf')}\nreturn { validate, extraModesOf };`)(ID_RE, readObject);
  const rows = [{ key: 'chat', id: 'chat', toolsKind: 'none', toolNames: '' }, { key: 'cowork', id: 'cowork', toolsKind: 'all', toolNames: '' }];
  assert.deepEqual(validate(rows, 'finance').form, ['e.default'], 'without the add-on modes it is refused');
  assert.deepEqual(validate(rows, 'finance', ['finance', 'scout']).form, [], 'the selected Finance tab no longer blocks Save');
  assert.deepEqual(validate(rows, 'cowork', ['finance']).form, []);
  const extras = extraModesOf({ extraModes: JSON.stringify({ finance: { label: 'Finance', tools: 'all' }, scout: { label: 'Scout', tools: ['scout_search'] }, recon: { label: 'Recon', tools: ['recon_cite'], isolated: true }, 'Bad Id': { tools: 'all' } }) });
  assert.deepEqual(extras, [
    { id: 'finance', label: 'Finance', all: true, isolated: false },
    { id: 'scout', label: 'Scout', all: false, isolated: false },
    { id: 'recon', label: 'Recon', all: false, isolated: true },
  ]);
  assert.deepEqual(extraModesOf({}), []);
});
