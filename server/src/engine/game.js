import { createDeck, shuffle, secureRng } from './cards.js';
import { scoreRound } from './scoring.js';

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const HAND_SIZE = 4;
const clampUnit = (n) => Math.min(1, Math.max(0, Number(n) || 0));

/**
 * Authoritative Pişti engine. Pure logic, no I/O.
 * Seats are 0..n-1 in clockwise turn order. 4P teams: seats {0,2} vs {1,3}.
 * Phases: 'playing' -> 'roundOver' -> (startNextRound) 'playing' ... -> 'matchOver'
 */
export class PistiGame {
  constructor({ playerCount, targetScore = 101, rng = secureRng(), dealer = 0 }) {
    if (playerCount !== 2 && playerCount !== 4) throw new GameError('BAD_CONFIG', 'Pişti needs 2 or 4 players');
    if (!Number.isInteger(targetScore) || targetScore < 1) throw new GameError('BAD_CONFIG', 'Invalid target score');
    this.playerCount = playerCount;
    this.teamCount = 2;
    this.targetScore = targetScore;
    this.rng = rng;
    this.dealer = dealer;
    this.scores = [0, 0];
    this.roundNo = 0;
    this.winnerTeam = null;
    this.lastRound = null;
    this.#startRound();
  }

  teamOf(seat) {
    return seat % 2; // 2P: seat 0 vs seat 1. 4P: partners sit opposite.
  }

  // ---------- round lifecycle ----------

  #startRound() {
    this.roundNo += 1;
    this.deck = shuffle(createDeck(), this.rng);
    this.hands = Array.from({ length: this.playerCount }, () => []);
    this.captured = [[], []];
    this.pistiCounts = [
      { pisti: 0, jackPisti: 0 },
      { pisti: 0, jackPisti: 0 },
    ];
    this.lastCapturer = null;
    this.primed = null; // { seat, card, charge } while a pişti card waits for its slam
    // Face-down starting cards a team has seen by capturing them (private to that team).
    this.seen = [[], []];
    // 4 centre cards: first 3 face-down, 4th (top) face-up.
    this.pile = this.deck.splice(0, 4).map((card, i) => ({ card, faceDown: i < 3 }));
    this.#dealHands();
    this.turn = (this.dealer + 1) % this.playerCount;
    this.phase = 'playing';
  }

  #dealHands() {
    for (let s = 0; s < this.playerCount; s++) this.hands[s].push(...this.deck.splice(0, HAND_SIZE));
  }

  /** Begin the next round after 'roundOver'. */
  startNextRound() {
    if (this.phase !== 'roundOver') throw new GameError('BAD_PHASE', 'Round is not over');
    this.dealer = (this.dealer + 1) % this.playerCount;
    this.#startRound();
    return [{ type: 'roundStart', roundNo: this.roundNo }];
  }

  // ---------- play ----------

  /**
   * Returns a list of events describing what happened. Throws GameError on illegal moves.
   * With `prime: true`, a card that would score a pişti is not resolved yet: it is held
   * face-down ("primed") until slam() is called. Everything else resolves immediately.
   */
  playCard(seat, cardId, { prime = false } = {}) {
    if (this.phase !== 'playing') throw new GameError('BAD_PHASE', 'Game is not in play');
    if (this.primed) throw new GameError('PRIMED', 'Waiting for the pişti slam');
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.playerCount) throw new GameError('BAD_SEAT', 'Unknown seat');
    if (seat !== this.turn) throw new GameError('NOT_YOUR_TURN', 'It is not your turn');
    const idx = this.hands[seat].findIndex((c) => c.id === cardId);
    if (idx === -1) throw new GameError('NOT_IN_HAND', 'You do not hold that card');

    const [card] = this.hands[seat].splice(idx, 1);
    const top = this.pile[this.pile.length - 1];

    // Pişti: exactly one card on the table AND same rank. A Jack only makes a pişti
    // against a single Jack (rank equality covers that); a Jack on any other single
    // card is a plain capture.
    if (prime && this.pile.length === 1 && card.rank === top.card.rank) {
      this.primed = { seat, card, charge: 0 };
      return [{ type: 'primed', seat }]; // the card's identity stays private until the slam
    }
    const events = [{ type: 'play', seat, card }];
    this.#resolve(seat, card, events);
    return events;
  }

  /** Record the primed player's current charge (0..1), used if the slam times out. */
  setCharge(seat, level) {
    if (!this.primed || this.primed.seat !== seat) return false;
    this.primed.charge = clampUnit(level);
    return true;
  }

  /** Release the primed card onto the table with a charge level in [0, 1]. */
  slam(seat, chargeLevel = 0) {
    if (!this.primed) throw new GameError('NOT_PRIMED', 'Nothing to slam');
    if (this.primed.seat !== seat) throw new GameError('NOT_YOUR_TURN', 'It is not your slam');
    const { card } = this.primed;
    this.primed = null;
    const events = [];
    this.#resolve(seat, card, events);
    const cap = events.find((e) => e.type === 'capture');
    events.unshift({ type: 'slam', seat, card, chargeLevel: clampUnit(chargeLevel), pisti: cap.pisti, count: cap.count });
    return events;
  }

  #resolve(seat, card, events) {
    const top = this.pile[this.pile.length - 1];
    const captures = top && (card.rank === 'J' || card.rank === top.card.rank);

    if (captures) {
      const team = this.teamOf(seat);
      let pisti = null;
      if (this.pile.length === 1 && card.rank === top.card.rank) {
        pisti = card.rank === 'J' ? 'jackPisti' : 'pisti';
        this.pistiCounts[team][pisti] += 1;
      }
      this.seen[team].push(...this.pile.filter((p) => p.faceDown).map((p) => p.card));
      const taken = [...this.pile.map((p) => p.card), card];
      this.captured[team].push(...taken);
      this.pile = [];
      this.lastCapturer = seat;
      events.push({ type: 'capture', seat, count: taken.length, pisti, byJack: card.rank === 'J' });
    } else {
      this.pile.push({ card, faceDown: false });
    }

    this.#advance(events);
  }

  #advance(events) {
    if (this.hands.every((h) => h.length === 0)) {
      if (this.deck.length > 0) {
        this.#dealHands();
        events.push({ type: 'deal', count: HAND_SIZE, deckCount: this.deck.length });
      } else {
        this.#endRound(events);
        return;
      }
    }
    this.turn = (this.turn + 1) % this.playerCount;
  }

  #endRound(events) {
    // Leftover table cards go to the last player who captured (nobody, if no capture happened).
    if (this.pile.length > 0 && this.lastCapturer !== null) {
      this.captured[this.teamOf(this.lastCapturer)].push(...this.pile.map((p) => p.card));
      events.push({ type: 'sweep', seat: this.lastCapturer, count: this.pile.length });
      this.pile = [];
    }
    const breakdown = scoreRound(this.captured, this.pistiCounts);
    breakdown.forEach((b, t) => (this.scores[t] += b.total));
    this.lastRound = { roundNo: this.roundNo, breakdown, scores: [...this.scores] };

    const best = Math.max(...this.scores);
    const leaders = this.scores.flatMap((s, t) => (s === best ? [t] : []));
    if (best >= this.targetScore && leaders.length === 1) {
      this.phase = 'matchOver';
      this.winnerTeam = leaders[0];
      events.push({ type: 'matchEnd', winnerTeam: this.winnerTeam });
    } else {
      this.phase = 'roundOver'; // includes target reached but tied: play another round
      events.push({ type: 'roundEnd', roundNo: this.roundNo });
    }
  }

  // ---------- views ----------

  /** State visible to one seat: own hand only, face-down pile cards redacted. */
  viewFor(seat) {
    return {
      phase: this.phase,
      playerCount: this.playerCount,
      targetScore: this.targetScore,
      roundNo: this.roundNo,
      dealer: this.dealer,
      turn: this.turn,
      mySeat: seat,
      scores: [...this.scores],
      deckCount: this.deck.length,
      pile: this.pile.map((p) => (p.faceDown ? { faceDown: true } : { card: p.card })),
      hand: seat === null ? [] : this.hands[seat].map((c) => ({ ...c })),
      handCounts: this.hands.map((h) => h.length),
      seenFaceDown: seat === null ? [] : this.seen[this.teamOf(seat)].map((c) => ({ ...c })),
      capturedCounts: this.captured.map((c) => c.length),
      pisti: this.pistiCounts.map((p) => ({ ...p })),
      primed: this.primed ? { seat: this.primed.seat } : null,
      lastCapturer: this.lastCapturer,
      lastRound: this.lastRound,
      winnerTeam: this.winnerTeam,
    };
  }
}
