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

export function savePassedSteps(slug: string, steps: string[]) {
  try {
    const all = read();
    if (steps.length) all[slug] = steps;
    else delete all[slug];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Progress is best effort; the lab still works without it. */
  }
}

/** IPC errors arrive as "Error invoking remote method 'x': Error: message". Keep the message. */
export function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
