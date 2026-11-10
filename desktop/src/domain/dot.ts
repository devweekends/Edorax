export const DOT_TIPS = [
  'Short sessions beat long ones. Ten focused minutes a day keeps a streak alive.',
  'Skim a chapter goal first, then work through its blocks in order.',
  'Retry a checkpoint after a wrong answer. That is how the concept sticks.',
  'Pick a weekly goal you can finish. Small wins keep you coming back.',
  'Try a lab before the next quiz. Practice on a real project makes the idea stick.',
  'When a mentor replies, read it the same day. Their notes often save you time later.',
];

/** One tip per day, so the card changes daily without any server call. */
export function dotTipIndex(now = Date.now()): number {
  return Math.floor(now / 86_400_000) % DOT_TIPS.length;
}
