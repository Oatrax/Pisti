import { AnimatePresence, motion } from 'framer-motion';
import { Bot } from 'lucide-react';

const COLORS = ['bg-crimson', 'bg-sky-700', 'bg-amber-700', 'bg-violet-700'];

/** Round initial avatar. A green ring pulses around it while that player is speaking. */
export default function Avatar({ name, seat, speaking = false, inVoice = false, connected = true, bot = false, size = 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-base';
  return (
    <div className={`relative shrink-0 ${dim}`}>
      <AnimatePresence>
        {speaking && (
          <motion.span
            key="ring"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: [1, 1.12, 1] }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ scale: { repeat: Infinity, duration: 0.9 }, opacity: { duration: 0.15 } }}
            className="absolute -inset-[3px] rounded-full ring-[3px] ring-green-400 shadow-[0_0_14px_3px_rgba(74,222,128,.65)]"
          />
        )}
      </AnimatePresence>
      <div className={`relative flex h-full w-full items-center justify-center rounded-full font-bold uppercase text-white shadow ${COLORS[seat % 4]}`}>
        {bot ? <Bot className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} /> : name?.[0] ?? '?'}
      </div>
      {(!connected || inVoice) && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black/50 ${connected ? 'bg-green-400' : 'bg-red-500'}`}
          title={connected ? 'In voice chat' : 'Disconnected'}
        />
      )}
    </div>
  );
}
