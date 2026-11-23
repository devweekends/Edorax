// How much two written answers share, as 0 to 1. It counts shared runs of three words, so two
// answers that merely use the same topic words do not score high. It is a reading aid for a mentor,
// never a verdict. Honest answers to the same question can overlap.

function runs(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  if (words.length < 3) {
    for (const word of words) set.add(word);
    return set;
  }
  for (let index = 0; index + 3 <= words.length; index += 1)
    set.add(words.slice(index, index + 3).join(" "));
  return set;
}

export function wordOverlap(a: string, b: string): number {
  const first = runs(a);
  const second = runs(b);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  for (const item of first) if (second.has(item)) shared += 1;
  return shared / (first.size + second.size - shared);
}
