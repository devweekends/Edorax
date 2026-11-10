import { test, expect } from '@playwright/test';

test('standalone terminal starts without Theia and survives hiding', async ({
  page,
}) => {
  await page.goto('/tests/workspace-fixture/index.html');
  await page
    .getByRole('button', { name: 'Open terminal', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Course terminal' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).workspaceCalls.filter(
            (c: string) => c === 'terminal-open',
          ).length,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).workspaceCalls.filter((c: string) =>
            c.startsWith('resume:'),
          ).length,
      ),
    )
    .toBe(0);
  await page
    .getByRole('button', { name: 'Close terminal', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Course terminal' }),
  ).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Open terminal', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Course terminal' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).workspaceCalls.filter(
            (c: string) => c === 'terminal-open',
          ).length,
      ),
    )
    .toBe(1);
});

test('IDE folder is restored per course and folder/close actions remain visible', async ({
  page,
}) => {
  await page.goto('/tests/workspace-fixture/index.html');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Open IDE', exact: true }).click();
  await expect(
    page.getByText('Open your workspace', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Select folder', exact: true })
    .click();
  await expect(
    page.getByText('Open your workspace', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open folder', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Switch course' }).click();
  await page.getByRole('button', { name: 'Open IDE', exact: true }).click();
  await expect(
    page.getByText('Open your workspace', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Select folder', exact: true })
    .click();
  await expect(
    page.getByText('Open your workspace', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch course' }).click();
  await page.getByRole('button', { name: 'Open IDE', exact: true }).click();
  await expect(
    page.getByText('Open your workspace', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Focus IDE', exact: true }).click();
  await page.getByRole('button', { name: 'Close IDE', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Project IDE' }),
  ).not.toBeVisible();
});
