/**
 * Item 4A, stage 6a: what the Modes add-on says about a thread's space (STAGE6A-DESIGN.md 2.6).
 *
 * The same small reader is copied into every add-on that needs it (never imported across add-ons).
 * - No Modes service: not sealed, no space (as before; a missing Modes add-on means "no").
 * - A Modes service with `guardOf` (apiVersion 2): its answer.
 * - An older Modes service: worked out from `get`, `isolated` and `spaces.of`.
 * - The service is there and throws: fail closed (sealed, unknown guard).
 *
 * Refusals test `sealed`; permissions test `reconSpace`.
 */

const GUARDED_FALLBACK = ['devices', 'recon', 'workshop'];

export const NO_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false, legacy: true, absent: true });
export const ERROR_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: true, sealedBy: '', reconSpace: false, guardedBy: 'unknown', noPrograms: true, homeMode: false, fresh: false, unknownTop: true, legacy: true });

/**
 * @param {() => any} getModes - returns the Modes service (may throw or return undefined).
 * @returns {(id: string) => Readonly<object>} guardOf.
 */
export function makeGuardOf(getModes) {
  return (id) => {
    let m;
    try {
      m = getModes();
    } catch {
      return NO_GUARD;
    }
    if (!m) return NO_GUARD;
    try {
      if (typeof m.guardOf === 'function') return m.guardOf(String(id ?? '')) ?? ERROR_GUARD;
      const mode = String(m.get?.(id) ?? '');
      const sealed = m.isolated?.(id) === true;
      const space = String(m.spaces?.of?.(id) ?? '');
      const reconSpace = space === 'recon' || (mode === 'recon' && sealed);
      return {
        top: String(id ?? ''), space, mode, sealed, sealedBy: reconSpace ? 'recon' : sealed ? 'mode' : '', reconSpace,
        guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: sealed || GUARDED_FALLBACK.includes(space),
        homeMode: ['recon', 'bench', 'creator-plus'].includes(mode), fresh: false, unknownTop: false, legacy: true,
      };
    } catch {
      return ERROR_GUARD;
    }
  };
}
