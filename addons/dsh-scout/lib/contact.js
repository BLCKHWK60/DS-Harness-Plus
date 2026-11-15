/**
 * Contact details in text: email addresses and phone numbers. Used two ways:
 *   - the guard that refuses any Scout search carrying an email address or a phone number, so the
 *     user's contact details never go to a search engine or a job source;
 *   - the checks on a posting's text (a contact address that is personal, or a messaging app).
 * Rough by design, and tuned to leave dates, pay ranges, posting numbers and codes alone.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Not the thousands of an amount written with spaces: a group of exactly 3 digits from 0, right
 * after a group of 1 to 3 digits and a space, then only more groups of exactly 3 digits, up to a
 * range dash, a currency or the end of the number, as in "45 000-55 000 €" and "1 000 000". Only
 * that shape: "00" and a country code (0044, 0049) or a trunk group (0151, 07700) after a house or
 * room number are still a phone number's ("Room 101 0044 20 7946 0958", "Musterweg 3 0151 2345
 * 6789"), and so is a trunk group followed by groups that are not all 3 digits long ("Office 2 030
 * 123 456 78", "Zimmer 12 030 123 45 67").
 */
const NOT_THOUSANDS = String.raw`(?!(?<=(?<![\w.,])\d{1,3}\s)0\d{2}(?:\s\d{3})*(?:\s?[-–—/]|\s?(?:€|\$|£|(?:EUR|USD|GBP|euros?)\b)|(?!\s?\d)))`;

/**
 * Phone number shapes:
 *   - international, from "+" or "00": +49 151 2345678, +1 (555) 123-4567, 0044 20 7946 0958,
 *     also with dotted or comma groups: +34 612.345.678, +49 151 234,567;
 *   - US style: (555) 123-4567, 555-123-4567, 555.123.4567;
 *   - national from 0 with gaps: 030 12345678, 0151 2345 6789, 020 7946 0958, 07700 900123;
 *   - Spanish style: 612 345 678, 612 34 56 78, 91 123 45 67, 612.345.678, 612-345-678;
 *   - a run of digits from 0: 07700900123.
 */
const PHONES = [
  new RegExp(String.raw`(?:\+|${NOT_THOUSANDS}\b00)[1-9]\d{0,3}(?:[\s.\-/]{0,2}\(?\d{1,5}\)?|,\d{3}(?!\d)){2,6}`, 'g'),
  /(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
  new RegExp(String.raw`${NOT_THOUSANDS}\b0\d{1,4}[\s.\-/]\d{2,8}(?:[\s.-]\d{2,5}){0,3}\b`, 'g'),
  /\b[6-9]\d{2}\s\d{3}\s\d{3}\b|\b[6-9]\d{2}(?:\s\d{2}){3}\b|\b9\d\s\d{3}\s\d{2}\s\d{2}\b/g,
  /(?<![\w.,-])[6-9]\d{2}([.-])\d{3}\1\d{3}(?!\w|[.,-]\d)/g,
  new RegExp(String.raw`${NOT_THOUSANDS}\b0\d{9,11}\b`, 'g'),
];
/**
 * Bare runs of digits that are phone numbers in free text, but too often reference numbers in a
 * web address: a Spanish mobile or landline (612345678) and a US number (2025550100). Not part of
 * a longer code (10000-1201234567-S, /jobs/612345678).
 */
const BARE_PHONES = [
  /(?<![\w./-])[6-9]\d{8}(?![\w-])/g,
  /(?<![\w./-])[2-9]\d{2}[2-9]\d{6}(?![\w-])/g,
];
const DATE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/;
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const YEAR = '(?:19|20)\\d{2}';
/** Whole dates (14.11.2026, 11/14/2026, 2026-11-14), wherever they stand, as in 01.10.2026-31.03.2027. */
const DATES = new RegExp(`(?<!\\d)(?:${DAY}[./-]${DAY}[./-]${YEAR}|${YEAR}[./-]${DAY}[./-]${DAY})(?!\\d)`, 'g');
/**
 * What stands before a phone number's own groups: an international prefix ("+" or "00" and 1 to 4
 * digits, then any groups: +34, 0034, +49 151) or a trunk group from 0 (07700, 030/), each
 * starting where no number goes on before it.
 */
const PREFIX = String.raw`(?:(?<![\w+])\+|(?<![\w.,])00)[1-9][\d\s.\-/()]{0,24}|(?<![\w.,])0[1-9]\d{0,3}[\s.\-/()]{1,2}`;
/** An amount with thousands separators: 70.000, 90,000, 1.200.000. */
const AMOUNT = String.raw`[1-9]\d{0,2}(?:[.,]\d{3})+`;
/**
 * Amounts with thousands separators, as in the pay range 70.000-90.000. Never right after a
 * prefix: there the groups are a phone number's (+34 612.345.678, 07700 900.123).
 */
const AMOUNTS = new RegExp(String.raw`(?<![\d.,+])(?<!${PREFIX})${AMOUNT}(?![.,]?\d)`, 'g');
/** An amount with a space between the thousands: 45 000, 1 200 000 (every group after the first exactly 3 digits). */
const SPACED = String.raw`[1-9]\d{0,2}(?:[^\S\n]\d{3})+(?!\d)`;
/**
 * A "+N" just before a pay range (two amounts and a dash, with dots, commas or spaces between the
 * thousands) is a time zone or the like, not a phone prefix: "Remote GMT +1 70.000-90.000",
 * "remote (UTC +1) 70.000-90.000 EUR", "Remote CET +1 45 000-55 000 €".
 */
const RANGE_AMOUNT = String.raw`(?:${AMOUNT}|${SPACED})`;
const PLUS_BEFORE_RANGE = new RegExp(String.raw`\+\d{1,3}\)?\s+(?=(?:[€$£]\s?)?${RANGE_AMOUNT}(?:\s?[€$£])?\s?[-–—]\s?(?:[€$£]\s?)?${RANGE_AMOUNT}(?![.,]?\d|[^\S\n]\d))`, 'g');
/**
 * The Spanish 3-3-3 form with dots (612.345.678) is a phone number, not an amount, unless it is
 * round (650.000.000) or a currency stands next to it.
 */
const SPANISH_DOTTED = /^[6-9]\d{2}\.\d{3}\.\d{3}$/;
const CURRENCY_AFTER = /^\s?(?:€|\$|£|(?:EUR|USD|GBP|euros?)\b)/i;
const CURRENCY_BEFORE = /(?:€|\$|£|\b(?:EUR|USD|GBP))\s?$/i;
const amountOrPhone = (amount, offset, whole) => {
  const phone = SPANISH_DOTTED.test(amount) && !amount.endsWith('.000')
    && !CURRENCY_AFTER.test(whole.slice(offset + amount.length, offset + amount.length + 8))
    && !CURRENCY_BEFORE.test(whole.slice(Math.max(0, offset - 6), offset));
  return phone ? amount : ' ';
};

/** @returns {string[]} the email addresses in a text. */
export function emailsIn(text) {
  return [...new Set(String(text ?? '').match(EMAIL) ?? [])];
}

/**
 * @param {string} text
 * @param {{bare?: boolean}} [options] - `bare`: also take bare runs of 9 or 10 digits (free text; not a web address).
 * @returns {string[]} what looks like phone numbers in a text.
 */
export function phonesIn(text, { bare = true } = {}) {
  // Dates and amounts are set aside first, so a pay range or a date range is never read as a number.
  const value = String(text ?? '').replace(DATES, ' ').replace(PLUS_BEFORE_RANGE, ' ').replace(AMOUNTS, amountOrPhone);
  const found = new Set();
  for (const pattern of bare ? [...PHONES, ...BARE_PHONES] : PHONES) {
    for (const match of value.matchAll(pattern)) {
      const raw = match[0].trim();
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15 || DATE.test(raw)) continue;
      found.add(raw);
    }
  }
  return [...found];
}

/** An address or number shown in part, so a refusal does not repeat it in full. */
export function masked(text) {
  const value = String(text ?? '');
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 1)}…@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return `…${digits.slice(-3)}`;
}

/** The strings in a tool's arguments, at any depth (bounded). */
function strings(value, out = [], depth = 0) {
  if (out.length >= 400 || depth > 6) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out, depth + 1);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, out, depth + 1);
  return out;
}

/**
 * The first email address or phone number in a tool call's arguments.
 * A web address is checked whole for an email address, and in its query and fragment only for a
 * phone number: the path of a posting's address often holds long reference numbers.
 * @param {unknown} args - the tool call's arguments.
 * @returns {{kind: 'an email address' | 'a phone number', text: string} | undefined}
 */
export function contactIn(args) {
  const decode = (text) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };
  for (const raw of strings(args)) {
    const value = raw.slice(0, 20_000);
    let url;
    try {
      url = /^https?:\/\//i.test(value.trim()) ? new URL(value.trim()) : undefined;
    } catch {
      url = undefined;
    }
    // As written and decoded; in an address a "+" may also stand for a space.
    const texts = [value, decode(value), ...(url ? [decode(value.replace(/\+/g, ' '))] : [])];
    for (const text of texts) {
      const email = emailsIn(text)[0];
      if (email) return { kind: 'an email address', text: email };
    }
    const query = url ? `${url.search} ${url.hash}`.replace(/[?&#=]/g, ' ') : '';
    const phoneTexts = url ? [decode(query), decode(query.replace(/\+/g, ' '))] : texts;
    for (const text of phoneTexts) {
      // In a web address a bare run of digits is more often an id than a number to call.
      const phone = phonesIn(text, { bare: !url })[0];
      if (phone) return { kind: 'a phone number', text: phone };
    }
  }
  return undefined;
}

/** Email services anyone can sign up to: a company's contact is rarely there. */
export const PERSONAL_MAIL = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.de', 'yahoo.es', 'ymail.com', 'hotmail.com', 'hotmail.co.uk',
  'hotmail.de', 'hotmail.es', 'outlook.com', 'outlook.de', 'outlook.es', 'live.com', 'live.co.uk', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'gmx.de', 'gmx.net', 'gmx.com', 'web.de', 't-online.de', 'freenet.de', 'proton.me',
  'protonmail.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'mail.com', 'zoho.com', 'qq.com', '163.com', 'terra.es', 'telefonica.net',
];

/** @returns {boolean} whether an email address is at a service anyone can sign up to. */
export const isPersonalMail = (address) => PERSONAL_MAIL.includes(String(address ?? '').split('@')[1]?.toLowerCase() ?? '');

/** Messaging apps named as a way to get in touch. */
export const MESSENGER = /\b(?:whats\s?app|wa\.me\/|telegram|t\.me\/|wechat|viber|kik messenger|signal (?:app|messenger))\b/i;
