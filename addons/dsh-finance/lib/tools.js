/**
 * The Finance data tools the assistant can call. They exist only while Finance is switched on.
 * Each answer is plain text in which every number has its period, its source and its date.
 */
import { DEFAULT_INDICATORS, DEFAULT_MEASURES, INDICATORS, MEASURES, companyFigures, companyFilings, economyReadings } from './data.js';

/**
 * @param {() => boolean} enabled - whether Finance is switched on.
 * @returns {object[]} tool definitions.
 */
export function buildTools(enabled) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const safely = (work, fallback) => async (args) => {
    if (!enabled()) return { text: 'Finance is switched off in Settings → Finance.' };
    try {
      return { text: await work(args ?? {}) };
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 300);
      return { text: `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${/[.!?]$/.test(reason) ? '' : '.'} ${fallback}`.trim() };
    }
  };
  const company = { type: 'string', maxLength: 80, description: 'The company: its name, its ticker (for example NVDA), or its SEC company number (CIK).' };
  const common = { output, isConcurrencySafe: () => true, timeoutMs: 60_000 };
  return [
    {
      name: 'finance_company_figures',
      description: [
        'Reported figures of a company that files with the US securities regulator (every US-listed company and many foreign ones): revenue, profit, earnings per share, cash flow, cash, debt and more, by financial year or by quarter.',
        'These are the company\'s own numbers from its filings, each with its period, the form it was filed in and the filing date. Use this before searching the web for such figures, and cite the form and date.',
        'It has no share prices, no estimates and no forecasts, and nothing for companies that do not file in the United States: use web search for those.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          company,
          measures: { type: 'array', maxItems: 13, items: { type: 'string', enum: Object.keys(MEASURES) }, description: `Which figures. Default: ${DEFAULT_MEASURES.join(', ')}.` },
          period: { type: 'string', enum: ['annual', 'quarterly'], description: 'By financial year (default) or by quarter.' },
          count: { type: 'integer', minimum: 1, maximum: 12, description: 'How many periods, newest first. Default 5 years or 8 quarters.' },
        },
        required: ['company'],
        additionalProperties: false,
      },
      ...common,
      execute: safely(companyFigures, 'Use web search for this company\'s figures instead, and say that they did not come from the regulator\'s data.'),
    },
    {
      name: 'finance_company_filings',
      description: 'The recent filings of a company with the US securities regulator: annual reports (10-K, 20-F), quarterly reports (10-Q) and news it had to report (8-K, 6-K), each with its date and a link to the document. Use it to find the latest results, what the company announced and when, and to get the document to read.',
      parameters: {
        type: 'object',
        properties: {
          company,
          forms: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 12 }, description: 'Form types, for example ["10-K", "10-Q"]. Default: 10-K, 10-Q, 8-K, 20-F, 40-F, 6-K.' },
          limit: { type: 'integer', minimum: 1, maximum: 30, description: 'How many filings, newest first. Default 10.' },
        },
        required: ['company'],
        additionalProperties: false,
      },
      ...common,
      execute: safely(companyFilings, 'Use web search for this company\'s announcements instead.'),
    },
    {
      name: 'finance_economy',
      description: [
        'Yearly readings for one or more economies from the World Bank: growth, inflation, unemployment, size of the economy, GDP per person, government debt, current account, exports, population.',
        'Each value comes with its year. Yearly figures arrive late, so the newest is usually last year\'s. It has no monthly or quarterly data, no forecasts, no interest rates and no exchange rates: use web search for those, and for anything from this year.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          countries: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', maxLength: 60 }, description: 'Countries or regions by English name or three-letter code, for example ["Japan", "USA", "euro area", "world"].' },
          indicators: { type: 'array', maxItems: 9, items: { type: 'string', enum: Object.keys(INDICATORS) }, description: `Which readings. Default: ${DEFAULT_INDICATORS.join(', ')}.` },
          years: { type: 'integer', minimum: 1, maximum: 15, description: 'How many recent years. Default 5.' },
        },
        required: ['countries'],
        additionalProperties: false,
      },
      ...common,
      execute: safely(economyReadings, 'The World Bank\'s service may be slow or down; try once more, then use web search and name the source you find.'),
    },
  ];
}

/**
 * The tool that reads from the extra sources the owner added.
 * @param {object} options - what it needs.
 * @param {() => boolean} options.enabled - whether Finance is switched on.
 * @param {() => object[]} options.sources - the sources (`readSources`).
 * @param {(id: string) => Promise<string>} options.keyOf - a source's secret from the app's store; '' when none.
 * @param {(source: object, key: string, path: unknown, query: unknown) => Promise<string>} options.get - reads from a source.
 * @returns {object} the tool definition.
 */
export function buildSourceTool({ enabled, sources, keyOf, get }) {
  return {
    name: 'finance_source_get',
    description: [
      'Read data from one of the extra Finance data sources the user added (a data service with their own key), for example share prices, estimates or news with sentiment.',
      'Give the source\'s id, the path after its address, and the parameters. Only reading is possible, and only from that source. The key is added for you: never put a key in the path or the parameters.',
      'Which sources exist and what each is good for is in your instructions. If you do not know a source\'s paths, read its documentation with the web fetch tool first.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', maxLength: 30, description: 'The source\'s id, as given in your instructions.' },
        path: { type: 'string', maxLength: 300, description: 'The part after the source\'s address, for example "quote" or "real-time/AAPL.US".' },
        query: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] }, description: 'Parameters, for example {"symbol": "AAPL"}. Leave the key out.' },
      },
      required: ['source', 'path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    isConcurrencySafe: () => true,
    timeoutMs: 60_000,
    execute: async (args) => {
      if (!enabled()) return { text: 'Finance is switched off in Settings → Finance.' };
      const usable = sources().filter((source) => source.kind === 'api' && source.on);
      const source = usable.find((item) => item.id === String(args?.source ?? '').trim().toLowerCase());
      if (!source) return { text: usable.length === 0 ? 'No extra data source is set up. The user adds them in Settings → Finance.' : `There is no source "${String(args?.source ?? '')}". The sources are: ${usable.map((item) => item.id).join(', ')}.` };
      try {
        const key = source.keyIn === 'none' ? '' : await keyOf(source.id);
        return { text: await get(source, key, args?.path, args?.query) };
      } catch (error) {
        return { text: String(error?.message ?? error).slice(0, 400) };
      }
    },
  };
}
