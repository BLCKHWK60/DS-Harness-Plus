/**
 * Research before searching: which titles name the work in each language (ESCO, the EU's list of
 * occupations and skills), how many live postings each title has in a market (demand), and what
 * the work pays (pay given in postings found in this conversation, and Adzuna's pay statistics).
 */
import { ADAPTERS } from './adapters.js';
import { MARKETS } from './registry.js';
import { getJson } from './net.js';

const ESCO = 'https://ec.europa.eu/esco/api';
/** Languages by name, as ESCO codes them. */
export const LANG = { English: 'en', German: 'de', Spanish: 'es', French: 'fr', Dutch: 'nl', Italian: 'it', Polish: 'pl', Portuguese: 'pt' };
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const labels = (value) => (Array.isArray(value) ? value : value ? [value] : []).map((label) => clip(label, 100)).filter(Boolean);

/**
 * Occupations in ESCO that match a title, with their names in each language and their skills.
 * @param {string} title - the work, in any of ESCO's languages.
 * @param {{languages?: string[], from?: string}} options - language names to show; the title's language.
 * @returns {Promise<string>} plain text for the model.
 */
export async function titles(title, { languages = ['English'], from = 'English' } = {}) {
  const text = clip(title, 120);
  if (text.length < 2) throw new Error('give the work to look up');
  const fromCode = LANG[from] ?? 'en';
  const query = new URLSearchParams({ text, language: fromCode, type: 'occupation', limit: '4', full: 'false' });
  const found = await getJson(`${ESCO}/search?${query}`);
  const hits = Array.isArray(found?._embedded?.results) ? found._embedded.results : [];
  if (hits.length === 0) return `ESCO has no occupation matching "${text}"${fromCode !== 'en' ? ` in ${from}; try the English title` : ''}.`;
  const codes = [...new Set(['en', ...languages.map((name) => LANG[name]).filter(Boolean)])];
  const blocks = [];
  for (const hit of hits.slice(0, 3)) {
    const occupation = await getJson(`${ESCO}/resource/occupation?${new URLSearchParams({ uri: hit.uri, language: 'en' })}`);
    const names = codes.map((code) => {
      const preferred = labels(occupation?.preferredLabel?.[code]);
      const other = labels(occupation?.alternativeLabel?.[code]).filter((label) => !preferred.includes(label)).slice(0, 12);
      return `  ${Object.keys(LANG).find((name) => LANG[name] === code)}: ${preferred.join(' / ') || '(none)'}${other.length ? `; also: ${other.join(', ')}` : ''}`;
    });
    const essential = (occupation?._links?.hasEssentialSkill ?? []).map((skill) => clip(skill.title, 80)).slice(0, 20);
    const optional = (occupation?._links?.hasOptionalSkill ?? []).map((skill) => clip(skill.title, 80)).slice(0, 12);
    const isco = occupation?._links?.broaderIscoGroup?.[0];
    blocks.push([
      `- ${clip(occupation?.preferredLabel?.en ?? hit.title, 100)} (ESCO ${clip(occupation?.code, 20)}${isco ? `, ISCO ${clip(isco.code, 8)} ${clip(isco.title, 80)}` : ''}; matched on "${clip(hit.searchHit, 80)}")`,
      ...names,
      essential.length ? `  Essential skills: ${essential.join('; ')}` : '',
      optional.length ? `  Optional skills (some): ${optional.join('; ')}` : '',
      `  ${occupation?._links?.self?.href ? clip(occupation._links.self.href, 300) : clip(hit.uri, 200)}`,
    ].filter(Boolean).join('\n'));
  }
  return [
    `ESCO occupations for "${text}" (the EU's official list; names are the official and common ones, not always the words used in job ads; check them against live postings with scout_demand):`,
    ...blocks,
  ].join('\n');
}

/** Sources that report how many postings match, with how to ask for a count. */
const COUNTERS = {
  ba: (market) => market === 'Germany',
  adzuna: (market) => Boolean(MARKETS[market]?.adzuna),
  reed: (market) => market === 'UK',
  usajobs: (market) => market === 'USA',
};

/**
 * Live postings per title in one market: which words employers actually use, and how much demand there is.
 * @param {object} input - `titles`, `market`, `where`, `days`, and `registry`, `keyOf`, `hasKey`, `request` from the tools.
 * @returns {Promise<string>} a small table as text.
 */
export async function demand({ titles: list, market, where, days, registry, keyOf, hasKey, request }) {
  const wanted = [...new Set((Array.isArray(list) ? list : []).map((title) => clip(title, 80)).filter(Boolean))].slice(0, 8);
  if (wanted.length === 0) throw new Error('give one or more titles to compare');
  if (!market) throw new Error('give the market');
  const sources = registry.filter((source) => source.on && !source.hidden && COUNTERS[source.id]?.(market) && (source.key !== 'required' || hasKey(source.id)));
  if (sources.length === 0) {
    const missing = Object.keys(COUNTERS).filter((id) => COUNTERS[id](market)).map((id) => registry.find((source) => source.id === id)?.name ?? id);
    return `No source that counts postings is ready for ${market}.${missing.length ? ` ${missing.join(', ')} would (${missing.length === 1 ? 'it needs' : 'they need'} a free key in Settings → Scout).` : ''} Compare titles with web_search instead and say the counts are rough.`;
  }
  const rows = [];
  for (const title of wanted) {
    const cells = [];
    for (const source of sources) {
      try {
        request();
        const key = source.key === 'required' ? await keyOf(source.id) : '';
        const found = await ADAPTERS[source.adapter].search({ what: title, where, days, market, size: 1 }, key);
        cells.push(`${source.name}: ${Number(found.total ?? 0).toLocaleString('en-US')}`);
      } catch (error) {
        cells.push(`${source.name}: not available (${clip(error?.message ?? error, 80)})`);
      }
    }
    rows.push(`- "${title}": ${cells.join(' · ')}`);
  }
  return [
    `Live postings in ${market}${where ? `, ${clip(where, 60)}` : ''}${days ? `, last ${days} days` : ''}, by title (each source counts its own way; compare titles within one source):`,
    ...rows,
    'A title with many postings is the word employers use; one with few may still find less crowded openings.',
  ].join('\n');
}

/** A pay text read as numbers: currency, low, high, period. Rough by design. */
export function readPay(text) {
  const value = String(text ?? '');
  if (!value) return undefined;
  const currency = /€|EUR/i.test(value) ? 'EUR' : /£|GBP/i.test(value) ? 'GBP' : /\$|USD/i.test(value) ? 'USD' : '';
  const numbers = [...value.matchAll(/(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s*([kK])?/g)]
    .map((match) => Number(match[1].replace(/[,.](?=\d{3}\b)/g, '')) * (match[2] ? 1000 : 1))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (numbers.length === 0) return undefined;
  const per = /hour|stunde|hora|\/h\b/i.test(value) ? 'hour' : /day|tag|día|dia\b/i.test(value) ? 'day' : /month|monat|mes\b/i.test(value) ? 'month' : 'year';
  const plausible = numbers.filter((n) => (per === 'year' ? n >= 5000 : per === 'month' ? n >= 300 : n >= 5));
  if (plausible.length === 0) return undefined;
  return { currency, low: Math.min(...plausible.slice(0, 2)), high: Math.max(...plausible.slice(0, 2)), per };
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (n) => Math.round(n).toLocaleString('en-US');

/** What postings found in this conversation pay, summed up per currency and period. */
export function payFromPostings(postings, filter = '') {
  const groups = new Map();
  for (const posting of postings) {
    if (filter && !`${posting.title} ${posting.location}`.toLowerCase().includes(filter.toLowerCase())) continue;
    const pay = readPay(posting.pay);
    if (!pay || !pay.currency) continue;
    const key = `${pay.currency} per ${pay.per}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ mid: (pay.low + pay.high) / 2, posting });
  }
  if (groups.size === 0) return '';
  return [...groups.entries()].map(([key, list]) => {
    const mids = list.map((item) => item.mid);
    return `- ${key}: ${list.length} posting${list.length === 1 ? '' : 's'}; middle of the ranges from ${round(Math.min(...mids))} to ${round(Math.max(...mids))}, median ${round(median(mids))} (${list.slice(0, 8).map((item) => `P${item.posting.n}`).join(', ')}${list.length > 8 ? ', …' : ''})`;
  }).join('\n');
}

/**
 * Adzuna's pay statistics for a title across a whole market: the spread of advertised yearly pay.
 * @returns {Promise<string>} text, or '' when Adzuna is not ready.
 */
export async function adzunaPay({ market, what, key }) {
  const [id, secret] = String(key ?? '').split(':');
  const country = MARKETS[market]?.adzuna;
  if (!id || !secret || !country) return '';
  const base = new URLSearchParams({ app_id: id, app_key: secret, what: clip(what, 120), 'content-type': 'application/json' });
  const lines = [];
  try {
    const spread = await getJson(`https://api.adzuna.com/v1/api/jobs/${country}/histogram?${base}`);
    const bands = Object.entries(spread?.histogram ?? {}).map(([from, count]) => [Number(from), Number(count)]).filter(([from, count]) => Number.isFinite(from) && count > 0).sort((a, b) => a[0] - b[0]);
    const total = bands.reduce((sum, [, count]) => sum + count, 0);
    if (total > 0) {
      let seen = 0;
      const at = (share) => bands.find(([, count]) => (seen += count) >= total * share)?.[0];
      const q1 = at(0.25);
      seen = 0;
      const q2 = at(0.5);
      seen = 0;
      const q3 = at(0.75);
      lines.push(`- Adzuna, advertised yearly pay of ${total.toLocaleString('en-US')} postings across ${market}: lower quarter from ${round(q1)}, middle from ${round(q2)}, upper quarter from ${round(q3)} (bands, local currency).`);
    }
  } catch (error) {
    lines.push(`- Adzuna pay spread not available: ${clip(error?.message ?? error, 100)}`);
  }
  return lines.join('\n');
}

/** Where official pay figures can be read one page at a time, per market. */
export const PAY_PAGES = {
  USA: 'O*NET OnLine (onetonline.org): each occupation\'s page has US median wages; the BLS occupational pages (bls.gov/oes) too.',
  UK: 'IT Jobs Watch (itjobswatch.co.uk) for tech titles and skills: median pay and its trend; ONS ASHE tables for other work.',
  Germany: 'The Bundesagentur\'s Entgeltatlas (web.arbeitsagentur.de/entgeltatlas) shows median pay per occupation; Destatis for averages.',
  Spain: 'INE (ine.es) publishes pay by occupation group; salary surveys of recruiters (Hays, Michael Page, Robert Walters) are widely used.',
};
