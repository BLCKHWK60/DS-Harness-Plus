/**
 * Readers for the sources scout_search supports. Each turns a source's answer into the same
 * shape, so results from different sources can be compared and merged:
 *   { source, ref, title, company, location, pay, posted (YYYY-MM-DD), type, remote, url, snippet, detail }
 * `detail` says how scout_posting reads the full text later. Only GET requests, only the
 * source's own public addresses.
 */
import { MARKETS } from './registry.js';
import { getJson, hooks, plainText } from './net.js';

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const day = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? clip(value, 10) : date.toISOString().slice(0, 10);
};
const money = (min, max, currency = '', per = '') => {
  const n = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)).toLocaleString('en-US') : '');
  const [low, high] = [n(min), n(max)];
  if (!low && !high) return '';
  const range = low && high && low !== high ? `${low}–${high}` : low || high;
  return [currency, range, per ? `per ${per}` : ''].filter(Boolean).join(' ');
};
/** The words of a query, for sources that do not search themselves. */
export function words(text) {
  return [...new Set(String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((word) => word.length >= 2))].slice(0, 12);
}
/** Whether a text matches the query: every word when there are few, most of them when there are many. */
export function matches(text, query) {
  const list = words(query);
  if (list.length === 0) return true;
  const hay = String(text ?? '').toLowerCase();
  const hits = list.filter((word) => hay.includes(word)).length;
  return list.length <= 2 ? hits === list.length : hits >= Math.ceil(list.length * 0.6);
}
const slugOk = (value) => /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(String(value ?? ''));
const need = (value, what) => {
  if (!String(value ?? '').trim()) throw new Error(`give ${what}`);
};

/** Notices that are no longer open. */
const SHUT = ['cancelled', 'unsuccessful', 'complete', 'withdrawn'];

/**
 * One public contract notice in the Open Contracting Data Standard (OCDS), as both UK services
 * publish them, in the shape of a posting. The contract's value is not pay, so it is kept apart.
 * @param {object} release - one OCDS release.
 * @param {(release: object) => string} link - the notice's public page.
 */
export function fromOcds(release, link) {
  const tender = release?.tender ?? {};
  const buyer = (release?.parties ?? []).find((party) => (party?.roles ?? []).includes('buyer')) ?? {};
  const address = buyer.address ?? {};
  const contact = buyer.contactPoint ?? {};
  const lots = (tender.lots ?? []).slice(0, 12).map((lot) => [lot?.title, lot?.description].filter(Boolean).map((part) => plainText(part)).join(': ')).filter(Boolean);
  const period = tender.contractPeriod ?? {};
  const length = period.startDate || period.endDate ? `${day(period.startDate) || '?'} to ${day(period.endDate) || '?'}` : period.durationInDays ? `${period.durationInDays} days` : '';
  return {
    ref: clip(release?.ocid ?? release?.id, 80),
    title: clip(tender.title, 200),
    company: clip(release?.buyer?.name ?? buyer.name, 120),
    location: [address.locality, address.countryName].filter(Boolean).map((part) => clip(part, 60)).join(', '),
    pay: '',
    value: tender.value?.amount ? money(tender.value.amount, 0, clip(tender.value.currency, 5)) : '',
    posted: day(tender.datePublished ?? release?.date),
    closes: day(tender.tenderPeriod?.endDate),
    status: clip(tender.status, 20),
    type: 'tender',
    remote: '',
    url: clip(link(release), 400),
    snippet: [tender.classification?.description, tender.mainProcurementCategory, tender.suitability?.sme ? 'suitable for small firms' : ''].filter(Boolean).map((part) => clip(part, 80)).join(' · '),
    text: [
      plainText(tender.description),
      release?.description ? plainText(release.description) : '',
      lots.length > 0 ? `Lots:\n${lots.map((lot) => `• ${lot}`).join('\n')}` : '',
      length ? `Contract period: ${length}` : '',
      tender.tenderPeriod?.endDate ? `Responses due: ${day(tender.tenderPeriod.endDate)}` : '',
      tender.submissionMethodDetails ? `How to respond: ${clip(plainText(tender.submissionMethodDetails), 300)}` : '',
      [contact.name, contact.email, contact.telephone, contact.url].some(Boolean) ? `Buyer's contact, as published: ${[contact.name, contact.email, contact.telephone, contact.url].filter(Boolean).map((part) => clip(part, 120)).join(' · ')}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 20_000),
    textFull: true,
  };
}

/**
 * A reader for a UK service's OCDS search: the newest tender notices in a time window (up to 5
 * pages of 100), the latest version of each, kept when they match the words asked for. The
 * services have no word search that answers to GET, so the matching is done here.
 */
function ocdsReader({ base, from, to, link }) {
  return {
    async search(want) {
      need(want.what, 'words from the work, matched against the notices\' titles and descriptions');
      const days = Math.min(30, Math.max(1, Math.round(Number(want.days) || 10)));
      const end = new Date(hooks.now());
      const start = new Date(end.getTime() - days * 86_400_000);
      const stamp = (date) => date.toISOString().slice(0, 19);
      let address = `${base}?${new URLSearchParams({ stages: 'tender', limit: '100', [from]: stamp(start), [to]: stamp(end) })}`;
      const found = [];
      for (let page = 0; page < 5 && address; page += 1) {
        const answer = await getJson(address);
        const list = Array.isArray(answer?.releases) ? answer.releases : [];
        found.push(...list);
        const next = String(answer?.links?.next ?? '');
        // Only the service's own next page is followed.
        address = list.length > 0 && next.startsWith(`${base}?`) ? next : '';
      }
      const latest = new Map();
      for (const release of found) {
        const id = release?.ocid ?? release?.id;
        const known = latest.get(id);
        if (id && (!known || String(release.date ?? '') > String(known.date ?? ''))) latest.set(id, release);
      }
      const today = new Date(hooks.now()).toISOString().slice(0, 10);
      const kept = [...latest.values()].map((release) => fromOcds(release, link))
        .filter((posting) => posting.ref && !SHUT.includes(posting.status) && (!posting.closes || posting.closes >= today)
          && matches(`${posting.title} ${posting.snippet} ${posting.text}`, want.what)
          && (!want.where || matches(`${posting.location} ${posting.text}`, want.where)));
      return { total: kept.length, read: latest.size, days, postings: kept.slice(0, 60) };
    },
    async detail(posting) {
      return posting.text || '(no text)';
    },
  };
}

/** SAM.gov's dates are written MM/dd/yyyy. */
const usDate = (date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;

/** Each reader: `search(want, key)` → postings; `detail(posting, key)` → full text. */
export const ADAPTERS = {
  // ---- Germany's public job exchange -----------------------------------------------------------
  ba: {
    async search(want) {
      need(want.what || want.where, 'what to search for or where');
      const base = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs';
      const query = new URLSearchParams({ size: String(Number(want.size) || 50), page: String(Math.max(1, Number(want.page) || 1)) });
      if (want.what) query.set('was', clip(want.what, 120));
      if (want.where) query.set('wo', clip(want.where, 80));
      if (want.where && Number(want.radius) > 0) query.set('umkreis', String(Math.min(200, Math.round(Number(want.radius)))));
      if (Number(want.days) > 0) query.set('veroeffentlichtseit', String(Math.min(100, Math.round(Number(want.days)))));
      const kind = { employee: '1', contract: '1', freelance: '2', internship: '34' }[want.workType];
      if (kind) query.set('angebotsart', kind);
      const answer = await getJson(`${base}?${query}`, { 'X-API-Key': 'jobboerse-jobsuche' });
      const list = Array.isArray(answer?.ergebnisliste) ? answer.ergebnisliste : [];
      return {
        total: Number(answer?.maxErgebnisse) || list.length,
        postings: list.map((item) => {
          const place = item.stellenlokationen?.[0]?.adresse ?? {};
          return {
            ref: clip(item.referenznummer, 60),
            title: clip(item.stellenangebotsTitel, 200),
            company: clip(item.firma, 120),
            location: [place.ort, place.region && place.region !== String(place.ort ?? '').toUpperCase() ? place.region : ''].filter(Boolean).map((part) => clip(part, 60)).join(', '),
            pay: item.verguetungsangabe && !/KEINE/.test(item.verguetungsangabe) ? clip(item.verguetungsangabe, 80) : '',
            posted: day(item.veroeffentlichungszeitraum?.von || item.aenderungsdatum),
            firstPosted: day(item.datumErsteVeroeffentlichung),
            type: { ARBEIT: 'employee', SELBSTAENDIGKEIT: 'freelance', AUSBILDUNG: 'training', PRAKTIKUM_TRAINEE: 'internship' }[item.stellenangebotsart] ?? clip(item.stellenangebotsart, 30).toLowerCase(),
            remote: item.homeofficemoeglich === true ? 'home office possible' : '',
            url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(item.referenznummer ?? '')}`,
            snippet: clip(item.hauptberuf, 120),
          };
        }).filter((posting) => posting.ref),
      };
    },
    async detail(posting) {
      const code = Buffer.from(posting.ref).toString('base64');
      const answer = await getJson(`https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/${encodeURIComponent(code)}`, { 'X-API-Key': 'jobboerse-jobsuche' });
      const parts = [
        answer?.stellenangebotsBeschreibung ? plainText(answer.stellenangebotsBeschreibung) : '',
        answer?.vertragsdauer && !/KEINE/.test(answer.vertragsdauer) ? `Contract: ${answer.vertragsdauer}` : '',
        answer?.eintrittszeitraum?.von ? `Start: ${answer.eintrittszeitraum.von}` : '',
        answer?.allianzpartnerName ? `Posted through: ${clip(answer.allianzpartnerName, 80)}${answer.allianzpartnerUrl ? ` (${clip(answer.allianzpartnerUrl, 200)})` : ''}` : '',
      ];
      return parts.filter(Boolean).join('\n\n');
    },
  },

  // ---- Arbeitnow: the newest postings, filtered here -------------------------------------------
  arbeitnow: {
    async search(want) {
      const pages = Math.min(3, Math.max(1, Number(want.page) || 3));
      const found = [];
      for (let page = 1; page <= pages; page += 1) {
        const answer = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
        const list = Array.isArray(answer?.data) ? answer.data : [];
        found.push(...list);
        if (list.length === 0 || !answer?.links?.next) break;
      }
      const since = Number(want.days) > 0 ? Date.now() - Number(want.days) * 86_400_000 : 0;
      const kept = found.filter((item) => matches(`${item.title} ${(item.tags ?? []).join(' ')}`, want.what)
        && (!want.where || matches(`${item.location} ${item.remote ? 'remote' : ''}`, want.where))
        && (!since || Number(item.created_at) * 1000 >= since));
      return {
        total: kept.length,
        postings: kept.slice(0, 60).map((item) => ({
          ref: clip(item.slug, 200),
          title: clip(item.title, 200),
          company: clip(item.company_name, 120),
          location: clip(item.location, 100),
          pay: '',
          posted: day(item.created_at),
          type: (item.job_types ?? []).map((type) => clip(type, 30)).join(', '),
          remote: item.remote === true ? 'remote' : '',
          url: clip(item.url, 400),
          snippet: (item.tags ?? []).slice(0, 5).map((tag) => clip(tag, 40)).join(', '),
          text: plainText(item.description).slice(0, 20_000),
          textFull: true,
        })),
      };
    },
    async detail(posting) {
      return posting.text || 'The text of this posting was not kept. Search Arbeitnow again to get it.';
    },
  },

  // ---- Adzuna: many boards, many markets (key) -------------------------------------------------
  adzuna: {
    async search(want, key) {
      const [id, secret] = String(key ?? '').split(':');
      if (!id || !secret) throw new Error('the Adzuna key must be entered as APP_ID:APP_KEY in Settings → Scout');
      const country = MARKETS[want.market]?.adzuna;
      if (!country) throw new Error(`Adzuna has no data for ${want.market || 'that market'}; give one of: ${Object.entries(MARKETS).filter(([, m]) => m.adzuna).map(([name]) => name).join(', ')}`);
      need(want.what, 'what to search for');
      const query = new URLSearchParams({ app_id: id, app_key: secret, results_per_page: String(Number(want.size) || 50), what: clip(want.what, 120), 'content-type': 'application/json' });
      if (want.where) query.set('where', clip(want.where, 80));
      if (want.where && Number(want.radius) > 0) query.set('distance', String(Math.min(200, Math.round(Number(want.radius)))));
      if (Number(want.days) > 0) query.set('max_days_old', String(Math.round(Number(want.days))));
      if (want.workType === 'contract') query.set('contract', '1');
      if (want.workType === 'employee') query.set('permanent', '1');
      const answer = await getJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/${Math.max(1, Number(want.page) || 1)}?${query}`);
      const list = Array.isArray(answer?.results) ? answer.results : [];
      return {
        total: Number(answer?.count) || list.length,
        postings: list.map((item) => {
          // Adzuna gives bare numbers; the market says which currency, so scout_pay can count them.
          const pay = money(item.salary_min, item.salary_max, MARKETS[want.market]?.currency);
          return {
            ref: clip(item.id, 40),
            title: plainText(item.title).slice(0, 200),
            company: clip(item.company?.display_name, 120),
            location: clip(item.location?.display_name, 100),
            pay: `${pay}${pay && item.salary_is_predicted === '1' ? ' (estimated by Adzuna)' : ''}`,
            posted: day(item.created),
            type: [item.contract_type, item.contract_time].filter(Boolean).map((part) => clip(part, 20)).join(', '),
            remote: '',
            url: clip(item.redirect_url, 400),
            snippet: '',
            text: plainText(item.description).slice(0, 2000),
          };
        }),
      };
    },
    async detail(posting) {
      return `${posting.text || '(no text)'}\n\nAdzuna gives only this short extract. The full posting is on the board it came from: ${posting.url}`;
    },
    /** Only a short extract: the checks on the text say so, and do not judge its length. */
    extract: () => true,
  },

  // ---- USAJOBS (key) ---------------------------------------------------------------------------
  usajobs: {
    async search(want, key) {
      const at = String(key ?? '').indexOf(':');
      const [email, secret] = at > 0 ? [String(key).slice(0, at), String(key).slice(at + 1)] : ['', ''];
      if (!email.includes('@') || !secret) throw new Error('the USAJOBS key must be entered as EMAIL:KEY in Settings → Scout');
      const query = new URLSearchParams({ ResultsPerPage: String(Number(want.size) || 50), Page: String(Math.max(1, Number(want.page) || 1)) });
      if (want.what) query.set('Keyword', clip(want.what, 120));
      if (want.where) query.set('LocationName', clip(want.where, 80));
      if (want.where && Number(want.radius) > 0) query.set('Radius', String(Math.min(200, Math.round(Number(want.radius)))));
      if (Number(want.days) > 0) query.set('DatePosted', String(Math.min(60, Math.round(Number(want.days)))));
      const answer = await getJson(`https://data.usajobs.gov/api/search?${query}`, { 'User-Agent': email, 'Authorization-Key': secret });
      const list = Array.isArray(answer?.SearchResult?.SearchResultItems) ? answer.SearchResult.SearchResultItems : [];
      return {
        total: Number(answer?.SearchResult?.SearchResultCountAll) || list.length,
        postings: list.map((entry) => {
          const item = entry?.MatchedObjectDescriptor ?? {};
          const pay = item.PositionRemuneration?.[0] ?? {};
          return {
            ref: clip(entry?.MatchedObjectId ?? item.PositionID, 40),
            title: clip(item.PositionTitle, 200),
            company: [item.OrganizationName, item.DepartmentName].filter(Boolean).map((part) => clip(part, 80)).join(', '),
            location: clip(item.PositionLocationDisplay, 120),
            pay: money(pay.MinimumRange, pay.MaximumRange, 'USD', ({ PA: 'year', PH: 'hour' })[pay.RateIntervalCode] ?? ''),
            posted: day(item.PublicationStartDate),
            type: (item.PositionSchedule ?? []).map((part) => clip(part?.Name, 30)).join(', '),
            remote: item.UserArea?.Details?.RemoteIndicator === true ? 'remote' : '',
            url: clip(item.PositionURI, 400),
            snippet: clip(item.QualificationSummary, 160),
            text: [item.UserArea?.Details?.JobSummary, item.QualificationSummary, (item.UserArea?.Details?.MajorDuties ?? []).join('\n'), item.ApplicationCloseDate ? `Closes: ${day(item.ApplicationCloseDate)}` : ''].filter(Boolean).map((part) => plainText(part)).join('\n\n').slice(0, 20_000),
            textFull: true,
            closes: day(item.ApplicationCloseDate),
          };
        }),
      };
    },
    async detail(posting) {
      return posting.text || 'The text of this posting was not kept. Search USAJOBS again to get it.';
    },
  },

  // ---- Reed (key) ------------------------------------------------------------------------------
  reed: {
    async search(want, key) {
      if (!key) throw new Error('Reed needs its key in Settings → Scout');
      const query = new URLSearchParams({ resultsToTake: String(Number(want.size) || 50), resultsToSkip: String((Math.max(1, Number(want.page) || 1) - 1) * 50) });
      if (want.what) query.set('keywords', clip(want.what, 120));
      if (want.where) query.set('locationName', clip(want.where, 80));
      if (want.where && Number(want.radius) > 0) query.set('distanceFromLocation', String(Math.min(100, Math.round(Number(want.radius) * 0.62))));
      if (want.workType === 'contract') query.set('contract', 'true');
      if (want.workType === 'employee') query.set('permanent', 'true');
      const auth = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
      const answer = await getJson(`https://www.reed.co.uk/api/1.0/search?${query}`, auth);
      const list = Array.isArray(answer?.results) ? answer.results : [];
      const date = (text) => {
        const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text ?? ''));
        return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : day(text);
      };
      const since = Number(want.days) > 0 ? Date.now() - Number(want.days) * 86_400_000 : 0;
      const postings = list.map((item) => ({
        ref: clip(item.jobId, 30),
        title: clip(item.jobTitle, 200),
        company: clip(item.employerName, 120),
        location: clip(item.locationName, 100),
        pay: money(item.minimumSalary, item.maximumSalary, clip(item.currency, 5)),
        posted: date(item.date),
        type: '',
        remote: '',
        url: clip(item.jobUrl, 400),
        snippet: '',
        text: plainText(item.jobDescription).slice(0, 2000),
      })).filter((posting) => !since || !posting.posted || Date.parse(posting.posted) >= since);
      return { total: Number(answer?.totalResults) || list.length, postings };
    },
    async detail(posting, key) {
      const auth = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
      const answer = await getJson(`https://www.reed.co.uk/api/1.0/jobs/${encodeURIComponent(posting.ref)}`, auth);
      return [plainText(answer?.jobDescription), answer?.contractType ? `Contract: ${clip(answer.contractType, 40)}` : '', answer?.expirationDate ? `Closes: ${clip(answer.expirationDate, 12)}` : ''].filter(Boolean).join('\n\n') || posting.text || '(no text)';
    },
  },

  // ---- Hacker News hiring threads ------------------------------------------------------------
  hn: {
    async search(want) {
      need(want.what, 'what to search for');
      const threads = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=12');
      const freelance = want.workType === 'freelance';
      const pick = (threads?.hits ?? []).find((hit) => (freelance ? /freelancer\?/i : /who is hiring\?/i).test(String(hit?.title ?? '')));
      if (!pick) throw new Error('the latest hiring thread could not be found');
      const query = new URLSearchParams({ tags: `comment,story_${pick.objectID}`, query: clip([want.what, want.where].filter(Boolean).join(' '), 150), hitsPerPage: '60' });
      const answer = await getJson(`https://hn.algolia.com/api/v1/search?${query}`);
      // Only the posts themselves, not the replies to them.
      const posts = (answer?.hits ?? []).filter((hit) => String(hit?.parent_id) === String(pick.objectID));
      return {
        total: posts.length,
        thread: `${clip(pick.title, 120)} (${day(pick.created_at)})`,
        postings: posts.map((hit) => {
          const text = plainText(hit.comment_text);
          const head = text.split('\n')[0];
          const fields = head.split('|').map((part) => clip(part, 80));
          return {
            ref: clip(hit.objectID, 20),
            title: clip(fields.length > 1 ? fields.slice(1, 3).join(' | ') : head, 200),
            company: fields.length > 1 ? fields[0] : '',
            location: clip(fields.slice(2).find((part) => /remote|onsite|hybrid|,/i.test(part)) ?? '', 100),
            pay: clip(/[$€£]\s?\d[\d,.]*\s?[kK]?(\s?[-–]\s?[$€£]?\s?\d[\d,.]*\s?[kK]?)?/.exec(text)?.[0] ?? '', 40),
            posted: day(hit.created_at),
            type: freelance ? 'freelance' : '',
            remote: /\bremote\b/i.test(head) ? 'remote' : '',
            url: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`,
            snippet: '',
            text: text.slice(0, 20_000),
            textFull: true,
          };
        }),
      };
    },
    async detail(posting) {
      return posting.text || '(no text)';
    },
  },

  // ---- Company boards: Greenhouse, Lever, Ashby -----------------------------------------------
  greenhouse: {
    async search(want) {
      if (!slugOk(want.company)) throw new Error('give the company\'s Greenhouse board name, as in boards.greenhouse.io/NAME');
      const answer = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(want.company)}/jobs`);
      const list = (Array.isArray(answer?.jobs) ? answer.jobs : []).filter((job) => matches(job.title, want.what) && (!want.where || matches(job.location?.name, want.where)));
      return {
        total: list.length,
        postings: list.slice(0, 60).map((job) => ({
          ref: `${want.company}/${job.id}`,
          title: clip(job.title, 200),
          company: clip(job.company_name ?? want.company, 120),
          location: clip(job.location?.name, 120),
          pay: '',
          posted: day(job.first_published ?? job.updated_at),
          type: '',
          remote: /remote/i.test(job.location?.name ?? '') ? 'remote' : '',
          url: clip(job.absolute_url, 400),
          snippet: '',
        })),
      };
    },
    async detail(posting) {
      const [board, id] = posting.ref.split('/');
      const answer = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}?pay_transparency=true`);
      const pay = (answer?.pay_input_ranges ?? []).map((range) => `${clip(range.title, 60)}: ${money(Number(range.min_cents) / 100, Number(range.max_cents) / 100, clip(range.currency_type, 5))}`).join('; ');
      return [plainText(answer?.content), pay ? `Pay: ${pay}` : ''].filter(Boolean).join('\n\n') || '(no text)';
    },
  },
  lever: {
    async search(want) {
      if (!slugOk(want.company)) throw new Error('give the company\'s Lever board name, as in jobs.lever.co/NAME');
      let answer;
      try {
        answer = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(want.company)}?mode=json`);
      } catch (error) {
        // Companies on Lever's European service have their board there.
        if (!/404/.test(String(error?.message))) throw error;
        answer = await getJson(`https://api.eu.lever.co/v0/postings/${encodeURIComponent(want.company)}?mode=json`);
      }
      const list = (Array.isArray(answer) ? answer : []).filter((job) => matches(`${job.text} ${job.categories?.team ?? ''}`, want.what) && (!want.where || matches(`${job.categories?.location ?? ''} ${(job.categories?.allLocations ?? []).join(' ')} ${job.workplaceType ?? ''}`, want.where)));
      return {
        total: list.length,
        postings: list.slice(0, 60).map((job) => ({
          ref: `${want.company}/${job.id}`,
          title: clip(job.text, 200),
          company: want.company,
          location: clip(job.categories?.location, 120),
          pay: job.salaryRange ? money(job.salaryRange.min, job.salaryRange.max, clip(job.salaryRange.currency, 5), clip(String(job.salaryRange.interval ?? '').replace(/^per-/, ''), 10)) : '',
          posted: day(job.createdAt),
          type: clip(job.categories?.commitment, 40),
          remote: job.workplaceType === 'remote' ? 'remote' : '',
          url: clip(job.hostedUrl, 400),
          snippet: clip(job.categories?.team, 80),
          text: [job.descriptionPlain, ...(job.lists ?? []).map((list) => `${clip(list.text, 80)}\n${plainText(list.content)}`), job.additionalPlain].filter(Boolean).join('\n\n').slice(0, 20_000),
          textFull: true,
        })),
      };
    },
    async detail(posting) {
      return posting.text || '(no text)';
    },
  },
  ashby: {
    async search(want) {
      if (!slugOk(want.company)) throw new Error('give the company\'s Ashby board name, as in jobs.ashbyhq.com/NAME');
      const answer = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(want.company)}?includeCompensation=true`);
      const list = (Array.isArray(answer?.jobs) ? answer.jobs : []).filter((job) => job.isListed !== false && matches(`${job.title} ${job.department ?? ''} ${job.team ?? ''}`, want.what)
        && (!want.where || matches(`${job.location ?? ''} ${(job.secondaryLocations ?? []).map((place) => place?.location ?? '').join(' ')} ${job.isRemote ? 'remote' : ''}`, want.where)));
      return {
        total: list.length,
        postings: list.slice(0, 60).map((job) => ({
          ref: `${want.company}/${job.id}`,
          title: clip(job.title, 200),
          company: want.company,
          location: clip(job.location, 120),
          pay: clip(job.compensation?.scrapeableCompensationSalarySummary ?? job.compensation?.compensationTierSummary ?? '', 100),
          posted: day(job.publishedAt),
          type: clip(job.employmentType, 30),
          remote: job.isRemote ? 'remote' : clip(job.workplaceType, 20),
          url: clip(job.jobUrl, 400),
          snippet: clip(job.department, 80),
          text: String(job.descriptionPlain ?? plainText(job.descriptionHtml)).slice(0, 20_000),
          textFull: true,
        })),
      };
    },
    async detail(posting) {
      return posting.text || '(no text)';
    },
  },

  // ---- Public tenders: UK (open data, no key) and US federal (SAM.gov, key) -------------------
  contractsfinder: ocdsReader({
    base: 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',
    from: 'publishedFrom',
    to: 'publishedTo',
    link: (release) => {
      const notice = (release?.tender?.documents ?? []).find((document) => document?.documentType === 'tenderNotice' && /^https:\/\/www\.contractsfinder\.service\.gov\.uk\//.test(String(document.url ?? '')));
      return notice?.url ?? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(String(release?.id ?? '').slice(0, 36))}`;
    },
  }),
  findatender: ocdsReader({
    base: 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
    from: 'updatedFrom',
    to: 'updatedTo',
    link: (release) => `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(String(release?.id ?? ''))}`,
  }),
  sam: {
    async search(want, key) {
      if (!key) throw new Error('SAM.gov needs its key in Settings → Scout');
      need(want.what, 'words from the opportunity\'s title');
      const days = Math.min(365, Math.max(1, Math.round(Number(want.days) || 30)));
      const end = new Date(hooks.now());
      const start = new Date(end.getTime() - days * 86_400_000);
      const page = Math.max(1, Number(want.page) || 1);
      // SAM.gov takes its key only in the address. It is never shown: errors name the service alone.
      const query = new URLSearchParams({ api_key: key, postedFrom: usDate(start), postedTo: usDate(end), limit: '50', offset: String((page - 1) * 50), title: clip(want.what, 120) });
      // Solicitations, combined synopses, presolicitations and sources sought: work that can still be bid for.
      for (const type of ['o', 'k', 'p', 'r']) query.append('ptype', type);
      const state = /^[A-Za-z]{2}$/.test(String(want.where ?? '').trim()) ? String(want.where).trim().toUpperCase() : '';
      if (state) query.set('state', state);
      let answer;
      try {
        answer = await getJson(`https://api.sam.gov/opportunities/v2/search?${query}`);
      } catch (error) {
        // SAM.gov answers 404 when nothing matches.
        if (/status 404/.test(String(error?.message))) return { total: 0, postings: [] };
        throw error;
      }
      const list = Array.isArray(answer?.opportunitiesData) ? answer.opportunitiesData : [];
      const postings = list.map((item) => {
        const place = item?.placeOfPerformance ?? {};
        const contacts = (Array.isArray(item?.pointOfContact) ? item.pointOfContact : []).filter(Boolean)
          .map((person) => [person.title, person.fullName, person.email, person.phone].filter(Boolean).map((part) => clip(part, 80)).join(', ')).filter(Boolean);
        const description = String(item?.description ?? '');
        return {
          ref: clip(item?.noticeId, 60),
          title: clip(item?.title, 200),
          company: String(item?.fullParentPathName ?? item?.department ?? '').split('.').map((part) => clip(part, 80)).filter(Boolean).slice(-2).join(', '),
          location: [place.city?.name, place.state?.code ?? place.state?.name].filter(Boolean).map((part) => clip(part, 60)).join(', '),
          pay: '',
          value: '',
          posted: day(item?.postedDate),
          closes: day(item?.responseDeadLine),
          type: 'tender',
          remote: '',
          url: `https://sam.gov/opp/${encodeURIComponent(String(item?.noticeId ?? ''))}/view`,
          snippet: [item?.type, item?.typeOfSetAsideDescription, item?.naicsCode ? `NAICS ${item.naicsCode}` : ''].filter(Boolean).map((part) => clip(part, 80)).join(' · '),
          descUrl: /^https:\/\/api\.sam\.gov\//.test(description) ? clip(description, 300) : '',
          text: [
            item?.type ? `Notice type: ${clip(item.type, 60)}` : '',
            item?.solicitationNumber ? `Solicitation number: ${clip(item.solicitationNumber, 60)}` : '',
            item?.typeOfSetAsideDescription ? `Set aside for: ${clip(item.typeOfSetAsideDescription, 120)}` : '',
            item?.responseDeadLine ? `Responses due: ${day(item.responseDeadLine)}` : '',
            contacts.length > 0 ? `Contacts, as published: ${contacts.join('; ')}` : '',
          ].filter(Boolean).join('\n'),
        };
      }).filter((posting) => posting.ref && (!want.where || state || matches(posting.location, want.where)));
      return { total: Number(answer?.totalRecords) || list.length, postings };
    },
    async detail(posting, key) {
      const parts = [posting.text];
      if (posting.descUrl && key) {
        try {
          const address = new URL(posting.descUrl);
          if (address.hostname !== 'api.sam.gov') throw new Error('not SAM.gov');
          address.searchParams.set('api_key', key);
          const answer = await getJson(address.href);
          const text = typeof answer?.description === 'string' ? plainText(answer.description) : '';
          if (text) parts.unshift(text.slice(0, 25_000));
        } catch (error) {
          parts.push(`The full description could not be read (${clip(error?.message ?? error, 120)}). It is on the notice's page.`);
        }
      }
      return parts.filter(Boolean).join('\n\n') || '(no text)';
    },
    /** Without its description, a notice is only its details: not a full text. */
    extract: (body) => String(body ?? '').startsWith('Notice type:'),
  },
};
