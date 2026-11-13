import { randomBytes, randomInt } from 'node:crypto';
import { PistiGame, GameError } from './engine/game.js';
import { chooseCard } from './engine/bot.js';

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O (look like 1 / 0)
const TARGETS = [101, 151];
const STALE_MS = 10 * 60 * 1000;
const BOT_NAMES = ['Kemal', 'Zeynep', 'Can', 'Elif', 'Deniz', 'Ayşe', 'Mehmet', 'Selin'];

function cleanName(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!n) throw new RoomError('BAD_NAME', 'Please enter a name');
  return n;
}

export class RoomManager {
  /**
   * @param {{onUpdate?: (room, events:Array)=>void, autoAdvanceMs?: number|null}} opts
   *   autoAdvanceMs: delay before the next round starts by itself after a round ends (null = manual only)
   */
  constructor({ onUpdate = () => {}, onCharge = () => {}, autoAdvanceMs = 9000, primeTimeoutMs = 4000, disconnectGraceMs = 30000, botDelayMs = 1500, botSlamMs = 1000 } = {}) {
    this.rooms = new Map();
    this.onUpdate = onUpdate;
    this.onCharge = onCharge;
    this.primeTimeoutMs = primeTimeoutMs;
    this.disconnectGraceMs = disconnectGraceMs;
    this.botDelayMs = botDelayMs;
    this.botSlamMs = botSlamMs;
    this.autoAdvanceMs = autoAdvanceMs;
  }

  // ---------- helpers ----------

  #newCode() {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let k = 0; k < 4; k++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('NO_CODES', 'Could not allocate a room code');
  }

  #room(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) throw new RoomError('NO_ROOM', 'Room not found');
    return room;
  }

  #player(room, token) {
    const p = room.players.find((x) => x.token === token);
    if (!p) throw new RoomError('NOT_IN_ROOM', 'You are not in this room');
    return p;
  }

  #notify(room, events = []) {
    room.lastActivity = Date.now();
    this.#watchTurn(room);
    this.#botTurn(room);
    this.onUpdate(room, events);
  }

  /**
   * If the player on turn is disconnected, give them a grace period to come back; after that the
   * server plays their first card so the table is never deadlocked. Reconnecting cancels it.
   */
  #watchTurn(room) {
    const g = room.game;
    const cur = g && g.phase === 'playing' && !g.primed ? room.players.find((p) => p.seat === g.turn) : null;
    const key = cur && !cur.socketId && !cur.bot ? `${g.roundNo}:${g.turn}:${g.deckCount ?? g.deck.length}:${g.hands[g.turn].length}` : null;
    if (key === room.watchKey) return;
    clearTimeout(room.watchTimer);
    room.watchKey = key;
    if (!key) return;
    room.watchTimer = setTimeout(() => this.#autoPlay(room, key), this.disconnectGraceMs);
    room.watchTimer.unref?.();
  }

  #autoPlay(room, key) {
    if (room.watchKey !== key || !room.game) return;
    room.watchKey = null;
    if (!room.players.some((p) => p.socketId)) return; // nobody is here: let the room go stale instead
    const g = room.game;
    const card = g.hands[g.turn][0];
    if (!card) return;
    const events = g.playCard(g.turn, card.id);
    events.unshift({ type: 'autoplay', seat: events[0].seat ?? g.turn });
    this.#afterEvents(room, events);
  }

  // ---------- bots ----------

  /** Schedule the bot whose turn it is (or whose pişti is waiting for its slam). */
  #botTurn(room) {
    const g = room.game;
    const cur = g && g.phase === 'playing' ? room.players.find((p) => p.seat === g.turn) : null;
    const key = cur?.bot
      ? `${g.primed ? 'slam:' : ''}${g.roundNo}:${g.turn}:${g.deck.length}:${g.hands[g.turn].length}`
      : null;
    if (key === room.botKey) return;
    clearTimeout(room.botTimer);
    room.botKey = key;
    if (!key) return;
    const delay = g.primed ? 0 : this.botDelayMs * (0.7 + Math.random() * 0.6); // human-ish pacing
    room.botTimer = setTimeout(() => (g.primed ? this.#botSlam(room, key) : this.#botPlay(room, key)), delay);
    room.botTimer.unref?.();
  }

  #botPlay(room, key) {
    const g = room.game;
    if (room.botKey !== key || !g || g.phase !== 'playing' || g.primed) return;
    const seat = g.turn;
    const card = chooseCard(g.viewFor(seat));
    this.#afterPlay(room, g.playCard(seat, card.id, { prime: true }));
  }

  /** A bot "charges" its slam visibly (relayed like a human's), then releases. */
  #botSlam(room, key) {
    const g = room.game;
    if (room.botKey !== key || !g?.primed) return;
    const seat = g.primed.seat;
    const total = this.botSlamMs * (0.6 + Math.random() * 0.6);
    const target = 0.45 + Math.random() * 0.55;
    const steps = Math.max(1, Math.round(total / 90));
    let i = 0;
    const tick = () => {
      if (room.botKey !== key || !g.primed) return;
      i += 1;
      const level = (target * i) / steps;
      g.setCharge(seat, level);
      this.onCharge(room, seat, level);
      if (i < steps) {
        room.botTimer = setTimeout(tick, total / steps);
        room.botTimer.unref?.();
      } else {
        clearTimeout(room.primeTimer);
        this.#afterEvents(room, g.slam(seat, level));
      }
    };
    room.botTimer = setTimeout(tick, total / steps);
    room.botTimer.unref?.();
  }

  addBot(code, token) {
    const room = this.#room(code);
    this.#requireHost(room, this.#player(room, token));
    if (room.status !== 'lobby') throw new RoomError('IN_PROGRESS', 'Bots can only be added in the lobby');
    const seat = this.#freeSeat(room);
    if (seat === -1) throw new RoomError('ROOM_FULL', 'Room is full');
    const used = new Set(room.players.map((p) => p.name));
    const name = `Bot ${BOT_NAMES.find((n) => !used.has(`Bot ${n}`)) ?? randomInt(100, 999)}`;
    room.players.push({ token: randomBytes(16).toString('hex'), seat, name, socketId: null, bot: true });
    room.players.sort((a, b) => a.seat - b.seat);
    this.#notify(room);
  }

  removeBot(code, token, seat) {
    const room = this.#room(code);
    this.#requireHost(room, this.#player(room, token));
    if (room.status !== 'lobby') throw new RoomError('IN_PROGRESS', 'Bots can only be removed in the lobby');
    const bot = room.players.find((p) => p.bot && p.seat === seat);
    if (!bot) throw new RoomError('NO_BOT', 'No bot in that seat');
    room.players = room.players.filter((p) => p !== bot);
    this.#notify(room);
  }

  #requireHost(room, player) {
    if (room.hostToken !== player.token) throw new RoomError('NOT_HOST', 'Only the host can do that');
  }

  #freeSeat(room) {
    for (let s = 0; s < room.maxPlayers; s++) if (!room.players.some((p) => p.seat === s)) return s;
    return -1;
  }

  // ---------- lobby ----------

  createRoom({ name, maxPlayers = 2, targetScore = 101 }) {
    if (maxPlayers !== 2 && maxPlayers !== 4) throw new RoomError('BAD_SETTINGS', 'Rooms are for 2 or 4 players');
    if (!TARGETS.includes(targetScore)) throw new RoomError('BAD_SETTINGS', 'Target score must be 101 or 151');
    const room = {
      code: this.#newCode(),
      status: 'lobby',
      maxPlayers,
      targetScore,
      players: [],
      hostToken: null,
      game: null,
      voice: new Map(), // player token -> { sid, socketId } for players who joined voice chat
      timer: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(room.code, room);
    const player = this.#addPlayer(room, cleanName(name));
    room.hostToken = player.token;
    this.#notify(room);
    return { room, player };
  }

  #addPlayer(room, name) {
    const player = {
      token: randomBytes(16).toString('hex'), // secret; never sent to other clients
      seat: this.#freeSeat(room),
      name,
      socketId: null,
    };
    room.players.push(player);
    room.players.sort((a, b) => a.seat - b.seat);
    return player;
  }

  /** Join with a code, or rejoin (same seat) when `token` matches an existing player. */
  joinRoom({ code, name, token }) {
    const room = this.#room(code);
    const existing = token && room.players.find((p) => p.token === token);
    if (existing) return { room, player: existing };
    if (room.status !== 'lobby') throw new RoomError('IN_PROGRESS', 'That game has already started');
    if (this.#freeSeat(room) === -1) throw new RoomError('ROOM_FULL', 'Room is full');
    const clean = cleanName(name);
    if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
      throw new RoomError('NAME_TAKEN', 'That name is taken in this room');
    const player = this.#addPlayer(room, clean);
    this.#notify(room);
    return { room, player };
  }

  attach(room, player, socketId) {
    player.socketId = socketId;
    this.#notify(room);
  }

  /** Socket disconnected. Seats are kept so the player can rejoin by token. */
  detach(socketId) {
    for (const room of this.rooms.values()) {
      const p = room.players.find((x) => x.socketId === socketId);
      if (p) {
        p.socketId = null;
        // Drop voice membership only if it belongs to this socket (a refreshed tab may already have re-joined).
        if (room.voice.get(p.token)?.socketId === socketId) room.voice.delete(p.token);
        this.#notify(room);
      }
    }
  }

  leave(code, token) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    if (room.status === 'lobby') {
      room.players = room.players.filter((p) => p !== player);
      if (!room.players.some((p) => !p.bot)) return this.#destroy(room);
      if (room.hostToken === token) room.hostToken = room.players.find((p) => !p.bot).token;
    } else {
      // Mid-game the seat is held for reconnection.
      player.socketId = null;
    }
    room.voice.delete(token);
    this.#notify(room);
  }

  // ---------- voice chat signaling (WebRTC mesh; media never touches the server) ----------

  /** Opt in to voice. `sid` is a per-join id so peers can tell a refreshed tab from the old one. */
  voiceJoin(code, token, sid) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(sid)) throw new RoomError('BAD_SID', 'Invalid voice session id');
    if (!player.socketId) throw new RoomError('NOT_CONNECTED', 'Not connected');
    room.voice.set(token, { sid, socketId: player.socketId });
    this.#notify(room);
  }

  voiceLeave(code, token) {
    const room = this.#room(code);
    this.#player(room, token);
    if (room.voice.delete(token)) this.#notify(room);
  }

  /** Resolve a signaling target: both ends must be in voice. Returns the sender's seat and target socket. */
  voiceTarget(code, token, toSeat) {
    const room = this.#room(code);
    const from = this.#player(room, token);
    const to = room.players.find((p) => p.seat === toSeat);
    const target = to && room.voice.get(to.token);
    if (!room.voice.has(token) || !target) throw new RoomError('NO_PEER', 'Peer is not in voice chat');
    return { from: from.seat, socketId: target.socketId };
  }

  #destroy(room) {
    clearTimeout(room.botTimer);
    clearTimeout(room.timer);
    clearTimeout(room.primeTimer);
    clearTimeout(room.watchTimer);
    this.rooms.delete(room.code);
  }

  updateSettings(code, token, { targetScore, maxPlayers }) {
    const room = this.#room(code);
    this.#requireHost(room, this.#player(room, token));
    if (room.status !== 'lobby') throw new RoomError('IN_PROGRESS', 'Settings are locked once the game starts');
    if (targetScore !== undefined) {
      if (!TARGETS.includes(targetScore)) throw new RoomError('BAD_SETTINGS', 'Target score must be 101 or 151');
      room.targetScore = targetScore;
    }
    if (maxPlayers !== undefined) {
      if (maxPlayers !== 2 && maxPlayers !== 4) throw new RoomError('BAD_SETTINGS', 'Rooms are for 2 or 4 players');
      if (room.players.length > maxPlayers) throw new RoomError('BAD_SETTINGS', 'Too many players for that size');
      room.maxPlayers = maxPlayers;
      // Re-seat compactly if shrinking left someone out of range.
      room.players.forEach((p, i) => (p.seat = i));
    }
    this.#notify(room);
  }

  // ---------- game ----------

  start(code, token) {
    const room = this.#room(code);
    this.#requireHost(room, this.#player(room, token));
    if (room.status !== 'lobby') throw new RoomError('IN_PROGRESS', 'Game already started');
    if (room.players.length !== room.maxPlayers)
      throw new RoomError('NOT_FULL', `Waiting for ${room.maxPlayers - room.players.length} more player(s)`);
    this.#newGame(room);
  }

  #newGame(room) {
    clearTimeout(room.timer);
    clearTimeout(room.primeTimer);
    clearTimeout(room.botTimer);
    room.botKey = null;
    room.nextAt = null;
    room.game = new PistiGame({ playerCount: room.maxPlayers, targetScore: room.targetScore });
    room.status = 'playing';
    this.#notify(room, [{ type: 'roundStart', roundNo: 1 }]);
  }

  play(code, token, cardId) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    if (room.status !== 'playing') throw new RoomError('BAD_PHASE', 'No game in progress');
    let events;
    try {
      events = room.game.playCard(player.seat, cardId, { prime: true });
    } catch (e) {
      throw this.#wrap(e);
    }
    this.#afterPlay(room, events);
  }

  #afterPlay(room, events) {
    if (room.game.primed) {
      // Auto-slam fallback if the player disconnects or never releases.
      clearTimeout(room.primeTimer);
      room.primeTimer = setTimeout(() => this.#autoSlam(room), this.primeTimeoutMs);
      room.primeTimer.unref?.();
      events[0].timeoutMs = this.primeTimeoutMs;
    }
    this.#afterEvents(room, events);
  }

  #wrap(e) {
    return e instanceof GameError ? new RoomError(e.code, e.message) : e;
  }

  #afterEvents(room, events) {
    if (room.game.phase === 'matchOver') room.status = 'finished';
    if (room.game.phase === 'roundOver') this.#scheduleNextRound(room);
    this.#notify(room, events);
  }

  /** Relay of the primed player's charge level; ephemeral, not part of room state. */
  charge(code, token, level) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    const now = Date.now();
    if (now - (room.lastCharge ?? 0) < 40) return; // throttle
    if (!room.game?.setCharge(player.seat, level)) return;
    room.lastCharge = now;
    this.onCharge(room, player.seat, room.game.primed.charge);
  }

  slam(code, token, chargeLevel) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    if (!room.game) throw new RoomError('BAD_PHASE', 'No game in progress');
    let events;
    try {
      events = room.game.slam(player.seat, chargeLevel);
    } catch (e) {
      throw this.#wrap(e);
    }
    clearTimeout(room.primeTimer);
    this.#afterEvents(room, events);
  }

  #autoSlam(room) {
    const primed = room.game?.primed;
    if (!primed) return;
    const events = room.game.slam(primed.seat, primed.charge);
    events[0].auto = true;
    this.#afterEvents(room, events);
  }

  #scheduleNextRound(room) {
    clearTimeout(room.timer);
    if (this.autoAdvanceMs == null) return;
    room.nextAt = Date.now() + this.autoAdvanceMs;
    room.timer = setTimeout(() => this.#advanceRound(room), this.autoAdvanceMs);
    room.timer.unref?.();
  }

  #advanceRound(room) {
    clearTimeout(room.timer);
    room.nextAt = null;
    if (room.game?.phase !== 'roundOver') return;
    this.#notify(room, room.game.startNextRound());
  }

  nextRound(code, token) {
    const room = this.#room(code);
    this.#player(room, token);
    if (room.game?.phase !== 'roundOver') throw new RoomError('BAD_PHASE', 'Round is not over');
    this.#advanceRound(room);
  }

  rematch(code, token) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    // If the host has dropped, any connected player may start the rematch so the room is not stuck.
    const host = room.players.find((p) => p.token === room.hostToken);
    if (host?.socketId) this.#requireHost(room, player);
    if (room.status !== 'finished') throw new RoomError('BAD_PHASE', 'The match is not over');
    this.#newGame(room);
  }

  // ---------- views ----------

  viewFor(room, player) {
    return {
      code: room.code,
      status: room.status,
      maxPlayers: room.maxPlayers,
      targetScore: room.targetScore,
      mySeat: player.seat,
      hostSeat: room.players.find((p) => p.token === room.hostToken)?.seat ?? null,
      players: room.players.map((p) => ({ seat: p.seat, name: p.name, bot: !!p.bot, connected: !!p.bot || p.socketId !== null })),
      voice: Object.fromEntries(room.players.filter((p) => room.voice.has(p.token)).map((p) => [p.seat, room.voice.get(p.token).sid])),
      game: room.game
        ? { ...room.game.viewFor(player.seat), nextRoundIn: room.nextAt ? Math.max(0, room.nextAt - Date.now()) : 0, nextRoundMs: room.nextAt ? this.autoAdvanceMs : 0 }
        : null,
    };
  }

  /** Drop rooms nobody is connected to for a while. */
  sweepStale(now = Date.now()) {
    for (const room of [...this.rooms.values()]) {
      const anyone = room.players.some((p) => p.socketId);
      if (!anyone && now - room.lastActivity > STALE_MS) this.#destroy(room);
    }
  }
}
