// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Pattern matching for grep, sed and find. The regular expression engine is a small NFA simulator
// (no backtracking), so a hostile pattern cannot hang the game. A work budget stops anything big.

export class BudgetError extends Error {}

let budgetLeft = 0;

/** Start a new work allowance. The shell calls this before every command line. */
export function resetBudget(units: number): void {
  budgetLeft = units;
}

export function spend(units = 1): void {
  budgetLeft -= units;
  if (budgetLeft < 0) throw new BudgetError("budget");
}

// ---------------------------------------------------------------- glob

type GlobTok = { t: "lit"; c: string } | { t: "one" } | { t: "star" } | { t: "set"; neg: boolean; items: Array<[string, string]> };

function globTokens(pattern: string): GlobTok[] {
  const toks: GlobTok[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) {
      toks.push({ t: "lit", c: pattern[++i]! });
    } else if (ch === "*") {
      if (toks.length === 0 || toks[toks.length - 1]!.t !== "star") toks.push({ t: "star" });
    } else if (ch === "?") {
      toks.push({ t: "one" });
    } else if (ch === "[") {
      let j = i + 1;
      let neg = false;
      if (pattern[j] === "!" || pattern[j] === "^") {
        neg = true;
        j++;
      }
      const items: Array<[string, string]> = [];
      let first = true;
      let closed = false;
      while (j < pattern.length) {
        const c = pattern[j]!;
        if (c === "]" && !first) {
          closed = true;
          break;
        }
        first = false;
        if (pattern[j + 1] === "-" && j + 2 < pattern.length && pattern[j + 2] !== "]") {
          items.push([c, pattern[j + 2]!]);
          j += 3;
        } else {
          items.push([c, c]);
          j++;
        }
      }
      if (closed) {
        toks.push({ t: "set", neg, items });
        i = j;
      } else toks.push({ t: "lit", c: "[" });
    } else toks.push({ t: "lit", c: ch });
  }
  return toks;
}

function globOne(tok: GlobTok, ch: string): boolean {
  if (tok.t === "lit") return tok.c === ch;
  if (tok.t === "one") return true;
  if (tok.t === "set") return tok.items.some(([a, b]) => ch >= a && ch <= b) !== tok.neg;
  return false;
}

/** Shell and `find -name` patterns: * ? [abc] [a-z] [!x]. */
export function globMatch(pattern: string, text: string, ignoreCase = false): boolean {
  const toks = globTokens(ignoreCase ? pattern.toLowerCase() : pattern);
  const s = ignoreCase ? text.toLowerCase() : text;
  let p = 0;
  let i = 0;
  let starP = -1;
  let starI = 0;
  while (i < s.length) {
    spend(1);
    const tok = toks[p];
    if (tok && tok.t === "star") {
      starP = p++;
      starI = i;
    } else if (tok && globOne(tok, s[i]!)) {
      p++;
      i++;
    } else if (starP >= 0) {
      p = starP + 1;
      i = ++starI;
    } else return false;
  }
  while (toks[p] && toks[p]!.t === "star") p++;
  return p === toks.length;
}

export function hasGlob(text: string): boolean {
  return /[*?[]/.test(text);
}

// ---------------------------------------------------------------- regular expressions

type Ast =
  | { t: "char"; c: string }
  | { t: "any" }
  | { t: "set"; neg: boolean; items: Array<[string, string]> }
  | { t: "cat"; a: Ast[] }
  | { t: "alt"; a: Ast[] }
  | { t: "rep"; n: Ast; min: number; max: number }
  | { t: "assert"; k: "bol" | "eol" | "wordb" | "nwordb" | "wstart" | "wend" | "nwprev" | "nwnext" };

const CLASSES: Record<string, (c: string) => boolean> = {
  alpha: (c) => /[A-Za-z]/.test(c),
  digit: (c) => /[0-9]/.test(c),
  alnum: (c) => /[A-Za-z0-9]/.test(c),
  upper: (c) => /[A-Z]/.test(c),
  lower: (c) => /[a-z]/.test(c),
  space: (c) => /\s/.test(c),
  blank: (c) => c === " " || c === "\t",
  punct: (c) => /[!-/:-@[-`{-~]/.test(c),
  xdigit: (c) => /[0-9A-Fa-f]/.test(c),
  word: (c) => /[A-Za-z0-9_]/.test(c),
};

const isWord = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);

class RegexError extends Error {}

type Tok = { k: "lit" | "op" | "cls" | "end"; c: string; len: number };

class Parser {
  i = 0;
  constructor(
    private src: string,
    private ere: boolean,
  ) {}

  private peek(): Tok {
    const s = this.src;
    if (this.i >= s.length) return { k: "end", c: "", len: 0 };
    const ch = s[this.i]!;
    if (ch === "\\") {
      if (this.i + 1 >= s.length) throw new RegexError("Trailing backslash");
      const nx = s[this.i + 1]!;
      if (!this.ere && "(){}|+?".includes(nx)) return { k: "op", c: nx, len: 2 };
      if ("wWsSbB<>".includes(nx)) return { k: "cls", c: nx, len: 2 };
      if (nx >= "1" && nx <= "9") throw new RegexError("Back references are not supported here");
      return { k: "lit", c: nx, len: 2 };
    }
    if (this.ere && "(){}|+?".includes(ch)) return { k: "op", c: ch, len: 1 };
    if ("*.[^$".includes(ch)) return { k: "op", c: ch, len: 1 };
    return { k: "lit", c: ch, len: 1 };
  }

  parse(): Ast {
    const ast = this.alt(0);
    if (this.i < this.src.length) throw new RegexError("Unmatched ) or \\)");
    return ast;
  }

  private alt(depth: number): Ast {
    const parts = [this.cat(depth)];
    for (;;) {
      const t = this.peek();
      if (t.k === "op" && t.c === "|") {
        this.i += t.len;
        parts.push(this.cat(depth));
      } else break;
    }
    return parts.length === 1 ? parts[0]! : { t: "alt", a: parts };
  }

  private cat(depth: number): Ast {
    const items: Ast[] = [];
    for (;;) {
      const t = this.peek();
      if (t.k === "end") break;
      if (t.k === "op" && t.c === "|") break;
      if (t.k === "op" && t.c === ")") {
        if (depth > 0) break;
        if (this.ere) {
          // A lone ")" is a plain character in ERE.
          this.i += t.len;
          items.push({ t: "char", c: ")" });
          continue;
        }
        throw new RegexError("Unmatched ) or \\)");
      }
      let atom = this.atom(items.length === 0, depth);
      for (;;) {
        const q = this.peek();
        if (q.k !== "op") break;
        if (q.c === "*") {
          this.i += q.len;
          atom = { t: "rep", n: atom, min: 0, max: Infinity };
        } else if (q.c === "+") {
          this.i += q.len;
          atom = { t: "rep", n: atom, min: 1, max: Infinity };
        } else if (q.c === "?") {
          this.i += q.len;
          atom = { t: "rep", n: atom, min: 0, max: 1 };
        } else if (q.c === "{") {
          const range = this.interval(q.len);
          if (!range) break;
          atom = { t: "rep", n: atom, min: range[0], max: range[1] };
        } else break;
      }
      items.push(atom);
    }
    return items.length === 1 ? items[0]! : { t: "cat", a: items };
  }

  private interval(openLen: number): [number, number] | null {
    const m = /^(\d*)(,(\d*))?/.exec(this.src.slice(this.i + openLen));
    if (!m || (m[1] === "" && m[3] === undefined)) return null;
    const after = this.i + openLen + m[0].length;
    const close = this.ere ? this.src[after] === "}" : this.src.slice(after, after + 2) === "\\}";
    if (!close) {
      if (this.ere) return null;
      throw new RegexError("Unmatched { or \\{");
    }
    const min = m[1] === "" ? 0 : Number(m[1]);
    const max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
    if (min > 100 || (max !== Infinity && max > 100) || max < min) throw new RegexError("Invalid content of \\{\\}");
    this.i = after + (this.ere ? 1 : 2);
    return [min, max];
  }

  private atom(first: boolean, depth: number): Ast {
    const t = this.peek();
    this.i += t.len;
    if (t.k === "lit") return { t: "char", c: t.c };
    if (t.k === "cls") {
      switch (t.c) {
        case "w": return { t: "set", neg: false, items: [["a", "z"], ["A", "Z"], ["0", "9"], ["_", "_"]] };
        case "W": return { t: "set", neg: true, items: [["a", "z"], ["A", "Z"], ["0", "9"], ["_", "_"]] };
        case "s": return { t: "set", neg: false, items: [[" ", " "], ["\t", "\t"]] };
        case "S": return { t: "set", neg: true, items: [[" ", " "], ["\t", "\t"]] };
        case "b": return { t: "assert", k: "wordb" };
        case "B": return { t: "assert", k: "nwordb" };
        case "<": return { t: "assert", k: "wstart" };
        default: return { t: "assert", k: "wend" };
      }
    }
    // t.k === "op" from here
    switch (t.c) {
      case ".": return { t: "any" };
      case "[": return this.bracket();
      case "^": {
        if (this.ere || first) return { t: "assert", k: "bol" };
        return { t: "char", c: "^" };
      }
      case "$": {
        const nx = this.peek();
        const atEnd = nx.k === "end" || (nx.k === "op" && (nx.c === "|" || nx.c === ")"));
        if (this.ere || atEnd) return { t: "assert", k: "eol" };
        return { t: "char", c: "$" };
      }
      case "*": return { t: "char", c: "*" };
      case "(": {
        const inner = this.alt(depth + 1);
        const close = this.peek();
        if (!(close.k === "op" && close.c === ")")) throw new RegexError("Unmatched ( or \\(");
        this.i += close.len;
        return inner;
      }
      case "{": return { t: "char", c: "{" };
      default: return { t: "char", c: t.c };
    }
  }

  private bracket(): Ast {
    const s = this.src;
    let neg = false;
    if (s[this.i] === "^") {
      neg = true;
      this.i++;
    }
    const items: Array<[string, string]> = [];
    let first = true;
    for (;;) {
      if (this.i >= s.length) throw new RegexError("Unmatched [, [^, [:, [., or [=");
      const c = s[this.i]!;
      if (c === "]" && !first) {
        this.i++;
        break;
      }
      first = false;
      if (c === "[" && s[this.i + 1] === ":") {
        const end = s.indexOf(":]", this.i + 2);
        if (end < 0) throw new RegexError("Unmatched [, [^, [:, [., or [=");
        const name = s.slice(this.i + 2, end);
        const fn = CLASSES[name];
        if (!fn) throw new RegexError("Invalid character class name");
        for (let code = 1; code < 128; code++) {
          const ch = String.fromCharCode(code);
          if (fn(ch)) items.push([ch, ch]);
        }
        this.i = end + 2;
        continue;
      }
      if (s[this.i + 1] === "-" && this.i + 2 < s.length && s[this.i + 2] !== "]") {
        if (s[this.i + 2]! < c) throw new RegexError("Invalid range end");
        items.push([c, s[this.i + 2]!]);
        this.i += 3;
      } else {
        items.push([c, c]);
        this.i++;
      }
    }
    return { t: "set", neg, items };
  }
}

// An NFA built from the tree. State kinds: c char, a any, s set, p split, x assert, m match.
type State = { k: "c" | "a" | "s" | "p" | "x" | "m"; c?: string; set?: Extract<Ast, { t: "set" }>; a: number; b: number; as?: string };

const MAX_STATES = 4000;

function build(ast: Ast, ignoreCase: boolean): { states: State[]; start: number } {
  const states: State[] = [];
  const add = (s: State): number => {
    if (states.length >= MAX_STATES) throw new RegexError("Regular expression too big");
    states.push(s);
    return states.length - 1;
  };
  const match = add({ k: "m", a: -1, b: -1 });
  const comp = (n: Ast, next: number): number => {
    switch (n.t) {
      case "char": return add({ k: "c", c: ignoreCase ? n.c.toLowerCase() : n.c, a: next, b: -1 });
      case "any": return add({ k: "a", a: next, b: -1 });
      case "set": return add({ k: "s", set: n, a: next, b: -1 });
      case "assert": return add({ k: "x", as: n.k, a: next, b: -1 });
      case "cat": {
        let cur = next;
        for (let i = n.a.length - 1; i >= 0; i--) cur = comp(n.a[i]!, cur);
        return cur;
      }
      case "alt": {
        let cur = comp(n.a[n.a.length - 1]!, next);
        for (let i = n.a.length - 2; i >= 0; i--) cur = add({ k: "p", a: comp(n.a[i]!, next), b: cur });
        return cur;
      }
      case "rep": {
        let cur = next;
        if (n.max === Infinity) {
          const split = add({ k: "p", a: -1, b: next });
          states[split]!.a = comp(n.n, split);
          cur = split;
        } else {
          for (let i = 0; i < n.max - n.min; i++) cur = add({ k: "p", a: comp(n.n, cur), b: next });
        }
        for (let i = 0; i < n.min; i++) cur = comp(n.n, cur);
        return cur;
      }
    }
  };
  return { states, start: comp(ast, match) };
}

export type Matcher = {
  /** Does the pattern match anywhere in the text? */
  test(text: string): boolean;
  /** The leftmost, longest match at or after `from`, as [start, end], or null. */
  find(text: string, from: number): [number, number] | null;
};

function setHas(set: Extract<Ast, { t: "set" }>, ch: string, ignoreCase: boolean): boolean {
  const hit = (c: string) => set.items.some(([a, b]) => c >= a && c <= b);
  let r = hit(ch);
  if (!r && ignoreCase) r = hit(ch.toLowerCase()) || hit(ch.toUpperCase());
  return r !== set.neg;
}

function makeMatcher(ast: Ast, ignoreCase: boolean): Matcher {
  const { states, start } = build(ast, ignoreCase);
  const n = states.length;
  const seen = new Int32Array(n).fill(-1);
  let stamp = 0;

  const assertOk = (kind: string, s: string, p: number): boolean => {
    const prev = isWord(s[p - 1]);
    const next = isWord(s[p]);
    switch (kind) {
      case "bol": return p === 0;
      case "eol": return p === s.length;
      case "wordb": return prev !== next;
      case "nwordb": return prev === next;
      case "wstart": return !prev && next;
      case "wend": return prev && !next;
      case "nwprev": return !prev;
      default: return !next;
    }
  };

  // Add a state and everything reachable without reading a character.
  const close = (list: number[], st: number, s: string, p: number): boolean => {
    let matched = false;
    const stack = [st];
    while (stack.length) {
      const id = stack.pop()!;
      if (id < 0 || seen[id] === stamp) continue;
      seen[id] = stamp;
      spend(1);
      const state = states[id]!;
      if (state.k === "p") {
        stack.push(state.b, state.a);
      } else if (state.k === "x") {
        if (assertOk(state.as!, s, p)) stack.push(state.a);
      } else if (state.k === "m") {
        matched = true;
        list.push(id);
      } else list.push(id);
    }
    return matched;
  };

  const consumes = (state: State, ch: string): boolean => {
    if (state.k === "a") return true;
    if (state.k === "c") return (ignoreCase ? ch.toLowerCase() : ch) === state.c;
    if (state.k === "s") return setHas(state.set!, ch, ignoreCase);
    return false;
  };

  return {
    test(s: string): boolean {
      let cur: number[] = [];
      for (let p = 0; p <= s.length; p++) {
        // A new match may begin at every position.
        stamp++;
        const next: number[] = [];
        let hit = false;
        for (const id of cur) if (close(next, id, s, p)) hit = true;
        if (close(next, start, s, p)) hit = true;
        if (hit) return true;
        cur = next;
        if (p === s.length) break;
        const ch = s[p]!;
        const moved: number[] = [];
        for (const id of cur) {
          const state = states[id]!;
          if (state.k !== "m" && consumes(state, ch)) moved.push(state.a);
        }
        cur = moved;
      }
      return false;
    },
    find(s: string, from: number): [number, number] | null {
      for (let begin = from; begin <= s.length; begin++) {
        let best = -1;
        stamp++;
        let cur: number[] = [];
        if (close(cur, start, s, begin)) best = begin;
        for (let p = begin; p < s.length && cur.length; p++) {
          const ch = s[p]!;
          const moved: number[] = [];
          for (const id of cur) {
            const state = states[id]!;
            if (state.k !== "m" && consumes(state, ch)) moved.push(state.a);
          }
          stamp++;
          cur = [];
          for (const id of moved) {
            if (close(cur, id, s, p + 1)) best = p + 1;
          }
        }
        if (best >= 0) return [begin, best];
      }
      return null;
    },
  };
}

export type PatternOptions = { ere: boolean; ignoreCase: boolean; fixed?: boolean; word?: boolean; line?: boolean };

/** Compile one or more patterns (they are joined with "or"). Returns an error text on a bad pattern. */
export function compilePatterns(patterns: string[], opts: PatternOptions): Matcher | { error: string } {
  try {
    const alts: Ast[] = patterns.map((p) => {
      if (p.length > 500) throw new RegexError("Regular expression too big");
      if (opts.fixed) return { t: "cat", a: [...p].map((c) => ({ t: "char", c }) as Ast) } as Ast;
      return new Parser(p, opts.ere).parse();
    });
    let ast: Ast = alts.length === 1 ? alts[0]! : { t: "alt", a: alts };
    if (opts.line) ast = { t: "cat", a: [{ t: "assert", k: "bol" }, ast, { t: "assert", k: "eol" }] };
    else if (opts.word) ast = { t: "cat", a: [{ t: "assert", k: "nwprev" }, ast, { t: "assert", k: "nwnext" }] };
    return makeMatcher(ast, opts.ignoreCase);
  } catch (error) {
    if (error instanceof RegexError) return { error: error.message };
    if (error instanceof BudgetError) throw error;
    return { error: "Invalid regular expression" };
  }
}
