import { Headphones, HeadphoneOff, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react';

/** Floating voice controls: join, mute mic, deafen, leave. */
export default function VoiceBar({ voice }) {
  const btn = (active) =>
    `flex h-10 w-10 items-center justify-center rounded-full transition ${active ? 'bg-red-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`;

  return (
    <div className="fixed bottom-3 left-2 z-50 flex flex-col items-start gap-2 sm:left-4">
      {voice.error && (
        <p className="max-w-[14rem] rounded-lg bg-red-900/90 px-3 py-1.5 text-xs shadow">{voice.error}</p>
      )}
      <div className="panel flex flex-col items-center gap-1.5 rounded-full p-1.5 sm:flex-row">
        {!voice.joined ? (
          <button
            onClick={voice.join}
            disabled={voice.busy}
            className="flex h-10 items-center gap-2 rounded-full bg-green-700 px-3 text-sm font-semibold hover:bg-green-600 disabled:opacity-60"
            title="Join voice chat"
          >
            {voice.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            <span className="hidden sm:inline">Join voice</span>
          </button>
        ) : (
          <>
            <button onClick={voice.toggleMute} className={btn(voice.muted || voice.deafened)} title={voice.muted ? 'Unmute' : 'Mute'} aria-pressed={voice.muted}>
              {voice.muted || voice.deafened ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button onClick={voice.toggleDeafen} className={btn(voice.deafened)} title={voice.deafened ? 'Undeafen' : 'Deafen'} aria-pressed={voice.deafened}>
              {voice.deafened ? <HeadphoneOff className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
            </button>
            <button onClick={voice.leave} className={btn(false)} title="Leave voice chat">
              <PhoneOff className="h-5 w-5" />
            </button>
            <span className="px-1 text-xs tabular-nums text-white/60" title="Players in voice">{voice.peers}</span>
          </>
        )}
      </div>
    </div>
  );
}
