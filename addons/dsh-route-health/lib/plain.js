/**
 * A plain sentence for why a model server could not be reached. The raw text (a code such as ECONNREFUSED,
 * "HTTP 503", "no answer within 5000 ms") is kept as `details` for a Details line.
 * The browser half carries a copy of this function (client.js, `plainReason`); test/plain.test.mjs keeps the two in step.
 * @param {unknown} raw - what the probe reported.
 * @returns {{text: string, details: string}} the sentence and the raw text.
 */
export function plainReason(raw) {
  const details = String(raw ?? '').trim();
  const text = (sentence) => ({ text: sentence, details });
  if (!details) return text('It did not answer.');
  if (/^no answer within/i.test(details) || /timeout|timed out|ETIMEDOUT/i.test(details)) return text('It took too long to answer.');
  if (/ECONNREFUSED|connection refused/i.test(details)) return text('Nothing is listening there. The server may not be running.');
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(details)) return text('The address could not be found. Check the address and your internet connection.');
  if (/ECONNRESET|EPIPE|socket hang up|terminated/i.test(details)) return text('The connection was cut off. Try again in a moment.');
  if (/CERT|SSL|TLS/i.test(details)) return text('The secure connection could not be set up.');
  if (/fetch failed|network/i.test(details)) return text('Could not reach it. Check that it is running and that you are online.');
  const status = /^HTTP\s+(\d{3})$/i.exec(details)?.[1];
  if (status) return text(/^5/.test(status) ? 'The server had a problem on its side.' : 'The server did not accept the request.');
  return text('It did not answer as expected.');
}
