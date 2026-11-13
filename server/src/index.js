import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager, RoomError } from './rooms.js';

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN?.split(',') ?? ['http://localhost:5173'];

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve the built client in production.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN }, maxHttpBufferSize: 1e5 });

const manager = new RoomManager({
  onCharge(room, seat, level) {
    io.to(room.code).emit('pisti:charging', { seat, level });
  },
  onUpdate(room, events) {
    // Slam-mechanic events get their own named channels; the rest go out as game:events.
    const rest = [];
    for (const e of events) {
      if (e.type === 'primed') io.to(room.code).emit('pisti:primed', { seat: e.seat, timeoutMs: e.timeoutMs });
      else if (e.type === 'slam') io.to(room.code).emit('pisti:slam', e);
      else rest.push(e);
    }
    if (rest.length) io.to(room.code).emit('game:events', rest);
    for (const p of room.players) {
      if (p.socketId) io.to(p.socketId).emit('room:state', manager.viewFor(room, p));
    }
  },
});
setInterval(() => manager.sweepStale(), 60_000).unref();

io.on('connection', (socket) => {
  const session = () => socket.data.session; // { code, token }

  const bind = (room, player) => {
    socket.data.session = { code: room.code, token: player.token };
    socket.join(room.code);
    manager.attach(room, player, socket.id);
    return { code: room.code, token: player.token, seat: player.seat };
  };

  // Wrap a handler: run it, ack {ok, ...result} or {ok:false, error, code}.
  const on = (event, fn) =>
    socket.on(event, (payload, ack) => {
      try {
        const result = fn(payload && typeof payload === 'object' ? payload : {}) ?? {};
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (e) {
        if (!(e instanceof RoomError)) console.error(`[${event}]`, e);
        if (typeof ack === 'function')
          ack({ ok: false, code: e.code ?? 'ERROR', error: e instanceof RoomError ? e.message : 'Server error' });
      }
    });

  const need = () => {
    const s = session();
    if (!s) throw new RoomError('NOT_IN_ROOM', 'Join a room first');
    return s;
  };

  on('room:create', (p) => {
    const { room, player } = manager.createRoom({ name: p.name, maxPlayers: p.maxPlayers, targetScore: p.targetScore });
    return bind(room, player);
  });
  on('room:join', (p) => bind(...Object.values(manager.joinRoom({ code: p.code, name: p.name }))));
  on('room:rejoin', (p) => {
    const { room, player } = manager.joinRoom({ code: p.code, token: p.token });
    if (player.token !== p.token) throw new RoomError('BAD_TOKEN', 'Session expired');
    return bind(room, player);
  });
  on('room:leave', () => {
    const s = need();
    manager.leave(s.code, s.token);
    socket.leave(s.code);
    socket.data.session = null;
  });
  on('room:settings', (p) => {
    const s = need();
    manager.updateSettings(s.code, s.token, { targetScore: p.targetScore, maxPlayers: p.maxPlayers });
  });
  on('room:start', () => manager.start(need().code, need().token));
  on('game:play', (p) => manager.play(need().code, need().token, String(p.cardId)));
  on('pisti:charging', (p) => manager.charge(need().code, need().token, p.level));
  on('pisti:slam', (p) => manager.slam(need().code, need().token, p.chargeLevel));
  on('voice:join', (p) => manager.voiceJoin(need().code, need().token, String(p.sid)));
  on('voice:leave', () => manager.voiceLeave(need().code, need().token));
  on('voice:signal', (p) => {
    const s = need();
    if (!p.data || typeof p.data !== 'object' || JSON.stringify(p.data).length > 30000) throw new RoomError('BAD_SIGNAL', 'Bad signal');
    const t = manager.voiceTarget(s.code, s.token, p.to);
    io.to(t.socketId).emit('voice:signal', { from: t.from, fromSid: String(p.fromSid), toSid: String(p.toSid), data: p.data });
  });
  on('game:next', () => manager.nextRound(need().code, need().token));
  on('game:rematch', () => manager.rematch(need().code, need().token));

  socket.on('disconnect', () => manager.detach(socket.id));
});

server.listen(PORT, () => console.log(`Pişti server listening on :${PORT}`));
