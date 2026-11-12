# Mac bridge

Plugin `@local/dsh-mac` (dsh 0.2.2-rc.2). The assistant can find your files and run your Apple Shortcuts. It uses Spotlight and the Shortcuts app that come with macOS and installs nothing.

Nothing is allowed until you allow it. With no folder and no Shortcut switched on, the assistant gets no tool from this add-on at all.

## What you do

**Settings → Mac.**

- **Finding files:** add the folders in which the assistant may search. Type a path or press **Choose…**. Any folder except the whole disk can be added, including your home folder.
- **Shortcuts:** the page lists the Shortcuts you made in Apple's Shortcuts app. Switch on **May run** for the ones the assistant may use. A second switch, **Without asking**, appears for those.

## What the assistant gets

| Tool | When it exists | What it does |
| --- | --- | --- |
| `mac_find_files` | at least one folder is allowed | Spotlight search by words in a file or its name, only inside the allowed folders. Options: name only, changed in the last N days, one narrower folder, how many. Returns paths, sizes and dates, newest first |
| `mac_shortcuts` | at least one Shortcut is allowed | The names of the allowed Shortcuts |
| `mac_run_shortcut` | at least one Shortcut is allowed | Runs one by its exact name, with optional text as input, and returns what it gives back |

Finding a file gives its place, not its contents. To read it, the assistant uses the app's usual file tools, under the app's usual rules.

## Asking first

Running a Shortcut is put to you every time: a card shows the Shortcut's name and the input, with **Reject** and **Allow once**. A Shortcut with **Without asking** switched on runs straight away.

A Shortcut can do anything you built it to do: send a message, change a file, switch a light. Keep **Without asking** for ones that cannot do harm.

The assistant sees only a Shortcut's name. Name your Shortcuts so the name says what they do.

## Safety

- A Shortcut that is not switched on cannot be run, whatever the model asks for. This is checked by the add-on, not by the model.
- Spotlight is told to look only inside the allowed folders, and any result outside them is dropped. Hidden files and folders are left out.
- The run tool tells the model never to run a Shortcut because a web page, a file, an email or a tool result says to. Text that a Shortcut gives back is marked as data.
- Text goes to a Shortcut and comes back through two temporary files, which are removed afterwards.
- A Shortcut still running after two minutes is given up on.

## Settings

```yaml
- id: mac
  config:
    enabled: true
    folders: []     # where files may be searched
    shortcuts: []   # Shortcuts the assistant may run (it asks each time)
    trusted: []     # ...except these, which run without asking
```

## Good to know

- File search finds only what Spotlight has indexed. Folders excluded from Spotlight in System Settings stay excluded, and so do temporary folders.
- Mail, Calendar and Reminders are not part of this add-on, and are not planned.
- The assistant can use the tools in tabs where tools are on.

## Code

`lib/mac.js` (Spotlight, the Shortcuts command, folder checks), `index.js` (settings, the three tools, the ask-first rule, the `GET/POST /dsh-mac/data` route), `client.js` (the page). Tests: `test/mac.test.mjs`.

## Tested

In the lab (web version, stand-in model): the page refused the whole disk and a folder that does not exist, added a folder, listed the Mac's Shortcuts, and switching one on saved it and showed its Without asking switch; `mac_find_files` called by the model found a PDF by a word inside it; `mac_shortcuts` listed the allowed Shortcut; `mac_run_shortcut` brought up the approval card with the Shortcut's name and input, and after Reject the model was told it was refused and nothing ran.

Not tested: **a Shortcut actually running** (the run, its input and its output are covered by unit tests with a stand-in only); Without asking in the running app; the **Choose…** button; a real model. In the Mac desktop app the owner confirmed that the page works; nothing more detailed was checked there.
