import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dump as dumpYaml } from 'js-yaml';
import assert from 'node:assert/strict';
import { configureShellLabs, getShellLab, getShellLabs } from '../src/shell-labs/catalog';
import { shellLabView, validateShellLab, type ShellLab } from '../src/domain/shell-labs';
import { SHELL_LAB_CAPABILITIES, ShellLabRuntime, shellContainerOptions, shellLabName, shellNetworkName } from '../src/shell-labs/runtime';
import { devShellLabsDir, loadShellLabs } from '../src/shell-labs/loader';

// The labs for these tests come from the development folder (run "pnpm sync:labs" first).
const SHELL_LABS = loadShellLabs().labs;

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
      if (step.quiz) {
        // The question and answers are shown; the right answer and its explanation are not.
        assert.equal(text.includes(step.quiz.why), false, `${lab.slug} ${step.id} leaks the quiz explanation`);
        continue;
      }
      assert.equal(text.includes(step.solution), false, `${lab.slug} ${step.id} leaks its solution`);
      for (const check of step.checks) assert.equal(text.includes(check.run), false);
    }
  }
});

test('all labs load from the Core files with no errors', () => {
  const { labs, errors } = loadShellLabs();
  assert.deepEqual(errors, []);
  assert.equal(labs.length, SHELL_LABS.length);
  assert.ok(labs.length >= 19, 'run "pnpm sync:labs" if the labs folder is empty');
});

test('a broken lab file is skipped and named, and the other labs still load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labs-'));
  try {
    const first = SHELL_LABS[0];
    fs.writeFileSync(path.join(dir, 'index.yaml'), dumpYaml({ labs: [first.slug, 'broken-lab'] }));
    fs.writeFileSync(path.join(dir, `${first.slug}.yaml`), dumpYaml(first));
    fs.writeFileSync(path.join(dir, 'broken-lab.yaml'), dumpYaml({ ...first, slug: 'broken-lab', machine: { ...first.machine, image: 'ubuntu:latest' } }));
    const { labs, errors } = loadShellLabs(dir);
    assert.deepEqual(labs.map((lab) => lab.slug), [first.slug]);
    assert.match(errors.join('\n'), /broken-lab.*not latest/);
    assert.match(loadShellLabs(path.join(dir, 'missing')).errors.join(''), /pnpm sync:labs/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the learner view carries each step\'s lesson and commands', () => {
  for (const lab of SHELL_LABS)
    for (const step of shellLabView(lab).stepList) {
      assert.ok(step.learn.length >= 2, `${lab.slug} ${step.id} teaches too little`);
      if (!step.quiz) assert.ok(step.commands.length >= 2, `${lab.slug} ${step.id} lists too few commands`);
      assert.ok(step.about && (step.expected || step.quiz), `${lab.slug} ${step.id} needs "about" and "expected"`);
      assert.match(step.body, /^1\. /, `${lab.slug} ${step.id}: the body must be numbered steps`);
    }
});

test('lookup only returns registered labs', () => {
  assert.equal(getShellLab('nope'), null);
  assert.equal(getShellLab('__proto__'), null);
  assert.equal(getShellLab(42), null);
  configureShellLabs({ cacheFile: null, devDir: devShellLabsDir() });
  assert.equal(getShellLab(SHELL_LABS[0].slug), getShellLabs()[0]);
  assert.deepEqual(getShellLab(SHELL_LABS[0].slug), SHELL_LABS[0]);
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

function multiLab(): ShellLab {
  const base = structuredClone(SHELL_LABS[0]) as ShellLab;
  base.machine.name = 'control';
  base.machines = [
    { name: 'web1', image: 'ubuntu:24.04', capabilities: ['SYS_CHROOT'], sudo: true, memoryMb: 512 },
    { name: 'web2', image: 'ubuntu:24.04' },
  ];
  base.steps[0].checks[0].on = 'web1';
  return base;
}

test('a lab with extra machines puts them all on one private network with no way out', () => {
  const lab = multiLab();
  assert.deepEqual(validateShellLab(lab), []);
  const main = shellContainerOptions(lab, 'u:shell:x');
  const web1 = shellContainerOptions(lab, 'u:shell:x', lab.machines![0]);
  assert.equal(main.HostConfig.NetworkMode, shellNetworkName('u:shell:x'));
  assert.equal(web1.HostConfig.NetworkMode, shellNetworkName('u:shell:x'));
  assert.equal(web1.name, `${shellLabName('u:shell:x')}-web1`);
  assert.deepEqual(web1.NetworkingConfig?.EndpointsConfig[shellNetworkName('u:shell:x')].Aliases, ['web1']);
  // Every machine carries the lead container's name as owner label, so ownership is one check.
  assert.equal(web1.Labels['com.edorax.shell-lab'], shellLabName('u:shell:x'));
  // A single-machine lab keeps no network at all.
  assert.equal(shellContainerOptions(SHELL_LABS[0], 'u:shell:x').HostConfig.NetworkMode, 'none');
});

test('sudo and resources are per machine, and sudo is the only way no-new-privileges is lifted', () => {
  const lab = multiLab();
  assert.deepEqual(shellContainerOptions(lab, 'u:shell:x').HostConfig.SecurityOpt, ['no-new-privileges:true']);
  assert.deepEqual(shellContainerOptions(lab, 'u:shell:x', lab.machines![0]).HostConfig.SecurityOpt, []);
  assert.equal(shellContainerOptions(lab, 'u:shell:x', lab.machines![0]).HostConfig.Memory, 512 * 1024 * 1024);
  assert.equal(shellContainerOptions(lab, 'u:shell:x', lab.machines![1]).HostConfig.Memory, 256 * 1024 * 1024);
});

test('the validator checks extra machines, resource limits and where a check runs', () => {
  const lab = multiLab();
  lab.machines![1].name = 'web1';
  lab.machine.memoryMb = 99999;
  lab.steps[0].checks[0].on = 'db9';
  lab.machines!.push(...Array.from({ length: 4 }, (_, i) => ({ name: `x${i}`, image: 'ubuntu:24.04' })));
  const problems = validateShellLab(lab).join('\n');
  assert.match(problems, /used twice/);
  assert.match(problems, /memoryMb must be a number/);
  assert.match(problems, /"db9", which is not a machine/);
  assert.match(problems, /at most 4 extra machines/);
});

test('a virtual machine lab gets the KVM device and nothing else, and others do not', () => {
  const lab = { ...SHELL_LABS[0], machine: { ...SHELL_LABS[0].machine, vm: true, image: 'edorax-labvm:1', memoryMb: 3072, cpus: 2 } } as ShellLab;
  const options = shellContainerOptions(lab, 'user:shell:vm');
  assert.deepEqual(options.HostConfig.Devices, [{ PathOnHost: '/dev/kvm', PathInContainer: '/dev/kvm', CgroupPermissions: 'rwm' }]);
  assert.deepEqual(options.HostConfig.CapDrop, ['ALL']);
  assert.equal(options.HostConfig.NetworkMode, 'none');
  assert.ok(options.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
  assert.equal('Cmd' in options, false, 'the image runs the hypervisor itself');
  const plain = shellContainerOptions(SHELL_LABS[0], 'user:shell:plain');
  assert.equal('Devices' in plain.HostConfig, false);
  assert.deepEqual(plain.Cmd, ['sleep', 'infinity']);
});

test('the validator keeps virtual machine settings apart from container settings', () => {
  const vm = { ...SHELL_LABS[0], machine: { ...SHELL_LABS[0].machine, packages: undefined, build: undefined, vm: true, image: 'edorax-labvm:1', memoryMb: 3072, cpus: 2 } } as ShellLab;
  assert.deepEqual(validateShellLab(vm), []);
  assert.match(validateShellLab({ ...vm, machine: { ...vm.machine, packages: ['curl'] } } as ShellLab).join(' '), /cannot install packages/);
  assert.match(validateShellLab({ ...vm, machine: { ...vm.machine, sudo: true } } as ShellLab).join(' '), /capabilities or sudo/);
  assert.match(validateShellLab({ ...SHELL_LABS[0], machine: { ...SHELL_LABS[0].machine, memoryMb: 3072 } } as ShellLab).join(' '), /only for virtual machine labs/);
});


test('a quiz step is answered in the main process and its right answer never reaches the page', () => {
  const base = SHELL_LABS[0];
  const quizStep = {
    id: 'read-it',
    goal: 'Read the output and pick what it means',
    body: '1. Read the lines.\n2. Pick the answer.',
    learn: ['Short lesson.'],
    hints: ['a', 'b', 'c'],
    checks: [],
    solution: '',
    quiz: { question: 'What is shown?', options: ['One', 'Two', 'Three'], answer: 1, why: 'Because two.' },
  };
  const lab = { ...base, steps: [quizStep] } as unknown as ShellLab;
  assert.deepEqual(validateShellLab(lab), []);
  const view = JSON.stringify(shellLabView(lab));
  assert.ok(view.includes('What is shown?'));
  assert.equal(view.includes('Because two.'), false);
  assert.equal(/"answer"/.test(view), false);
  const runtime = new ShellLabRuntime({} as any, lab, 'user:shell:quiz');
  assert.deepEqual(runtime.answer('read-it', 0), { correct: false, why: '' });
  assert.deepEqual(runtime.answer('read-it', 1), { correct: true, why: 'Because two.' });
  assert.throws(() => runtime.answer('read-it', 7), /Pick one/);
  assert.throws(() => runtime.answer('nope', 0), /no question/);
  const broken = { ...lab, steps: [{ ...quizStep, quiz: { ...quizStep.quiz, answer: 5 } }] } as unknown as ShellLab;
  assert.match(validateShellLab(broken).join(' '), /answer must be the number/);
  const withChecks = { ...lab, steps: [{ ...quizStep, checks: [{ id: 'x', label: 'x', run: 'true', fail: 'no' }] }] } as unknown as ShellLab;
  assert.match(validateShellLab(withChecks).join(' '), /quiz, so it has no checks/);
});
