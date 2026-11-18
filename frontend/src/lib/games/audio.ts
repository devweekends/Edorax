"use client";

// Sound effects for the daily games, made with the Web Audio API so there are no files to load.
// They follow the app's one sound switch (isSoundEnabled), which is already off for people who ask
// their system for reduced motion. Nothing plays before the learner has interacted with the page.

import { isSoundEnabled, setSoundEnabled } from "@/lib/sound-feedback";

type Wave = OscillatorType;

let context: AudioContext | null = null;
const lastPlayed = new Map<string, number>();

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !isSoundEnabled()) return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Skip a sound that would repeat inside `gap` milliseconds, so held keys do not machine-gun. */
function throttled(name: string, gap: number): boolean {
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < gap) return true;
  lastPlayed.set(name, now);
  return false;
}

function tone(ctx: AudioContext, opts: { freq: number; to?: number; start?: number; length: number; wave?: Wave; gain?: number }) {
  const start = ctx.currentTime + (opts.start ?? 0);
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = opts.wave ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + opts.length);
  const peak = opts.gain ?? 0.16;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + opts.length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + opts.length + 0.05);
}

function noise(ctx: AudioContext, opts: { start?: number; length: number; from: number; to: number; gain?: number }) {
  const start = ctx.currentTime + (opts.start ?? 0);
  const frames = Math.max(1, Math.floor(ctx.sampleRate * opts.length));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(opts.from, start);
  filter.frequency.exponentialRampToValueAtTime(opts.to, start + opts.length);
  const amp = ctx.createGain();
  const peak = opts.gain ?? 0.12;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + opts.length);
  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(start);
}

const NOTE = { c5: 523.25, d5: 587.33, e5: 659.25, g5: 783.99, a5: 880, b5: 987.77, c6: 1046.5, e6: 1318.5, g6: 1568 };

/** Every effect a game may play. Each returns quietly when sound is off. */
export const gameSounds = {
  /** A key press in a terminal. */
  key() {
    const ctx = audio();
    if (!ctx || throttled("key", 35)) return;
    tone(ctx, { freq: 1500 + Math.random() * 400, length: 0.025, wave: "square", gain: 0.035 });
  },
  /** A command sent. */
  enter() {
    const ctx = audio();
    if (!ctx || throttled("enter", 60)) return;
    tone(ctx, { freq: 420, to: 300, length: 0.07, wave: "triangle", gain: 0.1 });
  },
  /** A small step forward: a clue found, a piece placed. */
  ok() {
    const ctx = audio();
    if (!ctx || throttled("ok", 80)) return;
    tone(ctx, { freq: NOTE.e5, length: 0.12, gain: 0.12 });
    tone(ctx, { freq: NOTE.a5, start: 0.08, length: 0.16, gain: 0.12 });
  },
  /** A mistake. */
  error() {
    const ctx = audio();
    if (!ctx || throttled("error", 120)) return;
    tone(ctx, { freq: 170, to: 110, length: 0.22, wave: "sawtooth", gain: 0.1 });
  },
  /** A piece snaps into place. */
  snap() {
    const ctx = audio();
    if (!ctx || throttled("snap", 50)) return;
    noise(ctx, { length: 0.05, from: 1800, to: 900, gain: 0.09 });
    tone(ctx, { freq: 640, to: 520, length: 0.06, wave: "triangle", gain: 0.08 });
  },
  /** A pickup, such as a counter ticking up. */
  coin() {
    const ctx = audio();
    if (!ctx || throttled("coin", 60)) return;
    tone(ctx, { freq: NOTE.b5, length: 0.07, wave: "square", gain: 0.06 });
    tone(ctx, { freq: NOTE.e6, start: 0.07, length: 0.2, wave: "square", gain: 0.06 });
  },
  /** Traffic or a command moving fast. */
  whoosh() {
    const ctx = audio();
    if (!ctx) return;
    noise(ctx, { length: 0.4, from: 300, to: 3200, gain: 0.1 });
  },
  /** A system is in trouble. */
  alarm() {
    const ctx = audio();
    if (!ctx || throttled("alarm", 400)) return;
    for (let i = 0; i < 3; i++) tone(ctx, { freq: i % 2 ? 620 : 880, start: i * 0.14, length: 0.12, wave: "square", gain: 0.07 });
  },
  /** A run is starting. */
  boot() {
    const ctx = audio();
    if (!ctx) return;
    tone(ctx, { freq: 220, to: 880, length: 0.35, wave: "triangle", gain: 0.09 });
  },
  /** A round solved. More stars play a longer, brighter run of notes. */
  win(stars: number) {
    const ctx = audio();
    if (!ctx) return;
    const run = [NOTE.c5, NOTE.e5, NOTE.g5, NOTE.c6, NOTE.e6, NOTE.g6].slice(0, 3 + Math.max(1, Math.min(3, stars)));
    run.forEach((freq, i) => tone(ctx, { freq, start: i * 0.09, length: 0.28, wave: "triangle", gain: 0.13 }));
    noise(ctx, { start: 0.05, length: 0.5, from: 4000, to: 9000, gain: 0.04 });
  },
  /** A whole set of three rounds finished. */
  fanfare() {
    const ctx = audio();
    if (!ctx) return;
    [NOTE.c5, NOTE.c5, NOTE.c5, NOTE.g5, NOTE.e5, NOTE.g5, NOTE.c6].forEach((freq, i) =>
      tone(ctx, { freq, start: i * 0.11, length: i === 6 ? 0.6 : 0.16, wave: "square", gain: 0.07 }),
    );
  },
  /** A round not solved yet. Gentle, so trying again feels fine. */
  lose() {
    const ctx = audio();
    if (!ctx) return;
    [NOTE.g5, NOTE.e5, NOTE.c5].forEach((freq, i) => tone(ctx, { freq: freq / 2, start: i * 0.14, length: 0.22, wave: "sine", gain: 0.12 }));
  },
};

export type GameSounds = typeof gameSounds;

export { isSoundEnabled, setSoundEnabled };
