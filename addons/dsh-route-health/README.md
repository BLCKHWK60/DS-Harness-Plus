# Route health

Host plugin `@local/dsh-route-health` (dsh 0.2.2-rc.1). It checks that your model routes are reachable and, with the Tier plugin (`plugins/dsh-model-tiers`), moves a Session to its tier's fallback route when a route is down.

**Nothing is configured by default**: `routes` is empty and the plugin does nothing until you add your own (no address, route name or key is baked in).

## Configuration

```yaml
- id: route-health
  config:
    routes:
      <ROUTE_NAME>:            # the provider route id, as in llm-pi-ai `providers`
        probeUrl: <PROBE_URL>  # for example <BASE_URL>/models
        label: <LABEL>
        timeoutMs: 2500        # no answer within this = failed probe
        slowMs: 1000           # answered but slower than this = "slow"
        failureThreshold: 2    # consecutive failed probes before "down"
        reprobeSeconds: 20     # probe interval while down
        intervalSeconds: 30    # probe interval while up
    preemptiveFallback: true   # move Sessions off a down route
    autoReturn: true           # move them back when it recovers
    onlyWhenTierUsesRoute: true
    blockWhenDown: true        # refuse a step on a down route with a clear error
    commandName: routes        # the /routes command
```

Any HTTP answer below 500 counts as reachable, so no credential is needed. A refused connection, a timeout or a 5xx fails the probe.

## Behaviour

- **States:** `unknown`, `up`, `slow`, `down`. A route goes `down` after `failureThreshold` consecutive failed probes and is re-probed every `reprobeSeconds`.
- **Only used routes are probed** (`onlyWhenTierUsesRoute`): a route is probed when a live Session is on it, or on a tier that has it as primary or fallback, or when this plugin moved a Session off it.
- **Pre-emptive fallback:** when a route goes down, each live Session on it is moved to the next usable route of its tier's fallback chain (`modelTiers.advanceFallback`), at a turn boundary, so the next message already goes there. Routes known to be down are skipped.
- **Return:** when the route recovers, Sessions this plugin moved are moved back (`modelTiers.restorePrimary`), at a turn boundary, never mid-turn.
- **Guard:** before a step the plugin refreshes a stale state; if the route is down the step is refused with an error that names the route and the reason, instead of hanging. If a fallback exists, the Session is moved to it and the error tells the user to send the message again.
- **`/routes`** prints each route's state, latency or error, and the time of the last probe.
- **Service `routeHealth`:** `state(route)`, `list()`, `probeNow(route)`, `on('route/health-changed' | 'route/fallback', handler)`.

## Limits

- **UI badge (browser half, `client.js`):** a status dot in the composer, left of the Mode selector. It shows nothing until routes are configured. When every route is up it is a green dot; when one is slow or down the dot turns amber or red and names the route (for example "Closed port"); a click lists every route with its state, latency, last error and age. It reads the host half's read-only route `GET /dsh-route-health/state` (behind dsh's connection fence: login cookie plus Host/Origin check; 405 for any other method; no keys and no probe URLs in the answer) every 10 s while the tab is visible. The request carries `?probe=1`, which probes routes that are unknown or older than 30 s (at most once per 8 s per route), so a route no live Session uses still gets a real state instead of staying "not checked". A page reload after a client change needs the host restarted. A separate banner is not built: the red badge with the route name is the warning.
- Verified in a throwaway web profile (up, slow and closed-port routes; 401 without cookie; the badge, the pop-over and the colours read back from the page). **Not verified:** the desktop app itself (its Electron shell forwards the same authenticated requests, so it should work); the light theme; a route that recovers while the pop-over is open.
- Wake-on-LAN or keeping the host awake is host configuration, not plugin code.
- A route cannot be switched in the middle of a step on rc.1 (the route is fixed per step), so the step in flight when a route dies still ends with the provider error.
- Fallback to a cloud route cannot be forbidden for a private tier yet (spec 6.3 `localOnly`): Tier has no such flag.
