/**
 * The tools of a Recon conversation. Each one first checks that it is being called from an
 * isolated Recon conversation and that the user allows content to go to the conversation's model.
 * Searching and reading .onion sites go through lib/onion.js, Usenet through lib/usenet.js.
 */
import { MODE_TOOLS, TOOLS } from './mode.js';
import { UNTICKED, untickedRefusal } from './ticks.js';

/**
 * How a tool's answer starts when the tool did not run (below, and mayReceive in lib/model.js).
 * Such an answer holds nothing found. Keep in step with those texts.
 */
const NOT_RUN = [
  'Recon is switched off',
  'This tool works only in a thread in the Recon space',
  'This Recon thread runs in a folder of the user',
  'It did not work:',
  'This thread uses ',
  'The model of this thread could not be told',
  // recon_ultra (Ultra Code's recipe) when it did not run.
  'Ultra Code is off',
  'This works only in a Recon thread itself',
  'Nothing was read',
  'No draft was written',
  'The action is search or report',
  "Recon's web is off",
  // A tool whose source is not ticked on the Web button (lib/ticks.js).
  UNTICKED,
  'Your own sources are read in Recon only',
  // Stage 7 (words only): the same answers as worded before, still found in threads saved earlier, so a restart
  // rebuilds them exactly as before. Input matching of old saved text; never shown.
  'This tool works only in a conversation of the Recon tab',
  'This Recon conversation runs in a folder of the user',
  'This conversation uses ',
  'The model of this conversation could not be told',
  'This works only in a Recon conversation itself',
  'Not among this conversation\'s Recon sources',
];

/** The marker the app's compaction puts around its summary of earlier history. */
export const SUMMARY_MARK = '<compacted-summary>';

/**
 * Whether a conversation's history was condensed by the app's compaction. The summary keeps what
 * the removed tool answers said, so the tool answers themselves can no longer be found. The app
 * puts the summary in a user message whose source is `compact-checkpoint`
 * (`app/dsh-compaction/src/checkpoint.ts`), framed by `<compacted-summary>`
 * (`app/dsh-compaction-basic/src/summarizer.ts`); either sign counts.
 * @param {object[]} messages - the conversation's derived messages.
 * @returns {boolean} true when a summary is among them.
 */
export function wasCompacted(messages) {
  for (const message of messages ?? []) {
    if (message?.source?.kind === 'compact-checkpoint') return true;
    if (message?.role !== 'user') continue;
    const content = Array.isArray(message?.content) ? message.content : [{ type: 'text', text: message?.content }];
    for (const block of content) if (typeof block?.text === 'string' && block.text.includes(SUMMARY_MARK)) return true;
  }
  return false;
}

/**
 * Whether a conversation's history holds something a recon tool found: an answer of a recon tool
 * that ran. A copy of a Recon conversation (Rerun) carries these too, under another id.
 * @param {object[] | undefined} messages - the conversation's messages, as the app derives them.
 * @returns {boolean}
 */
export function holdsFindings(messages) {
  for (const _answer of answersOf(messages)) return true;
  return false;
}

/**
 * The answers of recon tools that ran, in the order of the history: what the conversation was
 * shown by Recon. Refusals and failed calls are left out; so is every other tool's answer.
 * @param {object[] | undefined} messages - the conversation's messages, as the app derives them.
 * @yields {{name: string, text: string}} the tool's name and its answer's text.
 */
export function* answersOf(messages) {
  const calls = new Map();
  for (const message of messages ?? []) {
    const content = Array.isArray(message?.content) ? message.content : [];
    if (message?.role === 'assistant') {
      // Recon's tools and Ultra Code's recipe: what either answered is what Recon found.
      for (const block of content) if (block?.type === 'tool-call' && MODE_TOOLS.includes(block.name)) calls.set(block.id, block.name);
    } else if (message?.role === 'tool' && message.isError !== true && calls.has(message.toolCallId ?? message.source?.callId)) {
      const text = content.map((block) => (block?.type === 'text' ? block.text : '')).join('').trimStart();
      if (!NOT_RUN.some((start) => text.startsWith(start))) yield { name: calls.get(message.toolCallId ?? message.source?.callId), text };
    }
  }
}

/**
 * @param {object} deps - `enabled()`, `inRecon(exec)` (is this an isolated Recon conversation), `gate(exec)` ({ok, why}),
 *   `inRoom(exec)` (does the conversation run in Recon's throwaway folder), `onion` (lib/onion.js), `usenet` (lib/usenet.js), `sources` (lib/sources.js), `idOf(exec)` (the conversation's id),
 *   `restore(exec)` (rebuild the conversation's record from its saved history, once after a restart; lib/restore.js).
 * @returns {object[]} the tool definitions.
 */
export function buildTools({ enabled, inRecon, inRoom, gate, onion, clearnet, boards, usenet, web, sources, idOf, restore, ticks = () => undefined, kinds = () => [], other }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const guarded = (work, name) => async (args, exec) => {
    try {
      if (!enabled()) return { text: 'Recon is switched off in Settings → Recon.' };
      if (!inRecon(exec)) return { text: 'This tool works only in a thread in the Recon space. It was not run.' };
      if (!inRoom(exec)) return { text: 'This Recon thread runs in a folder of the user\'s, so its tools are off: the model would be told that folder\'s path. Nothing was sent. Tell the user to start a new thread with the New button in the Recon space; it then runs in Recon\'s own empty folder.' };
      // The Web button's ticks (the one Web selector): a source that is not ticked is not used.
      const unticked = untickedRefusal({ name, args: args ?? {}, ticks: ticks(exec), kinds });
      if (unticked) return { text: unticked };
      const allowed = gate(exec);
      if (!allowed.ok) return { text: allowed.why };
      // After a restart, earlier sources and shown addresses come back before the first tool runs.
      restore?.(exec);
      return { text: await work(args ?? {}, exec) };
    } catch (error) {
      return { text: `It did not work: ${String(error?.message ?? error).slice(0, 300)}` };
    }
  };
  const common = { output, isConcurrencySafe: () => false, timeoutMs: 240_000 };
  const text = (maxLength, description) => ({ type: 'string', maxLength, description });
  const defs = {
    recon_onion_search: ['Search the filtered .onion index for a topic. Gives titles, .onion addresses and short descriptions as untrusted text.', { query: text(300, 'What to look for, in a few words.') }, ['query']],
    recon_onion_read: ['Read the text of one .onion page. Text only: no pictures, scripts or downloads. The address must come from a search result, a page already read, or the user. Long pages come in parts.', { address: text(600, 'The full .onion address of the page.'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long page. Leave out for the first.' } }, ['address']],
    recon_web_search: ['Search the ordinary web (forums, boards, blogs, news, anything indexed) through the user\'s WireGuard tunnel. Gives titles, addresses and short descriptions as untrusted text.', { query: text(300, 'What to look for. Search engine words work: an exact phrase in double quotes, site:example.com.'), engine: { type: 'string', enum: ['duckduckgo', 'mojeek', 'marginalia'], description: 'Which engine to try first. Leave out for DuckDuckGo, then the others.' } }, ['query']],
    recon_web_read: ['Read the text of one page of the ordinary web through the user\'s WireGuard tunnel. Text only. The address must come from a search result, a page already read, or the user. Long pages come in parts.', { address: text(800, 'The page\'s full address, exactly as shown.'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long page. Leave out for the first.' } }, ['address']],
    recon_board_search: ['Search a back channel that search engines miss, through the user\'s WireGuard tunnel: 4chan (a board\'s live threads), 4chan-archive (old threads), reddit (posts or comments; by words, subreddit or author), hackernews, lemmy, mastodon (by hashtag), github (issues), breaches (known data breaches by site or name). Telegram has no search across channels: read a channel with recon_board_read.', { source: { type: 'string', enum: ['4chan', '4chan-archive', 'reddit', 'telegram', 'hackernews', 'lemmy', 'mastodon', 'github', 'breaches'], description: 'Where to search.' }, query: text(200, 'What to look for. For mastodon one hashtag word.'), board: text(8, '4chan: the board, for example pol, g, int, biz. Optional for the archives.'), subreddit: text(40, 'reddit: only in this subreddit.'), author: text(40, 'reddit: only by this user.'), kind: { type: 'string', enum: ['posts', 'comments'], description: 'reddit: posts (default) or comments.' } }, ['source']],
    recon_board_read: ['Read a whole thread, post with its comments, or public Telegram channel, through the user\'s WireGuard tunnel. Use the source, board, archive and id a search listed (its "read with" line); for telegram the channel\'s name, with an optional query to search inside it.', { source: { type: 'string', enum: ['4chan', '4chan-archive', 'reddit', 'telegram', 'hackernews', 'lemmy'], description: 'Which source.' }, id: text(80, 'The thread\'s or post\'s number or id, or the Telegram channel\'s name.'), board: text(8, '4chan: the board.'), archive: { type: 'string', enum: ['desuarchive', 'b4k', 'palanq'], description: '4chan-archive: which archive.' }, query: text(100, 'telegram: words to search inside the channel.') }, ['source', 'id']],
    recon_usenet_groups: ['Find Usenet text newsgroups by name, on one of the user\'s Usenet accounts. Binary groups are never listed.', { pattern: text(120, 'Part of a group name, for example "comp.security".'), account: text(60, 'Which Usenet account, by its name or its server. Leave out for the default account.') }, ['pattern']],
    recon_usenet_search: ['Search the headers (subject, author, date) of articles in one text newsgroup, on one of the user\'s Usenet accounts. Usenet has no full-text search.', { group: text(160, 'The newsgroup.'), subject: text(200, 'Words in the subject.'), author: text(120, 'Part of the author as shown.'), since: text(40, 'Earliest date, as YYYY-MM-DD.'), account: text(60, 'Which Usenet account, by its name or its server. Leave out for the default account.') }, ['group']],
    recon_usenet_read: ['Read the text of one Usenet article by its Message-ID. Articles that carry encoded files are refused. Long articles come in parts.', { group: text(160, 'The newsgroup.'), messageId: text(300, 'The article\'s Message-ID, with its angle brackets.'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long article. Leave out for the first.' }, account: text(60, 'Which Usenet account, by its name or its server. Leave out for the default account.') }, ['group', 'messageId']],
    recon_news_search: ['Search the GDELT Project\'s index of worldwide news coverage for a topic. Gives titles, addresses, publishers and dates; not the articles themselves.', { query: text(200, 'What to look for, in a few words. Put an exact phrase in double quotes.'), days: { type: 'integer', minimum: 1, maximum: 90, description: 'How many days back. Leave out for 7.' }, language: text(20, 'Only coverage in this language, as an English word: english, german, spanish. Leave out for all.') }, ['query']],
    recon_archive_find: ['List the dated copies the Internet Archive holds of a web page. Use it before recon_archive_read.', { address: text(500, 'The page\'s address on the web.'), from: text(10, 'Earliest date, YYYY or YYYY-MM-DD.'), to: text(10, 'Latest date, YYYY or YYYY-MM-DD.') }, ['address']],
    recon_archive_read: ['Read the text of one Internet Archive copy of a web page. Text only. This is the only way to read a page from the normal web here. Long pages come in parts.', { address: text(500, 'The page\'s address on the web.'), timestamp: text(14, 'The copy\'s timestamp, as recon_archive_find lists it.'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long page. Leave out for the first.' } }, ['address', 'timestamp']],
    recon_other_search: ['Search one of the user\'s own sources that they allowed in Recon (a site with their own login, key or private address), through the user\'s WireGuard tunnel only. Give the source\'s name exactly as listed and the search words.', { source: text(60, 'The source\'s name.'), query: text(300, 'The search words.') }, ['source', 'query']],
    recon_other_read: ['Read a page of one of the user\'s own sources that they allowed in Recon, through the user\'s WireGuard tunnel only. Give the source\'s name and, optionally, a link as a search or page of that source gave it. Long pages come in parts.', { source: text(60, 'The source\'s name.'), link: text(2000, 'A link on that source, as given (a path such as /item/12).'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long page. Leave out for the first.' } }, ['source']],
    recon_cite: ['Give the full citation of something read in this thread: source, author and date as shown, when it was retrieved, and the fingerprint of its text.', { source: text(600, 'The source\'s number (S3), its .onion address or its Message-ID.') }, ['source']],
  };
  const work = {
    recon_onion_search: (args, exec) => onion.search(idOf(exec), args.query),
    recon_onion_read: (args, exec) => onion.read(idOf(exec), args.address, args.part),
    recon_web_search: (args, exec) => clearnet.search(idOf(exec), args.query, args.engine),
    recon_web_read: (args, exec) => clearnet.read(idOf(exec), args.address, args.part),
    recon_board_search: (args, exec) => boards.search(idOf(exec), args),
    recon_board_read: (args, exec) => boards.read(idOf(exec), args),
    recon_usenet_groups: (args, exec) => usenet.groups(idOf(exec), args.pattern, args.account),
    recon_usenet_search: (args, exec) => usenet.search(idOf(exec), args),
    recon_usenet_read: (args, exec) => usenet.read(idOf(exec), args),
    recon_news_search: (args, exec) => web.news(idOf(exec), args.query, { days: args.days, language: args.language }),
    recon_archive_find: (args, exec) => web.archiveFind(idOf(exec), args.address, { from: args.from, to: args.to }),
    recon_archive_read: (args, exec) => web.archiveRead(idOf(exec), args.address, args.timestamp, args.part),
    recon_other_search: (args, exec) => other.search(idOf(exec), args.source, args.query),
    recon_other_read: (args, exec) => other.read(idOf(exec), args.source, args.link, args.part),
    recon_cite: async (args, exec) => {
      const source = sources.find(idOf(exec), args.source);
      if (source) return sources.cite(source);
      const have = sources.list(idOf(exec));
      return have.length === 0 ? 'Nothing was read in this thread yet, so there is nothing to cite. Sources read before the app restarted count only while their tool answers are still in the thread.' : `That source was not read in this thread. Read so far: ${have.map((one) => `S${one.n} ${one.url}`).join('; ').slice(0, 1500)}`;
    },
  };
  return TOOLS.map((name) => {
    const [description, properties, required] = defs[name];
    return { name, description, parameters: { type: 'object', properties, required, additionalProperties: false }, ...common, execute: guarded(work[name], name) };
  });
}
