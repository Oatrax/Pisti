import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, emit } from './socket.js';
import { VoiceClient } from './voice.js';

function friendly(e) {
  if (e?.name === 'NotAllowedError') return 'Microphone permission was denied';
  if (e?.name === 'NotFoundError') return 'No microphone found';
  if (e?.name === 'InsecureContext') return 'Voice chat needs HTTPS (or localhost)';
  return e?.message || 'Could not start voice chat';
}

export function useVoice(room) {
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [speaking, setSpeaking] = useState({});
  const [error, setError] = useState(null);
  const [client] = useState(() => new VoiceClient((m) => setSpeaking(m)));
  const needRejoin = useRef(false);

  const join = useCallback(async () => {
    if (busy || joined) return;
    setError(null);
    setBusy(true);
    try {
      await client.start();
      await emit('voice:join', { sid: client.sid });
      setJoined(true);
    } catch (e) {
      client.stop();
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }, [client, busy, joined]);

  const leave = useCallback(() => {
    client.stop();
    setJoined(false);
  }, [client]);

  // Mic/deafen state -> media. Deafening also silences the mic.
  useEffect(() => { client.setMic(!muted && !deafened); }, [client, muted, deafened, joined]);
  useEffect(() => { client.setDeaf(deafened); }, [client, deafened, joined]);

  // Keep peer connections in step with the room's voice roster; re-announce after a socket reconnect.
  const roster = room?.voice;
  const mySeat = room?.mySeat;
  useEffect(() => {
    if (!joined || !room) return;
    if (needRejoin.current) {
      needRejoin.current = false;
      emit('voice:join', { sid: client.renewSid() }).catch(() => {});
    }
    client.sync(roster ?? {}, mySeat);
  }, [client, joined, room, roster, mySeat]);

  // Left the room (or the session was dropped): release everything.
  useEffect(() => { if (joined && !room) leave(); }, [joined, room, leave]);

  useEffect(() => {
    const onSignal = (m) => client.onSignal(m);
    const onDisconnect = () => {
      if (!client.active) return;
      client.closePeers(); // the server dropped our voice session with the socket
      needRejoin.current = true;
    };
    const onPageHide = () => client.stop();
    socket.on('voice:signal', onSignal);
    socket.on('disconnect', onDisconnect);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      socket.off('voice:signal', onSignal);
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('pagehide', onPageHide);
      client.stop();
    };
  }, [client]);

  return {
    joined, busy, muted, deafened, speaking, error,
    peers: room?.voice ? Object.keys(room.voice).length : 0,
    join, leave,
    toggleMute: () => setMuted((v) => !v),
    toggleDeafen: () => setDeafened((v) => !v),
  };
}
