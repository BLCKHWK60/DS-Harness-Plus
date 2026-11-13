/**
 * A rough tone for a short text, by counting words. It is a coarse measure for charts of many
 * posts over time; it does not understand irony, context or negation beyond the word before.
 * The assistant is told to read the posts itself and to call this what it is.
 */
const POSITIVE = 'beat beats beating strong stronger strongest growth growing grew gain gains gained surge surged surges soar soared soars rally rallied rallies record upgrade upgraded upgrades outperform outperformed bullish bull profit profitable profits boom booming rebound rebounded recovery recover recovered optimistic optimism win wins winning won success successful breakthrough innovative impressive excellent great good better best solid robust healthy raise raised raises boost boosted boosts expand expanded expanding expansion exceed exceeded exceeds love loved amazing positive upside momentum buyback dividend'.split(' ');
const NEGATIVE = 'miss missed misses weak weaker weakest decline declined declines declining drop dropped drops fall fell falling falls plunge plunged plunges slump slumped crash crashed crashes loss losses losing lost downgrade downgraded downgrades underperform underperformed bearish bear selloff sell-off fear fears worried worry worries concern concerns concerned risk risky warning warns warned lawsuit sued fraud scandal probe investigation fine fined recall layoffs layoff cut cuts bankrupt bankruptcy default debt crisis recession inflation slowdown slowing delay delayed delays shortage ban banned sanctions tariff tariffs bubble overvalued terrible bad worse worst awful scam hate negative downside disappointing disappointed disappoint quits resign resigned resigns'.split(' ');
const NEGATORS = new Set(['not', 'no', 'never', "isn't", "wasn't", "don't", "doesn't", "didn't", "won't", "can't", 'without', 'hardly']);
const POS = new Set(POSITIVE);
const NEG = new Set(NEGATIVE);

/**
 * @param {string} text - a headline or a post.
 * @returns {number} from -1 (only negative words) to 1 (only positive words); 0 when it has neither.
 */
export function tone(text) {
  const words = String(text ?? '').toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
  let up = 0;
  let down = 0;
  for (let i = 0; i < words.length; i += 1) {
    const flip = i > 0 && NEGATORS.has(words[i - 1]);
    if (POS.has(words[i])) flip ? (down += 1) : (up += 1);
    else if (NEG.has(words[i])) flip ? (up += 1) : (down += 1);
  }
  return up + down === 0 ? 0 : Math.round(((up - down) / (up + down)) * 100) / 100;
}

/**
 * Posts counted by day.
 * @param {{date: string, text: string}[]} posts - dated texts.
 * @returns {{date: string, posts: number, tone: number}[]} oldest first; tone is the day's average.
 */
export function byDay(posts) {
  const days = new Map();
  for (const post of posts) {
    const entry = days.get(post.date) ?? { posts: 0, sum: 0 };
    entry.posts += 1;
    entry.sum += tone(post.text);
    days.set(post.date, entry);
  }
  return [...days.keys()].sort().map((date) => ({ date, posts: days.get(date).posts, tone: Math.round((days.get(date).sum / days.get(date).posts) * 100) / 100 }));
}

/**
 * How many texts lean each way.
 * @param {{text: string}[]} posts - texts.
 * @returns {{positive: number, negative: number, neutral: number}} counts.
 */
export function split(posts) {
  const out = { positive: 0, negative: 0, neutral: 0 };
  for (const post of posts) {
    const value = tone(post.text);
    if (value > 0.2) out.positive += 1;
    else if (value < -0.2) out.negative += 1;
    else out.neutral += 1;
  }
  return out;
}
