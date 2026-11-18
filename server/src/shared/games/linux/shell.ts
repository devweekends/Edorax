/* eslint-disable no-control-regex -- the shell engines reject or use control characters on purpose */
// The practice shell: reads a command line, runs it on the virtual server, and keeps score for the
// mission. It runs one command at a time, so the browser can show the output as the player types.
// Nothing here touches the real file system, real processes, the clock or Math.random.
import { COMMANDS, NOT_HERE, SHELL_TIPS, USAGE } from "./commands.js";
import { ERR_TEXT, NOW, VFS, can, joinPath, normalizePath, type VNode } from "./fs.js";
import type { Ctx, Mission, Proc, ShellState } from "./model.js";
import { BudgetError, globMatch, hasGlob, resetBudget, spend } from "./regex.js";

export const MAX_LINE = 500;
export const MAX_COMMANDS = 250;
const MAX_OUTPUT_LINES = 1500;
const MAX_BUFFER = 300_000;
const MAX_DEPTH = 4;
const WORK_BUDGET = 3_000_000;

export type OutLine = { kind: "out" | "err" | "sys"; text: string };
export type RunResult = {
  lines: OutLine[];
  clear: boolean;
  /** False when the shell refused the line (empty, too long, too many commands). It is not recorded. */
  accepted: boolean;
  /** Indexes of objectives that became done with this command. */
  newlyDone: number[];
  solved: boolean;
};
export type Progress = { done: boolean[]; solved: boolean; commands: number; hints: number; hintsTotal: number };

type Sink = { out(text: string): void; err(text: string): void };

// ---------------------------------------------------------------- parsing

type Token = { t: "word"; raw: string } | { t: "op"; op: string };
type Redir = { op: ">" | ">>" | "<" | "2>" | "2>>" | "2>&1"; target: string | null };
type SimpleCmd = { words: string[]; redirs: Redir[] };
type ListItem = { pipe: SimpleCmd[]; next: "&&" | "||" | ";" | null };

class SyntaxErr extends Error {}

/** Find the ")" that closes a "$(" whose opening bracket is just before `start`. */
function findClose(raw: string, start: number): number {
  let depth = 1;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "'") {
      const e = raw.indexOf("'", i + 1);
      if (e < 0) return -1;
      i = e;
    } else if (ch === '"') {
      for (i++; i < raw.length && raw[i] !== '"'; i++) if (raw[i] === "\\") i++;
    } else if (ch === "\\") i++;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return i;
  }
  return -1;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let cur = "";
  let has = false;
  let plain = true; // the word so far has no quotes or escapes
  const flush = () => {
    if (has) tokens.push({ t: "word", raw: cur });
    cur = "";
    has = false;
    plain = true;
  };
  const unclosed = (q: string) => new SyntaxErr(`unexpected EOF while looking for matching \`${q}'`);
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === " " || ch === "\t") flush();
    else if (ch === "#" && !has) break;
    else if (ch === "'") {
      const e = line.indexOf("'", i + 1);
      if (e < 0) throw unclosed("'");
      cur += line.slice(i, e + 1);
      i = e;
      has = true;
      plain = false;
    } else if (ch === '"') {
      let j = i + 1;
      for (; j < line.length && line[j] !== '"'; j++) {
        if (line[j] === "\\") j++;
        else if (line[j] === "$" && line[j + 1] === "(") {
          const e = findClose(line, j + 2);
          if (e < 0) throw unclosed(")");
          j = e;
        }
      }
      if (j >= line.length) throw unclosed('"');
      cur += line.slice(i, j + 1);
      i = j;
      has = true;
      plain = false;
    } else if (ch === "\\") {
      cur += ch + (line[i + 1] ?? "");
      i++;
      has = true;
      plain = false;
    } else if (ch === "$" && line[i + 1] === "(") {
      const e = findClose(line, i + 2);
      if (e < 0) throw unclosed(")");
      cur += line.slice(i, e + 1);
      i = e;
      has = true;
      plain = false;
    } else if (ch === "`") {
      const e = line.indexOf("`", i + 1);
      if (e < 0) throw unclosed("`");
      cur += line.slice(i, e + 1);
      i = e;
      has = true;
      plain = false;
    } else if (ch === "|" || ch === "&" || ch === ";" || ch === ">" || ch === "<") {
      if (ch === ">" && has && plain && cur === "2") {
        cur = "";
        has = false;
        if (line[i + 1] === "&" && line[i + 2] === "1") {
          tokens.push({ t: "op", op: "2>&1" });
          i += 2;
        } else if (line[i + 1] === ">") {
          tokens.push({ t: "op", op: "2>>" });
          i++;
        } else tokens.push({ t: "op", op: "2>" });
        continue;
      }
      flush();
      const two = line.slice(i, i + 2);
      if (two === "||" || two === "&&" || two === ">>") {
        tokens.push({ t: "op", op: two });
        i++;
      } else if (ch === "&") throw new SyntaxErr("background jobs (&) are not supported in this practice shell");
      else tokens.push({ t: "op", op: ch });
    } else {
      cur += ch;
      has = true;
    }
  }
  flush();
  return tokens;
}

function parseLine(line: string): ListItem[] {
  const tokens = tokenize(line);
  const items: ListItem[] = [];
  let pipe: SimpleCmd[] = [];
  let cmd: SimpleCmd = { words: [], redirs: [] };
  let pending: Redir | null = null;
  const near = (op: string) => new SyntaxErr(`syntax error near unexpected token \`${op}'`);
  const endCmd = (op: string) => {
    if (cmd.words.length === 0 && cmd.redirs.length === 0) throw near(op);
    pipe.push(cmd);
    cmd = { words: [], redirs: [] };
  };
  for (const tok of tokens) {
    if (tok.t === "word") {
      if (pending) {
        pending.target = tok.raw;
        pending = null;
      } else cmd.words.push(tok.raw);
      continue;
    }
    const op = tok.op;
    if (pending) throw near(op);
    if (op === ">" || op === ">>" || op === "<" || op === "2>" || op === "2>>") {
      pending = { op, target: null };
      cmd.redirs.push(pending);
    } else if (op === "2>&1") cmd.redirs.push({ op, target: null });
    else if (op === "|") endCmd("|");
    else {
      // && || ;
      if (cmd.words.length === 0 && cmd.redirs.length === 0 && pipe.length === 0) {
        if (op === ";" && items.length > 0) continue;
        throw near(op);
      }
      endCmd(op);
      items.push({ pipe, next: op as "&&" | "||" | ";" });
      pipe = [];
    }
  }
  if (pending) throw new SyntaxErr("syntax error near unexpected token `newline'");
  if (cmd.words.length || cmd.redirs.length) endCmd("newline");
  else if (pipe.length) throw near("newline");
  if (pipe.length) items.push({ pipe, next: null });
  const last = items[items.length - 1];
  if (last && (last.next === "&&" || last.next === "||")) throw new SyntaxErr("syntax error: unexpected end of file");
  return items;
}

// ---------------------------------------------------------------- the shell

const DEFAULT_PROCS: Proc[] = [
  { pid: 1, user: "root", cpu: 0, mem: 0.1, vsz: 168000, rss: 11000, stat: "Ss", start: "Jan01", time: "0:03", command: "/sbin/init" },
  { pid: 77, user: "root", cpu: 0, mem: 0.1, vsz: 8500, rss: 2200, stat: "Ss", start: "Jan01", time: "0:00", command: "/usr/sbin/cron -f" },
  { pid: 988, user: "root", cpu: 0, mem: 0.2, vsz: 15400, rss: 6000, stat: "Ss", start: "Jan01", time: "0:00", command: "sshd: /usr/sbin/sshd -D" },
  { pid: 1204, user: "ops", cpu: 0, mem: 0.2, vsz: 9100, rss: 4800, tty: "pts/0", stat: "Ss", start: "00:00", time: "0:00", command: "-bash" },
];

const FREE = new Set(["hint", "help", "commands", "man", "clear", "history"]);
const BUILTINS = ["hint", "submit", "history", "clear", "help", "commands", "man", "exit", "logout", "bash", "sh"];
const SENTINEL: Record<string, string> = { "*": "\u0001", "?": "\u0002", "[": "\u0003" };
const UNSENTINEL = (s: string) => s.replace(/\u0001/g, "*").replace(/\u0002/g, "?").replace(/\u0003/g, "[");
const quoteGlob = (s: string) => s.replace(/[*?[]/g, (m) => SENTINEL[m]!);

function normalizeAnswer(text: string): string {
  return text.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").toLowerCase();
}

export class Shell {
  readonly st: ShellState;
  readonly mission: Mission;
  private hintsShown = 0;
  private counted = 0;
  private done: boolean[];
  private solved = false;
  private solvedCounted = 0;
  private solvedHints = 0;
  private depth = 0;
  private lines: OutLine[] = [];
  private cleared = false;
  private lineCap = false;
  private lastCode = 0;

  constructor(mission: Mission) {
    this.mission = mission;
    const home = "/home/ops";
    const fs = new VFS(mission.files);
    this.st = {
      fs,
      user: { name: "ops", groups: ["ops", ...(mission.groups ?? [])] },
      hostname: "orbit-01",
      cwd: normalizePath("/", mission.cwd ?? home),
      oldpwd: home,
      env: { HOME: home, USER: "ops", LOGNAME: "ops", SHELL: "/bin/bash", HOSTNAME: "orbit-01", PWD: mission.cwd ?? home, PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", TERM: "xterm" },
      procs: (mission.procs ?? DEFAULT_PROCS).map((p) => ({ ...p })),
      df: mission.df ?? [
        ["/dev/sda1", "40G", "18G", "20G", "48%", "/"],
        ["tmpfs", "2.0G", "0", "2.0G", "0%", "/dev/shm"],
        ["/dev/sdb1", "100G", "62G", "38G", "62%", "/srv"],
      ],
      history: [],
      shown: "",
      answerOk: false,
      executed: [],
    };
    this.st.env.PWD = this.st.cwd;
    this.done = mission.objectives.map(() => false);
  }

  // ---- what the UI reads

  prompt(): string {
    const home = this.st.env.HOME ?? "/";
    let path = this.st.cwd;
    if (path === home) path = "~";
    else if (path.startsWith(home + "/")) path = "~" + path.slice(home.length);
    if (path.length > 18) {
      const parts = path.split("/").filter(Boolean);
      path = "…/" + parts.slice(-2).join("/");
    }
    return `${this.st.user.name}:${path}$`;
  }

  progress(): Progress {
    return { done: [...this.done], solved: this.solved, commands: this.solved ? this.solvedCounted : this.counted, hints: this.solved ? this.solvedHints : this.hintsShown, hintsTotal: this.mission.hints.length };
  }

  /** Commands that counted toward par when the mission was solved (or so far). */
  get commandCount(): number {
    return this.solved ? this.solvedCounted : this.counted;
  }

  get hintCount(): number {
    return this.solved ? this.solvedHints : this.hintsShown;
  }

  get isSolved(): boolean {
    return this.solved;
  }

  get commands(): string[] {
    return [...this.st.history];
  }

  /** Words Tab can finish: command names, then names of files and folders near the player. */
  completions(): string[] {
    const names = new Set<string>([...Object.keys(COMMANDS), ...BUILTINS]);
    const add = (node: VNode, prefix: string) => {
      for (const child of node.children.values()) names.add(prefix + child.name + (child.kind === "dir" ? "/" : ""));
    };
    const cwdNode = this.st.fs.peek(this.st.cwd);
    if (cwdNode && cwdNode.kind === "dir" && can(this.st.user, cwdNode, 4)) {
      add(cwdNode, "");
      for (const child of cwdNode.children.values()) {
        if (child.kind === "dir" && can(this.st.user, child, 4) && can(this.st.user, child, 1)) add(child, child.name + "/");
        else if (child.kind === "file" && (child.mode & 0o100) !== 0) names.add("./" + child.name);
      }
    }
    add(this.st.fs.root, "/");
    for (const top of this.st.fs.root.children.values()) {
      if (top.kind === "dir" && can(this.st.user, top, 4) && can(this.st.user, top, 1)) add(top, "/" + top.name + "/");
    }
    return [...names].sort().slice(0, 500);
  }

  bootLines(): string[] {
    return [`Connecting to ${this.st.hostname} as ${this.st.user.name} ...`, "Connected. Type help to see what works, hint if you are stuck."];
  }

  // ---- running one line

  run(rawLine: string): RunResult {
    this.lines = [];
    this.cleared = false;
    this.lineCap = false;
    const line = typeof rawLine === "string" ? rawLine : "";
    const refuse = (text: string): RunResult => {
      if (text) this.emit("err", text);
      return { lines: this.lines, clear: false, accepted: false, newlyDone: [], solved: this.solved };
    };
    if (line.trim() === "") return refuse("");
    if (line.length > MAX_LINE) return refuse(`bash: that line is too long (more than ${MAX_LINE} characters). It was not run.`);
    if (/[\u0000-\u0008\u000a-\u001f\u007f]/.test(line)) return refuse("bash: that line has control characters. It was not run.");
    if (this.st.history.length >= MAX_COMMANDS) return refuse("bash: too many commands in this session. Press Reset to start again.");

    this.st.history.push(line);
    this.st.fs.now = NOW + this.st.history.length * 60;
    resetBudget(WORK_BUDGET);
    this.depth = 0;

    let items: ListItem[] | null = null;
    try {
      items = parseLine(line);
    } catch (error) {
      this.counted++;
      this.emit("err", `bash: ${error instanceof SyntaxErr ? error.message : "syntax error"}`);
      this.lastCode = 2;
    }
    if (items) {
      const free = items.length === 1 && items[0]!.pipe.length === 1 && FREE.has(this.firstWord(items[0]!.pipe[0]!));
      if (!free) this.counted++;
      try {
        this.runItems(items, this.topSink());
      } catch (error) {
        if (error instanceof BudgetError) this.emit("err", "bash: that command was stopped because it was taking too long");
        else this.emit("err", "bash: something went wrong with that command");
        this.lastCode = 1;
      }
    }

    const newlyDone = this.evaluate();
    return { lines: this.lines, clear: this.cleared, accepted: true, newlyDone, solved: this.solved };
  }

  private firstWord(cmd: SimpleCmd): string {
    const w = cmd.words[0] ?? "";
    return /^[a-z]+$/.test(w) ? w : "";
  }

  private evaluate(): number[] {
    const newly: number[] = [];
    this.mission.objectives.forEach((obj, i) => {
      if (this.done[i]) return;
      let ok = false;
      try {
        ok = obj.done(this.st);
      } catch {
        ok = false;
      }
      if (ok) {
        this.done[i] = true;
        newly.push(i);
      }
    });
    if (!this.solved) {
      let ok = false;
      try {
        ok = this.mission.goal(this.st);
      } catch {
        ok = false;
      }
      if (ok) {
        this.solved = true;
        this.solvedCounted = this.counted;
        this.solvedHints = this.hintsShown;
        this.done.forEach((d, i) => {
          if (!d) {
            this.done[i] = true;
            newly.push(i);
          }
        });
      }
    }
    return newly;
  }

  // ---- output

  private emit(kind: OutLine["kind"], text: string): void {
    const parts = text.split("\n");
    if (parts[parts.length - 1] === "") parts.pop();
    for (const part of parts) {
      if (this.lines.length >= MAX_OUTPUT_LINES) {
        if (!this.lineCap) {
          this.lineCap = true;
          this.lines.push({ kind: "sys", text: "(output cut: it was too long. Narrow it down, for example with grep or head.)" });
        }
        return;
      }
      this.lines.push({ kind, text: part });
    }
    if (kind !== "sys") this.st.shown = (this.st.shown + text + (text.endsWith("\n") ? "" : "\n")).slice(-120_000);
  }

  private topSink(): Sink {
    return { out: (t) => this.emit("out", t), err: (t) => this.emit("err", t) };
  }

  // ---- running a parsed line

  private runItems(items: ListItem[], sink: Sink): number {
    let code = this.lastCode;
    let skip: "&&" | "||" | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (skip === "&&" && code !== 0) {
        // A failed "&&" skips this pipeline; the next connector decides again.
      } else if (skip === "||" && code === 0) {
        // A passed "||" skips this pipeline.
      } else code = this.runPipeline(item.pipe, sink, this.depth === 0);
      this.lastCode = code;
      skip = item.next === "&&" || item.next === "||" ? item.next : null;
    }
    return code;
  }

  /** Run a line inside the shell (a script line or a command substitution). */
  private runInner(line: string, sink: Sink): number {
    let items: ListItem[];
    try {
      items = parseLine(line);
    } catch (error) {
      sink.err(`bash: ${error instanceof SyntaxErr ? error.message : "syntax error"}\n`);
      return 2;
    }
    return this.runItems(items, sink);
  }

  private capture(line: string, parent: Sink): string {
    if (this.depth >= MAX_DEPTH) return "";
    this.depth++;
    let buf = "";
    try {
      this.runInner(line, {
        out: (t) => {
          if (buf.length < MAX_BUFFER) buf += t;
        },
        err: parent.err,
      });
    } finally {
      this.depth--;
    }
    return buf.replace(/\n+$/, "");
  }

  // ---- expansion

  private lookupVar(name: string): string {
    if (name === "?") return String(this.lastCode);
    if (name === "$") return "4242";
    if (name === "0") return "bash";
    return this.st.env[name] ?? "";
  }

  private expandWord(raw: string, sink: Sink): string[] {
    const fields: string[] = [];
    let cur = "";
    let has = false;
    const env = this.st.env;
    const addSplit = (text: string) => {
      // An unquoted expansion splits at spaces.
      const pieces = text.split(/\s+/);
      pieces.forEach((piece, k) => {
        if (k > 0) {
          fields.push(cur);
          cur = "";
          has = false;
        }
        if (piece !== "") {
          cur += quoteGlob(piece);
          has = true;
        }
      });
    };
    const dollar = (i: number, quoted: boolean): number => {
      const nx = raw[i + 1];
      let text = "";
      let next = i + 1;
      if (nx === "(" && raw[i + 2] === "(") {
        throw new SyntaxErr("arithmetic like $((1+2)) is not supported in this practice shell");
      } else if (nx === "(") {
        const e = findClose(raw, i + 2);
        if (e < 0) throw new SyntaxErr("unexpected EOF while looking for matching `)'");
        text = this.capture(raw.slice(i + 2, e), sink);
        next = e + 1;
      } else if (nx === "{") {
        const e = raw.indexOf("}", i + 2);
        if (e < 0) throw new SyntaxErr("bad substitution");
        const body = raw.slice(i + 2, e);
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(?::-([\s\S]*))?$/.exec(body);
        if (!m) throw new SyntaxErr("${" + body + "}: bad substitution");
        const v = this.lookupVar(m[1]!);
        text = v === "" && m[2] !== undefined ? m[2] : v;
        next = e + 1;
      } else if (nx !== undefined && /[A-Za-z_]/.test(nx)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(raw.slice(i + 1))!;
        text = this.lookupVar(m[0]);
        next = i + 1 + m[0].length;
      } else if (nx === "?" || nx === "$" || nx === "0") {
        text = this.lookupVar(nx);
        next = i + 2;
      } else if (nx !== undefined && /[1-9]/.test(nx)) {
        next = i + 2;
      } else {
        cur += "$";
        has = true;
        return i + 1;
      }
      if (quoted) {
        cur += quoteGlob(text);
        has = true;
      } else addSplit(text);
      return next;
    };
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]!;
      if (ch === "'") {
        const e = raw.indexOf("'", i + 1);
        cur += quoteGlob(raw.slice(i + 1, e));
        has = true;
        i = e;
      } else if (ch === '"') {
        has = true;
        let j = i + 1;
        while (j < raw.length && raw[j] !== '"') {
          const c = raw[j]!;
          if (c === "\\" && j + 1 < raw.length && '$"\\`'.includes(raw[j + 1]!)) {
            cur += quoteGlob(raw[j + 1]!);
            j += 2;
          } else if (c === "$") j = dollar(j, true);
          else if (c === "`") {
            const e = raw.indexOf("`", j + 1);
            cur += quoteGlob(this.capture(raw.slice(j + 1, e), sink));
            j = e + 1;
          } else {
            cur += quoteGlob(c);
            j++;
          }
        }
        i = j;
      } else if (ch === "\\") {
        const nx = raw[i + 1];
        if (nx !== undefined) {
          cur += quoteGlob(nx);
          has = true;
          i++;
        }
      } else if (ch === "$") i = dollar(i, false) - 1;
      else if (ch === "`") {
        const e = raw.indexOf("`", i + 1);
        addSplit(this.capture(raw.slice(i + 1, e), sink));
        i = e;
      } else if (ch === "~" && i === 0 && (raw[1] === "/" || raw.length === 1)) {
        cur += quoteGlob(env.HOME ?? "/");
        has = true;
      } else {
        cur += ch;
        has = true;
      }
    }
    if (has) fields.push(cur);
    const out: string[] = [];
    for (const f of fields) {
      if (/[*?[]/.test(f)) {
        const hits = this.glob(f);
        if (hits.length) {
          out.push(...hits);
          continue;
        }
      }
      out.push(UNSENTINEL(f));
    }
    return out;
  }

  /** Expand a path pattern against the virtual file system. `pattern` has real glob characters. */
  private glob(pattern: string): string[] {
    // Quoted glob characters are still sentinels here and are plain letters for matching.
    const absolute = pattern.startsWith("/");
    const segs = pattern.split("/").filter((s, i) => s !== "" || i === 0);
    let results: Array<{ abs: string; display: string }> = [{ abs: absolute ? "/" : this.st.cwd, display: absolute ? "/" : "" }];
    for (const seg of segs) {
      if (seg === "") continue;
      const next: typeof results = [];
      for (const r of results) {
        const show = (name: string) => (r.display === "" ? name : r.display.endsWith("/") ? r.display + name : r.display + "/" + name);
        if (!hasGlob(seg)) {
          const lit = UNSENTINEL(seg);
          if (lit === ".") next.push(r);
          else next.push({ abs: normalizePath(r.abs, lit), display: show(lit) });
          continue;
        }
        const res = this.st.fs.walk(r.abs, this.st.user);
        if (!res.node || res.node.kind !== "dir" || !can(this.st.user, res.node, 4)) continue;
        const pat = seg.replace(/\u0001/g, "\\*").replace(/\u0002/g, "\\?").replace(/\u0003/g, "\\[");
        for (const name of [...res.node.children.keys()].sort()) {
          spend(1);
          if (name.startsWith(".") && !seg.startsWith(".")) continue;
          if (globMatch(pat, name)) next.push({ abs: joinPath(r.abs, name), display: show(name) });
        }
      }
      results = next.slice(0, 500);
    }
    const hits: string[] = [];
    for (const r of results) {
      if (this.st.fs.walk(r.abs, this.st.user).node) hits.push(r.display);
    }
    return hits;
  }

  private expandAll(words: string[], sink: Sink): string[] | null {
    try {
      return words.flatMap((w) => this.expandWord(w, sink));
    } catch (error) {
      if (error instanceof SyntaxErr) {
        sink.err(`bash: ${error.message}\n`);
        return null;
      }
      throw error;
    }
  }

  // ---- pipelines

  private runPipeline(pipe: SimpleCmd[], sink: Sink, top: boolean): number {
    type Prepared = {
      argv: string[];
      outTargets: Array<{ path: string; append: boolean }>;
      errTarget: { path: string; append: boolean } | null;
      errToOut: boolean;
      stdin: string | null;
      failed: boolean;
    };
    const prepared: Prepared[] = [];
    for (const cmd of pipe) {
      const argv = this.expandAll(cmd.words, sink);
      if (argv === null) return 1;
      const p: Prepared = { argv, outTargets: [], errTarget: null, errToOut: false, stdin: null, failed: false };
      for (const r of cmd.redirs) {
        if (r.op === "2>&1") {
          p.errToOut = true;
          continue;
        }
        const targets = this.expandAll([r.target ?? ""], sink);
        if (targets === null) return 1;
        if (targets.length !== 1) {
          sink.err(`bash: ${r.target}: ambiguous redirect\n`);
          p.failed = true;
          continue;
        }
        const path = targets[0]!;
        const abs = normalizePath(this.st.cwd, path, this.st.env.HOME ?? "/");
        if (r.op === "<") {
          const res = this.st.fs.walk(abs, this.st.user);
          if (!res.node) {
            sink.err(`bash: ${path}: ${ERR_TEXT[res.err ?? "ENOENT"]}\n`);
            p.failed = true;
          } else if (res.node.kind === "dir") {
            sink.err(`bash: ${path}: Is a directory\n`);
            p.failed = true;
          } else if (!can(this.st.user, res.node, 4)) {
            sink.err(`bash: ${path}: Permission denied\n`);
            p.failed = true;
          } else p.stdin = res.node.content;
          continue;
        }
        const append = r.op === ">>" || r.op === "2>>";
        if (path !== "/dev/null") {
          // The shell opens (and empties) the file before the command runs.
          const e = this.st.fs.writeFile(abs, this.st.user, "", append);
          if (e) {
            sink.err(`bash: ${path}: ${ERR_TEXT[e]}\n`);
            p.failed = true;
            continue;
          }
        }
        if (r.op === ">" || r.op === ">>") p.outTargets.push({ path, append });
        else p.errTarget = { path, append };
      }
      prepared.push(p);
    }

    let prev: string | null = null;
    let code = 0;
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i]!;
      const last = i === prepared.length - 1;
      if (p.failed) {
        code = 1;
        prev = "";
        continue;
      }
      const toTerminal = last && p.outTargets.length === 0;
      let outBuf = "";
      let errBuf = "";
      const emitOut = (t: string) => {
        if (toTerminal) sink.out(t);
        else if (outBuf.length < MAX_BUFFER) outBuf += t;
      };
      const emitErr = (t: string) => {
        if (p.errToOut) emitOut(t);
        else if (p.errTarget) {
          if (p.errTarget.path !== "/dev/null" && errBuf.length < MAX_BUFFER) errBuf += t;
        } else sink.err(t);
      };
      const local: Sink = { out: emitOut, err: emitErr };
      const stdin = i === 0 ? p.stdin : prev;
      code = this.runCommand(p.argv, stdin, local, toTerminal && top);
      if (p.errTarget && p.errTarget.path !== "/dev/null") {
        const e = this.st.fs.writeFile(normalizePath(this.st.cwd, p.errTarget.path, this.st.env.HOME ?? "/"), this.st.user, errBuf, true);
        if (e) sink.err(`bash: ${p.errTarget.path}: ${ERR_TEXT[e]}\n`);
      }
      for (const t of p.outTargets) {
        if (t.path === "/dev/null") continue;
        const e = this.st.fs.writeFile(normalizePath(this.st.cwd, t.path, this.st.env.HOME ?? "/"), this.st.user, outBuf, true);
        if (e) sink.err(`bash: write error: ${ERR_TEXT[e]}\n`);
      }
      prev = toTerminal ? "" : outBuf;
    }
    return code;
  }

  // ---- one command

  private runCommand(argvIn: string[], stdin: string | null, sink: Sink, tty: boolean): number {
    let argv = argvIn;
    // NAME=value words before the command.
    const assigned: Array<[string, string | undefined]> = [];
    while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0]!)) {
      const eq = argv[0]!.indexOf("=");
      assigned.push([argv[0]!.slice(0, eq), this.st.env[argv[0]!.slice(0, eq)]]);
      this.st.env[argv[0]!.slice(0, eq)] = argv[0]!.slice(eq + 1);
      argv = argv.slice(1);
    }
    if (argv.length === 0) return 0;
    const code = this.invoke(argv, stdin, sink, tty);
    if (assigned.length && argv.length) {
      for (const [k, old] of assigned) {
        if (old === undefined) delete this.st.env[k];
        else this.st.env[k] = old;
      }
    }
    return code;
  }

  private ctx(argv: string[], stdin: string | null, sink: Sink, tty: boolean): Ctx {
    return {
      st: this.st,
      args: argv.slice(1),
      stdin,
      tty,
      out: sink.out,
      err: (m) => sink.err(m + "\n"),
      exec: (sub, input) => {
        let out = "";
        const code = this.invoke(sub, input, { out: (t) => (out.length < MAX_BUFFER ? (out += t) : out), err: sink.err }, false);
        return { code, out };
      },
    };
  }

  private invoke(argv: string[], stdin: string | null, sink: Sink, tty: boolean): number {
    const name = argv[0]!;
    const sys = /^\/(?:usr\/)?s?bin\/([a-z]+)$/.exec(name);
    if (sys && (COMMANDS[sys[1]!] || BUILTINS.includes(sys[1]!))) return this.invoke([sys[1]!, ...argv.slice(1)], stdin, sink, tty);
    if (name.includes("/")) return this.runFile(name, [], sink, true);
    if (argv.length === 2 && argv[1] === "--help" && USAGE[name]) {
      this.help(name, sink);
      return 0;
    }
    switch (name) {
      case "hint": return this.hint();
      case "submit": return this.submit(argv.slice(1), sink);
      case "history": {
        this.st.history.forEach((h, i) => sink.out(`${String(i + 1).padStart(5)}  ${h}\n`));
        return 0;
      }
      case "clear": this.cleared = true; this.lines = []; return 0;
      case "help":
      case "commands": this.helpAll(sink); return 0;
      case "man": {
        if (!argv[1]) {
          sink.err("What manual page do you want? Try: man ls\n");
          return 1;
        }
        if (!USAGE[argv[1]]) {
          sink.err(`No manual entry for ${argv[1]}. Type help to see what works.\n`);
          return 16;
        }
        this.help(argv[1], sink);
        return 0;
      }
      case "exit":
      case "logout":
        sink.out("This practice shell stays open. Keep going.\n");
        return 0;
      case "bash":
      case "sh": {
        const file = argv.slice(1).find((a) => !a.startsWith("-"));
        if (!file) {
          sink.err(`${name}: give a script file to run, like: ${name} script.sh\n`);
          return 2;
        }
        return this.runFile(file, argv.slice(2), sink, false);
      }
      default:
    }
    const fn = COMMANDS[name];
    if (fn) {
      try {
        return fn(this.ctx(argv, stdin, sink, tty));
      } catch (error) {
        if (error instanceof BudgetError) throw error;
        sink.err(`${name}: something went wrong\n`);
        return 1;
      }
    }
    const note = NOT_HERE[name];
    if (note) {
      sink.err(`${name}: not available on this practice server. ${note}\n`);
      return 127;
    }
    sink.err(`bash: ${name}: command not found\n`);
    return 127;
  }

  /** Run a script file with the shell itself. `needExec` is true for ./script and false for bash script. */
  private runFile(path: string, _args: string[], sink: Sink, needExec: boolean): number {
    const abs = normalizePath(this.st.cwd, path, this.st.env.HOME ?? "/");
    const res = this.st.fs.walk(abs, this.st.user);
    if (!res.node) {
      sink.err(`bash: ${path}: ${ERR_TEXT[res.err ?? "ENOENT"]}\n`);
      return 127;
    }
    if (res.node.kind === "dir") {
      sink.err(`bash: ${path}: Is a directory\n`);
      return 126;
    }
    const node = res.node;
    if (!can(this.st.user, node, 4) || (needExec && !can(this.st.user, node, 1))) {
      sink.err(`bash: ${path}: Permission denied\n`);
      return 126;
    }
    if (this.depth >= MAX_DEPTH) {
      sink.err(`bash: ${path}: too many scripts running inside each other\n`);
      return 1;
    }
    this.depth++;
    const savedCwd = this.st.cwd;
    let code = 0;
    try {
      const lines = node.content.split("\n").slice(0, 80);
      for (const line of lines) {
        spend(1);
        const t = line.trim();
        if (t === "" || t.startsWith("#") || t.length > MAX_LINE) continue;
        code = this.runInner(t, sink);
      }
    } finally {
      this.depth--;
      this.st.cwd = savedCwd;
      this.st.env.PWD = savedCwd;
    }
    this.st.executed.push({ path: abs, code });
    return code;
  }

  // ---- game commands

  private hint(): number {
    const hints = this.mission.hints;
    if (this.hintsShown >= hints.length) {
      this.emit("sys", "No more hints. Read the objectives again and try a new command.");
      return 0;
    }
    this.hintsShown++;
    this.emit("sys", `Hint ${this.hintsShown} of ${hints.length}: ${hints[this.hintsShown - 1]}`);
    return 0;
  }

  private submit(args: string[], sink: Sink): number {
    const m = this.mission;
    if (!m.answer) {
      this.emit("sys", "This mission has no question to answer. Reach the goal with commands.");
      return 1;
    }
    if (args.length === 0) {
      sink.err("Usage: submit ANSWER\n");
      return 2;
    }
    const given = normalizeAnswer(args.join(" "));
    const toPath = (text: string) => normalizePath(this.st.cwd, text, this.st.env.HOME ?? "/");
    const ok = m.answer.some((a) => (m.pathAnswer ? toPath(a) === toPath(given === "" ? "." : args.join(" ").trim()) : normalizeAnswer(a) === given));
    if (ok) {
      this.st.answerOk = true;
      this.emit("sys", "Correct. Answer accepted.");
      return 0;
    }
    this.emit("sys", "Not quite. Look at the output again and try once more.");
    return 1;
  }

  private help(name: string, sink: Sink): void {
    const u = USAGE[name];
    if (!u) return;
    sink.out(`${name}: ${u.desc}\nUsage: ${u.usage}\n`);
  }

  private helpAll(sink: Sink): void {
    sink.out("Commands that work here (type man NAME for details):\n");
    const groups = new Map<string, string[]>();
    for (const [name, u] of Object.entries(USAGE)) groups.set(u.group, [...(groups.get(u.group) ?? []), name]);
    for (const [group, names] of groups) sink.out(`  ${group}: ${names.join(" ")}\n`);
    sink.out(SHELL_TIPS.map((t) => `  ${t}\n`).join(""));
  }
}

export function createShell(mission: Mission): Shell {
  return new Shell(mission);
}
