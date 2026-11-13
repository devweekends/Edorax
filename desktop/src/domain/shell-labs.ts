// The shell lab contract. A shell lab is a real Linux machine in a local Docker
// container, a setup script that prepares (or breaks) it, and steps whose checks
// run inside the machine. Checks test the machine state, never the typed commands.

export interface ShellCheck {
  id: string;
  /** Which machine runs this check: the name of a machine in the lab. Default: the main machine. */
  on?: string;
  /** Shown next to the result: "Group devs exists". */
  label: string;
  /** A bash script run as root inside the machine. Exit 0 passes. */
  run: string;
  /** Shown when the check fails: what is still wrong, in plain words. */
  fail: string;
}

/** One command the learner meets in a step, in its general form, with what it does. */
export interface ShellCommandNote {
  /** The general form, with UPPERCASE placeholders: `chmod MODE FILE`. Never the step's answer. */
  command: string;
  /** What it does, in one plain sentence. */
  meaning: string;
  /** A key or line used inside a program (vi, a config file), not a shell command: nothing to type for you. */
  key?: boolean;
  /** A real example of the command, on something that is not the step's answer: `ls /etc`. */
  example?: string;
  /** What the example prints, copied from a real machine. Shown with the example. */
  output?: string;
}

/** A common wrong turn. When the step fails and `when` passes, the learner sees `say` instead of the generic message. */
export interface ShellMistake {
  /** A bash script run as root inside the machine. Exit 0 means the learner made this mistake. Never shown. */
  when: string;
  /** What went wrong and how to fix it, in plain words. */
  say: string;
  /** Which machine runs `when`: the name of a machine in the lab. Default: the main machine. */
  on?: string;
  /** Commands that make this mistake. Used by the lab verifier in Edorax Core, never shown. */
  repro?: string;
}

export interface ShellStep {
  id: string;
  /** One line: what the learner must make true. */
  goal: string;
  /** A short paragraph of context: the task in this lab's story. `code` spans are rendered as code. */
  body: string;
  /**
   * The lesson before the task: what the idea is, how it works and why it matters, in a few short
   * paragraphs. Written in the lab's YAML file in Edorax Core; validation requires it on every step.
   */
  learn?: string[];
  /** The commands this step teaches, in general form. Required on every step, like learn. */
  commands?: ShellCommandNote[];
  /** The hint ladder: a nudge, then a hint, then a worked example. */
  hints: [string, string, string];
  checks: ShellCheck[];
  /** A short message from the lab's character that opens the step, so the task has a person and a reason. */
  story?: string;
  /** One short, friendly line shown when the step passes. */
  win?: string;
  /** "What just happened": why it worked and what changed on the machine, in 2 or 3 sentences. Shown when the step passes. */
  after?: string;
  /** Common mistakes, tried in order when the step fails. The first that matches replaces the generic message. */
  mistakes?: ShellMistake[];
  /** Commands that complete the step. Used by tests and never shown before the last hint. */
  solution: string;
}

export interface ShellMachine {
  /** Hostname, also shown on the terminal tab. */
  name: string;
  /** A pinned image. The lab never reaches the network after the pull. */
  image: string;
  /**
   * Packages baked into a local image on first start, for tools the base image lacks (sshd, dig).
   * Installed with apt or dnf, whichever the image has. Building the image is the only time the
   * network is used; the lab machine has none.
   */
  packages?: string[];
  /**
   * A bash script run as root while the image is built, after the packages, with network access.
   * Like a Dockerfile RUN line: use it to fetch what the lab needs offline, such as a local package
   * repository. It runs once per image, not per learner, and is part of the image's identity.
   */
  build?: string;
  /** Linux capabilities beyond the default set, from SHELL_LAB_EXTRA_CAPABILITIES only. */
  capabilities?: string[];
  /** Memory in MB. Default 256, at most 2048. A Kubernetes control plane needs about 1024. */
  memoryMb?: number;
  /** Processes the machine may run at once. Default 128, at most 1024. */
  pids?: number;
  /** CPU cores. Default 1, at most 2. */
  cpus?: number;
  /**
   * Lets setuid programs such as `sudo` work in this machine (turns off no-new-privileges). For servers a learner
   * logs in to as a normal user and then uses sudo, as Ansible does with `become`. The machine still has no network
   * and few capabilities.
   */
  sudo?: boolean;
}

/** An extra machine on the lab's private network. The learner's terminal always opens on the main `machine`. */
export interface ShellExtraMachine extends ShellMachine {
  /** A bash script run as root once when this machine is first created. Runs before the main machine's setup. */
  setup?: string;
  /** Run each time this machine starts again. */
  boot?: string;
  /** Run just before this machine stops. */
  shutdown?: string;
}

export const SHELL_MAX_EXTRA_MACHINES = 4;

export const SHELL_MACHINE_LIMITS = { memoryMb: [128, 2048], pids: [32, 1024], cpus: [0.5, 2] } as const;

/** Capabilities a lab may ask for on top of the default set, and why each is safe here. */
export const SHELL_LAB_EXTRA_CAPABILITIES: readonly string[] = [
  // sshd confines its pre-login process with chroot.
  'SYS_CHROOT',
  // Servers on ports below 1024, such as DNS on 53. The machine has no network, only loopback.
  'NET_BIND_SERVICE',
  // Login services write audit records through PAM.
  'AUDIT_WRITE',
  // Interfaces, routes and firewall rules. The machine has its own network namespace with no
  // outside network, so changes stay inside the lab.
  'NET_ADMIN',
];

export type ShellTopic = 'linux' | 'docker' | 'ansible' | 'kubernetes';

/** The kinds of machine a shell lab can be about, in the order the app shows them. A topic with no labs yet shows as coming soon. */
export const SHELL_TOPICS: readonly { id: ShellTopic; title: string; description: string; machine: string }[] = [
  { id: 'linux', title: 'Linux', description: 'Users, permissions, files, processes and services on a real server.', machine: 'A real Linux machine' },
  { id: 'docker', title: 'Docker', description: 'Build images, run containers and fix a broken Compose stack.', machine: 'A real Docker host' },
  { id: 'ansible', title: 'Ansible', description: 'Configure a fleet of servers from one control node.', machine: 'A control node and servers' },
  { id: 'kubernetes', title: 'Kubernetes', description: 'Deploy, scale and debug workloads on a real cluster.', machine: 'A real cluster' },
];
export type ShellLevel = 'beginner' | 'intermediate';

export interface ShellLab {
  slug: string;
  topic: ShellTopic;
  level: ShellLevel;
  /** Short subject tags for the card, without the #: "DNS", "Networking". */
  tags: string[];
  title: string;
  /** One sentence for the lab card. */
  summary: string;
  /** The story the learner is dropped into. */
  scenario: string;
  minutes: number;
  /** The person who sends the learner the tasks. Optional; labs without one use the plain scenario. */
  character?: { name: string; role: string };
  /** Shown when the lab is complete: what the learner can now do, in the story's voice. */
  outro?: string;
  /** The badge earned at the end, for example "Terminal Explorer". */
  badge?: string;
  machine: ShellMachine;
  /**
   * Extra machines for labs about more than one server (Ansible: a control node and its servers).
   * All machines share one private network with no way out, and reach each other by name.
   */
  machines?: ShellExtraMachine[];
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
  level: ShellLevel;
  tags: string[];
  title: string;
  summary: string;
  minutes: number;
  steps: number;
}

export interface ShellLabView extends ShellLabSummary {
  scenario: string;
  machine: string;
  character?: { name: string; role: string };
  outro?: string;
  badge?: string;
  steps: number;
  stepList: {
    id: string;
    goal: string;
    body: string;
    learn: string[];
    commands: ShellCommandNote[];
    hints: [string, string, string];
    checks: { id: string; label: string }[];
    story?: string;
    win?: string;
    after?: string;
  }[];
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
  /** When the step fails and one of its listed mistakes matches, what the learner most likely did wrong. */
  mistake?: string;
}

export interface ShellLabStatus {
  /** Docker is reachable. */
  available: boolean;
  /** The lab machine exists. */
  created: boolean;
  running: boolean;
  message: string;
}

export type DockerReadiness =
  | { state: 'ready' }
  | { state: 'not-running'; canStart: boolean }
  | { state: 'missing'; platform: string };

export interface DockerSetupProgress {
  phase: 'download' | 'verify' | 'install' | 'done' | 'error';
  percent?: number;
  message: string;
  savedTo?: string;
}

/** Where a first start is: the plan, the step in progress and, when known, how far that step is. */
export interface ShellStartProgress {
  slug: string;
  /** Names of every step of this start, in order. */
  plan: string[];
  /** Index in `plan` of the step in progress. */
  step: number;
  /** 0 to 100 when the step can be measured (downloads, package installs). Missing means it cannot. */
  percent?: number;
  /** A short line: bytes downloaded so far, or the last line the step printed. */
  detail?: string;
  /** When this step began, in milliseconds since 1970. */
  stepStartedAt: number;
}

export interface ShellLabsAPI {
  /** Is Docker ready for labs, installed but closed, or missing? */
  dockerState(): Promise<DockerReadiness>;
  /** Opens an installed Docker Desktop. Returns false where the app cannot. */
  startDocker(): Promise<boolean>;
  /** Downloads and opens the official installer (Windows, macOS) or opens the install guide (Linux). Progress arrives through onDockerProgress. */
  setUpDocker(): Promise<DockerSetupProgress>;
  onDockerProgress(listener: (progress: DockerSetupProgress) => void): () => void;
  list(): Promise<ShellLabSummary[]>;
  view(slug: string): Promise<ShellLabView>;
  status(slug: string): Promise<ShellLabStatus>;
  start(slug: string): Promise<void>;
  stop(slug: string): Promise<void>;
  reset(slug: string): Promise<void>;
  check(slug: string, stepId: string): Promise<ShellStepResult>;
  /** Every step checked against the machine now; null when the machine is not running. */
  checkAll(slug: string): Promise<ShellStepResult[] | null>;
  openTerminal(slug: string, id: string): Promise<void>;
  closeTerminal(slug: string, id: string): Promise<void>;
  terminalInput(slug: string, id: string, data: string): Promise<void>;
  resizeTerminal(slug: string, id: string, cols: number, rows: number): Promise<void>;
  onTerminalData(listener: (event: { id: string; data: string }) => void): () => void;
  /** Progress of a first start (download, install, build, setup). Resuming a stopped machine sends none. */
  onStartProgress(listener: (progress: ShellStartProgress) => void): () => void;
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
  if (!['beginner', 'intermediate'].includes(lab.level)) problems.push('a lab needs a level: beginner or intermediate');
  if (!lab.tags.length || lab.tags.some((tag) => !tag.trim() || tag.startsWith('#'))) problems.push('a lab needs tags, written without #');
  if (!/^[a-z0-9-]{1,40}$/.test(lab.machine.name)) problems.push('the machine name must be a short hostname');
  if (!PINNED.test(lab.machine.image) || lab.machine.image.endsWith(':latest'))
    problems.push('the machine image must have a fixed tag or digest, not latest');
  for (const pkg of lab.machine.packages ?? [])
    if (!/^[a-z0-9][a-z0-9+.-]{0,60}$/.test(pkg)) problems.push(`package "${pkg}" is not a valid package name`);
  for (const cap of lab.machine.capabilities ?? [])
    if (!SHELL_LAB_EXTRA_CAPABILITIES.includes(cap)) problems.push(`capability "${cap}" is not allowed in a shell lab`);
  if (lab.character && (!lab.character.name?.trim() || !lab.character.role?.trim())) problems.push('a lab character needs a name and a role');
  for (const key of ['outro', 'badge'] as const) if (lab[key] !== undefined && !String(lab[key]).trim()) problems.push(`${key} cannot be empty`);
  const extras = lab.machines ?? [];
  if (extras.length > SHELL_MAX_EXTRA_MACHINES) problems.push(`a lab can have at most ${SHELL_MAX_EXTRA_MACHINES} extra machines`);
  const machineNames = new Set<string>([lab.machine.name]);
  for (const extra of extras) {
    if (!/^[a-z0-9-]{1,40}$/.test(extra.name ?? '')) problems.push(`extra machine name "${extra.name}" must be a short hostname`);
    if (machineNames.has(extra.name)) problems.push(`machine name "${extra.name}" is used twice`);
    machineNames.add(extra.name);
    if (!PINNED.test(extra.image ?? '') || String(extra.image).endsWith(':latest')) problems.push(`machine "${extra.name}": the image must have a fixed tag or digest, not latest`);
    for (const pkg of extra.packages ?? []) if (!/^[a-z0-9][a-z0-9+.-]{0,60}$/.test(pkg)) problems.push(`machine "${extra.name}": package "${pkg}" is not a valid package name`);
    for (const cap of extra.capabilities ?? []) if (!SHELL_LAB_EXTRA_CAPABILITIES.includes(cap)) problems.push(`machine "${extra.name}": capability "${cap}" is not allowed in a shell lab`);
    for (const [key, [low, high]] of Object.entries(SHELL_MACHINE_LIMITS) as [keyof typeof SHELL_MACHINE_LIMITS, readonly [number, number]][]) {
      const value = extra[key];
      if (value !== undefined && !(typeof value === 'number' && value >= low && value <= high)) problems.push(`machine "${extra.name}": ${key} must be a number from ${low} to ${high}`);
    }
  }
  for (const [key, [low, high]] of Object.entries(SHELL_MACHINE_LIMITS) as [keyof typeof SHELL_MACHINE_LIMITS, readonly [number, number]][]) {
    const value = lab.machine[key];
    if (value !== undefined && !(typeof value === 'number' && value >= low && value <= high)) problems.push(`machine.${key} must be a number from ${low} to ${high}`);
  }
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
    if (!step.learn?.length || step.learn.some((paragraph) => !paragraph.trim()))
      problems.push(`step "${step.id}" needs a lesson: add "learn" to the step in the lab's YAML file`);
    if (!step.commands?.length || step.commands.some((note) => !note.command.trim() || !note.meaning.trim()))
      problems.push(`step "${step.id}" needs the commands it teaches, each with its meaning`);
    for (const key of ['story', 'win', 'after'] as const) if (step[key] !== undefined && !String(step[key]).trim()) problems.push(`step "${step.id}": ${key} cannot be empty`);
    for (const mistake of step.mistakes ?? [])
      if (!mistake.when?.trim() || !mistake.say?.trim()) problems.push(`step "${step.id}": every mistake needs "when" (a bash check) and "say" (the message)`);
      else if (mistake.on !== undefined && !machineNames.has(mistake.on)) problems.push(`step "${step.id}": a mistake runs on "${mistake.on}", which is not a machine in this lab`);
    for (const note of step.commands ?? [])
      if ((note.example !== undefined && !note.example.trim()) || (note.output !== undefined && !note.example?.trim()))
        problems.push(`step "${step.id}": command "${note.command}" has an output but no example, or an empty example`);
    const checkIds = new Set<string>();
    for (const check of step.checks) {
      if (!ID.test(check.id)) problems.push(`check id "${check.id}" in step "${step.id}" is not valid`);
      if (checkIds.has(check.id)) problems.push(`check id "${check.id}" is used twice in step "${step.id}"`);
      checkIds.add(check.id);
      if (!check.run.trim()) problems.push(`check "${check.id}" in step "${step.id}" has nothing to run`);
      if (!check.fail.trim()) problems.push(`check "${check.id}" in step "${step.id}" needs a fail message`);
      if (check.on !== undefined && !machineNames.has(check.on)) problems.push(`check "${check.id}" in step "${step.id}" runs on "${check.on}", which is not a machine in this lab`);
    }
  }
  return problems;
}

export function shellLabSummary(lab: ShellLab): ShellLabSummary {
  return { slug: lab.slug, topic: lab.topic, level: lab.level, tags: lab.tags, title: lab.title, summary: lab.summary, minutes: lab.minutes, steps: lab.steps.length };
}

/** The learner view: no setup script, no check scripts, no solutions. */
export function shellLabView(lab: ShellLab): ShellLabView {
  return {
    ...shellLabSummary(lab),
    scenario: lab.scenario,
    machine: lab.machine.name,
    ...(lab.character ? { character: lab.character } : {}),
    ...(lab.outro ? { outro: lab.outro } : {}),
    ...(lab.badge ? { badge: lab.badge } : {}),
    stepList: lab.steps.map((step) => ({
      id: step.id,
      goal: step.goal,
      body: step.body,
      learn: step.learn ?? [],
      commands: step.commands ?? [],
      hints: step.hints,
      checks: step.checks.map((check) => ({ id: check.id, label: check.label })),
      ...(step.story ? { story: step.story } : {}),
      ...(step.win ? { win: step.win } : {}),
      ...(step.after ? { after: step.after } : {}),
    })),
  };
}
