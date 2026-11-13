import { socket } from './socket.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const SPEAK_RMS = 0.03; // voice-activity threshold
const SPEAK_HOLD_MS = 350; // keep the ring lit briefly between syllables

const newSid = () =>
  globalThis.crypto?.randomUUID?.() ?? Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join('-');

/**
 * Mesh voice chat over native WebRTC. Signaling goes through Socket.io; media is peer-to-peer.
 *
 * - Each join gets a fresh `sid`, so a refreshed tab is never confused with its old session.
 * - Roles are fixed to avoid offer glare: the LOWER seat of each pair makes the offer.
 * - Every peer connection, audio element, analyser and timer is released in close()/stop().
 */
export class VoiceClient {
  constructor(onSpeaking) {
    this.onSpeaking = onSpeaking;
    this.#reset();
  }

  #reset() {
    this.active = false;
    this.sid = null;
    this.stream = null;
    this.ctx = null;
    this.mySeat = null;
    this.deaf = false;
    this.conns = new Map(); // seat -> connection record
    this.pending = new Map(); // seat -> signals that arrived before the connection existed
    this.meters = new Map(); // 'local' | seat -> { analyser, buf, source, lastLoud }
    this.speaking = {};
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Acquire the microphone and start metering. Throws on permission/device errors. */
  async start() {
    if (this.active) return;
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.stream = stream;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume?.();
    this.sid = newSid();
    this.active = true;
    this.#addMeter('local', stream);
    this.timer = setInterval(() => this.#poll(), 100);
  }

  /** New voice session id (used when re-announcing after a socket reconnect). */
  renewSid() {
    this.sid = newSid();
    return this.sid;
  }

  setMic(enabled) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  setDeaf(deaf) {
    this.deaf = deaf;
    this.conns.forEach((c) => c.audio && (c.audio.muted = deaf));
  }

  /** Reconcile peer connections with the room roster ({ seat: sid }). */
  sync(roster, mySeat) {
    if (!this.active) return;
    this.mySeat = mySeat;
    for (const [seatStr, sid] of Object.entries(roster)) {
      const seat = Number(seatStr);
      if (seat === mySeat) continue;
      const existing = this.conns.get(seat);
      if (existing && existing.sid !== sid) this.close(seat); // peer refreshed: new session
      if (!this.conns.has(seat)) this.#connect(seat, sid);
    }
    for (const seat of [...this.conns.keys()]) {
      if (seat === mySeat || !(seat in roster)) this.close(seat);
    }
    for (const seat of [...this.pending.keys()]) if (!(seat in roster)) this.pending.delete(seat);
  }

  #connect(seat, sid) {
    const pc = new RTCPeerConnection(ICE);
    const conn = { seat, sid, pc, queued: [], remoteSet: false, audio: null, offerer: this.mySeat < seat };
    this.conns.set(seat, conn);
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));

    pc.onicecandidate = (e) => e.candidate && this.#send(conn, { candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track]);
      if (!conn.audio) {
        const el = new Audio();
        el.autoplay = true;
        el.muted = this.deaf;
        el.srcObject = remote;
        el.play?.().catch(() => {});
        conn.audio = el;
      }
      this.#addMeter(seat, remote);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && conn.offerer && this.conns.get(seat) === conn) this.#offer(conn, true);
    };

    const buffered = (this.pending.get(seat) ?? []).filter((m) => m.fromSid === sid);
    this.pending.delete(seat);
    buffered.forEach((m) => this.onSignal(m));
    if (conn.offerer) this.#offer(conn);
  }

  async #offer(conn, iceRestart = false) {
    try {
      const offer = await conn.pc.createOffer({ iceRestart });
      await conn.pc.setLocalDescription(offer);
      this.#send(conn, { sdp: conn.pc.localDescription });
    } catch (e) {
      console.warn('voice offer failed', e);
    }
  }

  #send(conn, data) {
    socket.emit('voice:signal', { to: conn.seat, fromSid: this.sid, toSid: conn.sid, data });
  }

  async onSignal(m) {
    if (!this.active || m.toSid !== this.sid) return; // addressed to an old session of mine
    const conn = this.conns.get(m.from);
    if (!conn) {
      // The roster update may not have been processed yet: hold on to the signal briefly.
      const list = (this.pending.get(m.from) ?? []).slice(-60);
      list.push(m);
      this.pending.set(m.from, list);
      return;
    }
    if (conn.sid !== m.fromSid) return; // from a stale session of that peer
    const { pc } = conn;
    try {
      if (m.data.sdp) {
        await pc.setRemoteDescription(m.data.sdp);
        conn.remoteSet = true;
        for (const c of conn.queued.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (m.data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.#send(conn, { sdp: pc.localDescription });
        }
      } else if (m.data.candidate) {
        if (conn.remoteSet) await pc.addIceCandidate(m.data.candidate).catch(() => {});
        else conn.queued.push(m.data.candidate);
      }
    } catch (e) {
      console.warn('voice signal failed', e);
    }
  }

  /** Tear down one peer: connection, audio element, analyser. */
  close(seat) {
    const conn = this.conns.get(seat);
    if (!conn) return;
    this.conns.delete(seat);
    conn.pc.onicecandidate = conn.pc.ontrack = conn.pc.onconnectionstatechange = null;
    conn.pc.close();
    if (conn.audio) {
      conn.audio.pause?.();
      conn.audio.srcObject = null;
    }
    this.#dropMeter(seat);
  }

  closePeers() {
    [...this.conns.keys()].forEach((s) => this.close(s));
    this.pending.clear();
  }

  /** Leave voice entirely and release the microphone. */
  stop() {
    if (!this.active) return;
    if (socket.connected) socket.emit('voice:leave', {});
    this.closePeers();
    this.#dropMeter('local');
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close?.().catch(() => {});
    this.#reset();
    this.onSpeaking({});
  }

  // ---------- speaking detection ----------

  #addMeter(key, stream) {
    this.#dropMeter(key);
    if (!this.ctx || !stream.getAudioTracks().length) return;
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // analysis only: never routed to the speakers
    this.meters.set(key, { source, analyser, buf: new Uint8Array(analyser.fftSize), lastLoud: 0 });
  }

  #dropMeter(key) {
    const m = this.meters.get(key);
    if (!m) return;
    try { m.source.disconnect(); } catch { /* already disconnected */ }
    this.meters.delete(key);
  }

  #poll() {
    const now = performance.now();
    const next = {};
    for (const [key, m] of this.meters) {
      m.analyser.getByteTimeDomainData(m.buf);
      let sum = 0;
      for (const v of m.buf) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / m.buf.length) > SPEAK_RMS) m.lastLoud = now;
      const live = key !== 'local' || this.stream?.getAudioTracks().some((t) => t.enabled);
      const seat = key === 'local' ? this.mySeat : key;
      if (live && seat !== null && now - m.lastLoud < SPEAK_HOLD_MS) next[seat] = true;
    }
    if (JSON.stringify(next) !== JSON.stringify(this.speaking)) {
      this.speaking = next;
      this.onSpeaking(next);
    }
  }
}
