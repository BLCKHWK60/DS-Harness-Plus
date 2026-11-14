/**
 * Markets and the source registry. The registry starts from a list of public sources (below) and
 * the user's changes: a source switched on or off, hidden, or added. Every source records how it
 * may be reached, so the tools can hold to each source's terms:
 *   - `api`: an official or public data interface; scout_search reads it.
 *   - `page`: its pages may be read one at a time (web_fetch).
 *   - `search`: found through a search engine only; its pages are never fetched.
 */

/** Known markets: country code (for sources that take one), languages, and Adzuna's code. */
export const MARKETS = {
  USA: { languages: ['English'], adzuna: 'us' },
  UK: { languages: ['English'], adzuna: 'gb' },
  Germany: { languages: ['German', 'English'], adzuna: 'de' },
  Spain: { languages: ['Spanish', 'English'], adzuna: 'es' },
  France: { languages: ['French', 'English'], adzuna: 'fr' },
  Netherlands: { languages: ['Dutch', 'English'], adzuna: 'nl' },
  Austria: { languages: ['German', 'English'], adzuna: 'at' },
  Switzerland: { languages: ['German', 'French', 'Italian', 'English'], adzuna: 'ch' },
  Italy: { languages: ['Italian', 'English'], adzuna: 'it' },
  Poland: { languages: ['Polish', 'English'], adzuna: 'pl' },
  Belgium: { languages: ['Dutch', 'French', 'English'], adzuna: 'be' },
  Canada: { languages: ['English', 'French'], adzuna: 'ca' },
  Australia: { languages: ['English'], adzuna: 'au' },
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
