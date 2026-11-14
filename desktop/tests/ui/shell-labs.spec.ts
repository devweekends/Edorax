import { test, expect } from '@playwright/test';
import { SHELL_LABS } from '../../src/shell-labs/catalog';
import { shellLabSummary, shellLabView } from '../../src/domain/shell-labs';

const lab = SHELL_LABS.find((item) => item.slug === 'linux-101')!;
const data = { summaries: SHELL_LABS.map(shellLabSummary), view: shellLabView(lab) };

test('a shell lab teaches one step at a time, ticks live and lets the terminal move', async ({ page }) => {
  await page.addInitScript((data) => {
    // Anything the page does not need answers "not available", so other parts of the app stay quiet.
    const quiet = (): unknown =>
      new Proxy(function () {}, {
        get: (_target, key) => (key === 'then' ? (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ ok: false, message: 'Not in this test', code: 'TEST' }).then(resolve, reject) : quiet()),
        apply: () => quiet(),
      });
    const state = window as unknown as { passed: string[] };
    state.passed = [];
    const result = (step: (typeof data.view.stepList)[number]) => ({
      stepId: step.id,
      passed: state.passed.includes(step.id),
      checks: step.checks.map((check) => ({ id: check.id, label: check.label, passed: state.passed.includes(step.id), message: 'Still to do.' })),
    });
    const shellLabs = {
      list: async () => data.summaries,
      view: async () => data.view,
      status: async () => ({ available: true, created: true, running: true, message: 'box1 is running' }),
      start: async () => {},
      stop: async () => {},
      reset: async () => {},
      check: async (_slug: string, stepId: string) => result(data.view.stepList.find((step) => step.id === stepId)!),
      checkAll: async () => data.view.stepList.map(result),
      openTerminal: async () => {},
      closeTerminal: async () => {},
      terminalInput: async () => {},
      resizeTerminal: async () => {},
      onTerminalData: () => () => {},
    };
    window.buildment = new Proxy(
      { authStatus: async () => ({ ok: true, data: { signedIn: true } }), listCourses: async () => ({ ok: true, courses: [] }), shellLabs } as Record<string, unknown>,
      { get: (target, key: string) => (key in target ? target[key] : quiet()) },
    ) as unknown as typeof window.buildment;
  }, data);

  page.on('console', (message) => message.type() === 'error' && console.log('PAGE ERROR:', message.text()));
  page.on('pageerror', (error) => console.log('PAGE EXCEPTION:', error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Labs', exact: true }).click();
  await page.getByRole('button', { name: 'Shell', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Docker/ })).toBeEnabled();
  await page.screenshot({ path: 'test-results/shell-hub.png' });
  await page.getByRole('button', { name: /^Linux/ }).click();
  await expect(page.getByRole('heading', { name: 'Linux labs' })).toBeVisible();
  await page.getByRole('button', { name: /Linux 101: first steps in the terminal/ }).click();

  // One step at a time: step 1 is open, its lesson and commands are there, later steps are locked.
  await expect(page.getByText(`Mission 1 of ${lab.steps.length}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: lab.steps[0].goal })).toBeVisible();
  await expect(page.getByRole('heading', { name: lab.steps[1].goal })).toHaveCount(0);
  await expect(page.getByText('Learn first')).toBeVisible();
  await expect(page.getByRole('region', { name: 'What to do' })).toBeVisible();
  // No briefing box and no character message box: just the task, what to do and what to get.
  await expect(page.getByRole('region', { name: 'Message' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Your briefing' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Type it' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Step 2, locked/ })).toBeDisabled();
  await page.screenshot({ path: 'test-results/shell-lab-step.png' });

  // Live checking: when the machine passes the step, it ticks off and Next step appears.
  await page.evaluate(() => ((window as unknown as { passed: string[] }).passed = ['make-folder']));
  await expect(page.getByText(lab.steps[0].win!)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('What just happened')).toBeVisible();
  await page.screenshot({ path: 'test-results/shell-lab-win.png' });
  await page.getByRole('button', { name: 'Next step' }).first().click();
  await expect(page.getByText(`Mission 2 of ${lab.steps.length}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: lab.steps[1].goal })).toBeVisible();

  // The terminal can float as a window, dock at the bottom and fill the area.
  const terminal = page.getByRole('region', { name: 'Linux terminal' });
  await page.getByRole('button', { name: 'Float terminal as a window' }).click();
  await expect(terminal).toHaveCSS('position', 'absolute');
  await page.screenshot({ path: 'test-results/shell-lab-float.png' });
  await page.getByRole('button', { name: 'Dock terminal at the bottom' }).click();
  await expect(terminal).toHaveCSS('position', 'static');
  await page.screenshot({ path: 'test-results/shell-lab-bottom.png' });
  await page.getByRole('button', { name: 'Maximize terminal' }).click();
  await expect(page.getByText(`Mission 2 of ${lab.steps.length}`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the steps again' }).click();
  await expect(page.getByText(`Mission 2 of ${lab.steps.length}`)).toBeVisible();
});

test('the first start shows the steps, a percent for a download and a live line for a build', async ({ page }) => {
  await page.addInitScript((data) => {
    const quiet = (): unknown =>
      new Proxy(function () {}, {
        get: (_target, key) => (key === 'then' ? (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ ok: false, message: 'Not in this test', code: 'TEST' }).then(resolve, reject) : quiet()),
        apply: () => quiet(),
      });
    const listeners: ((progress: unknown) => void)[] = [];
    const w = window as unknown as { send: (progress: unknown) => void; finish: () => void };
    w.send = (progress) => listeners.forEach((listener) => listener({ slug: 'linux-101', ...(progress as object) }));
    let release: () => void = () => {};
    w.finish = () => release();
    let running = false;
    const shellLabs = {
      list: async () => data.summaries,
      view: async () => data.view,
      status: async () => ({ available: true, created: running, running, message: 'box1' }),
      start: () => new Promise<void>((resolve) => (release = () => { running = true; resolve(); })),
      stop: async () => {},
      reset: async () => {},
      check: async () => ({}),
      checkAll: async () => null,
      openTerminal: async () => {},
      closeTerminal: async () => {},
      terminalInput: async () => {},
      resizeTerminal: async () => {},
      onTerminalData: () => () => {},
      onStartProgress: (listener: (progress: unknown) => void) => {
        listeners.push(listener);
        return () => {};
      },
    };
    window.buildment = new Proxy(
      { authStatus: async () => ({ ok: true, data: { signedIn: true } }), listCourses: async () => ({ ok: true, courses: [] }), shellLabs } as Record<string, unknown>,
      { get: (target, key: string) => (key in target ? target[key] : quiet()) },
    ) as unknown as typeof window.buildment;
  }, data);

  await page.goto('/');
  await page.getByRole('button', { name: 'Labs', exact: true }).click();
  await page.getByRole('button', { name: 'Shell', exact: true }).click();
  await page.getByRole('button', { name: /^Linux/ }).click();
  await page.getByRole('button', { name: /Linux 101: first steps in the terminal/ }).click();
  await page.getByRole('button', { name: 'Start machine' }).click();

  const plan = ['Download the base system', 'Install the tools', 'Start the machine', 'Prepare the lab'];
  const now = Date.now();
  await page.evaluate((plan) => (window as unknown as { send: (p: unknown) => void }).send({ plan, step: 0, percent: 42, detail: '12 MB of 29 MB', stepStartedAt: Date.now() }), plan);
  await expect(page.getByRole('progressbar', { name: 'Download the base system' })).toHaveAttribute('aria-valuenow', '42');
  await expect(page.getByText('12 MB of 29 MB')).toBeVisible();
  await expect(page.getByText('42%')).toBeVisible();
  await page.screenshot({ path: 'test-results/shell-start-download.png' });

  // A step with no percent shows its last line and a moving bar; finished steps get a tick.
  await page.evaluate((plan) => (window as unknown as { send: (p: unknown) => void }).send({ plan, step: 1, detail: 'Installing nano', stepStartedAt: Date.now() }), plan);
  await expect(page.getByText('Installing nano')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Install the tools' })).not.toHaveAttribute('aria-valuenow');
  await page.screenshot({ path: 'test-results/shell-start-install.png' });
  expect(Date.now() - now).toBeLessThan(30_000);

  await page.evaluate(() => (window as unknown as { finish: () => void }).finish());
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('a quiz step shows the text to read, takes an answer and never sees the right one', async ({ page }) => {
  const quizStep = lab.steps.find((step) => step.quiz)!;
  const quizView = data.view.stepList.find((step) => step.id === quizStep.id)!;
  const before = lab.steps.slice(0, lab.steps.indexOf(quizStep)).map((step) => step.id);
  await page.addInitScript(
    ({ data, before, rightOption }) => {
      const quiet = (): unknown =>
        new Proxy(function () {}, {
          get: (_target, key) => (key === 'then' ? (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ ok: false, message: 'Not in this test', code: 'TEST' }).then(resolve, reject) : quiet()),
          apply: () => quiet(),
        });
      try { localStorage.setItem('edorax:shell-labs:v1', JSON.stringify({ 'linux-101': before })); } catch { /* ignore */ }
      const asked: number[] = [];
      (window as unknown as { asked: number[] }).asked = asked;
      const shellLabs = {
        list: async () => data.summaries,
        view: async () => data.view,
        status: async () => ({ available: true, created: false, running: false, message: 'box1 is stopped' }),
        start: async () => {}, stop: async () => {}, reset: async () => {},
        check: async () => ({}), checkAll: async () => null,
        openTerminal: async () => {}, closeTerminal: async () => {}, terminalInput: async () => {}, resizeTerminal: async () => {},
        onTerminalData: () => () => {},
        onStartProgress: () => () => {},
        answer: async (_slug: string, _step: string, option: number) => {
          asked.push(option);
          return option === rightOption ? { correct: true, why: 'It is right because the main process said so.' } : { correct: false, why: '' };
        },
      };
      window.buildment = new Proxy(
        { authStatus: async () => ({ ok: true, data: { signedIn: true } }), listCourses: async () => ({ ok: true, courses: [] }), shellLabs } as Record<string, unknown>,
        { get: (target, key: string) => (key in target ? target[key] : quiet()) },
      ) as unknown as typeof window.buildment;
    },
    { data, before, rightOption: quizStep.quiz!.answer },
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Labs', exact: true }).click();
  await page.getByRole('button', { name: 'Shell', exact: true }).click();
  await page.getByRole('button', { name: /^Linux/ }).click();
  await page.getByRole('button', { name: /Linux 101: first steps in the terminal/ }).click();

  await expect(page.getByRole('heading', { name: quizStep.goal })).toBeVisible();
  // The page got the question and the answers, and nothing that says which one is right.
  expect(JSON.stringify(quizView)).not.toContain(quizStep.quiz!.why);
  await expect(page.getByRole('group', { name: 'Question' })).toBeVisible();
  if (quizStep.quiz!.show) await expect(page.getByLabel('Read this')).toBeVisible();
  await expect(page.getByText('What to do')).toBeVisible();
  await expect(page.getByText('Done when')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check my answer' })).toBeDisabled();

  const wrong = quizStep.quiz!.answer === 0 ? 1 : 0;
  await page.getByRole('radio').nth(wrong).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Not quite' })).toBeVisible();

  await page.getByRole('radio').nth(quizStep.quiz!.answer).check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await expect(page.getByText('It is right because the main process said so.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Next step|Finish lab/ }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shell-quiz.png' });
});
