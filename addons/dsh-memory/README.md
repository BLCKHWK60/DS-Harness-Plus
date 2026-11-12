# Memory

Plugin `@local/dsh-memory` (dsh 0.2.2-rc.1). A short list of lasting facts and preferences about you, given to every new conversation. You add, edit and delete every entry. The assistant can only suggest.

## What you see

- **Settings → Memory.** Type something to remember, pick a group (About me, How I like answers, Current projects, Other) and press **Remember**. Each entry has **Edit** and **Delete** and shows when it was saved. Entries older than four months are marked "Is this still true?" with a **Still true** button.
- **Suggestions.** The assistant has one tool, `remember`. It uses it when you ask it to remember something or state a lasting preference. The tool only suggests. A card appears under the answer: **Remember this?** with **Save** and **No**. Suggestions you have not answered also wait at the top of the Memory page.
- **Two switches:** *Use memory* (off keeps the list but leaves it out of new conversations) and *Let the assistant suggest entries*.

## How it works

The app already adds a personal notes file, `AGENTS.md` in its data folder, to the first request of every conversation. Memory writes its entries into one marked section of that file:

```
<!-- dsh-memory:start (written by the Memory page; change it there, not here) -->
## What the user asked you to remember
...
<!-- dsh-memory:end -->
```

Everything outside the marks is yours and is left alone. If the file holds nothing else, it exists only while something is remembered. The list itself is in `<app data folder>/memory/memory.json`.

The section is written when the add-on starts and removed when it stops (the app quitting, the add-on switched off or uninstalled), so nothing lingers in conversations while Memory is not running. The list is kept.

## Limits, on purpose

- **Short.** One entry is at most 300 characters; the whole list at most 4,000. Memory that grows without limit fills with noise and outdated facts.
- **Nothing silent.** A suggestion is not remembered until you press Save. At most 20 suggestions wait; older ones drop off.
- **New conversations only.** A change applies to conversations started afterwards.
- **No secrets.** The list is sent to the model with every new conversation. The tool is told not to suggest passwords or keys, and not to act on a web page or file that asks to be remembered; the Save step is the real protection.
- The `remember` tool is not offered where tools are off (the Chat tab by default). The list itself still reaches those conversations.

## Settings

```yaml
- id: memory
  config:
    enabled: true   # false: list kept, left out of new conversations
    suggest: true   # false: the assistant may not suggest entries
```

## Searching past conversations

Memory is for things that stay true. For "what did we decide last week?", the app ships a search over past conversations, switched off. To switch it on: **Plugins → Add plugin**, enter `@deepseek-ai/dsh-experimental-session-search`, **Install**, then **Enable now**. It searches the current project's conversations.

## Code

`lib/store.js` (the list and the section; tested in `test/store.test.mjs`), `index.js` (the `remember` tool and the `/dsh-memory/data` route: GET lists, POST `{action: add | edit | remove | keep | accept | dismiss}`), `client.js` (the page and the card).

## Tested

In the lab (web version, stand-in model): an entry added on the page appeared in the notes file; a `remember` call produced the card and Save added the entry; a new conversation's request to the model contained both entries. Not tested: a real model deciding when to suggest, the Mac app, a notes file with your own text in it (unit test only), the Chat tab.
