import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Reads `tasklist` CSV output: the image name is the first quoted column. Pure, so it is tested. */
export function parseTasklist(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)"/.exec(line.trim());
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

export function parsePsOutput(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Names of running programs, nothing else: no paths, windows, arguments or users. The list is
 * compared on this computer and only the names that matched the restricted-app policy are
 * ever sent to the server. Built-in OS commands keep this free of extra packages, which also
 * keeps it working inside the packaged app (Forge strips node_modules).
 */
export async function listProcessNames(): Promise<string[]> {
  const options = { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true };
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh'], options);
    return parseTasklist(stdout);
  }
  // `-c` prints the executable name only (macOS and Linux).
  const { stdout } = await execFileAsync('ps', ['-axco', 'comm='], options);
  return parsePsOutput(stdout);
}
