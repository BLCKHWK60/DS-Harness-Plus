/**
 * Whether the searchers of a run can search the web, asked before the run starts.
 * Kept apart from the plugin so it can be tested without the app.
 */

/**
 * Why a run cannot search, or '' when it can.
 * The app offers `web_search` to a helper only when the web search provider can sign in for the
 * helper's model route. Without this check a run plans, searches and reviews for minutes and only
 * then fails with "found no usable sources", or writes a report on pages nobody opened.
 * Asks the app's web service (`searchReady`), which makes no network calls. When the service or
 * the answer is missing, the run goes ahead: the old behaviour, never a false stop.
 * @param {{searchReady?: (provider?: string) => Promise<boolean>} | undefined} web - the app's web service.
 * @param {{provider: string, model?: string} | undefined} route - the route the searchers run on.
 * @param {{provider: string} | undefined} own - the route of the conversation that started the run.
 * @returns {Promise<string>} the reason to stop, or ''.
 */
export async function searchProblem(web, route, own) {
  if (typeof web?.searchReady !== 'function' || !route?.provider) return '';
  let ready;
  try {
    ready = await web.searchReady(route.provider);
  } catch {
    return '';
  }
  if (ready !== false) return '';
  const name = route.model ? `${route.provider} / ${route.model}` : route.provider;
  // Searchers on a role model of another provider: offer the conversation's own model, but only
  // when web search works there.
  let other = Boolean(own?.provider) && own.provider !== route.provider;
  if (other) {
    try {
      other = (await web.searchReady(own.provider)) !== false;
    } catch {
      other = false;
    }
  }
  return (
    `deep_research did not start: web search is not set up for the model the searchers run on (${name}), so they could not search. ` +
    'Add an API key for the web search provider (the Plugins page in the sidebar → "Web search and fetch")' +
    (other ? ', or let this conversation\'s helpers use its own model: "One model for everything" on the models chip in the chat box. (Settings → Research → "This conversation\'s model" does the same for conversations that have not chosen.)' : '.')
  );
}
