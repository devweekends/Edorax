// Runs one shell lab machine in the learner's local Docker. The learner is root
// inside the container, which is the point of a Linux lab, so the container is
// what keeps their computer safe: no network, no host mounts, no Docker socket,
// a small set of capabilities, and CPU, memory and process limits. Reset removes
// the container, so every attempt starts from the same broken server.
import type Docker from 'dockerode';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { PassThrough, type Duplex } from 'node:stream';
import { SHELL_LAB_EXTRA_CAPABILITIES, type ShellLab, type ShellLabStatus, type ShellStepResult } from '../domain/shell-labs';

const LABEL = 'com.edorax.shell-lab';
const OUTPUT_LIMIT = 64 * 1024;
/** Longest one check may take. A check that hangs (a server that never answers) counts as failed. */
const CHECK_SECONDS = 12;
const RESULT_MARK = '@@edorax-check';
const missing = (error: unknown) => (error as { statusCode?: number })?.statusCode === 404;

export function shellLabName(scope: string) {
  return `edorax-shell-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`;
}

/** Capabilities a Linux admin lab needs: change owners and modes, switch users, stop processes. */
export const SHELL_LAB_CAPABILITIES = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'SETUID', 'SETGID', 'KILL'];

/**
 * The image a lab machine runs: the pinned base image, or for a lab with packages or a build
 * script, a local image built from it once. The tag is a hash of all three, so any change builds anew.
 */
export function shellLabImage(lab: ShellLab) {
  const packages = [...new Set(lab.machine.packages ?? [])].sort();
  const build = lab.machine.build?.trim() ?? '';
  if (!packages.length && !build) return lab.machine.image;
  const identity = `${lab.machine.image}\n${packages.join('\n')}${build ? `\n--build--\n${build}` : ''}`;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 20);
  return `edorax-shell-lab:${hash}`;
}

export function shellContainerOptions(lab: ShellLab, scope: string) {
  const name = shellLabName(scope);
  const extra = (lab.machine.capabilities ?? []).filter((cap) => SHELL_LAB_EXTRA_CAPABILITIES.includes(cap));
  return {
    name,
    Image: shellLabImage(lab),
    Hostname: lab.machine.name,
    Labels: { [LABEL]: name, 'com.edorax.shell-lab.slug': lab.slug },
    WorkingDir: '/root',
    Cmd: ['sleep', 'infinity'],
    HostConfig: {
      // A tiny init as PID 1 reaps exited processes, so daemons a learner starts and stops
      // (sshd, dnsmasq) do not pile up as zombies against the process limit.
      Init: true,
      Memory: 256 * 1024 * 1024,
      MemorySwap: 256 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 128,
      CapDrop: ['ALL'],
      CapAdd: [...SHELL_LAB_CAPABILITIES, ...extra],
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: 'none',
      // exec: learners write small scripts in /tmp and run them, and Docker mounts a tmpfs noexec by default.
      Tmpfs: { '/tmp': 'rw,exec,nosuid,size=32m' },
    },
  };
}

export class ShellLabRuntime {
  private tail: Promise<unknown> = Promise.resolve();
  private terminal?: { id: string; exec: Docker.Exec; stream: Duplex };
  private readonly name: string;

  constructor(
    private readonly docker: Docker,
    private readonly lab: ShellLab,
    private readonly scope: string,
    private readonly emit: (event: { id: string; data: string }) => void = () => {},
  ) {
    this.name = shellLabName(scope);
  }

  // One mutation at a time, so rapid clicks cannot create two machines.
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }

  private async owned() {
    const container = this.docker.getContainer(this.name);
    try {
      const info = await container.inspect();
      if (info.Config.Labels?.[LABEL] !== this.name)
        throw new Error('A container with the lab name already exists and is not owned by Edorax.');
      return { container, info };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async status(): Promise<ShellLabStatus> {
    try {
      await this.docker.ping();
    } catch {
      return {
        available: false,
        created: false,
        running: false,
        message: 'Docker is not running. Open Docker Desktop, wait for it to start, then try again.',
      };
    }
    try {
      const resource = await this.owned();
      const running = Boolean(resource?.info.State.Running);
      return {
        available: true,
        created: Boolean(resource),
        running,
        message: running ? `${this.lab.machine.name} is running` : resource ? `${this.lab.machine.name} is stopped` : 'Not started yet',
      };
    } catch (error) {
      return { available: false, created: false, running: false, message: error instanceof Error ? error.message : 'Could not read the lab.' };
    }
  }

  private async hasImage(image: string) {
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch (error) {
      if (!missing(error)) throw error;
      return false;
    }
  }

  private async pull() {
    const target = shellLabImage(this.lab);
    if (await this.hasImage(target)) return;
    if (!(await this.hasImage(this.lab.machine.image))) {
      const stream = await this.docker.pull(this.lab.machine.image);
      await new Promise<void>((resolve, reject) =>
        this.docker.modem.followProgress(stream, (error: unknown) => (error ? reject(error) : resolve())),
      );
    }
    if (target !== this.lab.machine.image) await this.bake(target);
  }

  /**
   * Install the lab's packages in a throwaway container that has network, and save the result
   * as the lab image. Runs once per package list; the lab machine itself never has network.
   */
  private async bake(target: string) {
    const [repo, tag] = target.split(':');
    const packages = [...new Set(this.lab.machine.packages ?? [])].sort();
    const builder = await this.docker.createContainer({
      Image: this.lab.machine.image,
      Cmd: ['sleep', 'infinity'],
      Labels: { [`${LABEL}.builder`]: target },
    });
    try {
      await builder.start();
      const list = packages.join(' ');
      // apt: policy-rc.d stops packages starting their services during install; a daemon left
      // running would hold this command's output open and the build would never finish.
      // dnf images (Rocky, Alma) have no service manager running, so nothing starts there.
      const install = !packages.length
        ? 'true'
        : `if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  printf '#!/bin/sh\\nexit 101\\n' > /usr/sbin/policy-rc.d; chmod +x /usr/sbin/policy-rc.d
  { apt-get update -qq && apt-get install -y -qq --no-install-recommends ${list}; } </dev/null >/tmp/install.log 2>&1 || { tail -20 /tmp/install.log; exit 1; }
  rm -f /usr/sbin/policy-rc.d; rm -rf /var/lib/apt/lists/*
elif command -v dnf >/dev/null; then
  dnf install -y -q --setopt=install_weak_deps=False ${list} </dev/null >/tmp/install.log 2>&1 || { tail -20 /tmp/install.log; exit 1; }
  dnf clean all -q >/dev/null 2>&1 || true
else
  echo "The image has neither apt-get nor dnf."; exit 1
fi`;
      const build = this.lab.machine.build?.trim();
      const encoded = build ? Buffer.from(build).toString('base64') : '';
      const result = await this.run(
        builder,
        `set -e
${install}
rm -f /tmp/install.log
${build ? `printf %s '${encoded}' | base64 -d > /tmp/edorax-build.sh; bash -e /tmp/edorax-build.sh </dev/null 2>&1 | tail -20; status=\${PIPESTATUS[0]}; rm -f /tmp/edorax-build.sh; exit $status` : ''}`,
        600_000,
      );
      if (result.code)
        throw new Error(`The lab tools could not be installed. Check your internet connection and try again. ${result.output.trim().slice(-400)}`);
      await builder.commit({ repo, tag, changes: ['CMD ["sleep", "infinity"]'] });
    } finally {
      await builder.remove({ force: true }).catch(() => {});
    }
  }

  /** Run a bash script as root in the machine. Only lab-authored scripts come here. */
  private async run(container: Docker.Container, script: string, timeoutMs = 20_000) {
    const execution = await container.exec({
      Cmd: ['bash', '-c', script],
      User: 'root',
      WorkingDir: '/root',
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await execution.start({ hijack: true, stdin: false });
    const output = new PassThrough();
    const decoder = new StringDecoder('utf8');
    let text = '';
    output.on('data', (chunk: Buffer) => {
      text = (text + decoder.write(chunk)).slice(-OUTPUT_LIMIT);
    });
    this.docker.modem.demuxStream(stream, output, output);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error('The lab command took too long.'));
      }, timeoutMs);
      stream.once('end', () => {
        clearTimeout(timer);
        resolve();
      });
      stream.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return { code: (await execution.inspect()).ExitCode ?? 1, output: text };
  }

  private async running() {
    const resource = await this.owned();
    if (!resource?.info.State.Running) throw new Error('The lab machine is stopped. Select Start to continue.');
    return resource.container;
  }

  start() {
    return this.serial(async () => {
      let resource = await this.owned();
      if (!resource) {
        await this.pull();
        const container = await this.docker.createContainer(shellContainerOptions(this.lab, this.scope));
        await container.start();
        // Setup runs once, on a fresh machine. Resuming never runs it again.
        const result = await this.run(container, this.lab.setup, 60_000).catch((error: unknown) => ({
          code: 1,
          output: error instanceof Error ? error.message : String(error),
        }));
        if (result.code) {
          await container.remove({ force: true }).catch(() => {});
          throw new Error(`The lab could not be prepared. ${result.output.trim().slice(-500)}`);
        }
        return;
      }
      if (!resource.info.State.Running) {
        await resource.container.start();
        // Best effort: a boot script that fails leaves the machine running, as a real boot would.
        if (this.lab.boot) await this.run(resource.container, this.lab.boot, 30_000).catch(() => {});
      }
    });
  }

  stop() {
    return this.serial(async () => {
      this.disconnect();
      const resource = await this.owned();
      if (resource?.info.State.Running) {
        if (this.lab.shutdown) await this.run(resource.container, this.lab.shutdown, 15_000).catch(() => {});
        await resource.container.stop({ t: 1 });
      }
    });
  }

  reset() {
    return this.serial(async () => {
      this.disconnect();
      const resource = await this.owned();
      if (resource) await resource.container.remove({ force: true });
    });
  }

  check(stepId: unknown): Promise<ShellStepResult> {
    const step = this.lab.steps.find((item) => item.id === stepId);
    if (!step) return Promise.reject(new Error('Unknown lab step.'));
    return this.serial(async () => (await this.evaluate(await this.running(), [step]))[0]);
  }

  /**
   * Every step's checks against the machine as it is now. The lab page polls this while the
   * machine runs, so steps tick off the moment the machine really does what the step asks.
   * Resolves to null when the machine is not running, so polling a stopped lab is not an error.
   */
  checkAll(): Promise<ShellStepResult[] | null> {
    return this.serial(async () => {
      const resource = await this.owned();
      if (!resource?.info.State.Running) return null;
      return this.evaluate(resource.container, this.lab.steps);
    });
  }

  /**
   * Run checks in one exec, so live checking stays cheap. Each check runs in its own bash with
   * its own time limit, so one that exits early or hangs cannot affect the others.
   */
  private async evaluate(container: Docker.Container, steps: ShellLab['steps']): Promise<ShellStepResult[]> {
    const all = steps.flatMap((step) => step.checks.map((check) => ({ step, check })));
    const script = all
      .map(({ check }, index) => {
        const encoded = Buffer.from(check.run).toString('base64');
        return `timeout ${CHECK_SECONDS} bash -c "$(printf %s '${encoded}' | base64 -d)" </dev/null >/dev/null 2>&1; echo "${RESULT_MARK} ${index} $?"`;
      })
      .join('\n');
    const { output } = await this.run(container, script, (CHECK_SECONDS * all.length + 10) * 1000).catch(() => ({ code: 1, output: '' }));
    const codes = new Map<number, number>();
    for (const line of output.split('\n')) {
      const match = new RegExp(`^${RESULT_MARK} (\\d+) (\\d+)$`).exec(line.trim());
      if (match) codes.set(Number(match[1]), Number(match[2]));
    }
    const results: ShellStepResult[] = steps.map((step) => {
      const checks = step.checks.map((check) => {
        const passed = codes.get(all.findIndex((item) => item.check === check)) === 0;
        return { id: check.id, label: check.label, passed, message: passed ? '' : check.fail };
      });
      return { stepId: step.id, passed: checks.every((check) => check.passed), checks };
    });
    // Only a failing step is asked about its listed mistakes, so a passing lab costs nothing extra.
    const failing = results.filter((result) => !result.passed && steps.find((step) => step.id === result.stepId)?.mistakes?.length);
    if (failing.length) {
      const asked = failing.flatMap((result) => (steps.find((step) => step.id === result.stepId)?.mistakes ?? []).map((mistake) => ({ result, mistake })));
      const mistakeScript = asked
        .map(({ mistake }, index) => {
          const encoded = Buffer.from(mistake.when).toString('base64');
          return `timeout ${CHECK_SECONDS} bash -c "$(printf %s '${encoded}' | base64 -d)" </dev/null >/dev/null 2>&1; echo "${RESULT_MARK}m ${index} $?"`;
        })
        .join('\n');
      const answered = await this.run(container, mistakeScript, (CHECK_SECONDS * asked.length + 10) * 1000).catch(() => ({ code: 1, output: '' }));
      const hits = new Map<number, number>();
      for (const line of answered.output.split('\n')) {
        const match = new RegExp(`^${RESULT_MARK}m (\\d+) (\\d+)$`).exec(line.trim());
        if (match) hits.set(Number(match[1]), Number(match[2]));
      }
      asked.forEach(({ result, mistake }, index) => {
        if (!result.mistake && hits.get(index) === 0) result.mistake = mistake.say;
      });
    }
    return results;
  }

  private disconnect() {
    const old = this.terminal;
    old?.stream.destroy();
    this.terminal = undefined;
    // Closing the connection does not end the shell inside the machine, so each reconnect would
    // leave one more bash behind until the process limit is reached. Ask the old shell to hang up.
    if (old) void this.hangUp(old.id);
  }

  /** Best effort: sends the old terminal's shell a hang-up signal, as closing a real terminal window does. */
  private async hangUp(id: string) {
    try {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return;
      const container = this.docker.getContainer(this.name);
      const execution = await container.exec({
        Cmd: ['bash', '-c', `p=/run/edorax-term-${id}; [ -f $p ] && kill -HUP "$(cat $p)" 2>/dev/null; rm -f $p`],
        User: 'root',
        AttachStdout: false,
        AttachStderr: false,
      });
      await execution.start({ Detach: true });
    } catch {
      /* The machine may be stopped already, which ends every shell. */
    }
  }

  dispose() {
    this.disconnect();
  }

  openTerminal(id: unknown) {
    return this.serial(async () => {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid terminal session.');
      this.disconnect();
      const container = await this.running();
      const execution = await container.exec({
        // The shell writes its own process id first, so hangUp can find it later, then replaces itself with bash.
        Cmd: ['bash', '-c', `echo $$ > /run/edorax-term-${id}; exec bash -l`],
        User: 'root',
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/root',
        Env: ['TERM=xterm-256color'],
      });
      const stream = await execution.start({ hijack: true, stdin: true, Tty: true });
      this.terminal = { id, exec: execution, stream };
      const decoder = new StringDecoder('utf8');
      // Backpressure, so a noisy command cannot flood Electron IPC.
      stream.on('data', (chunk: Buffer) => {
        this.emit({ id, data: decoder.write(chunk) });
        stream.pause();
        setTimeout(() => {
          if (!stream.destroyed) stream.resume();
        }, 16);
      });
      stream.on('error', () => this.emit({ id, data: '\r\nTerminal disconnected. Reconnect to continue.\r\n' }));
      stream.on('end', () => this.emit({ id, data: '\r\nTerminal session ended. Reconnect to open a new one.\r\n' }));
    });
  }

  closeTerminal(id: unknown) {
    return this.serial(async () => {
      if (this.terminal?.id === id) this.disconnect();
    });
  }

  async terminalInput(id: unknown, data: unknown) {
    if (typeof data !== 'string' || Buffer.byteLength(data) > 16 * 1024) throw new Error('Terminal input too large.');
    const terminal = this.terminal;
    if (terminal && terminal.id === id) terminal.stream.write(data);
  }

  async resizeTerminal(id: unknown, cols: unknown, rows: unknown) {
    if (![cols, rows].every((value) => Number.isInteger(value) && (value as number) > 0 && (value as number) <= 500))
      throw new Error('Invalid terminal size.');
    const terminal = this.terminal;
    if (terminal && terminal.id === id) await terminal.exec.resize({ w: cols as number, h: rows as number });
  }
}
