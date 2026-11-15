/**
 * Step 3, analysis: the signals Scout can compute about a posting by itself, so the model's scores
 * rest on checked facts. Freshness (age, reposts, closing date), pay (against the user's target
 * and the market), and warning signs of ghost jobs and scams: old or reposted postings, no pay,
 * pay far above the market, requests for money or personal documents, contact only through a
 * personal email address or a messaging app. Fit stays the model's judgement.
 *
 * Four kinds of signal: a scam sign and a ghost-job sign; a thing to check (for example pay well
 * above the other postings found) and a note (one role offered in several places), which are shown
 * but never lower the suggested legitimacy.
 *
 * Two sources: facts computed from the sources' data (age, a repost, no pay, pay against a typical
 * pay, a very short text) are stated as they are, and only they lower the suggested legitimacy; a
 * warning sign found by text patterns (a fee, a request for documents, a personal address,
 * talent-pool wording) is a hint to verify, shown as "warning sign (check)" with the words behind
 * it, never a verdict, and does not lower the suggestion: the model judges it against the whole
 * posting. The model's own legitimacy score and its written reason are the judgement.
 */
import { emailsIn, isPersonalMail, MESSENGER } from './contact.js';
import { readPay } from './research.js';
import { sameJob } from './store.js';

const DAY = 86_400_000;
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = (n) => Math.round(n).toLocaleString('en-US');

/** How each kind of signal is named: in the report's table, and in the text for the model. */
export const LABELS = {
  scam: { short: 'scam sign', long: 'Scam sign' },
  ghost: { short: 'ghost sign', long: 'Ghost-job sign' },
  check: { short: 'to check', long: 'To check' },
  info: { short: 'note', long: 'Note' },
  /** A scam or ghost-job sign found by text patterns: a hint to verify, not a verdict, never counted in the suggested legitimacy. */
  text: { short: 'warning sign (check)', long: 'Warning sign (check)' },
};
/** A scam or ghost-job sign that rests on wording found in the text, not on a computed fact. */
const fromText = (item) => item?.from === 'text' && (item.kind === 'scam' || item.kind === 'ghost');
const labelOf = (item, form = 'short') => (fromText(item) ? LABELS.text : LABELS[item?.kind] ?? LABELS.check)[form];

/**
 * One signal as text: "warning sign (check): asks the applicant for money — 'pay a registration fee'".
 * @param {{kind: string, what: string, quote?: string, from?: string}} item
 * @param {'short' | 'long'} [form] - `long` for the text given to the model.
 */
export function signalText(item, form = 'short') {
  return `${labelOf(item, form)}: ${item?.what ?? ''}${item?.quote ? ` — '${item.quote}'` : ''}`;
}

/**
 * Where a clause ends: a sentence's end (not a decimal point), a new line, ";", ":" (not in a
 * time), and "but", "except" and their German and Spanish words.
 */
const BREAKS = /[.!?](?!\d)|\n|;|:(?!\d)|(?<!\p{L})(?:but|except|aber|außer|pero|sino|excepto|salvo)(?!\p{L})/giu;
/** Words that start a clause of their own: "you", "we", "du", "wir", "tú", "solo"... */
const STARTERS = String.raw`(?:you(?:['’](?:ll|re|d))?|we|they|i|he|she|it|there|only|then|du|sie|wir|ich|man|nur|usted(?:es)?|t[uú]|nosotros|solo|s[oó]lo)(?![\p{L}'’])`;
/** The words that join a list's last item: "application, processing or registration fees". */
const LIST = String.raw`(?:or|and|nor|oder|und|ni|y|o)`;
/** Words that open a new clause after a comma, also after "and": "free of charge, (and) you only pay a fee". */
const CLAUSE_START = new RegExp(String.raw`^\s*(?:${LIST}\s+)?${STARTERS}`, 'iu');
/** ... right at the start: ", or a registration fee", "una cuota ni tus datos". */
const LIST_NEXT = new RegExp(String.raw`^\s*${LIST}\s+(?!${STARTERS})`, 'iu');
/**
 * A verb after a list makes it the subject of a clause of its own: "free of charge, a registration
 * fee and a deposit are required" is not a list that the "free of" before it turns around.
 */
const PREDICATE = /(?<!\p{L})(?:is|are|was|were|will|must|applies|apply|remains?|ist|sind|wird|werden|muss|müssen|gilt|gelten|fällt|fallen|es|son|ser[aá]n?|debe|deben|aplica|aplican)(?!\p{L})/iu;
/**
 * A comma after one of these joins the items of a list ("registration fees, onboarding fees or
 * deposits") or follows a "please", and does not part two clauses.
 */
const JOINED = /(?:fees?|deposits?|payments?|charges|costs|cards?|details|numbers?|cop(?:y|ies)|passports?|statements?|licen[cs]es?|geb[üu]hr(?:en)?|kosten|daten|cuotas?|tasas?|pagos?|datos|DNI|NIE|pasaportes?|please|kindly|bitte|por\s+favor)\s*$/iu;
/** The commas in a text that may part clauses: not those inside a number (1,500). */
const commasIn = (text) => [...text.matchAll(/(?<!\d),|,(?!\d)/g)].map((found) => found.index);
/** The words up to the first comma that may part clauses. */
const toComma = (text) => text.slice(0, commasIn(text)[0] ?? text.length);

/**
 * The words before a match that are in its clause. `commas`: a comma that starts a new clause ends
 * it too; one in a list does not: after a list's item ("fees,"), or with "or", "and", "nor",
 * "oder", "und", "ni", "y", "o" in the list up to the match or just after it ("We cover travel,
 * accommodation, and the registration fee", "dinero, una cuota de inscripción ni tus datos"),
 * unless a verb makes the list a clause of its own ("..., a fee and a deposit are required").
 * `after`: the words after the match, in its sentence.
 */
function clauseBefore(text, commas = true, after = '') {
  let rest = text;
  let last;
  for (const found of text.matchAll(BREAKS)) last = found;
  if (last) rest = text.slice(last.index + last[0].length);
  if (!commas) return rest;
  const next = toComma(after);
  const at = commasIn(rest);
  for (let i = at.length - 1; i >= 0; i -= 1) {
    const tail = rest.slice(at[i] + 1);
    if (CLAUSE_START.test(tail)) return tail;
    if (JOINED.test(rest.slice(0, at[i]))) continue;
    return tail;
  }
  return rest;
}

/**
 * The words after a match that are in its clause; `head`, the match itself, tells a list from a
 * new clause: after a list's item, or a comma right before "or", "and" and the like that no verb
 * comes before ("The registration fee, travel, and accommodation are waived").
 */
function clauseAfter(text, head, commas = true) {
  const found = new RegExp(BREAKS.source, 'iu').exec(text);
  const rest = found ? text.slice(0, found.index) : text;
  if (!commas) return rest;
  for (const at of commasIn(rest)) {
    const tail = rest.slice(at + 1);
    if (CLAUSE_START.test(tail)) return rest.slice(0, at);
    if (JOINED.test(`${head}${rest.slice(0, at)}`)) continue;
    if (LIST_NEXT.test(tail) && !PREDICATE.test(rest.slice(0, at))) continue;
    return rest.slice(0, at);
  }
  return rest;
}

/**
 * Words that turn a phrase around: "we never ask for a fee", "we waive the registration fee",
 * "free of fees", "we will never ask candidates to pay a registration fee or to send us bank
 * details". Within the words' clause, up to 40 characters before them (a wider reach cancelled real requests).
 */
const NEGATION = /\b(?:never|not|no|(?:do|does|did|wo)n['’]?t|without|waive[sd]?|free\s+of|nie|niemals|kein\w*|nicht|nunca|sin)\b[^.!?\n]{0,40}$/i;
/**
 * The employer, or the agency's client, paying or giving, not the applicant: "we cover the
 * training fee", "our client pays the placement fee", "la
 * empresa paga la cuota de formación", "el cliente paga la tasa de inscripción".
 */
const COVERED = /\b(?:we|company|employer|(?:our|the)\s+clients?|wir|unser(?:e)?\s+Kunden?|(?:der|unser)\s+(?:Arbeitgeber|Kunde)|(?:die|unsere)\s+Firma|(?:das|unser)\s+Unternehmen|nosotros|nuestros?\s+clientes?|(?:el|nuestro)\s+(?:cliente|empleador)|los\s+clientes|(?:la|nuestra)\s+(?:empresa|compa[ñn][ií]a))\s+(?:will\s+)?(?:cover|covers|pay|pays|reimburse|reimburses|refund|provide|provides|offer|offers|übernehmen|übernimmt|erstatten|erstattet|zahlen|zahlt|bezahlen|bezahlt|trägt|bieten|cubrimos|pagamos|ofrecemos|paga|pagan|cubre|cubren|asume|asumen)\b[^.!?\n]{0,40}$/i;
/** Words just after them that turn them around or put them on the employer: "is waived", "paid by our client", "is not required". */
const EXCUSED_AFTER = /^[^.!?\n]{0,40}?\b(?:waived|free\s+of\s+charge|(?:is|are)\s+not\s+(?:required|needed|charged)|(?:paid|covered|borne)\s+(?:in\s+full\s+)?by\s+(?:the|our)\s+(?:client|employer|company))\b/i;
/** "pay", but never "pay attention" ("pay close attention"): that is not a payment. */
const PAY = String.raw`pay(?!\s+(?:[\w'’-]+\s+){0,2}?attention\b)`;
/** English verbs of a request to send, pay or hand over something. */
const EN_VERBS = String.raw`send|${PAY}|buy|purchase|provide|submit|transfer|wire|upload|share|enter|attach|e-?mail|forward`;
/**
 * A request made of the applicant shortly before the words, or in them: an English verb as an
 * instruction (at the start of a sentence, after "please" or "kindly", after "you", "applicants" or
 * "must" but not as "you will <verb>", which describes the work, or with "us", "me", "your" after
 * it), "we need your", "you must", "you'll need to"; German request verbs, formal ("senden Sie")
 * and informal ("schick", "überweise"); Spanish ones, also with the pronoun attached ("envía",
 * "envíanos", "mándanos").
 */
const ASKED_BEFORE = new RegExp(String.raw`(?:(?:(?:^|[.!?:;\n])\s*(?:[-•*]\s*)?|\b(?:please|kindly),?\s+|\b(?:you|applicants?|candidates?|bidders?|tenderers?|suppliers?|must)\s+(?!will\b)(?:\w+\s+){0,2})(?:${EN_VERBS})\b|\b(?:${EN_VERBS})\s+(?:us|me|your)\b|\bask(?:s|ed|ing)?\s+(?:you|applicants|candidates)\s+(?:for|to)\b|\bwe(?:['’]ll|\s+will)?\s+ask\s+for\b|\b(?:you(?:['’]ll)?|applicants?|candidates?|bidders?|tenderers?|suppliers?)\s+(?:will\s+)?(?:need\s+to|must|have\s+to|(?:are|be)\s+(?:required|asked)\s+to)\b|\bwe(?:['’]ll|\s+will)?\s+need\s+your\b|(?<!\p{L})(?:senden|schicken|zahlen|bezahlen|angeben|einreichen|hochladen|beifügen|kaufen|überweisen|übermitteln|schicke?|sende|zahle|bezahle|überweise|übermittle|kaufe|entrichte|maile|lade|gib)(?!\p{L})|(?<!\p{L})(?:env[ií](?:a|e|ar)|m[aá]nd(?:a|e|ar)|p[aá]g(?:a|ue|ar)|ab[oó]n(?:a|e|ar)|proporci[oó]n(?:a|e|ar)|facil[ií]t(?:a|e|ar)|adj[uú]nt(?:a|e|ar)|transfi[eé]r(?:a|e)|transferir|ingr[eé]s(?:a|e|ar)|compr(?:a|e|ar))(?:nos|me)?(?!\p{L}))[^.!?\n]{0,60}$`, 'iu');
/** ... or just after them: "is required", "erforderlich", "obligatorio". */
const ASKED_AFTER = /^[^.!?\n]{0,40}?(?:\b(?:is|are|be)\s+(?:required|needed|due|payable|mandatory)\b|\brequired\b|\bmandatory\b|\berforderlich\b|\bnotwendig\b|\bobligatori[oa]s?\b|\bnecesari[oa]s?\b|\brequerid[oa]s?\b)/i;
/** Words after them that make it the employer's part or a later step: "reimbursement", "after your offer". */
const LATER = /^[^.!?\n]{0,80}?(?:reimburs|erstatt|reembols|\bafter\s+(?:the|your|an?)\s+(?:job\s+)?offer|\bonce\s+(?:you(?:'re|\s+are)\s+)?hired|\bfirst\s+day\b|\bright[- ]to[- ]work\b|\bnach\s+(?:der|dem|Ihrer|deiner)\s+(?:Zusage|Einstellung|Vertragsunterzeichnung)|\btras\s+(?:la|tu|su)\s+(?:oferta|contrataci[oó]n|incorporaci[oó]n))/i;
/** Paid for other people, as part of the work: "the deposit for new tenants", "on behalf of clients". */
const ON_BEHALF = /^[^.!?\n;:]{0,30}?\b(?:on\s+behalf\s+of|for\s+(?:(?:new|our|the|all|its|their)\s+)?(?:tenants|residents|customers|clients|suppliers|vendors|members|employees|staff|guests|patients|students))\b/i;

/** "your", "Ihre", "deine", "tus", "sus" (and their other forms): the applicant's own. */
const POSSESSIVE = String.raw`(?:[Yy]our|YOUR|Ihr(?:e[nmrs]?)?|[Dd]ein(?:e[nmrs]?)?|[Tt]us?|[Ss]us?)`;
/** The applicant's own details: a possessive a few words before the words ("your full bank details") ... */
const OWN_BEFORE = new RegExp(String.raw`\b${POSSESSIVE}[^\S\n]+(?:[^\s.!?;:]+[^\S\n]+){0,3}$`);
/** ... or in them ("a copy of your passport", "Kopie Ihres Ausweises"). */
const OWN_WITHIN = new RegExp(String.raw`\b${POSSESSIVE}\b`);
/**
 * Someone named to receive them, as the object of the request: right after its verb ("send us",
 * "pay me", "senden Sie uns", "schick uns", "envíanos", "mándenos") ...
 */
const RECIPIENT_OBJECT = [
  new RegExp(String.raw`\b(?:${EN_VERBS}|give|return|mail)\s+(?:us|me)\b`, 'i'),
  /(?<!\p{L})(?:senden|schicken|zahlen|bezahlen|überweisen|übermitteln|geben|mailen|schicke?|sende|zahle|bezahle|überweise|übermittle|gib|maile)\s+(?:Sie\s+)?(?:uns|mir)(?!\p{L})/iu,
  /(?<!\p{L})(?:env[ií][ae]|m[aá]nd[ae]|p[aá]g(?:a|ue)|ab[oó]n[ae]|transfi[eé]r[ae]|ingr[eé]s[ae]|facil[ií]t[ae]|proporci[oó]n[ae]|adj[uú]nt[ae])(?:nos|me)(?!\p{L})/iu,
];
/** ... or just after the details: "to us", "to the recruiter", "an uns", "a nosotros". */
const RECIPIENT_AFTER = /^\s*(?:[^\s.!?,;:]+\s+){0,3}?(?:to|an|a)\s+(?:us|me|(?:the|our)\s+recruit(?:er|ing\s+team)|uns|mich|nosotros|m[ií])(?![\p{L}])/iu;
/** A polite request to the reader, so what is asked for is theirs: "please send", "kindly pay", "bitte senden Sie". */
const PLEASE = /\b(?:please|kindly)\b|(?<!\p{L})(?:bitte|por\s+favor)(?!\p{L})/iu;
/**
 * Words between a request and the words that make them something else than what it asks for: a
 * clause of their own ("if", "when", "who", "wenn", "falls", "si", "cuando") or a skill
 * ("experience with", "Erfahrung mit", "experiencia con"): "Send us your CV if you have experience
 * with placement fees" asks for a CV.
 */
const OPENS = /(?<!\p{L})(?:if|when(?:ever)?|whether|who(?:m|se)?|which|where|while|because|unless|experience|expertise|knowledge|familiar(?:ity)?|wenn|falls|ob|weil|sofern|Erfahrung(?:en)?|Kenntniss\p{L}*|vertraut|si|cuando|porque|aunque|quien(?:es)?|donde|experiencia|conocimientos?|familiarizad\p{L}*)(?!\p{L})/giu;
/** ... unless a request starts again after a comma: "Please, if you are shortlisted, pay the fee". */
const REOPENS = new RegExp(String.raw`,\s*(?:please|kindly|bitte|por\s+favor|${EN_VERBS}|senden|schicken|zahlen|bezahlen|überweisen|übermitteln|schicke?|sende|zahle|bezahle|überweise|env[ií]\p{L}*|m[aá]nd\p{L}*|p[aá]g\p{L}*|ab[oó]n\p{L}*|transfi[eé]r\p{L}*)(?!\p{L})`, 'iu');
/** Whether the words after a request leave its clause or turn to a skill before they end. */
function opened(gap) {
  let last;
  for (const found of gap.matchAll(OPENS)) last = found;
  return Boolean(last) && !REOPENS.test(gap.slice(last.index + last[0].length));
}
/**
 * Whether a request (a "please", a recipient as in "send us") asks for the words: it is in them, or
 * in their clause with nothing between that opens another clause or makes them a skill (nor, for
 * a request after them, in the few words just before them: "experience with bank details and
 * payroll, send us your CV"). Never from anywhere in the sentence.
 * @param {RegExp} pattern - the request.
 * @param {string} before - the clause up to the words. @param {string} words - the words.
 * @param {string} after - the clause after them.
 */
function asksFor(pattern, before, words, after) {
  if (pattern.test(words)) return true;
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const last = [...before.matchAll(new RegExp(pattern.source, flags))].at(-1);
  if (last && !opened(before.slice(last.index + last[0].length))) return true;
  const next = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(after);
  const near = /(?<!\S)(?:\S+\s+){0,5}\S*\s*$/u.exec(before)?.[0] ?? '';
  return Boolean(next) && !opened(near) && !opened(after.slice(0, next.index));
}
/** The request names who receives the words: "send us …", "… to the recruiter". */
const recipientFor = (before, words, after) => RECIPIENT_OBJECT.some((pattern) => asksFor(pattern, before, words, after)) || RECIPIENT_AFTER.test(after);
/**
 * The applicant as the payer, near the request: "you must pay", "applicants are asked to transfer",
 * "pay your", "zahlen Sie", "überweise", "paga", "debes pagar". (A recipient or a "please" also
 * makes it theirs.) A bare imperative is not enough in English: a list of duties reads the same.
 */
const PAYER = [
  new RegExp(String.raw`\b(?:you(?:['’](?:ll|d|re))?|applicants?|candidates?)\s+(?:[\w'’-]+\s+){0,4}?(?:${PAY}|send|buy|purchase|transfer|wire|deposit|remit|make)\b`, 'i'),
  new RegExp(String.raw`\b(?:${PAY}|send|buy|purchase|transfer|wire|deposit|remit|cover)\s+your\b`, 'i'),
  /(?<!\p{L})(?:[Zz]ahlen|[Bb]ezahlen|[Üü]berweisen|[Ee]ntrichten|[Kk]aufen|[Ss]enden|[Ss]chicken|[Ll]eisten)\s+Sie(?!\p{L})/u,
  /(?<!\p{L})(?:überweise|zahle|bezahle|entrichte|kaufe|schicke?|sende|leiste)(?!\p{L})/iu,
  /(?<!\p{L})(?:paga|pague|abona|abone|env[ií]a|env[ií]e|m[aá]nda|m[aá]nde|transfiere|transfiera|ingresa|ingrese|deposita|deposite|compra|compre)(?:nos|me)?(?!\p{L})(?!\s+de\b)/iu,
  /(?<!\p{L})(?:debes|deber[aá]s|tienes\s+que|tendr[aá]s\s+que|debe|deber[aá]|tiene\s+que|tendr[aá]\s+que)\s+(?:pagar|abonar|enviar|transferir|ingresar|comprar|depositar)(?!\p{L})/iu,
];
/**
 * In a tender, the bidder as the payer: "bidders must pay", "you are required to pay", "payable by
 * bidders", "please pay … before you submit" or "… with your bid"; "Bieter müssen … zahlen",
 * "los licitadores deberán abonar". A fee residents pay, which the supplier collects, is part of
 * the work; so is what "the supplier shall pay" under the contract. "Pay attention" is never a payment.
 */
const BIDDER_PAYER = [
  new RegExp(String.raw`\b(?:you(?:['’]ll)?|bidders?|tenderers?|suppliers?)\s+(?:must|need\s+to|have\s+to|are\s+(?:required|asked|expected)\s+to|be\s+(?:required|asked)\s+to|will\s+(?:need|have)\s+to|will\s+be\s+(?:required|asked)\s+to)\s+(?:also\s+)?${PAY}\b`, 'i'),
  /\bpayable\s+by\s+(?:the\s+|all\s+|each\s+)?(?:you|bidders?|tenderers?|suppliers?)\b/i,
  new RegExp(String.raw`\b(?:please|kindly)\s+${PAY}\b[^.!?\n]*?\b(?:before\s+(?:you\s+)?submit\w*|with\s+(?:your|the|their)\s+(?:bid|tender|submission|offer|response))\b`, 'i'),
  /(?<!\p{L})(?:Bieter|Bewerber)\p{L}*\s+(?:müssen|haben)(?!\p{L})[^.!?\n]{0,40}?(?:zahlen|entrichten|überweisen)(?!\p{L})/iu,
  /(?<!\p{L})licitadores\s+(?:deben|deber[aá]n|tienen\s+que|habr[aá]n\s+de)\s+(?:pagar|abonar|ingresar)(?!\p{L})/iu,
];

/**
 * Asking for money in so many words: the applicant (or a bidder) told to pay a fee or deposit
 * ("you must pay a small fee", "you will pay a one-time processing fee", "you'll need to pay a
 * refundable deposit", "candidates will pay an administration fee"), an advance fee, a starter kit
 * to buy; the registration, onboarding, starter-kit and background-check fees, which are the
 * applicant's by what they are.
 */
const MONEY = [
  /\b(?:registration|onboarding|starter[- ]kit|background[- ]check)\s+fees?\b/i,
  /\b(?:you(?:['’]ll)?|applicants?|candidates?|bidders?|tenderers?)\s+(?:will\s+|must\s+|need\s+to\s+|have\s+to\s+|are\s+required\s+to\s+|only\s+)?(?:need\s+to\s+|have\s+to\s+)?pay\s+(?:(?:a|an|the)\s+(?:[^\s.,;:!?]+\s+){0,2}?|(?:small|one[- ]time|refundable)\s+)?(?:fee|deposit)\b/i,
  /\b(?:upfront|up-front|advance)\s+fees?\b/i,
  /\b(?:purchase|buy)\s+(?:the\s+|a\s+|your\s+own\s+)?(?:starter kit|training (?:course|package|materials?))\b/i,
  /\b(?:Anmelde|Registrierungs)gebühr\b/i,
  /\b(?:cuota|tasa|pago)\s+de\s+(?:inscripci[oó]n|registro|matr[ií]cula)\b/i,
];
/**
 * Money words that also name ordinary things: a gift card platform, training paid by the employer,
 * or the application, processing, administration and placement fees and advance payments that
 * finance and payroll staff handle and agencies' clients pay. Only when asked of the applicant as
 * the payer ("you must pay", "pay us", "please"), never from a bare imperative in a list of duties.
 */
const MONEY_ASKED = [
  /\b(?:application|processing|placement|administration|admin)\s+fees?\b/i,
  /\b(?:upfront|up-front|advance)\s+payments?\b/i,
  /\brefundable\s+deposits?\b/i,
  /\btraining\s+fees?\b/i,
  /\bgift\s*cards?\b/i,
  /\b(?:western union|moneygram)\b/i,
  /\b(?:bitcoin|crypto(?:currency)?)\s+(?:payment|deposit|wallet|transfer)\b/i,
  /\b(?:deposit|cash)\s+(?:the|a)\s+(?:check|cheque)\b/i,
  /\b(?:Bearbeitungs|Vermittlungs|Verwaltungs|Schulungs)gebühr\b/i,
  /(?<!\p{L})(?:Gebühr|Kaution)(?!\p{L})/iu,
  /\bVorkasse\b/i,
  /\b(?:cuota|tasa|pago)\s+de\s+formaci[oó]n\b/i,
  /\bpago\s+(?:por\s+)?adelantado\b/i,
];

/**
 * Asking for personal documents or bank details before any interview: only when asked of the
 * applicant, and only their own ("your ...") or to be sent to someone named ("us", "the recruiter"):
 * finance and payroll staff handle other people's bank details as their work.
 */
const DOCUMENTS = [
  /\b(?:copy|scan|photo|picture)\s+of\s+(?:(?:your|the|a|an)\s+)?(?:passport|id card|identity card|driver'?s licen[cs]e|social security card|national id)\b/i,
  /\b(?:send|e-?mail|upload|submit|provide|share|attach|forward)\s+(?:(?:us|me)\s+)?(?:your|the|a)\s+(?:passport|id card|identity card|driver'?s licen[cs]e)\b/i,
  /\bsocial\s+security\s+(?:number|no\.?|card)\b/i,
  /\bSSN\b/,
  /\bbank\s+(?:account\s+)?(?:details|information|number|login|statements?)\b/i,
  /\b(?:credit|debit)\s+card\s+(?:details|number|information)\b(?!\s+(?:security|protection|systems?|processing|standards?))/i,
  /\b(?:Ausweiskopie|Passkopie|Kopie\s+(?:Ihres|deines|des)\s+(?:Personalausweises|Ausweises|Reisepasses))\b/i,
  /\b(?:Bankverbindung|Bankdaten|Kontodaten|Kontonummer|Kreditkartendaten)\b/i,
  /\b(?:copia|foto(?:graf[ií]a)?)\s+(?:de(?:l)?\s+)?(?:tu\s+|su\s+)?(?:DNI|NIE|pasaporte)\b/i,
  /(?<!\p{L})(?:pasaporte|documento\s+de\s+identidad|Reisepass|Personalausweis)(?!\p{L})/iu,
  /(?<!\p{L})(?:DNI|NIE)(?!\p{L})/u,
  /\b(?:datos|n[uú]mero)\s+(?:bancarios|de\s+(?:cuenta|tarjeta))\b/i,
];

/** Promises of earnings rather than a job. */
const EARNINGS = [
  /\b(?:unlimited|uncapped)\s+(?:earnings?|income|commission)\b/i,
  /\bcommission[- ]only\b/i,
  /\b(?:be your own boss|network marketing|MLM|financial freedom|get rich)\b/i,
  /\bearn\s+(?:up\s+to\s+)?[$€£]\s?\d[\d,.]*\s?k?\s*(?:a|per|\/)\s*(?:week|day)\b/i,
];

/** A posting that collects applications rather than filling a role. */
const POOL = /\b(?:talent (?:pool|community|pipeline|network)|evergreen|future (?:openings|opportunities|vacancies)|general application|always (?:hiring|accepting applications)|Initiativbewerbung|Talentpool|bolsa de (?:empleo|talento|candidatos)|candidatura espont[aá]nea)\b/i;

/** Words around a messaging app that make it the way to get in touch. */
const CONTACT_WORDS = /\b(?:contact|apply|message|text|reach|send|write|chat|kontakt\w*|bewerb\w*|schreib\w*|melde\w*|contact[ae]\w*|env[ií]a\w*|escrib\w*)\b/i;

/**
 * The first match of any pattern that is not turned around, in its own clause, by a "never" or "no"
 * before it, or by "is waived" or "paid by our client" just after it. A clause ends at a comma that
 * starts a new one (not one in a list: "application, processing or registration fees"), ";", ":",
 * "but", "aber", "pero", "sino" and the like: "free of charge, you only pay a registration fee" is
 * still a request for money.
 * `asked`: the words must also be asked of the applicant (a request just before, in or after them),
 * and not be followed by "reimbursement", "after your offer" and the like.
 * `payer`: the applicant must also be the one to pay ("you must pay", "pay us", "to the recruiter",
 * "please"; a recipient or a "please" only for the words it asks for).
 * `own`: the words must also be the applicant's own ("your ..."), go to someone named as the
 * request's object ("send us", "to the recruiter"), or be asked for with a "please" (both only for
 * the words they ask for: "Send us your CV if you have experience with bank details" is not).
 * `bidder`: in a tender, the bidder must be the one to pay ("bidders must pay", "payable by bidders").
 */
function firstHit(text, patterns, { asked = false, payer = false, own = false, bidder = false } = {}) {
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
      const start = match.index;
      const end = start + match[0].length;
      // Cut mid-sentence, the lead does not count as a sentence's start.
      const from = Math.max(0, start - 120);
      const lead = `${from > 0 ? '…' : ''}${text.slice(from, start)}`;
      const rawAfter = text.slice(end, end + 100);
      // Who pays or receives is read in the request's clause, commas aside.
      const ownAfter = clauseAfter(rawAfter, match[0], false);
      const before = clauseBefore(lead, true, ownAfter);
      const after = clauseAfter(rawAfter, match[0]);
      if (NEGATION.test(before) || COVERED.test(before) || EXCUSED_AFTER.test(after) || ON_BEHALF.test(after)) continue;
      if ((asked || bidder) && LATER.test(after)) continue;
      // The words themselves may hold the request ("bidders must pay a fee").
      if (asked && !ASKED_BEFORE.test(`${lead}${match[0]}`) && !ASKED_AFTER.test(after)) continue;
      const leadClause = clauseBefore(lead, false);
      const clause = `${leadClause} ${match[0]} ${ownAfter}`;
      const named = () => recipientFor(leadClause, match[0], ownAfter);
      const pleased = () => asksFor(PLEASE, leadClause, match[0], ownAfter);
      if (payer && !PAYER.some((item) => item.test(clause)) && !named() && !pleased()) continue;
      if (own && !OWN_BEFORE.test(before) && !OWN_WITHIN.test(match[0]) && !named() && !pleased()) continue;
      if (bidder && !BIDDER_PAYER.some((item) => item.test(clause))) continue;
      return clip(text.slice(Math.max(0, start - 30), end + 30), 110);
    }
  }
  return '';
}

/**
 * How a posting's text is judged: a tender's contact is the buyer's, from an official notice; a
 * Hacker News post is often written by a founder from a personal address.
 * @returns {{tender: boolean, community: boolean}}
 */
export const textOptions = (posting) => ({ tender: posting?.type === 'tender', community: posting?.adapter === 'hn' || posting?.source === 'hn' });

/**
 * Warning signs in a posting's text.
 * @param {string} text - the posting's text (untrusted).
 * @param {{full?: boolean, tender?: boolean, community?: boolean}} [options] - `full`: the whole
 *   text, not a short extract; `tender`: a public tender, whose published contact is not checked;
 *   `community`: a post in a community thread (Hacker News), where a personal address is only a thing to check.
 * @returns {{kind: 'scam' | 'ghost' | 'check', what: string, quote?: string, from?: 'text'}[]} -
 *   `from: 'text'`: found by text patterns, a hint to verify that `assess` lists but does not count
 *   in the suggested legitimacy (every sign but the text's length, which is a measured fact).
 */
export function textSignals(text, { full = true, tender = false, community = false } = {}) {
  const value = String(text ?? '').slice(0, 60_000);
  const out = [];
  const add = (kind, what, quote) => out.push(quote ? { kind, what, quote, from: 'text' } : { kind, what, from: 'text' });
  // A tender names fees as part of the work (the supplier collects them, prices them): only money
  // the bidder is to pay counts there.
  const fee = tender
    ? firstHit(value, [...MONEY, ...MONEY_ASKED], { bidder: true })
    : firstHit(value, MONEY) || firstHit(value, MONEY_ASKED, { asked: true, payer: true });
  if (fee) add('scam', tender ? 'asks the bidder for money' : 'asks the applicant for money', fee);
  const documents = firstHit(value, DOCUMENTS, { asked: true, own: true });
  if (documents) add('scam', 'asks for personal documents or bank details', documents);
  const earnings = firstHit(value, EARNINGS);
  if (earnings) add('scam', 'promises earnings rather than pay for a job', earnings);
  const emails = tender ? [] : emailsIn(value);
  const personal = emails.filter(isPersonalMail);
  const company = emails.filter((address) => !isPersonalMail(address));
  const domains = [...new Set(personal.map((address) => address.split('@')[1]))].join(', ');
  if (personal.length > 0 && company.length === 0) {
    if (community) add('check', `contact only through a personal email address (${domains}): common for founders on Hacker News; check that the company exists`);
    else add('scam', `contact only through a personal email address (${domains})`);
  } else if (company.length === 0 && !tender) {
    const chat = MESSENGER.exec(value);
    if (chat && CONTACT_WORDS.test(value.slice(Math.max(0, chat.index - 60), chat.index + chat[0].length + 60))) add('scam', `contact through a messaging app (${chat[0]})`, clip(value.slice(Math.max(0, chat.index - 40), chat.index + chat[0].length + 40), 110));
  }
  const pool = POOL.exec(value);
  if (pool) add('ghost', 'collects applications rather than filling one role', clip(value.slice(Math.max(0, pool.index - 30), pool.index + pool[0].length + 30), 110));
  // A fact measured, not wording found: stated as it is.
  if (full && value.trim().length > 0 && value.trim().length < 400) out.push({ kind: 'ghost', what: `little detail: the text is ${value.trim().length} characters` });
  return out;
}

const daysBetween = (later, earlier) => Math.round((Date.parse(later) - Date.parse(earlier)) / DAY);
const titleKey = (item) => sameJob(item).split('|').slice(0, 2).join('|');

/**
 * Everything Scout can check about one posting.
 * @param {object} posting - from the store (with `checks` once its text was read, `dates` when
 *   the same job was found again with another posting date).
 * @param {object} context
 * @param {number} context.today - now, in ms.
 * @param {object[]} [context.all] - every posting found in the conversation (for repeats, and pay to compare with).
 * @param {string} [context.target] - the user's pay target, as typed.
 * @param {string} [context.typical] - a typical pay for this work in this posting's market, from a
 *   source the model read. Only this can make pay far above the market a scam sign; the other
 *   postings found make it a thing to check at most.
 * @returns {{freshness: {score?: number, reason: string}, pay: {score?: number, reason: string}, legitimacy: {score: number, reason: string}, flags: object[], checked: string}}
 */
export function assess(posting, { today, all = [], target = '', typical = '' }) {
  const flags = [];
  const flag = (kind, what, quote) => flags.push(quote ? { kind, what, quote } : { kind, what });
  const now = new Date(today).toISOString().slice(0, 10);
  const valid = (date) => Boolean(date) && !Number.isNaN(Date.parse(date));

  // The same title from the same company: in the same town it is the same job (found again with
  // another posting date, a real repost); in other towns, one role offered in several places.
  const here = sameJob(posting);
  const twins = posting.company ? all.filter((other) => other.n !== posting.n && titleKey(other) === titleKey(posting)) : [];
  const places = twins.filter((other) => sameJob(other) !== here);
  const dates = [...new Set([posting.firstPosted, posting.posted, ...(Array.isArray(posting.dates) ? posting.dates : []), ...twins.filter((other) => sameJob(other) === here).map((other) => other.posted)].filter(valid))]
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = dates[0];
  const latest = dates.at(-1);

  // Freshness: age, a second posting of the same job, a closing date.
  const age = valid(posting.posted) ? daysBetween(now, posting.posted) : undefined;
  const reposted = dates.length >= 2 && daysBetween(latest, first) >= 21 ? daysBetween(latest, first) : 0;
  const closed = valid(posting.closes) ? daysBetween(posting.closes, now) : undefined;
  // A tender is judged by the time left to respond: a long tender period is normal.
  const tender = posting.type === 'tender';
  const freshness = {};
  if (closed !== undefined && closed < 0) Object.assign(freshness, { score: 1, reason: `closed on ${posting.closes}` });
  else if (tender && closed !== undefined) {
    const score = closed >= 14 ? 5 : closed >= 7 ? 4 : closed >= 3 ? 3 : 2;
    Object.assign(freshness, { score, reason: `responses due ${posting.closes}, in ${closed} day${closed === 1 ? '' : 's'}${posting.posted ? `; published ${posting.posted}` : ''}` });
  } else if (age === undefined) freshness.reason = 'no posting date given: check it on the posting\'s page';
  else {
    let score = age <= 7 ? 5 : age <= 14 ? 4 : age <= 30 ? 3 : age <= 60 ? 2 : 1;
    const parts = [`posted ${posting.posted}, ${age} day${age === 1 ? '' : 's'} ago`];
    if (reposted) {
      score = Math.max(1, score - 1);
      parts.push(`first posted ${first}, ${reposted} days before ${latest}`);
    }
    if (closed !== undefined) parts.push(`closes ${posting.closes} (in ${closed} day${closed === 1 ? '' : 's'})`);
    Object.assign(freshness, { score, reason: parts.join('; ') });
  }
  if (age !== undefined && age > 45 && !(tender && closed !== undefined)) flag('ghost', `still listed ${age} days after it was posted`);
  if (reposted && !tender) flag('ghost', `posted again: first posted ${first}, again ${latest}`);
  if (places.length >= 2) {
    const towns = [...new Set([posting, ...places].map((item) => clip(item.location, 40)).filter(Boolean))].slice(0, 6);
    flag('info', `the same title from the same company in ${places.length + 1} places (${[posting, ...places].slice(0, 6).map((item) => `P${item.n}`).join(', ')}${towns.length ? `: ${towns.join(', ')}` : ''}): common for one role offered in several places`);
  }

  // Pay: against the target, and against the market.
  const pay = {};
  const own = readPay(posting.pay);
  const want = readPay(target);
  if (!own) {
    if (tender) pay.reason = posting.value ? `a tender with a contract value of ${posting.value}: compare it with your rate for the work` : 'a tender with no contract value given';
    else {
      Object.assign(pay, { score: 3, reason: 'no pay given: neither good nor bad until it is known' });
      flag('ghost', 'no pay given');
    }
  } else if (!want) pay.reason = `${posting.pay}; no pay target to compare with`;
  else if ((want.currency && own.currency && want.currency !== own.currency) || want.per !== own.per) pay.reason = `${posting.pay} is ${own.currency || 'pay'} per ${own.per}, the target ${want.currency || 'pay'} per ${want.per}: not compared`;
  else {
    const goal = want.low;
    const ratio = own.high / goal;
    const score = ratio >= 1 ? 5 : ratio >= 0.9 ? 4 : ratio >= 0.75 ? 3 : ratio >= 0.5 ? 2 : 1;
    Object.assign(pay, { score, reason: ratio >= 1 ? `the top of ${posting.pay} reaches the target of ${money(goal)}` : `the top of ${posting.pay} is ${Math.round((1 - ratio) * 100)}% below the target of ${money(goal)}` });
  }
  if (own && own.currency) {
    const middle = (value) => (value.low + value.high) / 2;
    const typicalPay = readPay(typical);
    if (typicalPay && typicalPay.currency === own.currency && typicalPay.per === own.per) {
      // A typical pay from a source, for this work in this market: the one reference that can make it a scam sign.
      if (middle(own) >= middle(typicalPay) * 1.75) flag('scam', `pay far above the market: ${posting.pay} against ${own.currency} ${money(middle(typicalPay))} per ${own.per} (the typical pay given)`);
    } else {
      // The other postings found mix markets, titles and levels: well above them is only a thing to check.
      const same = all.filter((other) => other.n !== posting.n).map((other) => readPay(other.pay)).filter((other) => other && other.currency === own.currency && other.per === own.per);
      if (same.length >= 5) {
        const sorted = same.map(middle).sort((a, b) => a - b);
        const reference = sorted[Math.floor(sorted.length / 2)];
        if (middle(own) >= reference * 1.75) flag('check', `pay well above the other postings found: ${posting.pay} against a median of ${own.currency} ${money(reference)} per ${own.per} (${same.length} other postings, any market or level): compare it with a typical pay for the market from a source (scout_pay)`);
      }
    }
  }

  // What the text says, when it was read. A tender's contact is the buyer's, from an official
  // notice: a small public body writing from a personal address is not a sign of a scam there.
  let checked = 'not read yet: read it with scout_posting to check for fees, documents and contact addresses';
  let found = [];
  if (Array.isArray(posting.checks)) {
    found = posting.checks;
    checked = posting.checkedFull === false ? 'the short extract the source gives' : 'the full text';
  } else if (posting.text) {
    found = textSignals(posting.text, { full: posting.textFull === true, ...textOptions(posting) });
    checked = posting.textFull === true ? 'the full text' : 'the short extract the source gives';
  }
  for (const item of found) if (!(tender && /^contact /.test(String(item?.what ?? '')))) flags.push(item);

  // Legitimacy: only computed facts lower it (scam and ghost-job signs from dates, pay and the
  // text's length; no pay is shown but does not). A warning sign found by text patterns is listed
  // for the model to judge against the whole posting, since wording can mislead either way: it does
  // not lower the suggestion. Things to check and notes do not either.
  const counted = flags.filter((item) => !fromText(item));
  const scams = counted.filter((item) => item.kind === 'scam').length;
  const ghosts = counted.filter((item) => item.kind === 'ghost' && item.what !== 'no pay given').length;
  const textual = flags.filter(fromText).length;
  const toCheck = flags.filter((item) => item.kind === 'check').length;
  const score = scams >= 2 ? 1 : scams === 1 ? 2 : Math.max(2, 5 - ghosts);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const where = checked.startsWith('not read') ? 'what the source listed (text not read yet)' : checked;
  const signs = [scams ? plural(scams, 'scam sign') : '', ghosts ? plural(ghosts, 'ghost-job sign') : ''].filter(Boolean).join(', ');
  const legitimacy = {
    score,
    reason: [
      signs || (textual ? 'no computed warning signs' : `no warning signs in ${where}`),
      textual ? `${plural(textual, 'warning sign')} found in the text, not counted: judge ${textual === 1 ? 'it' : 'them'} against the whole posting and the words quoted` : '',
      !scams && !ghosts && flags.some((item) => item.what === 'no pay given') ? 'no pay given, which does not lower it' : '',
      toCheck ? `${plural(toCheck, 'thing')} to check` : '',
    ].filter(Boolean).join('; '),
  };
  return { freshness, pay, legitimacy, flags, checked };
}

/** The signals as one short line, for the report's table. */
export function signalLine(result) {
  return result.flags.map((item) => signalText(item)).join('; ');
}

/** The report's `signals` cell: the signals, and whether the posting's text was read at all. */
export function signalCell(result) {
  const line = signalLine(result);
  const unread = String(result.checked ?? '').startsWith('not read');
  if (!line) return unread ? 'none found (text not read)' : 'none found';
  return unread ? `${line}; text not read` : line;
}

/** One posting's checks, as text for the model. */
export function assessText(posting, result) {
  const score = (part) => (part.score ? `suggested ${part.score}` : 'no suggestion');
  return [
    `P${posting.n} · ${posting.title || '(no title)'}${posting.company ? ` — ${posting.company}` : ''}`,
    `   Freshness: ${score(result.freshness)} (${result.freshness.reason})`,
    `   Pay: ${score(result.pay)} (${result.pay.reason})`,
    `   Legitimacy: suggested ${result.legitimacy.score} (${result.legitimacy.reason})`,
    ...result.flags.map((item) => `   - ${signalText(item, 'long')}`),
    `   Text checked: ${result.checked}`,
  ].join('\n');
}
