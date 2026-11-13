# Activity indicator

A thin bar that shows what the model and its helpers are doing right now: reading the prompt, thinking, writing, running tools, searching the web, or working in the background. It works the moment it is installed; there is nothing to set up.

It can also play a sound when it needs you. It keeps no text of your conversations, writes no file and sends nothing anywhere. It only counts, times and names tools, in memory.

## What it shows

| Kind | Short code | What it means | Figures |
| --- | --- | --- | --- |
| Prompt processing | PP | the request was sent and no token has come back yet | seconds so far, size of the conversation, the last measured speed |
| Thinking | Thinking | reasoning tokens are arriving | tokens per second, seconds |
| Token generation | TG | the answer, or a tool call's arguments, is being written | tokens per second, tokens so far |
| Tool calls | Tool | a tool is running | the tool's name, seconds, how many |
| Web search | Web | a web search or fetch tool is running | name, seconds |
| Scripts and commands | Run | a shell command or script tool is running | name, seconds |
| Sub-agents | BG | helpers of the conversation on screen are working | how many, for how long |
| Other conversations | OC | another conversation is working | how many |
| Waiting for you | | the app waits for your approval; everything pulses in one colour | which tool, for how long |
| Errors and retries | | a turn failed or the model request is retried; everything pulses red | the reason |

Several things at once are joined with a dot: `TG 42 t/s · Tool read_file 2s · BG 2 · 1m 12s`. While the model thinks or writes, the text can also carry the last prompt speed (`PP 1,850 t/s`) and the size of the conversation (`ctx 12.4k`).

### How the figures are worked out

- **Thinking and writing speed** come from the app's live stream. The app reports text, not tokens, so the indicator counts characters and divides by the characters per token it measured on the last finished request of that conversation (4 until one has finished). The figure is an estimate that corrects itself.
- **Prompt processing speed** is the number of prompt tokens the server actually read (cached ones left out) divided by the time until the first token. It is known when the request finishes, so while a prompt is being read the text shows the seconds so far and the *last* speed.
- **Conversation size** is the token count the model server reported for the last request.

## Designs

Pick one in **Settings → Activity**. The bar always keeps its full length; the text has its own row and is cut short with "…" if it does not fit.

| Design | Where | What it is |
| --- | --- | --- |
| Pulse line | above the chat box | one line with flowing dots in the colour of what the model is doing |
| Lanes | lower window edge | one hairline per running thing |
| Threads | above the chat box | a rounded lane; each running thing is a thread, several weave into a braid |
| Ticker tape | lower window edge | history: now is at the left, older work drifts right |
| Rings | beside the model button | one small ring per kind of work; an active one spins, faster for faster work and larger for a larger conversation |
| Pulse line + Ticker tape | both | now above the chat box, history on the window edge |
| Threads + Rings | both | how much is going on in the lane, which kinds in the rings |

While a design uses the lower window edge, the app is made that many pixels shorter, so the strip never covers the app's own bottom line.

## Sounds

The indicator can play a short sound when the app starts waiting for your approval and when a turn fails. Retries make no sound.

- Nine sounds to choose from, one for waiting and one for errors: chime, beep, double beep, triple beep, bell, ping, low, alarm, siren. **Try** plays the chosen one.
- **Volume** goes from barely audible to loud.
- **Repeat while it still waits** plays the waiting sound again every 10 seconds to 5 minutes until you answer. The default is once.
- The sounds are made in the app itself; there are no sound files. They follow their own switch, not the "What to track" switches.
- A browser only allows sound after you have clicked or typed in the page once, so in the web version the very first alert after opening the page can be silent.

## Settings

Everything is on **Settings → Activity**, with a preview you can switch through sample states.

- **Look:** on or off, design, thickness, fit the message box, hide when nothing is running, no movement (colour only).
  - **Fit the message box** (`fit`, on by default) makes the line the top part of the message box: the same width, colour, rounded corners and shadow, with no space between them. All of that is read from the box itself, so it follows the window and the colour scheme. While it is joined, the box's own top corners are squared; they are put back when the line is hidden or Fit is off. Off lets the line span the whole chat area, as before 0.27.1.
  - **Arrow to fold the message box away** (`collapse`, on by default, since 0.34.0) puts a small arrow at the right end of the line. A click folds the message box down so only the line is left (and the app's row of figures under it); the arrow then points up, and another click brings the box back. The choice is one for the whole app and is kept in the browser's storage (`dsh-activity.folded`), so it holds across conversations, tabs and restarts. Folded, the box keeps its width but has no height, is hidden and is `inert`, so nothing in it can be clicked or reached with the keyboard; the line takes all four rounded corners. When the line itself is hidden (hide when nothing is running, or the indicator switched off) and the box is folded, a bare strip carries the arrow so the box can always come back. Tested in the test setup by measurement and screenshots; not in the Mac app, and not in a light colour scheme.
- **What to track:** a switch and a colour per kind of work. A kind that is switched off disappears from the bar, the rings, the tape and the text.
- **Sounds:** on or off, volume, the sound for waiting, the sound for errors, repeat.
- **Text:** show it or not, figures, words in place of short codes, last prompt speed, conversation size.
- **Ticker tape:** how much history (1, 2, 5 or 15 minutes), solid blocks or ticks, fading, a mark every 10 seconds.
- **Tool names:** which tools count as web search or as a script. A tool counts when its name contains one of your words; empty uses the built-in lists.

`/activity` in a chat says in words what is running.

## For developers

- Server (`index.js`): listens to `session/event` (`turn/start`, `turn/end`, `step/start`, `assistant/message`, `tool/call`, `tool/result`, `approval/asked`, `approval/decided`, `llm/retry-started`) and to `agent/assistant-stream` (frames `start`, `chunk`, `end`; chunks `reasoning-delta`, `text-delta`, `tool-call-delta`). `lib/tracker.js` holds the state; `lib/label.js` builds the text and the sample states.
- Route `GET /dsh-activity/status`; header `x-dsh-session` names the conversation on screen, `x-dsh-demo` asks for a sample state. The answer holds the state, the text and the display settings.
- Service `activity` (apiVersion 1): `snapshot(sessionId?)`, `settings()`.
- Client (`client.js`): slots `conversation.input.dock` (above the chat box), `conversation.input.right` (rings), `shell.overlay` (window edge), `settings.section`. It asks for the status every 0.35 s while something runs and every 0.7 s otherwise (3 s while the window is hidden).

## Checked

- **0.27.2, live in the web profile:** with Fit on, the line sat inside the top of the message box in the box's colour, with the box's corner radius on top, one pixel of overlap and no visible seam, at rest and while a task ran (wave and "Thinking 90.8 t/s"). Switching Fit off gave the box its own corners back and the full-width line; on again rejoined them. Not checked: a light colour scheme, the box while it has the cursor in a scheme that draws a focus ring. In the Mac desktop app the owner confirmed that it looks right.

- **0.27.1, live in the web profile at a 1,500-pixel window:** the line above the message box was 1,213 pixels wide over an 813-pixel box before; with Fit on it has the box's width and place (813 at the same left edge), also on the start page (781) and with the sidebar's Wide chat area on (1,149). Not checked: Fit switched off after the change, a running task at the new width, the Mac app.

- **Unit tests:** 7 (`test/`): a request from prompt to thinking to writing with rates and the prompt speed; tools sorted into tool, web and script; sub-agents and other conversations; waiting, errors and retries; nothing of the conversation's text is kept; the text in every form; settings and where a session sits in the tree.
- **Live, in the throwaway web profile with a slow test model server:**
  - Prompt processing, then thinking, then writing, with rates that matched what the test server sent (about 90 and 60 tokens a second) and a prompt speed of about 3,500 tokens a second for 9,000 tokens in 2.5 s.
  - A `bash` call showed as `Run bash` for its six seconds.
  - A sub-agent showed as `BG 1` on its parent conversation and left when it finished.
  - All seven designs in the settings preview; Pulse line, Ticker tape, Threads and Rings in the real window. The app's bottom line stayed visible above the tape.
  - The Sounds settings; **Try** produced sound output for both sounds (checked by counting the tones the page created, not by ear).
- **Not checked:** the waiting-for-you and error states with a real approval or failure (unit tests and preview only), so the sound was never triggered by a real approval; how the sounds actually sound through speakers; Lanes in the real window; web tools; two conversations at once; the Mac desktop app (the lab is the web version); a real local model.
