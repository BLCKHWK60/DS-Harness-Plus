/**
 * Secrets out before a row is stored (the plan's rule: "Secrets are masked before a row is stored").
 * Masks keys and tokens by their known shapes; labelled secrets in every spelling a harness meets
 * (password: x, "token": "x", DB_PASSWORD=x, access_token=x, "accessToken": x, --password x, also inside
 * JSON text whose quotes are escaped); a user and password inside a web address; Basic, Bearer and Token
 * headers; secret query parameters; mysql -p<password> and sshpass -p; private key blocks; e-mail
 * addresses; the home folder; and long key-like runs outside web addresses.
 * When something that looks like a labelled secret is still there afterwards, or a web address carried a
 * password, the text is "unsure": such a row is stored with "may train" set to no.
 * Tool arguments are masked string by string before they are written as JSON (`maskDeep`): a value under a
 * secret's name (password, apiKey, client_secret…) is masked whatever it holds.
 */

const KEY_SHAPES = /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abprs]|AKIA|ASIA|AIza|hf|glpat|npm|ya29)[-_.A-Za-z0-9]{12,}\b/g;
// An optional quote before and after a name, also escaped once or more (JSON inside JSON).
const Q = String.raw`(?:\\{0,3}["'])?`;
// A value: quoted (any characters but a quote or a line end), or bare (no space, quote or separator).
const VALUE = String.raw`(?:(\\{0,3}["'])([^"'\n]{1,300}?)\2|(?!\[)([^\s"',;)}\]\\&|]{4,}))`;
const VALUE_SHORT = String.raw`(?:(\\{0,3}["'])([^"'\n]{1,300}?)\2|(?!\[)([^\s"',;)}\]\\&|]{1,}))`;
const LABEL = String.raw`(?:[A-Za-z0-9]+[-_.])*(?:api[-_ ]?key|access[-_ ]?key|secret(?:[-_ ]?key)?|client[-_ ]?secret|private[-_ ]?key|token|auth(?:orization)?|password|passwd|passphrase|pwd|psk|wifi[-_ ]?pass(?:word)?|pin|cookie|session[-_ ]?id|credentials?)`;
const LABELLED = new RegExp(String.raw`(${Q}\b${LABEL}\b${Q}\s*(?:[:=]|\bis\b)\s*)${VALUE}`, 'gi');
// Environment names: DB_PASSWORD=…, AWS_SECRET_ACCESS_KEY=…, API_KEY: … (upper case; "_" before the word).
const ENV = new RegExp(String.raw`(${Q}\b[A-Z0-9_]*(?:PASSWORD|PASSWD|PASSPHRASE|SECRET|TOKEN|KEY|PWD|PASS|CREDENTIALS?)[A-Z0-9_]*${Q}\s*[=:]\s*)${VALUE_SHORT}`, 'g');
// camelCase names: accessToken, clientSecret, dbPassword, apiKey.
const CAMEL = new RegExp(String.raw`(${Q}\b[a-z][a-zA-Z0-9]*(?:Token|Secret|Password|Passwd|Passphrase|Pwd|Pass|ApiKey|Key|Credentials?|Auth)${Q}\s*[:=]\s*)${VALUE}`, 'g');
// --password hunter22, --api-key abc (a flag followed by its value).
const FLAG = /(--(?:[a-z0-9]+-)*(?:password|passwd|passphrase|token|secret|api-key|access-key|auth)\s+)(?![-[])(\S+)/gi;
const MYSQL = /\b((?:mysql|mysqldump|mysqladmin|mysqlimport|mysqlshow|mysqlcheck|mysqlsh|mariadb(?:-dump|-admin)?)\b[^\n|;&]*?\s-p)(?![\s[])(\S+)/g;
const SSHPASS = /\b(sshpass\s+-p\s*)(?!\[)(\S+)/g;
const BEARER = /\bBearer\s+(?!\[)[-._~+/A-Za-z0-9]{12,}=*/gi;
// Basic, Digest, Token, Negotiate headers: a run that is not plain lower-case words.
const SCHEME = /\b(Basic|Digest|Token|Negotiate)\s+(?!\[)(?=[A-Za-z0-9+/=._~-]*[A-Z0-9+/=])[A-Za-z0-9+/=._~-]{8,}/g;
// A user and password in a web address (postgres://admin:pw@host, https://bob:pw@localhost).
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{1,20}:\/\/)([^\s:@/?#'"]+):([^\s@/?#'"]+)@/gi;
// A secret in a web address's query (?access_token=…, &key=…, &sig=…).
const QUERY = /([?&;](?:[A-Za-z0-9_.-]*?)(?:token|key|secret|password|passwd|pwd|sig|signature|auth|credential|session)[A-Za-z0-9_.-]*=)(?!\[)([^&#\s"'<>\\]+)/gi;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const HOME = /\/Users\/[^/\s"'`]+/g;
const URLS = /https?:\/\/[^\s"'<>)]+/g;
// A run of 32 or more letters and digits with both in it: a key without a label.
const KEYLIKE = /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g;
// A hex checksum after a word that says so stays readable (sha256: …).
const CHECKSUM = /\b(?:sha(?:1|256|512)?|md5|checksum|hash|digest)\b[^\n]{0,12}$/i;
// Still there after masking (looked for with escaped quotes undone): the row may not train.
const STILL = /\b(?:[A-Za-z0-9]+[-_.])*(?:password|passwd|passphrase|api[-_ ]?key|secret|token|psk|pwd)\b["']?\s*[:=]\s*["']?(?!\[)[^\s"',;\]]{4,}/i;
const STILL_CAMEL = /\b[a-z][a-zA-Z0-9]*(?:Token|Secret|Password|Passwd|Pwd|ApiKey)["']?\s*[:=]\s*["']?(?!\[)[^\s"',;\]]{4,}/;

const MAX = 200_000;

/**
 * @param {unknown} value - any text.
 * @returns {{text: string, masked: number, unsure: boolean}} the text with secrets masked, how many, and
 *   whether a secret may still be in it (or a web address carried a password).
 */
export function mask(value) {
  const whole = String(value ?? '');
  let text = whole.slice(0, MAX);
  let masked = 0;
  let unsure = whole.length > MAX;
  const count = (replacement) => () => {
    masked += 1;
    return replacement;
  };
  const named = (all, prefix, quote, quoted, bare) => {
    const found = quoted ?? bare ?? '';
    if (found.startsWith('[') || found === '') return all;
    masked += 1;
    return quote ? `${prefix}${quote}[secret]${quote}` : `${prefix}[secret]`;
  };
  text = text.replace(PRIVATE_KEY, count('[private key]'));
  text = text.replace(URL_CREDENTIALS, (_all, scheme) => {
    masked += 1;
    unsure = true;
    return `${scheme}[user]:[secret]@`;
  });
  text = text.replace(QUERY, (_all, name) => {
    masked += 1;
    return `${name}[secret]`;
  });
  text = text.replace(BEARER, count('Bearer [secret]'));
  text = text.replace(SCHEME, (_all, scheme) => {
    masked += 1;
    return `${scheme} [secret]`;
  });
  text = text.replace(KEY_SHAPES, count('[secret]'));
  for (const rule of [MYSQL, SSHPASS, FLAG]) {
    text = text.replace(rule, (_all, prefix) => {
      masked += 1;
      return `${prefix}[secret]`;
    });
  }
  text = text.replace(LABELLED, named);
  text = text.replace(ENV, named);
  text = text.replace(CAMEL, named);
  // Long key-like runs, but not inside web addresses and not a checksum someone named as one.
  const urls = [];
  text = text.replace(URLS, (url) => {
    urls.push(url);
    return `\u0000${urls.length - 1}\u0000`;
  });
  text = text.replace(KEYLIKE, (run, offset, all) => {
    if (/^[0-9a-f]+$/i.test(run) && CHECKSUM.test(all.slice(Math.max(0, offset - 40), offset))) return run;
    masked += 1;
    return '[secret]';
  });
  text = text.replace(/\u0000(\d+)\u0000/g, (_all, index) => urls[Number(index)] ?? '');
  text = text.replace(EMAIL, count('[email]'));
  text = text.replace(HOME, '~');
  const plainQuotes = text.replace(/\\+(["'])/g, '$1');
  if (STILL.test(plainQuotes) || STILL_CAMEL.test(plainQuotes)) unsure = true;
  return { text, masked, unsure };
}

/** @returns {string} the masked text only. */
export const masked = (value) => mask(value).text;

/** Whether a name (an argument's or a field's) names a secret: password, apiKey, client_secret, X-Auth-Token… */
export function secretName(name) {
  const key = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /(?:password|passwd|passphrase|secret|token|apikey|accesskey|secretkey|privatekey|authkey|signingkey|credentials?|authorization|cookie|sessionid|psk|pwd)$/.test(key) || ['pass', 'pin', 'auth'].includes(key);
}

/**
 * Mask every string inside a value (tool arguments), before it is written as JSON: a value under a secret's
 * name is masked whatever it holds; every other string goes through `mask`.
 * @returns {{value: unknown, masked: number, unsure: boolean}}
 */
export function maskDeep(value) {
  let count = 0;
  let unsure = false;
  const walk = (item, depth) => {
    if (depth > 12) {
      unsure = true;
      return '[cut]';
    }
    if (typeof item === 'string') {
      const result = mask(item);
      count += result.masked;
      if (result.unsure) unsure = true;
      return result.text;
    }
    if (Array.isArray(item)) {
      if (item.length > 500) unsure = true;
      return item.slice(0, 500).map((one) => walk(one, depth + 1));
    }
    if (item && typeof item === 'object') {
      const entries = Object.entries(item);
      if (entries.length > 500) unsure = true;
      const out = {};
      for (const [key, one] of entries.slice(0, 500)) {
        if (secretName(key) && one !== null && one !== '' && typeof one !== 'boolean') {
          out[key] = '[secret]';
          count += 1;
        } else out[key] = walk(one, depth + 1);
      }
      return out;
    }
    return item;
  };
  return { value: walk(value, 0), masked: count, unsure };
}
