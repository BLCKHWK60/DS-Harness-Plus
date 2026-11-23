# Learned skills (Skill architect)

Learns from your past threads where you corrected the assistant, and proposes what to change. **Nothing is installed until you say yes** on Settings → Learned skills. Built overnight on 16 November 2026 from the plan's Skill architect part, on the recommended answers.

## What it does

- **Reads** your past threads (through the app's own index, without opening them) for signs that something went wrong: a correction you typed ("No, I said June"), a Stop, a thumbs down with a note, or feedback. A copy (Fork or Rerun) is read only after its copied part. Finished Mission runs with items that took several tries are read too.
- **Leaves out**: Recon threads (marked sealed, open in Recon, or in the Recon room), helpers, Self-improve's own test runs, threads in the trash, and threads you marked **Never learn from this** (kept on each Mac). When the Modes add-on cannot say which threads are Recon's, it reads nothing at all.
- **Proposes** with a reading model you pick. A model on this Mac or your own network needs no tick. A model on the internet needs your tick, and **Show what it would send** shows the exact text first; it refuses until you looked. Secrets, e-mail addresses and your home folder are removed before anything is sent.
- **Kinds of proposal**: a **skill** (a short instruction for one kind of task), a **fact** for Memory, a **rule** for the project the thread was in, a **model habit** or a **mode lesson**. Each shows the excerpts it came from; the quotes go once you decide, or when that thread is deleted for good.
- **Accepting** a skill adds it to this add-on's own library; a fact goes into Memory (its limits apply); a rule is appended to the project's instructions as a new version you can put back. A model habit or a mode lesson is shown for you to add yourself in Self-improve, as your own lesson on the right model version (filing it there by itself is not built yet).
- **Your own exam (Tuner Plus)**: only when the Tuner Plus add-on is on and has an exam of your work, accepting a skill first has the reading model take that exam without the skill and with it, in the background (Accept answers at once; the card says it is being tried and the page looks again every few seconds). The skill is added when it is not worse. A skill that does worse (by more than 2 points) is not added: the card shows the result and an **Add anyway** button, so the choice stays yours. Without Tuner Plus or its exam, or when the exam cannot be taken, accepting works as before.

## Learned skills

- Plain text in this add-on's folder (`<app data>/skill-architect`), served to the app's skill list by its own provider. They never go into any skill folder of yours, a project's, Plus's or the app's, and never take another skill's name (that is refused, with the reason).
- Each change is a version; **Put back** makes an earlier one current again, and Delete keeps the versions, so a deleted skill can come back.
- **Reach**: every mode (the default), one mode (offered only where the mode can be told), or one project's folder. Recon's room never gets one (any Recon room: the real one and a test copy's own `dsh-recon-*` room).
- **Names**: a learned skill never takes another skill's name. Since 17 November 2026 the app is also asked for the folders where a learned skill would be offered (your default folder and the folders of the threads it may read, never Recon's): a skill file there would win over a learned skill of the same name and hide it silently. The answer is kept for 30 seconds.
- **Start clean**: pick a project on the page and learned skills are not offered there. A learned skill named on a Model tiers tier follows the same rule, because the tier reads skills through the same list.
- Each skill shows how often it was loaded.

## Commands

- `/skills learn`: read and propose now (the same as Learn now on the page).
- `/skills` or `/skills list`: the learned skills.

## Learn by itself

Off by default. Nightly or weekly: it only proposes, only while the app is open, and only with a reading model on this Mac or your own network. A run missed while the app was closed is shown on the page, not caught up.

## Not built yet

- The per-thread choice in the chat box's Tools panel (All, This mode's, None) and the Mission row for learned skills (steps 72 and 75): the app does not yet tell a skill provider which thread asks, in a way that is documented.
- The Start clean card on the project page (step 73; the switch is on this add-on's page instead).
- Filing model habits and mode lessons into Self-improve by itself (part of step 82), use counters for "a correction followed" and retirement proposals (83, 84), and Research reports as a source (86).

## Learning the work loop (Content and Bench plan, step S8)

A Mission run with the work loop on is read with its recipe, its checks and what its checker sent back. Two more kinds of proposal: a **work loop recipe** (accepting saves it through Mission as a new version, the earlier one kept in `recipes/old/`) and a **model version setting** (shown for you to change on Settings → Model tiers). Each needs your yes, as every proposal does. A Devices run is never read (what a device says stays out of learning); Recon is left out as before.

**Recon exports:** a thread that received an export from Recon (Recon's `reconExports` service) is never read, and neither are its Mission runs; when Recon cannot answer, the thread is left out (fail closed), and while the export door is there a run line that does not name its thread (older lines) is left out too. A recipe proposal whose words would pick every goal (filler words, words under 3 letters) is dropped; the approval shows the file it replaces, its version, the words that pick it, the answer shape and each changed line.
Also with Recon switched off: a thread (copied messages included) or a Mission run whose text carries a Recon export's marker (`[Recon export …]`, `origin: Recon · lane:`; this add-on keeps its own copy of the markers, and uses Recon's detector when its service offers one) is never read. A detector that fails leaves the thread out.

## By space (Item 4A, stage 6a, 22 November 2026)

A sealed thread (any mode in the Recon space, or an owner's sealed mode) is offered no learned skill. With no Modes service the skills are shown as before.
