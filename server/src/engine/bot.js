/**
 * Computer player. Decides from exactly what a human at that seat could see: its own hand and
 * the table (face-down cards unknown), so bots cannot cheat.
 */

const points = (c) => (c.rank === 'A' ? 1 : 0) + (c.rank === 'J' ? 1 : 0) + (c.id === '2C' ? 2 : 0) + (c.id === '10D' ? 3 : 0);

/**
 * @param {{hand: Array, pile: Array<{card?: object, faceDown?: boolean}>}} view  seat view from PistiGame.viewFor
 * @returns the card object to play (always one from `hand`)
 */
export function chooseCard(view, rng = Math.random) {
  const { hand, pile } = view;
  const top = pile.length ? pile[pile.length - 1].card : null;
  const size = pile.length;
  const jacks = hand.filter((c) => c.rank === 'J');
  const matches = top ? hand.filter((c) => c.rank === top.rank && c.rank !== 'J') : [];
  // Face-down cards are unknown: assume each is worth a little.
  const pileValue = pile.reduce((s, p) => s + (p.card ? points(p.card) : 0.5), 0);

  // 1. Pişti / Vale pişti: a single card on the table that we can match.
  if (size === 1 && top) {
    if (top.rank === 'J' && jacks.length) return jacks[0];
    if (matches.length) return matches[0];
  }
  // 2. Any rank match that takes 2+ cards.
  if (matches.length && size >= 2) return matches[0];
  // 3. Spend a Jack only on a pile worth taking (never on one or two plain cards).
  if (jacks.length && (size >= 4 || pileValue >= 2)) return jacks[0];

  // 4. Otherwise discard the cheapest card, keeping Jacks and point cards back.
  const pool = hand.filter((c) => c.rank !== 'J');
  const candidates = pool.length ? pool : hand;
  const lowest = Math.min(...candidates.map(points));
  const cheapest = candidates.filter((c) => points(c) === lowest);
  return cheapest[Math.floor(rng() * cheapest.length)];
}
