// A tiny pretend Linux shell for the landing page's practice terminal. It keeps a small
// file tree in memory and knows a handful of everyday commands. It is not a real
// machine: the real shell labs run on one, in the Edorax desktop app.

type FileNode = { type: "file"; text: string };
type DirNode = { type: "dir"; children: Record<string, Node> };
type Node = FileNode | DirNode;

export const HOME = "/home/learner";

function dir(children: Record<string, Node> = {}): DirNode {
  return { type: "dir", children };
}
function file(text: string): FileNode {
  return { type: "file", text };
}

export function createFileTree(): DirNode {
  return dir({
    bin: dir(),
    etc: dir({ hostname: file("edorax-lab") }),
    tmp: dir(),
    home: dir({
      learner: dir({
        "welcome.txt": file("Welcome to your first Edorax lab.\nIn the real shell labs, a test checks the machine after every task."),
        notes: dir({ "todo.txt": file("1. Learn pwd, ls and cat\n2. Run a real lab in the desktop app") }),
      }),
    }),
  });
}

export const COMMANDS = ["cat", "cd", "clear", "date", "echo", "help", "history", "hostname", "ls", "mkdir", "pwd", "touch", "uname", "whoami"] as const;

export interface ShellState {
  root: DirNode;
  cwd: string;
  history: string[];
}

export interface RunResult {
  out: string[];
  error?: boolean;
  clear?: boolean;
  /** What the command did, so a task checker can look at the effect, not the exact text. */
  effect?: { kind: "pwd" } | { kind: "ls"; path: string } | { kind: "cat"; path: string };
}

export function resolvePath(cwd: string, input: string): string {
  const raw = input === "~" || input.startsWith("~/") ? HOME + input.slice(1) : input;
  const start = raw.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") start.pop();
    else start.push(part);
  }
  return "/" + start.join("/");
}

function lookup(root: DirNode, path: string): Node | null {
  let node: Node = root;
  for (const part of path.split("/").filter(Boolean)) {
    if (node.type !== "dir") return null;
    const next: Node | undefined = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

function parent(path: string): { dirPath: string; name: string } {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() ?? "";
  return { dirPath: "/" + parts.join("/"), name };
}

export function displayPath(path: string): string {
  if (path === HOME) return "~";
  return path.startsWith(HOME + "/") ? "~" + path.slice(HOME.length) : path;
}

function listDir(node: DirNode, all: boolean, long: boolean): string[] {
  const names = Object.keys(node.children).sort();
  const shown = all ? [".", "..", ...names] : names.filter((n) => !n.startsWith("."));
  if (!long) return shown.length ? [shown.map((n) => (node.children[n]?.type === "dir" ? `${n}/` : n)).join("  ")] : [];
  return shown.map((n) => {
    const child = node.children[n];
    const isDir = !child || child.type === "dir";
    const size = child && child.type === "file" ? child.text.length : 4096;
    return `${isDir ? "drwxr-xr-x" : "-rw-r--r--"} 1 learner learner ${String(size).padStart(5)} Nov 18 09:00 ${n}`;
  });
}

export function run(state: ShellState, line: string): RunResult {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { out: [] };
  const [cmd, ...args] = words;
  const flags = args.filter((a) => a.startsWith("-")).join("");
  const paths = args.filter((a) => !a.startsWith("-"));

  switch (cmd) {
    case "help":
      return { out: ["Commands in this practice terminal:", COMMANDS.join("  "), "Tab completes names. The up arrow brings back earlier commands."] };
    case "pwd":
      return { out: [state.cwd], effect: { kind: "pwd" } };
    case "whoami":
      return { out: ["learner"] };
    case "hostname":
      return { out: ["edorax-lab"] };
    case "date":
      return { out: [new Date().toUTCString()] };
    case "uname":
      return { out: [flags.includes("a") ? "Linux edorax-lab 6.8.0 x86_64 GNU/Linux" : "Linux"] };
    case "clear":
      return { out: [], clear: true };
    case "history":
      return { out: state.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`) };
    case "echo":
      return { out: [args.join(" ")] };
    case "ls": {
      const targets = paths.length ? paths : ["."];
      const out: string[] = [];
      let effect: RunResult["effect"];
      for (const t of targets) {
        const path = resolvePath(state.cwd, t);
        const node = lookup(state.root, path);
        if (!node) return { out: [`ls: cannot access '${t}': No such file or directory`], error: true };
        if (targets.length > 1) out.push(`${t}:`);
        out.push(...(node.type === "dir" ? listDir(node, flags.includes("a"), flags.includes("l")) : [t]));
        effect = { kind: "ls", path };
      }
      return { out, effect };
    }
    case "cd": {
      const path = resolvePath(state.cwd, paths[0] ?? "~");
      const node = lookup(state.root, path);
      if (!node) return { out: [`cd: ${paths[0]}: No such file or directory`], error: true };
      if (node.type !== "dir") return { out: [`cd: ${paths[0]}: Not a directory`], error: true };
      state.cwd = path;
      return { out: [] };
    }
    case "cat": {
      if (!paths.length) return { out: ["cat: give it a file name, for example: cat welcome.txt"], error: true };
      const out: string[] = [];
      let effect: RunResult["effect"];
      for (const t of paths) {
        const path = resolvePath(state.cwd, t);
        const node = lookup(state.root, path);
        if (!node) return { out: [...out, `cat: ${t}: No such file or directory`], error: true };
        if (node.type === "dir") return { out: [...out, `cat: ${t}: Is a directory`], error: true };
        out.push(...node.text.split("\n"));
        effect = { kind: "cat", path };
      }
      return { out, effect };
    }
    case "mkdir":
    case "touch": {
      if (!paths.length) return { out: [`${cmd}: missing name`], error: true };
      for (const t of paths) {
        const { dirPath, name } = parent(resolvePath(state.cwd, t));
        const at = lookup(state.root, dirPath);
        if (!at || at.type !== "dir" || !name) return { out: [`${cmd}: cannot create '${t}': No such file or directory`], error: true };
        if (at.children[name]) {
          if (cmd === "mkdir") return { out: [`mkdir: cannot create directory '${t}': File exists`], error: true };
          continue;
        }
        at.children[name] = cmd === "mkdir" ? dir() : file("");
      }
      return { out: [] };
    }
    case "sudo":
      return { out: ["learner is not in the sudoers file. Nice try, though."], error: true };
    case "rm":
      return { out: ["rm is switched off in this practice terminal. In the real labs you can break things and reset."], error: true };
    default:
      return { out: [`${cmd}: command not found. Type help to see what works here.`], error: true };
  }
}

/** Completes the last word of the line: a command name first, then file names. */
export function complete(state: ShellState, line: string): string {
  const words = line.split(" ");
  const last = words[words.length - 1];
  if (words.length === 1) {
    const hits = COMMANDS.filter((c) => c.startsWith(last));
    return hits.length === 1 ? `${hits[0]} ` : line;
  }
  const slash = last.lastIndexOf("/");
  const base = slash >= 0 ? last.slice(0, slash + 1) : "";
  const stem = last.slice(slash + 1);
  const node = lookup(state.root, resolvePath(state.cwd, base || "."));
  if (!node || node.type !== "dir") return line;
  const hits = Object.keys(node.children).filter((n) => n.startsWith(stem) && !n.startsWith("."));
  if (hits.length !== 1) return line;
  const hit = hits[0];
  const suffix = node.children[hit].type === "dir" ? "/" : " ";
  words[words.length - 1] = base + hit + suffix;
  return words.join(" ");
}
