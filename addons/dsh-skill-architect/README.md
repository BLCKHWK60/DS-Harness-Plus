# Learned skills (Skill architect)

Learns from your past conversations where you corrected the assistant, and proposes what to change. **Nothing is installed until you say yes** on Settings → Learned skills. Built overnight on 16 November 2026 from the plan's Skill architect part, on the recommended answers.

## What it does

- **Reads** your past conversations (through the app's own index, without opening them) for signs that something went wrong: a correction you typed ("No, I said June"), a Stop, a thumbs down with a note, or feedback. A copy (Fork or Rerun) is read only after its copied part. Finished Mission runs with items that took several tries are read too.
- **Leaves out**: Recon conversations (marked isolated, open in Recon, or in Recon's room), helpers, Self-improve's own test runs, conversations in the trash, and conversations you marked **Never learn from this** (kept on each Mac). When the Modes add-on cannot say which conversations are Recon's, it reads nothing at all.
- **Proposes** with a reading model you pick. A model on this Mac or your own network needs no tick. A model on the internet needs your tick, and **Show what it would send** shows the exact text first; it refuses until you looked. Secrets, e-mail addresses and your home folder are removed before anything is sent.
- **Kinds of proposal**: a **skill** (a short instruction for one kind of task), a **fact** for Memory, a **rule** for the project the conversation was in, a **model habit** or a **tab lesson**. Each shows the excerpts it came from; the quotes go once you decide, or when that conversation is deleted for good.
- **Accepting** a skill adds it to this add-on's own library; a fact goes into Memory (its limits apply); a rule is appended to the project's instructions as a new version you can put back. A model habit or a tab lesson is shown for you to add yourself in Self-improve, as your own lesson on the right model version (filing it there by itself is not built yet).

## Learned skills

- Plain text in this add-on's folder (`<app data>/skill-architect`), served to the app's skill list by its own provider. They never go into any skill folder of yours, a project's, Plus's or the app's, and never take another skill's name (that is refused, with the reason).
- Each change is a version; **Put back** makes an earlier one current again, and Delete keeps the versions, so a deleted skill can come back.
- **Reach**: every tab (the default), one tab (offered only where the tab can be told), or one project's folder. Recon's room never gets one.
- **Start clean**: pick a project on the page and learned skills are not offered there. A learned skill named on a Model Tiers tier follows the same rule, because the tier reads skills through the same list.
- Each skill shows how often it was loaded.

## Commands

- `/skills learn`: read and propose now (the same as Learn now on the page).
- `/skills` or `/skills list`: the learned skills.

## Learn by itself

Off by default. Nightly or weekly: it only proposes, only while the app is open, and only with a reading model on this Mac or your own network. A run missed while the app was closed is shown on the page, not caught up.

## Not built yet

- The per-conversation choice in the chat box's Tools panel (All, This tab's, None) and the Long run row for learned skills (steps 72 and 75): the app does not yet tell a skill provider which conversation asks, in a way that is documented.
- The Start clean card on the project page (step 73; the switch is on this add-on's page instead).
- Filing model habits and tab lessons into Self-improve by itself (part of step 82), use counters for "a correction followed" and retirement proposals (83, 84), and Research reports as a source (86).
