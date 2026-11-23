# Agent swarm

Host add-on `@local/dsh-agent-swarm` (dsh 0.2.2-rc.1). One tool, `run_swarm`, runs a **named swarm** of child agents and returns every member's output under its own heading, so the parent's final answer can credit each member. **Nothing is configured by default**: with no swarm the plugin does nothing; a bad definition (too few members, duplicate ids, unknown role, unknown swarm in `defaultSwarmByMode`) fails at load.

## Shapes (`strategy`)

| Strategy | What happens |
|---|---|
| `fanout` | every member works on the task at once |
| `pipeline` | members run in order; each sees a board of the earlier members' outputs (first 600 characters each) |
| `debate` | `rounds` rounds (2 to 5); from round 2 each member sees the others' last answers and revises |

A member is bound to a **role** (`plan`, `implement`, `review`, `fast`): its route is the Tier add-on's role route for the parent's tier (or the member's own `tier`), or an explicit `provider` + `model`. With no usable route it falls back to the parent's route. `instructions` is the member's persona or focus.

## Caps and budget

- **Concurrency**: at most `maxActive` children at once, never above the tier's sub-agent cap or 8 (the dsh default). The tool reports the highest number it actually had running.
- **Depth**: a swarm member cannot start a swarm (dsh's own depth limit is 1 as well).
- **Budget**: `budget.tokens` and `budget.usd` (0 = no cap). Token use is read live from each child's own usage; dollars use your `pricing` map (unlisted models cost 0). When a cap is reached the swarm is cancelled, members that have not answered are reported as such, and the result says why it stopped. Children already running when the cap is crossed finish their current request first, so spend can overshoot a little.
- **Time**: `maxMinutes` per swarm (20 by default). Inside a program (PTC) it is shortened to fit the program's time limit; see below.
- The tool is registered with Tier's sub-agent gate, so a tier with sub-agents disabled, or at its cap, refuses it.

## Inside a program (the PTC preset)

Under the app's PTC preset the model calls tools from inside a `run_code` program. The app stops a program when its time limit runs out: 2 minutes unless the program asks for more with `timeoutMs`, and 10 minutes (600000 ms) at most. That limit counts the time of every tool the program calls. Before, a swarm longer than that was cancelled with the program, and every answer was lost.

Now, when `run_swarm` is called from a program (its call id contains `:ptc:`, the same check Deep research uses), it shortens its own time to end before the program does:

- **How much time it has.** The add-on watches each program start (the `run_code` call, its `timeoutMs` and when it began), so it knows how much of that program's time is left. It keeps 20 seconds back for handing the result over and letting the program finish. If it did not see the program start, it plans against the longest a program may run, as Deep research does. The swarm's own `maxMinutes` still applies when it is shorter.
- **Nothing found is lost.** Members that finished keep their answers. A member still working when time runs out is stopped and gets up to 5 seconds to hand back what it had written; that unfinished answer is kept and marked "cut short". In a debate, a member stopped in a later round keeps its last full answer. A pipeline does not start the next member with less than 15 seconds left.
- **A plain note.** The result starts with: "Shortened to fit PTC", the program's limit, how long the swarm had, how many members answered in full, and how to get a full run: switch the thread to the **Standard** preset, or call `run_swarm` alone in a new program with a higher `timeoutMs` (600000 at most).
- **Too little time.** With less than 35 seconds of the program left, the swarm does not start, spends nothing, and says so with the same advice.
- A cancel stays a cancel, and a token or dollar budget stop stays a budget stop: neither gets the PTC note.
- The tool's description tells the model this too, so it can plan (call it alone, with `timeoutMs` 600000).

The **Swarm** page shows such a run as "shortened (PTC)", its members as "cut short" where they were, and one line saying why and what to do for a full run. A run that was given less time but finished in time says that in one line.

Outside a program nothing changes. Nothing is refused or blocked in any preset. The time helpers live in `lib/program-time.js`, with no app imports, so the other long helper tools (Model tiers' `delegate_role`, `review_lanes` and `run_pipeline`) can use the same code; they are not changed by this add-on.

## Route health

With the route-health add-on loaded, a member whose route is `down` is handled by `onRouteDown`: `rebind` (default) moves it to the first usable route of the tier's fallback chain and says so in the result; `skip` leaves that member out; `refuse` refuses the whole swarm. If no member can run the tool errors.

## Configuration

```yaml
- id: agent-swarm
  config:
    swarms:
      <NAME>:
        description: '<WHAT IT IS FOR>'
        strategy: fanout            # fanout | pipeline | debate
        rounds: 2                   # debate only
        maxActive: 3                # 1 to 8
        maxMinutes: 20
        budget: { tokens: 0, usd: 0 }
        members:
          - { id: <ID>, role: <plan|implement|review|fast>, instructions: '<FOCUS>' }
          - { id: <ID>, provider: <ROUTE>, model: <MODEL ID>, instructions: '...' }
    pricing: { '<ROUTE>/<MODEL ID>': { inputPerMTok: <USD>, outputPerMTok: <USD> } }
    defaultSwarmByMode: { <MODE ID>: <SWARM NAME> }   # adds a one-line hint to the system prompt in that mode
    onRouteDown: rebind
    toolName: run_swarm
```

## Settings page

Settings > **Swarm** has two cards. **Recent runs** lists the model's last 20 `run_swarm` calls (newest first); pick one to see each member's state (waiting, running, done, cut short, failed, skipped, not answered), route, round (debate), tokens and time, plus the run's tokens and dollars against its budget and why it stopped, if it did. It refreshes every 2 seconds while a run is going and every 10 seconds otherwise. **Configured swarms** lists your swarms with members, caps and budget. It is read-only: it cannot start, stop or change a swarm.

It reads one fenced, GET-only route of the host half, `GET /dsh-agent-swarm/state` (login cookie and Host/Origin check). Run records live in the host's memory (the last 20) and are **gone after a host restart**. The route carries no task text, no prompts and no member answers (a unit test searches the JSON for them); a failed member's error line is cut to 160 characters and is the provider's own message. With no swarm configured the tool is not registered, but the route still answers so the page can say so. Needs one app restart to load.

Host change: `execute()` now keeps a small record per run (member states, round, child ids for token sums). 13 unit tests (`node --test test/swarm.test.mjs`): fence and GET-only, no leaked text, live states under a concurrency cap of 1, token budget stop, dollar spend, a failing member, the `skip` policy, debate rounds, the 20-run cap, validation and cost. `test/ptc.test.mjs` (22 tests) covers a swarm called from a program: the time helpers, a 2-minute program with one finished and one unfinished member, a member stopped with nothing written, a pipeline that does not start its next member, a debate keeping its last full round (and adding an unfinished revision), too little time to start, an unseen program, a forgotten program, a cancel, the watch never breaking a call, and the page's PTC lines in English (Plus is English only).

Tested in a throwaway web profile with mock models whose replies are delayed 7 seconds, through the real `run_swarm` tool: the page was read while a fan-out ran (members went waiting, running, done with at most 2 at once), while a debate was in round 2, and after a 20-token budget stopped a run (36 of 20 tokens, as documented, with the third member "not answered"). Dark and light theme and a 420-pixel width were looked at. **Not tested:** real models, the desktop app, a swarm with a `rebind` or `refuse` route-down policy on the page (only the unit test covers `skip`), a failing child in a real run, and a host restart while a run is going.

## Not done

- **A shared task board** in the sense of members editing a common list: here the board is the earlier outputs passed to later members (pipeline and debate); fan-out members cannot see each other.
- **Using dsh's `workflow` tool or Agent Teams** (experimental): children are started directly, like Tier's `delegate_role`.
- **A card inside the thread** for the swarm: a plugin outside the dsh repository cannot add events to a thread, and the transcript is built from them. The live view is a Settings page instead (next section).
- Members share the parent's workspace; two members editing the same file can collide. The prompts ask for concise answers, not edits.

## Verified (rc.1, scripted mock model with delayed replies, throwaway home)

Fan-out with `maxActive` 3 and 2: the mock saw at most 3 and 2 requests in flight, and each role used its Tier route (plan on the small model, implement and review on the large one); pipeline members saw earlier outputs; debate ran two rounds; a 30-token budget stopped the swarm after the second member with the third reported as not answered (36 tokens counted); with the primary route reported down the members were re-bound to the fallback route and the result said so; `onRouteDown: refuse` refused the swarm; a tier with sub-agents disabled refused the tool. Unit checks cover validation, cost and the state route.

## Not verified

Real models and real parallel load; very large swarms (above 8 members the cap queues the rest); the `skip` policy; the `defaultSwarmByMode` hint; a swarm member calling the tool (guard only); behaviour when a child fails mid-run beyond the error line. The PTC shortening (unit tests with stand-ins only): not yet run in the app with a real model and a real program; whether a real child hands back its unfinished answer within 5 seconds of being stopped is taken from the app's code (a stopped child's result may be partial), not measured.
