import { randomInt } from 'node:crypto';

export const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Card ids are rank + suit, e.g. "10D" (Karo 10), "2C" (Sinek 2), "JS". */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: rank + suit, rank, suit });
  return deck;
}

export function secureRng() {
  return () => randomInt(0, 2 ** 32) / 2 ** 32;
}

/** Fisher-Yates; returns a new array. */
export function shuffle(items, rng = secureRng()) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
