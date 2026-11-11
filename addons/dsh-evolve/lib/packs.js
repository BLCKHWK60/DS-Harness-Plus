/**
 * Example task packs: ready-made, hard test tasks for each kind of work.
 *
 * Every task with a factual answer has that answer worked out by code;
 * `test/packs.test.mjs` works them out again, so a pack never ships a task
 * that cannot be passed. Writing tasks need a judge model.
 *
 * A pack's tasks are spread over the three groups: Learn (the reviewer studies
 * these), Check (prove a change helps) and Guard (must keep working).
 */

/** Phrases and formatting that mark text as machine-written. One `noneOf` check lists them. */
export const AI_ISMS = [
  'delve', 'tapestry', 'testament to', 'in conclusion', "it's important to note", 'it is important to note', "it's worth noting",
  'as an ai', 'i hope this', 'certainly!', "in today's", 'ever-evolving', 'fast-paced', 'game-changer', 'game changer',
  'unlock the', 'elevate your', 'navigating the', 'at the end of the day', 'rich history', 'vibrant', 'seamless', 'leverage',
  'furthermore,', 'moreover,', 'in summary', '—', '**', '##', '```',
].join(' | ');

const ANSWER_ONLY = 'Answer with';

/** Which group a task goes to, by its place in the pack: about 40% Learn, 30% Check, 30% Guard. */
function splitOf(index) {
  return ['learn', 'check', 'guard', 'learn', 'check', 'guard', 'learn', 'check', 'learn', 'guard'][index % 10];
}

/**
 * Build a pack.
 * @param {object} meta - `id`, `name`, `description`, and optionally `kind: 'agent'`, `needsJudge`.
 * @param {Array<{prompt: string, checks: Array<{type: string, value: string}>}>} tasks - its tasks.
 * @returns {object} the pack, each task with its id, family, group and kind.
 */
function pack(meta, tasks) {
  return {
    ...meta,
    kind: meta.kind ?? 'answer',
    needsJudge: meta.needsJudge === true,
    tasks: tasks.map((task, index) => ({
      id: `${meta.id}-${String(index + 1).padStart(2, '0')}`,
      family: meta.id,
      split: splitOf(index),
      kind: meta.kind ?? 'answer',
      prompt: task.prompt,
      checks: task.checks,
    })),
  };
}

const eq = (value) => ({ type: 'equals', value });
const re = (value) => ({ type: 'regex', value });
const has = (value) => ({ type: 'contains', value });
const json = (keys = '') => ({ type: 'json', value: keys });
const none = (value) => ({ type: 'noneOf', value });
const words = (range) => ({ type: 'wordCount', value: range });
const lines = (range) => ({ type: 'lineCount', value: range });
const judge = (value) => ({ type: 'judge', value });
const file = (path, text) => ({ type: 'fileContains', value: `${path} :: ${text}` });
const exists = (path) => ({ type: 'fileExists', value: path });

// ---------------------------------------------------------------------------

const reasoning = pack(
  {
    id: 'reasoning',
    name: 'Reasoning and exact calculation',
    description: 'Counting, long arithmetic, dates, logic puzzles and state tracking, with one exact answer each. No tools: the model must work it out and answer in the exact form asked.',
  },
  [
    { prompt: `How many times does the letter "r" appear in this text?\n\nstrawberry raspberry cranberry blackberry boysenberry\n\n${ANSWER_ONLY} the number only.`, checks: [eq('13')] },
    { prompt: `What is 48,637 multiplied by 9,284? ${ANSWER_ONLY} the number only, with no separators.`, checks: [eq('451545908')] },
    { prompt: `What is the remainder when 7 to the power 222 is divided by 13? ${ANSWER_ONLY} the number only.`, checks: [eq('12')] },
    { prompt: `Which date is exactly 1,000 days after 15 March 2023, and which day of the week is it? ${ANSWER_ONLY} the date as YYYY-MM-DD, a space, and the English weekday. Nothing else.`, checks: [eq('2025-12-09 Tuesday')] },
    { prompt: `Write the hexadecimal number 3F7A in binary. How many of its binary digits are 1? ${ANSWER_ONLY} the number only.`, checks: [eq('11')] },
    { prompt: `Sort these numbers from largest to smallest and give the 7th number in that order.\n\n482, 97, 1203, 356, 871, 64, 990, 415, 728, 1337, 256, 603, 149, 842, 511\n\n${ANSWER_ONLY} the number only.`, checks: [eq('603')] },
    { prompt: `What is the sum of the decimal digits of 2 to the power 100? ${ANSWER_ONLY} the number only.`, checks: [eq('115')] },
    { prompt: `How many whole numbers from 1 to 1000 inclusive are divisible by 3 or by 5, but not by 15? ${ANSWER_ONLY} the number only.`, checks: [eq('401')] },
    {
      prompt: `A stack machine starts with an empty stack and runs these steps in order. "add" and "mul" pop two values and push the result. "sub" pops b, then pops a, and pushes a minus b. "dup" pushes a copy of the top value. "swap" exchanges the top two values. "pop" discards the top value.\n\npush 5, push 8, add, push 3, mul, dup, push 4, sub, swap, pop, push 7, add\n\nWhat is on the stack at the end, from bottom to top? ${ANSWER_ONLY} the values separated by single spaces, nothing else.`,
      checks: [eq('42')],
    },
    {
      prompt: `Five people stand in a row, positions 1 to 5 from left to right: Ana, Ben, Cy, Dee and Eli.\n\n- Dee is in position 1.\n- Cy and Dee stand next to each other.\n- Ana is somewhere to the left of Ben, but not directly next to him.\n- Eli is not at either end, and is somewhere to the right of Ana.\n\nGive the order from left to right. ${ANSWER_ONLY} the five names separated by a comma and a space, nothing else.`,
      checks: [eq('Dee, Cy, Ana, Eli, Ben')],
    },
    {
      prompt: `Town X and town Y are 372 km apart on one straight track. Train A leaves X at 08:00 toward Y at a steady 72 km/h. Train B leaves Y at 08:30 toward X at a steady 96 km/h. At what time do they meet, and how many km from X? ${ANSWER_ONLY} the time as HH:MM, a comma and a space, then the distance as a whole number followed by " km". Nothing else.`,
      checks: [eq('10:30, 180 km')],
    },
    { prompt: `Add the Roman numerals MCMXCIV and CDXLVI. ${ANSWER_ONLY} the sum as a Roman numeral only.`, checks: [eq('MMCDXL')] },
    {
      prompt: `A shop sells notebooks at 4.75 each, pens at 1.60 each and a bag at 23.90. Mira buys 3 notebooks, 2 pens and the bag. The bag alone is reduced by 15%. An 8% sales tax is then added to the whole purchase, and the total is rounded to the nearest cent. She pays with a 50.00 note. How much change does she get? ${ANSWER_ONLY} the amount with two decimals only.`,
      checks: [eq('9.21')],
    },
    { prompt: `Give each letter its place in the alphabet (A=1, B=2, ... Z=26). What is the sum for the word KNOWLEDGE? ${ANSWER_ONLY} the number only.`, checks: [eq('96')] },
    { prompt: `What is the smaller angle, in degrees, between the hour hand and the minute hand of a clock at exactly 3:40? ${ANSWER_ONLY} the number only.`, checks: [eq('130')] },
    {
      prompt: `On an island every person is either a knight, who always tells the truth, or a knave, who always lies.\n\nA says: "B is a knave."\nB says: "A and C are of different kinds."\nC says: "A is a knight."\n\nWhat is each of them? ${ANSWER_ONLY} exactly this form and nothing else: A=knight, B=knave, C=knight (with the right words in place).`,
      checks: [eq('A=knight, B=knave, C=knight')],
    },
  ],
);

const coding = pack(
  {
    id: 'coding',
    name: 'Reading and tracing code',
    description: 'Predict exactly what short JavaScript, Python and SQL snippets print, including the well-known traps. No tools: the model must trace the code in its head.',
  },
  [
    { prompt: `What does this JavaScript print?\n\nconsole.log([1, 2, 3, 10, 21, 100].sort().join(","))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('1,10,100,2,21,3')] },
    { prompt: `What does this JavaScript print?\n\nvar fs = [];\nfor (var i = 0; i < 3; i++) {\n  fs.push(function () { return i * 2; });\n}\nconsole.log(fs.map(function (f) { return f(); }).join(","))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('6,6,6')] },
    { prompt: `What does this JavaScript print?\n\nconsole.log([1, 2] + [3] + 4 - 1)\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('NaN')] },
    { prompt: `What does this Python 3 program print?\n\ndef f(x, acc=[]):\n    acc.append(x * 2)\n    return acc\n\nf(1)\nf(2)\nprint(f(3))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('[2, 4, 6]')] },
    { prompt: `What does this Python 3 line print?\n\nprint(-7 // 2, -7 % 3, 7 // -2, int(-7 / 2))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('-4 2 -4 -3')] },
    { prompt: `What does this JavaScript print?\n\nfunction f(n) {\n  if (n <= 1) return n + 1;\n  return f(n - 1) + 2 * f(n - 2) - (n % 3);\n}\nconsole.log(f(7))\n\n${ANSWER_ONLY} the number only.`, checks: [eq('74')] },
    { prompt: `What does this JavaScript print?\n\nconsole.log(((0b1011 << 3) ^ 0x2A) & ~5 | 1)\n\n${ANSWER_ONLY} the number only.`, checks: [eq('115')] },
    { prompt: `What does this Python 3 program print?\n\ns = "self-improvement"\nprint(s[::-3], s[-5:-1], s[3:10:2])\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('tmomfs emen fipo')] },
    { prompt: `Which of these strings match the regular expression ^[a-z]{2,3}\\d{2,}$ ?\n\nab12, a1b2, abc123, 12ab, ab1, xab99\n\n${ANSWER_ONLY} the matching strings in the order given, separated by commas with no spaces. Nothing else.`, checks: [eq('ab12,abc123,xab99')] },
    { prompt: `What does this JavaScript print?\n\nconst o = { a: 1, b: { c: 2 } };\nconst p = { ...o };\np.a = 5;\np.b.c = 7;\nconst q = JSON.parse(JSON.stringify(o));\nq.b.c = 9;\nconsole.log(o.a, o.b.c, p.a, q.b.c)\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('1 7 5 9')] },
    { prompt: `What does this Python 3 program print?\n\ng = (n * n for n in range(5))\nprint(sum(g), sum(g), list(g))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('30 0 []')] },
    { prompt: `In what order does this JavaScript print its letters when run in Node.js?\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");\n\n${ANSWER_ONLY} the four letters separated by single spaces, nothing else.`, checks: [eq('A D C B')] },
    { prompt: `What does this Python 3 program print?\n\na = [[0] * 3] * 3\na[0][1] = 5\nb = [[0] * 3 for _ in range(3)]\nb[0][1] = 5\nprint(sum(map(sum, a)), sum(map(sum, b)))\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('15 5')] },
    {
      prompt: `A table "orders" has the columns (id, customer, amount, status) and these rows:\n\n(1, 'ann', 120, 'paid')\n(2, 'bob', 80, 'paid')\n(3, 'ann', 45, 'refunded')\n(4, 'cat', 200, 'paid')\n(5, 'bob', 60, 'pending')\n(6, 'ann', 300, 'paid')\n(7, 'cat', 20, 'paid')\n(8, 'dan', 500, 'refunded')\n\nWhat does this query return?\n\nSELECT customer, SUM(amount) AS total FROM orders WHERE status = 'paid' GROUP BY customer HAVING SUM(amount) > 100 ORDER BY total DESC;\n\n${ANSWER_ONLY} one "customer:total" pair per row, the rows separated by single spaces, in the order returned. Nothing else.`,
      checks: [eq('ann:420 cat:220')],
    },
    {
      prompt: `A sorted list holds the 34 numbers 1, 4, 7, ... , 100 (each 3 more than the last), at indexes 0 to 33. A standard binary search looks for 37, with lo = 0, hi = 33 and mid = floor((lo + hi) / 2), and stops when it finds the value. Which values does it compare against, in order, including 37 itself? ${ANSWER_ONLY} the values separated by commas with no spaces. Nothing else.`,
      checks: [eq('49,22,34,40,37')],
    },
    { prompt: `What does this Python 3 line print?\n\nprint(f"{1234567.891:,.1f}|{255:08b}|{-3 ** 2}")\n\n${ANSWER_ONLY} the printed text only.`, checks: [eq('1,234,567.9|11111111|-9')] },
  ],
);

const structured = pack(
  {
    id: 'structured',
    name: 'Structured output and extraction',
    description: 'Turn messy text into exact JSON: totals, dates, phone numbers, units and versions. Checked on the JSON keys and the exact values.',
  },
  [
    {
      prompt: `Read this order note and return only a JSON object with the keys "items_total", "discount" and "total", all numbers with two decimals of precision.\n\n"3 x Cable @ 4.50, 2 x Adapter @ 12.00 and 1 x Dock @ 89.99. Shipping is 7.50. Loyalty discount: 10% off the items only, not the shipping, rounded to the nearest cent."\n\n"items_total" is before the discount, "discount" is the amount taken off, "total" is what the customer pays.`,
      checks: [json('items_total, discount, total'), re('"items_total"\\s*:\\s*127\\.49\\b'), re('"discount"\\s*:\\s*12\\.75\\b'), re('"total"\\s*:\\s*122\\.24\\b'), none('```')],
    },
    {
      prompt: `Return only a JSON object with the keys "original", "new" and "weekday_original".\n\n"The review was planned for March 3rd, 2026. It has been moved to the Thursday of that same week."\n\nDates as YYYY-MM-DD. "weekday_original" is the English weekday of the original date.`,
      checks: [json('original, new, weekday_original'), re('"original"\\s*:\\s*"2026-03-03"'), re('"new"\\s*:\\s*"2026-03-05"'), re('"weekday_original"\\s*:\\s*"Tuesday"'), none('```')],
    },
    {
      prompt: `Extract the two contacts as a JSON array of objects with the keys "name", "email" and "phone". Return only the JSON.\n\n"Reach Maria Lopez (Maria.Lopez@Example.COM) on (415) 555-0132 in San Francisco, or her colleague Tom Ashby <t.ashby@northwind.co.uk> in London on 020 7946 0958."\n\nE-mail addresses in lower case. Phone numbers in international E.164 form (a plus sign, country code, digits only).`,
      checks: [json(), has('maria.lopez@example.com'), has('+14155550132'), has('t.ashby@northwind.co.uk'), has('+442079460958'), none('```')],
    },
    {
      prompt: `Count the log lines by level and return only a JSON object with the keys "INFO", "WARN" and "ERROR".\n\n10:01 INFO start\n10:02 WARN disk 81%\n10:03 ERROR db timeout 1200ms\n10:04 INFO retry\n10:05 ERROR db timeout 3400ms\n10:06 INFO ok\n10:09 WARN disk 86%\n10:11 ERROR cache miss storm\n10:12 ERROR db timeout 900ms\n10:15 INFO ok\n10:17 WARN disk 91%\n10:20 ERROR db timeout 2100ms`,
      checks: [json('INFO, WARN, ERROR'), re('"INFO"\\s*:\\s*4\\b'), re('"WARN"\\s*:\\s*3\\b'), re('"ERROR"\\s*:\\s*5\\b'), none('```')],
    },
    {
      prompt: `From these results, return only a JSON object with one key "top3": the names of the three highest scores, highest first.\n\nIvo 71.5; Mara 88; Quinn 79.25; Sol 88.5; Tess 64; Uma 79.5; Vik 87.75`,
      checks: [json('top3'), re('\\[\\s*"Sol"\\s*,\\s*"Mara"\\s*,\\s*"Vik"\\s*\\]'), none('```')],
    },
    {
      prompt: `Return only a JSON object with the keys "weight_g" and "volume_cm3", both whole numbers.\n\n"The parcel weighs 2 lb 3 oz and measures 10 in by 4 in by 2.5 in."\n\nUse 1 oz = 28.349523125 g and 1 in = 2.54 cm. Round each to the nearest whole number.`,
      checks: [json('weight_g, volume_cm3'), re('"weight_g"\\s*:\\s*992\\b'), re('"volume_cm3"\\s*:\\s*1639\\b'), none('```')],
    },
    {
      prompt: `These are notes from a meeting held on Monday 2026-06-08. Return only a JSON array of the action items, each an object with the keys "owner", "task" and "due" (YYYY-MM-DD).\n\n"Priya will send the budget by Friday. Tom: draft the contract, due in two weeks from today. Lena books the venue tomorrow."`,
      checks: [json(), re('"owner"\\s*:\\s*"Priya"'), has('2026-06-12'), has('2026-06-22'), has('2026-06-09'), none('```')],
    },
    {
      prompt: `Split this address into a JSON object with the keys "street", "city", "postcode" and "country_code" (the two-letter ISO code). Return only the JSON.\n\n"221B Baker Street, London NW1 6XE, United Kingdom"`,
      checks: [json('street, city, postcode, country_code'), re('"street"\\s*:\\s*"221B Baker Street"'), re('"city"\\s*:\\s*"London"'), re('"postcode"\\s*:\\s*"NW1 6XE"'), re('"country_code"\\s*:\\s*"GB"'), none('```')],
    },
    {
      prompt: `Add up these three amounts in US dollars and return only a JSON object with one key "total_usd", a number with two decimals of precision.\n\n€1.234,50 (European notation), $2,300.75 and £980\n\nUse 1 EUR = 1.10 USD and 1 GBP = 1.25 USD.`,
      checks: [json('total_usd'), re('"total_usd"\\s*:\\s*4883\\.70?\\b'), none('```')],
    },
    {
      prompt: `These are version numbers that follow semantic versioning:\n\n1.9.12, 1.10.0-rc.1, 1.10.0, 1.9.9, 1.10.0-beta.3, 1.2.30\n\nReturn only a JSON object with the keys "latest" (the highest version), "latest_prerelease" (the highest version that is a pre-release) and "ascending" (all six, lowest first).`,
      checks: [json('latest, latest_prerelease, ascending'), re('"latest"\\s*:\\s*"1\\.10\\.0"'), re('"latest_prerelease"\\s*:\\s*"1\\.10\\.0-rc\\.1"'), re('\\[\\s*"1\\.2\\.30"\\s*,\\s*"1\\.9\\.9"\\s*,\\s*"1\\.9\\.12"\\s*,\\s*"1\\.10\\.0-beta\\.3"\\s*,\\s*"1\\.10\\.0-rc\\.1"\\s*,\\s*"1\\.10\\.0"\\s*\\]'), none('```')],
    },
    {
      prompt: `How many different people are in this list? Two entries are the same person when they are equal after ignoring upper and lower case and extra spaces. Accents matter: "é" and "e" are different letters.\n\n"Ana Silva", " ana silva", "ANA  SILVA", "Bo Chen", "bo chen ", "Chloé Dubois", "Chloe Dubois", "Dee O'Neil", "dee o'neil"\n\nReturn only a JSON object with one key "unique_count".`,
      checks: [json('unique_count'), re('"unique_count"\\s*:\\s*5\\b'), none('```')],
    },
    {
      prompt: `Add these durations: 1h 45m, 2h 30m, 55m, 3h 5m, 40m. Return only a JSON object with the keys "total_minutes" (a number) and "formatted" (like "2h 5m").`,
      checks: [json('total_minutes, formatted'), re('"total_minutes"\\s*:\\s*535\\b'), re('"formatted"\\s*:\\s*"8h 55m"'), none('```')],
    },
  ],
);

const instructions = pack(
  {
    id: 'instructions',
    name: 'Following exact instructions',
    description: 'Several formatting rules at once: exact line counts, word counts, orders and forbidden words. Small models often get the content right and the form wrong.',
  },
  [
    { prompt: `Write exactly three lines and nothing else. Line 1: the word ALPHA. Line 2: the number of letters in the word "independence", as digits. Line 3: the word OMEGA.`, checks: [eq('ALPHA\n12\nOMEGA')] },
    { prompt: `List the first six prime numbers from largest to smallest, separated by " | " (space, vertical bar, space). No other text.`, checks: [eq('13 | 11 | 7 | 5 | 3 | 2')] },
    { prompt: `Reply with one lower-case word that means the opposite of "ancient". One word, no punctuation, nothing else.`, checks: [re('^(modern|new|recent|contemporary|current)$'), lines('1'), words('1')] },
    {
      prompt: `Explain why the sky is blue in exactly two sentences on one line. The first sentence must start with the word "Because". The second sentence must be a question and end with a question mark. Do not use the word "scatter" in any form.`,
      checks: [re('^Because\\b'), re('^[^.!?]*[.!][^.!?]*\\?$'), lines('1'), none('scatter'), words('10-70')],
    },
    {
      prompt: `Return only a JSON object, with no code fence and no other text. Key "squares": the squares of the odd numbers from 1 to 15, lowest first. Key "count": how many squares there are.`,
      checks: [json('squares, count'), re('\\[\\s*1\\s*,\\s*9\\s*,\\s*25\\s*,\\s*49\\s*,\\s*81\\s*,\\s*121\\s*,\\s*169\\s*,\\s*225\\s*\\]'), re('"count"\\s*:\\s*8\\b'), none('```')],
    },
    { prompt: `Write the letters of the word "harness" in alphabetical order, in upper case, with no spaces. Nothing else.`, checks: [eq('AEHNRSS')] },
    {
      prompt: `Write exactly four lines about writing software. The first letters of the lines must spell CODE, in that order. Each line has between three and six words. No title, no blank lines, nothing else.`,
      checks: [lines('4'), re('^C[^\\n]*\\nO[^\\n]*\\nD[^\\n]*\\nE[^\\n]*$'), words('12-24')],
    },
    { prompt: `Repeat this sentence with the order of its words reversed. Keep each word as it is, in lower case, with single spaces. Nothing else.\n\nnever trust a quiet server on friday afternoon`, checks: [eq('afternoon friday on server quiet a trust never')] },
    { prompt: `Output a CSV with the header "name,score" and one row per person, sorted by score from highest to lowest. No spaces, no blank lines, no other text.\n\nKim scored 71, Raj scored 88, Zoe scored 79.`, checks: [eq('name,score\nRaj,88\nZoe,79\nKim,71')] },
    { prompt: `Count the vowels (a, e, i, o, u, in either case) in this sentence and answer with the number only.\n\nAutonomous agents iterate over uncertain outcomes`, checks: [eq('22')] },
    { prompt: `Write one sentence of exactly ten words in which every word starts with the letter S. One line, nothing else.`, checks: [lines('1'), words('10'), re('^([Ss]\\S*\\s+){9}[Ss]\\S*$')] },
    { prompt: `Take the 3rd, 6th and 9th words of this sentence and join them with hyphens. Answer with that only.\n\nLarge models still stumble when simple counting meets strict formatting rules`, checks: [eq('still-simple-strict')] },
  ],
);

const knowledge = pack(
  {
    id: 'knowledge',
    name: 'General knowledge, two steps',
    description: 'Facts that need two things known and then combined, each with one exact answer. A model that half-remembers a fact gets it wrong.',
  },
  [
    { prompt: `Add the atomic numbers of gold, silver and copper. ${ANSWER_ONLY} the number only.`, checks: [eq('155')] },
    { prompt: `How many years passed between the Wright brothers' first powered flight and the first crewed Moon landing? ${ANSWER_ONLY} the number only.`, checks: [eq('66')] },
    { prompt: `Subtract the year Columbus first reached the Americas from the year the French Revolution began. ${ANSWER_ONLY} the number only.`, checks: [eq('297')] },
    { prompt: `Which single letter of the English alphabet does not appear in the name of any of the 50 US states? ${ANSWER_ONLY} the letter only, in upper case.`, checks: [eq('Q')] },
    { prompt: `Add the number of strings on a standard violin, a standard guitar and a cello. ${ANSWER_ONLY} the number only.`, checks: [eq('14')] },
    { prompt: `Multiply the number of chromosome pairs in a human body cell by the number of legs of a spider. ${ANSWER_ONLY} the number only.`, checks: [eq('184')] },
    { prompt: `What is the atomic number of the chemical element named after Albert Einstein? ${ANSWER_ONLY} the number only.`, checks: [eq('99')] },
    { prompt: `Multiply the number of sides of a dodecagon by the number of faces of an icosahedron. ${ANSWER_ONLY} the number only.`, checks: [eq('240')] },
    { prompt: `The river that flows through Budapest ends in which sea? ${ANSWER_ONLY} the name of the sea only, two words.`, checks: [eq('Black Sea')] },
    { prompt: `In which country was the author of "One Hundred Years of Solitude" born? ${ANSWER_ONLY} the country only.`, checks: [eq('Colombia')] },
    { prompt: `What is the chemical symbol of the element with atomic number 74? ${ANSWER_ONLY} the symbol only.`, checks: [eq('W')] },
    { prompt: `What is the speed of light in a vacuum, in metres per second, as the exact defined whole number? ${ANSWER_ONLY} the number only, with no separators.`, checks: [eq('299792458')] },
    { prompt: `Take the year Constantinople fell to the Ottomans and add 500. ${ANSWER_ONLY} the number only.`, checks: [eq('1953')] },
    { prompt: `What is the molar mass of table salt (sodium chloride) in grams per mole, rounded to the nearest whole number? ${ANSWER_ONLY} the number only.`, checks: [eq('58')] },
  ],
);

const HUMAN = 'It reads as written by a skilled human writer: natural rhythm, concrete detail, no stock phrases, no filler, correct grammar and spelling, and no list, heading or bold text.';

const writing = pack(
  {
    id: 'writing',
    name: 'Writing',
    description: 'Technical writing, blog and web copy, fiction, literary description, e-mail and news. Each piece must stay within a length, avoid machine-sounding phrases and formatting, and satisfy a judge model. Set a strong judge model first.',
    needsJudge: true,
  },
  [
    { prompt: 'Explain what a database index is, and when adding one makes things slower, to a junior developer who has used SQL for a month. Plain prose, 150 to 220 words. No lists, no headings, no bold.', checks: [words('150-220'), none(AI_ISMS), judge(`Technically correct: an index speeds up look-ups at the cost of extra storage and slower writes, and gives a concrete case where it hurts. Pitched at a beginner without talking down. ${HUMAN}`)] },
    { prompt: 'Write the opening of a blog post about giving up a smartphone for a month. First person, 120 to 180 words. Start in the middle of a specific moment, not with a general statement. No lists, no headings.', checks: [words('120-180'), none(AI_ISMS), judge(`Opens inside one specific, sensory moment and makes the reader want the next paragraph. A personal voice with an opinion, not a summary of pros and cons. ${HUMAN}`)] },
    { prompt: 'Write the first scene of a novel: a lighthouse keeper finds a second set of wet footprints on the stairs. Third person, past tense, 200 to 280 words. Do not explain the mystery.', checks: [words('200-280'), none(AI_ISMS), judge(`Fiction with tension built from concrete physical detail and the keeper's behaviour, not from telling the reader he was afraid. The mystery is left open. Varied sentence length. ${HUMAN}`)] },
    { prompt: 'Describe a city street at four in the morning in the manner of literary fiction. 130 to 190 words. One paragraph. No characters with names, no dialogue.', checks: [words('130-190'), lines('1'), none(AI_ISMS), judge(`Precise, original images drawn from more than one sense; no cliché such as "the city that never sleeps"; a clear mood that comes from the details chosen. ${HUMAN}`)] },
    { prompt: 'Write an e-mail declining a vendor\'s proposal after three weeks of talks. You chose a competitor on price. Keep the door open for next year. 90 to 140 words, including a greeting and a sign-off from "Dana Whitlock". No subject line.', checks: [words('90-140'), none(AI_ISMS), has('Dana Whitlock'), judge(`Clear in the first two sentences that the answer is no and why; respectful and specific; leaves a real opening for the future; nothing a busy professional would cut. ${HUMAN}`)] },
    { prompt: 'Write the product description for a cast-iron frying pan on a shop\'s website. 80 to 120 words. One paragraph. No exclamation marks, no superlatives such as "best" or "perfect".', checks: [words('80-120'), lines('1'), none(`${AI_ISMS} | ! | best | perfect`), judge(`Sells through specific facts and uses (weight, heat, what it is good for, care), not through adjectives. Sounds like a shop with taste. ${HUMAN}`)] },
    { prompt: 'Write the "Getting started" paragraph of a README for a command-line tool called "tidy" that renames photo files by the date they were taken. 100 to 150 words of plain prose. Mention the one command a new user runs first and what happens to the original files.', checks: [words('100-150'), none(AI_ISMS.replace(' | ```', '')), has('tidy'), judge(`A new user knows exactly what to type first and what will happen to their files, including whether originals are changed. Direct, technical, no marketing. ${HUMAN}`)] },
    { prompt: 'Write the first two paragraphs of a local news article: the town\'s only bookshop is closing after 41 years. 140 to 200 words. Include one quoted sentence from the owner, Ruth Calder. Third person, past tense.', checks: [words('140-200'), lines('2'), none(AI_ISMS), has('Ruth Calder'), has('41'), judge(`Reads like newspaper copy: the main fact in the first sentence, then context, one quote that sounds like a person speaking. No opinion from the writer, no sentimentality. ${HUMAN}`)] },
    { prompt: 'Write one paragraph arguing that cities should make public transport free. 130 to 180 words. Take a clear side and answer the strongest objection in one sentence.', checks: [words('130-180'), lines('1'), none(AI_ISMS), judge(`A clear position stated early, supported by a concrete argument, and one honest sentence that answers the cost objection. Persuades by reasoning, not slogans. ${HUMAN}`)] },
    { prompt: 'Write a short scene, dialogue only, between two siblings clearing out their late father\'s garage. 150 to 220 words. No speaker names, no "he said" or "she said", no stage directions. Each line of speech on its own line.', checks: [words('150-220'), lines('8-40'), none(AI_ISMS.replace(' | —', '')), judge(`The two voices are distinct without labels; the grief and an old disagreement show through what they say about objects, not through stating feelings. Natural spoken rhythm. ${HUMAN}`)] },
    { prompt: 'Write a poem of exactly twelve lines about the last day of summer. No rhyme. No title. Do not use the words "golden", "whisper" or "fleeting".', checks: [lines('12'), none(`${AI_ISMS} | golden | whisper | fleeting`), judge('Twelve unrhymed lines with at least two fresh, concrete images; the feeling arrives through things seen and done, not abstract nouns; line breaks that earn their place; nothing a greeting card would say.')] },
    { prompt: 'Summarise for a non-technical manager why the team\'s release was delayed, from these facts: the payment provider changed its API on 2 June; our tests caught it on 4 June; the fix needs their approval, expected 12 June; no customer data was affected. 70 to 110 words. One paragraph.', checks: [words('70-110'), lines('1'), none(AI_ISMS), has('12 June'), judge(`States the cause, the new expected date and that no customer data was affected, in that order of importance, with no jargon and nothing invented beyond the facts given. ${HUMAN}`)] },
    { prompt: 'Write the "About" text for the website of a two-person bicycle repair shop called "Spoke & Thread", open since 2011. 90 to 130 words. First person plural. No slogans.', checks: [words('90-130'), none(AI_ISMS), has('Spoke & Thread'), judge(`Sounds like two real people who fix bikes: specific about what they do and how they work, modest, a little dry. No mission-statement language. ${HUMAN}`)] },
    { prompt: 'Explain to a careful reader how a hash function differs from encryption, with one everyday comparison. 140 to 200 words of plain prose. No lists, no headings.', checks: [words('140-200'), none(AI_ISMS), judge(`Correct: hashing is one-way and fixed-size, encryption is reversible with a key; says what each is used for. One comparison that actually fits and is not stretched. ${HUMAN}`)] },
  ],
);

const AGENT_NOTE = 'Work only inside the current folder, using your tools. Use any language that is installed on this machine.';

const tools = pack(
  {
    id: 'tools',
    name: 'Tool use',
    description: 'Short jobs that cannot be done without tools: create files, run a script or a command, and leave the exact result in a file. Each runs as a helper agent in its own temporary folder, so a Cowork or Code conversation must be open when you measure.',
    kind: 'agent',
  },
  [
    { prompt: `${AGENT_NOTE}\n\nCompute the sum of the squares of the whole numbers from 1 to 500 by running code, and write only that number to a file named result.txt.`, checks: [file('result.txt', '41791750')] },
    { prompt: `${AGENT_NOTE}\n\nHow many whole numbers from 1 to 2500 contain the digit 7 at least once? Work it out by running code, and write only that number to a file named sevens.txt.`, checks: [file('sevens.txt', '637')] },
    { prompt: `${AGENT_NOTE}\n\nCompute the SHA-256 hash of the exact text deepseek-harness-plus (no newline at the end). Write the first 12 hexadecimal characters of the hash, in lower case, to a file named hash.txt.`, checks: [file('hash.txt', 'cb1d8d4af47f')] },
    { prompt: `${AGENT_NOTE}\n\nBase64-encode this exact sentence (no newline at the end) and write the result on one line to a file named encoded.txt:\n\nSelf-improvement loop: measure, review, test, approve.`, checks: [file('encoded.txt', 'U2VsZi1pbXByb3ZlbWVudCBsb29wOiBtZWFzdXJlLCByZXZpZXcsIHRlc3QsIGFwcHJvdmUu')] },
    { prompt: `${AGENT_NOTE}\n\nHow many days are there from 31 December 1999 to 4 July 2031 (the later date minus the earlier one)? Work it out by running code and write only that number to a file named days.txt.`, checks: [file('days.txt', '11508')] },
    {
      prompt: `${AGENT_NOTE}\n\nCreate a file named stock.csv with the header item,quantity,price and these rows:\n\nwidget,12,3.40\ngadget,7,12.25\ndoohickey,31,0.80\ngizmo,4,49.99\nthingamajig,18,5.50\nwhatsit,9,7.75\ncontraption,2,120.00\ndoodad,26,1.15\n\nThen, by running code that reads that file, write a file named report.txt with exactly two lines:\n\ntotal=<the sum of quantity times price over all rows, with two decimals>\ntop=<the item with the highest quantity times price>`,
      checks: [exists('stock.csv'), file('report.txt', 'total=789.96'), file('report.txt', 'top=contraption')],
    },
    { prompt: `${AGENT_NOTE}\n\nSort these words alphabetically and write them on one line, separated by commas with no spaces, to a file named sorted.txt:\n\nquartz, ember, willow, atlas, nimbus, cobalt, harbor, zephyr, lantern, meadow, orchid, granite`, checks: [file('sorted.txt', 'atlas,cobalt,ember,granite,harbor,lantern,meadow,nimbus,orchid,quartz,willow,zephyr')] },
    {
      prompt: `${AGENT_NOTE}\n\nSave this sentence to a file named text.txt, then count how often each word appears by running code that reads the file. Write the three most frequent words to a file named top.txt, on one line, in the form word=count separated by single spaces, most frequent first.\n\nthe quick brown fox jumps over the lazy dog while the other fox watches the dog and the fox yawns`,
      checks: [exists('text.txt'), file('top.txt', 'the=5 fox=3 dog=2')],
    },
    {
      prompt: `${AGENT_NOTE}\n\nCreate three files: a.txt containing "one", b.txt containing "two two" and c.txt containing "three three three" (without the quotes). Then build a file named all.txt holding the three contents on one line, in reverse alphabetical order of the file names, separated by " / " (space, slash, space).`,
      checks: [exists('a.txt'), exists('b.txt'), exists('c.txt'), file('all.txt', 'three three three / two two / one')],
    },
    {
      prompt: `${AGENT_NOTE}\n\nCreate a file named notes.md with exactly these four lines:\n\nThe colour scheme is fixed.\nPick a colour for links.\nFonts are not decided.\nBackground colour: white.\n\nThen replace every "colour" with "color" in that file, and write the number of replacements you made to a file named count.txt.`,
      checks: [file('notes.md', 'The color scheme is fixed.'), file('notes.md', 'Background color: white.'), file('count.txt', '3')],
    },
  ],
);

const agentic = pack(
  {
    id: 'agentic',
    name: 'Agentic coding',
    description: 'Small multi-step jobs: write a program, run it on the given input, check it, and leave the exact result and a short README. Each runs as a helper agent in its own temporary folder, so a Cowork or Code conversation must be open when you measure.',
    kind: 'agent',
  },
  [
    { prompt: `${AGENT_NOTE}\n\nWrite a program that finds prime numbers. Use it to write a file named answer.txt with exactly two lines:\n\nprime1000=<the 1000th prime number>\nsum100=<the sum of the first 100 prime numbers>\n\nAlso write a README.md that says in two or three sentences how to run the program.`, checks: [file('answer.txt', 'prime1000=7919'), file('answer.txt', 'sum100=24133'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program that merges overlapping ranges of whole numbers. Two ranges overlap when they share at least one number, so 1-3 and 2-6 merge, and 22-25 contains 24-24. Run it on these ranges:\n\n8-12, 1-3, 2-6, 15-18, 17-20, 5-7, 11-13, 22-25, 24-24, 30-31\n\nWrite the merged ranges to a file named merged.txt on one line, lowest first, each as start-end, separated by single spaces. Also write a README.md that says how to run the program.`, checks: [file('merged.txt', '1-7 8-13 15-20 22-25 30-31'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program that simulates a least-recently-used cache that holds at most 3 keys. A "get" of a key that is present makes it the most recently used; a "get" of a missing key is a miss and changes nothing. A "put" adds or updates a key and makes it the most recently used; if that leaves more than 3 keys, the least recently used one is removed.\n\nRun these steps in order:\n\nput a 1, put b 2, put c 3, get a, put d 4, get b, put e 5, get c, get a, put f 6, get d, put a 9\n\nWrite a file named cache.txt with exactly two lines:\n\nkeys=<the keys left, least recently used first, separated by commas with no spaces>\nmisses=<the number of misses>\n\nAlso write a README.md that says how to run the program.`, checks: [file('cache.txt', 'keys=e,f,a'), file('cache.txt', 'misses=3'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program that runs Conway's Game of Life on an unbounded grid. Start with exactly these five live cells, given as (x, y): (1,0), (2,0), (0,1), (1,1), (1,2). Run 30 generations with the standard rules. Write only the number of live cells after generation 30 to a file named alive.txt. Also write a README.md that says how to run the program.`, checks: [file('alive.txt', '27'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program that finds the shortest path in a graph whose roads can be used in both directions. The roads and their lengths:\n\nA-B 7, A-C 9, A-F 14, B-C 10, B-D 15, C-D 11, C-F 2, D-E 6, E-F 9, E-G 4, D-G 13, F-H 20, G-H 3\n\nFind the shortest path from A to H. Write a file named route.txt with exactly two lines:\n\ndistance=<the total length>\npath=<the towns in order, joined by ">" with no spaces>\n\nAlso write a README.md that says how to run the program.`, checks: [file('route.txt', 'distance=27'), file('route.txt', 'path=A>C>F>E>G>H'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nSave these lines to a file named app.log, then write a program that reads the file and writes a file named summary.txt with exactly three lines:\n\nerrors=<the number of ERROR lines>\nwarnings=<the number of WARN lines>\navg_timeout_ms=<the average of the millisecond values in the "db timeout" lines, as a whole number>\n\n10:01 INFO start\n10:02 WARN disk 81%\n10:03 ERROR db timeout 1200ms\n10:04 INFO retry\n10:05 ERROR db timeout 3400ms\n10:06 INFO ok\n10:09 WARN disk 86%\n10:11 ERROR cache miss storm\n10:12 ERROR db timeout 900ms\n10:15 INFO ok\n10:17 WARN disk 91%\n10:20 ERROR db timeout 2100ms\n\nAlso write a README.md that says how to run the program.`, checks: [exists('app.log'), file('summary.txt', 'errors=5'), file('summary.txt', 'warnings=3'), file('summary.txt', 'avg_timeout_ms=1900'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program, without using a maths library for the matrix work, that multiplies matrix A by matrix B (A first) and then computes the determinant and the trace of the product.\n\nA = [[2, -1, 0], [1, 3, 4], [0, 5, -2]]\nB = [[1, 2, 3], [0, -1, 4], [5, 0, 1]]\n\nWrite a file named matrix.txt with exactly two lines:\n\ndeterminant=<the determinant>\ntrace=<the trace>\n\nAlso write a README.md that says how to run the program.`, checks: [file('matrix.txt', 'determinant=-2916'), file('matrix.txt', 'trace=19'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program that keeps account balances. All accounts start at 0. A withdrawal or a transfer that would make the paying account negative is rejected and changes nothing. Apply these steps in order:\n\ndeposit acc1 500\ndeposit acc2 300\ntransfer acc1 acc2 120\nwithdraw acc2 500\nwithdraw acc2 400\ntransfer acc2 acc3 50\ndeposit acc3 75\ntransfer acc3 acc1 200\ntransfer acc3 acc1 100\nwithdraw acc1 480\n\n(In a transfer the first account pays the second.) Write a file named balances.txt with exactly four lines:\n\nacc1=<balance>\nacc2=<balance>\nacc3=<balance>\nrejected=<the number of rejected steps>\n\nAlso write a README.md that says how to run the program.`, checks: [file('balances.txt', 'acc1=380'), file('balances.txt', 'acc2=20'), file('balances.txt', 'acc3=75'), file('balances.txt', 'rejected=5'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nThe Collatz sequence of a whole number n goes: if n is even, halve it; if n is odd, replace it by 3n + 1; stop at 1. Its length counts every number in it, including n itself and the final 1. Write a program that finds the starting number below 3000 with the longest sequence. Write a file named collatz.txt with exactly two lines:\n\nstart=<that starting number>\nlength=<the length of its sequence>\n\nAlso write a README.md that says how to run the program.`, checks: [file('collatz.txt', 'start=2919'), file('collatz.txt', 'length=217'), exists('README.md')] },
    { prompt: `${AGENT_NOTE}\n\nWrite a program with two functions: one that run-length encodes a string (each run of the same character becomes the character followed by the length of the run, so "aab" becomes "a2b1"), and one that decodes it again. Encode this string:\n\naaabccccddddddeffffgggggggh\n\nWrite a file named rle.txt with exactly two lines:\n\nencoded=<the encoded string>\nroundtrip=<"ok" if decoding the encoded string gives the original again, otherwise "fail">\n\nAlso write a README.md that says how to run the program.`, checks: [file('rle.txt', 'encoded=a3b1c4d6e1f4g7h1'), file('rle.txt', 'roundtrip=ok'), exists('README.md')] },
  ],
);

/** Every pack, in the order the page shows them. */
export const PACKS = [reasoning, coding, structured, instructions, knowledge, writing, tools, agentic];

/**
 * What the page shows for each pack.
 * @param {Array<{id: string}>} existing - the tasks already stored.
 * @returns {object[]} `id, name, description, count, added, needsJudge, needsTools` per pack.
 */
export function packList(existing = []) {
  const ids = new Set(existing.map((task) => task.id));
  return PACKS.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    count: item.tasks.length,
    added: item.tasks.filter((task) => ids.has(task.id)).length,
    needsJudge: item.needsJudge,
    needsTools: item.kind === 'agent',
  }));
}
