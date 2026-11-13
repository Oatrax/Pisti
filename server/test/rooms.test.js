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
