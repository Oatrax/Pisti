import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useAnimationControls } from 'framer-motion';
import { Eye, HandMetal, LogOut } from 'lucide-react';
import { CardBack, CardFace } from './Card.jsx';
import RoundSummary from './RoundSummary.jsx';
import Avatar from './Avatar.jsx';
import { hash01, relPosition, teamLabel, teamOf } from '../util.js';
import { chargeTone, slamSound, stopTone, unlockAudio } from '../sound.js';

const CHARGE_MS = 1500; // hold time for a full charge

/** How long the slam drop takes: harder slams are faster. Impact lands at this time. */
const slamDuration = (charge) => 0.34 - 0.16 * charge;

const EXIT_DIR = { bottom: { x: 0, y: 260 }, top: { x: 0, y: -260 }, left: { x: -320, y: 0 }, right: { x: 320, y: 0 } };

/**
 * Pişti card waiting on the table, face-down. While charging it vibrates, glows and grows.
 * The owner holds the pointer on it; everyone else sees the relayed charge level.
 */
function PrimedCard({ mine, remoteLevel, onCharge, onSlam }) {
  const [local, setLocal] = useState(0);
  const hold = useRef(null);
  const level = mine ? local : remoteLevel;

  const levelNow = () => Math.min(1, (performance.now() - hold.current.t0) / CHARGE_MS);
  const stop = () => { if (hold.current) { clearInterval(hold.current.id); hold.current = null; } };

  const down = (e) => {
    if (!mine || hold.current) return;
    e.preventDefault(); // no text selection / long-press menu while holding
    unlockAudio();
    navigator.vibrate?.(10);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    const state = { t0: performance.now(), sent: 0, id: 0 };
    state.id = setInterval(() => {
      const l = levelNow();
      setLocal(l);
      if (performance.now() - state.sent >= 80) { state.sent = performance.now(); onCharge(l); }
    }, 30);
    hold.current = state;
  };
  const up = () => {
    if (!hold.current) return;
    const l = levelNow();
    stop();
    onSlam(l);
  };

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (level > 0) chargeTone(level); }, [level]);
  useEffect(() => () => stopTone(), []);

  const amp = level * 2.6;
  return (
    <motion.div
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      animate={{
        scale: 1 + level * 0.24,
        x: level > 0 ? [0, -amp, amp, -amp, amp, 0] : 0,
        filter: `drop-shadow(0 0 ${8 + level * 26}px rgba(227,184,87,${0.35 + level * 0.65}))`,
      }}
      transition={{
        scale: { type: 'spring', stiffness: 300, damping: 20 },
        x: { repeat: Infinity, duration: 0.09 },
        filter: { duration: 0.12 },
      }}
      className={mine ? 'cursor-pointer touch-none select-none p-4 -m-4' : ''}
      style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
    >
      <motion.div animate={level === 0 ? { y: [0, -4, 0] } : { y: 0 }} transition={{ repeat: Infinity, duration: 1.2 }}>
        <CardBack />
      </motion.div>
    </motion.div>
  );
}

/** The released card: flips face-up and slams down. Harder charge = bigger, faster, higher drop. */
function SlamCard({ card, charge }) {
  const d = slamDuration(charge);
  const startScale = 1.35 + charge * 0.9;
  return (
    <motion.div
      initial={{ y: -(70 + charge * 170), scale: startScale }}
      animate={{ y: [null, 0, 0], scale: [null, 0.9, 1] }}
      transition={{ duration: d + 0.12, times: [0, d / (d + 0.12), 1], ease: ['easeIn', 'easeOut'] }}
    >
      <div style={{ perspective: 700 }}>
        <motion.div
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ duration: d * 0.7 }}
          style={{ transformStyle: 'preserve-3d' }}
          className="relative"
        >
          <div style={{ backfaceVisibility: 'hidden' }}><CardFace card={card} /></div>
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}><CardBack /></div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Particle burst + shockwave ring at the moment of impact. */
function Burst({ charge, delay }) {
  const n = 10 + Math.round(charge * 22);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30">
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1.5 + charge * 2.2, opacity: [0, 0.7, 0] }}
        transition={{ delay, duration: 0.55 + charge * 0.2, ease: 'easeOut' }}
        className="absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-gold/80"
      />
      {Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2 + hash01('p' + i, 9) * 0.6;
        const dist = (50 + hash01('d' + i, 5) * 70) * (0.7 + charge * 1.3);
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
            animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: [0, 1, 0], scale: [1, 1, 0.2] }}
            transition={{ delay, duration: 0.5 + hash01('t' + i, 3) * 0.4, ease: 'easeOut' }}
            className={`absolute h-2 w-2 rounded-full ${i % 3 === 0 ? 'bg-white' : 'bg-gold'}`}
          />
        );
      })}
    </div>
  );
}

function Pile({ pile, captorPos, primedProps, burst }) {
  const dir = EXIT_DIR[captorPos] ?? EXIT_DIR.bottom;
  return (
    <div className="relative h-36 w-36 sm:h-44 sm:w-44">
      <AnimatePresence custom={dir}>
        {pile.map((entry, i) => {
          const special = entry.primed || entry.slam;
          const key = special ? 'primed' : entry.card?.id ?? `down-${i}`;
          // A lone card sits (almost) straight; with 2+ cards every card is clearly turned and
          // shifted, so 1 vs many is obvious at a glance without reading a counter.
          const solo = pile.length === 1;
          const side = hash01(key, 1) < 0.5 ? -1 : 1;
          const rot = solo ? (hash01(key, 4) - 0.5) * 6 : side * (8 + hash01(key, 2) * 20);
          const dx = solo ? 0 : (hash01(key, 5) < 0.5 ? -1 : 1) * (6 + hash01(key, 3) * 10);
          const dy = solo ? 0 : (hash01(key, 6) - 0.5) * 18;
          return (
            <motion.div
              key={key}
              layoutId={entry.card && !special ? `card-${key}` : undefined}
              custom={dir}
              initial={{ opacity: 0, scale: 1.25, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={(d) => ({ opacity: 0, scale: 0.7, x: d.x, y: d.y, transition: { duration: 0.45, ease: 'easeIn' } })}
              transition={{ type: 'spring', stiffness: 300, damping: 26, delay: entry.card ? 0 : i * 0.15 }}
              className="absolute left-1/2 top-1/2"
              style={{ zIndex: i, translate: '-50% -50%' }}
            >
              <motion.div initial={false} animate={{ x: dx, y: dy, rotate: rot }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}>
                {entry.primed ? (
                  <PrimedCard {...primedProps} />
                ) : entry.slam ? (
                  <SlamCard card={entry.card} charge={burst.charge} />
                ) : entry.card ? (
                  <CardFace card={entry.card} />
                ) : (
                  <CardBack />
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {burst && <Burst charge={burst.charge} delay={slamDuration(burst.charge)} />}
      {pile.length > 1 && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5 text-xs text-white/70">
          {pile.length} cards
        </span>
      )}
    </div>
  );
}

const DEAL_FROM = { top: { x: 0, y: 220 }, left: { x: 260, y: 0 }, right: { x: -260, y: 0 } };

function OpponentSeat({ player, game, pos, isTurn, isPartner, dealKey, speaking, inVoice }) {
  const count = game.handCounts[player.seat];
  const vertical = pos === 'left' || pos === 'right';
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-col'} items-center gap-2`}>
      <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm transition ${isTurn ? 'bg-gold text-felt-900 shadow-[0_0_18px_rgba(227,184,87,.7)]' : 'bg-black/35'}`}>
        <Avatar name={player.name} seat={player.seat} bot={player.bot} size="sm" speaking={speaking} inVoice={inVoice} connected={player.connected} />
        <span className="max-w-[7rem] truncate font-semibold">{player.name}</span>
        {isPartner && <span className="rounded bg-black/30 px-1 text-[10px] uppercase tracking-wide">partner</span>}
      </div>
      <div className={`flex ${vertical ? 'flex-col -space-y-[3.6rem] sm:-space-y-[4.4rem]' : '-space-x-7 sm:-space-x-9'}`}>
        {Array.from({ length: count }, (_, i) => (
          <motion.div
            key={`${dealKey}-${i}`}
            initial={{ ...DEAL_FROM[pos], opacity: 0, scale: 0.6 }}
            animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.5 + i * 0.12 }}
          >
            <CardBack small />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Deck({ count, dealKey }) {
  const layers = Math.min(4, Math.ceil(count / 8));
  return (
    <div className="absolute left-2 top-14 z-20 flex flex-col items-center gap-1 sm:left-4" title="Cards left in the deck">
      <div className="relative" style={{ width: '3.6rem', height: '5.04rem' }}>
        {count === 0 ? (
          <div className="h-full w-full rounded-lg border-2 border-dashed border-white/25" />
        ) : (
          Array.from({ length: layers }, (_, i) => (
            <div key={i} className="absolute" style={{ left: i * 1.5, top: -i * 1.5 }}>
              <CardBack small />
            </div>
          ))
        )}
      </div>
      <motion.span
        key={dealKey}
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        className="rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold tabular-nums"
      >
        {count === 0 ? 'Deck empty' : `${count} left`}
      </motion.span>
    </div>
  );
}

/** Freshly dealt, face-down hand: click to pick it up. */
function DealtStack({ count, onPickUp }) {
  return (
    <div className="flex flex-col items-center pb-3 pt-2">
      <motion.button
        onClick={onPickUp}
        whileHover={{ y: -6 }}
        whileTap={{ scale: 0.96 }}
        className="relative cursor-pointer"
        style={{ width: '6.4rem', height: '7.6rem' }}
        aria-label="Pick up your cards"
      >
        {Array.from({ length: count }, (_, i) => (
          <motion.div
            key={i}
            initial={{ x: -140, y: -260, opacity: 0, rotate: -30 }}
            animate={{ x: i * 3, y: -i * 2, opacity: 1, rotate: (i - 1.5) * 3 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.4 + i * 0.12 }}
            className="absolute left-4 top-3"
          >
            <CardBack />
          </motion.div>
        ))}
      </motion.button>
      <motion.span
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-gold"
      >
        <HandMetal className="h-4 w-4" /> Tap to pick up your cards
      </motion.span>
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
              initial={{ y: -40, scale: 0.7, opacity: 0, rotate: 0 }}
              animate={{ scale: 1, y: Math.abs(i - mid) * 4, opacity: 1, rotate: (i - mid) * 4 }}
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

export default function Table({ room, actions, capture, charging, speaking = {} }) {
  const game = room.game;
  const n = game.playerCount;
  const me = room.mySeat;
  // A deal is identified by round + deck size (the deck only shrinks when cards are dealt).
  const dealKey = `${game.roundNo}-${game.deckCount}`;
  const [pickedKey, setPickedKey] = useState(null);
  const [peek, setPeek] = useState(false);
  // Mid-hand (fewer than 4 cards, e.g. after a reconnect) there is nothing left to pick up.
  const held = pickedKey === dealKey || game.hand.length < 4;
  const primed = game.primed;
  const myTurn = game.phase === 'playing' && game.turn === me && held && !primed;
  const shake = useAnimationControls();
  const byPos = Object.fromEntries(room.players.map((p) => [relPosition(p.seat, me, n), p]));
  const slamming = capture?.pisti ? capture : null;
  const pile = capture ? capture.pile : primed ? [...game.pile, { primed: true }] : game.pile;
  const primedProps = {
    mine: primed?.seat === me,
    remoteLevel: primed && charging && charging.seat === primed.seat ? charging.level : 0,
    onCharge: actions.charge,
    onSlam: actions.slam,
  };

  // Impact: sound + screen shake, in sync with the moment the card lands.
  useEffect(() => {
    if (!slamming) return;
    const c = slamming.charge ?? 0;
    const timer = setTimeout(() => {
      slamSound(c);
      navigator.vibrate?.(30 + Math.round(120 * c));
      const a = 3 + 17 * c;
      shake.start({
        x: [0, -a, a, -a * 0.7, a * 0.5, -a * 0.25, 0],
        y: [0, a * 0.6, -a * 0.6, a * 0.3, -a * 0.15, 0, 0],
        transition: { duration: 0.4 + 0.3 * c },
      });
    }, slamDuration(c) * 1000);
    return () => clearTimeout(timer);
  }, [slamming?.id]); // eslint-disable-line react-hooks/exhaustive-deps
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
        dealKey={dealKey}
        speaking={!!speaking[byPos[pos].seat]}
        inVoice={!!room.voice?.[byPos[pos].seat]}
      />
    );

  return (
    <motion.div animate={shake} className="felt flex h-full flex-col">
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

      <Deck count={game.deckCount} dealKey={dealKey} />
      {game.seenFaceDown.length > 0 && (
        <div className="absolute right-2 top-14 z-20 flex flex-col items-end gap-2 sm:right-4">
          <button
            onClick={() => setPeek((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs hover:bg-black/60"
          >
            <Eye className="h-4 w-4 text-gold" /> {peek ? 'Hide' : 'Peek'} set-aside cards ({game.seenFaceDown.length})
          </button>
          {peek && (
            <div className="panel p-3">
              <p className="mb-2 text-center text-xs text-white/60">Face-down cards you took — out of play this round</p>
              <div className="flex gap-1.5">
                {game.seenFaceDown.map((c) => <CardFace key={c.id} card={c} small />)}
              </div>
            </div>
          )}
        </div>
      )}
      <LayoutGroup>
        <main className="relative z-10 grid flex-1 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] items-center gap-2 px-2 sm:px-6">
          <div className="col-start-2 row-start-1 flex justify-center">{seat('top')}</div>
          <div className="col-start-1 row-start-2 flex justify-center">{seat('left')}</div>
          <div className="col-start-2 row-start-2 flex flex-col items-center justify-center gap-8">
            <Pile pile={pile} captorPos={captorPos} primedProps={primedProps} burst={slamming} />
          </div>
          <div className="col-start-3 row-start-2 flex justify-center">{seat('right')}</div>
        </main>

        <footer className="relative z-10">
          <div className="mb-1 flex justify-center">
            <span
              className={`rounded-full px-4 py-1 text-sm font-semibold transition ${myTurn ? 'bg-gold text-felt-900 shadow-[0_0_18px_rgba(227,184,87,.7)]' : 'bg-black/35 text-white/70'}`}
            >
              {game.phase !== 'playing' ? 'Round complete' : primed ? (primed.seat === me ? 'PİŞTİ! Hold the card, release to slam' : `${room.players.find((p) => p.seat === primed.seat)?.name} is charging a pişti…`) : !held ? 'Pick up your cards' : myTurn ? 'Your turn — play a card' : turnPlayer && !turnPlayer.connected ? `${turnPlayer.name} disconnected — waiting for them to return…` : `Waiting for ${turnPlayer?.name ?? '…'}`}
            </span>
          </div>
          {held ? (
            <Hand hand={game.hand} canPlay={myTurn && !capture} onPlay={actions.play} />
          ) : (
            <DealtStack key={dealKey} count={game.hand.length} onPickUp={() => setPickedKey(dealKey)} />
          )}
          <div className="flex items-center justify-center gap-2 pb-2 text-xs text-white/60">
            <Avatar name={room.players.find((p) => p.seat === me)?.name} seat={me} size="sm" speaking={!!speaking[me]} inVoice={!!room.voice?.[me]} />
            <span>{room.players.find((p) => p.seat === me)?.name} · captured {game.capturedCounts[teamOf(me)]} cards</span>
          </div>
        </footer>
      </LayoutGroup>

      <AnimatePresence>
        {capture?.pisti && (
          <motion.div
            key={capture.id}
            initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: slamDuration(capture.charge ?? 0) }}
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
    </motion.div>
  );
}
