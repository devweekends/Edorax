import { test, expect } from '@playwright/test';
import { courses, courseDetail } from '../fixtures';
import { parseLesson } from '../../src/learning/parse-lesson';

const document = parseLesson(`# Native lesson

Learn by testing one change at a time.

\`\`\`javascript
console.log("Lesson snippet");
\`\`\`

<Code id="question-one" />`);
test('code workspace is inside its course and preserves course grading', async ({
  page,
}) => {
  await page.addInitScript(
    ({ courses, courseDetail, document }) => {
      let passed = false;
      let complete = false;
      let signedIn = false;
      const modules =
        (): import('../../../server/src/shared/api/syllabus').SyllabusModule[] => [
          {
            id: 'module',
            order: 1,
            title: 'Debugging basics',
            completedCount: complete ? 1 : 0,
            chapters: [
              {
                id: 'chapter',
                slug: 'lesson-one',
                title: 'Native quiz lesson',
                status: complete ? 'COMPLETED' : 'IN_PROGRESS',
                blockCount: 1,
              },
              {
                id: 'next',
                slug: 'lesson-two',
                title: 'Next debugging lesson',
                status: 'NOT_STARTED',
                blockCount: 0,
                locked: !complete,
              },
            ],
          },
        ];
      window.buildment = {
        ...window.buildment,
        webOrigin: async () => 'https://edorax.com',
        integrityRequest: async (path, _method, body) => {
          if (path.endsWith('/integrity'))
            return {
              ok: true,
              data: {
                attemptId: 'attempt-one',
                attempt: 1,
                startedAt: new Date().toISOString(),
                flagCount: 0,
                camera: {
                  enabled: false,
                  status: 'NOT_REQUESTED',
                  intervalSeconds: 60,
                  width: 320,
                  height: 240,
                  retentionDays: 30,
                },
              },
            };
          if (path.endsWith('/events')) {
            (window as any).integrityEvents = [
              ...((window as any).integrityEvents || []),
              ...(body as any).events,
            ];
            return {
              ok: true,
              data: { accepted: (body as any).events.length, flagCount: 1 },
            };
          }
          return { ok: true, data: null };
        },
        listCourses: async () => ({ ok: true, courses }),
        courseDetail: async () => ({
          ok: true,
          data: { ...courseDetail, signedIn, access: 'active' },
        }),
        signIn: async () => {
          signedIn = true;
          return { ok: true, data: { signedIn: true } };
        },
        signOut: async () => {
          signedIn = false;
          return { ok: true, data: { signedIn: false } };
        },
        cancelSignIn: async () => {},
        enroll: async () => ({ ok: true, data: { lifecycle: 'ACTIVE' } }),
        startLearning: async () => ({
          ok: true,
          data: { href: '/courses/systems/lesson-one' },
        }),
        learning: {
          upgradeCurriculum: async () => ({
            ok: true,
            data: { success: true, releaseId: 'rel-1' },
          }),
          updateTrack: async () => {
            throw new Error('Unexpected track mutation');
          },
          lesson: async (_course, chapter) => ({
            ok: true,
            data: {
              course: {
                id: courses[0].id,
                slug: courses[0].slug,
                title: courses[0].title,
                projectGoal: null,
              },
              chapter: {
                id: chapter === 'lesson-one' ? 'chapter' : 'next',
                slug: chapter,
                title:
                  chapter === 'lesson-one'
                    ? 'Native quiz lesson'
                    : 'Next debugging lesson',
                lessonLabel: '01.01',
                estimatedMinutes: 10,
                readerMode: 'DEFAULT',
                isMilestone: false,
                blockCount: 1,
              },
              prev: null,
              next:
                chapter === 'lesson-one'
                  ? {
                      slug: 'lesson-two',
                      title: 'Next debugging lesson',
                      moduleOrder: 1,
                      order: 2,
                    }
                  : null,
              modules: modules() as any,
              track: null,
              locked: false,
              previous: null,
              content: {
                source: '',
                learningLogAnswers: {},
                checklistState: {},
                chapterComplete: complete,
                canMarkComplete: passed && !complete,
                checkpointsCompleted: passed ? 1 : 0,
                checkpointsTotal: 1,
                nextLocked: !complete,
                reflectionPending: false,
                recap: { checks: '', open: '', next: '' },
                streakMilestone: null,
                headingNotes: {},
                predictGate: false,
                predictRevealed: true,
                helpThread: null,
              },
              document:
                chapter === 'lesson-one'
                  ? document
                  : {
                      type: 'root',
                      children: [
                        {
                          type: 'paragraph',
                          children: [
                            {
                              type: 'text',
                              value: 'You unlocked this lesson.',
                            },
                          ],
                        },
                      ],
                    },
            },
          }),
          block: async () => ({
            ok: true,
            data: {
              type: 'CODE',
              config: {
                mode: 'implement',
                language: 'javascript',
                prompt: 'Return the sum of two numbers.',
                starterCode: 'module.exports = (a, b) => 0;',
                filename: 'sum.js',
                allowRetry: true,
                testCount: 1,
                hints: ['Use addition.'],
              },
              initialState: null,
            },
          }),
          aiInterview: async () => ({
            ok: false,
            code: 'NOT_USED',
            message: 'This reader fixture does not provide interviews.',
          }),
          quiz: async () => ({
            ok: true,
            data: {
              steps: [],
              blockIds: ['question-one'],
              initialAnswers: passed ? { 'question-one': ['one'] } : {},
              initialBlockGrades: {},
              initialScoreSummary: null,
            },
          }),
          submitQuiz: async (id, answers) => {
            if (
              id !== 'chapter' ||
              answers.length !== 1 ||
              answers[0].blockId !== 'question-one'
            )
              throw new Error('Wrong quiz submission');
            passed = answers[0].selected.includes('one');
            return { ok: true, data: { score: passed ? 1 : 0, maxScore: 1 } };
          },
          complete: async () => {
            if (!passed) throw new Error('Quiz incomplete');
            complete = true;
            return { ok: true, data: null };
          },
          overview: async () => ({
            ok: true,
            data: {
              course: { ...courses[0], status: 'PUBLISHED' },
              access: 'active',
              coupon: null,
              track: null,
              enrollment: {
                percentComplete: 0,
                chaptersCompleted: 0,
                pendingReviews: 0,
                status: 'IN_PROGRESS',
              },
              rating: null,
              ratingDismissed: false,
              syllabus: {
                modules: modules(),
                chapterCount: 2,
                continueHref: '/courses/systems/lesson-one',
                defaultOpenModuleId: 'module',
              },
            },
          }),
          answer: async (id, payload) => {
            if (id !== 'question-one') throw new Error('Wrong course exercise');
            passed = payload.source === 'module.exports = (a, b) => a + b;';
            (window as any).submittedCode = payload.source;
            return {
              ok: true,
              data: { isCorrect: passed, score: passed ? 1 : 0, maxScore: 1 },
            };
          },
          saveLog: async () => ({ ok: true, data: null }),
          checklist: async () => ({ ok: true, data: null }),
        },
      };
    },
    { courses, courseDetail, document },
  );
  await page.addInitScript(() => {
    let running = false;
    let available = true;
    (window as any).setLabState = (state: {
      running: boolean;
      available: boolean;
    }) => {
      running = state.running;
      available = state.available;
    };
    let file = '';
    const listeners = new Set<(event: { id: string; data: string }) => void>();
    const check = (id: string) => {
      if (!['question-one', 'course:systems'].includes(id))
        throw new Error('Wrong exercise workspace');
    };
    const projectFiles: Record<string, string> = { 'README.md': '# Project' };
    const folders = new Set<string>();
    window.buildment.labs = {
      prepareTerminal: async () => ({
        blockId: 'course:systems',
        folder: '/tmp/edorax-test',
      }),
      configure: async (_id, mode) => ({
        mode,
        folder: mode === 'local' ? '/test/project' : undefined,
      }),
      listFiles: async () => [
        ...Object.keys(projectFiles).map((path) => ({
          path,
          kind: 'file' as const,
        })),
        ...[...folders].map((path) => ({ path, kind: 'directory' as const })),
      ],
      readProjectFile: async (_id, path) => projectFiles[path] || '',
      saveProjectFile: async (_id, path, content) => {
        projectFiles[path] = content;
      },
      createEntry: async (_id, path, kind) => {
        if (kind === 'directory') folders.add(path);
        else projectFiles[path] = '';
      },
      status: async (id) => {
        check(id);
        return {
          available,
          running,
          message: !available
            ? 'Docker is unavailable. Open Docker Desktop, wait for the engine to start, then retry.'
            : running
              ? 'Docker lab running'
              : 'Docker lab stopped. Select Start terminal to resume.',
        };
      },
      start: async (id) => {
        check(id);
        running = true;
      },
      stop: async () => {
        running = false;
      },
      reset: async () => {
        running = false;
        file = '';
      },
      readFile: async () => file,
      saveFile: async (id, source) => {
        check(id);
        file = source;
      },
      openTerminal: async (blockId, id) => {
        check(blockId);
        if (!running)
          throw new Error(
            "Error invoking remote method 'labs:terminal-open': Error: Docker lab stopped. Select Start terminal to resume.",
          );
        for (const listener of listeners)
          listener({ id, data: 'lab:/workspace $ ' });
      },
      closeTerminal: async () => {},
      terminalInput: async () => {},
      resizeTerminal: async () => {},
      onTerminalData: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Hands-on labs' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByRole('button', { name: 'Preview ' + courses[0].title, exact: true })
    .click();
  await page.getByRole('link', { name: 'Start learning', exact: true }).click();
  await expect(page.getByText('Return the sum of two numbers.')).toBeVisible();
  await expect(page.locator('.lesson-snippet .shiki')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Open in IDE', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Code editor for snippet.js' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Browser', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Preview URL' })
    .fill('file:///etc/passwd');
  await page.getByRole('button', { name: 'Open preview', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Browser preview' }).getByRole('alert'),
  ).toContainText('Use an HTTPS website');
  await page.route('http://localhost:3000/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Project preview works</h1>',
    }),
  );
  await page
    .getByRole('textbox', { name: 'Preview URL' })
    .fill('http://localhost:3000');
  await page.getByRole('button', { name: 'Open preview', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Project browser preview"]')
      .getByRole('heading'),
  ).toHaveText('Project preview works');
  await expect(
    page.locator('iframe[title="Project browser preview"]'),
  ).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
  await page.screenshot({ path: 'test-results/workspace-browser.png' });
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Code editor for snippet.js' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-files.png' });
  await page.getByRole('button', { name: 'Close IDE', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDE', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Course IDE', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Code editor for snippet.js' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await expect(
    page
      .getByRole('complementary', { name: 'Project explorer' })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'New folder path' }).fill('src');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New file path' })
    .fill('src/helper.js');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const helperEditor = page.getByRole('textbox', {
    name: 'Code editor for src/helper.js',
  });
  await expect(helperEditor).toBeVisible();
  await helperEditor.focus();
  await page.keyboard.insertText('module.exports = 42;');
  await page.getByRole('button', { name: 'Save file', exact: true }).click();
  await page.getByRole('tab', { name: 'snippet.js', exact: true }).click();
  await page.getByRole('tab', { name: 'src/helper.js', exact: true }).click();
  await expect(helperEditor).toBeVisible();
  await page
    .getByRole('button', { name: 'Stop terminal', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Workspace runtime').selectOption('docker');
  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await page.evaluate(() =>
    (window as any).setLabState({ running: false, available: true }),
  );
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Start terminal', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Docker lab stopped' }),
  ).not.toContainText('remote method');
  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await page.evaluate(() =>
    (window as any).setLabState({ running: false, available: true }),
  );
  await expect(
    page.getByRole('button', { name: 'Start terminal', exact: true }),
  ).toBeVisible({ timeout: 8000 });
  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await page.evaluate(() =>
    (window as any).setLabState({ running: false, available: false }),
  );
  await page
    .getByRole('button', { name: 'Check workspace status', exact: true })
    .click();
  await expect(
    page.getByText('Docker is unavailable.', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reconnect', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (window as any).setLabState({ running: false, available: true }),
  );
  await page
    .getByRole('button', { name: 'Check workspace status', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Stop terminal', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close IDE', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open in IDE', exact: true })
    .last()
    .click();
  const editor = page.getByRole('textbox', { name: 'Code editor for sum.js' });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Mark lesson complete' }),
  ).toBeDisabled();
  await editor.focus();
  await editor.press('ControlOrMeta+a');
  await editor.press('Backspace');
  await page.keyboard.insertText('module.exports = (a, b) => a + b;');
  await page
    .getByRole('button', { name: 'Course workspace', exact: true })
    .click();
  await expect(editor).toBeHidden();
  await page
    .getByRole('button', { name: 'Lesson exercise', exact: true })
    .click();
  await expect(editor).toBeVisible();
  await page.setViewportSize({ width: 760, height: 600 });
  await expect(page.locator('article')).toBeHidden();
  await expect(
    page.getByRole('complementary', { name: 'Course IDE', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1240, height: 840 });

  await page.getByRole('button', { name: 'Focus IDE', exact: true }).click();
  await expect(page.locator('article')).toBeHidden();
  await page
    .getByRole('button', { name: 'Exit IDE focus mode', exact: true })
    .click();
  await expect(page.locator('article')).toBeVisible();
  await page.getByRole('button', { name: 'Close IDE', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: 'Open IDE', exact: true }).click();
  await expect(editor).toBeVisible();

  await page
    .getByRole('button', { name: 'Start terminal', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save to workspace' }).click();
  await expect(
    page.getByText('Saved exercise.js in this workspace.', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Stop terminal', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check my code', exact: true })
    .click();
  await expect(page.getByText('All checks passed — well done!')).toBeVisible();
  expect(await page.evaluate(() => (window as any).submittedCode)).toBe(
    'module.exports = (a, b) => a + b;',
  );
  await expect(
    page.getByRole('button', { name: 'Mark lesson complete' }),
  ).toBeEnabled();
  await page.screenshot({
    path: 'test-results/course-code-workspace.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(
    page.getByRole('button', { name: 'Lesson completed' }),
  ).toBeDisabled();
});
