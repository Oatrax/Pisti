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
  const [charging, setCharging] = useState(null); // { seat, level } relayed from the primed player

  useEffect(() => {
    // Rejoin the saved seat. If the server answered with an error the session is truly gone (room
    // closed, bad token) so forget it; a timeout or dropped link just means "try again shortly".
    let retry;
    const rejoin = async (attempt = 0) => {
      clearTimeout(retry);
      const s = load();
      if (!s || !socket.connected) return;
      try {
        await emit('room:rejoin', s);
      } catch (e) {
        if (e.code) { save(null); roomRef.current = null; setRoom(null); }
        else if (attempt < 6) retry = setTimeout(() => rejoin(attempt + 1), Math.min(4000, 500 * 2 ** attempt));
      }
    };
    // Mobile browsers freeze background tabs; reconnect as soon as the player comes back.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      else if (load() && !roomRef.current) rejoin();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const onConnect = () => { setConnected(true); rejoin(); };
    const onDisconnect = () => setConnected(false);
    const onState = (st) => {
      st.receivedAt = Date.now();
      roomRef.current = st;
      setRoom(st);
      if (!st.game?.primed) setCharging(null);
    };
    const onPrimed = () => setCharging(null);
    const onCharging = (c) => setCharging(c);
    // The slam carries the card and charge. The pile as it was before the slam (still in roomRef,
    // because events arrive just ahead of the new state) stays on screen while the animation plays.
    const onSlam = (p) => {
      const before = roomRef.current?.game?.pile ?? [];
      clearTimeout(captureTimer.current);
      setCharging(null);
      setCapture({ id: Date.now(), seat: p.seat, pisti: p.pisti, charge: p.chargeLevel, pile: [...before, { card: p.card, slam: true }] });
      captureTimer.current = setTimeout(() => setCapture(null), 2300);
    };
    // Plain captures: events arrive just before the matching state, so roomRef still holds the
    // pre-move pile. Keep it (plus the played card) on screen briefly so the capture reads clearly.
    // Pişti captures go through onSlam instead.
    const onEvents = (events) => {
      const play = events.find((e) => e.type === 'play');
      const cap = events.find((e) => e.type === 'capture');
      if (!cap || !play || cap.pisti) return;
      const before = roomRef.current?.game?.pile ?? [];
      clearTimeout(captureTimer.current);
      setCapture({ id: Date.now(), seat: cap.seat, pisti: null, pile: [...before, { card: play.card }] });
      captureTimer.current = setTimeout(() => setCapture(null), 1100);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('game:events', onEvents);
    socket.on('pisti:primed', onPrimed);
    socket.on('pisti:charging', onCharging);
    socket.on('pisti:slam', onSlam);
    if (socket.connected) rejoin();
    return () => {
      clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('game:events', onEvents);
      socket.off('pisti:primed', onPrimed);
      socket.off('pisti:charging', onCharging);
      socket.off('pisti:slam', onSlam);
    };
  }, []);

  const run = useCallback(async (event, payload, after) => {
    setError(null);
    try { const res = await emit(event, payload); after?.(res); return res; }
    catch (e) { setError(e.message); return null; }
  }, []);

  const remember = (res) => save({ code: res.code, token: res.token });

  return {
    room, connected, error, capture, charging, clearError: () => setError(null),
    create: (p) => run('room:create', p, remember),
    join: (p) => run('room:join', p, remember),
    leave: () => run('room:leave', {}, () => { save(null); roomRef.current = null; setRoom(null); }),
    settings: (p) => run('room:settings', p),
    start: () => run('room:start'),
    play: (cardId) => run('game:play', { cardId }),
    charge: (level) => socket.volatile.emit('pisti:charging', { level }),
    slam: (chargeLevel) => run('pisti:slam', { chargeLevel }),
    next: () => run('game:next'),
    rematch: () => run('game:rematch'),
  };
}
