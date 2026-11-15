/**
 * Markets and the source registry. The registry starts from a list of public sources (below) and
 * the user's changes: a source switched on or off, hidden, or added. Every source records how it
 * may be reached, so the tools can hold to each source's terms:
 *   - `api`: an official or public data interface; scout_search reads it.
 *   - `page`: its pages may be read one at a time (web_fetch).
 *   - `search`: found through a search engine only; its pages are never fetched.
 */

/** Known markets: languages, and for Adzuna's markets its country code and the currency its pay figures are in. */
export const MARKETS = {
  USA: { languages: ['English'], adzuna: 'us', currency: 'USD' },
  UK: { languages: ['English'], adzuna: 'gb', currency: 'GBP' },
  Germany: { languages: ['German', 'English'], adzuna: 'de', currency: 'EUR' },
  Spain: { languages: ['Spanish', 'English'], adzuna: 'es', currency: 'EUR' },
  France: { languages: ['French', 'English'], adzuna: 'fr', currency: 'EUR' },
  Netherlands: { languages: ['Dutch', 'English'], adzuna: 'nl', currency: 'EUR' },
  Austria: { languages: ['German', 'English'], adzuna: 'at', currency: 'EUR' },
  Switzerland: { languages: ['German', 'French', 'Italian', 'English'], adzuna: 'ch', currency: 'CHF' },
  Italy: { languages: ['Italian', 'English'], adzuna: 'it', currency: 'EUR' },
  Poland: { languages: ['Polish', 'English'], adzuna: 'pl', currency: 'PLN' },
  Belgium: { languages: ['Dutch', 'French', 'English'], adzuna: 'be', currency: 'EUR' },
  Canada: { languages: ['English', 'French'], adzuna: 'ca', currency: 'CAD' },
  Australia: { languages: ['English'], adzuna: 'au', currency: 'AUD' },
  Ireland: { languages: ['English'] },
  Portugal: { languages: ['Portuguese', 'English'] },
  Remote: { languages: ['English'] },
};
export const DEFAULT_MARKETS = ['USA', 'UK', 'Germany', 'Spain'];
export const WORK_TYPES = ['employee', 'freelance', 'contract', 'internship', 'tender'];
export const ACCESS = ['api', 'page', 'search'];
export const KINDS = ['board', 'company boards', 'government', 'community', 'freelance', 'recruiter', 'tender', 'pay and titles', 'signals', 'newsletter', 'other'];
/** Every market, for sources that cover all of them. */
const ALL = '*';

/**
 * The starting list. Public sources only; nothing about any one user.
 * `adapter` names the reader scout_search uses; `key` is 'none' or 'required'.
 */
export const SEED = [
  { id: 'ba', name: 'Bundesagentur für Arbeit Jobbörse', url: 'https://www.arbeitsagentur.de/jobsuche', markets: ['Germany'], workTypes: ['employee', 'freelance', 'internship'], kind: 'government', access: 'api', adapter: 'ba', key: 'none', about: 'Germany\'s public job exchange, through its public search interface. German titles work best.' },
  { id: 'arbeitnow', name: 'Arbeitnow', url: 'https://www.arbeitnow.com', markets: ['Germany', 'Remote'], workTypes: ['employee', 'internship'], kind: 'board', access: 'api', adapter: 'arbeitnow', key: 'none', about: 'Free public job API, mostly Germany and remote, updated hourly. Its terms ask for a link back: always give the posting\'s link.' },
  { id: 'adzuna', name: 'Adzuna', url: 'https://developer.adzuna.com', markets: ['USA', 'UK', 'Germany', 'Spain', 'France', 'Netherlands', 'Austria', 'Switzerland', 'Italy', 'Poland', 'Belgium', 'Canada', 'Australia'], workTypes: ['employee', 'contract'], kind: 'board', access: 'api', adapter: 'adzuna', key: 'required', keyHint: 'Free key at developer.adzuna.com. Enter it as APP_ID:APP_KEY.', about: 'A job search engine that gathers postings from many boards, with pay where known.' },
  { id: 'usajobs', name: 'USAJOBS', url: 'https://www.usajobs.gov', markets: ['USA'], workTypes: ['employee', 'internship'], kind: 'government', access: 'api', adapter: 'usajobs', key: 'required', keyHint: 'Free key at developer.usajobs.gov. Enter it as EMAIL:KEY, with the email you registered (USAJOBS asks for it with each request).', about: 'US federal government jobs.' },
  { id: 'reed', name: 'Reed', url: 'https://www.reed.co.uk/developers', markets: ['UK'], workTypes: ['employee', 'contract'], kind: 'board', access: 'api', adapter: 'reed', key: 'required', keyHint: 'Free key at reed.co.uk/developers.', about: 'One of the UK\'s largest job boards, with pay on most postings.' },
  { id: 'hn', name: 'Hacker News: Who is hiring', url: 'https://news.ycombinator.com/submitted?id=whoishiring', markets: [ALL], workTypes: ['employee', 'contract', 'freelance'], kind: 'community', access: 'api', adapter: 'hn', key: 'none', about: 'The monthly hiring threads (and the freelancer thread), searched through the public HN search interface. Tech roles; posts are by the hiring companies themselves.' },
  { id: 'greenhouse', name: 'Greenhouse company boards', url: 'https://boards.greenhouse.io', markets: [ALL], workTypes: ['employee', 'contract', 'internship'], kind: 'company boards', access: 'api', adapter: 'greenhouse', key: 'none', about: 'Each company\'s own job board on Greenhouse, read through its public board interface. Give the company\'s board name (as in boards.greenhouse.io/NAME); find companies with web_search site:boards.greenhouse.io.' },
  { id: 'lever', name: 'Lever company boards', url: 'https://jobs.lever.co', markets: [ALL], workTypes: ['employee', 'contract', 'internship'], kind: 'company boards', access: 'api', adapter: 'lever', key: 'none', about: 'Each company\'s own job board on Lever. Give the board name (jobs.lever.co/NAME); find companies with web_search site:jobs.lever.co.' },
  { id: 'ashby', name: 'Ashby company boards', url: 'https://jobs.ashbyhq.com', markets: [ALL], workTypes: ['employee', 'contract', 'internship'], kind: 'company boards', access: 'api', adapter: 'ashby', key: 'none', about: 'Each company\'s own job board on Ashby, often with pay. Give the board name (jobs.ashbyhq.com/NAME); find companies with web_search site:jobs.ashbyhq.com.' },
  { id: 'contractsfinder', name: 'Contracts Finder (UK)', url: 'https://www.contractsfinder.service.gov.uk', markets: ['UK'], workTypes: ['tender', 'freelance'], kind: 'tender', access: 'api', adapter: 'contractsfinder', key: 'none', about: 'UK public contracts, small ones included, from its open data interface (no key). Scout reads the newest notices (up to 500, about a week; set days for up to 30) and keeps those that match your words.' },
  { id: 'findatender', name: 'Find a Tender (UK)', url: 'https://www.find-tender.service.gov.uk', markets: ['UK'], workTypes: ['tender', 'freelance'], kind: 'tender', access: 'api', adapter: 'findatender', key: 'none', about: 'The UK\'s service for higher-value public contracts, from its open data interface (no key). Newest notices, matched here like Contracts Finder.' },
  { id: 'sam', name: 'SAM.gov contract opportunities', url: 'https://sam.gov', markets: ['USA'], workTypes: ['tender', 'freelance'], kind: 'tender', access: 'api', adapter: 'sam', key: 'required', keyHint: 'Free key from your SAM.gov account (Account Details, public API key). A personal key allows only a few requests a day.', about: 'US federal contract opportunities still open to bids (solicitations, presolicitations, sources sought), searched by title. A personal key allows few requests a day: search it with care.' },
  { id: 'govuk', name: 'Find a job (GOV.UK)', url: 'https://www.gov.uk/find-a-job', markets: ['UK'], workTypes: ['employee', 'internship'], kind: 'government', access: 'page', about: 'The UK government\'s job service. Single pages may be read.' },
  { id: 'eures', name: 'EURES', url: 'https://eures.europa.eu', markets: ['Germany', 'Spain', 'France', 'Netherlands', 'Austria', 'Italy', 'Poland', 'Belgium', 'Ireland', 'Portugal'], workTypes: ['employee'], kind: 'government', access: 'page', about: 'The EU\'s job mobility portal, with postings from the public job services of member states.' },
  { id: 'ted', name: 'TED public tenders', url: 'https://ted.europa.eu', markets: ['Germany', 'Spain', 'France', 'Netherlands', 'Austria', 'Italy', 'Poland', 'Belgium', 'Ireland', 'Portugal'], workTypes: ['tender', 'freelance'], kind: 'tender', access: 'page', about: 'Public procurement notices across the EU. For services work, search by the service and the country.' },
  { id: 'itjobswatch', name: 'IT Jobs Watch', url: 'https://www.itjobswatch.co.uk', markets: ['UK'], workTypes: ['employee', 'contract'], kind: 'pay and titles', access: 'page', about: 'Trends for UK tech titles and skills: demand, pay, and how they change.' },
  { id: 'esco', name: 'ESCO', url: 'https://esco.ec.europa.eu', markets: [ALL], workTypes: ['employee', 'freelance', 'contract'], kind: 'pay and titles', access: 'page', about: 'The EU\'s list of occupations and skills, in every EU language: other names for the same work.' },
  { id: 'onet', name: 'O*NET OnLine', url: 'https://www.onetonline.org', markets: ['USA'], workTypes: ['employee', 'freelance', 'contract'], kind: 'pay and titles', access: 'page', about: 'US occupations: titles, skills, tools and pay ranges.' },
  { id: 'indeed', name: 'Indeed', url: 'https://www.indeed.com', markets: ['USA', 'UK', 'Germany', 'Spain', 'France', 'Netherlands', 'Canada', 'Australia'], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'The largest job board. Its terms forbid automated reading: find postings with web_search (site:indeed.com, uk.indeed.com, de.indeed.com, es.indeed.com) and give the links.' },
  { id: 'linkedin', name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs', markets: [ALL], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'Its terms forbid automated reading and it needs a sign-in. Search engine results only (site:linkedin.com/jobs); never fetched.' },
  { id: 'stepstone', name: 'StepStone', url: 'https://www.stepstone.de', markets: ['Germany'], workTypes: ['employee'], kind: 'board', access: 'search', about: 'One of Germany\'s largest job boards. Search engine results only.' },
  { id: 'freelancermap', name: 'freelancermap', url: 'https://www.freelancermap.de', markets: ['Germany', 'Austria', 'Switzerland'], workTypes: ['freelance', 'contract'], kind: 'freelance', access: 'search', about: 'IT freelance projects in German-speaking countries. Search engine results only.' },
  { id: 'gulp', name: 'GULP', url: 'https://www.gulp.de', markets: ['Germany'], workTypes: ['freelance', 'contract'], kind: 'recruiter', access: 'search', about: 'Project agency for IT and engineering freelancers. Search engine results only.' },
  { id: 'totaljobs', name: 'Totaljobs', url: 'https://www.totaljobs.com', markets: ['UK'], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'A large UK job board. Search engine results only.' },
  { id: 'jobserve', name: 'Jobserve', url: 'https://www.jobserve.com', markets: ['UK'], workTypes: ['contract'], kind: 'board', access: 'search', about: 'A UK board strong on contract roles. Search engine results only.' },
  { id: 'dice', name: 'Dice', url: 'https://www.dice.com', markets: ['USA'], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'US tech jobs and contracts. Search engine results only.' },
  { id: 'wellfound', name: 'Wellfound', url: 'https://wellfound.com', markets: ['USA', 'Remote'], workTypes: ['employee'], kind: 'board', access: 'search', about: 'Start-up jobs, often with pay and equity. Search engine results only.' },
  { id: 'infojobs', name: 'InfoJobs', url: 'https://www.infojobs.net', markets: ['Spain'], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'Spain\'s largest job board. Search engine results only (it has an interface for registered apps, not added yet).' },
  { id: 'tecnoempleo', name: 'Tecnoempleo', url: 'https://www.tecnoempleo.com', markets: ['Spain'], workTypes: ['employee', 'contract'], kind: 'board', access: 'search', about: 'Spanish tech jobs. Search engine results only.' },
  { id: 'upwork', name: 'Upwork', url: 'https://www.upwork.com', markets: ['USA', 'UK', 'Remote'], workTypes: ['freelance'], kind: 'freelance', access: 'search', about: 'The largest freelance marketplace. Its terms forbid automated reading and its job pages need a sign-in: search engine results only (site:upwork.com/freelance-jobs).' },
  { id: 'peopleperhour', name: 'PeoplePerHour', url: 'https://www.peopleperhour.com', markets: ['UK', 'Remote'], workTypes: ['freelance'], kind: 'freelance', access: 'search', about: 'A UK freelance marketplace. Search engine results only.' },
  { id: 'yunojuno', name: 'YunoJuno', url: 'https://www.yunojuno.com', markets: ['UK'], workTypes: ['freelance', 'contract'], kind: 'freelance', access: 'search', about: 'UK freelance and contract work in tech and creative fields; briefs are for signed-in members. Search engine results only.' },
  { id: 'freelancer', name: 'Freelancer.com', url: 'https://www.freelancer.com', markets: [ALL], workTypes: ['freelance'], kind: 'freelance', access: 'search', about: 'A worldwide freelance marketplace with many small projects. Search engine results only.' },
  { id: 'guru', name: 'Guru', url: 'https://www.guru.com', markets: ['USA', 'Remote'], workTypes: ['freelance'], kind: 'freelance', access: 'search', about: 'A US freelance marketplace. Search engine results only.' },
  { id: 'malt', name: 'Malt', url: 'https://www.malt.es', markets: ['Spain', 'France', 'Germany', 'Netherlands', 'Belgium'], workTypes: ['freelance'], kind: 'freelance', access: 'search', about: 'Freelance platform. Clients post projects to signed-in freelancers; search engine results only.' },
];

const ID = /^[a-z0-9][a-z0-9-]{0,29}$/;
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** @returns {string | undefined} why an address cannot be a source, or undefined when it can. */
export function addressProblem(address) {
  let url;
  try {
    url = new URL(String(address ?? '').trim());
  } catch {
    return 'That is not a web address. It should start with https://';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only web addresses (https://) can be sources.';
  if (url.username || url.password) return 'An address with a sign-in in it cannot be a source.';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(url.hostname)) return 'That is not a usable web address.';
  return undefined;
}

/** A source the user added, checked. Returns undefined when it is not usable. */
export function cleanExtra(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const id = clip(raw.id, 30).toLowerCase();
  if (!ID.test(id) || SEED.some((seed) => seed.id === id)) return undefined;
  if (addressProblem(raw.url)) return undefined;
  const markets = [...new Set((Array.isArray(raw.markets) ? raw.markets : []).map((market) => clip(market, 40)).filter(Boolean))].slice(0, 30);
  const workTypes = [...new Set((Array.isArray(raw.workTypes) ? raw.workTypes : []).filter((type) => WORK_TYPES.includes(type)))];
  return {
    id,
    name: clip(raw.name, 80) || id,
    url: new URL(String(raw.url).trim()).href,
    markets: markets.length > 0 ? markets : [ALL],
    workTypes: workTypes.length > 0 ? workTypes : ['employee'],
    kind: KINDS.includes(raw.kind) ? raw.kind : 'other',
    access: raw.access === 'page' ? 'page' : 'search',
    about: clip(raw.about, 400),
    extra: true,
    on: raw.on !== false,
  };
}

const readJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(String(value ?? '') || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * The registry as it stands: the starting list with the user's changes, then the user's own.
 * @param {unknown} stateJson - `{ [id]: { on?: boolean, hidden?: boolean } }` for starting sources.
 * @param {unknown} extraJson - the user's own sources.
 * @returns {object[]} every source, hidden ones marked.
 */
export function readRegistry(stateJson, extraJson) {
  const state = readJson(stateJson, {});
  const table = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const extras = readJson(extraJson, []);
  const seed = SEED.map((source) => ({ ...source, on: table[source.id]?.on !== false, hidden: table[source.id]?.hidden === true }));
  const own = (Array.isArray(extras) ? extras : []).map(cleanExtra).filter(Boolean).slice(0, 200);
  return [...seed, ...own.map((source) => ({ ...source, hidden: false }))];
}

/** Whether a source covers a market. */
export const covers = (source, market) => source.markets.includes(ALL) || source.markets.includes(market);

/**
 * The sources in use for a run.
 * @param {object[]} registry - from readRegistry.
 * @param {{markets?: string[], workTypes?: string[]}} want - markets and work types; empty means all.
 * @returns {object[]} sources that are on, not hidden, and cover at least one of them.
 */
export function inUse(registry, { markets = [], workTypes = [] } = {}) {
  return registry.filter((source) => source.on && !source.hidden
    && (markets.length === 0 || markets.some((market) => covers(source, market)))
    && (workTypes.length === 0 || workTypes.some((type) => source.workTypes.includes(type))));
}

/** Kinds of source that help research the field but do not list work. */
export const REFERENCE = ['pay and titles'];

/**
 * Where the registry has no source that lists work: each market and work type with nothing ready.
 * @param {object[]} registry - from readRegistry.
 * @param {{markets: string[], workTypes: string[], ready: (source: object) => boolean}} want - `ready` says whether a source can be used now.
 * @returns {{market: string, workType: string, waiting: string[]}[]} the gaps; `waiting` names sources that would cover it once their key is set.
 */
export function gaps(registry, { markets = [], workTypes = [], ready = () => true }) {
  const out = [];
  for (const market of markets) {
    for (const workType of workTypes) {
      const covering = registry.filter((source) => source.on && !source.hidden && !REFERENCE.includes(source.kind) && covers(source, market) && source.workTypes.includes(workType));
      if (covering.some(ready)) continue;
      out.push({ market, workType, waiting: covering.map((source) => source.name) });
    }
  }
  return out;
}

/** Host names of sources whose pages must not be fetched. */
export function searchOnlyHosts(registry) {
  const hosts = new Set();
  for (const source of registry) {
    if (source.access !== 'search') continue;
    try {
      hosts.add(new URL(source.url).hostname.replace(/^www\./, '').toLowerCase());
    } catch {
      /* checked when added */
    }
  }
  return [...hosts];
}

/**
 * Whether a web address belongs to a source that is "search engine only".
 * Covers its subdomains and its country sites (indeed.com also covers uk.indeed.com and de.indeed.com;
 * stepstone.de covers stepstone.at).
 */
export function isSearchOnly(address, hosts) {
  let host;
  try {
    host = new URL(String(address ?? '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((blocked) => {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
    const [name] = blocked.split('.');
    // The same brand on another country domain: stepstone.de -> stepstone.at, indeed.com -> indeed.co.uk.
    return name.length >= 4 && (host.startsWith(`${name}.`) || host.includes(`.${name}.`));
  });
}

/** The secret store's name for a source's key. */
export const keyRef = (id) => `DSH_SCOUT_SOURCE_${String(id).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
