import { wrapBalanced } from "../renderers/scene/geometry";

// A sorting game as a pure model: cards come one at a time and each belongs
// in exactly one bucket. A right answer moves to the next card; a wrong one
// keeps the card, gives a short reason, and marks the card as missed.
// No React here, so the rules are tested on their own.

export type SortBucket = {
  id: string;
  /** The bucket's name, for example "Functional". Keep it under about 15 characters. */
  label: string;
  /** A short gloss under the name, for example "what it does". */
  sub: string;
};

export type SortCard = {
  id: string;
  /** The card's text. About 60 characters or fewer reads well on a phone. */
  text: string;
  /** The id of the bucket the card belongs in. */
  answer: string;
  /** One short reason per wrong bucket, keyed by bucket id. */
  why: Record<string, string>;
};

export type SortState = {
  /** Card ids in the order they are dealt. */
  order: string[];
  /** Index into `order` of the card on top; equals `order.length` when done. */
  index: number;
  /** Card ids that went into each bucket, keyed by bucket id. */
  placed: Record<string, string[]>;
  /** Card ids that had at least one wrong try. */
  missed: string[];
};

export type SortOutcome =
  | { kind: "right"; card: SortCard; bucket: string }
  | { kind: "wrong"; card: SortCard; bucket: string; reason: string }
  | { kind: "ignored" };

/** A fallback reason when the data has none for this bucket. */
export const DEFAULT_WHY = "Not this one. Read the card again and try another bucket.";

/** A small seeded shuffle (mulberry32), so round 2 has a new order but tests can predict it. Seed 0 keeps the data order. */
export function dealOrder(ids: string[], seed: number): string[] {
  const out = [...ids];
  if (!seed) return out;
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function startSort(cards: SortCard[], buckets: SortBucket[], seed = 0): SortState {
  const placed: Record<string, string[]> = {};
  for (const b of buckets) placed[b.id] = [];
  return { order: dealOrder(cards.map((c) => c.id), seed), index: 0, placed, missed: [] };
}

export function currentCard(state: SortState, cards: SortCard[]): SortCard | null {
  const id = state.order[state.index];
  return id === undefined ? null : (cards.find((c) => c.id === id) ?? null);
}

export function isDone(state: SortState): boolean {
  return state.index >= state.order.length;
}

/** Put the top card into a bucket. Unknown buckets and a finished deck are ignored. */
export function placeCard(state: SortState, cards: SortCard[], bucket: string): { state: SortState; outcome: SortOutcome } {
  const card = currentCard(state, cards);
  if (!card || !(bucket in state.placed)) return { state, outcome: { kind: "ignored" } };
  if (card.answer === bucket) {
    const placed = { ...state.placed, [bucket]: [...state.placed[bucket], card.id] };
    return { state: { ...state, index: state.index + 1, placed }, outcome: { kind: "right", card, bucket } };
  }
  const missed = state.missed.includes(card.id) ? state.missed : [...state.missed, card.id];
  return { state: { ...state, missed }, outcome: { kind: "wrong", card, bucket, reason: card.why[bucket] ?? DEFAULT_WHY } };
}

export function bucketCount(state: SortState, bucket: string): number {
  return state.placed[bucket]?.length ?? 0;
}

/** Optional wording for the end-of-round verdict. `many` holds `{n}` for the count. Each result must be 38 characters or fewer. */
export type SortVerdicts = { clean: string; one: string; many: string };

/** The end-of-round verdict, at most 38 characters. */
export function sortVerdict(state: SortState, words?: SortVerdicts): string {
  const n = state.missed.length;
  if (words) return n === 0 ? words.clean : n === 1 ? words.one : words.many.replace("{n}", String(n));
  if (n === 0) return "All sorted, all right first time";
  return n === 1 ? "All sorted, 1 took a second try" : `All sorted, ${n} took a second try`;
}

/** Break text into lines of at most `max` characters, at spaces. A word longer than `max` gets its own line. */
export function wrapWords(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Rough advance per character of a tray's name (13.5px bold) and gloss (11.5px medium) on one line. */
const LABEL_CHAR_W = 7.9;
const SUB_CHAR_W = 6.2;

/** True when a tray's name and gloss each fit on one line inside the tray, so the roomy layout with the big count can be used. */
export function fitsOneLine(trayW: number, label: string, sub: string): boolean {
  return label.length * LABEL_CHAR_W <= trayW - 10 && sub.length * SUB_CHAR_W <= trayW - 10;
}

/** How a tray's name and gloss wrap to its width. Every word is kept; a tray with many lines grows (see trayHeight). */
export function trayLines(trayW: number, label: string, sub: string): { label: string[]; sub: string[] } {
  // A wide tray keeps a little more air at its sides than a narrow one can afford.
  const pad = trayW > 100 ? 16 : 8;
  return { label: wrapWords(label, Math.floor((trayW - pad) / 7)), sub: wrapBalanced(sub, Math.floor((trayW - pad) / 5.9)) };
}

/** The standard tray height, and the height a tray needs for its wrapped name and gloss above the count in its corner. */
export const TRAY_H = 104;
export function trayHeight(trayW: number, buckets: { label: string; sub: string }[], dense: boolean): number {
  const needs = buckets.map((bucket) => {
    if (!dense && fitsOneLine(trayW, bucket.label, bucket.sub)) return TRAY_H;
    const lines = trayLines(trayW, bucket.label, bucket.sub);
    return 31 + (lines.label.length - 1) * 14.5 + 15 + Math.max(0, lines.sub.length - 1) * 13 + 6 + 22;
  });
  return Math.max(TRAY_H, ...needs.map(Math.ceil));
}

/** Problems in a deck that would break the game: unknown answers, duplicate ids, missing reasons. */
export function checkDeck(cards: SortCard[], buckets: SortBucket[]): string[] {
  const ids = new Set(buckets.map((b) => b.id));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) problems.push(`${c.id}: duplicate id`);
    seen.add(c.id);
    if (!ids.has(c.answer)) problems.push(`${c.id}: unknown answer ${c.answer}`);
    for (const b of buckets) if (b.id !== c.answer && !c.why[b.id]) problems.push(`${c.id}: no reason for ${b.id}`);
  }
  return problems;
}
