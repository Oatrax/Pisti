import { motion } from 'framer-motion';
import { Crown, Trophy } from 'lucide-react';
import { teamLabel, teamOf } from '../util.js';

/** One scoring cell: highlighted when the team earned something in this category. */
function Cell({ pts, detail }) {
  const won = pts > 0;
  return (
    <td className="px-1 py-1.5 text-right align-middle">
      {won ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-gold/20 px-2 py-0.5 text-gold ring-1 ring-gold/40">
          {detail && <span className="text-xs text-gold/80">{detail}</span>}
          <span className="font-bold tabular-nums">+{pts}</span>
        </span>
      ) : (
        <span className="text-white/25">{detail || '—'}</span>
      )}
    </td>
  );
}

function pistiDetail(b) {
  const parts = [];
  if (b.pistiCount) parts.push(`${b.pistiCount}× Pişti`);
  if (b.jackPistiCount) parts.push(`${b.jackPistiCount}× Vale`);
  return parts.join(' · ');
}

export default function RoundSummary({ room, game, actions }) {
  const n = game.playerCount;
  const r = game.lastRound;
  if (!r) return null;
  const over = game.phase === 'matchOver';
  const isHost = room.hostSeat === room.mySeat;
  const won = over && game.winnerTeam === teamOf(room.mySeat);
  const b = r.breakdown;
  const tiedMajority = b[0].cards === b[1].cards;
  const roundWinner = b[0].total === b[1].total ? null : b[0].total > b[1].total ? 0 : 1;

  // Seconds left before the server starts the next round by itself (the bar shrinks to zero).
  const total = game.nextRoundMs;
  const remaining = total ? Math.max(0, game.nextRoundIn - (Date.now() - (room.receivedAt ?? Date.now()))) : 0;

  const rows = [
    ['Majority cards', (t) => ({ pts: b[t].majority, detail: `${b[t].cards}` }), tiedMajority ? 'Tied — no majority bonus' : '27+ cards'],
    ['Sinek 2 ♣', (t) => ({ pts: b[t].twoClubs, detail: b[t].twoClubs ? '2♣' : '' })],
    ['Karo 10 ♦', (t) => ({ pts: b[t].tenDiamonds, detail: b[t].tenDiamonds ? '10♦' : '' })],
    ['Aces', (t) => ({ pts: b[t].aces, detail: b[t].aces ? `${b[t].aces}×` : '' })],
    ['Jacks', (t) => ({ pts: b[t].jacks, detail: b[t].jacks ? `${b[t].jacks}×` : '' })],
    ['Pişti bonus', (t) => ({ pts: b[t].pisti, detail: pistiDetail(b[t]) })],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Round summary"
    >
      <motion.div initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} className="panel my-auto w-full max-w-lg p-4 sm:p-6">
        {over ? (
          <div className="mb-3 text-center">
            <Trophy className="mx-auto h-9 w-9 text-gold" />
            <h2 className="text-2xl font-bold text-gold">{won ? 'You win the match!' : `${teamLabel(game.winnerTeam, room.players, n)} win the match`}</h2>
          </div>
        ) : (
          <h2 className="mb-3 text-center text-xl font-bold text-gold">Round {r.roundNo} complete</h2>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/70">
              <th />
              {[0, 1].map((t) => (
                <th key={t} className="px-1 pb-2 text-right font-semibold">
                  <span className="flex items-center justify-end gap-1">
                    {roundWinner === t && <Crown className="h-3.5 w-3.5 text-gold" />}
                    <span className="max-w-[7rem] truncate">{teamLabel(t, room.players, n)}</span>
                    {teamOf(room.mySeat) === t && <span className="text-[10px] text-white/50">(you)</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, note]) => (
              <tr key={label} className="border-t border-white/10">
                <td className="py-1.5 pr-2 text-white/75">
                  {label}
                  {note && <span className="block text-[10px] text-white/40">{note}</span>}
                </td>
                {[0, 1].map((t) => <Cell key={t} {...get(t)} />)}
              </tr>
            ))}
            <tr className="border-t border-white/30 font-semibold">
              <td className="py-1.5">This round</td>
              {b.map((x, t) => <td key={t} className="px-1 py-1.5 text-right tabular-nums">+{x.total}</td>)}
            </tr>
            <tr className="text-lg font-bold text-gold">
              <td>Total <span className="text-xs font-normal text-white/50">/ {game.targetScore}</span></td>
              {r.scores.map((s, t) => <td key={t} className="px-1 text-right tabular-nums">{s}</td>)}
            </tr>
          </tbody>
        </table>

        <div className="mt-4 flex gap-2">
          {over ? (
            <>
              <button onClick={actions.leave} className="flex-1 rounded-lg bg-white/10 py-2.5 hover:bg-white/15">Leave</button>
              <button
                onClick={actions.rematch}
                disabled={!isHost && room.players.find((p) => p.seat === room.hostSeat)?.connected}
                className="flex-1 rounded-lg bg-crimson py-2.5 font-semibold hover:brightness-110 disabled:opacity-40"
              >
                {isHost ? 'Rematch' : 'Rematch (host)'}
              </button>
            </>
          ) : (
            <button onClick={actions.next} className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-felt-900 hover:brightness-105">
              Next round
            </button>
          )}
        </div>
        {!over && total > 0 && (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded bg-white/10">
              <motion.div
                key={r.roundNo}
                className="h-full origin-left bg-gold/70"
                initial={{ scaleX: remaining / total }}
                animate={{ scaleX: 0 }}
                transition={{ duration: remaining / 1000, ease: 'linear' }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-white/50">Next round starts automatically</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
