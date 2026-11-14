// Needs Docker. For every shell lab: start a fresh machine, prove each step
// fails on the broken server, apply the step's solution, prove it passes, and
// prove the machine has no network. Run with: npm --prefix desktop run test:labs
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDocker } from '../src/labs/runtime';
import { loadShellLabs } from '../src/shell-labs/loader';
import { LABS_DIR, realLabsPresent } from './helpers/labs-dir';
import { ShellLabRuntime, shellLabName } from '../src/shell-labs/runtime';

// The made-up fixture labs are not meant to run in Docker, so without the real labs nothing runs here.
const SHELL_LABS = realLabsPresent ? loadShellLabs(LABS_DIR).labs : [];

async function sh(docker: ReturnType<typeof localDocker>, name: string, script: string) {
  const execution = await docker.getContainer(name).exec({ Cmd: ['bash', '-c', script], AttachStdout: true, AttachStderr: true });
  const stream = await execution.start({ hijack: true, stdin: false });
  stream.resume();
  await new Promise((resolve) => stream.once('end', resolve));
  return (await execution.inspect()).ExitCode;
}

async function output(docker: ReturnType<typeof localDocker>, name: string, script: string) {
  const execution = await docker.getContainer(name).exec({ Cmd: ['bash', '-c', script], AttachStdout: true, AttachStderr: true });
  const stream = await execution.start({ hijack: true, stdin: false });
  let text = '';
  stream.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
  await new Promise((resolve) => stream.once('end', resolve));
  return text;
}

// What a lab can change: every path's type, mode, owner and size, plus the content of files where labs
// work. Folder times are left out, because a check may create and remove a probe file. Logs written by
// logins (lastlog, wtmp, auth) are left out, because a check may log in over SSH.
const FINGERPRINT = `find / -xdev \\( -path /proc -o -path /sys -o -path /dev -o -path /run -o -path /tmp -o -path /var/log -o -path /var/cache \\) -prune -o -printf '%p %y %m %u %g %s\\n' 2>/dev/null | sort | md5sum
find /etc /root /home /srv /opt /usr/local -xdev -type f -exec md5sum {} + 2>/dev/null | sort | md5sum`;

// SHELL_LAB=slug runs one lab only, for fast iteration while writing labs.
for (const lab of SHELL_LABS.filter((item) => !process.env.SHELL_LAB || item.slug === process.env.SHELL_LAB)) {
  test(`real Docker: ${lab.slug} fails when broken and passes with its solutions`, { timeout: 900_000 } /* the first run of a lab builds its image, which can take minutes */, async (context) => {
    const docker = localDocker();
    try {
      await docker.ping();
    } catch {
      context.skip('Docker is not running.');
      return;
    }
    const scope = `integration-test:shell:${lab.slug}`;
    const runtime = new ShellLabRuntime(docker, lab, scope);
    try {
      await runtime.reset();
      await runtime.start();
      assert.equal((await runtime.status()).running, true);
      assert.notEqual(await sh(docker, shellLabName(scope), 'getent hosts example.com'), 0, 'the lab machine must have no network');

      // Live checking runs every check every few seconds, so checks must leave the machine as they found it.
      const untouched = await output(docker, shellLabName(scope), FINGERPRINT);
      for (let round = 0; round < 3; round++) {
        const live = await runtime.checkAll();
        assert.ok(live, 'live checking returns results while the machine runs');
        assert.deepEqual(
          live.filter((result) => result.passed).map((result) => result.stepId),
          [],
          'no step may pass on a fresh machine',
        );
      }
      assert.equal(await output(docker, shellLabName(scope), FINGERPRINT), untouched, 'running the checks changed the machine');

      for (const step of lab.steps) {
        const before = await runtime.check(step.id);
        assert.equal(before.passed, false, `${step.id} passes before the learner does anything`);
        assert.equal(await sh(docker, shellLabName(scope), step.solution), 0, `${step.id} solution failed`);
        const after = await runtime.check(step.id);
        assert.deepEqual(
          after.checks.filter((check) => !check.passed).map((check) => check.id),
          [],
          `${step.id} still fails after its solution`,
        );
        const live = (await runtime.checkAll())?.find((result) => result.stepId === step.id);
        assert.deepEqual(live, after, `${step.id}: live checking and the Check button disagree`);
      }
      await runtime.stop();
      assert.equal((await runtime.status()).running, false);
      assert.equal(await runtime.checkAll(), null, 'live checking a stopped machine returns nothing and does not fail');
      await runtime.start();
      assert.equal((await runtime.check(lab.steps[0].id)).passed, true, 'resume must keep the machine state');
    } finally {
      await runtime.reset();
    }
  });
}
