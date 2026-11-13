import { useState } from 'react';
import { Bot, Copy, Check, Crown, LogOut, Play, UserRound, X } from 'lucide-react';
import { teamOf } from '../util.js';
import Avatar from './Avatar.jsx';

export default function Lobby({ room, actions, error, speaking = {} }) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostSeat === room.mySeat;
  const full = room.players.length === room.maxPlayers;
  const slots = Array.from({ length: room.maxPlayers }, (_, s) => room.players.find((p) => p.seat === s) ?? null);

  const copy = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const seg = (active) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-gold text-felt-900' : 'bg-white/10'} ${isHost ? 'hover:brightness-110' : 'cursor-default opacity-70'}`;

  return (
    <div className="felt flex min-h-full items-center justify-center p-4">
      <div className="panel relative z-10 w-full max-w-md space-y-5 p-6 sm:p-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-white/50">Room code</p>
          <button onClick={copy} className="mx-auto mt-1 flex items-center gap-3 rounded-xl bg-black/30 px-5 py-2 hover:bg-black/40" title="Copy code">
            <span className="font-mono text-4xl font-bold tracking-[0.35em] text-gold">{room.code}</span>
            {copied ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5 text-white/50" />}
          </button>
          <p className="mt-2 text-sm text-white/60">Share this code with {room.maxPlayers === 2 ? 'a friend' : 'three friends'}.</p>
        </div>

        <ul className="space-y-2">
          {slots.map((p, s) => (
            <li key={s} className="flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2.5">
              {p ? (
                <Avatar name={p.name} seat={p.seat} bot={p.bot} size="sm" speaking={!!speaking[p.seat]} inVoice={!!room.voice?.[p.seat]} connected={p.connected} />
              ) : (
                <UserRound className="h-7 w-7 text-white/25" />
              )}
              {p || !isHost ? (
                <span className={p ? '' : 'italic text-white/40'}>{p ? p.name : 'Waiting for player…'}</span>
              ) : (
                <>
                  <span className="italic text-white/40">Waiting for player…</span>
                  <button onClick={actions.addBot} className="ml-auto flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20">
                    <Bot className="h-3.5 w-3.5" /> Add bot
                  </button>
                </>
              )}
              {p?.bot && isHost && (
                <button onClick={() => actions.removeBot(p.seat)} className="ml-auto rounded-full p-1 hover:bg-white/15" title="Remove bot">
                  <X className="h-4 w-4" />
                </button>
              )}
              {p && p.seat === room.hostSeat && <Crown className="h-4 w-4 text-gold" />}
              {p && p.seat === room.mySeat && <span className="text-xs text-white/50">(you)</span>}
              {room.maxPlayers === 4 && (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${teamOf(s) === 0 ? 'bg-crimson/70' : 'bg-sky-800/70'}`}>
                  Team {teamOf(s) === 0 ? 'A' : 'B'}
                </span>
              )}
            </li>
          ))}
        </ul>
        {room.maxPlayers === 4 && <p className="text-center text-xs text-white/50">Partners sit across from each other.</p>}

        <div className="space-y-2">
          <div className="flex gap-2">
            {[2, 4].map((n) => (
              <button key={n} disabled={!isHost} className={seg(room.maxPlayers === n)} onClick={() => actions.settings({ maxPlayers: n })}>{n} players</button>
            ))}
          </div>
          <div className="flex gap-2">
            {[101, 151].map((n) => (
              <button key={n} disabled={!isHost} className={seg(room.targetScore === n)} onClick={() => actions.settings({ targetScore: n })}>Play to {n}</button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-900/60 px-3 py-2 text-center text-sm">{error}</p>}

        <div className="flex gap-2">
          <button onClick={actions.leave} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 hover:bg-white/15">
            <LogOut className="h-4 w-4" /> Leave
          </button>
          {isHost ? (
            <button
              disabled={!full}
              onClick={actions.start}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-crimson py-2.5 font-semibold shadow hover:brightness-110 disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> {full ? 'Start game' : `Need ${room.maxPlayers - room.players.length} more`}
            </button>
          ) : (
            <p className="flex-1 self-center text-center text-sm text-white/60">Waiting for the host to start…</p>
          )}
        </div>
      </div>
    </div>
  );
}
