import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { teamLabel, teamOf } from '../util.js';

const ROWS = [
  ['Cards captured', 'cards', false],
  ['Aces', 'aces', true],
  ['Jacks', 'jacks', true],
  ['2 ♣', 'twoClubs', true],
  ['10 ♦', 'tenDiamonds', true],
  ['Most cards', 'majority', true],
  ['Pişti', 'pisti', true],
];

export default function RoundSummary({ room, game, actions }) {
  const n = game.playerCount;
  const r = game.lastRound;
  if (!r) return null;
  const over = game.phase === 'matchOver';
  const isHost = room.hostSeat === room.mySeat;
  const won = over && game.winnerTeam === teamOf(room.mySeat);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4"
    >
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="panel w-full max-w-md p-5 sm:p-6">
        {over ? (
          <div className="mb-3 text-center">
            <Trophy className="mx-auto h-9 w-9 text-gold" />
            <h2 className="text-2xl font-bold text-gold">{won ? 'You win!' : `${teamLabel(game.winnerTeam, room.players, n)} win`}</h2>
          </div>
        ) : (
          <h2 className="mb-3 text-center text-xl font-bold text-gold">Round {r.roundNo} complete</h2>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/60">
              <th />
              {[0, 1].map((t) => (
                <th key={t} className="max-w-[6rem] truncate px-1 pb-2 text-right font-medium">{teamLabel(t, room.players, n)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, key, pts]) => (
              <tr key={key} className="border-t border-white/10">
                <td className="py-1 text-white/70">{label}</td>
                {r.breakdown.map((b, t) => (
                  <td key={t} className="py-1 text-right tabular-nums">{pts && b[key] > 0 ? `+${b[key]}` : b[key]}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-white/30 font-semibold">
              <td className="py-1.5">Round</td>
              {r.breakdown.map((b, t) => <td key={t} className="py-1.5 text-right tabular-nums">+{b.total}</td>)}
            </tr>
            <tr className="text-lg font-bold text-gold">
              <td>Total</td>
              {r.scores.map((s, t) => <td key={t} className="text-right tabular-nums">{s}</td>)}
            </tr>
          </tbody>
        </table>

        <div className="mt-4 flex gap-2">
          {over ? (
            <>
              <button onClick={actions.leave} className="flex-1 rounded-lg bg-white/10 py-2.5 hover:bg-white/15">Leave</button>
              {isHost ? (
                <button onClick={actions.rematch} className="flex-1 rounded-lg bg-crimson py-2.5 font-semibold hover:brightness-110">Rematch</button>
              ) : (
                <p className="flex-1 self-center text-center text-xs text-white/60">Host can start a rematch</p>
              )}
            </>
          ) : (
            <button onClick={actions.next} className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-felt-900 hover:brightness-105">
              Next round
            </button>
          )}
        </div>
        {!over && <p className="mt-2 text-center text-xs text-white/50">Starts automatically in a few seconds.</p>}
      </motion.div>
    </motion.div>
  );
}
