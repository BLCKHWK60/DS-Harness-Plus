/**
 * Finance data that needs no key and no account.
 *
 * Two public sources, read directly:
 *   - the US securities regulator (SEC EDGAR): which company is meant, the figures it reported,
 *     and its filings. Covers companies that file with the SEC, which is every US-listed company
 *     and many foreign ones.
 *   - the World Bank: yearly readings for economies (growth, inflation, jobs and more).
 * Every number comes back with its period, its source and the date it was filed or published.
 * Nothing is sent but the company or country asked about. Kept apart from the plugin so it can be
 * tested without the app or the network.
 */
import https from 'node:https';

/** How this add-on names itself to the services. No personal details. */
export const AGENT = 'DeepSeek-Harness-Plus finance add-on';
/** A service that has not answered after this long is tried once more, then given up on. */
export const TIMEOUT_MS = 12000;
/** Answers are kept this long, so one question does not fetch the same thing twice. */
export const KEEP_MS = 10 * 60 * 1000;
const BODY_MAX = 40 * 1024 * 1024;

/** The network; replaceable by tests. */
export const hooks = {
  /**
   * Fetch JSON.
   * @param {string} url - an https address.
   * @param {number} [family] - 4 to use the older internet addressing only (some services hang on the newer one).
   * @returns {Promise<unknown>} the parsed answer.
   */
  get(url, family) {
    return new Promise((done, fail) => {
      const request = https.get(url, { headers: { 'user-agent': AGENT, accept: 'application/json' }, timeout: TIMEOUT_MS, ...(family ? { family } : { autoSelectFamily: true }) }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          fail(new Error(response.statusCode === 404 ? 'not found' : `the service answered ${response.statusCode}`));
          return;
        }
        let size = 0;
        const chunks = [];
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > BODY_MAX) request.destroy(new Error('the answer was too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            fail(new Error('the service gave an answer that could not be read'));
          }
        });
        response.on('error', fail);
      });
      request.on('timeout', () => request.destroy(new Error('the service did not answer in time')));
      request.on('error', fail);
    });
  },
};

const cache = new Map();
/**
 * Fetch JSON, keeping answers for a while.
 * @param {string} url - the address.
 * @param {number} [now] - the current time.
 * @returns {Promise<unknown>} the answer.
 */
export async function getJson(url, now = Date.now()) {
  const kept = cache.get(url);
  if (kept && now - kept.at < KEEP_MS) return kept.value;
  let value;
  try {
    value = await hooks.get(url);
  } catch (error) {
    // A missing page will not appear on a second try; a slow or failing service often answers the second time.
    if (String(error?.message) === 'not found') throw error;
    value = await hooks.get(url, 4);
  }
  cache.set(url, { at: now, value });
  while (cache.size > 40) cache.delete(cache.keys().next().value);
  return value;
}
/** Forget kept answers (for tests). */
export const forget = () => cache.clear();

const number = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * A large number in words, for reading; the exact number is always given beside it.
 * @param {number} value - the number.
 * @returns {string} for example "130.5 billion"; '' for small numbers.
 */
export function short(value) {
  const size = Math.abs(value);
  for (const [limit, word] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']]) {
    if (size >= limit) return `${(value / limit).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${word}`;
  }
  return '';
}

// ---- companies: the US securities regulator -------------------------------------------------

/** What can be asked for, and the names companies report it under (US rules first, then international). */
export const MEASURES = {
  revenue: { label: 'Revenue', flow: true, tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'Revenue'] },
  gross_profit: { label: 'Gross profit', flow: true, tags: ['GrossProfit'] },
  operating_income: { label: 'Operating income', flow: true, tags: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'] },
  net_income: { label: 'Net income', flow: true, tags: ['NetIncomeLoss', 'ProfitLoss'] },
  eps_diluted: { label: 'Earnings per share, diluted', flow: true, tags: ['EarningsPerShareDiluted', 'DilutedEarningsLossPerShare'] },
  operating_cash_flow: { label: 'Cash from operations', flow: true, tags: ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities'] },
  capital_spending: { label: 'Capital spending', flow: true, tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'] },
  research_development: { label: 'Research and development', flow: true, tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'] },
  cash: { label: 'Cash and equivalents', flow: false, tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents'] },
  total_assets: { label: 'Total assets', flow: false, tags: ['Assets'] },
  total_liabilities: { label: 'Total liabilities', flow: false, tags: ['Liabilities'] },
  equity: { label: 'Shareholders\' equity', flow: false, tags: ['StockholdersEquity', 'EquityAttributableToOwnersOfParent', 'Equity'] },
  long_term_debt: { label: 'Long-term debt', flow: false, tags: ['LongTermDebt', 'LongTermDebtNoncurrent', 'NoncurrentPortionOfNoncurrentBorrowings'] },
};
export const DEFAULT_MEASURES = ['revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted', 'operating_cash_flow', 'cash', 'long_term_debt'];
const ANNUAL_FORMS = ['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A'];
/** The reports figures belong to; a value repeated in another kind of filing is cited from one of these when it can be. */
const REPORT_FORMS = [...ANNUAL_FORMS, '10-Q', '10-Q/A', '6-K'];

const cik10 = (cik) => String(cik).padStart(10, '0');

/**
 * Find which company is meant.
 * @param {unknown} company - a name, a ticker, or the regulator's company number (CIK).
 * @returns {Promise<{cik: string, name: string, tickers: string, others: string[]}>} the best match and other candidates.
 */
export async function findCompany(company) {
  const text = String(company ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  if (!text) throw new Error('Give a company name or ticker.');
  if (/^\d{1,10}$/.test(text)) return { cik: String(Number(text)), name: '', tickers: '', others: [] };
  const found = await getJson(`https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(text)}`);
  const hits = (found?.hits?.hits ?? []).filter((hit) => /^\d+$/.test(String(hit?._id ?? '')));
  if (hits.length === 0) throw new Error(`The US securities regulator lists no company matching "${text}". It covers companies that file in the United States; for others, use web search.`);
  const exact = hits.find((hit) => String(hit._source?.tickers ?? '').split(/[,\s]+/).some((ticker) => ticker.toLowerCase() === text.toLowerCase()));
  const best = exact ?? hits[0];
  const show = (hit) => String(hit._source?.entity ?? hit._id);
  return {
    cik: String(Number(best._id)),
    name: show(best).replace(/\s*\([^)]*\)\s*$/, ''),
    tickers: String(best._source?.tickers ?? ''),
    others: hits.filter((hit) => hit !== best).slice(0, 4).map(show),
  };
}

const days = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000;

/**
 * One measure's reported values, newest first.
 * @param {object} facts - the regulator's "company facts".
 * @param {string} id - a key of `MEASURES`.
 * @param {'annual' | 'quarterly'} period - yearly or quarterly values.
 * @param {number} count - how many to return.
 * @returns {{unit: string, rows: {end: string, start?: string, val: number, form: string, filed: string}[]}} the values.
 */
export function measureRows(facts, id, period, count) {
  const measure = MEASURES[id];
  const all = [];
  for (const family of ['us-gaap', 'ifrs-full']) {
    for (const tag of measure.tags) {
      const units = facts?.facts?.[family]?.[tag]?.units;
      if (!units) continue;
      for (const [unit, entries] of Object.entries(units)) for (const entry of Array.isArray(entries) ? entries : []) all.push({ ...entry, unit });
    }
  }
  const fits = (entry) => {
    if (typeof entry.val !== 'number' || !entry.end || !entry.filed) return false;
    if (measure.flow) {
      if (!entry.start) return false;
      const length = days(entry.start, entry.end);
      return period === 'annual' ? length > 340 && length < 385 : length > 75 && length < 105;
    }
    return period === 'annual' ? ANNUAL_FORMS.includes(entry.form) && (entry.fp === 'FY' || entry.fp === undefined) : true;
  };
  const usable = all.filter(fits);
  if (usable.length === 0) return { unit: '', rows: [] };
  // A company reports in one currency; take the unit it uses most.
  const tally = new Map();
  for (const entry of usable) tally.set(entry.unit, (tally.get(entry.unit) ?? 0) + 1);
  const unit = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // The same period is repeated in later filings; keep one value for each period: from a report if there is one, else the latest filing's.
  const byPeriod = new Map();
  for (const entry of usable.filter((item) => item.unit === unit)) {
    const key = `${entry.start ?? ''}|${entry.end}`;
    const kept = byPeriod.get(key);
    const better = !kept || (REPORT_FORMS.includes(entry.form) !== REPORT_FORMS.includes(kept.form) ? REPORT_FORMS.includes(entry.form) : entry.filed > kept.filed);
    if (better) byPeriod.set(key, entry);
  }
  let rows = [...byPeriod.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
  // A balance figure for a year end shows up once per period; drop repeats of the same end date.
  if (!measure.flow) rows = rows.filter((row, index) => index === 0 || row.end !== rows[index - 1].end);
  return { unit, rows: rows.slice(0, count).map(({ start, end, val, form, filed }) => ({ start, end, val, form, filed })) };
}

/**
 * A company's reported figures, as text for the assistant.
 * @param {object} want - what to fetch.
 * @param {unknown} want.company - name, ticker or CIK.
 * @param {unknown} [want.measures] - keys of `MEASURES`; the usual set when empty.
 * @param {unknown} [want.period] - 'annual' (default) or 'quarterly'.
 * @param {unknown} [want.count] - how many periods.
 * @returns {Promise<string>} the answer.
 */
export async function companyFigures(want) {
  const company = await findCompany(want?.company);
  const period = want?.period === 'quarterly' ? 'quarterly' : 'annual';
  const count = Math.min(12, Math.max(1, Math.floor(Number(want?.count) || (period === 'annual' ? 5 : 8))));
  const asked = (Array.isArray(want?.measures) ? want.measures : []).map(String).filter((id) => MEASURES[id]);
  const ids = asked.length > 0 ? [...new Set(asked)] : DEFAULT_MEASURES;
  const source = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(company.cik)}.json`;
  let facts;
  try {
    facts = await getJson(source);
  } catch (error) {
    if (String(error?.message) === 'not found') throw new Error(`The regulator has no reported figures in data form for ${company.name || `company ${company.cik}`}. Use its filings (finance_company_filings) or web search.`);
    throw error;
  }
  const name = String(facts?.entityName ?? company.name ?? `company ${company.cik}`);
  const lines = [`${name}${company.tickers ? ` (${company.tickers})` : ''}: figures as the company reported them to the US securities regulator, ${period === 'annual' ? 'by financial year' : 'by quarter'}, newest first.`];
  const missing = [];
  for (const id of ids) {
    const { unit, rows } = measureRows(facts, id, period, count);
    if (rows.length === 0) {
      missing.push(MEASURES[id].label);
      continue;
    }
    lines.push('', `${MEASURES[id].label} (${unit}):`);
    for (const row of rows) {
      const words = short(row.val);
      const span = row.start ? `${row.start} to ${row.end}` : `at ${row.end}`;
      lines.push(`- ${span}: ${number(row.val)}${words ? ` (${words})` : ''} [${row.form}, filed ${row.filed}]`);
    }
  }
  if (missing.length > 0) lines.push('', `Not found in the company's data for this period type: ${missing.join(', ')}. The company may report them under another name; check its filings.`);
  if (period === 'quarterly') lines.push('', 'Note: many companies do not report the fourth quarter on its own; it is the year minus the first three quarters.');
  if (company.others.length > 0) lines.push('', `If another company was meant, other matches were: ${company.others.join('; ')}.`);
  lines.push('', `Source: US Securities and Exchange Commission, EDGAR company facts, ${source}`, 'These are the company\'s own reported numbers. Each line gives the form it was filed in and the filing date; cite those.');
  return lines.join('\n');
}

const ITEM_WORDS = { '1.01': 'material agreement', '2.02': 'results of operations', '2.05': 'restructuring costs', '5.02': 'change of directors or officers', '5.07': 'shareholder vote', '7.01': 'disclosure', '8.01': 'other events' };
const DEFAULT_FORMS = ['10-K', '10-Q', '8-K', '20-F', '40-F', '6-K'];

/**
 * A company's recent filings, as text for the assistant.
 * @param {object} want - what to fetch.
 * @param {unknown} want.company - name, ticker or CIK.
 * @param {unknown} [want.forms] - form types; the main ones when empty.
 * @param {unknown} [want.limit] - how many.
 * @returns {Promise<string>} the answer.
 */
export async function companyFilings(want) {
  const company = await findCompany(want?.company);
  const limit = Math.min(30, Math.max(1, Math.floor(Number(want?.limit) || 10)));
  const asked = (Array.isArray(want?.forms) ? want.forms : []).map((form) => String(form).trim().toUpperCase()).filter(Boolean);
  const forms = asked.length > 0 ? asked : DEFAULT_FORMS;
  const data = await getJson(`https://data.sec.gov/submissions/CIK${cik10(company.cik)}.json`);
  const recent = data?.filings?.recent ?? {};
  const rows = [];
  for (let i = 0; i < (recent.form ?? []).length && rows.length < limit; i += 1) {
    const form = String(recent.form[i] ?? '');
    if (!forms.includes(form.toUpperCase())) continue;
    const accession = String(recent.accessionNumber?.[i] ?? '');
    const file = String(recent.primaryDocument?.[i] ?? '');
    const items = String(recent.items?.[i] ?? '').split(',').map((item) => ITEM_WORDS[item.trim()]).filter(Boolean);
    const about = [String(recent.primaryDocDescription?.[i] ?? '').trim(), items.join(', ')].filter(Boolean).join('; ');
    rows.push(`- ${recent.filingDate?.[i]}: ${form}${recent.reportDate?.[i] ? `, for the period to ${recent.reportDate[i]}` : ''}${about ? ` (${about})` : ''}\n  https://www.sec.gov/Archives/edgar/data/${company.cik}/${accession.replace(/-/g, '')}/${file}`);
  }
  const name = String(data?.name ?? company.name ?? `company ${company.cik}`);
  if (rows.length === 0) return `${name} has no recent filings of these kinds: ${forms.join(', ')}.`;
  return [
    `${name}${company.tickers ? ` (${company.tickers})` : ''}: recent filings with the US securities regulator, newest first.`,
    '10-K and 20-F are annual reports, 10-Q quarterly reports, 8-K and 6-K news the company had to report.',
    '',
    ...rows,
    '',
    'Source: US Securities and Exchange Commission, EDGAR. Open a filing with the web fetch tool to read it; if the regulator refuses the download, give the user the link.',
  ].join('\n');
}

// ---- economies: the World Bank ----------------------------------------------------------------

/** Yearly readings that can be asked for. */
export const INDICATORS = {
  growth: { code: 'NY.GDP.MKTP.KD.ZG', label: 'Economic growth (GDP, yearly %)' },
  inflation: { code: 'FP.CPI.TOTL.ZG', label: 'Inflation (consumer prices, yearly %)' },
  unemployment: { code: 'SL.UEM.TOTL.ZS', label: 'Unemployment (% of the labour force)' },
  gdp: { code: 'NY.GDP.MKTP.CD', label: 'Size of the economy (GDP, current US dollars)' },
  gdp_per_person: { code: 'NY.GDP.PCAP.CD', label: 'GDP per person (current US dollars)' },
  government_debt: { code: 'GC.DOD.TOTL.GD.ZS', label: 'Central government debt (% of GDP)' },
  current_account: { code: 'BN.CAB.XOKA.GD.ZS', label: 'Current account balance (% of GDP)' },
  exports: { code: 'NE.EXP.GNFS.ZS', label: 'Exports of goods and services (% of GDP)' },
  population: { code: 'SP.POP.TOTL', label: 'Population' },
};
export const DEFAULT_INDICATORS = ['growth', 'inflation', 'unemployment', 'gdp'];
const NICKNAMES = { us: 'USA', usa: 'USA', america: 'USA', uk: 'GBR', britain: 'GBR', 'south korea': 'KOR', korea: 'KOR', russia: 'RUS', world: 'WLD', global: 'WLD', 'euro area': 'EMU', eurozone: 'EMU', eu: 'EUU', europe: 'EUU', china: 'CHN', turkey: 'TUR', vietnam: 'VNM', iran: 'IRN', egypt: 'EGY' };

/**
 * Work out which economies are meant.
 * @param {unknown} names - names or three-letter codes.
 * @returns {Promise<{found: {code: string, name: string}[], unknown: string[]}>} the economies.
 */
export async function findEconomies(names) {
  const list = (Array.isArray(names) ? names : [names]).map((name) => String(name ?? '').trim()).filter(Boolean).slice(0, 6);
  if (list.length === 0) throw new Error('Give at least one country or region.');
  const answer = await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400');
  const all = (Array.isArray(answer?.[1]) ? answer[1] : []).map((row) => ({ code: String(row.id), two: String(row.iso2Code ?? ''), name: String(row.name) }));
  const found = [];
  const unknown = [];
  for (const raw of list) {
    const text = raw.toLowerCase();
    const code = NICKNAMES[text];
    const hit = all.find((row) => row.code === code)
      ?? all.find((row) => row.code.toLowerCase() === text || row.name.toLowerCase() === text)
      ?? all.find((row) => row.two.toLowerCase() === text)
      ?? all.find((row) => row.name.toLowerCase().startsWith(text));
    if (hit && !found.some((row) => row.code === hit.code)) found.push({ code: hit.code, name: hit.name });
    else if (!hit) unknown.push(raw);
  }
  return { found, unknown };
}

/**
 * Yearly readings for economies, as text for the assistant.
 * @param {object} want - what to fetch.
 * @param {unknown} want.countries - names or codes.
 * @param {unknown} [want.indicators] - keys of `INDICATORS`; the usual set when empty.
 * @param {unknown} [want.years] - how many recent years.
 * @returns {Promise<string>} the answer.
 */
export async function economyReadings(want) {
  const { found, unknown } = await findEconomies(want?.countries);
  if (found.length === 0) throw new Error(`The World Bank lists no economy matching ${unknown.map((name) => `"${name}"`).join(', ')}. Use a country's English name or its three-letter code.`);
  const years = Math.min(15, Math.max(1, Math.floor(Number(want?.years) || 5)));
  const asked = (Array.isArray(want?.indicators) ? want.indicators : []).map(String).filter((id) => INDICATORS[id]);
  const ids = asked.length > 0 ? [...new Set(asked)] : DEFAULT_INDICATORS;
  const codes = found.map((row) => row.code).join(';');
  const answers = await Promise.all(ids.map((id) => getJson(`https://api.worldbank.org/v2/country/${codes}/indicator/${INDICATORS[id].code}?format=json&mrv=${years}&per_page=500`)
    .then((answer) => ({ id, answer }), (error) => ({ id, error }))));
  if (answers.every((item) => item.error)) throw answers[0].error;
  const lines = [`Yearly readings from the World Bank, newest first. Yearly figures arrive late: the newest is usually last year's or the year before.`];
  let updated = '';
  for (const economy of found) {
    lines.push('', `${economy.name} (${economy.code})`);
    for (const { id, answer, error } of answers) {
      if (error) {
        lines.push(`- ${INDICATORS[id].label}: could not be fetched (${String(error.message).slice(0, 80)})`);
        continue;
      }
      updated = String(answer?.[0]?.lastupdated ?? updated);
      const rows = (Array.isArray(answer?.[1]) ? answer[1] : [])
        .filter((row) => row?.countryiso3code === economy.code && typeof row.value === 'number')
        .sort((a, b) => Number(b.date) - Number(a.date));
      lines.push(rows.length === 0
        ? `- ${INDICATORS[id].label}: no value in these years`
        : `- ${INDICATORS[id].label}: ${rows.map((row) => `${row.date}: ${number(row.value)}${short(row.value) ? ` (${short(row.value)})` : ''}`).join('; ')}`);
    }
  }
  if (unknown.length > 0) lines.push('', `Not recognised: ${unknown.join(', ')}.`);
  lines.push('', `Source: World Bank, World Development Indicators${updated ? `, last updated ${updated}` : ''}, https://data.worldbank.org`, 'For this year\'s figures, forecasts, interest rates and exchange rates, use web search: this source does not have them.');
  return lines.join('\n');
}
