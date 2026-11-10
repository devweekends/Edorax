let context: AudioContext | null = null;

/** A short rising chime for podium finishes. Silent when audio is unavailable. */
export function playCelebration(): void {
  try {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * 0.12;
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
  } catch {
    // Audio is optional; the confetti still plays.
  }
}
