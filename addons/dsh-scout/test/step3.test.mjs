// Step 3 of the Scout plan, offline: the checks on postings and their scores (C1), earlier reports
// read and compared (C2), contact details kept out of searches (C3), and the UK and US tender
// readers (C4), fed with answers saved from the UK services or shaped from SAM.gov's documentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contactIn, emailsIn, masked, phonesIn } from '../lib/contact.js';
import { assess, signalCell, signalLine, signalText, textOptions, textSignals } from '../lib/assess.js';
import { checkRows, compare, csv, listReports, parseCsv, readReport, reportRows, seenBefore, seenKeys, writeReport } from '../lib/report.js';
import { ADAPTERS } from '../lib/adapters.js';
import { gaps, readRegistry, SEED, isSearchOnly, searchOnlyHosts } from '../lib/registry.js';
import { SEARCHES, OFFLINE, TOOLS } from '../lib/mode.js';
import { hooks, forget } from '../lib/net.js';
import { openStore } from '../lib/store.js';
import { openFolder, openProfile } from '../lib/private.js';
import { readSelection } from '../lib/selection.js';
import { buildTools } from '../lib/tools.js';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const TODAY = Date.parse('2026-11-15T10:00:00Z');
const realNow = hooks.now;

/** Answer requests from a table of address patterns; remember every request. */
function network(table, now = TODAY) {
  const asked = [];
  hooks.get = async (url, headers) => {
    asked.push({ url, headers });
    for (const [pattern, answer] of table) if (pattern.test(url)) return typeof answer === 'function' ? answer(url, headers) : answer;
    return { status: 404, text: '' };
  };
  hooks.sleep = async () => {};
  hooks.now = () => now;
  forget();
  return asked;
}
test.after(() => {
  hooks.now = realNow;
});

const UK = [
  [/contractsfinder\.service\.gov\.uk\/Published\/Notices\/OCDS\/Search\?.*cursor=/, { status: 200, text: JSON.stringify({ releases: [], links: {} }) }],
  [/contractsfinder\.service\.gov\.uk\/Published\/Notices\/OCDS\/Search\?/, { status: 200, text: fixture('contracts-finder.json') }],
  [/find-tender\.service\.gov\.uk\/api\/1\.0\/ocdsReleasePackages\?.*cursor=/, { status: 200, text: JSON.stringify({ releases: [], links: {} }) }],
  [/find-tender\.service\.gov\.uk\/api\/1\.0\/ocdsReleasePackages\?/, { status: 200, text: fixture('find-a-tender.json') }],
];

/** A SAM.gov answer in the shape its documentation gives (example values, no real person). */
const SAM_ANSWER = {
  totalRecords: 1,
  limit: 50,
  offset: 0,
  opportunitiesData: [{
    noticeId: 'abc123def456',
    title: 'Data Analytics Support Services',
    solicitationNumber: '47QTCA26R0001',
    fullParentPathName: 'GENERAL SERVICES ADMINISTRATION.FEDERAL ACQUISITION SERVICE.GSA/FAS CENTER FOR IT',
    postedDate: '2026-11-10',
    type: 'Solicitation',
    baseType: 'Solicitation',
    typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)',
    responseDeadLine: '2026-12-05T17:00:00-05:00',
    naicsCode: '541511',
    active: 'Yes',
    pointOfContact: [{ type: 'primary', email: 'contracting@example.gov', phone: '2025550100', title: 'Contracting Officer', fullName: 'Contracting team' }],
    description: 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=abc123def456',
    placeOfPerformance: { city: { name: 'Arlington' }, state: { code: 'VA' }, country: { code: 'USA' } },
    uiLink: 'https://sam.gov/opp/abc123def456/view',
  }],
};

test('C3: contact details are found in searches; dates, pay, codes and posting numbers are not', () => {
  for (const phone of ['+49 151 23456789', '+1 (555) 123-4567', '0044 20 7946 0958', '555-123-4567', '030 12345678', '07700 900123', '612 345 678', '91 123 45 67', '07700900123', 'Tel. 089/1234567', '612 34 56 78', 'data engineer Juan 612 34 56 78', '612345678', 'data engineer 2025550100', '555.123.4567', '0151.234.5678']) assert.ok(phonesIn(phone).length > 0, phone);
  for (const fine of ['Data Engineer Berlin', 'site:jobs.lever.co data engineer', '2026-11-14', '14.11.2026', '90,000-110,000', '90.000 - 110.000', 'ISCO 2511', 'SOC 15-1252.00', 'CPV 72000000-5', '10115 Berlin', '10000-1201234567-S', '2020-2024', 'NAICS 541511', 'C++ 20 developer']) assert.deepEqual(phonesIn(fine), [], fine);
  // Pay ranges and date ranges written without spaces, as in German and Spanish searches.
  for (const fine of ['70.000-90.000', '45.000-55.000€', '45.000-60.000', '100.000-120.000 EUR', '45.000€-55.000€', '70.000 € - 90.000 € brutto', '$90,000-$110,000', 'Data Engineer Gehalt 70.000-90.000 München', 'Data Engineer 60.000-80.000', 'EUR 1.200.000-1.500.000', '01.10.2026-31.03.2027', '2026-10-01/2027-03-31', '11/15/2026-12/31/2026']) assert.deepEqual(phonesIn(fine), [], fine);
  // Pay ranges with a space between the thousands: a run from 0 after "45 " is not a number to call.
  for (const fine of ['45 000-55 000 €', '45 000 - 55 000', 'Gehalt 120 000-150 000 EUR', 'C++20 70.000-90.000', '70.000 +10.000 Bonus', 'EUR 650.000.000', '612.345.678 €']) assert.deepEqual(phonesIn(fine), [], fine);
  // Dotted or comma groups after an international prefix or a trunk group are the number's own, not
  // an amount; the Spanish 3-3-3 form also with dots or dashes.
  for (const phone of ['+34 612.345.678', '0034 612.345.678', '+49 151 234.567', '07700 900.123', '+34 612,345,678', '+49 151 234,567', '612.345.678', '612-345-678', 'llámame al 612.345.678']) assert.ok(phonesIn(phone).length > 0, phone);
  assert.equal(contactIn({ queries: ['data engineer +34 612.345.678'] }).kind, 'a phone number');
  assert.equal(contactIn({ what: 'Data Engineer', where: 'London 07700 900.123' }).kind, 'a phone number');
  // A bare run of 9 or 10 digits counts in free text, not in a web address or inside a longer code.
  assert.deepEqual(phonesIn('2025550100', { bare: false }), []);
  assert.deepEqual(phonesIn('job id 1201234567 and /jobs/612345678'), []);
  assert.deepEqual(contactIn({ queries: ['data engineer 2025550100'] }), { kind: 'a phone number', text: '2025550100' });
  assert.equal(contactIn({ what: 'Data Engineer 612345678' }).kind, 'a phone number');
  assert.equal(contactIn({ what: 'Data Engineer Gehalt 70.000-90.000', where: 'München' }), undefined, 'a German pay range is not refused');
  assert.equal(contactIn({ url: 'https://example.org/jobs?id=2025550100' }), undefined, 'an id in a page address is not a phone number');
  assert.deepEqual(emailsIn('write to jane.doe@example.org or jobs@beta.de'), ['jane.doe@example.org', 'jobs@beta.de']);
  assert.deepEqual(contactIn({ queries: ['data engineer', 'jane.doe@example.org data'] }), { kind: 'an email address', text: 'jane.doe@example.org' });
  assert.equal(contactIn({ what: 'Data Engineer', where: 'Berlin', days: 14 }), undefined);
  assert.equal(contactIn({ url: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1201234567-S' }), undefined, 'a reference number in a page address is not a phone number');
  assert.equal(contactIn({ url: 'https://example.org/search?q=jane%40example.org' }).kind, 'an email address', 'an encoded address in a page address is found');
  assert.equal(contactIn({ url: 'https://example.org/search?q=%2B49%20151%2023456789' }).kind, 'a phone number');
  assert.equal(contactIn({ question: 'Who hires data engineers?', items: ['Acme', 'call +44 20 7946 0958'] }).kind, 'a phone number', 'nested lists are checked');
  // Third review: only the shape of a thousands group is left alone ("45 000-55 000", "1 000 000"),
  // not "00" and a country code or a trunk group after a house or room number; a "+N" before a pay
  // range is not a phone prefix.
  for (const phone of ['Room 101 0044 20 7946 0958', 'Musterweg 3 0151 2345 6789', 'Hausnr 12 0049 30 12345678', 'Mo-Fr 9 07700 900123']) assert.ok(phonesIn(phone).length > 0, phone);
  for (const fine of ['Remote GMT +1 70.000-90.000', 'remote (UTC +1) 70.000-90.000 EUR', '1 200 000', '1 000 000 000', 'EUR 1 050 000 000', '45 000/55 000']) assert.deepEqual(phonesIn(fine), [], fine);
  assert.equal(contactIn({ what: 'Data Engineer', where: 'Remote GMT +1 70.000-90.000' }), undefined);
  assert.equal(contactIn({ what: 'Data Engineer', where: 'Room 101 0044 20 7946 0958' }).kind, 'a phone number');
  // Fourth review: a "+N" before a range with spaces between the thousands is not a phone prefix;
  // the thousands shape needs every group after the first to be exactly 3 digits.
  for (const fine of ['Remote CET +1 45 000-55 000 €', 'UTC +2 120 000-150 000 EUR', '1 000 000-2 000 000']) assert.deepEqual(phonesIn(fine), [], fine);
  assert.equal(contactIn({ what: 'Data Engineer', where: 'Remote CET +1 45 000-55 000 €' }), undefined);
  for (const phone of ['Office 2 030 123 456 78', 'Zimmer 12 030 123 45 67']) assert.ok(phonesIn(phone).length > 0, phone);
  assert.equal(contactIn({ what: 'Data Engineer', where: 'Zimmer 12 030 123 45 67' }).kind, 'a phone number');
  assert.equal(masked('jane.doe@example.org'), 'j…@example.org');
  assert.equal(masked('+49 151 23456789'), '…789');
  // Every tool on Scout's list that sends something out is checked; the ones that stay on this Mac are not.
  assert.ok(['scout_search', 'scout_demand', 'scout_titles', 'scout_pay', 'web_search', 'web_fetch', 'deep_research', 'finance_news'].every((name) => SEARCHES.includes(name)));
  assert.ok(OFFLINE.every((name) => !SEARCHES.includes(name) && TOOLS.includes(name)));
});

test('C1: warning signs in a posting\'s text', () => {
  const kinds = (text, options) => textSignals(text, options).map((item) => `${item.kind}: ${item.what}`);
  const long = (text) => `${text} ${'We build data pipelines for logistics customers across Europe. '.repeat(10)}`;
  assert.match(kinds(long('A one-time registration fee of $50 is required before onboarding.')).join(), /scam: asks the applicant for money/);
  assert.deepEqual(kinds(long('We never ask for a fee, a deposit or your bank details.')), [], 'a "never" turns it around');
  assert.deepEqual(kinds(long('We cover the training fee and we pay the deposit for your flat.')), [], 'the employer paying is not a request for money');
  assert.match(kinds(long('You must pay a small fee before the interview.')).join(), /asks the applicant for money/);
  assert.match(kinds(long('Please send a copy of your passport with your application.')).join(), /personal documents/);
  assert.match(kinds(long('Bitte senden Sie eine Ausweiskopie und zahlen Sie die Bearbeitungsgebühr.')).join(), /money[\s\S]*documents/);
  assert.match(kinds(long('Envía una copia del DNI y tus datos bancarios.')).join(), /personal documents/);
  assert.match(kinds(long('Apply by writing to hiring.team2026@gmail.com today.')).join(), /contact only through a personal email address \(gmail\.com\)/);
  assert.deepEqual(kinds(long('Apply to jobs@beta-gmbh.de; questions to recruiter.beta@gmail.com.')), [], 'a company address beside a personal one is fine');
  assert.match(kinds(long('To apply, contact us on WhatsApp.')).join(), /messaging app \(WhatsApp\)/);
  assert.deepEqual(kinds(long('Our engineers built a Telegram bot for our customers.')), [], 'an app named in passing is not a way of contact');
  assert.match(kinds(long('Join our talent pool for future opportunities.')).join(), /ghost: collects applications/);
  assert.match(kinds(long('Uncapped commission and be your own boss!')).join(), /promises earnings/);
  assert.match(kinds('Data engineer wanted. Apply now.').join(), /little detail/);
  assert.deepEqual(kinds('Data engineer wanted. Apply now.', { full: false }), [], 'a short extract is not judged for detail');
  const fee = textSignals(long('A one-time registration fee of $50 is required before onboarding.'))[0];
  assert.match(fee.quote, /registration fee of \$50/, 'the signal quotes the words behind it');
  // Social security numbers, in any case.
  assert.match(kinds(long('Please provide your Social Security Number and date of birth to start onboarding.')).join(), /scam: asks for personal documents/);
  assert.match(kinds(long('Send your SSN to complete the form.')).join(), /personal documents/);
  // Money and document words only count when they are asked of the applicant.
  assert.match(kinds(long('Buy gift cards and send us the codes before your interview.')).join(), /asks the applicant for money/);
  assert.match(kinds(long('A copy of your passport is required before the interview.')).join(), /personal documents/);
  assert.deepEqual(kinds(long('You will build a platform for gift cards and loyalty.')), [], 'gift cards as the product');
  assert.deepEqual(kinds(long('We are a fintech offering credit card information security services.')), [], 'card information as the business');
  assert.deepEqual(kinds(long('We need your bank details for direct deposit after your offer is signed.')), [], 'payroll after an offer');
  assert.deepEqual(kinds(long('We offer training fees reimbursement.')), [], 'training paid back by the employer');
  // A founder on Hacker News often writes from a personal address: a thing to check, not a scam sign.
  assert.deepEqual(kinds(long('Email your resume to founder@gmail.com.'), { community: true }), ['check: contact only through a personal email address (gmail.com): common for founders on Hacker News; check that the company exists']);
  assert.match(kinds(long('Email your resume to founder@gmail.com.')).join(), /^scam: contact only through a personal email address/);
  // A tender's published contact is the buyer's.
  assert.deepEqual(kinds(long('Questions to the clerk, clerk.parish@gmail.com, or on WhatsApp.'), { tender: true }), []);

  // Finance and payroll work handles other people's bank details and fees: not a request of the
  // applicant. "You will <verb>" describes the work; documents count only as the applicant's own
  // ("your") or sent to someone named ("us", "the recruiter").
  for (const duty of [
    'Your tasks:\n- Enter employee bank details and social security numbers into the payroll system.\n- Reconcile bank statements every month.',
    'You will upload supplier bank details to SAP and process application fees and processing fees for our customers.',
    'You will send invoices, pay processing fees to card providers and provide credit card details to approved vendors.',
    'You will send gift cards to our loyalty customers.',
    '- Submit SSN and bank account details of new hires to the payroll provider.',
    'Process advance payments and refundable deposits for tenants.',
    'Proporcionar los datos bancarios de los proveedores al banco.',
    'Übermitteln der Bankverbindung neuer Mitarbeiter an die Bank und Buchung der Bearbeitungsgebühr.',
  ]) assert.deepEqual(kinds(long(duty)), [], duty);
  for (const ask of ['Send us a copy of the passport before the interview.', 'Please send the bank details to the recruiter today.', 'Provide your bank details to complete your registration.', 'Senden Sie uns Ihre Bankverbindung.', 'You will be asked to send your passport and bank details.']) assert.match(kinds(long(ask)).join(), /scam: asks for personal documents/, ask);
  assert.match(kinds(long('Applicants must pay the application fee by bank transfer.')).join(), /scam: asks the applicant for money/, 'a fee by name, asked of the applicant');
  // Waived fees, and fees an agency's client pays.
  for (const waived of ['The registration fee is waived for all applicants.', 'We waive the registration fee for all applicants.', 'Free of registration fees and placement fees.', 'Our client pays the registration fee, so the process is free for you.', 'The registration fee is paid by our client.', 'Unser Kunde übernimmt die Anmeldegebühr.', 'A copy of your passport is not required at this stage.']) assert.deepEqual(kinds(long(waived)), [], waived);
  // A tender names fees as part of the work; only a request made of the bidder counts.
  for (const scope of [
    'The supplier will collect application fees and processing fees from residents. A registration fee of GBP 20 applies to each event booking.',
    'Pay processing fees to the card provider monthly. Process advance payments for the council.',
    'The contract covers the onboarding fee for new tenants and the upfront fee charged by the venue.',
  ]) assert.deepEqual(kinds(long(scope), { tender: true }), [], scope);
  for (const ask of ['Bidders must pay a fee of GBP 50 to receive the tender documents.', 'Please pay the registration fee of GBP 100 before you submit a bid.', 'Suppliers are required to pay a processing fee of GBP 75 with their bid.']) assert.match(kinds(long(ask), { tender: true }).join(), /^scam: asks the bidder for money$/, ask);

  // Third review. Signs found by text patterns are marked as such: they are shown as signs to verify.
  const worded = textSignals(long('To start, pay us a registration fee of $50.'));
  assert.equal(worded[0].from, 'text');
  assert.equal(signalText(worded[0]), `warning sign (check): asks the applicant for money — '${worded[0].quote}'`);
  assert.equal(textSignals('Data engineer wanted. Apply now.')[0].from, undefined, 'the text\'s length is a fact, not wording');
  // Application, processing, administration and placement fees count only with the applicant as the
  // payer: not from a bare bullet or an imperative after a colon.
  for (const duty of ['Responsibilities:\n- Pay supplier invoices and processing fees.', 'Your tasks:\n- Pay placement fees to agencies on time.', 'Please note the duties: pay supplier invoices and processing fees.', 'You must pay attention to processing fees and payment terms.', 'You will pay the deposit for new tenants.']) assert.deepEqual(kinds(long(duty)), [], duty);
  for (const ask of ['Pay us the processing fee before the interview.', 'Transfer the placement fee to the recruiter.', 'Please pay the processing fee to complete your application.', 'Pay your application fee via our portal.', 'Candidates are asked to wire the administration fee.']) assert.match(kinds(long(ask)).join(), /^scam: asks the applicant for money$/, ask);
  // Fee wording that was missed: "you will", "you'll", "candidates will" pay a … fee or deposit.
  for (const ask of ['You will pay a one-time processing fee of $80 for your equipment.', 'You\'ll need to pay a refundable deposit', 'Candidates will pay an administration fee']) assert.match(kinds(long(ask)).join(), /^scam: asks the applicant for money$/, ask);
  // Spanish requests with an attached pronoun, German du-forms.
  for (const ask of ['Envíanos una copia de tu DNI.', 'Envíanos tus datos bancarios.', 'Envíenos sus datos bancarios.', 'Mándanos tu pasaporte', 'Schick uns deine Bankdaten']) assert.match(kinds(long(ask)).join(), /^scam: asks for personal documents or bank details$/, ask);
  assert.match(kinds(long('Überweise die Gebühr')).join(), /^scam: asks the applicant for money$/);
  for (const duty of ['Sie überweisen die Gebühren an Lieferanten.', 'Compra de material y pago de la cuota de formación.']) assert.deepEqual(kinds(long(duty)), [], duty);
  // In a tender the bidder must be the one to pay.
  for (const scope of ['Residents must pay a permit fee; the supplier will collect it.', 'Residents must pay a registration fee; the supplier will collect it.', 'The supplier must pay the registration fee to the venue on behalf of the council.']) assert.deepEqual(kinds(long(scope), { tender: true }), [], scope);
  for (const ask of ['Tenderers have to pay a deposit of GBP 200.', 'An administration fee of GBP 50 is payable by bidders.', 'Please pay the administration fee of GBP 40 with your bid.', 'You will need to pay an administration fee with your bid.']) assert.match(kinds(long(ask), { tender: true }).join(), /^scam: asks the bidder for money$/, ask);
  // "us", "me", "the recruiter" count only as the object of the request.
  for (const duty of ['Join us to manage payroll: provide bank details of new hires to the payroll provider.', 'Help us keep payroll running: submit bank details of new hires to the provider.', 'Join us and send bank details of new hires to the bank.']) assert.deepEqual(kinds(long(duty)), [], duty);
  for (const ask of ['Email us your bank details.', 'Send the bank details to us before the interview.', 'Send us your passport.']) assert.match(kinds(long(ask)).join(), /^scam: asks for personal documents or bank details$/, ask);
  // A "free of charge" or a "we cover" in another clause does not turn a fee around; within a list it still does.
  for (const ask of ['Training is free of charge, you only pay a registration fee of 50 euros.', 'The interview is free of charge but a registration fee of $50 is required.', 'The interview is free of charge, a registration fee of $50 is required.', 'A registration fee of $50 applies, the interview is free of charge.']) assert.match(kinds(long(ask)).join(), /^scam: asks the applicant for money$/, ask);
  for (const waived of ['We cover the training fee, the registration fee and the deposit.', 'The registration fee, onboarding fee and deposit are waived.', 'We don\'t charge $1,000 registration fees.', 'We need your bank details, which we use for payroll after your offer is signed.']) assert.deepEqual(kinds(long(waived)), [], waived);

  // Text signs are hints to check and never counted in the score, so catching a real request matters
  // more than staying quiet on an anti-scam notice: a comma ends the clause, and "never" reaches 40
  // characters back. (An anti-scam notice with a list, such as "We do not charge application,
  // processing or registration fees.", may give a hint the model then dismisses.)
  assert.deepEqual(kinds(long('We won\'t ask for a registration fee.')), []);
  for (const ask of [
    'No experience required, just pay the registration fee and start today.',
    'No experience needed, just fill in the form and pay the registration fee.',
    'Sin experiencia, regístrate y paga la cuota de inscripción.',
    'Keine Erfahrung nötig, melde dich an und zahle die Anmeldegebühr.',
    'We don\'t need a CV, just send us your CV and pay the registration fee.',
    'We do not offer remote work and the candidate must pay a registration fee.',
    'Don\'t miss this opportunity to join our team and pay the registration fee today.',
    'We\'ll send you a link to pay the registration fee.',
    'We’ll give you the job once you pay the onboarding fee.',
  ]) assert.match(kinds(long(ask)).join(), /scam: asks the applicant for money/, ask);
  for (const ask of ['No experience required, register now and send us your bank details.', 'There is no catch, just provide your bank details and start earning.']) assert.match(kinds(long(ask)).join(), /scam: asks for personal documents or bank details/, ask);
  // ... but not a list that a verb makes a clause of its own, nor one that "you" starts.
  for (const ask of ['The interview is free of charge, and a registration fee of $50 is required.', 'The interview is free of charge, a registration fee and a deposit are required.', 'Training is free of charge, and you only pay a registration fee.', 'A registration fee of $50 applies, and the interview is free of charge.']) assert.match(kinds(long(ask)).join(), /^scam: asks the applicant for money$/, ask);
  // "please" and "send us" count only for the money or document words they ask for.
  for (const cv of [
    'Send us your CV if you have experience with placement fees and invoicing.',
    'Please send your CV if you have experience with bank details and payroll.',
    'Bitte senden Sie uns Ihren Lebenslauf, wenn Sie Erfahrung mit Bankdaten haben.',
    'Envíanos tu CV si tienes experiencia con datos bancarios de clientes.',
    'Experience with bank details and payroll, send us your CV.',
  ]) assert.deepEqual(kinds(long(cv)), [], cv);
  for (const ask of ['If you are shortlisted, please send your bank details.', 'Please send us the bank details today.', 'Bitte senden Sie uns die Bankdaten.', 'Por favor, envíanos tus datos bancarios.']) assert.match(kinds(long(ask)).join(), /^scam: asks for personal documents or bank details$/, ask);
  // "you'll" and "kindly" are requests; the employer or the client paying is not.
  for (const ask of ['You\'ll need to buy gift cards.', 'You’ll need to buy gift cards.', 'Kindly pay the processing fee of $50 to the recruiter.']) assert.match(kinds(long(ask)).join(), /^scam: asks the applicant for money$/, ask);
  assert.match(kinds(long('Kindly send a copy of your passport.')).join(), /^scam: asks for personal documents or bank details$/);
  for (const covered of ['La empresa paga la cuota de formación.', 'El cliente paga la tasa de inscripción.', 'Der Arbeitgeber übernimmt die Anmeldegebühr.']) assert.deepEqual(kinds(long(covered)), [], covered);
  // Tenders: "pay attention" is never a payment, and what "the supplier shall pay" is the contract's.
  for (const scope of ['You must pay attention to the registration fee.', 'Bidders must pay attention to the administration fee.', 'Please pay close attention to the administration fee before you submit your bid.', 'The supplier shall pay the registration fee for each event.', 'Bidders shall pay a fee of GBP 50.']) assert.deepEqual(kinds(long(scope), { tender: true }), [], scope);
  assert.match(kinds(long('You\'ll need to pay an administration fee with your bid.'), { tender: true }).join(), /^scam: asks the bidder for money$/);
});

test('C1: freshness, pay and legitimacy suggestions, with the signals behind them', () => {
  const at = { today: TODAY, target: '90k EUR' };
  const fresh = assess({ n: 1, title: 'Data Engineer', company: 'Beta', posted: '2026-11-12', pay: 'EUR 85,000–100,000', text: 'x'.repeat(500), textFull: true }, at);
  assert.equal(fresh.freshness.score, 5);
  assert.match(fresh.freshness.reason, /3 days ago/);
  assert.equal(fresh.pay.score, 5);
  assert.match(fresh.pay.reason, /reaches the target of 90,000/);
  assert.equal(fresh.legitimacy.score, 5);
  assert.equal(fresh.checked, 'the full text');

  const old = assess({ n: 2, title: 'Analyst', company: 'Gamma', posted: '2026-09-01', firstPosted: '2026-06-01', pay: 'EUR 60,000', checks: [], checkedFull: true }, at);
  assert.equal(old.freshness.score, 1);
  assert.match(old.freshness.reason, /first posted 2026-06-01/);
  assert.equal(old.pay.score, 2, '60,000 is a third below the target');
  assert.match(signalLine(old), /still listed 75 days[\s\S]*posted again: first posted 2026-06-01/);
  assert.equal(old.legitimacy.score, 3, 'two ghost-job signs');

  const noPay = assess({ n: 3, title: 'Engineer', company: 'Delta', posted: '2026-11-10' }, at);
  assert.equal(noPay.pay.score, 3);
  assert.match(noPay.pay.reason, /no pay given/);
  assert.equal(noPay.legitimacy.score, 5, 'no pay alone does not lower legitimacy');
  assert.match(noPay.checked, /not read yet/);

  // Against the other postings found (any market, title or level), pay well above them is only a thing to check.
  const market = [60, 62, 65, 68, 70].map((k, i) => ({ n: 10 + i, title: `Role ${i}`, company: `C${i}`, pay: `EUR ${k},000` }));
  const tooGood = assess({ n: 4, title: 'Junior data entry', company: 'Omega', posted: '2026-11-14', pay: 'EUR 150,000–200,000' }, { ...at, all: market });
  assert.match(signalLine(tooGood), /^to check: pay well above the other postings found: EUR 150,000–200,000 against a median of EUR 65,000 per year \(5 other postings, any market or level\)/);
  assert.doesNotMatch(signalLine(tooGood), /scam sign/);
  assert.equal(tooGood.legitimacy.score, 5, 'a thing to check does not lower legitimacy');
  assert.match(tooGood.legitimacy.reason, /1 thing to check/);
  // Against a typical pay from a source for that market, it is a scam sign.
  const sourced = assess({ n: 4, title: 'Junior data entry', company: 'Omega', posted: '2026-11-14', pay: 'EUR 150,000–200,000' }, { ...at, all: market, typical: 'EUR 65,000 per year' });
  assert.match(signalLine(sourced), /^scam sign: pay far above the market: EUR 150,000–200,000 against EUR 65,000 per year \(the typical pay given\)/);
  assert.equal(sourced.legitimacy.score, 2);
  // Germany and Spain both pay in EUR: normal Munich pay among Madrid postings is never a scam sign.
  const madrid = [32, 35, 38, 40, 45].map((k, i) => ({ n: 40 + i, title: 'Data Engineer', company: `Empresa ${i}`, location: 'Madrid', pay: `EUR ${k},000–${k + 8},000` }));
  const munich = { n: 46, title: 'Senior Data Engineer', company: 'Beta GmbH', location: 'München', posted: '2026-11-12', pay: 'EUR 75,000–90,000' };
  const mixed = assess(munich, { today: TODAY, all: [...madrid, munich] });
  assert.doesNotMatch(signalLine(mixed), /scam sign/);
  assert.equal(mixed.legitimacy.score, 5);
  assert.deepEqual(mixed.flags.map((item) => item.kind), ['check']);
  assert.deepEqual(assess(munich, { today: TODAY, all: [...madrid, munich], typical: 'EUR 80,000 per year' }).flags, [], 'with Germany\'s typical pay there is nothing to flag');
  const typical = assess({ n: 5, title: 'Engineer', company: 'Zeta', pay: 'GBP 900 per day' }, { today: TODAY, typical: 'GBP 450 per day' });
  assert.match(signalLine(typical), /far above the market[\s\S]*the typical pay given/);
  assert.match(typical.pay.reason, /no pay target/);
  const otherCurrency = assess({ n: 6, title: 'Engineer', company: 'Eta', pay: 'GBP 600 per day' }, at);
  assert.match(otherCurrency.pay.reason, /not compared/);
  assert.equal(otherCurrency.pay.score, undefined);
  const otherPeriod = assess({ n: 11, title: 'Engineer', company: 'Theta', pay: '650 per day' }, { today: TODAY, target: '90000' });
  assert.match(otherPeriod.pay.reason, /per day, the target pay per year: not compared/, 'a day rate is not compared with a yearly target');

  const scam = assess({ n: 7, title: 'Assistant', company: 'Kappa', posted: '2026-11-14', checks: [{ kind: 'scam', what: 'asks the applicant for money', quote: 'a fee of $50' }, { kind: 'scam', what: 'contact through a messaging app (WhatsApp)' }], checkedFull: false }, at);
  assert.equal(scam.legitimacy.score, 1);
  assert.equal(scam.checked, 'the short extract the source gives');

  // A warning sign found by text patterns is a sign to check, with the words behind it; it does
  // not lower the suggestion, and the reason says it is for the model to judge against the whole
  // posting. Only computed facts lower it, stated as they are.
  assert.equal(signalText({ kind: 'scam', what: 'asks the applicant for money', quote: 'pay a registration fee', from: 'text' }), 'warning sign (check): asks the applicant for money — \'pay a registration fee\'');
  assert.equal(signalText({ kind: 'ghost', what: 'no pay given' }), 'ghost sign: no pay given');
  const worded = assess({ n: 60, title: 'Assistant', company: 'Kappa', posted: '2026-11-14', pay: 'EUR 30,000', text: `To start, pay us a registration fee of $50. ${'We support small shops across Europe with their bookkeeping. '.repeat(8)}`, textFull: true }, at);
  assert.match(signalLine(worded), /^warning sign \(check\): asks the applicant for money — '[^']*pay us a registration fee of \$50[^']*'$/);
  assert.doesNotMatch(signalLine(worded), /scam sign/);
  assert.equal(worded.legitimacy.score, 5, 'a text sign does not lower the suggestion');
  assert.equal(worded.legitimacy.reason, 'no computed warning signs; 1 warning sign found in the text, not counted: judge it against the whole posting and the words quoted');
  const both = assess({ n: 61, title: 'Assistant', company: 'Kappa', posted: '2026-08-01', text: `Join our talent pool for future opportunities. ${'We support small shops across Europe with their bookkeeping. '.repeat(8)}`, textFull: true }, at);
  assert.match(signalLine(both), /^ghost sign: still listed 106 days after it was posted; ghost sign: no pay given; warning sign \(check\): collects applications rather than filling one role — '/);
  assert.equal(both.legitimacy.score, 4, 'only the computed ghost-job sign (the age) lowers it');
  assert.equal(both.legitimacy.reason, '1 ghost-job sign; 1 warning sign found in the text, not counted: judge it against the whole posting and the words quoted');
  // Two text signs of the scam kind, and a computed one: only the computed one counts.
  const twoText = assess({ n: 62, title: 'Assistant', company: 'Kappa', posted: '2026-11-14', pay: 'EUR 30,000', text: `To start, pay us a registration fee of $50 and send us a copy of your passport. ${'We support small shops across Europe with their bookkeeping. '.repeat(8)}`, textFull: true }, at);
  assert.equal(twoText.flags.filter((item) => item.from === 'text').length, 2);
  assert.equal(twoText.legitimacy.score, 5, 'text signs never lower the suggestion, however many');
  assert.match(twoText.legitimacy.reason, /^no computed warning signs; 2 warning signs found in the text, not counted: judge them against the whole posting/);
  const withFact = assess({ n: 63, title: 'Junior data entry', company: 'Omega', posted: '2026-11-14', pay: 'EUR 150,000–200,000', text: `To start, pay us a registration fee of $50. ${'We support small shops across Europe with their bookkeeping. '.repeat(8)}`, textFull: true }, { ...at, typical: 'EUR 65,000 per year' });
  assert.equal(withFact.legitimacy.score, 2, 'pay far above a typical pay from a source is a computed scam sign');
  assert.match(withFact.legitimacy.reason, /^1 scam sign; 1 warning sign found in the text, not counted/);
  // A very short text is a measured fact: it counts.
  assert.equal(assess({ n: 64, title: 'Assistant', company: 'Kappa', posted: '2026-11-14', pay: 'EUR 30,000', text: 'Assistant wanted. Apply now.', textFull: true }, at).legitimacy.score, 4);

  const tender = assess({ n: 8, title: 'Street lighting', company: 'Council', type: 'tender', posted: '2026-08-03', closes: '2026-11-23', value: 'GBP 50,000' }, at);
  assert.equal(tender.freshness.score, 4, 'a tender is judged by the days left to respond');
  assert.doesNotMatch(signalLine(tender), /still listed|no pay/);
  assert.match(tender.pay.reason, /contract value of GBP 50,000/);
  const parish = assess({ n: 10, title: 'Hall cleaning', company: 'Parish council', type: 'tender', closes: '2026-12-20', checks: [{ kind: 'scam', what: 'contact only through a personal email address (gmail.com)' }] }, at);
  assert.equal(parish.legitimacy.score, 5, 'a public buyer\'s published contact is not a scam sign');
  const closed = assess({ n: 9, title: 'Old tender', company: 'Council', type: 'tender', posted: '2026-10-01', closes: '2026-11-01' }, at);
  assert.equal(closed.freshness.score, 1);

  // One role in several towns is a note; the same job in the same town with posting dates weeks apart is a repost.
  const twins = ['Berlin', 'Hamburg', 'Köln'].map((city, i) => ({ n: 20 + i, title: 'Data Engineer (m/w/d)', company: 'Sigma', location: city, posted: '2026-11-12' }));
  const several = assess(twins[0], { today: TODAY, all: twins });
  assert.match(signalLine(several), /^note: the same title from the same company in 3 places \(P20, P21, P22: Berlin, Hamburg, Köln\): common for one role offered in several places/);
  assert.equal(several.legitimacy.score, 5, 'several places are not a ghost-job sign');
  const again = assess({ n: 30, title: 'Data Engineer', company: 'Sigma', location: 'Berlin', posted: '2026-11-10', dates: ['2026-09-20'] }, { today: TODAY });
  assert.match(signalLine(again), /ghost sign: posted again: first posted 2026-09-20, again 2026-11-10/);
  assert.equal(again.freshness.score, 4, 'a repost lowers freshness by one');
  assert.equal(again.legitimacy.score, 4);
  assert.deepEqual(assess({ n: 31, title: 'Data Engineer', company: 'Sigma', location: 'Berlin', posted: '2026-11-10', dates: ['2026-11-09'], pay: 'EUR 80,000' }, { today: TODAY }).flags, [], 'a copy on another board a day apart is not a repost');

  // The store keeps the other posting date when the same job is found again.
  const store = openStore();
  store.add('r', 'ba', [{ title: 'Data Engineer', company: 'Sigma', location: 'Berlin', url: 'https://example.org/1', posted: '2026-09-20' }]);
  store.add('r', 'arbeitnow', [{ title: 'Data Engineer', company: 'Sigma', location: 'Berlin', url: 'https://example.org/2', posted: '2026-11-10' }]);
  const kept = store.get('r', 'P1');
  assert.deepEqual(kept.dates, ['2026-11-10']);
  assert.match(signalLine(assess(kept, { today: TODAY, all: store.all('r') })), /posted again: first posted 2026-09-20, again 2026-11-10/);

  // The report's cell says when the text was never read.
  assert.equal(signalCell(assess({ n: 50, title: 'Engineer', company: 'Delta', posted: '2026-11-12', pay: 'EUR 80,000' }, { today: TODAY })), 'none found (text not read)');
  assert.equal(signalCell(assess({ n: 51, title: 'Engineer', company: 'Delta', posted: '2026-11-12' }, { today: TODAY })), 'ghost sign: no pay given; text not read');
  assert.equal(signalCell(assess({ n: 52, title: 'Engineer', company: 'Delta', posted: '2026-11-12', pay: 'EUR 80,000', checks: [], checkedFull: true }, { today: TODAY })), 'none found');
});

test('C1, C2: the report\'s checks, its table, and earlier reports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-step3-'));
  try {
    const good = { rank: 1, title: 'Data Engineer', fit: 4, fit_reason: 'skills match', freshness: 5, freshness_reason: 'new', pay_score: 4, pay_reason: 'near target', legitimacy: 5, legitimacy_reason: 'public exchange', draft: 'Hello, I saw your new data team…', trigger: 'the posting of 12 November' };
    assert.deepEqual(checkRows([good]), { problems: [], missing: [] });
    const { problems, missing } = checkRows([{ ...good, fit: 7 }, { ...good, pay_reason: '' }, { ...good, trigger: '' }, { ...good, draft: 'x'.repeat(1001) }, { rank: 5, title: 'Bare' }]);
    assert.equal(problems.length, 4);
    assert.match(problems.join('\n'), /fit must be a whole number from 1 to 5[\s\S]*pay_score has no reason[\s\S]*real trigger[\s\S]*under 1000/);
    assert.deepEqual(missing, ['row 5 (Bare): fit', 'row 5 (Bare): freshness', 'row 5 (Bare): pay_score', 'row 5 (Bare): legitimacy']);

    const rows = [{ ...good, link: 'https://a/1', company: 'Beta, "Berlin"', reason: '=SUM(A1)' }, { rank: 2, title: 'Analyst', company: 'X', location: 'Bonn', link: 'https://a/2' }];
    const back = parseCsv(csv(rows));
    assert.equal(back[0].company, 'Beta, "Berlin"');
    assert.equal(back[0].reason, '=SUM(A1)', 'the formula guard is taken off when read back');
    assert.equal(back[1].title, 'Analyst');

    assert.deepEqual(listReports(dir), []);
    writeReport(dir, { title: 'Data engineer: Germany', markdown: '## Understanding\nA first run in Germany for data engineering work.', opportunities: rows }, new Date('2026-11-01T09:00:00Z'));
    const second = writeReport(dir, { title: 'Data engineer: Germany again', markdown: '## Understanding\nA second run in Germany for data engineering work.', opportunities: [rows[1]] }, new Date('2026-11-14T20:05:00Z'), '## Checked by Scout\n- 1. Analyst · seen 2026-11-01 09:00 UTC');
    const list = listReports(dir);
    assert.deepEqual(list.map((item) => item.name), ['2026-11-14-2005-data-engineer-germany-again', '2026-11-01-0900-data-engineer-germany'], 'newest first');
    assert.equal(list[1].title, 'Data engineer: Germany');
    assert.equal(list[1].rows, 2);
    assert.equal(list[0].saved, '2026-11-14 20:05 UTC');
    const text = readFileSync(second.markdown, 'utf8');
    assert.match(text, /nothing was sent, submitted or applied for/);
    assert.match(text, /## Checked by Scout/);
    assert.match(readReport(dir, list[1].name), /A first run in Germany/);
    assert.match(readReport(dir, `${list[1].name}.csv`), /^rank,posting,title/);
    assert.throws(() => readReport(dir, '../../etc/passwd'), /one saved report/);
    assert.throws(() => readReport(dir, 'nope'), /no saved report called nope\.md/);
    assert.equal(reportRows(dir, list[1].name).length, 2);

    const seen = seenBefore(dir);
    assert.equal(seen.get('https://a/1').report, list[1].name);
    assert.equal(seen.get('https://a/2').report, list[1].name, 'the first report a job was in is kept');
    const result = compare([{ n: 1, title: 'Data Engineer', company: 'Other', url: 'https://a/1' }, { n: 2, title: 'Architect', company: 'Y', location: 'Köln', url: 'https://b/3' }], reportRows(dir, list[1].name));
    assert.deepEqual(result.fresh.map((posting) => posting.n), [2]);
    assert.equal(result.again[0].row.rank, '1');
    assert.deepEqual(result.gone.map((row) => row.title), ['Analyst']);

    // Every posting a run found is noted beside its report (keys only), so "new" means not found by
    // that run, ranked or not.
    const found = [{ n: 1, title: 'Data Engineer', company: 'Beta, "Berlin"', url: 'https://a/1' }, { n: 2, title: 'Analyst', company: 'X', location: 'Bonn', url: 'https://a/2' }, { n: 3, title: 'Platform Engineer', company: 'Z', location: 'Berlin', url: 'https://a/3' }];
    const third = writeReport(dir, { title: 'Data engineer: Germany, third', markdown: '## Understanding\nA third run in Germany for data engineering work.', opportunities: [rows[0]], found }, new Date('2026-11-15T08:00:00Z'));
    assert.equal(third.seen, 6, 'the address and the title key of each posting found');
    const sidecar = readFileSync(join(dir, 'reports', `${third.name}.seen.json`), 'utf8');
    assert.ok(!sidecar.includes('Platform Engineer') && sidecar.includes('platform engineer|z|berlin'), 'only the keys are kept');
    assert.ok(!listReports(dir).some((item) => /seen/.test(item.name)), 'the keys are not a report');
    assert.throws(() => readReport(dir, `${third.name}.seen.json`), /no saved report/, 'and cannot be read as one');
    assert.equal(seenKeys(dir, list[1].name), null, 'a report saved without them');
    assert.ok(seenKeys(dir, third.name).has('https://a/3'));
    const later = compare([{ n: 1, title: 'Platform Engineer', company: 'Z', location: 'Berlin', url: 'https://a/3' }, { n: 2, title: 'Architect', company: 'Y', location: 'Köln', url: 'https://b/3' }, { n: 3, title: 'Data Engineer', company: 'Q', url: 'https://a/1' }], reportRows(dir, third.name), seenKeys(dir, third.name));
    assert.deepEqual(later.fresh.map((posting) => posting.n), [2]);
    assert.deepEqual(later.unranked.map((posting) => posting.n), [1], 'found then but not ranked');
    assert.deepEqual(later.again.map(({ posting }) => posting.n), [3]);
    assert.deepEqual(compare(found, reportRows(dir, list[1].name)).unranked, [], 'without the keys nothing is called found but not ranked');
    const before = seenBefore(dir);
    assert.deepEqual(before.get('https://a/3'), { report: third.name, saved: '2026-11-15 08:00 UTC', rank: '', ranked: false });
    assert.equal(before.get('https://a/1').report, list[1].name, 'still the first report it was in');
    assert.equal(before.get('https://a/1').ranked, true);
    assert.equal(seenBefore(dir, { except: [third.name] }).get('https://a/3'), undefined, 'a conversation\'s own report is not an earlier one');

    // Saved again in the same minute with the same title: a new name, the first is kept.
    const fourth = writeReport(dir, { title: 'Data engineer: Germany, third', markdown: '## Understanding\nThe same run saved again after a change.', opportunities: [] }, new Date('2026-11-15T08:00:00Z'));
    assert.equal(fourth.name, `${third.name}-2`);
    assert.match(readReport(dir, third.name), /A third run in Germany/);
    // Newest first by the time in the name, then by the files' time; files without a time come last.
    writeFileSync(join(dir, 'reports', 'notes.md'), '# My notes\n');
    const b = writeReport(dir, { title: 'b, saved first', markdown: '## Understanding\nSaved first within the minute.' }, new Date('2026-11-15T09:00:00Z'));
    const a = writeReport(dir, { title: 'a, saved second', markdown: '## Understanding\nSaved second within the minute.' }, new Date('2026-11-15T09:00:00Z'));
    const touch = (name, iso) => {
      for (const kind of ['md', 'csv']) utimesSync(join(dir, 'reports', `${name}.${kind}`), new Date(iso), new Date(iso));
    };
    touch(b.name, '2026-11-15T09:00:10Z');
    touch(a.name, '2026-11-15T09:00:40Z');
    const order = listReports(dir).map((item) => item.name);
    assert.deepEqual(order.slice(0, 2), [a.name, b.name], 'the later save first, whatever its title');
    assert.equal(order.at(-1), 'notes', 'a file without a time in its name comes last');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C4: the registry has US and UK tender and freelance sources, and names the gaps', () => {
  const registry = readRegistry('{}', '[]');
  const ids = registry.map((source) => source.id);
  for (const id of ['contractsfinder', 'findatender', 'sam', 'upwork', 'peopleperhour', 'yunojuno', 'freelancer', 'guru']) assert.ok(ids.includes(id), id);
  const byId = Object.fromEntries(SEED.map((source) => [source.id, source]));
  assert.equal(byId.sam.key, 'required');
  assert.equal(byId.contractsfinder.key, 'none');
  for (const id of ['upwork', 'peopleperhour', 'yunojuno', 'freelancer', 'guru']) assert.equal(byId[id].access, 'search', `${id} is found through search engines only`);
  const hosts = searchOnlyHosts(registry);
  for (const blocked of ['https://www.upwork.com/freelance-jobs/apply/x', 'https://www.peopleperhour.com/freelance-jobs/x', 'https://www.freelancer.co.uk/projects/x']) assert.ok(isSearchOnly(blocked, hosts), blocked);
  assert.ok(!isSearchOnly('https://www.contractsfinder.service.gov.uk/Notice/x', hosts));
  // Before: tender work in the USA had no source at all. Now SAM.gov covers it once its key is set.
  const missing = gaps(registry, { markets: ['USA', 'UK'], workTypes: ['tender'], ready: (source) => source.key !== 'required' });
  assert.deepEqual(missing, [{ market: 'USA', workType: 'tender', waiting: ['SAM.gov contract opportunities'] }]);
  assert.deepEqual(gaps(registry, { markets: ['USA', 'UK'], workTypes: ['tender', 'freelance'], ready: () => true }), []);
  // Reference sources (titles and pay) never count as listing work.
  const onlyReference = readRegistry(JSON.stringify(Object.fromEntries(SEED.filter((source) => source.kind !== 'pay and titles').map((source) => [source.id, { on: false }]))), '[]');
  assert.equal(gaps(onlyReference, { markets: ['USA'], workTypes: ['freelance'] }).length, 1);
});

test('C4: UK tenders (Contracts Finder, Find a Tender) from saved answers', async () => {
  const asked = network(UK);
  const cf = await ADAPTERS.contractsfinder.search({ what: 'street lighting' });
  assert.equal(cf.postings.length, 1);
  const lighting = cf.postings[0];
  assert.match(lighting.title, /Street Lighting Diversions/);
  assert.equal(lighting.company, 'BALFOUR BEATTY CIVIL ENGINEERING LIMITED');
  assert.equal(lighting.value, 'GBP 50,000');
  assert.equal(lighting.pay, '', 'a contract value is not pay');
  assert.equal(lighting.closes, '2026-11-23');
  assert.equal(lighting.posted, '2026-08-03', 'the first publication, not the latest amendment');
  assert.equal(lighting.type, 'tender');
  assert.equal(lighting.url, 'https://www.contractsfinder.service.gov.uk/Notice/42c80b0b-fbe7-49d7-8ac2-07a1a30e6e1a');
  assert.match(lighting.text, /Buyer's contact, as published/);
  assert.equal(cf.read, 3);
  const first = new URL(asked[0].url);
  assert.equal(first.searchParams.get('stages'), 'tender');
  assert.equal(first.searchParams.get('limit'), '100');
  assert.equal(first.searchParams.get('publishedFrom'), '2026-11-05T10:00:00', 'ten days by default');
  assert.ok(asked.some((request) => /cursor=/.test(request.url)), 'the next page is followed');
  assert.equal((await ADAPTERS.contractsfinder.search({ what: 'environmental assessment', days: 30 })).postings[0].company, 'Newry, Mourne and Down District Council (NMD)');
  await assert.rejects(ADAPTERS.contractsfinder.search({}), /words from the work/);

  const fts = await ADAPTERS.findatender.search({ what: 'business growth consultancy' });
  assert.equal(fts.postings.length, 1);
  assert.equal(fts.postings[0].company, 'Glasgow City Council');
  assert.equal(fts.postings[0].url, 'https://www.find-tender.service.gov.uk/Notice/108199-2026');
  assert.equal(fts.postings[0].value, 'GBP 3,800,000');
  assert.match(fts.postings[0].text, /Lots:\n• Business Growth/);
  assert.ok(asked.some((request) => new URL(request.url).searchParams.get('updatedFrom')));
  assert.equal(await ADAPTERS.findatender.detail(fts.postings[0]), fts.postings[0].text);

  // A notice past its closing date is left out.
  network(UK, Date.parse('2026-12-10T10:00:00Z'));
  assert.equal((await ADAPTERS.contractsfinder.search({ what: 'street lighting', days: 30 })).postings.length, 0);
  assert.ok(asked.every((request) => new URL(request.url).protocol === 'https:'));
});

test('C4: SAM.gov, shaped from its documentation; the key never shows', async () => {
  const asked = network([
    [/api\.sam\.gov\/prod\/opportunities\/v1\/noticedesc/, { status: 200, text: JSON.stringify({ description: '<p>Full description of the work.</p>' }) }],
    [/api\.sam\.gov\/opportunities\/v2\/search\?.*title=nothing/, { status: 404, text: '' }],
    [/api\.sam\.gov\/opportunities\/v2\/search\?.*title=refused/, { status: 401, text: '' }],
    [/api\.sam\.gov\/opportunities\/v2\/search/, { status: 200, text: JSON.stringify(SAM_ANSWER) }],
  ]);
  await assert.rejects(ADAPTERS.sam.search({ what: 'data' }, ''), /needs its key/);
  const found = await ADAPTERS.sam.search({ what: 'data analytics', where: 'va', days: 30 }, 'secret-key');
  const query = new URL(asked[0].url).searchParams;
  assert.equal(query.get('api_key'), 'secret-key');
  assert.deepEqual(query.getAll('ptype'), ['o', 'k', 'p', 'r'], 'only work that can still be bid for');
  assert.equal(query.get('postedFrom'), '10/16/2026');
  assert.equal(query.get('postedTo'), '11/15/2026');
  assert.equal(query.get('state'), 'VA');
  assert.equal(query.get('title'), 'data analytics');
  const [posting] = found.postings;
  assert.equal(posting.title, 'Data Analytics Support Services');
  assert.equal(posting.company, 'FEDERAL ACQUISITION SERVICE, GSA/FAS CENTER FOR IT');
  assert.equal(posting.location, 'Arlington, VA');
  assert.equal(posting.closes, '2026-12-05');
  assert.equal(posting.url, 'https://sam.gov/opp/abc123def456/view');
  assert.match(posting.text, /Contracting Officer, Contracting team, contracting@example\.gov/);
  assert.ok(!JSON.stringify(posting).includes('secret-key'), 'the key is not kept with the posting');
  const text = await ADAPTERS.sam.detail(posting, 'secret-key');
  assert.match(text, /^Full description of the work\./);
  assert.equal(new URL(asked.at(-1).url).searchParams.get('noticeid'), 'abc123def456');
  assert.equal(ADAPTERS.sam.extract(text), false, 'with its description the text is full');
  assert.equal(ADAPTERS.sam.extract(await ADAPTERS.sam.detail(posting, '')), true, 'without it, only the notice\'s details');
  assert.deepEqual(await ADAPTERS.sam.search({ what: 'nothing' }, 'secret-key'), { total: 0, postings: [] }, 'SAM.gov\'s 404 means nothing matched');
  const refused = await ADAPTERS.sam.search({ what: 'refused' }, 'secret-key').catch((error) => error);
  assert.match(refused.message, /api\.sam\.gov refused the request \(status 401\)/);
  assert.ok(!refused.message.includes('secret-key'), 'an error names the service, never the address with the key');
});

test('step 3 in a conversation: sources and gaps, checks, scores, the report and the comparison', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scout-step3-tools-'));
  try {
    network(UK);
    const registry = readRegistry('{}', '[]');
    const store = openStore();
    const folder = openFolder(join(dir, 'files'));
    let conversation = 'c1';
    const tools = Object.fromEntries(buildTools({
      enabled: () => true, registry: () => registry, selection: () => readSelection({ markets: ['USA', 'UK'], workType: 'tender', salary: '' }),
      keyOf: async () => '', hasKey: () => false, store, folder, profile: openProfile(join(dir, 'p.md')),
      gate: () => ({ files: { ok: true, why: '' }, profile: { ok: true, why: '' } }), idOf: () => conversation, now: () => TODAY,
    }).map((tool) => [tool.name, tool]));
    const run = async (name, args = {}) => (await tools[name].execute(args, {})).text;

    const sources = await run('scout_sources');
    assert.match(sources, /Contracts Finder \(UK\)[\s\S]*matched in the newest notices/);
    assert.match(sources, /Gaps \(nothing ready lists this work\):\n- tender work in USA: only SAM\.gov contract opportunities, which needs a key/);
    assert.match(await run('scout_reports'), /no saved reports yet/);
    assert.match(await run('scout_assess'), /No postings found/);

    const found = await run('scout_search', { source: 'contractsfinder', what: 'environmental assessment', days: 30 });
    assert.match(found, /P1 · CA18682[\s\S]*contract value: GBP 19,550[\s\S]*closes 2026-11-28/);
    assert.match(found, /among the 3 newest notices of the last 30 days/);
    const read = await run('scout_posting', { id: 'P1' });
    assert.match(read, /Scout's checks on this text: no request for money/);
    assert.ok(Array.isArray(store.get('c1', 'P1').checks), 'the checks are kept with the posting');
    const checks = await run('scout_assess', { ids: ['P1', 'P9'] });
    assert.match(checks, /Checks on 1 posting; no pay target given/);
    assert.match(checks, /Not found in this conversation: P9/);
    assert.match(checks, /Freshness: suggested 4 \(responses due 2026-11-28, in 13 days/);
    assert.match(checks, /Legitimacy: suggested 5 \(no warning signs in the full text\)/);
    assert.match(checks, /UNTRUSTED SOURCE TEXT/);

    // The first run also finds notices it does not rank.
    await run('scout_search', { source: 'findatender', what: 'insurance' });
    const row = { rank: 1, posting: 'P1', fit: 4, fit_reason: 'environmental assessment work', freshness: 4, freshness_reason: 'due in 13 days', pay_score: 3, pay_reason: 'contract value only', legitimacy: 5, legitimacy_reason: 'public council notice', contact: 'the council\'s procurement team', channel: 'the notice\'s portal', timing: 'before 28 November', trigger: 'RFQ 2026/47 published 13 November', draft: 'Dear procurement team, we read RFQ 2026/47…' };
    const saved = await run('scout_report', { title: 'Environmental work UK', markdown: '## Understanding\nTender search for environmental assessment work in the UK.', opportunities: [{ ...row, signals: 'made up', new: 'made up' }] });
    assert.match(saved, /1 opportunities, 1 new since earlier reports/);
    assert.match(saved, /The 3 postings found in this conversation are noted/);
    const [first] = listReports(folder.root);
    const table = reportRows(folder.root, first.name);
    assert.equal(table[0].title, 'CA18682 - RFQ 2026/47 - Kilcurry Subcatchment Targeted River & Catchment Assessment', 'filled in from the posting');
    assert.equal(table[0].link, 'https://www.contractsfinder.service.gov.uk/Notice/e22d5d91-9b44-4aa7-9bbb-97d3e4e7efad');
    assert.equal(table[0].pay, 'contract value GBP 19,550');
    assert.equal(table[0].new, 'new', 'Scout fills this column, not the model');
    assert.equal(table[0].signals, 'none found');
    assert.match(readReport(folder.root, first.name), /## Checked by Scout[\s\S]*1\. P1 CA18682[\s\S]*· new · none found/);

    // Saved again by the same conversation after a change: its own report is not an earlier one, and is kept.
    const resaved = await run('scout_report', { title: 'Environmental work UK', markdown: '## Understanding\nTender search for environmental assessment work in the UK, row 2 dropped.', opportunities: [row] });
    assert.match(resaved, /1 opportunities, 1 new since earlier reports/);
    assert.equal(reportRows(folder.root, `${first.name}-2`)[0].new, 'new');
    assert.match(readReport(folder.root, first.name), /Tender search for environmental assessment work in the UK\.\n/, 'the first save is not overwritten');
    assert.match(await run('scout_reports'), /2 saved reports, newest first:\n- 2026-11-15-1000-environmental-work-uk-2 · [^\n]* · saved by this conversation/);
    assert.match(await run('scout_reports', { compare: true }), /only saved reports are this conversation's own/);

    // A later run, in another conversation: what the first run ranked, what it found but did not rank, and what is new.
    conversation = 'c2';
    await run('scout_search', { source: 'contractsfinder', what: 'environmental assessment', days: 30 });
    await run('scout_search', { source: 'findatender', what: 'insurance' });
    await run('scout_search', { source: 'contractsfinder', what: 'street lighting' });
    assert.match(await run('scout_reports'), /2 saved reports, newest first:\n- 2026-11-15-1000-environmental-work-uk-2 · "Environmental work UK" · saved 2026-11-15 10:00 UTC · 1 opportunity\n- 2026-11-15-1000-environmental-work-uk ·/);
    const compared = await run('scout_reports', { compare: true });
    assert.match(compared, /^Compared with 2026-11-15-1000-environmental-work-uk-2 \("Environmental work UK", saved 2026-11-15 10:00 UTC, 1 opportunity ranked, and every posting that run found\)/);
    assert.match(compared, /New since then \(1\): P4 [^\n]*Street Lighting/);
    assert.match(compared, /Ranked then too \(1\): P1 CA18682[\s\S]*\(was rank 1\)/);
    assert.match(compared, /Found then but not ranked \(2\): P2 Glasgow Business Growth Framework[\s\S]*P3 Insurance and risk/);
    assert.match(compared, /not found again here \(0\): none/);
    assert.match(await run('scout_reports', { name: first.name }), /UNTRUSTED SOURCE TEXT[\s\S]*Tender search for environmental/);
    assert.match(await run('scout_reports', { name: '../secret' }), /as the list shows it/);
    const plain = { ...row, draft: '', trigger: '' };
    const again = await run('scout_report', { title: 'Environmental work UK, second run', markdown: '## Understanding\nA second tender search for environmental work in the UK.', opportunities: [{ ...row, title: '' }, { ...plain, rank: 2, posting: 'P3' }, { ...plain, rank: 3, posting: 'P4' }] });
    assert.match(again, /3 opportunities, 1 new since earlier reports/);
    const secondRun = listReports(folder.root).find((report) => report.title === 'Environmental work UK, second run');
    assert.deepEqual(reportRows(folder.root, secondRun.name).map((item) => item.new), ['seen 2026-11-15 10:00 UTC', 'seen 2026-11-15 10:00 UTC, not ranked', 'new']);
    assert.match(await run('scout_reports', { compare: true }), /^Compared with 2026-11-15-1000-environmental-work-uk-2 /, 'its own report is not the last run');

    // Pay: well above the other postings found is a thing to check; far above a typical pay from a
    // source is a scam sign, and the saved report says the same as scout_assess.
    conversation = 'c3';
    store.add('c3', 'adzuna', [
      ...[32, 35, 38, 40, 45].map((k, i) => ({ title: 'Data Engineer', company: `Empresa ${i}`, location: 'Madrid', url: `https://example.org/es/${i}`, pay: `EUR ${k},000–${k + 8},000`, posted: '2026-11-12', adapter: 'adzuna' })),
      { title: 'Senior Data Engineer', company: 'Beta GmbH', location: 'München', url: 'https://example.org/de/1', pay: 'EUR 75,000–90,000', posted: '2026-11-12', adapter: 'adzuna' },
      { title: 'Data entry', company: 'Too Good', location: 'München', url: 'https://example.org/de/2', pay: 'EUR 150,000–200,000', posted: '2026-11-12', adapter: 'adzuna' },
    ]);
    const munich = await run('scout_assess', { ids: ['P6'] });
    assert.match(munich, /To check: pay well above the other postings found/);
    assert.match(munich, /Legitimacy: suggested 5/);
    // A typical pay belongs to one market: without ids (the newest 40 may mix markets) it is not
    // used, nothing is kept, and the model is asked for that market's ids.
    const noIds = await run('scout_assess', { typical_pay: 'EUR 80,000 per year' });
    assert.match(noIds, /^typical_pay "EUR 80,000 per year" was not used: it belongs to one market\. Call scout_assess again with the ids of that market's postings/);
    assert.doesNotMatch(noIds, /Scam sign/);
    assert.ok(store.all('c3').every((posting) => posting.typicalPay === undefined), 'no typical pay kept without ids');
    const sourced = await run('scout_assess', { ids: ['P7'], typical_pay: 'EUR 80,000 per year' });
    assert.match(sourced, /Scam sign: pay far above the market: EUR 150,000–200,000 against EUR 80,000 per year \(the typical pay given\)/);
    assert.equal(store.get('c3', 'P7').typicalPay, 'EUR 80,000 per year', 'kept with the posting for the report');
    assert.equal(store.get('c3', 'P6').typicalPay, undefined, 'only with the postings it was given for');
    const payRow = (posting, rank) => ({ rank, posting, fit: 3, fit_reason: 'data work', freshness: 5, freshness_reason: 'three days old', pay_score: 5, pay_reason: 'above the target', legitimacy: 3, legitimacy_reason: 'see the signals' });
    await run('scout_report', { title: 'Data engineer pay check', markdown: '## Understanding\nA check of pay in Germany and Spain for data engineers.', opportunities: [payRow('P6', 1), payRow('P7', 2)] });
    const payTable = reportRows(folder.root, listReports(folder.root).find((report) => report.title === 'Data engineer pay check').name);
    assert.doesNotMatch(payTable[0].signals, /scam sign/, 'normal Munich pay is not a scam sign in the saved report');
    assert.match(payTable[0].signals, /^to check: pay well above the other postings found[\s\S]*; text not read$/);
    assert.match(payTable[1].signals, /^scam sign: pay far above the market: [\s\S]*\(the typical pay given\); text not read$/);

    // scout_posting judges a text as scout_assess does: a tender's published contact is the buyer's;
    // a founder's own address on Hacker News is a thing to check.
    conversation = 'c4';
    const hall = 'Cleaning of the village hall twice a week for two years. Questions to the parish clerk at clerk.parish@gmail.com. '.repeat(5);
    store.add('c4', 'contractsfinder', [{ title: 'Hall cleaning', company: 'Parish council', type: 'tender', url: 'https://example.org/t/1', text: hall, textFull: true, adapter: 'contractsfinder', closes: '2026-12-20' }]);
    const tenderRead = await run('scout_posting', { id: 'P1' });
    assert.doesNotMatch(tenderRead, /scam sign/);
    assert.match(tenderRead, /Scout's checks on this text: no request for money or documents, no talent-pool wording\./);
    assert.match(await run('scout_assess', { ids: ['P1'] }), /Legitimacy: suggested 5/);
    const founder = 'Acme (YC W26) | Data Engineer | Remote EU | We build data pipelines for logistics customers across Europe. Email your resume to founder.acme@gmail.com. '.repeat(4);
    store.add('c4', 'hn', [{ title: 'Data Engineer', company: 'Acme', url: 'https://example.org/hn/1', text: founder, textFull: true, adapter: 'hn', posted: '2026-11-03', pay: 'EUR 70,000–90,000' }]);
    assert.equal(textSignals(founder, textOptions(store.get('c4', 'P2')))[0].kind, 'check');
    const founderChecks = await run('scout_assess', { ids: ['P2'] });
    assert.match(founderChecks, /To check: contact only through a personal email address \(gmail\.com\): common for founders on Hacker News/);
    assert.match(founderChecks, /Legitimacy: suggested 5 \(no warning signs in the full text; 1 thing to check\)/);

    // A warning sign found by text patterns is a sign to verify, with the words behind it, in
    // scout_posting, scout_assess and the saved report; a computed fact (no pay) is stated as it is.
    conversation = 'c5';
    const feeText = `Office assistant, remote. To start, you must pay a registration fee of $50 for your account. ${'We support small shops across Europe with bookkeeping and admin. '.repeat(8)}`;
    store.add('c5', 'arbeitnow', [{ title: 'Office assistant', company: 'Kappa', url: 'https://example.org/a/1', text: feeText, textFull: true, adapter: 'arbeitnow', posted: '2026-11-13' }]);
    const feeRead = await run('scout_posting', { id: 'P1' });
    assert.match(feeRead, /Scout's checks on this text, signs to verify rather than verdicts[^\n]*: warning sign \(check\): asks the applicant for money — '[^']*registration fee of \$50[^']*'\. Read the words quoted/);
    const feeChecks = await run('scout_assess', { ids: ['P1'] });
    assert.match(feeChecks, /a "warning sign \(check\)" is wording found by text patterns, a sign to verify[^\n]*: it does not lower the suggestion; judge it against the whole posting/);
    assert.match(feeChecks, /Legitimacy: suggested 5 \(no computed warning signs; 1 warning sign found in the text, not counted: judge it against the whole posting and the words quoted; no pay given, which does not lower it\)/);
    assert.match(tools.scout_assess.description, /The suggested legitimacy comes only from computed facts[\s\S]*they do not lower the suggestion/);
    assert.match(feeChecks, /- Ghost-job sign: no pay given\n {3}- Warning sign \(check\): asks the applicant for money — '/);
    await run('scout_report', { title: 'Assistant check', markdown: '## Understanding\nA check of one remote assistant posting and the fee it asks for.', opportunities: [payRow('P1', 1)] });
    const feeReport = listReports(folder.root).find((report) => report.title === 'Assistant check');
    assert.match(reportRows(folder.root, feeReport.name)[0].signals, /^ghost sign: no pay given; warning sign \(check\): asks the applicant for money — '[^']*registration fee of \$50[^']*'$/);
    assert.match(readReport(folder.root, feeReport.name), /## Checked by Scout\n[^\n]*\nSignals \(the table's `signals` column\)[^\n]*a "warning sign \(check\)" is a text check to verify on the posting's page[^\n]*not a verdict/);
    assert.match(readReport(folder.root, feeReport.name), /Scout's suggested legitimacy does not count it: text checks are hints to verify; the legitimacy score and its reason above are the model's judgement/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
