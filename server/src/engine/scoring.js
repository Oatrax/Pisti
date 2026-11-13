export const PISTI_POINTS = 10;
export const JACK_PISTI_POINTS = 20;
export const MAJORITY_POINTS = 3;
export const MAJORITY_THRESHOLD = 27;

/**
 * Score one round (one full pass through the deck).
 * @param {Array<Array<{id,rank,suit}>>} captured  captured cards per team
 * @param {Array<{pisti:number, jackPisti:number}>} pisti  pişti counts per team
 */
export function scoreRound(captured, pisti) {
  return captured.map((cards, team) => {
    const aces = cards.filter((c) => c.rank === 'A').length;
    const jacks = cards.filter((c) => c.rank === 'J').length;
    const twoClubs = cards.some((c) => c.id === '2C') ? 2 : 0;
    const tenDiamonds = cards.some((c) => c.id === '10D') ? 3 : 0;
    // Majority: 27+ cards. A 26-26 tie (2 teams) scores nobody.
    const majority = cards.length >= MAJORITY_THRESHOLD ? MAJORITY_POINTS : 0;
    const pistiPoints = pisti[team].pisti * PISTI_POINTS + pisti[team].jackPisti * JACK_PISTI_POINTS;
    return {
      cards: cards.length,
      aces,
      jacks,
      twoClubs,
      tenDiamonds,
      majority,
      pistiCount: pisti[team].pisti,
      jackPistiCount: pisti[team].jackPisti,
      pisti: pistiPoints,
      total: aces + jacks + twoClubs + tenDiamonds + majority + pistiPoints,
    };
  });
}
