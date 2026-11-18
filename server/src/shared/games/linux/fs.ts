// An in-memory file system for the Linux Command Explorer. Pure and deterministic: no real files,
// no clock. "Now" is a fixed number that moves forward one minute per command the player runs.

export const NOW = 1767225600; // 2026-01-01 00:00:00 UTC
export const DAY = 86400;
export const MAX_NODES = 1500;
export const MAX_FILE_SIZE = 200_000;
export const MAX_PATH = 1024;
export const BLOCK = 4096;

export type Err = "ENOENT" | "EACCES" | "ENOTDIR" | "EEXIST" | "EISDIR" | "ENOSPC" | "EINVAL";

export const ERR_TEXT: Record<Err, string> = {
  ENOENT: "No such file or directory",
  EACCES: "Permission denied",
  ENOTDIR: "Not a directory",
  EEXIST: "File exists",
  EISDIR: "Is a directory",
  ENOSPC: "No space left on device",
  EINVAL: "Invalid argument",
};

export type User = { name: string; groups: string[] };

export type VNode = {
  kind: "file" | "dir";
  name: string;
  owner: string;
  group: string;
  mode: number;
  mtime: number;
  content: string;
  /** A made-up size in bytes for a big file whose text is short. */
  size: number | null;
  children: Map<string, VNode>;
};

export type FileOpts = {
  content?: string;
  size?: number;
  owner?: string;
  group?: string;
  mode?: number;
  mtime?: number;
  /** Age in days at the fixed "now". */
  age?: number;
};
/** A path ending in "/" is a directory. A string value is the text of a file. */
export type FsSpec = Record<string, string | FileOpts>;

/** Turn a path into an absolute one with no "." or ".." parts. */
export function normalizePath(cwd: string, input: string, home = "/"): string {
  let path = input;
  if (path === "~" || path.startsWith("~/")) path = home + path.slice(1);
  if (!path.startsWith("/")) path = cwd + "/" + path;
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function baseName(abs: string): string {
  const i = abs.lastIndexOf("/");
  return i < 0 ? abs : abs.slice(i + 1);
}

export function dirName(abs: string): string {
  const i = abs.lastIndexOf("/");
  return i <= 0 ? "/" : abs.slice(0, i);
}

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? "/" + name : dir + "/" + name;
}

/** Permission bits for a user on a node: 4 read, 2 write, 1 execute. */
export function permBits(user: User, node: VNode): number {
  if (user.name === "root") return 7;
  if (node.owner === user.name) return (node.mode >> 6) & 7;
  if (user.groups.includes(node.group)) return (node.mode >> 3) & 7;
  return node.mode & 7;
}

export function can(user: User, node: VNode, bit: 1 | 2 | 4): boolean {
  return (permBits(user, node) & bit) !== 0;
}

export function modeString(node: VNode): string {
  const m = node.mode;
  const triple = (v: number) => (v & 4 ? "r" : "-") + (v & 2 ? "w" : "-") + (v & 1 ? "x" : "-");
  return (node.kind === "dir" ? "d" : "-") + triple((m >> 6) & 7) + triple((m >> 3) & 7) + triple(m & 7);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The date column of `ls -l`. */
export function formatTime(mtime: number, now: number): string {
  const d = new Date(mtime * 1000);
  const day = String(d.getUTCDate()).padStart(2, " ");
  if (now - mtime > 180 * DAY || mtime > now + DAY) return `${MONTHS[d.getUTCMonth()]} ${day}  ${d.getUTCFullYear()}`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${day} ${hh}:${mm}`;
}

/** Sizes like GNU `-h`: 1.5K, 12M, 4.0K. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const rounded = Math.ceil(v * 10) / 10;
  return (rounded < 10 ? rounded.toFixed(1) : String(Math.ceil(v))) + units[i];
}

function newNode(kind: "file" | "dir", name: string, owner: string, opts: FileOpts = {}): VNode {
  return {
    kind,
    name,
    owner: opts.owner ?? owner,
    group: opts.group ?? opts.owner ?? owner,
    mode: opts.mode ?? (kind === "dir" ? 0o755 : 0o644),
    mtime: opts.mtime ?? (opts.age !== undefined ? NOW - Math.round(opts.age * DAY) : NOW - 2 * DAY),
    content: opts.content ?? "",
    size: opts.size ?? null,
    children: new Map(),
  };
}

/** Who owns a path when the mission does not say: a home folder belongs to its user. */
function defaultOwner(abs: string): string {
  const m = /^\/home\/([^/]+)/.exec(abs);
  return m ? m[1]! : "root";
}

export function sizeOf(node: VNode): number {
  return node.kind === "dir" ? BLOCK : node.size ?? node.content.length;
}

/** Disk blocks used, like `du`: files in 4K blocks, a folder counts itself too. */
export function diskUsage(node: VNode): number {
  if (node.kind === "file") {
    const size = sizeOf(node);
    return size === 0 ? 0 : Math.ceil(size / BLOCK) * BLOCK;
  }
  let total = BLOCK;
  for (const child of node.children.values()) total += diskUsage(child);
  return total;
}

export type Walk = { node: VNode | null; err: Err | null };

export class VFS {
  root: VNode;
  count = 1;
  /** The fixed "now", moved forward by the shell. */
  now = NOW;

  constructor(spec: FsSpec) {
    this.root = newNode("dir", "", "root");
    const keys = Object.keys(spec).sort((a, b) => a.length - b.length);
    for (const key of keys) {
      const value = spec[key]!;
      const opts: FileOpts = typeof value === "string" ? { content: value } : value;
      const abs = normalizePath("/", key);
      if (abs === "/") {
        Object.assign(this.root, { mode: opts.mode ?? this.root.mode, owner: opts.owner ?? this.root.owner });
        continue;
      }
      if (key.endsWith("/")) this.build(abs, "dir", opts);
      else this.build(abs, "file", opts);
    }
  }

  private build(abs: string, kind: "file" | "dir", opts: FileOpts): void {
    const parts = abs.split("/").filter(Boolean);
    let cur = this.root;
    let path = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      path += "/" + part;
      const last = i === parts.length - 1;
      let next = cur.children.get(part);
      if (!next) {
        next = newNode(last ? kind : "dir", part, defaultOwner(path), last ? opts : {});
        cur.children.set(part, next);
        this.count++;
      } else if (last) {
        if (kind === "dir") Object.assign(next, { owner: opts.owner ?? next.owner, group: opts.group ?? opts.owner ?? next.group, mode: opts.mode ?? next.mode, mtime: opts.mtime ?? (opts.age !== undefined ? NOW - opts.age * DAY : next.mtime) });
      }
      cur = next;
    }
  }

  /** Find a node by absolute path, checking that the user may walk into every folder on the way. */
  walk(abs: string, user: User): Walk {
    let cur = this.root;
    for (const part of abs.split("/")) {
      if (part === "") continue;
      if (cur.kind !== "dir") return { node: null, err: "ENOTDIR" };
      if (!can(user, cur, 1)) return { node: null, err: "EACCES" };
      const next = cur.children.get(part);
      if (!next) return { node: null, err: "ENOENT" };
      cur = next;
    }
    return { node: cur, err: null };
  }

  /** No permission checks. For the game's own goal checks. */
  peek(abs: string): VNode | null {
    let cur: VNode | undefined = this.root;
    for (const part of abs.split("/")) {
      if (part === "") continue;
      if (!cur || cur.kind !== "dir") return null;
      cur = cur.children.get(part);
    }
    return cur ?? null;
  }

  /** The folder that would hold a new entry at this path, and the name of the entry. */
  parentFor(abs: string, user: User): { dir: VNode | null; name: string; err: Err | null } {
    const name = baseName(abs);
    const res = this.walk(dirName(abs), user);
    if (!res.node) return { dir: null, name, err: res.err };
    if (res.node.kind !== "dir") return { dir: null, name, err: "ENOTDIR" };
    return { dir: res.node, name, err: null };
  }

  private checkNew(abs: string, user: User): { dir: VNode; name: string } | Err {
    if (abs.length > MAX_PATH) return "EINVAL";
    const p = this.parentFor(abs, user);
    if (!p.dir) return p.err ?? "ENOENT";
    if (!can(user, p.dir, 2) || !can(user, p.dir, 1)) return "EACCES";
    if (p.name.length > 255 || p.name === "") return "EINVAL";
    return { dir: p.dir, name: p.name };
  }

  /** Create or replace a file. */
  writeFile(abs: string, user: User, text: string, append: boolean): Err | null {
    const existing = this.walk(abs, user);
    if (existing.node) {
      const node = existing.node;
      if (node.kind === "dir") return "EISDIR";
      if (!can(user, node, 2)) return "EACCES";
      const next = append ? node.content + text : text;
      if (next.length > MAX_FILE_SIZE) return "ENOSPC";
      node.content = next;
      node.size = null;
      node.mtime = this.now;
      return null;
    }
    if (existing.err !== "ENOENT") return existing.err;
    const target = this.checkNew(abs, user);
    if (typeof target === "string") return target;
    if (this.count >= MAX_NODES || text.length > MAX_FILE_SIZE) return "ENOSPC";
    const node = newNode("file", target.name, user.name, { content: text, mtime: this.now });
    node.group = user.groups[0] ?? user.name;
    target.dir.children.set(target.name, node);
    target.dir.mtime = this.now;
    this.count++;
    return null;
  }

  mkdir(abs: string, user: User): Err | null {
    const existing = this.walk(abs, user);
    if (existing.node) return "EEXIST";
    if (existing.err !== "ENOENT") return existing.err;
    const target = this.checkNew(abs, user);
    if (typeof target === "string") return target;
    if (this.count >= MAX_NODES) return "ENOSPC";
    const node = newNode("dir", target.name, user.name, { mtime: this.now });
    node.group = user.groups[0] ?? user.name;
    target.dir.children.set(target.name, node);
    target.dir.mtime = this.now;
    this.count++;
    return null;
  }

  private countNodes(node: VNode): number {
    let n = 1;
    for (const c of node.children.values()) n += this.countNodes(c);
    return n;
  }

  /** Delete a file or a folder with everything in it. The caller checks the "-r" rule. */
  remove(abs: string, user: User): Err | null {
    if (abs === "/") return "EINVAL";
    const p = this.parentFor(abs, user);
    if (!p.dir) return p.err;
    const node = p.dir.children.get(p.name);
    if (!node) return "ENOENT";
    if (!can(user, p.dir, 2)) return "EACCES";
    p.dir.children.delete(p.name);
    p.dir.mtime = this.now;
    this.count -= this.countNodes(node);
    return null;
  }

  private copyNode(node: VNode, name: string, owner: string, group: string): VNode {
    const copy: VNode = { ...node, name, owner, group, mtime: this.now, children: new Map() };
    for (const [key, child] of node.children) copy.children.set(key, this.copyNode(child, child.name, owner, group));
    return copy;
  }

  /** Copy a node to a new absolute path (the path of the copy itself). */
  copy(node: VNode, destAbs: string, user: User): Err | null {
    const target = this.checkNew(destAbs, user);
    if (typeof target === "string") return target;
    if (target.dir.children.has(target.name)) {
      const old = target.dir.children.get(target.name)!;
      if (old.kind === "dir") return "EISDIR";
      if (!can(user, old, 2)) return "EACCES";
      this.count -= 1;
    }
    if (this.count + this.countNodes(node) > MAX_NODES) return "ENOSPC";
    const copy = this.copyNode(node, target.name, user.name, user.groups[0] ?? user.name);
    copy.mode = node.mode;
    target.dir.children.set(target.name, copy);
    target.dir.mtime = this.now;
    this.count += this.countNodes(copy);
    return null;
  }

  /** Move a node to a new absolute path. */
  move(srcAbs: string, destAbs: string, user: User): Err | null {
    const from = this.parentFor(srcAbs, user);
    if (!from.dir) return from.err;
    const node = from.dir.children.get(from.name);
    if (!node) return "ENOENT";
    if (!can(user, from.dir, 2)) return "EACCES";
    if (destAbs === srcAbs) return null;
    if (destAbs.startsWith(srcAbs + "/")) return "EINVAL";
    const target = this.checkNew(destAbs, user);
    if (typeof target === "string") return target;
    const old = target.dir.children.get(target.name);
    if (old) {
      if (old.kind === "dir" && node.kind !== "dir") return "EISDIR";
      if (old.kind === "dir" && old.children.size > 0) return "EEXIST";
      this.count -= this.countNodes(old);
    }
    from.dir.children.delete(from.name);
    node.name = target.name;
    target.dir.children.set(target.name, node);
    from.dir.mtime = this.now;
    target.dir.mtime = this.now;
    return null;
  }

  /** Read a file's text with no permission checks, or null. For goal checks. */
  text(abs: string): string | null {
    const node = this.peek(abs);
    return node && node.kind === "file" ? node.content : null;
  }
}
