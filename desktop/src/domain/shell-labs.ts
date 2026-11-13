// The shell lab contract. A shell lab is a real Linux machine in a local Docker
// container, a setup script that prepares (or breaks) it, and steps whose checks
// run inside the machine. Checks test the machine state, never the typed commands.

export interface ShellCheck {
  id: string;
  /** Shown next to the result: "Group devs exists". */
  label: string;
  /** A bash script run as root inside the machine. Exit 0 passes. */
  run: string;
  /** Shown when the check fails: what is still wrong, in plain words. */
  fail: string;
}

export interface ShellStep {
  id: string;
  /** One line: what the learner must make true. */
  goal: string;
  /** A short paragraph of context. Plain text; `code` spans are rendered as code. */
  body: string;
  /** The hint ladder: a nudge, then a hint, then a worked example. */
  hints: [string, string, string];
  checks: ShellCheck[];
  /** Commands that complete the step. Used by tests and never shown before the last hint. */
  solution: string;
}

export interface ShellMachine {
  /** Hostname, also shown on the terminal tab. */
  name: string;
  /** A pinned image. The lab never reaches the network after the pull. */
  image: string;
  /**
   * apt packages baked into a local image on first start, for tools the base image lacks
   * (sshd, dig). Installing is the only time the network is used; the lab machine has none.
   */
  packages?: string[];
  /** Linux capabilities beyond the default set, from SHELL_LAB_EXTRA_CAPABILITIES only. */
  capabilities?: string[];
}

/** Capabilities a lab may ask for on top of the default set, and why each is safe here. */
export const SHELL_LAB_EXTRA_CAPABILITIES: readonly string[] = [
  // sshd confines its pre-login process with chroot.
  'SYS_CHROOT',
  // Servers on ports below 1024, such as DNS on 53. The machine has no network, only loopback.
  'NET_BIND_SERVICE',
  // Login services write audit records through PAM.
  'AUDIT_WRITE',
];

export type ShellTopic = 'linux' | 'docker' | 'ansible' | 'kubernetes';

export interface ShellLab {
  slug: string;
  topic: ShellTopic;
  title: string;
  /** One sentence for the lab card. */
  summary: string;
  /** The story the learner is dropped into. */
  scenario: string;
  minutes: number;
  machine: ShellMachine;
  /** A bash script run once as root when the machine is first created. */
  setup: string;
  /**
   * A bash script run as root each time a stopped machine starts again, like services enabled at
   * boot. Stopping a container ends every process, so labs with servers restart them here.
   */
  boot?: string;
  /**
   * A bash script run as root just before the app stops the machine. Docker rewrites files such as
   * /etc/hosts on every start, so a lab that teaches them saves them here and restores them in boot.
   */
  shutdown?: string;
  steps: ShellStep[];
}

/** What the learner sees about a lab, without setup or solutions. */
export interface ShellLabSummary {
  slug: string;
  topic: ShellTopic;
  title: string;
  summary: string;
  minutes: number;
  steps: number;
}

export interface ShellLabView extends ShellLabSummary {
  scenario: string;
  machine: string;
  steps: number;
  stepList: { id: string; goal: string; body: string; hints: [string, string, string]; checks: { id: string; label: string }[] }[];
}

export interface ShellCheckResult {
  id: string;
  label: string;
  passed: boolean;
  message: string;
}

export interface ShellStepResult {
  stepId: string;
  passed: boolean;
  checks: ShellCheckResult[];
}

export interface ShellLabStatus {
  /** Docker is reachable. */
  available: boolean;
  /** The lab machine exists. */
  created: boolean;
  running: boolean;
  message: string;
}

export interface ShellLabsAPI {
  list(): Promise<ShellLabSummary[]>;
  view(slug: string): Promise<ShellLabView>;
  status(slug: string): Promise<ShellLabStatus>;
  start(slug: string): Promise<void>;
  stop(slug: string): Promise<void>;
  reset(slug: string): Promise<void>;
  check(slug: string, stepId: string): Promise<ShellStepResult>;
  openTerminal(slug: string, id: string): Promise<void>;
  closeTerminal(slug: string, id: string): Promise<void>;
  terminalInput(slug: string, id: string, data: string): Promise<void>;
  resizeTerminal(slug: string, id: string, cols: number, rows: number): Promise<void>;
  onTerminalData(listener: (event: { id: string; data: string }) => void): () => void;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ID = /^[a-z0-9-]{1,60}$/;
const PINNED = /^[a-z0-9./_-]+(:[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$|^[a-z0-9./_-]+:[A-Za-z0-9._-]+$/;

/** Every problem with a lab, as plain sentences. An empty list means the lab is valid. */
export function validateShellLab(lab: ShellLab): string[] {
  const problems: string[] = [];
  if (!SLUG.test(lab.slug)) problems.push(`slug "${lab.slug}" must be lowercase words joined by dashes`);
  if (!lab.title.trim()) problems.push('a lab needs a title');
  if (!lab.summary.trim()) problems.push('a lab needs a summary');
  if (!/^[a-z0-9-]{1,40}$/.test(lab.machine.name)) problems.push('the machine name must be a short hostname');
  if (!PINNED.test(lab.machine.image) || lab.machine.image.endsWith(':latest'))
    problems.push('the machine image must have a fixed tag or digest, not latest');
  for (const pkg of lab.machine.packages ?? [])
    if (!/^[a-z0-9][a-z0-9+.-]{0,60}$/.test(pkg)) problems.push(`package "${pkg}" is not a valid package name`);
  for (const cap of lab.machine.capabilities ?? [])
    if (!SHELL_LAB_EXTRA_CAPABILITIES.includes(cap)) problems.push(`capability "${cap}" is not allowed in a shell lab`);
  if (!lab.steps.length) problems.push('a lab needs at least one step');
  const stepIds = new Set<string>();
  for (const step of lab.steps) {
    if (!ID.test(step.id)) problems.push(`step id "${step.id}" is not valid`);
    if (stepIds.has(step.id)) problems.push(`step id "${step.id}" is used twice`);
    stepIds.add(step.id);
    if (!step.goal.trim()) problems.push(`step "${step.id}" needs a goal`);
    if (step.hints.length !== 3 || step.hints.some((hint) => !hint.trim()))
      problems.push(`step "${step.id}" needs three hints: a nudge, a hint and a worked example`);
    if (!step.checks.length) problems.push(`step "${step.id}" needs at least one check`);
    if (!step.solution.trim()) problems.push(`step "${step.id}" needs a solution`);
    const checkIds = new Set<string>();
    for (const check of step.checks) {
      if (!ID.test(check.id)) problems.push(`check id "${check.id}" in step "${step.id}" is not valid`);
      if (checkIds.has(check.id)) problems.push(`check id "${check.id}" is used twice in step "${step.id}"`);
      checkIds.add(check.id);
      if (!check.run.trim()) problems.push(`check "${check.id}" in step "${step.id}" has nothing to run`);
      if (!check.fail.trim()) problems.push(`check "${check.id}" in step "${step.id}" needs a fail message`);
    }
  }
  return problems;
}

export function shellLabSummary(lab: ShellLab): ShellLabSummary {
  return { slug: lab.slug, topic: lab.topic, title: lab.title, summary: lab.summary, minutes: lab.minutes, steps: lab.steps.length };
}

/** The learner view: no setup script, no check scripts, no solutions. */
export function shellLabView(lab: ShellLab): ShellLabView {
  return {
    ...shellLabSummary(lab),
    scenario: lab.scenario,
    machine: lab.machine.name,
    stepList: lab.steps.map((step) => ({
      id: step.id,
      goal: step.goal,
      body: step.body,
      hints: step.hints,
      checks: step.checks.map((check) => ({ id: check.id, label: check.label })),
    })),
  };
}
