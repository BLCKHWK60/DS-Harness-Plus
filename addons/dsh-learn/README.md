# Learning

A tutor that makes you do the thinking. It works the moment it is installed.

## Why it works this way

Research on learning with AI points one way. In a study of nearly 1,000 students, those with an ordinary chatbot did better in practice and worse on the exam without it; a tutor that only gave hints removed the harm. A carefully designed AI tutor that withheld answers and guided step by step beat a good class. And across 53 studies, trying a problem before being taught beat being taught first. So this add-on does not answer questions. It:

1. asks a question **before** it teaches anything;
2. responds to your attempt by saying what is right in it, not by giving the answer;
3. gives hints one small step at a time: a nudge, then a pointer, then the first step worked out;
4. gives the full answer last, when the level in force allows it;
5. asks you to explain it back in your own words;
6. brings each idea back days later.

Sources: Bastani et al., PNAS 2025; Kestin et al., Scientific Reports 2025; Sinha and Kapur, Review of Educational Research 2021.

## How to use it

- In any conversation type `/learn` and what you want to learn:
  - a topic: `/learn how compound interest works`
  - a file: `/learn chapter3.pdf` (uses the PDF reader, and gives pages)
  - code: `/learn the functions in parser.py`
- A study bar appears above the chat box. Press **Start**, or send any message. The tutor makes a plan of 5 to 9 small ideas and puts the first question.
- **Hint** asks for a small step. **Show answer** unlocks when the level allows it. **End** stops; what you finished is saved. The level can be changed at any time from the bar.
- `/learn review` goes through the ideas that are due. `/learn level strict` changes the level. `/learn end` stops. `/learn` alone says where you are.
- You can also just say "teach me …" or "quiz me": a skill tells the model to start a session.

## The three levels

| | Gentle | Firm (default) | Strict |
| --- | --- | --- | --- |
| A hint | whenever you ask | after one attempt | after one attempt, and after you say where you are stuck (each time) |
| The answer | whenever you ask | after three hints, or when you give up after trying | after three hints and one more attempt |
| Giving up | any time | after one attempt | not possible early |
| Explaining it back | optional | required | required |

The rules are kept by the add-on, not left to the model. The tutor reports each thing that happens with the `learn_mark` tool, and the tool refuses a hint or an answer that the level does not allow yet and says what to do instead. The buttons in the study bar follow the same rules. Before each of its turns the tutor is also told the stage and the rule.

## Reviews

Each idea you finish gets a review date: after 1 day, then 3, 7, 16 and 35 days.

- Solved alone: it moves one step further out.
- Solved with hints: it stays at the same step.
- Answer shown: it goes back to 1 day.

**Settings → Learning** shows what is due, how often you solved things without the answer, and every topic with how far out each idea has moved. Nothing reminds you; you look when you want to.

## What is kept

One small file under the app's data folder (`learn/topics.json`): topics, the ideas and their questions, the outcome of each try (alone, with hints, answer shown), the number of hints and the dates. **It does not hold anything you wrote.** A second file (`sessions.json`) holds the state of running sessions, so a session survives a restart of the app. A topic can be removed on the settings page.

## Limits

- **The model can still slip.** The tools and buttons enforce the rules, but a model writes its own text. A weak model may blurt out an answer before recording anything. Use a strong model as the tutor.
- **A tutor that teaches something wrong is worse than none.** Studying from your own PDF or notes is safer than from the model's memory; without a source the tutor is told to say so and to say when it is unsure.
- The tutor judges whether an attempt is right. The add-on records its judgement; it cannot check it.
- A question is fixed when the plan is made. In a review the same question comes back; the tutor may reword it.
- The research behind this is mostly about students over short periods. It supports the method; it does not promise a result.

## For developers

- `lib/rules.js`: the stages (ask, work, solved, shown, done), `can(state, event)`, `apply`, `guidance` (what the tutor is told), `stageLabel`. `lib/schedule.js`: the intervals and what is due. `lib/store.js`: the record. `index.js`: `createSessions` (plans, reviews, marks, the learner's choices), the tools, the system-prompt section `learn:session`, routes, the command.
- Tools: `learn_plan`, `learn_mark` (events `attempt`, `stuck`, `hint`, `solved`, `answer_shown`, `explained`, `next`), `learn_review`, `learn_status`, `learn_end`. Skill `study-tutor`.
- Service `learning` (apiVersion 1): `due()`, `stats()`.
- Routes: `GET /dsh-learn/status` (header `x-dsh-session`), `GET /dsh-learn/overview`, `POST /dsh-learn/action` (header `x-dsh-learn: 1`; actions `giveup`, `level`, `end`, `removeTopic`).
- Client: the study bar in `conversation.input.dock`. It sends the learner's button presses as chat messages: through the chat box's own `inputActions` (`setDraft`, then `submit`) when the app hands them over, otherwise by typing into the box and pressing Enter.

## Checked

- **Unit tests:** 9 (`test/`): each level's rules step by step; what the tutor is told at each stage; the review schedule; the record (and that a second opening sees it); a whole session with a refused early answer, giving up, a level change, outcomes and a review two days later; a session surviving a restart; settings and the skill.
- **Live, in the throwaway web profile with a test model server playing the tutor by hand:**
  - `/learn binary search` showed the study bar; **Start** sent the message; the model received the study request and the five tools.
  - After a plan, **Hint** and **Show answer** were locked with the reason shown; an early `answer_shown` was refused with "The learner has not tried yet"; after an attempt both unlocked.
  - **Show answer** recorded the giving up and sent the message; **End** removed the bar.
  - An idea solved alone appeared on the progress page as "solved alone · back tomorrow".
- **Not checked:** a real model tutoring (whether it follows the stages, how good its questions and hints are); a session from a real PDF; a review session in the app; the Mac desktop app.
