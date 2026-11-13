export const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const isRed = (suit) => suit === 'H' || suit === 'D';

/** Team of a seat: partners sit opposite (0&2 vs 1&3); in 2P each seat is a team. */
export const teamOf = (seat) => seat % 2;

export function teamLabel(team, players, n) {
  const names = players.filter((p) => p.seat % 2 === team).map((p) => p.name);
  return n === 2 ? names[0] ?? `Player ${team + 1}` : names.join(' & ');
}

/** Position of a seat relative to me: bottom, left, top, right (2P: bottom/top only). */
export function relPosition(seat, mySeat, n) {
  const rel = (seat - mySeat + n) % n;
  if (n === 2) return rel === 0 ? 'bottom' : 'top';
  return ['bottom', 'left', 'top', 'right'][rel];
}

/** Deterministic pseudo-random in [0,1) from a string, so pile cards keep their messy pose. */
export function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
