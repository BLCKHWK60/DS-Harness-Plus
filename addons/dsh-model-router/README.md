# Model router

Host plugin `@local/dsh-model-router` (dsh 0.2.2-rc.1). A small routing model picks, for each turn, one of **2 to 5 candidate models** for the user's request. **Nothing is configured by default**: with no candidates the plugin does nothing, and with 1 or more than 5 it fails at load.

## When the choice takes effect (important)

On rc.1 a plugin cannot change the model of the step that is about to run: the route is fixed before any plugin sees the step, and `agent.model.select()` applies to the next step. Selecting and then rejecting the first step was tried: the turn just ends with no answer and the message is not retried. So, as agreed:

> The routing model decides at the **first** step of a turn (adds up to `routingModel.timeoutMs`, default 4 s); the chosen model runs from the **second** step. A turn that needs only one step still runs on the current route.

The spec's statement that `agent/pre-step` is the only legal place to route is therefore true but incomplete: it is legal, and it is one step late.

## How a decision is made

1. Skip the turn when routing is off for the Session, or when the current route is not a candidate and the router already chose one earlier (someone else, for example you in the composer, changed the route: the router **stands down** and `/router on` resumes it). A route that moved because route health saw the chosen route go down is **not** treated as manual.
2. **Stickiness**: for `policy.stickyTurns` turns after a switch the current candidate stays and the routing model is not called.
3. Ask the routing model (`ctx.llm.stream`, temperature 0, small token cap) with the candidates' `strengths`, the last `prompt.includeLastN` requests and the current one; it answers JSON `{route, reason, confidence}`.
4. **Fail safe**: a timeout, an error, unparsable JSON, an unknown or unusable route, or `confidence < policy.minConfidence` keeps the current candidate (or `policy.defaultCandidate` when set).
5. **Health**: with the route-health plugin loaded and `respectHealth` on, candidates on a `down` route are not offered and cannot be chosen.
6. Apply: a Tier candidate goes through `modelTiers.setSessionTier` (route, effort, persisted like a composer choice); an explicit route uses `agent.model.select()` (with its optional `reasoningEffort`).

Every decision is kept in memory (last 20 per Session): `/router` prints the state and the last five (turn, from, to, reason); `/router off` leaves the model alone, `/router on` resumes. Service `modelRouter`: `status(sessionId)`, `setEnabled(sessionId, on)`, `onDecision(handler)`.

## Configuration

```yaml
- id: model-router
  config:
    candidates:                         # 2 to 5
      - { id: <ID>, tier: <TIER_ID>, strengths: '<WHAT IT IS GOOD AT>' }
      - { id: <ID>, provider: <ROUTE>, model: <MODEL_ID>, reasoningEffort: <EFFORT>, strengths: '...' }
    routingModel: { provider: <ROUTE>, model: <MODEL_ID>, timeoutMs: 4000, maxTokens: 200 }
    policy: { stickyTurns: 2, minConfidence: 0.6, defaultCandidate: '', respectHealth: true }
    prompt: { systemText: '', includeLastN: 3 }
    commandName: router
```

No route, model or address is preset. `localOnly` on a candidate is accepted but not enforced yet (Tier has no private-tier flag).

## Costs to know

Each routed turn adds one small model call and up to the timeout in latency at the first step. Every switch changes the model mid-conversation, which discards the inference server's KV cache for that session (hence the stickiness default). Candidates share one conversation history; dsh adds its model-switch notice.

## Verified (rc.1, scripted mock model, throwaway home)

A refactor request on the small route: step 1 on the small model, step 2 on the large one. A trivial request stays small; on a large default route it moves **down** to small. A 0.2-confidence answer keeps the current route. An unreachable routing model keeps the current route. One candidate fails at load with a clear message. The pure decision logic (stickiness, confidence, unusable route, default) has unit checks. Select-then-reject was probed and does not work.

## Not verified

Routing quality with a real small model (all answers were scripted; the spec's 8-of-10 scripted-prompt target needs real models); the median added latency; `stickyTurns` across several turns in one session and the stand-down rule (needs a long session; covered by unit checks only for stickiness); Tier candidates (`setSessionTier` path); the route-health interplay; the spec's `allowEscalation`, `localOnly` and benchmark replay.
