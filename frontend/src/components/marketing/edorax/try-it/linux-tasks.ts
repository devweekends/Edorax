import { HOME, type RunResult } from "./fake-shell";

export interface LinuxTask {
  text: string;
  command: string;
  /** Looks at what the command did, so `ls ~` or `cat ./welcome.txt` count too. */
  done: (effect: RunResult["effect"]) => boolean;
}

export const LINUX_TASKS: readonly LinuxTask[] = [
  { text: "Print the folder you are in", command: "pwd", done: (e) => e?.kind === "pwd" },
  { text: "List what is in your home folder", command: "ls", done: (e) => e?.kind === "ls" && e.path === HOME },
  { text: "Read the welcome note", command: "cat welcome.txt", done: (e) => e?.kind === "cat" && e.path === `${HOME}/welcome.txt` },
];
