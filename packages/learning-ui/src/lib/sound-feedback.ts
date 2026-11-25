"use client";

/** Semantic feedback events — blocks choose the event, not the asset path. */
export type FeedbackKind =
  | "tick"
  | "check"
  | "submit"
  | "notification"
  | "success"
  | "celebration"
  | "completion"
  | "error";

/** @deprecated Use FeedbackKind via playFeedbackSound mapping. */
export type FeedbackSound = "success" | "failure" | "completion" | "partypop";

/**
 * One-line swap per sound: point any kind at a file under public/sounds/.
 * Missing files or blocked playback fall back to Web Audio synthesis.
 */
export const FEEDBACK_AUDIO: Record<FeedbackKind, string | null> = {
  tick: "/sounds/tick.wav",
  check: "/sounds/check.wav",
  submit: "/sounds/submit.wav",
  notification: "/sounds/notification.wav",
  success: "/sounds/success.wav",
  celebration: "/sounds/celebration.wav",
  completion: "/sounds/completion.wav",
  error: "/sounds/error.wav",
};

/** Hosts can supply bundled asset URLs (including Electron file:// builds). */
export function configureFeedbackAudio(assets: Partial<Record<FeedbackKind, string>>) {
  Object.assign(FEEDBACK_AUDIO, assets);
}

const LEGACY_SOUND_MAP: Record<FeedbackSound, FeedbackKind> = {
  success: "success",
  partypop: "success",
  failure: "error",
  completion: "completion",
};

let lastPlay: { kind: FeedbackKind; at: number } | null = null;
const DEDUPE_MS = 160;

/**
 * Learner gesture feedback. Synthesized by default; optional local files in
 * FEEDBACK_AUDIO. Opt out with localStorage `buildment:sound=off`. Reduced motion is about
 * animation, so it turns off confetti but not sound.
 */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem("buildment:sound") !== "off"; } catch { return true; }
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("buildment:sound", enabled ? "on" : "off"); } catch { /* Storage is optional. */ }
}

export function playFeedback(kind: FeedbackKind) {
  if (typeof window === "undefined" || !isSoundEnabled()) return;

  const now = Date.now();
  if (lastPlay?.kind === kind && now - lastPlay.at < DEDUPE_MS) return;
  lastPlay = { kind, at: now };

  const fileUrl = FEEDBACK_AUDIO[kind];
  if (fileUrl) {
    try {
      const audio = new Audio(fileUrl);
      audio.volume = volumeFor(kind);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => playSynthesizedFeedback(kind));
        return;
      }
    } catch {
      // fall through
    }
  }

  playSynthesizedFeedback(kind);
}

/** Backward-compatible entry for existing call sites. */
export function playFeedbackSound(effect: FeedbackSound) {
  playFeedback(LEGACY_SOUND_MAP[effect]);
}

function volumeFor(kind: FeedbackKind): number {
  switch (kind) {
    case "tick":
      return 0.11;
    case "check":
      return 0.13;
    case "submit":
    case "notification":
      return 0.14;
    case "error":
      return 0.16;
    case "success":
      return 0.15;
    case "celebration":
      return 0.17;
    case "completion":
      return 0.19;
    default:
      return 0.14;
  }
}

function playSynthesizedFeedback(kind: FeedbackKind) {
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    void context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = volumeFor(kind);
    master.connect(context.destination);

    if (kind === "tick") {
      tactileClick(context, master, now, { peak: 0.04, length: 0.022 });
    } else if (kind === "check") {
      tactileClick(context, master, now, { peak: 0.045, length: 0.028 });
    } else if (kind === "submit" || kind === "notification") {
      tactileClick(context, master, now, { peak: 0.042, length: 0.032, hz: 520 });
    } else if (kind === "error") {
      tone(context, master, now, { hz: 220, at: 0, length: 0.08, type: "sine", peak: 0.03 });
    } else if (kind === "success") {
      tactileClick(context, master, now, { peak: 0.048, length: 0.035, hz: 640 });
    } else if (kind === "celebration") {
      tactileClick(context, master, now, { peak: 0.05, length: 0.04, hz: 580 });
      tone(context, master, now, { hz: 720, at: 0.025, length: 0.05, type: "sine", peak: 0.028 });
    } else if (kind === "completion") {
      tactileClick(context, master, now, { peak: 0.052, length: 0.045, hz: 600 });
      tone(context, master, now, { hz: 760, at: 0.03, length: 0.06, type: "sine", peak: 0.03 });
    }

    window.setTimeout(() => void context.close(), 1_500);
  } catch {
    // Sound is enhancement only.
  }
}

function tactileClick(
  context: AudioContext,
  master: GainNode,
  now: number,
  opts: { peak: number; length: number; hz?: number },
) {
  const hz = opts.hz ?? 740;
  const noise = context.createBufferSource();
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * opts.length), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
  }
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = hz;
  filter.Q.value = 1.2;
  const gain = context.createGain();
  gain.gain.setValueAtTime(opts.peak, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.length);
  noise.connect(filter).connect(gain).connect(master);
  noise.start(now);
  noise.stop(now + opts.length + 0.01);
}

function tone(
  context: AudioContext,
  master: GainNode,
  now: number,
  opts: { hz: number; at: number; length: number; type: OscillatorType; peak: number; shimmer?: boolean },
) {
  const start = now + opts.at;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = opts.type;
  oscillator.frequency.setValueAtTime(opts.hz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(opts.peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + opts.length);
  oscillator.connect(gain).connect(master);
  oscillator.start(start);
  oscillator.stop(start + opts.length + 0.02);

  if (opts.shimmer) {
    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(opts.hz * 2, start + 0.02);
    shimmerGain.gain.setValueAtTime(0.0001, start + 0.02);
    shimmerGain.gain.exponentialRampToValueAtTime(opts.peak * 0.35, start + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, start + opts.length);
    shimmer.connect(shimmerGain).connect(master);
    shimmer.start(start + 0.02);
    shimmer.stop(start + opts.length + 0.02);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
