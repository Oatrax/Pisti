import Home from './components/Home.jsx';
import Lobby from './components/Lobby.jsx';
import Table from './components/Table.jsx';
import VoiceBar from './components/VoiceBar.jsx';
import { useRoom } from './useRoom.js';
import { useVoice } from './useVoice.js';

export default function App() {
  const r = useRoom();
  const { room } = r;
  const voice = useVoice(room);

  return (
    <div className="h-full">
      {!room && <Home onCreate={r.create} onJoin={r.join} onSolo={r.solo} error={r.error} connected={r.connected} />}
      {room && room.status === 'lobby' && <Lobby room={room} actions={r} error={r.error} speaking={voice.speaking} />}
      {room && room.game && room.status !== 'lobby' && <Table room={room} actions={r} capture={r.capture} charging={r.charging} speaking={voice.speaking} />}
      {room && <VoiceBar voice={voice} />}
      {room && !r.connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-red-800 py-1 text-center text-sm">Connection lost — reconnecting…</div>
      )}
      {room && room.game && r.error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-900/90 px-4 py-2 text-sm">{r.error}</div>
      )}
    </div>
  );
}
