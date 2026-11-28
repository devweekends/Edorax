// The part of a shell lab the website may show before anyone signs in. Pure, so it is easy to test.

export type PublicShellLabStep = { id: string; goal: string };

export type PublicShellLab = {
  slug: string;
  topic: string;
  level: string;
  title: string;
  summary: string;
  minutes: number;
  scenario: string | null;
  tags: string[];
  /** Only the goal of each step. Checks, hints, solutions and quiz answers stay in the signed-in API. */
  steps: PublicShellLabStep[];
  /** True when the lab can run in the browser (see runsInBrowser). */
  browser: boolean;
};

/**
 * Packages the browser lab image has (frontend `pnpm labs:image`). A lab that needs any other
 * package cannot run in the browser yet. `iptables` is left out on purpose: the browser kernel
 * has no packet filter, so firewall labs stay in the desktop app.
 */
export const BROWSER_LAB_PACKAGES = new Set([
  "acl", "apt-utils", "cron", "curl", "dnsmasq", "dnsutils", "file", "iproute2", "iputils-ping", "logrotate", "lsof",
  "nano", "netcat-openbsd", "openssh-client", "openssh-server", "plocate", "procps", "psmisc", "python3", "sudo", "vim",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Whether the website can run this lab in the browser, on a Linux kernel compiled to WebAssembly.
 * The browser has one machine, a Debian system and a fixed set of packages. A lab that needs more
 * machines, a virtual machine, a build step or another package runs in the desktop app only.
 * A lab file can also say so itself: `browser: true` or `browser: false` wins over the rules.
 */
export function runsInBrowser(lab: Record<string, unknown>): boolean {
  if (typeof lab.browser === "boolean") return lab.browser;
  const machine = lab.machine;
  if (!isRecord(machine) || lab.topic !== "linux") return false;
  if (Array.isArray(lab.machines) && lab.machines.length > 0) return false;
  if (machine.vm === true || typeof machine.build === "string") return false;
  if (typeof machine.image !== "string" || !/^(ubuntu|debian):/.test(machine.image)) return false;
  const packages = Array.isArray(machine.packages) ? machine.packages : [];
  return packages.every((name) => typeof name === "string" && BROWSER_LAB_PACKAGES.has(name));
}

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/** Strips a published lab down to the parts that are safe to show to everyone. */
export function toPublicShellLab(lab: Record<string, unknown>): PublicShellLab {
  const steps = Array.isArray(lab.steps) ? (lab.steps as Record<string, unknown>[]) : [];
  return {
    slug: asText(lab.slug),
    topic: asText(lab.topic),
    level: asText(lab.level),
    title: asText(lab.title),
    summary: asText(lab.summary),
    minutes: typeof lab.minutes === "number" ? lab.minutes : 0,
    scenario: asText(lab.scenario) || null,
    tags: Array.isArray(lab.tags) ? lab.tags.filter((tag): tag is string => typeof tag === "string") : [],
    steps: steps.map((step) => ({ id: asText(step.id), goal: asText(step.goal) })).filter((step) => step.id && step.goal),
    browser: runsInBrowser(lab),
  };
}
