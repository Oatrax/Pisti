import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCard } from '../src/engine/bot.js';
import { PistiGame } from '../src/engine/game.js';
import { RoomManager, RoomError } from '../src/rooms.js';

const c = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
const view = (pile, hand) => ({ pile: pile.map((id) => (id ? { card: c(id) } : { faceDown: true })), hand: hand.map(c) });
const code = (e) => (err) => err instanceof RoomError && err.code === e;

test('bot takes a pişti, and a Vale pişti, when it can', () => {
  assert.equal(chooseCard(view(['7H'], ['3C', '7S', 'JD'])).id, '7S');
  assert.equal(chooseCard(view(['JH'], ['3C', '7S', 'JD'])).id, 'JD');
});

test('bot does not waste a jack on a single plain card, but uses it on a rich pile', () => {
  assert.notEqual(chooseCard(view(['7H'], ['3C', 'JD'])).id, 'JD');
  assert.equal(chooseCard(view([null, null, '7H', 'AS'], ['3C', 'JD'])).id, 'JD');
});

test('bot captures a multi-card pile on a rank match and otherwise discards cheap cards', () => {
  assert.equal(chooseCard(view(['9S', '4D'], ['4C', '2H'])).id, '4C');
  const pick = chooseCard(view(['9S'], ['AC', '10D', '2C', '5H']));
  assert.equal(pick.id, '5H');
  assert.equal(chooseCard(view([], ['JC'])).id, 'JC'); // only a jack left: must play it
});

test('fuzz: bots always pick a card from their hand and finish whole matches', () => {
  for (const players of [2, 4]) {
    for (let seed = 1; seed <= 10; seed++) {
      const g = new PistiGame({ playerCount: players, targetScore: 101 });
      let moves = 0;
      while (g.phase !== 'matchOver') {
        if (g.phase === 'roundOver') { g.startNextRound(); continue; }
        const v = g.viewFor(g.turn);
        const card = chooseCard(v);
        assert.ok(v.hand.some((x) => x.id === card.id));
        g.playCard(g.turn, card.id);
        assert.ok(++moves < 5000);
      }
    }
  }
});

test('lobby bots: host-only, fill seats, host stays human, bot-only room is closed', () => {
  const m = new RoomManager({ autoAdvanceMs: null });
  const { room, player: host } = m.createRoom({ name: 'H', maxPlayers: 4 });
  const { player: guest } = m.joinRoom({ code: room.code, name: 'G' });
  assert.throws(() => m.addBot(room.code, guest.token), code('NOT_HOST'));
  m.addBot(room.code, host.token);
  m.addBot(room.code, host.token);
  assert.throws(() => m.addBot(room.code, host.token), code('ROOM_FULL'));
  assert.throws(() => m.joinRoom({ code: room.code, name: 'X' }), code('ROOM_FULL'));
  const names = room.players.filter((p) => p.bot).map((p) => p.name);
  assert.equal(new Set(names).size, 2);
  assert.ok(m.viewFor(room, host).players.filter((p) => p.bot).every((p) => p.connected));
  m.removeBot(room.code, host.token, room.players.find((p) => p.bot).seat);
  assert.throws(() => m.removeBot(room.code, host.token, 0), code('NO_BOT'));
  m.leave(room.code, host.token); // host leaves: guest (human) becomes host, not a bot
  assert.equal(room.hostToken, guest.token);
  m.leave(room.code, guest.token); // only a bot left -> room closes
  assert.equal(m.rooms.size, 0);
});

test('1 human + 1 bot plays a full match to the end (bot moves and slams on its own)', async () => {
  const m = new RoomManager({ autoAdvanceMs: null, botDelayMs: 1, botSlamMs: 2, primeTimeoutMs: 500 });
  const { room, player: me } = m.createRoom({ name: 'Me', maxPlayers: 2 });
  me.socketId = 'sock';
  m.addBot(room.code, me.token);
  m.start(room.code, me.token);
  const t0 = Date.now();
  while (room.status !== 'finished') {
    assert.ok(Date.now() - t0 < 20000, 'match did not finish');
    const g = room.game;
    if (g.phase === 'roundOver') { m.nextRound(room.code, me.token); continue; }
    if (g.primed?.seat === me.seat) { m.slam(room.code, me.token, 0.5); continue; }
    if (g.turn === me.seat && !g.primed) { m.play(room.code, me.token, g.hands[me.seat][0].id); continue; }
    await new Promise((r) => setTimeout(r, 2));
  }
  assert.ok(Math.max(...room.game.scores) >= 101);
});

test('3 humans + 1 bot: humans play in turn and the bot takes its own turns', async () => {
  const m = new RoomManager({ autoAdvanceMs: null, botDelayMs: 1, botSlamMs: 2 });
  const { room, player: h } = m.createRoom({ name: 'H', maxPlayers: 4 });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  const { player: cc } = m.joinRoom({ code: room.code, name: 'C' });
  m.addBot(room.code, h.token);
  m.start(room.code, h.token);
  const bySeat = new Map([h, b, cc].map((p) => [p.seat, p]));
  const bot = room.players.find((p) => p.bot);
  const g = room.game;
  const start = g.hands[bot.seat].length;
  const t0 = Date.now();
  while (g.hands[bot.seat].length === start) {
    assert.ok(Date.now() - t0 < 5000, 'bot never played');
    const human = bySeat.get(g.turn);
    if (human && !g.primed) m.play(room.code, human.token, g.hands[g.turn][0].id);
    else if (human && g.primed) m.slam(room.code, human.token, 0.5);
    else await new Promise((r) => setTimeout(r, 2));
  }
  assert.ok(g.hands[bot.seat].length < start);
});
