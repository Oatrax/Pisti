import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

const PORT = 3999;

function client() {
  const s = io(`http://localhost:${PORT}`, { forceNew: true });
  s.view = null;
  s.on('room:state', (v) => (s.view = v));
  s.call = (ev, p) => new Promise((res) => s.emit(ev, p ?? {}, res));
  return s;
}
const until = async (fn, ms = 3000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

test('4 socket clients play a full match to completion', async (t) => {
  const srv = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => srv.kill());
  await once(srv.stdout, 'data');

  const cs = [client(), client(), client(), client()];
  t.after(() => cs.forEach((c) => c.close()));
  const created = await cs[0].call('room:create', { name: 'P0', maxPlayers: 4, targetScore: 101 });
  assert.ok(created.ok && /^[A-Z]{4}$/.test(created.code));
  for (let i = 1; i < 4; i++) assert.ok((await cs[i].call('room:join', { code: created.code, name: `P${i}` })).ok);
  assert.equal((await cs[1].call('room:start')).ok, false); // non-host
  assert.ok((await cs[0].call('room:start')).ok);
  await until(() => cs.every((c) => c.view?.status === 'playing'));

  let moves = 0;
  while (cs[0].view.status !== 'finished') {
    await until(() => cs.every((c) => c.view.game.turn === cs[0].view.game.turn));
    const g = cs[0].view.game;
    if (g.phase === 'roundOver') {
      assert.ok((await cs[0].call('game:next')).ok);
      await until(() => cs[0].view.game.phase === 'playing' || cs[0].view.status === 'finished');
      continue;
    }
    if (g.primed) {
      // A pişti is waiting for its slam: only the primed player may release it.
      const other = cs[(g.primed.seat + 1) % 4];
      assert.equal((await other.call('pisti:slam', { chargeLevel: 1 })).ok, false);
      assert.ok((await cs[g.primed.seat].call('pisti:slam', { chargeLevel: 0.6 })).ok);
      await until(() => !cs[0].view.game.primed);
      continue;
    }
    const actor = cs[g.turn];
    const wrong = cs[(g.turn + 1) % 4]; // out-of-turn plays must be rejected
    assert.equal((await wrong.call('game:play', { cardId: wrong.view.game.hand[0]?.id ?? 'XX' })).ok, false);
    const before = JSON.stringify([g.turn, g.roundNo, g.pile.length, g.handCounts]);
    const res = await actor.call('game:play', { cardId: actor.view.game.hand[0].id });
    assert.ok(res.ok, res.error);
    await until(() => JSON.stringify([cs[0].view.game.turn, cs[0].view.game.roundNo, cs[0].view.game.pile.length, cs[0].view.game.handCounts]) !== before || cs[0].view.status === 'finished');
    assert.ok(++moves < 3000);
  }
  assert.ok(cs[0].view.game.winnerTeam === 0 || cs[0].view.game.winnerTeam === 1);
  cs.forEach((c) => c.close());
});
