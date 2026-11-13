// Synthesized sound effects (Web Audio API). Everything is wrapped so a blocked/missing
// AudioContext never breaks the game.
let ctx = null;
let tone = null;
let toneTimer = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from a user gesture (pointerdown) so mobile browsers allow audio later. */
export function unlockAudio() {
  try { ac(); } catch { /* audio unavailable */ }
}

/** Rising-pitch tension tone. Call repeatedly with the charge level; it fades out on its own if updates stop. */
export function chargeTone(level) {
  try {
    const c = ac();
    if (!tone) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      g.gain.value = 0;
      o.connect(g).connect(c.destination);
      o.start();
      tone = { o, g };
    }
    const t = c.currentTime;
    tone.o.frequency.setTargetAtTime(110 + level * 560, t, 0.05);
    tone.g.gain.setTargetAtTime(0.02 + level * 0.07, t, 0.05);
    clearTimeout(toneTimer);
    toneTimer = setTimeout(stopTone, 350);
  } catch { /* audio unavailable */ }
}

export function stopTone() {
  clearTimeout(toneTimer);
  if (!tone || !ctx) return;
  const { o, g } = tone;
  tone = null;
  try {
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => { try { o.stop(); } catch { /* already stopped */ } }, 200);
  } catch { /* ignore */ }
}

/** Impact "thwack + boom". Volume, bass and length scale with level in [0,1]. */
export function slamSound(level) {
  try {
    const c = ac();
    stopTone();
    const t = c.currentTime;
    const vol = 0.28 + 0.62 * level;

    // Thwack: short band-passed noise burst.
    const len = Math.floor(c.sampleRate * 0.3);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * (0.035 + 0.05 * level)));
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + 1200 * (1 - level);
    bp.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.value = vol;
    noise.connect(bp).connect(ng).connect(c.destination);
    noise.start(t);

    // Boom: sine sweeping down, deeper and longer with charge.
    const o = c.createOscillator();
    const og = c.createGain();
    const dur = 0.3 + 0.45 * level;
    o.type = 'sine';
    o.frequency.setValueAtTime(170 - 40 * level, t);
    o.frequency.exponentialRampToValueAtTime(38, t + dur);
    og.gain.setValueAtTime(vol * (0.5 + 0.7 * level), t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}
