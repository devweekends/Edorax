// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Shared types for the Linux Command Explorer engine.
import type { Difficulty } from "../types";
import type { FsSpec, User, VFS } from "./fs";

export type Proc = {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  tty?: string;
  stat: string;
  start: string;
  time: string;
  command: string;
  /** A gentle `kill` (TERM) does not stop it. Only `kill -9` does. */
  ignoresTerm?: boolean;
};

/** One row of `df -h`: filesystem, size, used, avail, use%, mount point. */
export type DfRow = [string, string, string, string, string, string];

/** Everything a goal check may look at. It is the whole state of the shell after a command. */
export type ShellState = {
  fs: VFS;
  user: User;
  hostname: string;
  cwd: string;
  oldpwd: string;
  env: Record<string, string>;
  procs: Proc[];
  df: DfRow[];
  /** Every command line the player ran, in order (only the ones the shell accepted). */
  history: string[];
  /** All the text shown on the terminal so far (the end of it, when it gets long). */
  shown: string;
  /** The player gave the right answer with `submit`. */
  answerOk: boolean;
  /** Scripts that were run, with their exit codes. */
  executed: Array<{ path: string; code: number }>;
};

export type Objective = {
  label: string;
  /** Once true, the shell keeps it ticked. */
  done: (s: ShellState) => boolean;
};

export type Mission = {
  id: string;
  difficulty: Difficulty;
  title: string;
  brief: string;
  story: string;
  /** The number of commands a good player needs. Three stars need this many or fewer. */
  par: number;
  hints: string[];
  files: FsSpec;
  /** Where the player starts. Default is the home folder. */
  cwd?: string;
  /** Extra groups for the player (the player is "ops"). */
  groups?: string[];
  procs?: Proc[];
  df?: DfRow[];
  /** For an answer mission: the accepted answers for `submit`. */
  answer?: string[];
  /** The answer is a path, so "backups" and "/var/backups/" both count. */
  pathAnswer?: boolean;
  objectives: Objective[];
  /** The mission is done when this is true. For an answer mission it is `s.answerOk`. */
  goal: (s: ShellState) => boolean;
  /** A list of commands that solves the mission. The tests replay it. */
  solution: string[];
};

/** What a command can do while it runs. */
export type Ctx = {
  st: ShellState;
  args: string[];
  stdin: string | null;
  /** The output goes to the screen, not into a pipe or a file. */
  tty: boolean;
  out(text: string): void;
  /** One line on standard error (a newline is added). */
  err(message: string): void;
  /** Run another command and capture what it prints. */
  exec(argv: string[], stdin: string | null): { code: number; out: string };
};

export type Cmd = (c: Ctx) => number;
