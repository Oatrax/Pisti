import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, emit } from './socket.js';

const KEY = 'pisti.session';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

export function useRoom() {
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState(null);
  const [capture, setCapture] = useState(null); // transient animation info for the last capture
  const roomRef = useRef(null);
  const captureTimer = useRef();

  useEffect(() => {
    const rejoin = async () => {
      const s = load();
      if (!s) return;
      try { await emit('room:rejoin', s); } catch { save(null); roomRef.current = null; setRoom(null); }
    };
    const onConnect = () => { setConnected(true); rejoin(); };
    const onDisconnect = () => setConnected(false);
    const onState = (st) => { roomRef.current = st; setRoom(st); };
    // Events arrive just before the matching state, so roomRef still holds the pre-move pile:
    // keep it (plus the played card) on screen briefly so the capture reads clearly.
    const onEvents = (events) => {
      const play = events.find((e) => e.type === 'play');
      const cap = events.find((e) => e.type === 'capture');
      if (!cap || !play) return;
      const before = roomRef.current?.game?.pile ?? [];
      clearTimeout(captureTimer.current);
      setCapture({ id: Date.now(), seat: cap.seat, pisti: cap.pisti, pile: [...before, { card: play.card }] });
      captureTimer.current = setTimeout(() => setCapture(null), 1100);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('game:events', onEvents);
    if (socket.connected) rejoin();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('game:events', onEvents);
    };
  }, []);

  const run = useCallback(async (event, payload, after) => {
    setError(null);
    try { const res = await emit(event, payload); after?.(res); return res; }
    catch (e) { setError(e.message); return null; }
  }, []);

  const remember = (res) => save({ code: res.code, token: res.token });

  return {
    room, connected, error, capture, clearError: () => setError(null),
    create: (p) => run('room:create', p, remember),
    join: (p) => run('room:join', p, remember),
    leave: () => run('room:leave', {}, () => { save(null); roomRef.current = null; setRoom(null); }),
    settings: (p) => run('room:settings', p),
    start: () => run('room:start'),
    play: (cardId) => run('game:play', { cardId }),
    next: () => run('game:next'),
    rematch: () => run('game:rematch'),
  };
}
