// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The commands of the practice shell. Each one is a small pure function of the shell state. They
// follow the real tools closely enough that what a player learns here works on a real server.
import {
  BLOCK, DAY, ERR_TEXT, baseName, can, diskUsage, dirName, formatTime, humanSize, joinPath, modeString, normalizePath, sizeOf,
  type Err, type VNode,
} from "./fs";
import { compilePatterns, globMatch, spend, type Matcher } from "./regex";
import type { Cmd, Ctx, Proc } from "./model";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function toLines(text: string): string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}
const fromLines = (lines: string[]): string => (lines.length ? lines.join("\n") + "\n" : "");

// ---------------------------------------------------------------- helpers

type OptSpec = { bool?: string; val?: string; long?: Record<string, string>; numeric?: boolean; stop?: boolean };
type Opts = { f: Set<string>; v: Map<string, string[]>; rest: string[]; num: string | null };

function parseOpts(c: Ctx, name: string, spec: OptSpec): Opts | null {
  const o: Opts = { f: new Set(), v: new Map(), rest: [], num: null };
  const bool = spec.bool ?? "";
  const val = spec.val ?? "";
  const args = c.args;
  const bad = (msg: string): null => {
    c.err(`${name}: ${msg}`);
    c.err(`Try 'man ${name}' to see how it works.`);
    return null;
  };
  const addVal = (k: string, v: string) => o.v.set(k, [...(o.v.get(k) ?? []), v]);
  let done = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (done || a === "-" || !a.startsWith("-")) {
      o.rest.push(a);
      if (spec.stop) done = true;
      continue;
    }
    if (a === "--") {
      done = true;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const long = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const letter = spec.long?.[long];
      if (!letter) return bad(`unrecognized option '--${long}'`);
      if (val.includes(letter)) {
        if (eq >= 0) addVal(letter, a.slice(eq + 1));
        else if (i + 1 < args.length) addVal(letter, args[++i]!);
        else return bad(`option '--${long}' requires an argument`);
      } else o.f.add(letter);
      continue;
    }
    for (let j = 1; j < a.length; j++) {
      const ch = a[j]!;
      if (bool.includes(ch)) o.f.add(ch);
      else if (val.includes(ch)) {
        const rest = a.slice(j + 1);
        if (rest) addVal(ch, rest);
        else if (i + 1 < args.length) addVal(ch, args[++i]!);
        else return bad(`option requires an argument -- '${ch}'`);
        break;
      } else if (spec.numeric && ch >= "0" && ch <= "9") {
        o.num = (o.num ?? "") + ch;
      } else return bad(`invalid option -- '${ch}'`);
    }
  }
  return o;
}

function absOf(c: Ctx, path: string): string {
  return normalizePath(c.st.cwd, path, c.st.env.HOME ?? "/");
}

/** Read a file for a command, printing the usual error when it cannot be read. */
function readText(c: Ctx, name: string, path: string): string | null {
  const res = c.st.fs.walk(absOf(c, path), c.st.user);
  if (!res.node) {
    c.err(`${name}: ${path}: ${ERR_TEXT[res.err ?? "ENOENT"]}`);
    return null;
  }
  if (res.node.kind === "dir") {
    c.err(`${name}: ${path}: Is a directory`);
    return null;
  }
  if (!can(c.st.user, res.node, 4)) {
    c.err(`${name}: ${path}: Permission denied`);
    return null;
  }
  return res.node.content;
}

/** Inputs for a filter command: the named files, or standard input. */
function inputs(c: Ctx, name: string, files: string[]): Array<{ name: string; text: string }> | null {
  if (files.length === 0) {
    if (c.stdin === null) {
      c.err(`${name}: no input. Give a file name or use a pipe, like: cat file | ${name}`);
      return null;
    }
    return [{ name: "-", text: c.stdin }];
  }
  const out: Array<{ name: string; text: string }> = [];
  let ok = true;
  for (const f of files) {
    if (f === "-" && c.stdin !== null) {
      out.push({ name: "-", text: c.stdin });
      continue;
    }
    const text = readText(c, name, f);
    if (text === null) ok = false;
    else out.push({ name: f, text });
  }
  return ok || out.length > 0 ? out : null;
}

const childList = (node: VNode): VNode[] => [...node.children.values()].sort((a, b) => cmp(a.name, b.name));
const isHidden = (name: string) => name.startsWith(".");
const nlink = (n: VNode) => (n.kind === "dir" ? 2 + [...n.children.values()].filter((x) => x.kind === "dir").length : 1);

// ---------------------------------------------------------------- navigation and listing

const pwd: Cmd = (c) => {
  c.out(c.st.cwd + "\n");
  return 0;
};

const cd: Cmd = (c) => {
  if (c.args.length > 1) {
    c.err("bash: cd: too many arguments");
    return 1;
  }
  let target = c.args[0] ?? c.st.env.HOME ?? "/";
  let show = false;
  if (target === "-") {
    target = c.st.oldpwd;
    show = true;
  }
  const abs = absOf(c, target);
  const res = c.st.fs.walk(abs, c.st.user);
  if (!res.node) {
    c.err(`bash: cd: ${c.args[0] ?? target}: ${ERR_TEXT[res.err ?? "ENOENT"]}`);
    return 1;
  }
  if (res.node.kind !== "dir") {
    c.err(`bash: cd: ${c.args[0]}: Not a directory`);
    return 1;
  }
  if (!can(c.st.user, res.node, 1)) {
    c.err(`bash: cd: ${c.args[0]}: Permission denied`);
    return 1;
  }
  c.st.oldpwd = c.st.cwd;
  c.st.cwd = abs;
  c.st.env.PWD = abs;
  c.st.env.OLDPWD = c.st.oldpwd;
  if (show) c.out(abs + "\n");
  return 0;
};

type Ent = { name: string; node: VNode };

const ls: Cmd = (c) => {
  const o = parseOpts(c, "ls", {
    bool: "lahARSrtd1",
    long: { all: "a", "almost-all": "A", "human-readable": "h", recursive: "R", reverse: "r", directory: "d" },
  });
  if (!o) return 2;
  const long = o.f.has("l");
  const human = o.f.has("h");
  const now = c.st.fs.now;
  let code = 0;

  const sortEnts = (ents: Ent[]) => {
    ents.sort((a, b) => {
      if (o.f.has("S")) return sizeOf(b.node) - sizeOf(a.node) || cmp(a.name, b.name);
      if (o.f.has("t")) return b.node.mtime - a.node.mtime || cmp(a.name, b.name);
      return cmp(a.name, b.name);
    });
    if (o.f.has("r")) ents.reverse();
  };

  const render = (ents: Ent[], withTotal: boolean): string => {
    if (!long) {
      if (c.tty && !o.f.has("1")) return ents.length ? ents.map((e) => e.name).join("  ") + "\n" : "";
      return ents.map((e) => e.name + "\n").join("");
    }
    const size = (n: VNode) => (human ? humanSize(sizeOf(n)) : String(sizeOf(n)));
    const rows = ents.map((e) => [modeString(e.node), String(nlink(e.node)), e.node.owner, e.node.group, size(e.node), formatTime(e.node.mtime, now), e.name]);
    const w = [1, 2, 3, 4].map((k) => Math.max(0, ...rows.map((r) => r[k]!.length)));
    let text = "";
    if (withTotal) {
      const kb = ents.reduce((sum, e) => sum + (e.node.kind === "dir" ? 4 : Math.ceil(sizeOf(e.node) / BLOCK) * 4), 0);
      text += `total ${human ? humanSize(kb * 1024) : kb}\n`;
    }
    for (const r of rows) text += `${r[0]} ${r[1]!.padStart(w[0]!)} ${r[2]!.padEnd(w[1]!)} ${r[3]!.padEnd(w[2]!)} ${r[4]!.padStart(w[3]!)} ${r[5]} ${r[6]}\n`;
    return text;
  };

  const sections: string[] = [];
  const listDir = (display: string, node: VNode, abs: string, header: boolean) => {
    if (!can(c.st.user, node, 4)) {
      c.err(`ls: cannot open directory '${display}': Permission denied`);
      code = 2;
      return;
    }
    let ents: Ent[] = [...node.children.values()].map((n) => ({ name: n.name, node: n }));
    if (!o.f.has("a") && !o.f.has("A")) ents = ents.filter((e) => !isHidden(e.name));
    if (o.f.has("a")) {
      const parent = c.st.fs.peek(dirName(abs)) ?? node;
      ents.push({ name: ".", node }, { name: "..", node: parent });
    }
    sortEnts(ents);
    sections.push((header ? `${display}:\n` : "") + render(ents, true));
    if (o.f.has("R")) {
      for (const child of childList(node)) {
        if (child.kind === "dir" && (!isHidden(child.name) || o.f.has("a") || o.f.has("A"))) {
          listDir(display === "/" ? "/" + child.name : `${display}/${child.name}`, child, joinPath(abs, child.name), true);
        }
      }
    }
  };

  const files: Ent[] = [];
  const dirs: Array<{ display: string; node: VNode; abs: string }> = [];
  for (const t of o.rest.length ? o.rest : ["."]) {
    const abs = absOf(c, t);
    const res = c.st.fs.walk(abs, c.st.user);
    if (!res.node) {
      c.err(`ls: cannot access '${t}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 2;
    } else if (res.node.kind === "dir" && !o.f.has("d")) dirs.push({ display: t, node: res.node, abs });
    else files.push({ name: t, node: res.node });
  }
  if (files.length) {
    sortEnts(files);
    sections.push(render(files, false));
  }
  const header = dirs.length + files.length > 1 || o.f.has("R");
  dirs.sort((a, b) => cmp(a.display, b.display));
  for (const d of dirs) listDir(d.display, d.node, d.abs, header && (dirs.length > 1 || files.length > 0 || o.f.has("R")));
  c.out(sections.join("\n"));
  return code;
};

// ---------------------------------------------------------------- reading files

const cat: Cmd = (c) => {
  const o = parseOpts(c, "cat", { bool: "nAbs", long: { number: "n" } });
  if (!o) return 1;
  const parts = inputs(c, "cat", o.rest);
  if (!parts) return 1;
  let code = o.rest.length > parts.length ? 1 : 0;
  let n = 0;
  for (const p of parts) {
    if (o.f.has("n")) {
      const lines = toLines(p.text);
      c.out(lines.map((l) => `${String(++n).padStart(6)}\t${l}\n`).join(""));
    } else c.out(p.text);
  }
  if (parts.length === 0) code = 1;
  return code;
};

function headTail(c: Ctx, name: "head" | "tail"): number {
  const o = parseOpts(c, name, { bool: "qvf", val: "nc", numeric: true, long: { lines: "n", bytes: "c" } });
  if (!o) return 1;
  const raw = o.v.get("n")?.[0] ?? o.num ?? "10";
  const bytes = o.v.get("c")?.[0];
  if (!/^[+-]?\d+$/.test(bytes ?? raw)) {
    c.err(`${name}: invalid number of ${bytes !== undefined ? "bytes" : "lines"}: '${bytes ?? raw}'`);
    return 1;
  }
  const parts = inputs(c, name, o.rest);
  if (!parts) return 1;
  const headers = parts.length > 1 && !o.f.has("q");
  parts.forEach((p, i) => {
    if (headers) c.out(`${i ? "\n" : ""}==> ${p.name === "-" ? "standard input" : p.name} <==\n`);
    if (bytes !== undefined) {
      const n = Math.abs(Number(bytes));
      c.out(name === "head" ? p.text.slice(0, n) : n === 0 ? "" : p.text.slice(-n));
      return;
    }
    const lines = toLines(p.text);
    const n = Math.abs(Number(raw));
    if (name === "head") c.out(fromLines(raw.startsWith("-") ? lines.slice(0, Math.max(0, lines.length - n)) : lines.slice(0, n)));
    else c.out(fromLines(raw.startsWith("+") ? lines.slice(Math.max(0, n - 1)) : n === 0 ? [] : lines.slice(-n)));
  });
  return 0;
}

// ---------------------------------------------------------------- searching


function grepCmd(c: Ctx, forceRecursive: boolean): number {
  const o = parseOpts(c, "grep", {
    bool: "ivnchrREFlowxqsHaIT",
    val: "e",
    long: {
      "ignore-case": "i", "invert-match": "v", "line-number": "n", count: "c", recursive: "r", "dereference-recursive": "R",
      "extended-regexp": "E", "fixed-strings": "F", "files-with-matches": "l", "only-matching": "o", "word-regexp": "w",
      "line-regexp": "x", "no-filename": "h", "with-filename": "H", quiet: "q", silent: "q", "no-messages": "s", regexp: "e",
    },
  });
  if (!o) return 2;
  const rest = [...o.rest];
  let patterns = (o.v.get("e") ?? []).flatMap((p) => p.split("\n"));
  if (patterns.length === 0) {
    const p = rest.shift();
    if (p === undefined) {
      c.err("Usage: grep [OPTION]... PATTERNS [FILE]...");
      return 2;
    }
    patterns = p.split("\n");
  }
  const recursive = forceRecursive || o.f.has("r") || o.f.has("R");
  const matcher = compilePatterns(patterns, {
    ere: o.f.has("E"), ignoreCase: o.f.has("i"), fixed: o.f.has("F"), word: o.f.has("w"), line: o.f.has("x"),
  });
  if ("error" in matcher) {
    c.err(`grep: ${matcher.error}`);
    return 2;
  }
  const invert = o.f.has("v");
  const count = o.f.has("c");
  const listFiles = o.f.has("l");
  const quiet = o.f.has("q");
  const only = o.f.has("o");
  let files = rest;
  let useStdin = false;
  if (files.length === 0) {
    if (recursive) files = ["."];
    else useStdin = true;
  }
  const showName = o.f.has("H") || (!o.f.has("h") && (files.length > 1 || recursive));
  const dotFree = recursive && rest.length === 0;
  let matchedAny = false;
  let errored = false;

  const scan = (label: string, text: string): void => {
    let hits = 0;
    const lines = toLines(text);
    const prefix = (n: number) => (showName ? label + ":" : "") + (o.f.has("n") ? n + ":" : "");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      spend(1);
      const m = (matcher as Matcher).test(line);
      if (m === invert) continue;
      hits++;
      matchedAny = true;
      if (quiet) return;
      if (listFiles) break;
      if (count) continue;
      if (only && !invert) {
        let from = 0;
        while (from <= line.length) {
          const r = (matcher as Matcher).find(line, from);
          if (!r) break;
          if (r[1] > r[0]) c.out(prefix(i + 1) + line.slice(r[0], r[1]) + "\n");
          from = r[1] > r[0] ? r[1] : r[1] + 1;
        }
      } else c.out(prefix(i + 1) + line + "\n");
    }
    if (listFiles && hits > 0) c.out(label + "\n");
    else if (count) c.out((showName ? label + ":" : "") + hits + "\n");
  };

  const walkFiles = (abs: string, display: string, node: VNode): void => {
    if (node.kind === "file") {
      if (!can(c.st.user, node, 4)) {
        if (!o.f.has("s")) c.err(`grep: ${display}: Permission denied`);
        errored = true;
        return;
      }
      scan(display, node.content);
      return;
    }
    if (!recursive) {
      if (!o.f.has("s")) c.err(`grep: ${display}: Is a directory`);
      errored = true;
      return;
    }
    if (!can(c.st.user, node, 4) || !can(c.st.user, node, 1)) {
      if (!o.f.has("s")) c.err(`grep: ${display}: Permission denied`);
      errored = true;
      return;
    }
    for (const child of childList(node)) {
      walkFiles(joinPath(abs, child.name), display === "." && dotFree ? child.name : display === "/" ? "/" + child.name : `${display}/${child.name}`, child);
    }
  };

  if (useStdin) {
    if (c.stdin === null) {
      c.err("grep: no input. Give a file name or use a pipe, like: cat file | grep word");
      return 2;
    }
    scan("(standard input)", c.stdin);
  } else {
    for (const f of files) {
      const abs = absOf(c, f);
      const res = c.st.fs.walk(abs, c.st.user);
      if (!res.node) {
        if (!o.f.has("s")) c.err(`grep: ${f}: ${ERR_TEXT[res.err ?? "ENOENT"]}`);
        errored = true;
        continue;
      }
      walkFiles(abs, f, res.node);
    }
  }
  return matchedAny ? 0 : errored ? 2 : 1;
}

class FindError extends Error {}

type FindItem = { node: VNode; abs: string; display: string; depth: number };

const find: Cmd = (c) => {
  const args = c.args;
  let i = 0;
  const starts: string[] = [];
  while (i < args.length && !args[i]!.startsWith("-") && args[i] !== "!" && args[i] !== "(") starts.push(args[i++]!);
  if (starts.length === 0) starts.push(".");
  const tokens = args.slice(i);
  let maxDepth = Infinity;
  let minDepth = 0;
  let hasAction = false;
  let hasDelete = false;
  let code = 0;
  const now = c.st.fs.now;
  let p = 0;

  const need = (name: string): string => {
    const v = tokens[p++];
    if (v === undefined) throw new FindError(`missing argument to '${name}'`);
    return v;
  };

  const orExpr = (): ((f: FindItem) => boolean) => {
    let left = andExpr();
    while (tokens[p] === "-o" || tokens[p] === "-or") {
      p++;
      const l = left;
      const r = andExpr();
      left = (f) => l(f) || r(f);
    }
    return left;
  };
  const andExpr = (): ((f: FindItem) => boolean) => {
    let left = unary();
    while (p < tokens.length && tokens[p] !== "-o" && tokens[p] !== "-or" && tokens[p] !== ")") {
      if (tokens[p] === "-a" || tokens[p] === "-and") p++;
      const l = left;
      const r = unary();
      left = (f) => l(f) && r(f);
    }
    return left;
  };
  const unary = (): ((f: FindItem) => boolean) => {
    const t = tokens[p];
    if (t === "!" || t === "-not") {
      p++;
      const inner = unary();
      return (f) => !inner(f);
    }
    if (t === "(") {
      p++;
      const inner = orExpr();
      if (tokens[p] !== ")") throw new FindError("missing closing ')'");
      p++;
      return inner;
    }
    return primary();
  };

  const numTest = (spec: string, value: number): boolean => {
    const m = /^([+-]?)(\d+)$/.exec(spec);
    if (!m) throw new FindError(`invalid argument '${spec}'`);
    const n = Number(m[2]);
    return m[1] === "+" ? value > n : m[1] === "-" ? value < n : value === n;
  };

  const primary = (): ((f: FindItem) => boolean) => {
    const t = tokens[p++];
    switch (t) {
      case "-name": { const pat = need(t); return (f) => globMatch(pat, baseName(f.display) || f.display); }
      case "-iname": { const pat = need(t); return (f) => globMatch(pat, baseName(f.display) || f.display, true); }
      case "-path": { const pat = need(t); return (f) => globMatch(pat, f.display); }
      case "-type": {
        const k = need(t);
        if (k !== "f" && k !== "d") throw new FindError(`Unknown argument to -type: ${k}`);
        return (f) => (k === "f" ? f.node.kind === "file" : f.node.kind === "dir");
      }
      case "-size": {
        const spec = need(t);
        const m = /^([+-]?)(\d+)([cwbkMG]?)$/.exec(spec);
        if (!m) throw new FindError(`invalid argument '${spec}' to '-size'`);
        const unit = { c: 1, w: 2, b: 512, "": 512, k: 1024, M: 1048576, G: 1073741824 }[m[3] as "c"]!;
        const n = Number(m[2]);
        return (f) => {
          const units = Math.ceil(sizeOf(f.node) / unit);
          return m[1] === "+" ? units > n : m[1] === "-" ? units < n : units === n;
        };
      }
      case "-mtime": { const spec = need(t); numTest(spec, 0); return (f) => numTest(spec, Math.floor((now - f.node.mtime) / DAY)); }
      case "-mmin": { const spec = need(t); numTest(spec, 0); return (f) => numTest(spec, Math.floor((now - f.node.mtime) / 60)); }
      case "-user": { const u = need(t); return (f) => f.node.owner === u; }
      case "-empty": return (f) => (f.node.kind === "dir" ? f.node.children.size === 0 : sizeOf(f.node) === 0);
      case "-maxdepth": { maxDepth = Number(need(t)); if (!Number.isFinite(maxDepth) || maxDepth < 0) throw new FindError("Expected a positive decimal integer argument to -maxdepth"); return () => true; }
      case "-mindepth": { minDepth = Number(need(t)); if (!Number.isFinite(minDepth) || minDepth < 0) throw new FindError("Expected a positive decimal integer argument to -mindepth"); return () => true; }
      case "-print": hasAction = true; return (f) => (c.out(f.display + "\n"), true);
      case "-delete": {
        hasAction = true;
        hasDelete = true;
        return (f) => {
          if (f.node.kind === "dir" && f.node.children.size > 0) {
            c.err(`find: cannot delete '${f.display}': Directory not empty`);
            code = 1;
            return false;
          }
          const e = c.st.fs.remove(f.abs, c.st.user);
          if (e) {
            c.err(`find: cannot delete '${f.display}': ${ERR_TEXT[e]}`);
            code = 1;
            return false;
          }
          return true;
        };
      }
      case "-exec": {
        hasAction = true;
        const argv: string[] = [];
        for (;;) {
          const a = tokens[p++];
          if (a === undefined) throw new FindError("missing argument to '-exec'");
          if (a === ";" || a === "+") break;
          argv.push(a);
        }
        if (argv.length === 0) throw new FindError("missing argument to '-exec'");
        return (f) => {
          const r = c.exec(argv.map((a) => a.split("{}").join(f.display)), null);
          c.out(r.out);
          return r.code === 0;
        };
      }
      default:
        throw new FindError(`unknown predicate '${t}'`);
    }
  };

  let expr: (f: FindItem) => boolean;
  try {
    expr = tokens.length ? orExpr() : () => true;
    if (p < tokens.length) throw new FindError(`paths must precede expression: '${tokens[p]}'`);
  } catch (error) {
    if (error instanceof FindError) {
      c.err(`find: ${error.message}`);
      return 1;
    }
    throw error;
  }
  const finalExpr = hasAction ? expr : (f: FindItem) => (expr(f) ? (c.out(f.display + "\n"), true) : false);

  const visit = (item: FindItem): void => {
    spend(1);
    const { node } = item;
    const inDepth = item.depth >= minDepth;
    if (!hasDelete && inDepth) finalExpr(item);
    if (node.kind === "dir" && item.depth < maxDepth) {
      if (!can(c.st.user, node, 4) || !can(c.st.user, node, 1)) {
        c.err(`find: '${item.display}': Permission denied`);
        code = 1;
      } else {
        for (const child of childList(node)) {
          visit({
            node: child,
            abs: joinPath(item.abs, child.name),
            display: item.display.endsWith("/") ? item.display + child.name : item.display + "/" + child.name,
            depth: item.depth + 1,
          });
        }
      }
    }
    if (hasDelete && inDepth) finalExpr(item);
  };

  for (const s of starts) {
    const abs = absOf(c, s);
    const res = c.st.fs.walk(abs, c.st.user);
    if (!res.node) {
      c.err(`find: '${s}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    visit({ node: res.node, abs, display: s, depth: 0 });
  }
  return code;
};

// ---------------------------------------------------------------- text filters

function wc(c: Ctx): number {
  const o = parseOpts(c, "wc", { bool: "lwcm", long: { lines: "l", words: "w", bytes: "c", chars: "m" } });
  if (!o) return 1;
  const parts = inputs(c, "wc", o.rest);
  if (!parts) return 1;
  let showL = o.f.has("l");
  let showW = o.f.has("w");
  let showC = o.f.has("c") || o.f.has("m");
  if (!showL && !showW && !showC) showL = showW = showC = true;
  const rows = parts.map((p) => ({
    name: p.name === "-" && o.rest.length === 0 ? "" : p.name,
    l: (p.text.match(/\n/g) ?? []).length,
    w: p.text.split(/\s+/).filter(Boolean).length,
    c: p.text.length,
  }));
  if (rows.length > 1) rows.push({ name: "total", l: rows.reduce((a, r) => a + r.l, 0), w: rows.reduce((a, r) => a + r.w, 0), c: rows.reduce((a, r) => a + r.c, 0) });
  const shown = [showL, showW, showC].filter(Boolean).length;
  const width = shown === 1 && rows.length === 1 ? 0 : o.rest.length === 0 ? 7 : Math.max(...rows.map((r) => String(r.c).length));
  for (const r of rows) {
    const cols: string[] = [];
    if (showL) cols.push(String(r.l).padStart(width));
    if (showW) cols.push(String(r.w).padStart(width));
    if (showC) cols.push(String(r.c).padStart(width));
    c.out(cols.join(" ") + (r.name ? " " + r.name : "") + "\n");
  }
  return 0;
}

function numberOf(text: string): number {
  const m = /^\s*([+-]?\d*\.?\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

function humanNumber(text: string): number {
  const m = /^\s*(\d*\.?\d+)\s*([KMGT]?)/i.exec(text);
  if (!m) return 0;
  return Number(m[1]) * ({ "": 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[m[2]!.toUpperCase() as ""] ?? 1);
}

function sort(c: Ctx): number {
  const o = parseOpts(c, "sort", { bool: "rnuhfsb", val: "kt", long: { reverse: "r", "numeric-sort": "n", unique: "u", "human-numeric-sort": "h", "ignore-case": "f" } });
  if (!o) return 2;
  const parts = inputs(c, "sort", o.rest);
  if (!parts) return 2;
  const lines = parts.flatMap((p) => toLines(p.text));
  const sep = o.v.get("t")?.[0];
  const keySpec = o.v.get("k")?.[0];
  let km: RegExpExecArray | null = null;
  if (keySpec !== undefined) {
    km = /^(\d+)(?:\.\d+)?[bnrhf]*(?:,(\d+)(?:\.\d+)?)?([bnrhf]*)$/.exec(keySpec);
    if (!km) {
      c.err(`sort: invalid field specification '${keySpec}'`);
      return 2;
    }
  }
  const mods = (km ? keySpec!.replace(/[\d.,]/g, "") : "") + "";
  const numeric = o.f.has("n") || mods.includes("n");
  const human = o.f.has("h") || mods.includes("h");
  const fold = o.f.has("f") || mods.includes("f");
  const keyOf = (line: string): string => {
    if (!km) return line;
    const fields = sep ? line.split(sep) : line.trim().split(/\s+/);
    const from = Number(km[1]) - 1;
    const to = km[2] ? Number(km[2]) : from + 1;
    return fields.slice(from, to).join(sep ?? " ");
  };
  const keyed = lines.map((line) => ({ line, key: keyOf(line) }));
  keyed.sort((a, b) => {
    let r = 0;
    if (human) r = humanNumber(a.key) - humanNumber(b.key);
    else if (numeric) r = numberOf(a.key) - numberOf(b.key);
    else r = fold ? cmp(a.key.toLowerCase(), b.key.toLowerCase()) : cmp(a.key, b.key);
    if (r === 0 && !o.f.has("s")) r = cmp(a.line, b.line);
    return o.f.has("r") || mods.includes("r") ? -r : r;
  });
  let out = keyed.map((k) => k.line);
  if (o.f.has("u")) out = out.filter((l, i) => i === 0 || l !== out[i - 1]);
  c.out(fromLines(out));
  return 0;
}

function uniq(c: Ctx): number {
  const o = parseOpts(c, "uniq", { bool: "cduiD", long: { count: "c", repeated: "d", unique: "u", "ignore-case": "i" } });
  if (!o) return 1;
  const parts = inputs(c, "uniq", o.rest.slice(0, 1));
  if (!parts) return 1;
  const lines = toLines(parts[0]!.text);
  const same = (a: string, b: string) => (o.f.has("i") ? a.toLowerCase() === b.toLowerCase() : a === b);
  const groups: Array<{ line: string; n: number }> = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && same(last.line, line)) last.n++;
    else groups.push({ line, n: 1 });
  }
  for (const g of groups) {
    if (o.f.has("d") && g.n < 2) continue;
    if (o.f.has("u") && g.n > 1) continue;
    c.out((o.f.has("c") ? String(g.n).padStart(7) + " " : "") + g.line + "\n");
  }
  return 0;
}

function parseRanges(spec: string): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const part of spec.split(",")) {
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m || part === "" || part === "-") return null;
    const a = m[1] === "" ? 1 : Number(m[1]);
    const b = m[2] === "" ? a : m[3] === "" ? Infinity : Number(m[3]);
    if (a < 1) return null;
    out.push([a, b]);
  }
  return out;
}

function cut(c: Ctx): number {
  const o = parseOpts(c, "cut", { bool: "s", val: "dfc", long: { delimiter: "d", fields: "f", characters: "c", "only-delimited": "s" } });
  if (!o) return 1;
  const fSpec = o.v.get("f")?.[0];
  const cSpec = o.v.get("c")?.[0];
  if (fSpec === undefined && cSpec === undefined) {
    c.err("cut: you must specify a list of bytes, characters, or fields");
    return 1;
  }
  const ranges = parseRanges((fSpec ?? cSpec)!);
  if (!ranges) {
    c.err("cut: invalid field range");
    return 1;
  }
  const delim = o.v.get("d")?.[0] ?? "\t";
  if (delim.length !== 1) {
    c.err("cut: the delimiter must be a single character");
    return 1;
  }
  const parts = inputs(c, "cut", o.rest);
  if (!parts) return 1;
  const pick = (idx: number) => ranges.some(([a, b]) => idx >= a && idx <= b);
  for (const p of parts) {
    for (const line of toLines(p.text)) {
      if (fSpec === undefined) c.out([...line].filter((_, i) => pick(i + 1)).join("") + "\n");
      else if (!line.includes(delim)) {
        if (!o.f.has("s")) c.out(line + "\n");
      } else c.out(line.split(delim).filter((_, i) => pick(i + 1)).join(delim) + "\n");
    }
  }
  return 0;
}

function awk(c: Ctx): number {
  const o = parseOpts(c, "awk", { val: "F", stop: false });
  if (!o) return 1;
  const prog = o.rest[0];
  const m = prog === undefined ? null : /^\s*\{\s*print\b([\s\S]*)\}\s*$/.exec(prog);
  if (!m) {
    c.err("awk: this practice shell only runs programs like '{print $1}' or '{print $1, $3}'");
    return 1;
  }
  // The print list: items separated by commas (a space between them) or written side by side.
  const items: Array<{ kind: "field"; n: number | "NF" } | { kind: "nr" } | { kind: "nf" } | { kind: "str"; v: string } | { kind: "comma" }> = [];
  const src = m[1]!.trim();
  const re = /\$(\d+|NF)|"((?:[^"\\]|\\.)*)"|\bNR\b|\bNF\b|(,)/g;
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(src))) {
    if (src.slice(last, mm.index).trim() !== "") {
      c.err("awk: this practice shell only runs programs like '{print $1}' or '{print $1, $3}'");
      return 1;
    }
    last = re.lastIndex;
    if (mm[1] !== undefined) items.push({ kind: "field", n: mm[1] === "NF" ? "NF" : Number(mm[1]) });
    else if (mm[2] !== undefined) items.push({ kind: "str", v: mm[2].replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(.)/g, "$1") });
    else if (mm[3] !== undefined) items.push({ kind: "comma" });
    else items.push(mm[0] === "NR" ? { kind: "nr" } : { kind: "nf" });
  }
  if (src.slice(last).trim() !== "") {
    c.err("awk: this practice shell only runs programs like '{print $1}' or '{print $1, $3}'");
    return 1;
  }
  const sep = o.v.get("F")?.[0];
  const parts = inputs(c, "awk", o.rest.slice(1));
  if (!parts) return 1;
  let nr = 0;
  for (const p of parts) {
    for (const line of toLines(p.text)) {
      nr++;
      const fields = sep === undefined || sep === " " ? line.trim().split(/\s+/).filter(Boolean) : line.split(sep.length === 1 ? sep : new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      const field = (n: number | "NF") => (n === "NF" ? fields[fields.length - 1] ?? "" : n === 0 ? line : fields[n - 1] ?? "");
      if (items.length === 0) {
        c.out(line + "\n");
        continue;
      }
      let outLine = "";
      for (const it of items) {
        if (it.kind === "comma") outLine += " ";
        else if (it.kind === "field") outLine += field(it.n);
        else if (it.kind === "str") outLine += it.v;
        else if (it.kind === "nr") outLine += nr;
        else outLine += fields.length;
      }
      c.out(outLine + "\n");
    }
  }
  return 0;
}

type SedCmd = { from?: number; to?: number; re?: Matcher; kind: "s" | "d" | "p"; sub?: { m: Matcher; repl: string; global: boolean } };

function sed(c: Ctx): number {
  const o = parseOpts(c, "sed", { bool: "inErE", val: "e", long: { quiet: "n", silent: "n", "in-place": "i", "regexp-extended": "E" } });
  if (!o) return 1;
  const rest = [...o.rest];
  const scripts = o.v.get("e") ?? [];
  if (scripts.length === 0) {
    const s = rest.shift();
    if (s === undefined) {
      c.err("Usage: sed [OPTION]... {script} [input-file]...");
      return 1;
    }
    scripts.push(s);
  }
  const ere = o.f.has("E") || o.f.has("r");
  const cmds: SedCmd[] = [];
  const bad = (msg: string): number => {
    c.err(`sed: ${msg}`);
    return 1;
  };
  for (const script of scripts.flatMap((s) => s.split("\n"))) {
    const text = script.trim();
    if (!text) continue;
    let i = 0;
    const cmd: SedCmd = { kind: "p" };
    const num = /^(\d+)(?:,(\d+))?/.exec(text);
    if (num) {
      cmd.from = Number(num[1]);
      cmd.to = num[2] ? Number(num[2]) : cmd.from;
      i = num[0].length;
    } else if (text[0] === "/") {
      const end = text.indexOf("/", 1);
      if (end < 0) return bad("unterminated address regex");
      const m = compilePatterns([text.slice(1, end)], { ere, ignoreCase: false });
      if ("error" in m) return bad(m.error);
      cmd.re = m;
      i = end + 1;
    }
    const k = text[i];
    if (k === "d" || k === "p") {
      cmd.kind = k;
      cmds.push(cmd);
    } else if (k === "s") {
      const delim = text[i + 1];
      if (!delim) return bad("unterminated `s' command");
      const fields: string[] = [];
      let cur = "";
      let j = i + 2;
      for (; j < text.length && fields.length < 2; j++) {
        const ch = text[j]!;
        if (ch === "\\" && j + 1 < text.length) {
          if (text[j + 1] === delim) cur += delim;
          else cur += ch + text[j + 1];
          j++;
        } else if (ch === delim) {
          fields.push(cur);
          cur = "";
        } else cur += ch;
      }
      if (fields.length < 2) return bad("unterminated `s' command");
      const flags = text.slice(j);
      const m = compilePatterns([fields[0]!], { ere, ignoreCase: flags.includes("i") });
      if ("error" in m) return bad(m.error);
      cmd.kind = "s";
      cmd.sub = { m, repl: fields[1]!, global: flags.includes("g") };
      cmds.push(cmd);
    } else return bad(`unknown command: '${k ?? ""}' (this practice shell knows s, d and p)`);
  }
  const apply = (text: string): string => {
    let n = 0;
    const out: string[] = [];
    for (let line of toLines(text)) {
      n++;
      let deleted = false;
      let printed = false;
      for (const cm of cmds) {
        const hit = cm.from !== undefined ? n >= cm.from && n <= (cm.to ?? cm.from) : cm.re ? cm.re.test(line) : true;
        if (!hit) continue;
        if (cm.kind === "d") {
          deleted = true;
          break;
        }
        if (cm.kind === "p") {
          out.push(line);
          printed = true;
        } else if (cm.sub) {
          let result = "";
          let pos = 0;
          let from = 0;
          for (;;) {
            spend(1);
            const r = cm.sub.m.find(line, from);
            if (!r) break;
            result += line.slice(pos, r[0]) + cm.sub.repl.replace(/\\(.)|&/g, (all, esc?: string) => (all === "&" ? line.slice(r[0], r[1]) : esc === "n" ? "\n" : esc ?? ""));
            pos = r[1];
            from = r[1] > r[0] ? r[1] : r[1] + 1;
            if (r[1] === r[0] && r[0] < line.length) {
              result += line[r[0]];
              pos = r[0] + 1;
            }
            if (!cm.sub.global || from > line.length) break;
          }
          line = result + line.slice(pos);
        }
      }
      if (!deleted && !o.f.has("n")) out.push(line);
      void printed;
    }
    return fromLines(out);
  };
  if (o.f.has("i")) {
    if (rest.length === 0) return bad("no input files");
    let code = 0;
    for (const f of rest) {
      const text = readText(c, "sed", f);
      if (text === null) {
        code = 1;
        continue;
      }
      const e = c.st.fs.writeFile(absOf(c, f), c.st.user, apply(text), false);
      if (e) {
        c.err(`sed: couldn't open temporary file for '${f}': ${ERR_TEXT[e]}`);
        code = 1;
      }
    }
    return code;
  }
  const parts = inputs(c, "sed", rest);
  if (!parts) return 1;
  for (const p of parts) c.out(apply(p.text));
  return 0;
}

// ---------------------------------------------------------------- changing files

function echo(c: Ctx): number {
  let args = c.args;
  let newline = true;
  let escapes = false;
  while (args[0] && /^-[neE]+$/.test(args[0])) {
    if (args[0].includes("n")) newline = false;
    if (args[0].includes("e")) escapes = true;
    if (args[0].includes("E")) escapes = false;
    args = args.slice(1);
  }
  let text = args.join(" ");
  if (escapes) text = text.replace(/\\(n|t|\\)/g, (_, k: string) => (k === "n" ? "\n" : k === "t" ? "\t" : "\\"));
  c.out(text + (newline ? "\n" : ""));
  return 0;
}

function touch(c: Ctx): number {
  const o = parseOpts(c, "touch", { bool: "c" });
  if (!o) return 1;
  if (o.rest.length === 0) {
    c.err("touch: missing file operand");
    return 1;
  }
  let code = 0;
  for (const f of o.rest) {
    const abs = absOf(c, f);
    const res = c.st.fs.walk(abs, c.st.user);
    if (res.node) {
      if (!can(c.st.user, res.node, 2) && res.node.owner !== c.st.user.name) {
        c.err(`touch: cannot touch '${f}': Permission denied`);
        code = 1;
      } else res.node.mtime = c.st.fs.now;
      continue;
    }
    if (o.f.has("c")) continue;
    const e = res.err === "ENOENT" ? c.st.fs.writeFile(abs, c.st.user, "", false) : res.err;
    if (e) {
      c.err(`touch: cannot touch '${f}': ${ERR_TEXT[e]}`);
      code = 1;
    }
  }
  return code;
}

function mkdir(c: Ctx): number {
  const o = parseOpts(c, "mkdir", { bool: "pv", long: { parents: "p" } });
  if (!o) return 1;
  if (o.rest.length === 0) {
    c.err("mkdir: missing operand");
    return 1;
  }
  let code = 0;
  for (const f of o.rest) {
    const abs = absOf(c, f);
    if (o.f.has("p")) {
      let cur = "";
      let failed: Err | null = null;
      for (const part of abs.split("/").filter(Boolean)) {
        cur += "/" + part;
        const res = c.st.fs.walk(cur, c.st.user);
        if (res.node) {
          if (res.node.kind !== "dir") failed = "ENOTDIR";
          continue;
        }
        if (res.err !== "ENOENT") {
          failed = res.err;
          break;
        }
        failed = c.st.fs.mkdir(cur, c.st.user);
        if (failed) break;
      }
      if (failed) {
        c.err(`mkdir: cannot create directory '${f}': ${ERR_TEXT[failed]}`);
        code = 1;
      }
      continue;
    }
    const e = c.st.fs.mkdir(abs, c.st.user);
    if (e) {
      c.err(`mkdir: cannot create directory '${f}': ${ERR_TEXT[e]}`);
      code = 1;
    }
  }
  return code;
}

function rm(c: Ctx): number {
  const o = parseOpts(c, "rm", { bool: "rRfvid", long: { recursive: "r", force: "f", verbose: "v" } });
  if (!o) return 1;
  if (o.rest.length === 0) {
    if (!o.f.has("f")) c.err("rm: missing operand");
    return o.f.has("f") ? 0 : 1;
  }
  const recursive = o.f.has("r") || o.f.has("R");
  let code = 0;
  for (const f of o.rest) {
    const abs = absOf(c, f);
    if (baseName(f) === "." || baseName(f) === "..") {
      c.err(`rm: refusing to remove '.' or '..' directory: skipping '${f}'`);
      code = 1;
      continue;
    }
    if (abs === "/") {
      c.err("rm: it is dangerous to operate recursively on '/'");
      c.err("rm: use --no-preserve-root to override this failsafe");
      code = 1;
      continue;
    }
    const res = c.st.fs.walk(abs, c.st.user);
    if (!res.node) {
      if (!(o.f.has("f") && res.err === "ENOENT")) {
        c.err(`rm: cannot remove '${f}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
        code = 1;
      }
      continue;
    }
    if (res.node.kind === "dir" && !recursive) {
      c.err(`rm: cannot remove '${f}': Is a directory`);
      code = 1;
      continue;
    }
    const e = c.st.fs.remove(abs, c.st.user);
    if (e) {
      if (!o.f.has("f")) c.err(`rm: cannot remove '${f}': ${ERR_TEXT[e]}`);
      code = 1;
    } else if (o.f.has("v")) c.out(`removed '${f}'\n`);
    if (!e && (abs === c.st.cwd || c.st.cwd.startsWith(abs + "/"))) c.st.cwd = dirName(abs);
  }
  return code;
}

/** For cp and mv: where does each source go? */
function destinations(c: Ctx, name: string, srcs: string[], dest: string): Array<{ src: string; target: string; display: string }> | null {
  const dabs = absOf(c, dest);
  const res = c.st.fs.walk(dabs, c.st.user);
  const isDir = !!res.node && res.node.kind === "dir";
  if (srcs.length > 1 && !isDir) {
    c.err(`${name}: target '${dest}' is not a directory`);
    return null;
  }
  return srcs.map((s) => {
    const sabs = absOf(c, s);
    return isDir
      ? { src: s, target: joinPath(dabs, baseName(sabs)), display: dest.endsWith("/") ? dest + baseName(sabs) : dest + "/" + baseName(sabs) }
      : { src: s, target: dabs, display: dest };
  });
}

function cp(c: Ctx): number {
  const o = parseOpts(c, "cp", { bool: "rRapfvin", long: { recursive: "r", verbose: "v", archive: "a" } });
  if (!o) return 1;
  if (o.rest.length < 2) {
    c.err(o.rest.length === 0 ? "cp: missing file operand" : `cp: missing destination file operand after '${o.rest[0]}'`);
    return 1;
  }
  const dest = o.rest[o.rest.length - 1]!;
  const dests = destinations(c, "cp", o.rest.slice(0, -1), dest);
  if (!dests) return 1;
  const recursive = o.f.has("r") || o.f.has("R") || o.f.has("a");
  let code = 0;
  for (const d of dests) {
    const sabs = absOf(c, d.src);
    const res = c.st.fs.walk(sabs, c.st.user);
    if (!res.node) {
      c.err(`cp: cannot stat '${d.src}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    if (res.node.kind === "dir" && !recursive) {
      c.err(`cp: -r not specified; omitting directory '${d.src}'`);
      code = 1;
      continue;
    }
    if (sabs === d.target) {
      c.err(`cp: '${d.src}' and '${d.display}' are the same file`);
      code = 1;
      continue;
    }
    if (res.node.kind === "dir" && d.target.startsWith(sabs + "/")) {
      c.err(`cp: cannot copy a directory, '${d.src}', into itself, '${d.display}'`);
      code = 1;
      continue;
    }
    if (res.node.kind === "file" && !can(c.st.user, res.node, 4)) {
      c.err(`cp: cannot open '${d.src}' for reading: Permission denied`);
      code = 1;
      continue;
    }
    const e = c.st.fs.copy(res.node, d.target, c.st.user);
    if (e) {
      const what = res.node.kind === "dir" ? "directory" : "regular file";
      c.err(e === "EISDIR" ? `cp: cannot overwrite directory '${d.display}' with non-directory` : `cp: cannot create ${what} '${d.display}': ${ERR_TEXT[e]}`);
      code = 1;
    } else if (o.f.has("v")) c.out(`'${d.src}' -> '${d.display}'\n`);
  }
  return code;
}

function mv(c: Ctx): number {
  const o = parseOpts(c, "mv", { bool: "fvin", long: { verbose: "v", force: "f" } });
  if (!o) return 1;
  if (o.rest.length < 2) {
    c.err(o.rest.length === 0 ? "mv: missing file operand" : `mv: missing destination file operand after '${o.rest[0]}'`);
    return 1;
  }
  const dest = o.rest[o.rest.length - 1]!;
  const dests = destinations(c, "mv", o.rest.slice(0, -1), dest);
  if (!dests) return 1;
  let code = 0;
  for (const d of dests) {
    const sabs = absOf(c, d.src);
    const res = c.st.fs.walk(sabs, c.st.user);
    if (!res.node) {
      c.err(`mv: cannot stat '${d.src}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    if (sabs === d.target) {
      c.err(`mv: '${d.src}' and '${d.display}' are the same file`);
      code = 1;
      continue;
    }
    const e = c.st.fs.move(sabs, d.target, c.st.user);
    if (e) {
      c.err(
        e === "EINVAL"
          ? `mv: cannot move '${d.src}' to a subdirectory of itself, '${d.display}'`
          : e === "EEXIST"
            ? `mv: cannot move '${d.src}' to '${d.display}': Directory not empty`
            : `mv: cannot move '${d.src}' to '${d.display}': ${ERR_TEXT[e]}`,
      );
      code = 1;
    } else if (o.f.has("v")) c.out(`renamed '${d.src}' -> '${d.display}'\n`);
    if (!e && (sabs === c.st.cwd || c.st.cwd.startsWith(sabs + "/"))) c.st.cwd = dirName(sabs);
  }
  return code;
}

function applyMode(spec: string, node: VNode): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8) & 0o777;
  let mode = node.mode;
  for (const clause of spec.split(",")) {
    const m = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(clause);
    if (!m) return null;
    const who = m[1] === "" ? "a" : m[1]!;
    let bits = 0;
    for (const ch of m[3]!) bits |= ch === "r" ? 4 : ch === "w" ? 2 : ch === "x" ? 1 : ch === "X" && (node.kind === "dir" || (node.mode & 0o111) !== 0) ? 1 : 0;
    let mask = 0;
    for (const w of who.includes("a") ? "ugo" : who) mask |= (bits << (w === "u" ? 6 : w === "g" ? 3 : 0));
    const clear = (who.includes("a") ? 0o777 : [...who].reduce((a, w) => a | (7 << (w === "u" ? 6 : w === "g" ? 3 : 0)), 0));
    if (m[2] === "+") mode |= mask;
    else if (m[2] === "-") mode &= ~mask;
    else mode = (mode & ~clear) | mask;
  }
  return mode & 0o777;
}

function chmod(c: Ctx): number {
  // A mode such as "-x" looks like an option, so take the mode out first.
  const args = c.args.filter((a) => a !== "-R" && a !== "-v" && a !== "--recursive");
  const recursive = args.length !== c.args.length && c.args.some((a) => a === "-R" || a === "--recursive");
  if (args.length === 0) {
    c.err("chmod: missing operand");
    return 1;
  }
  const mode = args[0]!;
  const files = args.slice(1);
  if (files.length === 0) {
    c.err(`chmod: missing operand after '${mode}'`);
    return 1;
  }
  let code = 0;
  const setNode = (node: VNode, display: string): boolean => {
    const next = applyMode(mode, node);
    if (next === null) {
      c.err(`chmod: invalid mode: '${mode}'`);
      c.err("Try 'man chmod' to see how it works.");
      return false;
    }
    if (c.st.user.name !== "root" && node.owner !== c.st.user.name) {
      c.err(`chmod: changing permissions of '${display}': Operation not permitted`);
      code = 1;
      return true;
    }
    node.mode = next;
    return true;
  };
  const walk = (node: VNode, display: string): boolean => {
    if (!setNode(node, display)) return false;
    if (recursive && node.kind === "dir") for (const ch of childList(node)) if (!walk(ch, `${display}/${ch.name}`)) return false;
    return true;
  };
  for (const f of files) {
    const res = c.st.fs.walk(absOf(c, f), c.st.user);
    if (!res.node) {
      c.err(`chmod: cannot access '${f}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    if (!walk(res.node, f)) return 1;
  }
  return code;
}

function chown(c: Ctx): number {
  const o = parseOpts(c, "chown", { bool: "R" });
  if (!o) return 1;
  if (o.rest.length < 2) {
    c.err(o.rest.length ? `chown: missing operand after '${o.rest[0]}'` : "chown: missing operand");
    return 1;
  }
  const [who, ...files] = o.rest as [string, ...string[]];
  const [owner, group] = who.split(":");
  let code = 0;
  for (const f of files) {
    const res = c.st.fs.walk(absOf(c, f), c.st.user);
    if (!res.node) {
      c.err(`chown: cannot access '${f}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    const allowed = c.st.user.name === "root" || (res.node.owner === c.st.user.name && (!owner || owner === c.st.user.name));
    if (!allowed) {
      c.err(`chown: changing ownership of '${f}': Operation not permitted`);
      code = 1;
      continue;
    }
    if (owner) res.node.owner = owner;
    if (group) res.node.group = group;
  }
  return code;
}

// ---------------------------------------------------------------- disk

function du(c: Ctx): number {
  const o = parseOpts(c, "du", { bool: "shak", val: "d", long: { summarize: "s", "human-readable": "h", all: "a", "max-depth": "d" } });
  if (!o) return 1;
  const maxDepth = o.f.has("s") ? 0 : o.v.get("d") ? Number(o.v.get("d")![0]) : Infinity;
  if (Number.isNaN(maxDepth)) {
    c.err(`du: invalid maximum depth '${o.v.get("d")![0]}'`);
    return 1;
  }
  const fmt = (n: number) => (o.f.has("h") ? humanSize(n) : String(Math.ceil(n / 1024)));
  let code = 0;
  const walk = (node: VNode, display: string, depth: number): number => {
    spend(1);
    if (node.kind === "file") {
      const size = diskUsage(node);
      if (depth === 0 || (o.f.has("a") && depth <= maxDepth)) c.out(`${fmt(size)}\t${display}\n`);
      return size;
    }
    if (!can(c.st.user, node, 4) || !can(c.st.user, node, 1)) {
      c.err(`du: cannot read directory '${display}': Permission denied`);
      code = 1;
      if (depth <= maxDepth) c.out(`${fmt(BLOCK)}\t${display}\n`);
      return BLOCK;
    }
    let total = BLOCK;
    for (const child of childList(node)) total += walk(child, display.endsWith("/") ? display + child.name : display + "/" + child.name, depth + 1);
    if (depth <= maxDepth) c.out(`${fmt(total)}\t${display}\n`);
    return total;
  };
  for (const t of o.rest.length ? o.rest : ["."]) {
    const res = c.st.fs.walk(absOf(c, t), c.st.user);
    if (!res.node) {
      c.err(`du: cannot access '${t}': ${ERR_TEXT[res.err ?? "ENOENT"]}`);
      code = 1;
      continue;
    }
    walk(res.node, t, 0);
  }
  return code;
}

function df(c: Ctx): number {
  const rows: string[][] = [["Filesystem", "Size", "Used", "Avail", "Use%", "Mounted on"], ...c.st.df.map((r) => [...r])];
  const w = [0, 1, 2, 3, 4].map((k) => Math.max(...rows.map((r) => r[k]!.length)));
  for (const r of rows) c.out(`${r[0]!.padEnd(w[0]!)} ${r[1]!.padStart(w[1]!)} ${r[2]!.padStart(w[2]!)} ${r[3]!.padStart(w[3]!)} ${r[4]!.padStart(w[4]!)} ${r[5]}\n`);
  return 0;
}

// ---------------------------------------------------------------- processes

function psLine(p: Proc): string {
  return `${p.user.padEnd(10)} ${String(p.pid).padStart(6)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(p.vsz).padStart(7)} ${String(p.rss).padStart(6)} ${(p.tty ?? "?").padEnd(8)} ${p.stat.padEnd(4)} ${p.start.padEnd(5)} ${p.time.padStart(6)} ${p.command}`;
}

function ps(c: Ctx): number {
  const all = c.args.some((a) => /^-?[a-zA-Z]*[aeA][a-zA-Z]*x?$/.test(a) && a !== "-");
  if (all || c.args.length > 0) {
    c.out(`${"USER".padEnd(10)} ${"PID".padStart(6)} ${"%CPU".padStart(4)} ${"%MEM".padStart(4)} ${"VSZ".padStart(7)} ${"RSS".padStart(6)} ${"TTY".padEnd(8)} ${"STAT".padEnd(4)} ${"START".padEnd(5)} ${"TIME".padStart(6)} COMMAND\n`);
    for (const p of [...c.st.procs].sort((a, b) => a.pid - b.pid)) c.out(psLine(p) + "\n");
    return 0;
  }
  c.out("    PID TTY          TIME CMD\n");
  for (const p of c.st.procs.filter((x) => x.user === c.st.user.name && x.tty).sort((a, b) => a.pid - b.pid)) {
    c.out(`${String(p.pid).padStart(7)} ${(p.tty ?? "?").padEnd(8)} ${p.time.padStart(8)} ${baseName(p.command.split(" ")[0]!.replace(/^-/, ""))}\n`);
  }
  return 0;
}

const SIGNALS: Record<string, number> = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, USR1: 10, USR2: 12, TERM: 15, CONT: 18, STOP: 19 };

function signalNumber(spec: string): number | null {
  if (/^\d+$/.test(spec)) return Number(spec);
  const name = spec.replace(/^SIG/, "").toUpperCase();
  return SIGNALS[name] ?? null;
}

function deliver(c: Ctx, proc: Proc, sig: number): boolean {
  if (sig === 0 || sig === 18 || sig === 19) return true;
  if (proc.ignoresTerm && sig !== 9) return true;
  c.st.procs = c.st.procs.filter((p) => p.pid !== proc.pid);
  return true;
}

function kill(c: Ctx): number {
  let sig = 15;
  const args = [...c.args];
  if (args[0] === "-s" || args[0] === "-n") {
    const s = signalNumber(args[1] ?? "");
    if (s === null) {
      c.err(`bash: kill: ${args[1] ?? ""}: invalid signal specification`);
      return 1;
    }
    sig = s;
    args.splice(0, 2);
  } else if (args[0] && /^-[A-Za-z0-9]+$/.test(args[0])) {
    const s = signalNumber(args[0].slice(1));
    if (s === null) {
      c.err(`bash: kill: ${args[0]}: invalid signal specification`);
      return 1;
    }
    sig = s;
    args.shift();
  }
  if (args.length === 0) {
    c.err("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]");
    return 2;
  }
  let code = 0;
  for (const a of args) {
    if (!/^\d+$/.test(a)) {
      c.err(`bash: kill: ${a}: arguments must be process or job IDs`);
      code = 1;
      continue;
    }
    const proc = c.st.procs.find((p) => p.pid === Number(a));
    if (!proc) {
      c.err(`bash: kill: (${a}) - No such process`);
      code = 1;
    } else if (proc.user !== c.st.user.name && c.st.user.name !== "root") {
      c.err(`bash: kill: (${a}) - Operation not permitted`);
      code = 1;
    } else deliver(c, proc, sig);
  }
  return code;
}

const procName = (p: Proc, full: boolean): string => (full ? p.command : baseName(p.command.split(" ")[0]!.replace(/^-/, "")));

function pgrepFamily(c: Ctx, which: "pgrep" | "pkill" | "killall"): number {
  const o = parseOpts(c, which, { bool: "lfx", val: "s", numeric: which !== "pgrep" });
  // pkill -9 name: the digits are the signal.
  if (!o) return 2;
  const sig = o.num !== null ? Number(o.num) : 15;
  const name = o.rest[0];
  if (name === undefined) {
    c.err(`${which}: no matching criteria specified`);
    return 2;
  }
  const full = o.f.has("f");
  const hits = c.st.procs.filter((p) => (o.f.has("x") ? procName(p, full) === name : procName(p, full).includes(name))).sort((a, b) => a.pid - b.pid);
  if (hits.length === 0) {
    if (which === "killall") c.err(`${name}: no process found`);
    return 1;
  }
  if (which === "pgrep") {
    for (const p of hits) c.out(o.f.has("l") ? `${p.pid} ${procName(p, false)}\n` : `${p.pid}\n`);
    return 0;
  }
  let code = 0;
  for (const p of hits) {
    if (p.user !== c.st.user.name && c.st.user.name !== "root") {
      c.err(`${which}: killing pid ${p.pid} failed: Operation not permitted`);
      code = 1;
    } else deliver(c, p, sig);
  }
  return code;
}

// ---------------------------------------------------------------- small commands

const KNOWN_IDS: Record<string, number> = { root: 0, ops: 1000, dev: 1001, alice: 1002, bob: 1003, carol: 1004, deploy: 1005 };

function id(c: Ctx): number {
  const u = c.st.user;
  const num = (n: string) => KNOWN_IDS[n] ?? 1500;
  c.out(`uid=${num(u.name)}(${u.name}) gid=${num(u.groups[0] ?? u.name)}(${u.groups[0] ?? u.name}) groups=${u.groups.map((g) => `${num(g)}(${g})`).join(",")}\n`);
  return 0;
}

function tee(c: Ctx): number {
  const o = parseOpts(c, "tee", { bool: "a" });
  if (!o) return 1;
  const text = c.stdin ?? "";
  let code = 0;
  for (const f of o.rest) {
    const e = c.st.fs.writeFile(absOf(c, f), c.st.user, text, o.f.has("a"));
    if (e) {
      c.err(`tee: ${f}: ${ERR_TEXT[e]}`);
      code = 1;
    }
  }
  c.out(text);
  return code;
}

function xargs(c: Ctx): number {
  const o = parseOpts(c, "xargs", { stop: true });
  if (!o) return 1;
  const items = (c.stdin ?? "").split(/\s+/).filter(Boolean).slice(0, 500);
  const base = o.rest.length ? o.rest : ["echo"];
  if (items.length === 0) return 0;
  const r = c.exec([...base, ...items], null);
  c.out(r.out);
  return r.code === 0 ? 0 : 123;
}

function exportCmd(c: Ctx): number {
  for (const a of c.args) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=([\s\S]*))?$/.exec(a);
    if (!m) {
      c.err(`bash: export: \`${a}': not a valid identifier`);
      return 1;
    }
    if (m[2] !== undefined) c.st.env[m[1]!] = m[2];
  }
  return 0;
}

function env(c: Ctx): number {
  for (const k of Object.keys(c.st.env).sort()) c.out(`${k}=${c.st.env[k]}\n`);
  return 0;
}

const DATE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function date(c: Ctx): number {
  const d = new Date(c.st.fs.now * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  c.out(`${DATE_DAYS[d.getUTCDay()]} ${DATE_MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}\n`);
  return 0;
}

export const COMMANDS: Record<string, Cmd> = {
  pwd,
  cd,
  ls,
  cat,
  less: cat,
  more: cat,
  head: (c) => headTail(c, "head"),
  tail: (c) => headTail(c, "tail"),
  grep: (c) => grepCmd(c, false),
  egrep: (c) => grepCmd({ ...c, args: ["-E", ...c.args] }, false),
  find,
  wc,
  sort,
  uniq,
  cut,
  awk,
  sed,
  echo,
  touch,
  mkdir,
  rm,
  cp,
  mv,
  chmod,
  chown,
  du,
  df,
  ps,
  kill,
  pgrep: (c) => pgrepFamily(c, "pgrep"),
  pkill: (c) => pgrepFamily(c, "pkill"),
  killall: (c) => pgrepFamily(c, "killall"),
  whoami: (c) => (c.out(c.st.user.name + "\n"), 0),
  id,
  hostname: (c) => (c.out(c.st.hostname + "\n"), 0),
  uname: (c) => (c.out(c.args.includes("-a") ? `Linux ${c.st.hostname} 6.1.0-18-amd64 #1 SMP Debian 6.1.76-1 x86_64 GNU/Linux\n` : "Linux\n"), 0),
  date,
  tee,
  xargs,
  export: exportCmd,
  env,
  printenv: env,
  true: () => 0,
  false: () => 1,
  sleep: () => 0,
  which: (c) => {
    let code = 0;
    for (const a of c.args) {
      if (a in COMMANDS && !["cd", "export"].includes(a)) c.out(`/usr/bin/${a}\n`);
      else code = 1;
    }
    return c.args.length ? code : 1;
  },
  sudo: (c) => (c.err(`${c.st.user.name} is not in the sudoers file. Ask the admin, or fix it as your own user.`), 1),
  su: (c) => (c.err("su: Authentication failure"), 1),
};

/** Real commands a learner may try that this practice server does not have. */
export const NOT_HERE: Record<string, string> = {
  vi: "Edit files with echo and the > and >> redirects, or sed -i.",
  vim: "Edit files with echo and the > and >> redirects, or sed -i.",
  nano: "Edit files with echo and the > and >> redirects, or sed -i.",
  top: "Use ps aux to see the processes.",
  htop: "Use ps aux to see the processes.",
  ssh: "This practice server has no network.",
  curl: "This practice server has no network.",
  wget: "This practice server has no network.",
  ping: "This practice server has no network.",
  apt: "You cannot install software here.",
  "apt-get": "You cannot install software here.",
  systemctl: "There is no service manager here.",
  docker: "There is no Docker here. Try the Docker game.",
  python: "Only the commands in 'help' work.",
  python3: "Only the commands in 'help' work.",
  node: "Only the commands in 'help' work.",
  ln: "Links are not part of this game.",
  tar: "Archives are not part of this game.",
  zip: "Archives are not part of this game.",
  unzip: "Archives are not part of this game.",
  tree: "Try ls -R instead.",
  diff: "Try cat on both files and compare.",
  stat: "Try ls -l instead.",
  file: "Try cat or ls -l instead.",
};

/** Help text for `man`, `help` and the cheat sheet. */
export const USAGE: Record<string, { usage: string; desc: string; group: string }> = {
  pwd: { usage: "pwd", desc: "show the folder you are in", group: "Move and look" },
  cd: { usage: "cd [DIR]   (cd .. goes up, cd - goes back, cd alone goes home)", desc: "change folder", group: "Move and look" },
  ls: { usage: "ls [-l] [-a] [-h] [-R] [-S] [-t] [-r] [PATH]...", desc: "list files (-l details, -a hidden, -h readable sizes, -S by size, -t by time)", group: "Move and look" },
  cat: { usage: "cat [-n] FILE...", desc: "print a file (less and more work the same)", group: "Read" },
  head: { usage: "head [-n N] [FILE]", desc: "the first N lines (10 by default)", group: "Read" },
  tail: { usage: "tail [-n N] [FILE]", desc: "the last N lines (10 by default)", group: "Read" },
  grep: { usage: "grep [-i] [-v] [-n] [-c] [-r] [-E] [-l] [-o] [-w] PATTERN [FILE]...", desc: "show lines that match a pattern", group: "Search" },
  find: { usage: "find [PATH] [-name PAT] [-type f|d] [-size +10M] [-mtime +7] [-maxdepth N] [-delete]", desc: "find files by name, type, size or age", group: "Search" },
  wc: { usage: "wc [-l] [-w] [-c] [FILE]", desc: "count lines, words and bytes", group: "Filters (use with |)" },
  sort: { usage: "sort [-r] [-n] [-h] [-u] [-k N] [-t SEP] [FILE]", desc: "sort lines (-n numbers, -h sizes like 4K, -r backwards)", group: "Filters (use with |)" },
  uniq: { usage: "uniq [-c] [-d] [FILE]", desc: "remove repeated lines next to each other (-c counts them; sort first)", group: "Filters (use with |)" },
  cut: { usage: "cut -d SEP -f N [FILE]", desc: "pick a column from each line", group: "Filters (use with |)" },
  awk: { usage: "awk [-F SEP] '{print $1, $3}' [FILE]", desc: "print chosen columns", group: "Filters (use with |)" },
  sed: { usage: "sed [-i] 's/old/new/g' [FILE]", desc: "replace text (-i changes the file)", group: "Filters (use with |)" },
  xargs: { usage: "xargs COMMAND", desc: "use the lines from a pipe as arguments", group: "Filters (use with |)" },
  tee: { usage: "tee [-a] FILE", desc: "show the input and also save it to a file", group: "Filters (use with |)" },
  echo: { usage: "echo [-n] TEXT", desc: "print text (use > file to write it into a file)", group: "Change files" },
  touch: { usage: "touch FILE...", desc: "make an empty file or update its time", group: "Change files" },
  mkdir: { usage: "mkdir [-p] DIR...", desc: "make a folder", group: "Change files" },
  rm: { usage: "rm [-r] [-f] FILE...", desc: "delete files (-r for folders). There is no undo", group: "Change files" },
  cp: { usage: "cp [-r] SOURCE... DEST", desc: "copy files (-r for folders)", group: "Change files" },
  mv: { usage: "mv SOURCE... DEST", desc: "move or rename", group: "Change files" },
  chmod: { usage: "chmod MODE FILE...   (755, 644, +x, u+x, go-w)", desc: "change who may read, write or run a file", group: "Change files" },
  chown: { usage: "chown USER[:GROUP] FILE...", desc: "change the owner (only root can give files away)", group: "Change files" },
  du: { usage: "du [-s] [-h] [-d N] [PATH]...", desc: "how much disk each folder uses", group: "System" },
  df: { usage: "df -h", desc: "how full each disk is", group: "System" },
  ps: { usage: "ps aux", desc: "list running processes with their PID", group: "System" },
  kill: { usage: "kill [-9] PID...", desc: "stop a process (-9 forces it)", group: "System" },
  pgrep: { usage: "pgrep [-l] NAME", desc: "find process IDs by name (pkill and killall stop them)", group: "System" },
  whoami: { usage: "whoami", desc: "show your user name", group: "System" },
  id: { usage: "id", desc: "show your user and groups", group: "System" },
  which: { usage: "which COMMAND", desc: "show where a command lives", group: "System" },
  hostname: { usage: "hostname", desc: "show the server name", group: "System" },
  date: { usage: "date", desc: "show the date", group: "System" },
  export: { usage: "export NAME=VALUE", desc: "set a variable (use it as $NAME)", group: "System" },
  history: { usage: "history", desc: "list the commands you ran", group: "This game" },
  clear: { usage: "clear", desc: "clear the screen", group: "This game" },
  hint: { usage: "hint", desc: "show the next hint (it can cost a star)", group: "This game" },
  submit: { usage: "submit ANSWER", desc: "give your answer (for missions that ask a question)", group: "This game" },
  help: { usage: "help", desc: "list the commands that work here (man NAME shows one)", group: "This game" },
};

export const SHELL_TIPS = [
  "Pipe: cmd1 | cmd2 sends the output of cmd1 into cmd2",
  "Redirect: > writes a file, >> adds to it",
  "&& runs the next command only if the first worked",
  "Quotes keep spaces together. $HOME, $USER and $PWD work",
  "Tab finishes a name. Arrow up repeats a command",
];
