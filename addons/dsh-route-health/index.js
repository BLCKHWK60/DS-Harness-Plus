/**
 * Host half of Route health.
 *
 * Responsibilities:
 *  - probe each configured route and keep an up / slow / down state with a
 *    circuit breaker (a route is down after N consecutive failed probes);
 *  - when a route goes down, move live Sessions on it to their tier's next
 *    fallback route (through the `modelTiers` service) for the next step, and
 *    move them back once the route recovers, at a turn boundary;
 *  - refuse a step on a route known to be down with a clear error instead of
 *    letting it hang;
 *  - expose the state as the `routeHealth` service and the `/routes` command.
 *
 * Nothing is configured by default: `routes` is empty until the user adds
 * their own, so no address or route name is baked into this plugin.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'route-health';

/** Path of the read-only state route the browser badge reads. */
const STATE_PATH = '/dsh-route-health/state';

/** Per-route settings. */
const routeSchema = z.object({
  probeUrl: z.string().required(),
  label: z.string(),
  timeoutMs: z.number().min(100).max(60000).default(2500),
  slowMs: z.number().min(50).max(60000).default(1000),
  failureThreshold: z.number().min(1).max(20).default(2),
  reprobeSeconds: z.number().min(1).max(3600).default(20),
  intervalSeconds: z.number().min(5).max(3600).default(30),
});

export const Config = z.object({
  routes: z.dict(routeSchema).default({}),
  preemptiveFallback: z.boolean().default(true),
  autoReturn: z.boolean().default(true),
  onlyWhenTierUsesRoute: z.boolean().default(true),
  blockWhenDown: z.boolean().default(true),
  commandName: z.string().default('routes'),
});

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) return value.map(plain);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

/**
 * Read the configured routes.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, object>} route id to settings.
 */
function readRoutes(config) {
  const routes = plain(config.routes);
  return routes && typeof routes === 'object' ? routes : {};
}

/**
 * Human label for a route.
 * @param {string} route - route id.
 * @param {object | undefined} settings - route settings.
 * @returns {string} label.
 */
function labelOf(route, settings) {
  return settings?.label ? String(settings.label) : route;
}

export function apply(ctx, config) {
  /** Per-route health record. */
  const records = new Map();
  /** Route -> in-flight probe. */
  const inflight = new Map();
  /** Route -> scheduled timer. */
  const timers = new Map();
  /** Sessions this plugin moved off a route: sessionId -> { tierId, route }. */
  const switched = new Map();
  /** Work waiting for an Agent to become idle: sessionId -> function. */
  const pendingIdle = new Map();
  const listeners = { 'route/health-changed': new Set(), 'route/fallback': new Set() };
  let disposed = false;

  ctx.effect(() => () => {
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }, 'route-health timers');

  /**
   * Notify listeners of one event; a listener failure is logged, never thrown.
   * @param {string} event - event name.
   * @param {...unknown} args - event arguments.
   */
  function emit(event, ...args) {
    for (const handler of [...listeners[event]]) {
      try {
        handler(...args);
      } catch (error) {
        ctx.logger.warn(`route-health: ${event} listener failed: ${error?.message ?? error}`);
      }
    }
  }

  /**
   * @param {string} route - route id.
   * @returns {object} the mutable record for a route, created on first use.
   */
  function record(route) {
    let entry = records.get(route);
    if (!entry) {
      entry = { state: 'unknown', failures: 0, lastProbeAt: 0, lastOkAt: 0, latencyMs: null, error: null };
      records.set(route, entry);
    }
    return entry;
  }

  /**
   * Frozen snapshot of one route for consumers.
   * @param {string} route - route id.
   * @returns {object | null} snapshot, or null for an unconfigured route.
   */
  function snapshot(route) {
    const settings = readRoutes(config)[route];
    if (!settings) return null;
    const entry = record(route);
    return Object.freeze({
      route,
      label: labelOf(route, settings),
      state: entry.state,
      failures: entry.failures,
      latencyMs: entry.latencyMs,
      lastProbeAt: entry.lastProbeAt || null,
      lastOkAt: entry.lastOkAt || null,
      error: entry.error,
    });
  }

  /** @returns {Array<object>} live Agents. */
  function liveAgents() {
    return ctx.get('agents')?.list() ?? [];
  }

  /** @returns {object | undefined} the modelTiers service, when Tier is loaded. */
  function tiers() {
    return ctx.get('modelTiers');
  }

  /**
   * Whether a route is known to be down.
   * @param {string} route - route id.
   * @returns {boolean} true when configured and down.
   */
  function isDown(route) {
    return readRoutes(config)[route] !== undefined && record(route).state === 'down';
  }

  /**
   * Whether a route should be probed now: some live Agent is on it, or on a
   * tier that uses it as primary or fallback, or this plugin moved a Session
   * off it and wants to know when it recovers.
   * @param {string} route - route id.
   * @returns {boolean} true to probe.
   */
  function wanted(route) {
    if (plain(config.onlyWhenTierUsesRoute) === false) return true;
    for (const entry of switched.values()) if (entry.route === route) return true;
    const service = tiers();
    for (const agent of liveAgents()) {
      const current = agent.model?.current?.();
      if (current?.provider === route) return true;
      const tier = service?.resolveTier?.(agent.id);
      if (!tier) continue;
      if (tier.provider === route) return true;
      if (service.fallbackChain(tier.id).some((candidate) => candidate.provider === route)) return true;
    }
    return false;
  }

  /**
   * Probe one route once. Any HTTP answer below 500 counts as reachable, so
   * no credential is needed; a timeout, a refused connection or a 5xx fails.
   * @param {object} settings - route settings.
   * @returns {Promise<{ok: boolean, ms: number, error?: string}>} outcome.
   */
  async function probeRequest(settings) {
    const started = performance.now();
    try {
      const response = await fetch(settings.probeUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(settings.timeoutMs),
      });
      await response.body?.cancel?.();
      const ms = Math.round(performance.now() - started);
      if (response.status >= 500) return { ok: false, ms, error: `HTTP ${response.status}` };
      return { ok: true, ms };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      const text =
        error?.name === 'TimeoutError'
          ? `no answer within ${settings.timeoutMs} ms`
          : String(error?.cause?.code ?? error?.message ?? error);
      return { ok: false, ms, error: text };
    }
  }

  /**
   * Probe a route now (joins a probe already running) and update its state.
   * @param {string} route - route id.
   * @returns {Promise<object | null>} snapshot, or null for an unconfigured route.
   */
  function probeNow(route) {
    const settings = readRoutes(config)[route];
    if (!settings) return Promise.resolve(null);
    const running = inflight.get(route);
    if (running) return running;
    const promise = (async () => {
      const outcome = await probeRequest(settings);
      applyOutcome(route, settings, outcome);
      return snapshot(route);
    })().finally(() => inflight.delete(route));
    inflight.set(route, promise);
    return promise;
  }

  /**
   * Fold a probe outcome into the route's state and react to a change.
   * @param {string} route - route id.
   * @param {object} settings - route settings.
   * @param {{ok: boolean, ms: number, error?: string}} outcome - probe result.
   */
  function applyOutcome(route, settings, outcome) {
    // A probe that finishes after the plugin stopped must not move Sessions any more.
    if (disposed) return;
    const entry = record(route);
    const before = entry.state;
    entry.lastProbeAt = Date.now();
    entry.latencyMs = outcome.ms;
    if (outcome.ok) {
      entry.failures = 0;
      entry.error = null;
      entry.lastOkAt = entry.lastProbeAt;
      entry.state = outcome.ms >= settings.slowMs ? 'slow' : 'up';
    } else {
      entry.failures += 1;
      entry.error = outcome.error ?? 'unreachable';
      if (entry.failures >= settings.failureThreshold) entry.state = 'down';
    }
    if (entry.state === before) return;
    ctx.logger.info(`route-health: ${route} ${before} -> ${entry.state}`);
    emit('route/health-changed', route, before, entry.state, snapshot(route));
    void react(route, before, entry.state);
  }

  /**
   * Run `work` for an Agent now when idle, otherwise once it becomes idle, so
   * a route change never lands in the middle of a turn.
   * @param {object} agent - live Agent.
   * @param {() => Promise<void>} work - task.
   */
  function atTurnBoundary(agent, work) {
    if (agent.status === 'idle') {
      void work().catch(report);
    } else {
      pendingIdle.set(agent.id, work);
    }
  }

  /**
   * @param {unknown} error - failure to log.
   */
  function report(error) {
    ctx.logger.warn(`route-health: ${error?.message ?? error}`);
  }

  /**
   * Move one Agent off a down route to its tier's next usable fallback.
   * @param {object} agent - live Agent.
   * @param {string} route - the down route.
   * @returns {Promise<object | null>} the move, or null.
   */
  async function moveOff(agent, route) {
    const service = tiers();
    if (!service?.advanceFallback) return null;
    const moved = await service.advanceFallback(agent.id, {
      skip: (candidate) => isDown(candidate.provider),
    });
    if (!moved) return null;
    const prior = switched.get(agent.id);
    switched.set(agent.id, { tierId: moved.tierId, route: prior?.route ?? route, to: moved.to });
    ctx.logger.warn(
      `route-health: ${labelOf(route, readRoutes(config)[route])} is unreachable; ${agent.id} will use ${moved.to.provider}/${moved.to.model}`,
    );
    emit('route/fallback', agent.id, moved.from, moved.to, 'down');
    return moved;
  }

  /**
   * Act on a state change: leave a route that went down, return to one that
   * came back.
   * @param {string} route - route id.
   * @param {string} before - previous state.
   * @param {string} now - new state.
   */
  async function react(route, before, now) {
    try {
      if (now === 'down' && plain(config.preemptiveFallback) !== false) {
        for (const agent of liveAgents()) {
          if (agent.model?.current?.()?.provider !== route) continue;
          atTurnBoundary(agent, async () => {
            if (agent.model?.current?.()?.provider === route && isDown(route)) await moveOff(agent, route);
          });
        }
      }
      if (before === 'down' && now !== 'down' && plain(config.autoReturn) !== false) {
        for (const [sessionId, entry] of [...switched]) {
          if (entry.route !== route) continue;
          const agent = liveAgents().find((candidate) => candidate.id === sessionId);
          if (!agent) {
            switched.delete(sessionId);
            continue;
          }
          atTurnBoundary(agent, async () => {
            if (isDown(route)) return;
            // If the person picked another model since the fallback, leave their choice alone.
            const current = agent.model?.current?.();
            const latest = switched.get(sessionId) ?? entry;
            if (latest.to && current && (current.provider !== latest.to.provider || current.model !== latest.to.model)) {
              switched.delete(sessionId);
              return;
            }
            const moved = await tiers()?.restorePrimary?.(sessionId, latest.tierId);
            switched.delete(sessionId);
            if (moved) emit('route/fallback', sessionId, moved.from, moved.to, 'recovered');
          });
        }
      }
    } catch (error) {
      report(error);
    }
  }

  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return;
    const work = pendingIdle.get(agent.id);
    if (!work) return;
    pendingIdle.delete(agent.id);
    void work().catch(report);
  });

  /**
   * Delay until the next probe of a route.
   * @param {object} settings - route settings.
   * @param {object} entry - route record.
   * @returns {number} milliseconds.
   */
  function nextDelay(settings, entry) {
    if (entry.state === 'down') return settings.reprobeSeconds * 1000;
    if (entry.failures > 0) return Math.min(settings.intervalSeconds, 5) * 1000;
    return settings.intervalSeconds * 1000;
  }

  /**
   * Schedule the next probe of one route.
   * @param {string} route - route id.
   * @param {number} [delay] - override in milliseconds.
   */
  function schedule(route, delay) {
    if (disposed) return;
    clearTimeout(timers.get(route));
    const settings = readRoutes(config)[route];
    if (!settings) return;
    const timer = setTimeout(async () => {
      try {
        if (wanted(route)) await probeNow(route);
      } catch (error) {
        report(error);
      }
      schedule(route);
    }, delay ?? nextDelay(settings, record(route)));
    timer.unref?.();
    timers.set(route, timer);
  }

  /** Probe every wanted route soon, for example when an Agent appears. */
  function kick() {
    for (const route of Object.keys(readRoutes(config))) {
      if (wanted(route)) schedule(route, 0);
    }
  }
  for (const route of Object.keys(readRoutes(config))) schedule(route, 0);
  ctx.on('agent/created', () => kick());

  /**
   * Make sure a route's state is recent enough to act on, probing if not.
   * @param {string} route - route id.
   * @returns {Promise<void>}
   */
  async function ensureFresh(route) {
    const settings = readRoutes(config)[route];
    const entry = record(route);
    const maxAge = (entry.state === 'down' ? settings.reprobeSeconds : settings.intervalSeconds) * 1000;
    if (entry.lastProbeAt === 0 || Date.now() - entry.lastProbeAt > maxAge) await probeNow(route);
  }

  // Refuse a step on a route known to be down, with a clear error.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    const route = payload.modelSelection?.provider;
    const settings = route ? readRoutes(config)[route] : undefined;
    if (!settings || plain(config.blockWhenDown) === false) return decision;
    await ensureFresh(route);
    if (record(route).state !== 'down') return decision;
    const entry = record(route);
    const label = labelOf(route, settings);
    const since = entry.lastProbeAt ? new Date(entry.lastProbeAt).toISOString() : 'never';
    let moved = null;
    if (plain(config.preemptiveFallback) !== false) moved = await moveOff(payload.agent, route);
    throw new Error(
      moved
        ? `Cannot reach ${label} (${entry.error}). This session now uses ${moved.to.provider}/${moved.to.model}; send your message again.`
        : `Cannot reach ${label} (${entry.error}; last checked ${since}). No fallback route is available for this session.`,
    );
  });

  /** Read-mostly route health API for other plugins. */
  const routeHealth = {
    apiVersion: 1,
    /**
     * @param {string} route - route id.
     * @returns {object | null} snapshot of a configured route, or null.
     */
    state(route) {
      return snapshot(route);
    },
    /** @returns {object[]} snapshots of every configured route. */
    list() {
      return Object.keys(readRoutes(config)).map((route) => snapshot(route));
    },
    /**
     * @param {string} route - route id.
     * @returns {Promise<object | null>} fresh snapshot after a probe, or null.
     */
    probeNow(route) {
      return probeNow(route);
    },
    /**
     * @param {'route/health-changed' | 'route/fallback'} event - event name.
     * @param {Function} handler - listener.
     * @returns {() => void} disposer.
     */
    on(event, handler) {
      const set = listeners[event];
      if (!set) throw new Error(`route-health: unknown event "${event}"`);
      set.add(handler);
      return () => set.delete(handler);
    },
  };
  ctx.effect(() => ctx.provide('routeHealth', Object.freeze(routeHealth)), 'route-health service');

  // Read-only state route for the browser badge (client.js). Behind the connection
  // fence (Host/Origin check and the login cookie), GET only, no keys, no probe URLs.
  // `?probe=1` probes routes that are unknown or stale, at most once per 8 s each, so a
  // route no live Session uses (which the scheduler skips) still gets a real state.
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATE_PATH,
          handler: async (req, res) => {
            const rejection = inner.connection.requestRejection(req);
            if (rejection !== undefined) {
              res.statusCode = rejection;
              res.end();
              return;
            }
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET');
              res.end();
              return;
            }
            try {
              const wantsProbe = new URL(req.url ?? '/', 'http://placeholder').searchParams.get('probe') === '1';
              if (wantsProbe) {
                const now = Date.now();
                await Promise.all(
                  routeHealth
                    .list()
                    .filter((row) => row.state === 'unknown' || (row.lastProbeAt ?? 0) < now - 30_000)
                    .filter((row) => (row.lastProbeAt ?? 0) < now - 8_000)
                    .map((row) => probeNow(row.route)),
                );
              }
              res.statusCode = 200;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.setHeader('cache-control', 'no-store');
              res.end(JSON.stringify({ at: Date.now(), routes: routeHealth.list() }));
            } catch (error) {
              ctx.logger.warn(`route-health: state route failed: ${error?.message ?? error}`);
              res.statusCode = 500;
              res.end();
            }
          },
        }),
      'route-health: GET state route',
    );
  });

  // The command registry may mount after this plugin, so register once it exists.
  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show the health of the configured model routes',
            handler: async () => {
              const rows = routeHealth.list();
              if (rows.length === 0) {
                return { kind: 'success', text: 'No routes are configured for route health.' };
              }
              const lines = rows.map((row) => {
                const age = row.lastProbeAt
                  ? `${Math.round((Date.now() - row.lastProbeAt) / 1000)} s ago`
                  : 'not probed';
                const detail = row.error
                  ? `, ${row.error}`
                  : row.latencyMs !== null
                    ? `, ${row.latencyMs} ms`
                    : '';
                return `${row.label}: ${row.state}${detail} (${age})`;
              });
              return { kind: 'success', text: lines.join('\n') };
            },
          }),
        'route-health command',
      );
    });
  }

  ctx.on('agent/disposed', ({ agent }) => {
    switched.delete(agent.id);
    pendingIdle.delete(agent.id);
  });
}
