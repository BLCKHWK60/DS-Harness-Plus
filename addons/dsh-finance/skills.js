/**
 * The Finance mode's skills: one way of working for each common research task. A skill is loaded
 * into the model's context only when it is used, so each is kept short. All of them follow the
 * mode's rules: figures only from sources fetched in the conversation, both sides, no advice.
 */
const RULES = `Rules for every step: a figure needs a source you fetched in this conversation, with its date. Keep apart reported facts, management's claims, other people's opinions and your own reading. This is research, not advice: never say buy, sell or hold.`;

export const SKILLS = [
  {
    name: 'finance-company-deep-dive',
    description: 'Research one company from all sides: business, figures, news, mood, outlook, risks, and the case for and against.',
    whenToUse: 'The user asks for a deep dive, a full picture, an overview or "everything" about one company, or asks whether a company is doing well or where it is going.',
    content: `# Company deep dive

${RULES}

## 1. Pin down the company
Confirm the exact company, its listing and its currency. If the name is ambiguous, ask. Note the market the user selected.

## 2. The business
In a few sentences: what it sells, to whom, where, and what the money mostly comes from. Name the two or three things that drive its results.

## 3. Figures
From the latest annual and quarterly reports: revenue and its growth, margins, profit, cash flow, debt and cash, and the measures that matter in its industry. Give each with its period and source. Show the direction over the selected period, not one number alone.

## 4. News
The developments of the last weeks and months that change the picture: results, guidance, deals, products, management changes, legal and regulatory matters. Date each.

## 5. Mood
What investors, customers and employees are saying on social media and forums. Say where you looked, how recent it is, whether it is a few voices or many, and whether it is changing. Treat it as a signal.

## 6. What is ahead
Guidance and stated plans; the next dated events; order book or pipeline; what competitors, suppliers, customers and regulators are doing that will matter.

## 7. Risks
The specific things that could go wrong, most serious first. Avoid generic lists.

## 8. Both cases
The case for and the case against, each with its evidence and what would have to be true.

## 9. Close
What you could not find or could not verify, then the sources with dates. If a chart would help (revenue and margin over time, against peers), make one from the sourced figures.`,
  },
  {
    name: 'finance-earnings-review',
    description: 'Review a company\'s latest earnings: what was reported, how it compares with expectations and earlier periods, what management said, and how the market and commentators reacted.',
    whenToUse: 'The user asks about a company\'s latest results, quarter, earnings call or guidance, or what changed after earnings.',
    content: `# Earnings review

${RULES}

1. Find the latest results release and, if available, the call transcript or a reliable summary of it. State the period and the date reported.
2. Reported: the headline figures and the ones that matter for this business, each against the same period a year ago and the previous period.
3. Against expectations: only if you can find what was expected, from a named source. Otherwise say expectations could not be sourced.
4. Guidance: what management said about the next period and the year, and whether that is up, down or unchanged from before.
5. What management stressed, and what it avoided or was pressed on in questions.
6. Reaction: the share price move if you can source it, and what analysts, journalists and social media took from it. Label opinions as opinions.
7. What it changes: the two or three things that are different now, for better and for worse.
8. What you could not find, then sources with dates.`,
  },
  {
    name: 'finance-news-and-mood',
    description: 'Scan what the news and social media are saying about a company, sector or market right now, and how that mood is changing.',
    whenToUse: 'The user asks what people are saying, what the sentiment or mood is, what the news is, or why something is moving.',
    content: `# News and mood scan

${RULES}

1. News first: the main stories of the selected period from established outlets and primary sources. Date each and say what is fact and what is commentary.
2. Then mood: search social media and forums (for example X, Reddit, StockTwits, industry forums, app and employer reviews where relevant). Note where you could look and where you could not.
3. Describe the mood in plain words: mostly positive, negative, split or quiet; the two or three themes behind it; a few representative posts, each with its source and date.
4. Say how wide and how fresh it is: a handful of accounts or many; today, this week or older. Say whether it has shifted and after what.
5. Check the mood against the facts: where does the talk match the figures and news, and where does it run ahead of them or contradict them?
6. Watch for manipulation: coordinated posts, promotion, rumours with no source. Say so when you see signs of it.
7. Close with what this does and does not tell the user, what you could not find, and the sources with dates.`,
  },
  {
    name: 'finance-compare',
    description: 'Compare a company with its closest competitors, or several companies with each other, on the same measures and periods.',
    whenToUse: 'The user asks to compare companies, asks who is ahead in a field, or asks how one company stands against its peers.',
    content: `# Compare companies

${RULES}

1. Agree the set: the companies named, or the three to five closest competitors in the selected market. Say why these.
2. Choose measures that fit the industry (growth, margins, cash flow, debt, market share, valuation and the industry's own measures). Use the same period and, where possible, the same currency for all; say when a figure is not like for like.
3. Put the figures in one table, each cell sourced. Leave a cell empty rather than guess.
4. Beyond the table: where each one is gaining or losing, what each is betting on, and what the news and the mood say about each.
5. Make a chart when it shows the difference more clearly than the table.
6. Summarise who leads on what. Do not name a "best" company to own; set out the trade-offs.
7. What you could not find, then sources with dates.`,
  },
  {
    name: 'finance-sector-scan',
    description: 'Scan a sector or industry in a market: size and direction, what drives it, who is gaining and losing, and what is coming.',
    whenToUse: 'The user asks about a sector, an industry or a theme (for example chips, banks, electric cars, weight-loss drugs) rather than one company.',
    content: `# Sector scan

${RULES}

1. Define the sector and the market in one sentence, and name the main companies in it.
2. Size and direction: what can be sourced about its size, growth and where demand comes from.
3. Drivers: the three or four forces moving it now (technology, prices and costs, regulation, interest rates, supply, consumer habits).
4. Who is gaining and who is losing, with the evidence, and why.
5. News and mood across the sector for the selected period.
6. What is ahead: dated events, rule changes, capacity coming on line, new entrants.
7. Risks to the whole sector, and the case for and against it.
8. What you could not find, then sources with dates.`,
  },
  {
    name: 'finance-economy-brief',
    description: 'Brief on an economy or region: growth, inflation, jobs, interest rates, currency, public finances, and what is expected next.',
    whenToUse: 'The user asks about a country\'s or region\'s economy, about inflation, interest rates, a central bank, a currency, or the outlook for a market as a whole.',
    content: `# Economy brief

${RULES}

1. State the economy or region and the date of the brief.
2. The main readings, each with its latest value, its date and its source (statistical office, central bank, IMF, OECD, World Bank): growth, inflation, unemployment, policy interest rate, currency, government deficit and debt, trade balance. Say which way each is moving.
3. Policy: what the central bank and the government have done recently and have said they will do.
4. News: the events of the selected period that matter (elections, budgets, trade measures, shocks).
5. Mood: business and consumer confidence surveys where they exist, and what commentators and markets are saying.
6. What is expected: forecasts from named institutions, with their dates, and the next scheduled decisions and data releases.
7. Risks on both sides, and what it means for companies or sectors the user has asked about.
8. What you could not find, then sources with dates.`,
  },
  {
    name: 'finance-what-changed',
    description: 'Report what has changed for a company, sector or economy since a given date or over a recent period.',
    whenToUse: 'The user asks what is new, what changed, for an update, or for a recurring brief (daily, weekly, monthly) on something they follow.',
    content: `# What changed

${RULES}

1. Fix the window: the period the user gave or selected. State its start and end dates.
2. List only what is new inside the window, most important first: results and guidance, news, price and valuation moves if they can be sourced, changes in mood, new dates on the calendar.
3. For each item: what happened, when, the source, and why it matters.
4. Say what did not change that the user might expect to hear about.
5. If an earlier brief or note is available in the conversation or in the user's Library, compare against it and say what is different from then.
6. End with what to watch next, with dates, then what you could not find, then the sources.
Keep it short: this is an update, not a full report.`,
  },
];
