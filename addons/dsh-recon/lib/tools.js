/**
 * The tools of a Recon conversation. Each one first checks that it is being called from an
 * isolated Recon conversation and that the user allows content to go to the conversation's model.
 * Searching and reading .onion sites go through lib/onion.js, Usenet through lib/usenet.js.
 */
import { TOOLS } from './mode.js';

/**
 * @param {object} deps - `enabled()`, `inRecon(exec)` (is this an isolated Recon conversation), `gate(exec)` ({ok, why}),
 *   `inRoom(exec)` (does the conversation run in Recon's throwaway folder), `onion` (lib/onion.js), `usenet` (lib/usenet.js), `sources` (lib/sources.js), `idOf(exec)` (the conversation's id).
 * @returns {object[]} the tool definitions.
 */
export function buildTools({ enabled, inRecon, inRoom, gate, onion, usenet, sources, idOf }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const guarded = (work) => async (args, exec) => {
    try {
      if (!enabled()) return { text: 'Recon is switched off in Settings → Recon.' };
      if (!inRecon(exec)) return { text: 'This tool works only in a conversation of the Recon tab. It was not run.' };
      if (!inRoom(exec)) return { text: 'This Recon conversation runs in a folder of the user\'s, so its tools are off: the model would be told that folder\'s path. Nothing was sent. Tell the user to start a new conversation with the New button in the Recon tab; it then runs in Recon\'s own empty folder.' };
      const allowed = gate(exec);
      if (!allowed.ok) return { text: allowed.why };
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
    recon_usenet_groups: ['Find Usenet text newsgroups by name. Binary groups are never listed.', { pattern: text(120, 'Part of a group name, for example "comp.security".') }, ['pattern']],
    recon_usenet_search: ['Search the headers (subject, author, date) of articles in one text newsgroup. Usenet has no full-text search.', { group: text(160, 'The newsgroup.'), subject: text(200, 'Words in the subject.'), author: text(120, 'Part of the author as shown.'), since: text(40, 'Earliest date, as YYYY-MM-DD.') }, ['group']],
    recon_usenet_read: ['Read the text of one Usenet article by its Message-ID. Articles that carry encoded files are refused. Long articles come in parts.', { group: text(160, 'The newsgroup.'), messageId: text(300, 'The article\'s Message-ID, with its angle brackets.'), part: { type: 'integer', minimum: 1, maximum: 40, description: 'Which part of a long article. Leave out for the first.' } }, ['group', 'messageId']],
    recon_cite: ['Give the full citation of something read in this conversation: source, author and date as shown, when it was retrieved, and the fingerprint of its text.', { source: text(600, 'The source\'s number (S3), its .onion address or its Message-ID.') }, ['source']],
  };
  const work = {
    recon_onion_search: (args, exec) => onion.search(idOf(exec), args.query),
    recon_onion_read: (args, exec) => onion.read(idOf(exec), args.address, args.part),
    recon_usenet_groups: (args, exec) => usenet.groups(idOf(exec), args.pattern),
    recon_usenet_search: (args, exec) => usenet.search(idOf(exec), args),
    recon_usenet_read: (args, exec) => usenet.read(idOf(exec), args),
    recon_cite: async (args, exec) => {
      const source = sources.find(idOf(exec), args.source);
      if (source) return sources.cite(source);
      const have = sources.list(idOf(exec));
      return have.length === 0 ? 'Nothing was read in this conversation yet, so there is nothing to cite.' : `That source was not read in this conversation. Read so far: ${have.map((one) => `S${one.n} ${one.url}`).join('; ').slice(0, 1500)}`;
    },
  };
  return TOOLS.map((name) => {
    const [description, properties, required] = defs[name];
    return { name, description, parameters: { type: 'object', properties, required, additionalProperties: false }, ...common, execute: guarded(work[name]) };
  });
}
