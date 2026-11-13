import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, RoomError } from '../src/rooms.js';

const mgr = () => new RoomManager({ autoAdvanceMs: null });
const code = (e) => (err) => err instanceof RoomError && err.code === e;

test('room codes are 4 letters without I/O and unique', () => {
  const m = mgr();
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(m.createRoom({ name: 'A' }).room.code);
  assert.equal(codes.size, 200);
  for (const cd of codes) assert.match(cd, /^[A-HJ-NP-Z]{4}$/);
});

test('2P room: join, full, start, only host may start', () => {
  const m = mgr();
  const { room, player: host } = m.createRoom({ name: 'Ayşe', maxPlayers: 2 });
  assert.throws(() => m.start(room.code, host.token), code('NOT_FULL'));
  const { player: guest } = m.joinRoom({ code: room.code.toLowerCase(), name: 'Mehmet' });
  assert.throws(() => m.joinRoom({ code: room.code, name: 'Extra' }), code('ROOM_FULL'));
  assert.throws(() => m.start(room.code, guest.token), code('NOT_HOST'));
  m.start(room.code, host.token);
  assert.equal(room.status, 'playing');
  assert.throws(() => m.joinRoom({ code: room.code, name: 'Late' }), code('IN_PROGRESS'));
});

test('4P room needs four players; seats 0..3; duplicate names rejected', () => {
  const m = mgr();
  const { room, player: host } = m.createRoom({ name: 'A', maxPlayers: 4 });
  for (const n of ['B', 'C']) m.joinRoom({ code: room.code, name: n });
  assert.throws(() => m.joinRoom({ code: room.code, name: 'b' }), code('NAME_TAKEN'));
  assert.throws(() => m.start(room.code, host.token), code('NOT_FULL'));
  m.joinRoom({ code: room.code, name: 'D' });
  assert.deepEqual(room.players.map((p) => p.seat), [0, 1, 2, 3]);
  m.start(room.code, host.token);
  assert.equal(room.game.playerCount, 4);
});

test('rejoin by token keeps the seat; unknown room errors', () => {
  const m = mgr();
  const { room, player } = m.createRoom({ name: 'A' });
  m.joinRoom({ code: room.code, name: 'B' });
  m.start(room.code, player.token);
  const again = m.joinRoom({ code: room.code, token: player.token });
  assert.equal(again.player.seat, player.seat);
  assert.throws(() => m.joinRoom({ code: 'ZZZZ', name: 'x' }), code('NO_ROOM'));
});

test('views never leak tokens or opponents\' cards', () => {
  const m = mgr();
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  m.start(room.code, a.token);
  const view = m.viewFor(room, a);
  const json = JSON.stringify(view);
  assert.ok(!json.includes(a.token) && !json.includes(b.token));
  for (const card of room.game.hands[b.seat]) {
    if (!room.game.hands[a.seat].some((x) => x.id === card.id)) {
      assert.ok(!JSON.stringify(view.game).includes(`"id":"${card.id}"`));
    }
  }
});

test('play goes through the engine with turn validation', () => {
  const m = mgr();
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  m.start(room.code, a.token);
  const turnSeat = room.game.turn;
  const [mover, other] = turnSeat === a.seat ? [a, b] : [b, a];
  assert.throws(() => m.play(room.code, other.token, room.game.hands[other.seat][0].id), code('NOT_YOUR_TURN'));
  m.play(room.code, mover.token, room.game.hands[mover.seat][0].id);
  assert.equal(room.game.turn, other.seat);
});

test('leaving the lobby frees the seat and transfers host', () => {
  const m = mgr();
  const { room, player: a } = m.createRoom({ name: 'A', maxPlayers: 4 });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  m.leave(room.code, a.token);
  assert.equal(room.hostToken, b.token);
  const { player: c } = m.joinRoom({ code: room.code, name: 'C' });
  assert.equal(c.seat, 0);
  m.leave(room.code, b.token);
  m.leave(room.code, c.token);
  assert.equal(m.rooms.size, 0);
});

test('only host changes settings, only to valid values, only in lobby', () => {
  const m = mgr();
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  assert.throws(() => m.updateSettings(room.code, b.token, { targetScore: 151 }), code('NOT_HOST'));
  assert.throws(() => m.updateSettings(room.code, a.token, { targetScore: 99 }), code('BAD_SETTINGS'));
  m.updateSettings(room.code, a.token, { targetScore: 151 });
  assert.equal(room.targetScore, 151);
  m.start(room.code, a.token);
  assert.equal(room.game.targetScore, 151);
  assert.throws(() => m.updateSettings(room.code, a.token, { targetScore: 101 }), code('IN_PROGRESS'));
});

test('slam flow: charge relay, host-only slam, and 4s-style auto-slam fallback', async () => {
  const charges = [];
  const updates = [];
  const m = new RoomManager({ autoAdvanceMs: null, primeTimeoutMs: 30, onCharge: (_r, seat, lvl) => charges.push([seat, lvl]), onUpdate: (_r, ev) => updates.push(...ev) });
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  m.start(room.code, a.token);
  const g = room.game;
  const [mover, other] = g.turn === a.seat ? [a, b] : [b, a];
  // Rig a pişti for the player on turn.
  g.pile = [{ card: { id: '7H', rank: '7', suit: 'H' }, faceDown: false }];
  g.hands[mover.seat] = [{ id: '7C', rank: '7', suit: 'C' }, { id: '2H', rank: '2', suit: 'H' }];
  m.play(room.code, mover.token, '7C');
  assert.ok(updates.some((e) => e.type === 'primed' && e.timeoutMs === 30));
  m.charge(room.code, other.token, 0.9); // not the primed player: ignored
  assert.equal(charges.length, 0);
  m.charge(room.code, mover.token, 0.5);
  assert.deepEqual(charges, [[mover.seat, 0.5]]);
  assert.throws(() => m.slam(room.code, other.token, 1), code('NOT_YOUR_TURN'));
  await new Promise((r) => setTimeout(r, 80)); // auto-slam fires with last charge
  const slam = updates.find((e) => e.type === 'slam');
  assert.ok(slam && slam.auto && slam.chargeLevel === 0.5);
  assert.equal(room.game.primed, null);
  assert.equal(room.game.pile.length, 0);
});

test('reconnect: same seat and hand are restored after a drop', () => {
  const m = mgr();
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  a.socketId = 's1';
  b.socketId = 's2';
  m.start(room.code, a.token);
  const handBefore = JSON.stringify(m.viewFor(room, b).game.hand);
  m.detach('s2');
  assert.equal(m.viewFor(room, a).players[1].connected, false);
  const again = m.joinRoom({ code: room.code, token: b.token });
  m.attach(room, again.player, 's3');
  assert.equal(m.viewFor(room, b).mySeat, 1);
  assert.equal(JSON.stringify(m.viewFor(room, b).game.hand), handBefore);
  assert.equal(m.viewFor(room, a).players[1].connected, true);
});

test('a disconnected player on turn is auto-played after the grace period; reconnecting cancels it', async () => {
  const m = new RoomManager({ autoAdvanceMs: null, disconnectGraceMs: 40 });
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  a.socketId = 's1';
  b.socketId = 's2';
  m.start(room.code, a.token);
  const [away, here] = room.game.turn === a.seat ? [a, b] : [b, a];
  m.detach(away.socketId);
  const turnBefore = room.game.turn;
  await new Promise((r) => setTimeout(r, 90));
  assert.notEqual(room.game.turn, turnBefore); // server played for them
  assert.equal(room.game.hands[away.seat].length, 3);

  // Now it is `here`'s turn (connected): nothing happens. Make `away` return in time on their next turn.
  m.play(room.code, here.token, room.game.hands[here.seat][0].id);
  m.detach(away.socketId ?? 'x');
  away.socketId = null;
  m.attach(room, away, 's9');
  const handLen = room.game.hands[away.seat].length;
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(room.game.hands[away.seat].length, handLen); // reconnected: no auto-play
});

test('rematch can be started by anyone if the host is gone; round-end view carries the auto-advance timer', () => {
  const m = new RoomManager({ autoAdvanceMs: 5000 });
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  a.socketId = 's1';
  b.socketId = 's2';
  m.start(room.code, a.token);
  room.game.phase = 'roundOver';
  room.nextAt = Date.now() + 5000;
  const v = m.viewFor(room, a).game;
  assert.equal(v.nextRoundMs, 5000);
  assert.ok(v.nextRoundIn > 0 && v.nextRoundIn <= 5000);
  room.status = 'finished';
  assert.throws(() => m.rematch(room.code, b.token), code('NOT_HOST'));
  m.detach('s1');
  m.rematch(room.code, b.token); // host disconnected: allowed
  assert.equal(room.status, 'playing');
});
