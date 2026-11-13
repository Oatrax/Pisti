import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { RoomManager, RoomError } from '../src/rooms.js';

const code = (e) => (err) => err instanceof RoomError && err.code === e;

function setup() {
  const m = new RoomManager({ autoAdvanceMs: null });
  const { room, player: a } = m.createRoom({ name: 'A' });
  const { player: b } = m.joinRoom({ code: room.code, name: 'B' });
  a.socketId = 's-a';
  b.socketId = 's-b';
  return { m, room, a, b };
}

test('voice roster tracks join/leave per seat and is visible in the room view', () => {
  const { m, room, a, b } = setup();
  m.voiceJoin(room.code, a.token, 'sid-aaaaaaaa');
  m.voiceJoin(room.code, b.token, 'sid-bbbbbbbb');
  assert.deepEqual(m.viewFor(room, a).voice, { 0: 'sid-aaaaaaaa', 1: 'sid-bbbbbbbb' });
  m.voiceLeave(room.code, a.token);
  assert.deepEqual(m.viewFor(room, b).voice, { 1: 'sid-bbbbbbbb' });
  assert.throws(() => m.voiceJoin(room.code, a.token, 'x'), code('BAD_SID'));
});

test('disconnect removes voice membership, but a stale socket cannot evict a refreshed tab', () => {
  const { m, room, a } = setup();
  m.voiceJoin(room.code, a.token, 'sid-aaaaaaaa');
  // refresh: new socket joins voice before the old socket's disconnect is processed
  a.socketId = 's-a2';
  m.voiceJoin(room.code, a.token, 'sid-new-aaaa');
  m.detach('s-a');
  assert.equal(m.viewFor(room, a).voice[0], 'sid-new-aaaa');
  m.detach('s-a2');
  assert.deepEqual(m.viewFor(room, a).voice, {});
});

test('leaving the room drops voice membership; signals only route between voice members', () => {
  const { m, room, a, b } = setup();
  assert.throws(() => m.voiceTarget(room.code, a.token, 1), code('NO_PEER'));
  m.voiceJoin(room.code, a.token, 'sid-aaaaaaaa');
  assert.throws(() => m.voiceTarget(room.code, a.token, 1), code('NO_PEER'));
  m.voiceJoin(room.code, b.token, 'sid-bbbbbbbb');
  assert.deepEqual(m.voiceTarget(room.code, a.token, 1), { from: 0, socketId: 's-b' });
  m.leave(room.code, b.token);
  assert.throws(() => m.voiceTarget(room.code, a.token, 1), code('NO_PEER'));
});

test('socket relay delivers signals only to the addressed peer in the same room', async (t) => {
  const PORT = 3998;
  const srv = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => srv.kill());
  await once(srv.stdout, 'data');
  const mk = () => {
    const s = io(`http://localhost:${PORT}`, { forceNew: true });
    s.got = [];
    s.on('voice:signal', (m) => s.got.push(m));
    s.call = (ev, p) => new Promise((res) => s.emit(ev, p ?? {}, res));
    return s;
  };
  const [a, b, outsider] = [mk(), mk(), mk()];
  t.after(() => [a, b, outsider].forEach((s) => s.close()));
  const { code: rc } = await a.call('room:create', { name: 'A', maxPlayers: 2 });
  await b.call('room:join', { code: rc, name: 'B' });
  await outsider.call('room:create', { name: 'O', maxPlayers: 2 });
  assert.ok((await a.call('voice:join', { sid: 'sid-aaaaaaaa' })).ok);
  assert.ok((await b.call('voice:join', { sid: 'sid-bbbbbbbb' })).ok);
  assert.ok((await a.call('voice:signal', { to: 1, fromSid: 'sid-aaaaaaaa', toSid: 'sid-bbbbbbbb', data: { sdp: { type: 'offer', sdp: 'x' } } })).ok);
  assert.equal((await outsider.call('voice:signal', { to: 1, fromSid: 'x', toSid: 'y', data: { a: 1 } })).ok, false);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(b.got.length, 1);
  assert.equal(b.got[0].from, 0);
  assert.equal(b.got[0].toSid, 'sid-bbbbbbbb');
  assert.equal(a.got.length, 0);
  assert.equal(outsider.got.length, 0);
});
