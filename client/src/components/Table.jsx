import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { CardBack, CardFace } from './Card.jsx';
import RoundSummary from './RoundSummary.jsx';
import { hash01, relPosition, teamLabel, teamOf } from '../util.js';

const EXIT_DIR = { bottom: { x: 0, y: 260 }, top: { x: 0, y: -260 }, left: { x: -320, y: 0 }, right: { x: 320, y: 0 } };

function Pile({ pile, captorPos }) {
  const dir = EXIT_DIR[captorPos] ?? EXIT_DIR.bottom;
  return (
    <div className="relative h-36 w-36 sm:h-44 sm:w-44">
      <AnimatePresence custom={dir}>
        {pile.map((entry, i) => {
          const key = entry.card?.id ?? `down-${i}`;
          const rot = (hash01(key, 1) - 0.5) * 44; // organic, slightly messy stack
          const dx = (hash01(key, 2) - 0.5) * 18;
          const dy = (hash01(key, 3) - 0.5) * 18;
          return (
            <motion.div
              key={key}
              layoutId={entry.card ? `card-${key}` : undefined}
              custom={dir}
              initial={{ opacity: 0, scale: 1.25, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={(d) => ({ opacity: 0, scale: 0.7, x: d.x, y: d.y, transition: { duration: 0.45, ease: 'easeIn' } })}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="absolute left-1/2 top-1/2"
              style={{ zIndex: i, translate: '-50% -50%' }}
            >
              <div style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }}>
                {entry.card ? <CardFace card={entry.card} /> : <CardBack />}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {pile.length > 1 && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white/70">
          {pile.length} cards
        </span>
      )}
    </div>
  );
}

function OpponentSeat({ player, game, pos, isTurn, isPartner }) {
  const count = game.handCounts[player.seat];
  const vertical = pos === 'left' || pos === 'right';
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-col'} items-center gap-2`}>
      <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm transition ${isTurn ? 'bg-gold text-felt-900 shadow-[0_0_18px_rgba(227,184,87,.7)]' : 'bg-black/35'}`}>
        <span className={`h-2 w-2 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-500'}`} title={player.connected ? 'Online' : 'Disconnected'} />
        <span className="max-w-[7rem] truncate font-semibold">{player.name}</span>
        {isPartner && <span className="rounded bg-black/30 px-1 text-[10px] uppercase tracking-wide">partner</span>}
      </div>
      <div className={`flex ${vertical ? 'flex-col -space-y-[3.6rem] sm:-space-y-[4.4rem]' : '-space-x-7 sm:-space-x-9'}`}>
        {Array.from({ length: count }, (_, i) => (
          <CardBack key={i} small />
        ))}
      </div>
    </div>
  );
}

function Hand({ hand, canPlay, onPlay }) {
  return (
    <div className="flex items-end justify-center -space-x-5 pb-3 pt-2 sm:-space-x-4">
      <AnimatePresence>
        {hand.map((card, i) => {
          const mid = (hand.length - 1) / 2;
          return (
            <motion.button
              key={card.id}
              layoutId={`card-${card.id}`}
              disabled={!canPlay}
              onClick={() => onPlay(card.id)}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: Math.abs(i - mid) * 4, opacity: 1, rotate: (i - mid) * 4 }}
              exit={{ opacity: 0 }}
              whileHover={canPlay ? { y: -18, rotate: 0, zIndex: 20 } : undefined}
              whileTap={canPlay ? { scale: 0.95 } : undefined}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className={`relative ${canPlay ? 'cursor-pointer' : 'cursor-default brightness-90'}`}
              style={{ zIndex: i }}
            >
              <CardFace card={card} />
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Scoreboard({ room, game }) {
  const n = game.playerCount;
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {[0, 1].map((t) => {
        const mine = teamOf(room.mySeat) === t;
        const pct = Math.min(100, (game.scores[t] / game.targetScore) * 100);
        return (
          <div key={t} className={`min-w-[8rem] rounded-lg px-3 py-1.5 ${mine ? 'bg-gold/20 ring-1 ring-gold/60' : 'bg-black/30'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="max-w-[7rem] truncate text-xs text-white/70">{teamLabel(t, room.players, n)}</span>
              <span className="text-xl font-bold tabular-nums text-gold">{game.scores[t]}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded bg-white/10">
              <div className="h-full bg-gold transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Table({ room, actions, capture }) {
  const game = room.game;
  const n = game.playerCount;
  const me = room.mySeat;
  const myTurn = game.phase === 'playing' && game.turn === me;
  const byPos = Object.fromEntries(room.players.map((p) => [relPosition(p.seat, me, n), p]));
  const pile = capture ? capture.pile : game.pile;
  const captorPos = capture ? relPosition(capture.seat, me, n) : undefined;
  const turnPlayer = room.players.find((p) => p.seat === game.turn);

  const seat = (pos) =>
    byPos[pos] && (
      <OpponentSeat
        player={byPos[pos]}
        game={game}
        pos={pos}
        isTurn={game.phase === 'playing' && game.turn === byPos[pos].seat}
        isPartner={n === 4 && pos === 'top'}
      />
    );

  return (
    <div className="felt flex h-full flex-col">
      <header className="relative z-10 flex items-center justify-between gap-2 p-2 sm:p-3">
        <button onClick={actions.leave} className="rounded-lg bg-black/30 p-2 hover:bg-black/45" title="Leave game">
          <LogOut className="h-4 w-4" />
        </button>
        <Scoreboard room={room} game={game} />
        <div className="hidden text-right text-xs text-white/60 sm:block">
          <div>Room <span className="font-mono text-gold">{room.code}</span></div>
          <div>Round {game.roundNo} · Deck {game.deckCount}</div>
        </div>
      </header>

      <LayoutGroup>
        <main className="relative z-10 grid flex-1 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] items-center gap-2 px-2 sm:px-6">
          <div className="col-start-2 row-start-1 flex justify-center">{seat('top')}</div>
          <div className="col-start-1 row-start-2 flex justify-center">{seat('left')}</div>
          <div className="col-start-2 row-start-2 flex flex-col items-center justify-center gap-8">
            <Pile pile={pile} captorPos={captorPos} />
          </div>
          <div className="col-start-3 row-start-2 flex justify-center">{seat('right')}</div>
        </main>

        <footer className="relative z-10">
          <div className="mb-1 flex justify-center">
            <span
              className={`rounded-full px-4 py-1 text-sm font-semibold transition ${myTurn ? 'bg-gold text-felt-900 shadow-[0_0_18px_rgba(227,184,87,.7)]' : 'bg-black/35 text-white/70'}`}
            >
              {game.phase !== 'playing' ? 'Round complete' : myTurn ? 'Your turn — play a card' : `Waiting for ${turnPlayer?.name ?? '…'}`}
            </span>
          </div>
          <Hand hand={game.hand} canPlay={myTurn && !capture} onPlay={actions.play} />
          <p className="pb-2 text-center text-xs text-white/60">
            {room.players.find((p) => p.seat === me)?.name} · captured {game.capturedCounts[teamOf(me)]} cards
          </p>
        </footer>
      </LayoutGroup>

      <AnimatePresence>
        {capture?.pisti && (
          <motion.div
            key={capture.id}
            initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
          >
            <span className="text-6xl font-black tracking-wider text-gold drop-shadow-[0_4px_12px_rgba(0,0,0,.7)] sm:text-8xl">
              {capture.pisti === 'jackPisti' ? 'VALE PİŞTİ!' : 'PİŞTİ!'}
            </span>
            <span className="mt-1 text-2xl font-bold text-white drop-shadow">
              {room.players.find((p) => p.seat === capture.seat)?.name} +{capture.pisti === 'jackPisti' ? 20 : 10}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!capture && (game.phase === 'roundOver' || game.phase === 'matchOver') && (
        <RoundSummary room={room} game={game} actions={actions} />
      )}
    </div>
  );
}
