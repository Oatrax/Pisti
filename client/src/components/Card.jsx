import { SUIT, isRed } from '../util.js';

const base = 'playing-card relative select-none rounded-[9%] shadow-[0_2px_6px_rgba(0,0,0,.45),0_1px_1px_rgba(0,0,0,.3)]';

/** Face-up card. Sizes scale with the card width via container query units. */
export function CardFace({ card, small, className = '' }) {
  const color = isRed(card.suit) ? 'text-[#b3202f]' : 'text-[#16181d]';
  const suit = SUIT[card.suit];
  const corner = (flip) => (
    <div className={`absolute ${flip ? 'bottom-[5%] right-[7%] rotate-180' : 'top-[5%] left-[7%]'} flex flex-col items-center leading-none`}>
      <span className="font-bold text-[24cqw] tracking-tighter">{card.rank}</span>
      <span className="text-[22cqw] -mt-[2cqw]">{suit}</span>
    </div>
  );
  return (
    <div
      className={`${base} ${small ? 'card-sm' : ''} bg-[#fbf7ec] border border-black/15 ${color} ${className}`}
      style={{ containerType: 'inline-size' }}
    >
      {corner(false)}
      {corner(true)}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${['J', 'Q', 'K'].includes(card.rank) ? 'text-[62cqw]' : 'text-[58cqw]'} leading-none`}>{suit}</span>
      </div>
    </div>
  );
}

/** Crimson card back with a lattice pattern. */
export function CardBack({ small, className = '' }) {
  return (
    <div
      className={`${base} ${small ? 'card-sm' : ''} border border-black/30 bg-[#fbf7ec] p-[6%] ${className}`}
    >
      <div
        className="h-full w-full rounded-[6%] border border-[#e3b857]/60"
        style={{
          backgroundColor: '#8c1d2c',
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(227,184,87,.28) 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, rgba(227,184,87,.28) 0 1px, transparent 1px 7px)',
        }}
      />
    </div>
  );
}
