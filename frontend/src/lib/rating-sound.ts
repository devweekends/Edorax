"use client";

import { useBrowserStorage } from "@/lib/use-browser-storage";
import { isSoundEnabled, playFeedback } from "@/lib/sound-feedback";

const SOUND_STORAGE_KEY = "buildment:sound";

/** Reactive hook synced with the platform-wide `buildment:sound` preference. */
export function useRatingSound(): [enabled: boolean, setEnabled: (enabled: boolean) => void] {
  const [stored, setStored] = useBrowserStorage(SOUND_STORAGE_KEY, "on");
  return [stored !== "off", (enabled) => setStored(enabled ? "on" : "off")];
}

/** Soft chime when the mid-course review pop-up opens. */
export function playRatingPromptSound() {
  playFeedback("notification");
}

/** Celebratory cue when the learner submits their review. */
export function playRatingSubmitSound() {
  playFeedback("celebration");
}

const STAR_NOTES_HZ = [523.25, 587.33, 659.25, 783.99, 880.0] as const; // C5, D5, E5, G5, A5

/**
 * Tactile star chime + cheerful two-hop "yip-yip!" chirp synced with Happy Dot
 * when 1–5 stars are selected, or a quiet tick when cleared back to 0 stars.
 */
export function playRatingStarSound(star: number) {
  if (typeof window === "undefined" || !isSoundEnabled()) return;

  if (star < 1) {
    playFeedback("tick");
    return;
  }

  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) {
      playFeedback("check");
      return;
    }

    const context = new AudioContextClass();
    void context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);

    // 1. Warm star bell rising with 1..5 stars
    const clampedIndex = Math.max(0, Math.min(4, star - 1));
    const noteHz = STAR_NOTES_HZ[clampedIndex]!;
    bellNote(context, master, now, noteHz, 0.14, 0.22);
    bellNote(context, master, now + 0.03, noteHz * 1.5, 0.06, 0.18);

    // 2. Happy Dot two-hop "yip-yip!" chirp matching the bounce animation
    chirpYip(context, master, now + 0.05, 560, 880, 0.085, 0.11);
    chirpYip(context, master, now + 0.18, 650, 1040, 0.095, 0.12);

    window.setTimeout(() => void context.close(), 900);
  } catch {
    playFeedback("check");
  }
}

function bellNote(
  context: AudioContext,
  master: GainNode,
  start: number,
  hz: number,
  peak: number,
  duration: number,
) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(hz, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function chirpYip(
  context: AudioContext,
  master: GainNode,
  start: number,
  fromHz: number,
  toHz: number,
  duration: number,
  peak: number,
) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(fromHz, start);
  osc.frequency.exponentialRampToValueAtTime(toHz, start + duration * 0.72);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}
