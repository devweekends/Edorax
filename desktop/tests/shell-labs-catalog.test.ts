import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureShellLabs, getShellLab, getShellLabs, refreshShellLabs, shellLabErrors, shellLabsVersion, type ShellLabsFetcher } from '../src/shell-labs/catalog';
import { loadShellLabs } from '../src/shell-labs/loader';
import type { ShellLab } from '../src/domain/shell-labs';
import type { Result } from '../src/domain/catalog';

// Real labs from the development folder (run "pnpm sync:labs" first) are the fixtures.
const LABS = loadShellLabs().labs;
assert.ok(LABS.length >= 3, 'run "pnpm sync:labs" if the labs folder is empty');
const [a, b, c] = LABS;

function folder() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
  return { dir, cache: path.join(dir, 'shell-labs.json'), done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** A fake server. `calls` records which paths were asked. */
function server(version: string, labs: unknown[]) {
  const calls: string[] = [];
  const fetcher: ShellLabsFetcher = async (p) => {
    calls.push(p);
    if (p === '/api/v1/shell-labs/version') return { ok: true, data: { version, count: labs.length } };
    if (p === '/api/v1/shell-labs') return { ok: true, data: { version, labs } };
    return { ok: false, code: 'NOT_FOUND', message: 'no' };
  };
  return { calls, fetcher };
}
const failing = (code: string): ShellLabsFetcher => async (): Promise<Result<unknown>> => ({ ok: false, code, message: 'x' });
const clean = (lab: ShellLab) => JSON.parse(JSON.stringify(lab)) as ShellLab;

test('with no cache and no folder the catalog is empty', () => {
  configureShellLabs({ cacheFile: null, devDir: null });
  assert.deepEqual(getShellLabs(), []);
  assert.equal(shellLabsVersion(), '');
});

test('with no cache the development folder is used, with no version', () => {
  const { dir, cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: process.env.EDORAX_LABS_DIR ?? path.resolve(__dirname, '..', 'labs', 'shell') });
    assert.equal(getShellLabs().length, LABS.length);
    assert.equal(shellLabsVersion(), '');
    assert.ok(dir);
  } finally {
    done();
  }
});

test('a download replaces the catalog and is written to the cache, which the next start reads first', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    const fake = server('v1', [clean(a), clean(b)]);
    const result = await refreshShellLabs(fake.fetcher);
    assert.deepEqual({ ok: result.ok, updated: result.updated, count: result.count, message: result.message }, { ok: true, updated: true, count: 2, message: '' });
    assert.deepEqual(result.changed.sort(), [a.slug, b.slug].sort());
    assert.deepEqual(getShellLabs().map((lab) => lab.slug), [a.slug, b.slug]);
    assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8')).version, 'v1');
    assert.deepEqual(fs.readdirSync(path.dirname(cache)), ['shell-labs.json'], 'no temporary file is left behind');

    // A new start: the cache wins over the development folder.
    configureShellLabs({ cacheFile: cache, devDir: path.resolve(__dirname, '..', 'labs', 'shell') });
    assert.equal(shellLabsVersion(), 'v1');
    assert.equal(getShellLabs().length, 2);
    assert.equal(getShellLab(a.slug)?.title, a.title);
  } finally {
    done();
  }
});

test('a corrupt or wrong cache is ignored', () => {
  const { cache, done } = folder();
  try {
    for (const content of ['{not json', '{"format":1,"version":"v1","labs":"no"}', '{"format":9,"version":"v1","labs":[]}', '{"format":1,"version":"v1","labs":[{"slug":"x"}]}', '']) {
      fs.writeFileSync(cache, content);
      configureShellLabs({ cacheFile: cache, devDir: null });
      assert.deepEqual(getShellLabs(), [], content);
      assert.equal(shellLabsVersion(), '');
    }
  } finally {
    done();
  }
});

test('the same version means the full list is not downloaded', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    await refreshShellLabs(server('v1', [clean(a)]).fetcher);
    const again = server('v1', [clean(a), clean(b)]);
    const result = await refreshShellLabs(again.fetcher);
    assert.deepEqual(again.calls, ['/api/v1/shell-labs/version']);
    assert.deepEqual({ ok: result.ok, updated: result.updated, count: result.count }, { ok: true, updated: false, count: 1 });
  } finally {
    done();
  }
});

test('a changed version replaces the catalog and names only the labs that changed', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    await refreshShellLabs(server('v1', [clean(a), clean(b)]).fetcher);
    const edited = { ...clean(b), title: 'A new title' };
    const result = await refreshShellLabs(server('v2', [clean(a), edited, clean(c)]).fetcher);
    assert.equal(result.updated, true);
    assert.deepEqual(result.changed.sort(), [b.slug, c.slug].sort());
    assert.equal(shellLabsVersion(), 'v2');
    assert.equal(getShellLab(b.slug)?.title, 'A new title');
    assert.equal(getShellLabs().length, 3);
    assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8')).version, 'v2');
  } finally {
    done();
  }
});

test('an invalid lab is skipped and named, and the others are kept', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    const bad = { ...clean(b), machine: { ...b.machine, image: 'ubuntu:latest' } };
    const junk = 'not a lab';
    const result = await refreshShellLabs(server('v1', [clean(a), bad, junk, clean(a)]).fetcher);
    assert.equal(result.ok, true);
    assert.deepEqual(getShellLabs().map((lab) => lab.slug), [a.slug]);
    const errors = shellLabErrors().join('\n');
    assert.match(errors, new RegExp(`${b.slug}.*not latest`));
    assert.match(errors, /it is not a lab/);
    assert.match(errors, /listed twice/);
    assert.match(result.message, /could not be loaded/);
  } finally {
    done();
  }
});

test('a quiz step from the server gets empty checks and solution', async () => {
  const quiz = LABS.find((lab) => lab.steps.some((step) => step.quiz))!;
  const wire = clean(quiz);
  for (const step of wire.steps) if (step.quiz) { delete (step as Partial<typeof step>).checks; delete (step as Partial<typeof step>).solution; }
  configureShellLabs({ cacheFile: null, devDir: null });
  await refreshShellLabs(server('v1', [wire]).fetcher);
  assert.equal(getShellLabs().length, 1);
  assert.deepEqual(getShellLabs()[0].steps.find((step) => step.quiz)!.checks, []);
});

test('a failing fetch keeps the loaded labs and gives a plain message', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    await refreshShellLabs(server('v1', [clean(a)]).fetcher);
    const offline = await refreshShellLabs(failing('CONNECTION_ERROR'));
    assert.deepEqual({ ok: offline.ok, updated: offline.updated, count: offline.count, message: offline.message }, { ok: false, updated: false, count: 1, message: 'You are offline. Showing the labs saved on this computer.' });
    const signedOut = await refreshShellLabs(failing('AUTH_REQUIRED'));
    assert.equal(signedOut.message, 'Sign in to download labs.');
    assert.equal((await refreshShellLabs(failing('REQUEST_FAILED'))).ok, false);
    const thrower = await refreshShellLabs(async () => { throw new Error('boom'); });
    assert.equal(thrower.ok, false);
    assert.equal(getShellLabs().length, 1);
    // The second request failing after the version changed keeps the labs too.
    const half: ShellLabsFetcher = async (p) => (p.endsWith('/version') ? { ok: true, data: { version: 'v9', count: 5 } } : { ok: false, code: 'CONNECTION_ERROR', message: 'x' });
    assert.equal((await refreshShellLabs(half)).updated, false);
    assert.equal(shellLabsVersion(), 'v1');
    // Nonsense answers are refused as well.
    const nonsense: ShellLabsFetcher = async () => ({ ok: true, data: 'hello' });
    assert.equal((await refreshShellLabs(nonsense)).ok, false);
  } finally {
    done();
  }
});

test('with nothing saved, the offline message tells the learner what to do', async () => {
  configureShellLabs({ cacheFile: null, devDir: null });
  const result = await refreshShellLabs(failing('CONNECTION_ERROR'));
  assert.match(result.message, /offline/i);
  assert.doesNotMatch(result.message, /Showing the labs saved/);
  assert.equal(result.count, 0);
});

test('an empty server answer does not wipe the cache', async () => {
  const { cache, done } = folder();
  try {
    configureShellLabs({ cacheFile: cache, devDir: null });
    await refreshShellLabs(server('v1', [clean(a), clean(b)]).fetcher);
    // No labs on the server: version is empty.
    const none = await refreshShellLabs(server('', []).fetcher);
    assert.deepEqual({ ok: none.ok, updated: none.updated, count: none.count }, { ok: true, updated: false, count: 2 });
    // A new version with no valid lab in it.
    const allBad = await refreshShellLabs(server('v2', [{ slug: 'x' }, 7]).fetcher);
    assert.deepEqual({ ok: allBad.ok, updated: allBad.updated, count: allBad.count }, { ok: false, updated: false, count: 2 });
    assert.equal(shellLabsVersion(), 'v1');
    const saved = JSON.parse(fs.readFileSync(cache, 'utf8'));
    assert.equal(saved.version, 'v1');
    assert.equal(saved.labs.length, 2);
    const empty = await refreshShellLabs(server('v3', []).fetcher);
    assert.equal(empty.updated, false);
    assert.equal(getShellLabs().length, 2);
  } finally {
    done();
  }
});

test('two refreshes at once share one download', async () => {
  configureShellLabs({ cacheFile: null, devDir: null });
  const fake = server('v1', [clean(a)]);
  const [one, two] = await Promise.all([refreshShellLabs(fake.fetcher), refreshShellLabs(fake.fetcher)]);
  assert.equal(one, two);
  assert.equal(fake.calls.length, 2);
});

test('unknown slugs return null', async () => {
  configureShellLabs({ cacheFile: null, devDir: null });
  await refreshShellLabs(server('v1', [clean(a)]).fetcher);
  assert.equal(getShellLab(a.slug)?.slug, a.slug);
  for (const slug of ['nope', '__proto__', 'constructor', '', 42, null, undefined, {}, [a.slug]]) assert.equal(getShellLab(slug), null);
});
