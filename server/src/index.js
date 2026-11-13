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
const io = new Server(server, { cors: { origin: ORIGIN }, maxHttpBufferSize: 1e4 });

const manager = new RoomManager({
  onUpdate(room, events) {
    if (events.length) io.to(room.code).emit('game:events', events);
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
  on('game:next', () => manager.nextRound(need().code, need().token));
  on('game:rematch', () => manager.rematch(need().code, need().token));

  socket.on('disconnect', () => manager.detach(socket.id));
});

server.listen(PORT, () => console.log(`Pişti server listening on :${PORT}`));
