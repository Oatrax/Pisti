import test from 'node:test';
import assert from 'node:assert/strict';
import { PistiGame, GameError } from '../src/engine/game.js';
import { scoreRound } from '../src/engine/scoring.js';
import { createDeck, shuffle } from '../src/engine/cards.js';

const c = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });

function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Build a game then overwrite its state for a deterministic scenario. */
function rig({ players = 2, pile = [], hands, deck = [], turn = 0, lastCapturer = null }) {
  const g = new PistiGame({ playerCount: players, rng: seeded(7) });
  g.pile = pile.map((id) => ({ card: c(id), faceDown: false }));
  g.hands = Array.from({ length: players }, (_, i) => (hands[i] ?? []).map(c));
  g.deck = deck.map(c);
  g.turn = turn;
  g.lastCapturer = lastCapturer;
  g.captured = [[], []];
  return g;
}

test('deck has 52 unique cards and shuffle keeps them', () => {
  const d = createDeck();
  assert.equal(new Set(d.map((x) => x.id)).size, 52);
  assert.equal(shuffle(d, seeded(3)).length, 52);
});

test('setup: 4 centre cards (3 face-down, top face-up), 4 per player', () => {
  for (const n of [2, 4]) {
    const g = new PistiGame({ playerCount: n, rng: seeded(n) });
    assert.equal(g.pile.length, 4);
    assert.deepEqual(g.pile.map((p) => p.faceDown), [true, true, true, false]);
    assert.ok(g.hands.every((h) => h.length === 4));
    assert.equal(g.deck.length, 52 - 4 - 4 * n);
    assert.equal(g.turn, 1); // left of dealer 0
  }
});

test('view hides face-down cards and other hands', () => {
  const g = new PistiGame({ playerCount: 2, rng: seeded(2) });
  const v = g.viewFor(0);
  assert.equal(v.pile.filter((p) => p.faceDown).length, 3);
  assert.ok(v.pile.filter((p) => p.faceDown).every((p) => !p.card));
  assert.equal(v.hand.length, 4);
  assert.deepEqual(v.handCounts, [4, 4]);
  assert.equal(JSON.stringify(v).includes(g.hands[1][0].id + '"'), JSON.stringify(v.hand).includes(g.hands[1][0].id));
});

test('validation: turn, ownership, phase', () => {
  const g = rig({ pile: ['5H'], hands: [['3C'], ['4C']], turn: 0 });
  assert.throws(() => g.playCard(1, '4C'), (e) => e instanceof GameError && e.code === 'NOT_YOUR_TURN');
  assert.throws(() => g.playCard(0, '4C'), (e) => e.code === 'NOT_IN_HAND');
  assert.throws(() => g.playCard(0, 'ZZ'), (e) => e.code === 'NOT_IN_HAND');
  assert.throws(() => g.playCard(5, '3C'), (e) => e.code === 'BAD_SEAT');
  g.phase = 'roundOver';
  assert.throws(() => g.playCard(0, '3C'), (e) => e.code === 'BAD_PHASE');
});

test('non-matching card is placed on the pile', () => {
  const g = rig({ pile: ['5H', '9S'], hands: [['3C', '4C'], ['4D', '5D']] });
  g.playCard(0, '3C');
  assert.equal(g.pile.length, 3);
  assert.equal(g.turn, 1);
});

test('matching the top card captures the pile', () => {
  const g = rig({ pile: ['5H', '9S', '4D'], hands: [['4C', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, '4C');
  assert.equal(g.pile.length, 0);
  assert.equal(g.captured[0].length, 4);
  assert.equal(ev.find((e) => e.type === 'capture').pisti, null);
  assert.equal(g.lastCapturer, 0);
});

test('matching a buried (non-top) card does NOT capture', () => {
  const g = rig({ pile: ['5H', '9S'], hands: [['5C', '2H'], ['4S', '5D']] });
  g.playCard(0, '5C');
  assert.equal(g.pile.length, 3);
});

test('jack captures any pile', () => {
  const g = rig({ pile: ['5H', '9S', '4D'], hands: [['JC', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, 'JC');
  assert.equal(g.pile.length, 0);
  assert.equal(ev.find((e) => e.type === 'capture').byJack, true);
});

test('jack on an empty pile is just placed', () => {
  const g = rig({ pile: [], hands: [['JC', '2H'], ['4S', '5D']] });
  g.playCard(0, 'JC');
  assert.equal(g.pile.length, 1);
});

test('pişti: single card matched by rank = 10 pts, counted per team', () => {
  const g = rig({ pile: ['7H'], hands: [['7C', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, '7C');
  assert.equal(ev.find((e) => e.type === 'capture').pisti, 'pisti');
  assert.deepEqual(g.pistiCounts[0], { pisti: 1, jackPisti: 0 });
});

test('jack on a single non-jack is a plain capture, not pişti', () => {
  const g = rig({ pile: ['7H'], hands: [['JC', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, 'JC');
  assert.equal(ev.find((e) => e.type === 'capture').pisti, null);
  assert.deepEqual(g.pistiCounts[0], { pisti: 0, jackPisti: 0 });
});

test('jack on a single jack is a Jack Pişti (20)', () => {
  const g = rig({ pile: ['JH'], hands: [['JC', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, 'JC');
  assert.equal(ev.find((e) => e.type === 'capture').pisti, 'jackPisti');
  assert.deepEqual(g.pistiCounts[0], { pisti: 0, jackPisti: 1 });
});

test('two cards on table matched is not pişti', () => {
  const g = rig({ pile: ['9S', '7H'], hands: [['7C', '2H'], ['4S', '5D']] });
  g.playCard(0, '7C');
  assert.deepEqual(g.pistiCounts[0], { pisti: 0, jackPisti: 0 });
});

test('4P: partners share a team; turn order clockwise', () => {
  const g = rig({ players: 4, pile: ['7H', '9S'], hands: [['7C'], ['2C'], ['3C'], ['4C']] });
  g.playCard(0, '7C');
  assert.equal(g.turn, 1);
  assert.equal(g.teamOf(0), g.teamOf(2));
  assert.notEqual(g.teamOf(0), g.teamOf(1));
});

test('hands refill from the deck when everyone is empty', () => {
  const g = rig({ pile: ['5H'], hands: [['3C'], []], deck: ['2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D'], turn: 0 });
  const ev = g.playCard(0, '3C');
  assert.ok(ev.some((e) => e.type === 'deal'));
  assert.deepEqual(g.hands.map((h) => h.length), [4, 4]);
  assert.equal(g.deck.length, 0);
  assert.equal(g.turn, 1);
});

test('end of deck: leftover pile goes to last capturer and round is scored', () => {
  const g = rig({ pile: ['5H', '9S'], hands: [['3C'], []], deck: [], turn: 0, lastCapturer: 1 });
  const ev = g.playCard(0, '3C');
  assert.ok(ev.some((e) => e.type === 'sweep' && e.seat === 1 && e.count === 3));
  assert.equal(g.captured[1].length, 3);
  assert.equal(g.phase, 'roundOver');
  assert.ok(g.lastRound);
});

test('scoring: aces, jacks, 2C, 10D, majority, pişti', () => {
  const cards0 = Array.from({ length: 27 }, (_, i) => ({ id: `x${i}`, rank: 'X', suit: 'S' }));
  cards0.push(c('AS'), c('AH'), c('JD'), c('2C'), c('10D'));
  const res = scoreRound([cards0, [c('AD'), c('JS')]], [{ pisti: 2, jackPisti: 1 }, { pisti: 0, jackPisti: 0 }]);
  assert.equal(res[0].aces, 2);
  assert.equal(res[0].jacks, 1);
  assert.equal(res[0].majority, 3);
  assert.equal(res[0].pisti, 40);
  assert.equal(res[0].total, 2 + 1 + 2 + 3 + 3 + 40);
  assert.equal(res[1].total, 2);
  assert.equal(res[1].majority, 0);
});

test('scoring: 26-26 tie gives no majority', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `y${i}`, rank: 'Y', suit: 'S' }));
  const res = scoreRound([mk(26), mk(26)], [{ pisti: 0, jackPisti: 0 }, { pisti: 0, jackPisti: 0 }]);
  assert.equal(res[0].majority + res[1].majority, 0);
});

test('match ends at target with a unique leader; tie at target continues', () => {
  const g = rig({ pile: ['5H'], hands: [['5C'], []], deck: [], turn: 0 });
  g.targetScore = 10;
  g.scores = [0, 0];
  g.playCard(0, '5C'); // pişti = 10 -> team 0 reaches 10
  assert.equal(g.phase, 'matchOver');
  assert.equal(g.winnerTeam, 0);

  const t = rig({ pile: ['5H'], hands: [['5C'], []], deck: [], turn: 0 });
  t.targetScore = 10;
  t.scores = [0, 10];
  t.playCard(0, '5C');
  assert.equal(t.phase, 'roundOver'); // 10-10 tie at target
  const ev = t.startNextRound();
  assert.equal(ev[0].type, 'roundStart');
  assert.equal(t.phase, 'playing');
  assert.equal(t.dealer, 1);
  assert.deepEqual(t.scores, [10, 10]);
});

test('fuzz: full random matches conserve all 52 cards and terminate', () => {
  for (const players of [2, 4]) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = seeded(seed * 31 + players);
      const g = new PistiGame({ playerCount: players, targetScore: 101, rng });
      let moves = 0;
      while (g.phase !== 'matchOver') {
        if (g.phase === 'roundOver') {
          // Every dealt card is accounted for at round end.
          const total = g.captured.reduce((a, x) => a + x.length, 0) + g.pile.length;
          assert.equal(total, 52);
          g.startNextRound();
          continue;
        }
        const hand = g.hands[g.turn];
        assert.ok(hand.length > 0, 'player on turn must have cards');
        // never lose or duplicate cards mid-round
        const inPlay =
          g.deck.length + g.pile.length + g.hands.reduce((a, h) => a + h.length, 0) +
          g.captured.reduce((a, x) => a + x.length, 0);
        assert.equal(inPlay, 52);
        g.playCard(g.turn, hand[Math.floor(rng() * hand.length)].id);
        assert.ok(++moves < 5000, 'runaway game');
      }
      assert.ok(Math.max(...g.scores) >= 101);
    }
  }
});

test('capturing the starting pile reveals its face-down cards to that team only', () => {
  const g = new PistiGame({ playerCount: 2, rng: seeded(11) });
  const hidden = g.pile.filter((p) => p.faceDown).map((p) => p.card.id);
  assert.equal(hidden.length, 3);
  const top = g.pile[3].card;
  g.turn = 0;
  g.hands[0] = [c('J' + (top.suit === 'S' ? 'H' : 'S'))]; // a jack always captures
  g.hands[0].push(c('2H'));
  g.hands[0] = g.hands[0].filter((x) => x.id !== top.id);
  g.playCard(0, g.hands[0][0].id);
  assert.deepEqual(g.viewFor(0).seenFaceDown.map((x) => x.id), hidden);
  assert.deepEqual(g.viewFor(1).seenFaceDown, []);
});

test('slam: pişti card is primed face-down, then resolved by slam()', () => {
  const g = rig({ pile: ['7H'], hands: [['7C', '2H'], ['4S', '5D']] });
  const ev = g.playCard(0, '7C', { prime: true });
  assert.deepEqual(ev, [{ type: 'primed', seat: 0 }]);
  assert.equal(g.pile.length, 1); // nothing captured yet
  assert.equal(g.hands[0].length, 1); // card left the hand
  assert.equal(g.turn, 0);
  assert.deepEqual(g.viewFor(1).primed, { seat: 0 });
  assert.ok(!JSON.stringify(g.viewFor(1)).includes('7C'), 'primed card stays hidden');
  assert.throws(() => g.playCard(0, '2H'), (e) => e.code === 'PRIMED');
  assert.throws(() => g.slam(1, 1), (e) => e.code === 'NOT_YOUR_TURN');
  const out = g.slam(0, 2.5); // charge is clamped to [0,1]
  assert.equal(out[0].type, 'slam');
  assert.equal(out[0].chargeLevel, 1);
  assert.equal(out[0].pisti, 'pisti');
  assert.equal(g.pile.length, 0);
  assert.deepEqual(g.pistiCounts[0], { pisti: 1, jackPisti: 0 });
  assert.equal(g.turn, 1);
  assert.equal(g.primed, null);
  assert.throws(() => g.slam(0, 1), (e) => e.code === 'NOT_PRIMED');
});

test('slam: jack on a single jack primes; non-pişti captures resolve immediately', () => {
  const j = rig({ pile: ['JH'], hands: [['JC', '2H'], ['4S']] });
  j.playCard(0, 'JC', { prime: true });
  assert.equal(j.slam(0, 0.3)[0].pisti, 'jackPisti');
  const n = rig({ pile: ['7H'], hands: [['JC', '2H'], ['4S']] });
  assert.equal(n.playCard(0, 'JC', { prime: true })[1].type, 'capture');
  assert.equal(n.primed, null);
  const m = rig({ pile: ['9S', '7H'], hands: [['7C', '2H'], ['4S']] });
  assert.equal(m.playCard(0, '7C', { prime: true })[1].pisti, null);
});
