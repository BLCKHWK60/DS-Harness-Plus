/**
 * Stop reaches the helpers. The app's Stop button ends the turn of the conversation it is pressed
 * in; helpers that conversation started keep working. These two functions find the moment the
 * user pressed Stop and the helpers that belong to the conversation, so they can be stopped too.
 * Kept apart from the plugin so it can be tested without the app.
 */

/**
 * @param {object} event - a Session event.
 * @returns {boolean} whether it records a turn the user ended with Stop.
 */
export function stoppedByUser(event) {
  if (event?.type !== 'turn/end') return false;
  const reason = event.data?.reason;
  return reason?.kind === 'aborted' && reason.reason?.kind === 'user';
}

/**
 * The live helpers below a conversation: its own and those of its helpers.
 * @param {object[]} agents - every live Agent.
 * @param {string} id - the conversation's Session id.
 * @returns {object[]} the helpers that are at work.
 */
export function helpersBelow(agents, id) {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const headerOf = (agent) => agent?.header ?? agent?.session?.header;
  const below = (agent) => {
    const seen = new Set([agent.id]);
    let header = headerOf(agent);
    while (header?.parentSession && !seen.has(header.parentSession)) {
      if (header.parentSession === id) return true;
      seen.add(header.parentSession);
      header = headerOf(byId.get(header.parentSession));
    }
    return false;
  };
  return agents.filter((agent) => agent.id !== id && agent.status === 'running' && below(agent));
}

/**
 * A stopped helper tells its parent that it was stopped, and that note wakes the parent for a new
 * turn. After the user's Stop the parent should stay stopped.
 * @param {object[]} messages - what a turn is about to hand to the model.
 * @param {(id: string) => boolean} wasStopped - whether a helper was stopped by the user's Stop.
 * @returns {boolean} whether the turn holds nothing but such notes.
 */
export function onlyStopNotes(messages, wasStopped) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every((message) => {
    const source = message?.source ?? message?.message?.source;
    return source?.kind === 'subagent-settled' && source.stopReason === 'aborted' && wasStopped(source.senderSessionId);
  });
}
