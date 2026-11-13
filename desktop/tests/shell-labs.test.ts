import test from 'node:test';
import assert from 'node:assert/strict';
import { SHELL_LABS, getShellLab } from '../src/shell-labs/catalog';
import { shellLabView, validateShellLab, type ShellLab } from '../src/domain/shell-labs';
import { SHELL_LAB_CAPABILITIES, ShellLabRuntime, shellContainerOptions, shellLabName } from '../src/shell-labs/runtime';
import { LESSONS } from '../src/shell-labs/lessons';

test('every shell lab is valid and has a unique slug', () => {
  const slugs = new Set<string>();
  for (const lab of SHELL_LABS) {
    assert.deepEqual(validateShellLab(lab), [], lab.slug);
    assert.equal(slugs.has(lab.slug), false, `duplicate slug ${lab.slug}`);
    slugs.add(lab.slug);
  }
});

test('the validator names what is wrong', () => {
  const lab = structuredClone(SHELL_LABS[0]) as ShellLab;
  lab.machine.image = 'ubuntu:latest';
  lab.steps[0].hints = ['only one', '', ''] as ShellLab['steps'][0]['hints'];
  lab.steps[1].id = lab.steps[0].id;
  const problems = validateShellLab(lab).join('\n');
  assert.match(problems, /not latest/);
  assert.match(problems, /three hints/);
  assert.match(problems, /used twice/);
});

test('the learner view carries no setup, check scripts or solutions', () => {
  for (const lab of SHELL_LABS) {
    const text = JSON.stringify(shellLabView(lab));
    assert.equal(text.includes(lab.setup), false);
    for (const step of lab.steps) {
      assert.equal(text.includes(step.solution), false, `${lab.slug} ${step.id} leaks its solution`);
      for (const check of step.checks) assert.equal(text.includes(check.run), false);
    }
  }
});

test('every lesson belongs to a real lab step, so renaming a step cannot drop its lesson silently', () => {
  for (const [slug, steps] of Object.entries(LESSONS)) {
    const lab = SHELL_LABS.find((item) => item.slug === slug);
    assert.ok(lab, `lessons for unknown lab ${slug}`);
    for (const stepId of Object.keys(steps))
      assert.ok(lab.steps.some((step) => step.id === stepId), `lesson for unknown step ${slug} ${stepId}`);
  }
});

test('the learner view carries each step\'s lesson and commands', () => {
  for (const lab of SHELL_LABS)
    for (const step of shellLabView(lab).stepList) {
      assert.ok(step.learn.length >= 2, `${lab.slug} ${step.id} teaches too little`);
      assert.ok(step.commands.length >= 2, `${lab.slug} ${step.id} lists too few commands`);
    }
});

test('lookup only returns registered labs', () => {
  assert.equal(getShellLab('nope'), null);
  assert.equal(getShellLab('__proto__'), null);
  assert.equal(getShellLab(42), null);
  assert.equal(getShellLab(SHELL_LABS[0].slug), SHELL_LABS[0]);
});

test('lab machines are isolated: no network, no mounts, few capabilities, bounded resources', () => {
  const config = shellContainerOptions(SHELL_LABS[0], 'user:shell:x');
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.deepEqual(config.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(config.HostConfig.CapAdd, SHELL_LAB_CAPABILITIES);
  for (const dangerous of ['SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'NET_RAW'])
    assert.equal(config.HostConfig.CapAdd.includes(dangerous), false);
  assert.deepEqual(config.HostConfig.SecurityOpt, ['no-new-privileges:true']);
  assert.equal('Mounts' in config.HostConfig, false);
  assert.equal('Binds' in config.HostConfig, false);
  assert.equal('Privileged' in config.HostConfig, false);
  assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024);
  assert.equal(config.HostConfig.PidsLimit, 128);
  assert.equal(config.name, shellLabName('user:shell:x'));
  assert.notEqual(shellLabName('a:shell:x'), shellLabName('b:shell:x'));
});

test('reset refuses a container the lab does not own', async () => {
  let removed = false;
  const fake = {
    getContainer: () => ({
      inspect: async () => ({ Config: { Labels: {} }, State: { Running: true } }),
      remove: async () => {
        removed = true;
      },
    }),
  };
  const runtime = new ShellLabRuntime(fake as any, SHELL_LABS[0], 'user:shell:x');
  await assert.rejects(runtime.reset(), /not owned/);
  assert.equal(removed, false);
});

test('checking an unknown step is refused before Docker is touched', async () => {
  const runtime = new ShellLabRuntime({} as any, SHELL_LABS[0], 'user:shell:x');
  await assert.rejects(runtime.check('not-a-step'), /Unknown lab step/);
});
