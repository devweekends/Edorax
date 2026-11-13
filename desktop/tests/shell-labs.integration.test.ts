// Needs Docker. For every shell lab: start a fresh machine, prove each step
// fails on the broken server, apply the step's solution, prove it passes, and
// prove the machine has no network. Run with: npm --prefix desktop run test:labs
import test from 'node:test';
import assert from 'node:assert/strict';
import { localDocker } from '../src/labs/runtime';
import { SHELL_LABS } from '../src/shell-labs/catalog';
import { ShellLabRuntime, shellLabName } from '../src/shell-labs/runtime';

async function sh(docker: ReturnType<typeof localDocker>, name: string, script: string) {
  const execution = await docker.getContainer(name).exec({ Cmd: ['bash', '-c', script], AttachStdout: true, AttachStderr: true });
  const stream = await execution.start({ hijack: true, stdin: false });
  stream.resume();
  await new Promise((resolve) => stream.once('end', resolve));
  return (await execution.inspect()).ExitCode;
}

for (const lab of SHELL_LABS) {
  test(`real Docker: ${lab.slug} fails when broken and passes with its solutions`, { timeout: 300_000 }, async (context) => {
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
      }
      await runtime.stop();
      assert.equal((await runtime.status()).running, false);
      await runtime.start();
      assert.equal((await runtime.check(lab.steps[0].id)).passed, true, 'resume must keep the machine state');
    } finally {
      await runtime.reset();
    }
  });
}
