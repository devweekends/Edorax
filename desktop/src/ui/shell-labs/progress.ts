// Passed steps per shell lab, on this device only, until progress syncs to the server.
const KEY = 'edorax:shell-labs:v1';

type Saved = Record<string, string[]>;

function read(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' ? (value as Saved) : {};
  } catch {
    return {};
  }
}

export function passedSteps(slug: string): string[] {
  const steps = read()[slug];
  return Array.isArray(steps) ? steps.filter((step) => typeof step === 'string') : [];
}

function writeLocal(slug: string, steps: string[]) {
  try {
    const all = read();
    if (steps.length) all[slug] = steps;
    else delete all[slug];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Progress is best effort; the lab still works without it. */
  }
}

/** Saves on this computer and, in the background, on the learner's account. */
export function savePassedSteps(slug: string, steps: string[]) {
  writeLocal(slug, steps);
  void window.buildment?.shellLabs?.saveProgress?.(slug, steps).catch(() => {});
}

/**
 * Joins this computer's progress with the account's, so a reinstall or a second computer still shows
 * what was done. A step done on either side stays done. Steps found only on this computer are sent
 * to the account. Returns true when something changed here. Never rejects.
 */
export async function syncPassedSteps(): Promise<boolean> {
  try {
    const remote = await window.buildment?.shellLabs?.progress?.();
    if (!remote) return false;
    let changed = false;
    const local = read();
    for (const slug of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const mine = Array.isArray(local[slug]) ? local[slug] : [];
      const theirs = Array.isArray(remote[slug]) ? remote[slug].filter((step) => typeof step === 'string') : [];
      const joined = [...new Set([...theirs, ...mine])];
      if (joined.length > mine.length) {
        writeLocal(slug, joined);
        changed = true;
      }
      if (joined.length > theirs.length) void window.buildment.shellLabs.saveProgress(slug, joined).catch(() => {});
    }
    return changed;
  } catch {
    return false;
  }
}

/** IPC errors arrive as "Error invoking remote method 'x': Error: message". Keep the message. */
export function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
