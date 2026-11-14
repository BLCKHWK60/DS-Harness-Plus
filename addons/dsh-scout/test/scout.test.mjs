// Scout without the app and without the network: the mode, the registry, the readers for each
// source (fed with answers saved from the real services, or shaped from their documentation),
// the store, the private folder and profile, the tools and the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METHOD, MODE, MODE_ID, OWN_TOOLS, TOOLS, withScout } from '../lib/mode.js';
import { SEED, addressProblem, cleanExtra, inUse, isSearchOnly, keyRef, readRegistry, searchOnlyHosts } from '../lib/registry.js';
import { hooks, forget, plainText } from '../lib/net.js';
import { ADAPTERS, matches } from '../lib/adapters.js';
import { openStore, sameJob } from '../lib/store.js';
import { fileName, openFolder, openProfile, profileProblem } from '../lib/private.js';
import { csv, writeReport } from '../lib/report.js';
import { readSelection, selectionNote } from '../lib/selection.js';
import { buildTools } from '../lib/tools.js';
import { providerPlace, staysHome } from '../lib/model.js';

const here = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const fixture = (name) => readFileSync(here(name), 'utf8');

/** Answer requests from a table of address patterns; remember every request. */
function network(table) {
  const asked = [];
  hooks.get = async (url, headers) => {
    asked.push({ url, headers });
    for (const [pattern, answer] of table) if (pattern.test(url)) return typeof answer === 'function' ? answer(url, headers) : answer;
    return { status: 404, text: '' };
  };
  hooks.sleep = async () => {};
  forget();
  return asked;
}

test('the mode and its method', () => {
  assert.ok(METHOD.length <= 4000, `method is ${METHOD.length} characters`);
  assert.equal(MODE.label, 'Scout');
  assert.ok(OWN_TOOLS.every((tool) => TOOLS.includes(tool)));
  for (const forbidden of ['read_file', 'write_file', 'bash', 'run_code', 'edit_file']) assert.ok(!TOOLS.includes(forbidden), forbidden);
  const added = JSON.parse(withScout('{"finance":{"label":"Finance"}}', true));
  assert.deepEqual(Object.keys(added), ['finance', MODE_ID]);
  assert.equal(withScout(JSON.stringify(added), true), undefined, 'nothing to change');
  assert.deepEqual(Object.keys(JSON.parse(withScout(JSON.stringify(added), false))), ['finance']);
  assert.equal(withScout('{}', false), undefined);
});

test('the registry: starting list, the user\'s changes, terms', () => {
  assert.ok(new Set(SEED.map((source) => source.id)).size === SEED.length, 'ids are unique');
  for (const source of SEED) {
    assert.equal(addressProblem(source.url), undefined, source.id);
    assert.ok(['api', 'page', 'search'].includes(source.access), source.id);
    if (source.access === 'api') assert.ok(ADAPTERS[source.adapter], `${source.id} has a reader`);
  }
  const registry = readRegistry(JSON.stringify({ indeed: { on: false }, dice: { hidden: true } }), JSON.stringify([
    { id: 'niche', name: 'Niche board', url: 'https://jobs.example.org/', markets: ['Spain'], workTypes: ['freelance'], access: 'page' },
    { id: 'bad', name: 'Bad', url: 'ftp://x' },
    { id: 'ba', name: 'Clash with a starting source', url: 'https://example.org' },
  ]));
  assert.equal(registry.find((source) => source.id === 'indeed').on, false);
  assert.equal(registry.find((source) => source.id === 'dice').hidden, true);
  assert.equal(registry.filter((source) => source.extra).length, 1, 'only the usable source of the user is kept');
  const spainFreelance = inUse(registry, { markets: ['Spain'], workTypes: ['freelance'] }).map((source) => source.id);
  assert.ok(spainFreelance.includes('niche') && spainFreelance.includes('malt') && spainFreelance.includes('hn'));
  assert.ok(!spainFreelance.includes('ba') && !spainFreelance.includes('reed'));
  const hosts = searchOnlyHosts(registry);
  for (const blocked of ['https://www.indeed.com/viewjob?jk=1', 'https://uk.indeed.com/viewjob?jk=1', 'https://de.indeed.com/x', 'https://www.indeed.co.uk/x', 'https://www.linkedin.com/jobs/view/1', 'https://www.stepstone.at/x', 'https://www.malt.es/profile/x']) assert.ok(isSearchOnly(blocked, hosts), blocked);
  for (const fine of ['https://www.reed.co.uk/jobs/1', 'https://boards.greenhouse.io/x/jobs/1', 'https://www.arbeitsagentur.de/jobsuche/jobdetail/1', 'not a url', 'https://example.org/indeed']) assert.ok(!isSearchOnly(fine, hosts), fine);
  assert.equal(cleanExtra({ id: 'x', name: 'X', url: 'https://user:pw@example.org' }), undefined);
  assert.equal(keyRef('adzuna'), 'DSH_SCOUT_SOURCE_ADZUNA');
});

test('Germany\'s job exchange: search and posting text, from saved answers', async () => {
  const asked = network([
    [/pc\/v6\/jobs/, { status: 200, text: fixture('ba-search.json') }],
    [/pc\/v4\/jobdetails/, { status: 200, text: fixture('ba-detail.json') }],
  ]);
  const found = await ADAPTERS.ba.search({ what: 'Data Engineer', where: 'Berlin', radius: 25, days: 30, workType: 'freelance' });
  assert.ok(found.postings.length >= 3 && found.total >= found.postings.length);
  const first = found.postings[0];
  assert.equal(first.title, 'Data Engineer');
  assert.equal(first.type, 'freelance');
  assert.match(first.url, /^https:\/\/www\.arbeitsagentur\.de\/jobsuche\/jobdetail\//);
  assert.match(first.posted, /^\d{4}-\d{2}-\d{2}$/);
  const url = new URL(asked[0].url);
  assert.equal(url.searchParams.get('was'), 'Data Engineer');
  assert.equal(url.searchParams.get('umkreis'), '25');
  assert.equal(url.searchParams.get('angebotsart'), '2');
  assert.equal(asked[0].headers['X-API-Key'], 'jobboerse-jobsuche');
  const text = await ADAPTERS.ba.detail(first);
  assert.match(text, /Lehrauftrag/);
  assert.match(asked[1].url, new RegExp(Buffer.from(first.ref).toString('base64').replace(/[+/=]/g, (c) => `\\${c}`)));
});

test('Arbeitnow, Greenhouse, Lever and Ashby: filtered here, from saved answers', async () => {
  network([
    [/arbeitnow\.com\/api\/job-board-api\?page=1/, { status: 200, text: JSON.stringify({ ...JSON.parse(fixture('arbeitnow.json')), links: { next: null } }) }],
    [/boards-api\.greenhouse\.io\/v1\/boards\/gitlab\/jobs$/, { status: 200, text: fixture('greenhouse.json') }],
    [/api\.lever\.co\/v0\/postings\/leverdemo/, { status: 200, text: fixture('lever.json') }],
    [/api\.ashbyhq\.com\/posting-api\/job-board\/ashby/, { status: 200, text: fixture('ashby.json') }],
  ]);
  const an = await ADAPTERS.arbeitnow.search({ what: 'software engineer', where: 'Berlin' });
  assert.equal(an.postings.length, 1);
  assert.match(an.postings[0].title, /Software Engineer/);
  assert.ok(an.postings[0].text.length > 50, 'the text is kept for scout_posting');
  const gh = await ADAPTERS.greenhouse.search({ company: 'gitlab', what: 'backend engineer' });
  assert.equal(gh.postings.length, 2);
  assert.match(gh.postings[0].url, /greenhouse\.io\/gitlab\/jobs\//);
  await assert.rejects(ADAPTERS.greenhouse.search({ company: '../etc', what: 'x' }), /board name/);
  const lv = await ADAPTERS.lever.search({ company: 'leverdemo' });
  assert.ok(lv.postings.length >= 1 && lv.postings[0].url.startsWith('https://jobs.lever.co/'));
  const ab = await ADAPTERS.ashby.search({ company: 'ashby' });
  assert.ok(ab.postings.length >= 1);
  assert.ok(ab.postings.some((posting) => /€|\$|£/.test(posting.pay)), 'Ashby gives pay');
  assert.ok(matches('Senior Data Engineer (m/w/d)', 'data engineer'));
  assert.ok(!matches('Finance Manager', 'data engineer'));
});

test('Hacker News, Adzuna, USAJOBS and Reed: shaped from their documentation', async () => {
  const asked = network([
    [/search_by_date\?tags=story/, { status: 200, text: JSON.stringify({ hits: [{ objectID: '900', title: 'Ask HN: Who wants to be hired? (November 2026)' }, { objectID: '901', title: 'Ask HN: Who is hiring? (November 2026)', created_at: '2026-11-02T15:00:00Z' }] }) }],
    [/hn\.algolia\.com\/api\/v1\/search\?/, { status: 200, text: JSON.stringify({ hits: [
      { objectID: '1', parent_id: 901, created_at: '2026-11-03T10:00:00Z', comment_text: 'Acme Data | Senior Data Engineer | Berlin or REMOTE (EU) | €90k–110k<p>We build pipelines.' },
      { objectID: '2', parent_id: 1, created_at: '2026-11-03T11:00:00Z', comment_text: 'A reply, not a post' },
    ] }) }],
    [/api\.adzuna\.com\/v1\/api\/jobs\/de\/search\/1/, { status: 200, text: JSON.stringify({ count: 1, results: [{ id: '42', title: '<strong>Data</strong> Engineer', company: { display_name: 'Beta GmbH' }, location: { display_name: 'Berlin' }, salary_min: 70000, salary_max: 85000, salary_is_predicted: '0', created: '2026-11-10T08:00:00Z', redirect_url: 'https://www.adzuna.de/land/ad/42', description: 'Build data pipelines…', contract_type: 'permanent' }] }) }],
    [/data\.usajobs\.gov\/api\/search/, { status: 200, text: JSON.stringify({ SearchResult: { SearchResultCountAll: 1, SearchResultItems: [{ MatchedObjectId: '777', MatchedObjectDescriptor: { PositionTitle: 'IT Specialist (Data Management)', OrganizationName: 'Census Bureau', PositionLocationDisplay: 'Suitland, Maryland', PositionRemuneration: [{ MinimumRange: '99000', MaximumRange: '128000', RateIntervalCode: 'PA' }], PublicationStartDate: '2026-11-05', PositionURI: 'https://www.usajobs.gov/job/777', UserArea: { Details: { JobSummary: 'Manage data.' } } } }] } }) }],
    [/reed\.co\.uk\/api\/1\.0\/search/, { status: 200, text: JSON.stringify({ totalResults: 1, results: [{ jobId: 55, employerName: 'Gamma Ltd', jobTitle: 'Data Engineer', locationName: 'London', minimumSalary: 60000, maximumSalary: 70000, currency: 'GBP', date: '12/11/2026', jobDescription: 'Pipelines…', jobUrl: 'https://www.reed.co.uk/jobs/data-engineer/55' }] }) }],
  ]);
  const hn = await ADAPTERS.hn.search({ what: 'data engineer' });
  assert.equal(hn.postings.length, 1, 'replies are left out');
  assert.equal(hn.postings[0].company, 'Acme Data');
  assert.equal(hn.postings[0].remote, 'remote');
  assert.match(hn.postings[0].pay, /€90k/);
  assert.match(hn.thread, /Who is hiring/);
  await assert.rejects(ADAPTERS.adzuna.search({ what: 'x', market: 'Germany' }, 'only-one-part'), /APP_ID:APP_KEY/);
  await assert.rejects(ADAPTERS.adzuna.search({ what: 'x', market: 'Ireland' }, 'a:b'), /no data for Ireland/);
  const az = await ADAPTERS.adzuna.search({ what: 'data engineer', where: 'Berlin', market: 'Germany', days: 14 }, 'myid:mykey');
  assert.equal(az.postings[0].title, 'Data Engineer');
  assert.equal(az.postings[0].pay, '70,000–85,000');
  const usa = await ADAPTERS.usajobs.search({ what: 'data' }, 'someone@example.org:secret');
  assert.equal(usa.postings[0].pay, 'USD 99,000–128,000 per year');
  const usaAsk = asked.find((request) => /usajobs/.test(request.url));
  assert.equal(usaAsk.headers['Authorization-Key'], 'secret');
  assert.ok(!usaAsk.url.includes('secret'), 'the key is not in the address');
  const reed = await ADAPTERS.reed.search({ what: 'data engineer', where: 'London' }, 'reedkey');
  assert.equal(reed.postings[0].posted, '2026-11-12');
  const reedAsk = asked.find((request) => /reed\.co\.uk/.test(request.url));
  assert.equal(reedAsk.headers.Authorization, `Basic ${Buffer.from('reedkey:').toString('base64')}`);
  assert.ok(asked.every((request) => new URL(request.url).protocol === 'https:'));
});

test('the store numbers postings and merges the same job from two sources', () => {
  const store = openStore();
  const a = store.add('c1', 'ba', [{ title: 'Data Engineer (m/w/d)', company: 'Beta GmbH', location: 'Berlin, BERLIN', url: 'https://a/1' }, { title: 'Analyst', company: 'X', location: 'Bonn', url: 'https://a/2' }]);
  const b = store.add('c1', 'adzuna', [{ title: 'Data Engineer', company: 'Beta GmbH', location: 'Berlin', url: 'https://b/9' }]);
  assert.deepEqual(a.map((entry) => entry.posting.n), [1, 2]);
  assert.equal(b[0].posting.n, 1);
  assert.equal(b[0].fresh, false);
  assert.deepEqual(store.get('c1', 'P1').sources, ['ba', 'adzuna']);
  assert.equal(store.get('c2', 'P1'), undefined, 'conversations are kept apart');
  assert.equal(sameJob({ title: 'Data Engineer (m/w/d)', company: 'Beta', location: 'Berlin' }), sameJob({ title: 'data engineer', company: 'BETA', location: 'Berlin, Germany' }));
  for (let n = 0; n < 400; n += 1) store.request('c3');
  assert.throws(() => store.request('c3'), /limit/);
});

test('the private folder and the profile', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-folder-'));
  try {
    const folder = openFolder(join(dir, 'files'), { pdf: async () => 'PDF TEXT', convert: async () => 'WORD TEXT' });
    assert.deepEqual(folder.list(), []);
    for (const bad of ['', '../x.txt', 'a/b.txt', '.hidden']) assert.equal(fileName(bad), undefined, bad);
    assert.equal(folder.save('cv.txt', Buffer.from('Senior data engineer').toString('base64')), 'cv.txt');
    folder.save('cv.pdf', Buffer.from('%PDF').toString('base64'));
    folder.save('cv.docx', Buffer.from('PK').toString('base64'));
    assert.throws(() => folder.save('run.sh', Buffer.from('x').toString('base64')), /reads text/);
    assert.equal(folder.list().length, 3);
    assert.equal(await folder.read('cv.txt'), 'Senior data engineer');
    assert.equal(await folder.read('cv.pdf'), 'PDF TEXT');
    assert.equal(await folder.read('cv.docx'), 'WORD TEXT');
    await assert.rejects(folder.read('../../etc/passwd'), /one file/);
    await assert.rejects(folder.read('nope.txt'), /no file/);
    const noPdf = openFolder(join(dir, 'files'));
    await assert.rejects(noPdf.read('cv.pdf'), /PDF reader/);

    assert.equal(profileProblem('Titles: data engineer\nYears: 9\nPay: 95k EUR'), undefined);
    assert.match(profileProblem('x'.repeat(6001)), /longer than 6000/);
    const profile = openProfile(join(dir, 'profile.md'));
    assert.equal(profile.read(), '');
    profile.save('Titles: data engineer');
    assert.equal(profile.read().trim(), 'Titles: data engineer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the report: Markdown and a table that a spreadsheet cannot run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-report-'));
  try {
    assert.match(csv([{ rank: 1, title: '=HYPERLINK("x")', reason: 'good, "really"' }]), /'=HYPERLINK\(""x""\)/);
    const saved = writeReport(dir, { title: 'Data engineer: Germany & Spain', markdown: '## Understanding\nSenior data engineering work in Germany and Spain.', opportunities: [{ rank: 1, title: 'Data Engineer', company: 'Beta', link: 'https://a/1' }] }, new Date('2026-11-14T20:05:00Z'));
    assert.equal(saved.markdown, join(dir, 'reports', '2026-11-14-2005-data-engineer-germany-spain.md'));
    assert.ok(existsSync(saved.table));
    assert.match(readFileSync(saved.markdown, 'utf8'), /^# Data engineer: Germany & Spain/);
    assert.throws(() => writeReport(dir, { title: 'x', markdown: 'short' }), /empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the selection note', () => {
  const selection = readSelection({ title: ' Data   engineer ', workType: 'freelance', markets: ['germany', 'Spain', 'Atlantis', 'Spain'] });
  assert.deepEqual(selection.markets, ['Germany', 'Spain', 'Atlantis']);
  assert.deepEqual(readSelection({}).markets, ['USA', 'UK', 'Germany', 'Spain']);
  assert.equal(readSelection({ workType: 'pirate' }).workType, 'any');
  const note = selectionNote(selection, { files: '2 files', profile: 'none yet', model: 'local-model (on the user\'s own machines)' });
  assert.match(note, /Work: Data engineer/);
  assert.match(note, /Germany \(German\/English\)/);
  assert.match(note, /Work type: freelance/);
});

test('the tools: files and profile for any model, terms held, a run saved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-tools-'));
  try {
    network([[/pc\/v6\/jobs/, { status: 200, text: fixture('ba-search.json') }], [/pc\/v4\/jobdetails/, { status: 200, text: fixture('ba-detail.json') }]]);
    const folder = openFolder(join(dir, 'files'), { convert: async () => '' });
    folder.save('cv.txt', Buffer.from('Jane Example, data engineer').toString('base64'));
    const profile = openProfile(join(dir, 'profile.md'));
    profile.save('Titles: data engineer\nYears: 9');
    const providers = { home: { baseURL: 'http://127.0.0.1:8080/v1', displayName: 'Home server' } };
    assert.equal(staysHome(providerPlace(providers, 'home')), true);
    assert.equal(staysHome(providerPlace(providers, 'deepseek')), false);
    // Scout works with any model: the gate lets both through.
    const gate = () => ({ files: { ok: true, why: '' }, profile: { ok: true, why: '' } });
    const registry = readRegistry('{}', '[]');
    const tools = Object.fromEntries(buildTools({
      enabled: () => true, registry: () => registry, selection: () => readSelection({ markets: ['Germany'] }),
      keyOf: async () => '', hasKey: () => false, store: openStore(), folder, profile, gate, idOf: () => 'c1', now: () => Date.parse('2026-11-14T12:00:00Z'),
    }).map((tool) => [tool.name, tool]));
    const local = { agent: { route: { provider: 'home', model: 'local-model' } } };
    const cloud = { agent: { route: { provider: 'deepseek', model: 'deepseek-chat' } } };
    const run = async (name, args, exec = local) => (await tools[name].execute(args, exec)).text;

    assert.match(await run('scout_files', {}, cloud), /cv\.txt/);
    assert.match(await run('scout_files', { name: 'cv.txt' }, cloud), /Jane Example/);
    assert.match(await run('scout_profile', {}, cloud), /Years: 9/);
    assert.match(await run('scout_profile', { save: 'Titles: data engineer\nYears: 10' }, cloud), /saved/);

    const sources = await run('scout_sources', {});
    assert.match(sources, /Bundesagentur/);
    assert.match(sources, /key is not set/);
    assert.match(sources, /StepStone[\s\S]*search engine only/);
    assert.match(await run('scout_search', { source: 'nope' }), /no source "nope"/);
    assert.match(await run('scout_search', { source: 'stepstone', what: 'x' }), /web_search \(site:stepstone\.de\)/);
    assert.match(await run('scout_search', { source: 'adzuna', what: 'x', market: 'Germany' }), /needs a key/);
    assert.match(await run('scout_search', { source: 'reed', what: 'x', market: 'Germany' }), /does not cover Germany/);
    const found = await run('scout_search', { source: 'ba', what: 'Data Engineer', where: 'Berlin' });
    assert.match(found, /P1 · Data Engineer/);
    assert.match(found, /UNTRUSTED SOURCE TEXT/);
    assert.match(await run('scout_posting', { id: 'P1' }), /Lehrauftrag/);
    assert.match(await run('scout_posting', { id: 'P99' }), /no posting P99/);
    const saved = await run('scout_report', { title: 'Data engineer Germany', markdown: '## Understanding\nA run in Germany for data engineering work.', opportunities: [{ rank: 1, title: 'Data Engineer', fit: 4 }] });
    assert.match(saved, /reports\/.*data-engineer-germany\.md/);
    const off = buildTools({ enabled: () => false, registry: () => registry, selection: () => readSelection({}), keyOf: async () => '', hasKey: () => false, store: openStore(), folder, profile, gate, idOf: () => 'c1' });
    assert.match((await off[0].execute({}, local)).text, /switched off/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plain text from markup', () => {
  assert.equal(plainText('<p>One &amp; two</p><ul><li>three</li></ul>'), 'One & two\n• three');
  assert.equal(plainText('&lt;p&gt;Escaped &amp;amp; once more&lt;/p&gt;'), 'Escaped & once more');
  assert.equal(plainText('<script>alert(1)</script>Text'), 'Text');
});

test('step 2, research: titles from ESCO, demand by title, and pay', async () => {
  const { titles, demand, readPay, payFromPostings, adzunaPay } = await import('../lib/research.js');
  const asked = network([
    [/esco\/api\/search\?/, { status: 200, text: fixture('esco-search.json') }],
    [/esco\/api\/resource\/occupation\?/, { status: 200, text: fixture('esco-occupation.json') }],
    [/pc\/v6\/jobs/, (url) => ({ status: 200, text: JSON.stringify({ maxErgebnisse: new URL(url).searchParams.get('was') === 'Data Engineer' ? 123 : 7, ergebnisliste: [] }) })],
    [/adzuna\.com\/v1\/api\/jobs\/gb\/histogram/, { status: 200, text: JSON.stringify({ histogram: { 20000: 5, 40000: 20, 60000: 50, 80000: 20, 100000: 5 } }) }],
  ]);
  const found = await titles('data engineer', { languages: ['German', 'Spanish'] });
  assert.match(found, /German: Datenwissenschaftler\/Datenwissenschaftlerin/);
  assert.match(found, /Spanish: científico de datos/);
  assert.match(found, /ISCO 2511/);
  assert.match(found, /Essential skills: /);
  assert.ok(asked.every((request) => request.url.startsWith('https://ec.europa.eu/esco/api/')));

  const registry = readRegistry('{}', '[]');
  let requests = 0;
  const table = await demand({ titles: ['Data Engineer', 'Dateningenieur'], market: 'Germany', registry, keyOf: async () => '', hasKey: () => false, request: () => { requests += 1; } });
  assert.match(table, /"Data Engineer": Bundesagentur für Arbeit Jobbörse: 123/);
  assert.match(table, /"Dateningenieur": Bundesagentur für Arbeit Jobbörse: 7/);
  assert.equal(requests, 2);
  assert.equal(new URL(asked.find((request) => /pc\/v6\/jobs/.test(request.url)).url).searchParams.get('size'), '1', 'a count asks for one result only');
  assert.match(await demand({ titles: ['Data Engineer'], market: 'UK', registry, keyOf: async () => '', hasKey: () => false, request: () => {} }), /Adzuna, Reed would \(they need a free key/);

  assert.deepEqual(readPay('€150K - €250K'), { currency: 'EUR', low: 150000, high: 250000, per: 'year' });
  assert.deepEqual(readPay('GBP 60,000–70,000'), { currency: 'GBP', low: 60000, high: 70000, per: 'year' });
  assert.deepEqual(readPay('USD 99,000–128,000 per year'), { currency: 'USD', low: 99000, high: 128000, per: 'year' });
  assert.deepEqual(readPay('€650 per day'), { currency: 'EUR', low: 650, high: 650, per: 'day' });
  assert.equal(readPay('competitive'), undefined);
  const summary = payFromPostings([
    { n: 1, title: 'Data Engineer', pay: '€80K - €100K' }, { n: 2, title: 'Data Engineer', pay: '€60K - €70K' }, { n: 3, title: 'Analyst', pay: '' }, { n: 4, title: 'Data Engineer', pay: 'GBP 60,000–70,000' },
  ]);
  assert.match(summary, /EUR per year: 2 postings; middle of the ranges from 65,000 to 90,000, median 77,500 \(P1, P2\)/);
  assert.match(summary, /GBP per year: 1 posting/);
  assert.equal(await adzunaPay({ market: 'UK', what: 'x', key: '' }), '');
  assert.match(await adzunaPay({ market: 'UK', what: 'data engineer', key: 'id:secret' }), /100 postings across UK: lower quarter from 40,000, middle from 60,000, upper quarter from 60,000/);
});

test('step 2, the research tools in a conversation', async () => {
  network([
    [/esco\/api\/search\?/, { status: 200, text: fixture('esco-search.json') }],
    [/esco\/api\/resource\/occupation\?/, { status: 200, text: fixture('esco-occupation.json') }],
    [/pc\/v6\/jobs/, { status: 200, text: fixture('ba-search.json') }],
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'scout-research-'));
  try {
    const registry = readRegistry('{}', '[]');
    const store = openStore();
    const tools = Object.fromEntries(buildTools({
      enabled: () => true, registry: () => registry, selection: () => readSelection({ markets: ['Germany', 'Spain'] }),
      keyOf: async () => '', hasKey: () => false, store, folder: openFolder(join(dir, 'f')), profile: openProfile(join(dir, 'p.md')),
      gate: () => ({ files: { ok: true, why: '' }, profile: { ok: true, why: '' } }), idOf: () => 'c1',
    }).map((tool) => [tool.name, tool]));
    const run = async (name, args) => (await tools[name].execute(args, {})).text;
    const named = await run('scout_titles', { title: 'data engineer' });
    assert.match(named, /German: /);
    assert.match(named, /Spanish: /, 'languages come from the selected markets');
    assert.match(await run('scout_demand', { titles: ['Data Engineer'], market: 'Germany' }), /Bundesagentur für Arbeit Jobbörse: \d+/);
    const pay = await run('scout_pay', { what: 'Data Engineer', market: 'Germany' });
    assert.match(pay, /No posting found in this conversation/);
    assert.match(pay, /Adzuna's pay statistics for Germany need its free key/);
    assert.match(pay, /Entgeltatlas/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
