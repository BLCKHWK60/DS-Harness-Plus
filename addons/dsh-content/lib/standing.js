/**
 * How sure a claim is: the seven standings of the plan, the first standing the tab proposes, and how a
 * piece words each one. No claim is dropped for being unproven; it is worded as what it is.
 */

/** The seven standings, in the order the ledger shows them, with how a piece words each. */
export const STANDINGS = [
  { id: 'established', label: 'Established', when: 'A primary record shows it, or independent sources confirm it', wording: 'Stated plainly, with its source' },
  { id: 'reported', label: 'Reported', when: 'A named outlet, body or document says so', wording: '"According to X", always with the name' },
  { id: 'claimed', label: 'Claimed', when: 'A named person or group asserts it, and no independent support was found', wording: '"X says" or "X claims", with where and when' },
  { id: 'unsubstantiated', label: 'Unsubstantiated', when: 'It circulates with no identifiable origin, or no evidence was found', wording: 'Named as an unverified claim or a rumour, with where it appeared and since when' },
  { id: 'disputed', label: 'Disputed', when: 'Sources contradict each other', wording: 'Both sides, each attributed, and what would settle it' },
  { id: 'own-experience', label: 'Own experience', when: "The owner's first-hand account", wording: 'In the first person, as his experience, never as a general fact' },
  { id: 'own-view', label: 'Own view', when: "The owner's opinion, or his reading of the evidence", wording: 'Marked as his view, and kept apart from what the sources show' },
];
export const STANDING_IDS = STANDINGS.map((entry) => entry.id);
/** Standings that need the owner's yes, one by one, when a statement about a named living person rests on them. */
export const RISKY = ['claimed', 'unsubstantiated', 'disputed'];
/** What a source is, for the first standing: a primary record, a named outlet or body, a named person or group, or not known. */
export const SOURCE_KINDS = ['record', 'outlet', 'person', 'unknown'];
/** Grades a Research report gives its sources. */
export const GRADES = ['primary', 'confirmed', 'single', ''];

export const labelOf = (id) => STANDINGS.find((entry) => entry.id === id)?.label ?? id;
export const standingOf = (value) => {
  const id = String(value ?? '').toLowerCase().trim().replace(/[\s_]+/g, '-');
  return STANDING_IDS.includes(id) ? id : '';
};

/**
 * The standing the tab proposes for a claim, from its sources (the plan's rules). The owner confirms or
 * changes it; a proposal is never a ruling.
 * @param {{origin?: string, kind?: string, sources?: string[], disputed?: boolean}} claim - the claim.
 * @param {Map<string, {grade?: string, kind?: string}>} sources - the subject's sources by id.
 * @returns {string} a standing id.
 */
export function proposeStanding(claim, sources) {
  if (claim?.origin === 'owner') return claim.kind === 'view' ? 'own-view' : 'own-experience';
  if (claim?.disputed === true) return 'disputed';
  const own = (Array.isArray(claim?.sources) ? claim.sources : []).map((id) => sources.get(id)).filter(Boolean);
  if (own.length === 0) return 'unsubstantiated';
  if (own.some((source) => source.grade === 'primary' || source.grade === 'confirmed' || source.kind === 'record')) return 'established';
  // Two independent sources (different publishers) confirm it.
  const publishers = new Set(own.map((source) => String(source.publisher || source.host || source.id).toLowerCase()));
  if (publishers.size >= 2 && own.every((source) => source.kind !== 'person')) return 'established';
  if (own.some((source) => source.kind === 'outlet')) return 'reported';
  if (own.some((source) => source.kind === 'person')) return 'claimed';
  return 'reported';
}

/** The wording table, as the writer and the checker are given it. */
export const WORDING_TABLE = STANDINGS.map((entry) => `- ${entry.label}: ${entry.wording}.`).join('\n');
