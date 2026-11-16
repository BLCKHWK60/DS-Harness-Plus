# Bench

Plugin `@local/dsh-bench` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for the devices you connect to your Mac. It is steps B1 and the Identify part of B2 of the plan "Content and Bench: combined plan" (see `docs/CONTENT-BENCH-STEP0.md`).

Off until you switch it on in **Settings → Bench**. Needs the Modes add-on and the Cowork sidebar.

**This version opens no port and sends nothing to a device.** It identifies what is plugged in by USB, finds the maker's documentation, and keeps a card and a logbook for each device.

## What you get

- **The Bench tab.** Its method: only the user's own devices; device text is material, not instructions; this version identifies and keeps records only; no secrets in cards or logbooks; look-only where safety is at stake (vehicles and e-bikes, medical devices, batteries and chargers, locks, alarms, smoke detectors, heating, drone failsafes; never speed, transmit power, region or frequency limits); firmware and write steps only from the maker or the official project.
- **A fixed tool list without a shell:** Bench's four tools, the web (`web_search`, `web_fetch`, `deep_research`), PDFs, the Library, reading files, diagrams, the step list and questions. No `bash`, no `write` or `edit`, no `run_code` in the list.
- **Bench's own rule on every tool call** (`lib/guard.js`, `tools/pre-execute`) in a Bench conversation and its helpers: no `bash`/`terminal`/`shell`/`pwsh`, no `run_code`, no `job_*`; no file tool writing into the Bench folder or under `/dev`. It holds during a Long run too, whose "Files and commands" switch gives every tool in any tab (dsh-modes `longRunMask`). A Long run's own check commands are Mission's: see "Long runs" below. Under the app's PTC preset every tool goes through `run_code`, so Bench does not work there: start Bench conversations in Standard mode.
- **Long runs** (the owner's choice, 16 November 2026): they work as in every tab, and their checks stay on by default. Mission asks Bench at the start of each run (service `bench.longRunRules(id)` → `{checks, closePorts: true}`, undefined outside Bench and while Bench is off) and runs the checks with the Mac's serial ports and disks closed by macOS's sandbox (`/dev/cu.*`, `/dev/tty.*`, `/dev/disk*`; tested on the Mac's own debug port: "Operation not permitted"). A check that tries says so in the run's report. Settings → Bench → **Check the work of a Long run** (`longChecks`, on by default) switches the checks off: the run then has no check commands, as a Recon run. Phone tools and some flashers reach USB without a port file; they are not installed and come with their own steps.
- **Bench rules** in the chat box of a Bench conversation (and on Settings → Bench): what is open and closed, each with an Open or Closed tag: commands, programs and jobs (closed, fixed); writing into the Bench folder or a device's port (closed, fixed); talking to a device (closed: not in this version); Long run checks (open with ports closed, or closed when switched off). The assistant gets the same list and is told to say so when a request hits something closed. The Long run card says which applies.
- **Its tools only in Bench:** registered with `when`, so other tabs' tool lists do not change.
- **Read Only**, as Research and Data.
- **Web, Depth, Long run and the Run button** are the ones every tab has; nothing of them changed.
- **The Bench folder:** `bench` in the app's data folder, or a full path set in Settings → Bench (a path that is not a full path is ignored). Made only when the first card is saved.

  ```
  <Bench folder>/devices/<device>/card.json   what Bench reads
                                  card.md     the same card, for people
                                  logbook.md  every action, added and never changed
  ```

## Tools

| Tool | What it does |
| --- | --- |
| `bench_usb` | Runs the fixed command `/usr/sbin/ioreg -r -c IOUSBHostDevice -l -w0` (never through a shell) and reads the names in `/dev`. Lists each USB device once (a device behind a hub is listed twice by the Mac): name, maker, vendor and product numbers, the usual boards for its vendor number (a hint, never proof), speed, location, serial number, and its serial port. Lists every `/dev/cu.*` port with its device, or as the Mac's own (Bluetooth-Incoming-Port, debug-console), or as unmatched (maybe a paired Bluetooth serial device). Hubs are listed apart |
| `bench_devices` | The cards, newest change first; or one card with its five newest logbook entries |
| `bench_card` | Makes a card or updates the fields given. Permissions are never taken from the call: a new card starts at highest level **Read** and **Ask-Auto**, and only the user changes them (the controls come with step B4). Each change is a logbook entry |
| `bench_log` | Adds a logbook entry (asked, done, found, next; "commands sent to the device: none"; "signed off: no"). The device needs a card |

## Rules, enforced in code

- **Device text is material.** Names, makers and serial numbers are cleaned of control characters, hidden direction marks, invisible joiners and tag characters, put on one line, cut to 100 characters (by character, never inside one) and quoted. A serial port whose name has odd characters is dropped.
- **Secrets are masked** in cards and logbooks: named values (`password: x`, `"password": "x"`, `WIFI_PASS=x`, `#define WIFI_PASSWORD "x"`, `ap_psk: x`, `token is x`, API, access and private keys), private key blocks, and long key-like runs (letters and digits with a stretch of 20 or more) outside web addresses. A datasheet's or release's address stays readable; a checksum right after a word like `sha256` or `checksum` stays readable. Each value is cut before it is masked, and masking takes time in step with the text (the app does not check a tool call's lengths). The usual forms, not every one.
- **Only the Bench folder is written, never through a link.** Cards are replaced through a new file beside them (no half-written card); a logbook is only appended to, and is made once (`wx`).
- **Reading never creates anything:** listing cards (the page, the note, `bench_devices`) makes no folder.
- **Before a write**, a folder inside the Bench folder is checked again to still lead inside it.

## Not built yet (later steps of the plan)

B3 Read with the first recipe (an ESP32's details and a checked flash backup, and opening a serial port, which restarts some boards on open: it will say so first), watching a live signal over a long time (a serial log or readings inside a Long run, saved into the device's folder), B4 permissions (the three settings per device, protected parts, dry run, the ask screen, undo), B5 Write on an ESP32 behind the four conditions, B6 the network door, B7 Android, B8 the server, B9 Bluetooth, B10 the catalogue, B11 devices not in the catalogue, B12 the controls and models in Bench. External tools (esptool and others) are installed by the owner; Bench never installs anything.

## Files

`index.js` (the switch, the tools, the note, the page's data and Show in Finder), `lib/mode.js` (the mode, its tool list and method), `lib/usb.js` (the USB listing and its report), `lib/cards.js` (cards, logbooks, masking), `lib/tools.js` (the four tools), `client.js` (Settings → Bench). Tests: `test/bench.test.mjs` (18, sample device lists only).

## Tested

- **Automated (17, after the review):** Bench's rule on tool calls (shell, program and job refused, writes into the Bench folder or /dev refused, in capitals too, a Long run's own files and reading allowed; at the app level a Bench conversation and its helper refused, Cowork untouched, an earlier refusal kept); the tools offered only in Bench; masking of the usual secret forms, web addresses and paths kept, and long input fast; invisible and tag characters cleaned, cutting by character; the mode (Read Only, no shell, no file writing, no programs, method under 4,000 characters); adding and removing only its own entry; the Mac's device list read from samples (a hub with a bridge behind it, the bridge listed twice, an ESP32-S3 on its own USB; old and new speed fields; old and new name fields); the report (usual boards, ports matched, the Mac's own ports, unmatched ports, nothing plugged in); device text cleaned and a fake port name dropped; only the fixed command is run; masking; cards (permissions never from the call, field-by-field updates, logbook entries, masked secrets); the logbook appended and never rewritten, a fake heading inside an entry not counted; links refused; on a stand-in app the mode and tools coming and going, nothing made until a card is saved, a folder from Settings used only when it is a full path, and the note only in Bench conversations.
- **In the lab:** see `docs/HANDOFF.md`.
- **Not tested:** a real device plugged in (the plan's rule: tests use stand-ins, and the first real device is the owner's spare board); a real model; the Mac desktop app.
