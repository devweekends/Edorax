import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TheiaRuntime } from '../src/ide/runtime';

test('TheiaRuntime snippet import requires an active session', async () => {
  const runtime = new TheiaRuntime('/nonexistent', '/nonexistent');
  await assert.rejects(
    () => runtime.importSnippet('console.log("hi")', 'snippet.js'),
    { message: 'Open a local project first.' },
  );
});

test('TheiaRuntime fails cleanly if the ide application bundle is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'edorax-ide-missing-'));
  const runtime = new TheiaRuntime(dir, path.join(dir, '.config'));
  await assert.rejects(() => runtime.start(dir, 'http://127.0.0.1:3000'), {
    message:
      'Theia is not built yet. Run npm --prefix desktop run ide:setup, then reopen the workspace.',
  });
  await rm(dir, { recursive: true, force: true });
});

test('TheiaRuntime importSnippet validates snippet source and filename', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'edorax-ide-test-'));
  const runtime = new TheiaRuntime('/fake/dir', tempDir);
  // Inject mock session
  (runtime as any).session = { folder: tempDir, url: 'http://127.0.0.1:1234/' };

  // Null byte injection
  await assert.rejects(
    () => runtime.importSnippet('malicious\0code', 'test.js'),
    { message: 'Snippet must be text up to 64 KB.' },
  );

  // Exceeds 64 KB
  const oversized = 'x'.repeat(65 * 1024);
  await assert.rejects(() => runtime.importSnippet(oversized, 'big.js'), {
    message: 'Snippet must be text up to 64 KB.',
  });

  // Invalid filenames
  for (const badName of [
    '../escape.js',
    '/root.js',
    'no-ext',
    'bad*char.js',
    'too.many.dots.js.bak',
  ]) {
    await assert.rejects(() => runtime.importSnippet('code', badName), {
      message: 'Invalid snippet filename.',
    });
  }

  // Valid snippet import
  const valid = 'console.log("hello edorax");\n';
  const result = await runtime.importSnippet(valid, 'solution.js');
  assert(result.uri.startsWith('file://'));
  const savedPath = fileURLToPath(result.uri);
  assert(savedPath.startsWith(tempDir));
  assert(savedPath.includes('solution-'));
  assert(savedPath.endsWith('.js'));
  const writtenContent = await readFile(savedPath, 'utf8');
  assert.equal(writtenContent, valid);

  await runtime.stop();
  assert.equal(runtime.status(), null);
  assert.equal(runtime.authentication(), '');

  await rm(tempDir, { recursive: true, force: true });
});

import { CourseFolders } from '../src/ide/course-folders';
import { mkdir, realpath } from 'node:fs/promises';

test('course folders remain isolated across courses, replacement and application restart', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'edorax-course-folders-'));
  try {
    const a = path.join(root, 'a');
    const b = path.join(root, 'b');
    await Promise.all([mkdir(a), mkdir(b)]);
    const file = path.join(root, 'settings', 'courses.json');
    const folders = new CourseFolders(file);
    await Promise.all([folders.set('course-a', a), folders.set('course-b', b)]);
    const reopened = new CourseFolders(file);
    assert.equal(await reopened.get('course-a'), await realpath(a));
    assert.equal(await reopened.get('course-b'), await realpath(b));
    assert.equal(await reopened.get('new-course'), null);
    await reopened.set('course-a', b);
    assert.equal(await reopened.get('course-a'), await realpath(b));
    assert.equal(await reopened.get('course-b'), await realpath(b));
    await assert.rejects(() => reopened.get('../invalid'), /Invalid course/);
    await rm(b, { recursive: true });
    await assert.rejects(
      () => reopened.get('course-b'),
      /saved course folder is unavailable/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
