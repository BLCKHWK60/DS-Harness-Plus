# Content and Bench: step 0, the plan checked against what is built

16 November 2026. The plan is "Content and Bench: combined plan" (the owner's file). Step 0 builds nothing: it compares each part with the add-ons as they are, and lists what needs the owner's decision. The owner's rule for this work: **additive and non-destructive only; ask first, with the reason, before anything that could change, damage or disable something already built.**

## How the two tabs are added without touching the others

| Point | What is built today | What Content and Bench do |
| --- | --- | --- |
| A new tab | Finance, Data, Research, Scout and Recon are each their own add-on that adds itself to the Modes list (`extraModes`) and takes itself out when switched off | Two new add-ons, `dsh-content` and `dsh-bench`, the same way. No other tab's add-on is changed |
| Room in the sidebar | Tabs added by add-ons always get a tab; the sidebar's tab limit counts only the built-in ones | Both appear beside the others; none is pushed out |
| Tab icon | The Cowork sidebar has one icon per known tab; an unknown one gets a dot | One line each in its icon list (additive) |
| Web, Depth, Lens, models chip | Every tab has them (Modes) | Both tabs get them as they are |
| Long run and the Run button | Every tab but an isolated one (Mission) | Both tabs get them as they are. In Bench a Long run is also how a live signal is watched for hours |
| Mission's permission modes | Restricted, Ask, Full Auto (Mission) | Bench's "How it asks" reuses them by name |
| Scratch threads | Each tab starts in a Scratch conversation with its own folder (Cowork sidebar) | Both start there, as the plan asks |

## Content

| Plan | What is built | Fit |
| --- | --- | --- |
| Bring in conversations from other tabs | `@` mentions another conversation; the app hands over a bounded, read-only copy (3 per message), marked as material | Works in Content as it is. Content adds a way to copy whole conversations into the subject folder as material (additive) |
| Read a folder: Markdown, text, PDF, Word, spreadsheets, JSON | The Data tab's readers and the PDF reader | Reused, not rebuilt |
| The subject folder | Nothing | New, inside Content |
| The research packet (claims, sources, contradictions, timeline, leads) | Deep research writes a report with numbered sources, grades, a map of connections; no claims table, contradictions table or timeline file | Content can build a packet from a report; a full packet from Research needs Research to write more (asked when that step comes) |
| "Continue in Content" on a Research report | Nothing | A new button on Research's report: touches Research's page (asked before building) |
| Recon's export door | Recon is sealed: nothing leaves | Changes a Recon rule (asked before building) |
| The Library (approved pieces, edits, voice) | The app has a different **Library**: Settings → Library searches your document folders | Name clash (question below) |
| A different model per step | Model Tiers' role models; Mission's helpers | Reused |
| The writer with no tools, the drift check | Nothing | New, inside Content |

## Bench

| Plan | What is built | Fit |
| --- | --- | --- |
| Find a USB device | macOS lists them (`system_profiler`); serial ports are files (`/dev/cu.*`) | New tools in Bench, read-only first |
| Bluetooth | macOS lists paired devices (`system_profiler`); talking to one needs a Bluetooth library and the app's Bluetooth permission | Identify first; more is a later step (asked then) |
| Network devices | `dns-sd` lists what announces itself | Only networks the owner marks as his |
| Flashing tools (esptool and others) | Not installed | The owner installs them; Bench never installs anything |
| Watching a live signal for hours | Long run (Mission) | A Bench tool that reads a serial port for a while, used inside a Long run |
| Writes (firmware) | Nothing | Behind the plan's four conditions; built after Identify and Read work on a spare board |

## The chat-box controls redesign (plan section S1 to S8)

The plan proposes five web levels (Off, Verified, Open web, Everything, Custom), an Ultra Code switch beside Effort, and saved model versions. Today every tab has Web on/off (Research and Scout: always on), Depth with Long run, the Lens, the models chip and Model Tiers. **The redesign would change every tab**, so it is not part of starting Content and Bench (question below).

## What was built first, and what waits for the owner

Built (new add-ons only, both off until switched on): `dsh-content` (step C1, plus bringing in other conversations) and `dsh-bench` (step B1 and the Identify part of B2). Both use today's chat-box controls, as the owner asked ("the same options as the other modes"). Outside the two add-ons only two icons were added to the lists in the Cowork sidebar and Settings. One thing found while building: Content refuses Recon's sealed room as a subject folder, by Recon's own naming rule, without changing Recon.

Each of these changes something already built, so each is asked, with the reason, when its step comes:

1. The chat-box redesign (S1 to S8): it would change every tab.
2. The name of Content's library: Settings → Library already exists.
3. Recon's export door (C8): it changes Recon's sealed rule.
4. Research writing a fuller packet, and a "Continue in Content" button on its reports (C2): they change the Research tab.
5. Bench reading a device by its serial port, and watching a live signal for hours (B3): opening a port restarts some boards.
6. Long runs in Bench: **decided 16 November (option 3)**. Checks stay on by default and run with the Mac's device ports closed; Settings → Bench switches them off; the chat box's "Bench rules" shows what is open and closed.

## The owner's answers for the remaining steps (16 November, evening)

| # | Question | Answer |
| --- | --- | --- |
| 1 | Chat box, Web levels (S1) | **Add the levels, keep the defaults.** Off, Verified, Open web, Everything, Custom on the Web button; each tab starts where it is today (On is Open web; Research and Recon stay at Everything). Ultra Code switch beside Effort |
| 2 | Recon export door (C8) | **Build it.** Only the owner starts an export; the app's code copies plain text; onion links never opened outside Recon; nothing into Memory |
| 3 | Research (C2) | **Both:** "Continue in Content" on Research reports, and the fuller packet (claims table, contradictions table, timeline) |
| 4 | Content's library name | **Voice Library** (Settings → Library stays the document search) |
| 5 | Bench firmware sources | **The owner may add sites on Settings → Bench**; the checksum is still read from the site |
| 6 | Battery floor for a write | **30% on battery** |
| 7 | Firmware download | **Bench downloads it** from the official page, after the owner's yes, checking the published checksum |
| 8 | Router and server sign-in (B6, B8) | **Both: an SSH key and a password in the Keychain**, the owner's choice per device |
| 9 | Phone unlock and flash (rest of B7) | **Build it, behind its own yes**, the typed phone name and a full backup |
| 10 | Bluetooth services (rest of B9) | **Add it:** a small helper; read only, standard services |
| 11 | Ultra Code and the work loop (S3 to S8) | **Off unless switched on** |
| 12 | Home server way in | **SSH** (Windows OpenSSH; Bench shows how to switch it on) |

### Follow-up answers (16 November, night)

| # | Question | Answer |
| --- | --- | --- |
| 13 | Bench as a destination of a Recon export | **Allow it** ("I don't want to add too many filters or blocks that might break future functionality or testing"); Bench then never counts export text as the owner's words |
| 14 | Ultra Code in Research and Recon | **Yes, both.** Their loops stay as today except when Ultra Code is on; then it widens them as everywhere else (Recon's helpers stay under its lock) |
| 15 | The team editor for the owner's own tiers | **Yes** |
| 16 | Model calls at once | **A setting, 4 by default** |
| 17 | A Research Long run with the work loop | **Yes, with Ultra Code** |
| 18 | Firmware download limit | **8 GB** |
| 19 | Windows Update and BITS on the server | **Allow changes with undo** (named by the owner, restore point first) |
