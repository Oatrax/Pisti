import { useState } from 'react';
import { Spade, Users, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

const NAME_KEY = 'pisti.name';
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };

export default function Home({ onCreate, onJoin, error, connected }) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [size, setSize] = useState(2);
  const [target, setTarget] = useState(101);

  const remember = () => { try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* ignore */ } };
  const ready = name.trim().length > 0 && connected;

  const seg = (active) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-gold text-felt-900' : 'bg-white/10 hover:bg-white/15'}`;

  return (
    <div className="felt flex min-h-full items-center justify-center p-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="panel relative z-10 w-full max-w-md space-y-6 p-6 sm:p-8"
      >
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-crimson shadow-lg ring-2 ring-gold/60">
            <Spade className="h-7 w-7 text-gold" />
          </div>
          <h1 className="text-3xl font-bold tracking-wide text-gold">Pişti</h1>
          <p className="text-sm text-white/60">Turkish card game · 2 or 4 players</p>
        </div>

        <label className="block text-sm">
          <span className="text-white/70">Your name</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ayşe"
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-gold"
          />
        </label>

        <div className="space-y-3 rounded-xl bg-black/20 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gold"><Users className="h-4 w-4" /> New room</h2>
          <div className="flex gap-2">
            {[2, 4].map((n) => (
              <button key={n} className={seg(size === n)} onClick={() => setSize(n)}>{n} players</button>
            ))}
          </div>
          <div className="flex gap-2">
            {[101, 151].map((n) => (
              <button key={n} className={seg(target === n)} onClick={() => setTarget(n)}>Play to {n}</button>
            ))}
          </div>
          <button
            disabled={!ready}
            onClick={() => { remember(); onCreate({ name, maxPlayers: size, targetScore: target }); }}
            className="w-full rounded-lg bg-crimson py-2.5 font-semibold shadow hover:brightness-110 disabled:opacity-40"
          >
            Create room
          </button>
        </div>

        <div className="space-y-3 rounded-xl bg-black/20 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gold"><LogIn className="h-4 w-4" /> Join with a code</h2>
          <div className="flex gap-2">
            <input
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder="ABCD"
              className="w-28 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-gold"
            />
            <button
              disabled={!ready || code.length !== 4}
              onClick={() => { remember(); onJoin({ name, code }); }}
              className="flex-1 rounded-lg bg-gold font-semibold text-felt-900 hover:brightness-105 disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-900/60 px-3 py-2 text-center text-sm">{error}</p>}
        {!connected && <p className="text-center text-xs text-white/50">Connecting to server…</p>}
      </motion.div>
    </div>
  );
}
