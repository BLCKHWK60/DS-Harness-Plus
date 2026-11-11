Paste everything below the line into the new session. Replace the list under "My changes" with your own.

---

You are continuing work on **DeepSeek Harness Plus**, in this folder (`deepseek-harness-plus/`).

**Start by reading `docs/HANDOFF.md`.** It is the full context: what the 23 add-ons are, my standing rules, facts about the app learned the hard way, how to test, and what is open. Do not read the whole codebase. Open only the add-ons and files that a task touches. Each add-on's `README.md` has its technical notes.

**Your job, in this order:**

1. **My changes (main focus).** Make these quality-of-life improvements and changes to how things work:
   - <CHANGE 1: what I see now, and how I expect it to work>
   - <CHANGE 2: …>
   - <CHANGE 3: …>

   If a change is unclear, or there are two reasonable ways to do it, ask me before building. For each one, say in one or two sentences how you plan to do it before you start.

2. **A pass through the app.** Run the throwaway lab described in `docs/HANDOFF.md` section 4, never my real app data. Use the app the way I would: the sidebar tabs, Settings pages, modes, tiers, colours, the commands and a few conversations. Then report:
   - **Bugs.** Fix the clear ones and list what you fixed.
   - **Small improvements** that would make it nicer to use. List them with a one-line reason each. Do not build these until I pick.
   - Anything that changes how a feature behaves goes in the list; do not just do it.

3. **Before you finish:**
   - Run `bash scripts/check.sh` and show me its result.
   - Update the affected add-on READMEs and `docs/HANDOFF.md`.
   - Tell me what you checked and what you could not check.
   - Do not commit or install into my real app until I say so.

**Rules (also in the handoff):**
- Never touch `~/.dsh` when testing. Every `dsh` call gets a throwaway `DSH_HOME`.
- No user-specific defaults.
- No secrets in files.
- Stop processes only by their exact PID.
- Check app APIs against the installed app, not the newer source in `deepseek-harness-master`.
- Explain things to me in plain words. I am not a programmer.
