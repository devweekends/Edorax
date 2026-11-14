import { test, expect, type Page } from '@playwright/test';

type Policy = { status: 'required' | 'available' | 'ok'; latestVersion: string; minimumVersion: string; downloadUrl: string; message: string; blocked: boolean };

// The page gets a fake update API. `window.next` is what the "server" answers on the next check.
async function open(page: Page, first: Policy, next: Policy = first) {
  page.on('console', (message) => message.type() === 'error' && console.log('PAGE ERROR:', message.text()));
  page.on('pageerror', (error) => console.log('PAGE EXCEPTION:', error.message));
  await page.addInitScript(
    ({ first, next }) => {
      const quiet = (): unknown =>
        new Proxy(function () {}, {
          get: (_target, key) => (key === 'then' ? (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ ok: false, message: 'Not in this test', code: 'TEST' }).then(resolve, reject) : quiet()),
          apply: () => quiet(),
        });
      const w = window as unknown as { downloads: number; checks: number; next: unknown; push: (state: unknown) => void };
      w.downloads = 0;
      w.checks = 0;
      w.next = next;
      const listeners: ((state: unknown) => void)[] = [];
      w.push = (state) => listeners.forEach((listener) => listener({ currentVersion: '0.1.0', ...(state as object) }));
      const update = {
        status: async () => ({ currentVersion: '0.1.0', ...first }),
        check: async () => {
          w.checks += 1;
          return { currentVersion: '0.1.0', ...(w.next as object) };
        },
        openDownload: async () => {
          w.downloads += 1;
          return { ok: true };
        },
        onChange: (listener: (state: unknown) => void) => {
          listeners.push(listener);
          return () => listeners.splice(listeners.indexOf(listener), 1);
        },
      };
      window.buildment = new Proxy(
        { authStatus: async () => ({ ok: true, data: { signedIn: true } }), listCourses: async () => ({ ok: true, courses: [] }), update } as Record<string, unknown>,
        { get: (target, key: string) => (key in target ? target[key] : quiet()) },
      ) as unknown as typeof window.buildment;
    },
    { first, next },
  );
  await page.goto('/');
  // The first paint of the dev server can be slow; the app marks itself ready once it has drawn.
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true', undefined, { timeout: 45_000 });
}

const required: Policy = { status: 'required', minimumVersion: '0.2.0', latestVersion: '0.3.0', downloadUrl: 'https://edorax.com/download', message: 'This release fixes a security problem.', blocked: false };
const ok: Policy = { status: 'ok', minimumVersion: '0.1.0', latestVersion: '0.1.0', downloadUrl: 'https://edorax.com/download', message: '', blocked: false };
const available: Policy = { status: 'available', minimumVersion: '0.1.0', latestVersion: '0.2.0', downloadUrl: 'https://edorax.com/download', message: '', blocked: false };

test('a required update covers the whole app and nothing behind it can be used', async ({ page }) => {
  await open(page, required, ok);
  const dialog = page.getByRole('alertdialog', { name: 'Update required' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: 'Update required' })).toBeVisible();
  await expect(dialog.getByText('Your version of Edorax (0.1.0) is out of date. Install version 0.3.0 to continue.')).toBeVisible();
  await expect(dialog.getByText('This release fixes a security problem.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download the new version' })).toBeFocused();
  await page.screenshot({ path: 'test-results/update-required.png' });

  // The app is not reachable: no sidebar, no header, only the two buttons can be clicked.
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(2);

  // Escape does not close it and Tab stays inside it.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  // Download asks the main process; Check again asks again and unlocks when the answer is ok.
  await dialog.getByRole('button', { name: 'Download the new version' }).click();
  expect(await page.evaluate(() => (window as unknown as { downloads: number }).downloads)).toBe(1);
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { checks: number }).checks)).toBe(1);
});

// This app (0.1.0) is above the minimum but its exact version is on the blocked list.
const blocked: Policy = { status: 'required', minimumVersion: '0.1.0', latestVersion: '0.4.0', downloadUrl: 'https://edorax.com/download', message: '', blocked: true };

test('a blocked version says it has a known problem, not that it is out of date', async ({ page }) => {
  await open(page, blocked, ok);
  const dialog = page.getByRole('alertdialog', { name: 'Update required' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('This version (0.1.0) has a known problem. Install version 0.4.0 to continue.')).toBeVisible();
  await expect(dialog.getByText('is out of date')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Check again on a blocked version says it still has a known problem', async ({ page }) => {
  await open(page, blocked, blocked);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('This version still has a known problem.')).toBeVisible();
});

test('Check again keeps the screen and says so while the version is still too old', async ({ page }) => {
  await open(page, required, required);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByText('This version is still out of date.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('the screen also appears when the main process pushes a change, and works when signed out', async ({ page }) => {
  await open(page, ok);
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toBeVisible();
  await page.evaluate((state) => (window as unknown as { push: (s: unknown) => void }).push(state), required);
  await expect(page.getByRole('alertdialog', { name: 'Update required' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toHaveCount(0);
});

test('a plain download button is disabled when the server gave no safe address', async ({ page }) => {
  await open(page, { ...required, downloadUrl: '', message: '' });
  await expect(page.getByRole('button', { name: 'Download the new version' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeEnabled();
});

test('an available update shows a small banner that can be dismissed and stays dismissed', async ({ page }) => {
  await open(page, available);
  const banner = page.getByRole('region', { name: 'Update available' });
  await expect(banner.getByText('Version 0.2.0 is available.')).toBeVisible();
  await page.screenshot({ path: 'test-results/update-banner.png' });
  // The app stays usable.
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toBeEnabled();
  await banner.getByRole('button', { name: 'Download' }).click();
  expect(await page.evaluate(() => (window as unknown as { downloads: number }).downloads)).toBe(1);
  await banner.getByRole('button', { name: 'Dismiss update notice' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Update available' })).toHaveCount(0);
});

test('no banner and no screen when the app is up to date', async ({ page }) => {
  await open(page, ok);
  await expect(page.getByRole('button', { name: 'Labs', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Update available' })).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
