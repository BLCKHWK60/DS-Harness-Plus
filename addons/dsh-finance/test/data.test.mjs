import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { AGENT, DEFAULT_MEASURES, INDICATORS, MEASURES, companyFigures, companyFilings, economyReadings, findCompany, findEconomies, forget, getJson, hooks, measureRows, short } from '../lib/data.js';
import { buildTools } from '../lib/tools.js';

const real = { ...hooks };
let calls = [];
beforeEach(() => { forget(); calls = []; });
afterEach(() => Object.assign(hooks, real));

/** Answer requests from a table of address parts; anything else is "not found". */
function serve(table) {
  hooks.get = async (url, family) => {
    calls.push(family ? `${url} [${family}]` : url);
    const key = Object.keys(table).find((part) => url.includes(part));
    if (!key) throw new Error('not found');
    const value = table[key];
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(url, family) : value;
  };
}

const SEARCH = { hits: { hits: [
  { _id: '9999', _source: { entity: 'NVIDIA Trust Fund (NVTF)', tickers: 'NVTF' } },
  { _id: '1045810', _source: { entity: 'NVIDIA CORP (NVDA)', tickers: 'NVDA' } },
] } };
const year = (start, end, val, form, filed, extra = {}) => ({ start, end, val, form, filed, fp: 'FY', ...extra });
const FACTS = {
  entityName: 'NVIDIA CORP',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        year('2024-01-29', '2025-01-26', 130497000000, '10-K', '2025-02-26'),
        // The same year again in the next annual report, and in a proxy statement filed later still.
        year('2024-01-29', '2025-01-26', 130497000000, '10-K', '2026-02-25'),
        year('2024-01-29', '2025-01-26', 130497000000, 'DEF 14A', '2026-05-12'),
        year('2025-01-27', '2026-01-25', 215938000000, '10-K', '2026-02-25'),
        // Quarters and a nine-month total, which is neither a quarter nor a year.
        { start: '2026-01-26', end: '2026-04-26', val: 81615000000, form: '10-Q', filed: '2026-05-20', fp: 'Q1' },
        { start: '2026-04-27', end: '2026-07-26', val: 96221000000, form: '10-Q', filed: '2026-08-26', fp: 'Q2' },
        { start: '2026-01-26', end: '2026-07-26', val: 177836000000, form: '10-Q', filed: '2026-08-26', fp: 'Q2' },
      ] } },
      EarningsPerShareDiluted: { units: { 'USD/shares': [year('2025-01-27', '2026-01-25', 4.9, '10-K', '2026-02-25')] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [
        { end: '2026-01-25', val: 10605000000, form: '10-K', filed: '2026-02-25', fp: 'FY' },
        { end: '2026-04-26', val: 15000000000, form: '10-Q', filed: '2026-05-20', fp: 'Q1' },
        { end: '2025-01-26', val: 8589000000, form: '10-K', filed: '2025-02-26', fp: 'FY' },
        { end: '2025-01-26', val: 8589000000, form: '10-K', filed: '2026-02-25', fp: 'FY' },
      ] } },
    },
  },
};
const FILINGS = { name: 'NVIDIA CORP', filings: { recent: {
  form: ['8-K', '4', '10-Q', '8-K'],
  filingDate: ['2026-11-12', '2026-10-01', '2026-08-26', '2026-08-26'],
  reportDate: ['2026-11-11', '', '2026-07-26', '2026-08-26'],
  accessionNumber: ['0001045810-26-000082', '0001045810-26-000080', '0001045810-26-000075', '0001045810-26-000073'],
  primaryDocument: ['nvda-20261111.htm', 'form4.xml', 'nvda-20260726.htm', 'nvda-20260826.htm'],
  primaryDocDescription: ['8-K', 'FORM 4', '10-Q', '8-K'],
  items: ['5.02', '', '', '2.02,9.01'],
} } };

test('large numbers are also given in words', () => {
  assert.equal(short(215938000000), '215.94 billion');
  assert.equal(short(-2500000), '-2.5 million');
  assert.equal(short(3.2e12), '3.2 trillion');
  assert.equal(short(4.9), '');
});

test('a company is found by name, by ticker and by number', async () => {
  serve({ 'efts.sec.gov': SEARCH });
  // An exact ticker beats the first hit.
  assert.deepEqual(await findCompany('nvda'), { cik: '1045810', name: 'NVIDIA CORP', tickers: 'NVDA', others: ['NVIDIA Trust Fund (NVTF)'] });
  assert.equal((await findCompany('nvidia')).cik, '9999');
  assert.match(calls[0], /keysTyped=nvda$/);
  // A number is taken as the regulator's company number, with no lookup.
  calls = [];
  assert.equal((await findCompany('0001045810')).cik, '1045810');
  assert.equal(calls.length, 0);
  await assert.rejects(findCompany('  '), /Give a company name or ticker/);
  serve({ 'efts.sec.gov': { hits: { hits: [] } } });
  forget();
  await assert.rejects(findCompany('Nestle'), /lists no company matching "Nestle".*use web search/);
});

test('yearly and quarterly values are picked apart, one per period, cited from a report', () => {
  const annual = measureRows(FACTS, 'revenue', 'annual', 5);
  assert.equal(annual.unit, 'USD');
  assert.deepEqual(annual.rows.map((row) => `${row.end} ${row.val} ${row.form} ${row.filed}`), ['2026-01-25 215938000000 10-K 2026-02-25', '2025-01-26 130497000000 10-K 2026-02-25']);
  const quarterly = measureRows(FACTS, 'revenue', 'quarterly', 5);
  assert.deepEqual(quarterly.rows.map((row) => row.val), [96221000000, 81615000000]);
  assert.deepEqual(measureRows(FACTS, 'revenue', 'annual', 1).rows.length, 1);
  // A balance figure: year ends only for "annual", every date for "quarterly".
  assert.deepEqual(measureRows(FACTS, 'cash', 'annual', 5).rows.map((row) => row.end), ['2026-01-25', '2025-01-26']);
  assert.deepEqual(measureRows(FACTS, 'cash', 'quarterly', 5).rows.map((row) => row.end), ['2026-04-26', '2026-01-25', '2025-01-26']);
  assert.equal(measureRows(FACTS, 'eps_diluted', 'annual', 5).unit, 'USD/shares');
  assert.deepEqual(measureRows(FACTS, 'gross_profit', 'annual', 5), { unit: '', rows: [] });
  assert.deepEqual(measureRows({}, 'revenue', 'annual', 5), { unit: '', rows: [] });
  for (const id of DEFAULT_MEASURES) assert.ok(MEASURES[id], id);
});

test('a company reporting under international rules in another currency', () => {
  const facts = { facts: { 'ifrs-full': { Revenue: { units: { EUR: [year('2025-01-01', '2025-12-31', 32667300000, '20-F', '2026-02-25')] } } } } };
  const { unit, rows } = measureRows(facts, 'revenue', 'annual', 3);
  assert.equal(unit, 'EUR');
  assert.equal(rows[0].val, 32667300000);
});

test('the figures answer names the period, the form, the filing date and the source', async () => {
  serve({ 'efts.sec.gov': SEARCH, 'companyfacts/CIK0001045810': FACTS });
  const text = await companyFigures({ company: 'NVDA', measures: ['revenue', 'eps_diluted', 'gross_profit', 'nonsense'], count: 2 });
  assert.match(text, /^NVIDIA CORP \(NVDA\): figures as the company reported them to the US securities regulator, by financial year, newest first\./);
  assert.match(text, /Revenue \(USD\):\n- 2025-01-27 to 2026-01-25: 215,938,000,000 \(215\.94 billion\) \[10-K, filed 2026-02-25\]/);
  assert.match(text, /Earnings per share, diluted \(USD\/shares\):\n- 2025-01-27 to 2026-01-25: 4\.9 \[10-K, filed 2026-02-25\]/);
  assert.match(text, /Not found in the company's data for this period type: Gross profit\./);
  assert.match(text, /other matches were: NVIDIA Trust Fund \(NVTF\)/);
  assert.match(text, /Source: US Securities and Exchange Commission, EDGAR company facts, https:\/\/data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK0001045810\.json/);
  const quarters = await companyFigures({ company: 'NVDA', measures: ['revenue'], period: 'quarterly' });
  assert.match(quarters, /by quarter/);
  assert.match(quarters, /fourth quarter/);
  // The second question used what was already fetched.
  assert.equal(calls.filter((url) => url.includes('companyfacts')).length, 1);

  serve({ 'efts.sec.gov': SEARCH });
  forget();
  await assert.rejects(companyFigures({ company: 'NVDA' }), /no reported figures in data form for NVIDIA CORP/);
});

test('filings are listed with their date, kind and link', async () => {
  serve({ 'efts.sec.gov': SEARCH, 'submissions/CIK0001045810': FILINGS });
  const text = await companyFilings({ company: 'NVDA', limit: 5 });
  assert.match(text, /- 2026-11-12: 8-K, for the period to 2026-11-11 \(8-K; change of directors or officers\)\n {2}https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1045810\/000104581026000082\/nvda-20261111\.htm/);
  assert.match(text, /- 2026-08-26: 8-K, for the period to 2026-08-26 \(8-K; results of operations\)/);
  assert.ok(!text.includes('form4.xml'), 'insider forms are not among the main kinds');
  assert.equal((text.match(/^- /gm) ?? []).length, 3);
  assert.equal(((await companyFilings({ company: 'NVDA', forms: ['10-q'] })).match(/^- /gm) ?? []).length, 1);
  assert.match(await companyFilings({ company: 'NVDA', forms: ['20-F'] }), /no recent filings of these kinds: 20-F/);
});

const COUNTRIES = [{ total: 3 }, [
  { id: 'JPN', iso2Code: 'JP', name: 'Japan' },
  { id: 'USA', iso2Code: 'US', name: 'United States' },
  { id: 'EMU', iso2Code: 'XC', name: 'Euro area' },
  { id: 'KOR', iso2Code: 'KR', name: 'Korea, Rep.' },
]];
const wb = (rows) => [{ lastupdated: '2026-11-11' }, rows.map(([code, date, value]) => ({ countryiso3code: code, date, value }))];

test('economies are recognised by name, code and everyday name', async () => {
  serve({ '/v2/country?': COUNTRIES });
  const { found, unknown } = await findEconomies(['japan', 'US', 'eurozone', 'South Korea', 'kr', 'Atlantis', 'usa']);
  assert.deepEqual(found.map((row) => row.code), ['JPN', 'USA', 'EMU', 'KOR']);
  assert.deepEqual(unknown, ['Atlantis']);
  await assert.rejects(findEconomies([]), /at least one country/);
});

test('economy readings come with their year and source, and a failing part is said so', async () => {
  serve({
    '/v2/country?': COUNTRIES,
    [INDICATORS.growth.code]: wb([['JPN', '2024', -0.24], ['JPN', '2025', 1.19], ['USA', '2025', 2.16], ['JPN', '2023', null]]),
    [INDICATORS.gdp.code]: wb([['JPN', '2025', 4.2e12]]),
    [INDICATORS.inflation.code]: new Error('the service answered 502'),
  });
  const text = await economyReadings({ countries: ['Japan', 'US', 'Atlantis'], indicators: ['growth', 'inflation', 'gdp'], years: 3 });
  assert.match(text, /Japan \(JPN\)\n- Economic growth \(GDP, yearly %\): 2025: 1\.19; 2024: -0\.24\n- Inflation \(consumer prices, yearly %\): could not be fetched \(the service answered 502\)\n- Size of the economy \(GDP, current US dollars\): 2025: 4,200,000,000,000 \(4\.2 trillion\)/);
  assert.match(text, /United States \(USA\)\n- Economic growth \(GDP, yearly %\): 2025: 2\.16\n.*\n- Size of the economy \(GDP, current US dollars\): no value in these years/);
  assert.match(text, /Not recognised: Atlantis\./);
  assert.match(text, /Source: World Bank, World Development Indicators, last updated 2026-11-11/);
  assert.match(text, /use web search/);
  assert.ok(calls.some((url) => url.includes('country/JPN;USA/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=3')));
  // The failing reading was tried a second time before it was given up on.
  assert.equal(calls.filter((url) => url.includes(INDICATORS.inflation.code)).length, 2);

  await assert.rejects(economyReadings({ countries: ['Atlantis'] }), /lists no economy matching "Atlantis"/);
  serve({ '/v2/country?': COUNTRIES, indicator: new Error('the service did not answer in time') });
  forget();
  await assert.rejects(economyReadings({ countries: ['Japan'] }), /did not answer in time/);
});

test('a slow service is tried once more; a missing page is not; answers are kept for a while', async () => {
  let tries = 0;
  hooks.get = async (url, family) => {
    tries += 1;
    if (!family) throw new Error('the service did not answer in time');
    return { ok: true };
  };
  assert.deepEqual(await getJson('https://example.org/a', 1000), { ok: true });
  assert.equal(tries, 2);
  assert.deepEqual(await getJson('https://example.org/a', 2000), { ok: true });
  assert.equal(tries, 2);
  await getJson('https://example.org/a', 1000 + 11 * 60 * 1000);
  assert.equal(tries, 4);
  hooks.get = async () => { tries += 1; throw new Error('not found'); };
  tries = 0;
  await assert.rejects(getJson('https://example.org/b'), /not found/);
  assert.equal(tries, 1);
  assert.ok(!/@/.test(AGENT), 'no contact details are sent');
});

test('the tools answer in plain text and fail in plain words', async () => {
  let on = true;
  const tools = buildTools(() => on);
  assert.deepEqual(tools.map((tool) => tool.name), ['finance_company_figures', 'finance_company_filings', 'finance_economy']);
  serve({ 'efts.sec.gov': SEARCH, 'companyfacts/CIK0001045810': FACTS, 'submissions/CIK0001045810': FILINGS });
  assert.match((await tools[0].execute({ company: 'NVDA', measures: ['revenue'] })).text, /215,938,000,000/);
  assert.match((await tools[1].execute({ company: 'NVDA' })).text, /recent filings/);
  // The World Bank is not answering: the tool says so and what to do instead.
  const failed = (await tools[2].execute({ countries: ['Japan'] })).text;
  assert.match(failed, /^Not found\. The World Bank's service may be slow or down; try once more, then use web search/);
  serve({ 'efts.sec.gov': { hits: { hits: [] } } });
  forget();
  assert.match((await tools[0].execute({ company: 'Nestle' })).text, /lists no company matching "Nestle".*Use web search for this company's figures instead/);
  on = false;
  for (const tool of tools) assert.match((await tool.execute({ company: 'NVDA', countries: ['Japan'] })).text, /switched off/);
});
