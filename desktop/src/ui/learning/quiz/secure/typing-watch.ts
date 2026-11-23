import { SECURE_LIMITS } from '../../../../../../server/src/shared/api/integrity';

// Typed text arrives a few characters at a time. A big chunk in one step, or a sustained
// speed no hand reaches, is worth a note for the mentor. It is only a note: dictation tools,
// autocomplete and assistive technology also insert text quickly.

export type TypingFinding = { reason: 'chunk' | 'speed'; chars: number; ms: number };

const WINDOW_MS = 5_000;
const COOLDOWN_MS = 10_000;

export class TypingWatch {
  private samples: Array<{ at: number; chars: number }> = [];
  private lastReport = -Infinity;

  /** Feed each insertion (characters added at time `now` in ms). Returns a finding at most once per cooldown. */
  feed(chars: number, now: number): TypingFinding | null {
    if (chars <= 0) return null;
    this.samples = this.samples.filter((sample) => now - sample.at <= WINDOW_MS);
    this.samples.push({ at: now, chars });
    if (now - this.lastReport < COOLDOWN_MS) return null;

    if (chars >= SECURE_LIMITS.typingBurstChars) {
      this.lastReport = now;
      return { reason: 'chunk', chars, ms: 0 };
    }
    const total = this.samples.reduce((sum, sample) => sum + sample.chars, 0);
    const first = this.samples[0]!.at;
    // At least a second of span, so two quick keystrokes never look like a rate.
    const ms = Math.max(1_000, now - first);
    if (
      total >= SECURE_LIMITS.typingBurstChars &&
      total / (ms / 1000) > SECURE_LIMITS.typingMaxCharsPerSecond
    ) {
      this.lastReport = now;
      return { reason: 'speed', chars: total, ms };
    }
    return null;
  }
}
