import { randomBytes, randomInt } from 'node:crypto';
import { PistiGame, GameError } from './engine/game.js';

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O (look like 1 / 0)
const TARGETS = [101, 151];
const STALE_MS = 10 * 60 * 1000;

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
  constructor({ onUpdate = () => {}, autoAdvanceMs = 9000 } = {}) {
    this.rooms = new Map();
    this.onUpdate = onUpdate;
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
    this.onUpdate(room, events);
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
        this.#notify(room);
      }
    }
  }

  leave(code, token) {
    const room = this.#room(code);
    const player = this.#player(room, token);
    if (room.status === 'lobby') {
      room.players = room.players.filter((p) => p !== player);
      if (room.players.length === 0) return this.#destroy(room);
      if (room.hostToken === token) room.hostToken = room.players[0].token;
    } else {
      // Mid-game the seat is held for reconnection.
      player.socketId = null;
    }
    this.#notify(room);
  }

  #destroy(room) {
    clearTimeout(room.timer);
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
      events = room.game.playCard(player.seat, cardId);
    } catch (e) {
      if (e instanceof GameError) throw new RoomError(e.code, e.message);
      throw e;
    }
    if (room.game.phase === 'matchOver') room.status = 'finished';
    if (room.game.phase === 'roundOver') this.#scheduleNextRound(room);
    this.#notify(room, events);
  }

  #scheduleNextRound(room) {
    clearTimeout(room.timer);
    if (this.autoAdvanceMs == null) return;
    room.timer = setTimeout(() => this.#advanceRound(room), this.autoAdvanceMs);
    room.timer.unref?.();
  }

  #advanceRound(room) {
    clearTimeout(room.timer);
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
    this.#requireHost(room, this.#player(room, token));
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
      players: room.players.map((p) => ({ seat: p.seat, name: p.name, connected: p.socketId !== null })),
      game: room.game ? room.game.viewFor(player.seat) : null,
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
