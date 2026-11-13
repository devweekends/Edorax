import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  desktopPaths,
  dockerReadiness,
  download,
  installerFor,
  installerUrlAllowed,
  setUpDocker,
  type DockerSetupProgress,
  type SetupDeps,
} from '../src/shell-labs/docker-setup';

test('the installer is the official one for each platform and CPU', () => {
  assert.equal(
    installerFor('win32', 'x64')?.url,
    'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
  );
  assert.equal(
    installerFor('win32', 'arm64')?.url,
    'https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe',
  );
  assert.equal(
    installerFor('darwin', 'arm64')?.url,
    'https://desktop.docker.com/mac/main/arm64/Docker.dmg',
  );
  assert.equal(
    installerFor('darwin', 'x64')?.url,
    'https://desktop.docker.com/mac/main/amd64/Docker.dmg',
  );
  assert.equal(installerFor('linux', 'x64'), null);
});

test('only https addresses on the Docker download host are allowed', () => {
  assert.equal(
    installerUrlAllowed('https://desktop.docker.com/mac/main/arm64/Docker.dmg'),
    true,
  );
  for (const bad of [
    'http://desktop.docker.com/x',
    'https://evil.example/Docker.dmg',
    'https://desktop.docker.com.evil.example/x',
    'file:///etc/passwd',
    'not a url',
  ])
    assert.equal(installerUrlAllowed(bad), false, bad);
});

test('Windows and macOS know where Docker Desktop installs', () => {
  assert.ok(
    desktopPaths('win32', { ProgramFiles: 'C:\\Program Files' }).some((p) =>
      p.endsWith('Docker Desktop.exe'),
    ),
  );
  assert.deepEqual(desktopPaths('darwin'), ['/Applications/Docker.app']);
  assert.deepEqual(desktopPaths('linux'), []);
});

test('readiness is ready when Docker answers, and not ready when it does not', async () => {
  assert.deepEqual(
    await dockerReadiness({ ping: async () => 'OK' } as never, 'darwin'),
    { state: 'ready' },
  );
  const result = await dockerReadiness(
    { ping: async () => Promise.reject(new Error('no docker')) } as never,
    'win32',
  );
  assert.ok(result.state === 'missing' || result.state === 'not-running');
});

test('download refuses an address that is not allowed, before any network call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  try {
    await assert.rejects(
      download('http://desktop.docker.com/x', path.join(dir, 'a'), () => {}),
      /not allowed/,
    );
    await assert.rejects(
      download('https://example.com/x', path.join(dir, 'b'), () => {}),
      /not allowed/,
    );
    assert.equal(fs.readdirSync(dir).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function deps(over: Partial<SetupDeps>): SetupDeps {
  return {
    platform: 'win32',
    arch: 'x64',
    downloadsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'setup-')),
    openPath: async () => '',
    openExternal: async () => {},
    showInFolder: () => {},
    fetchFile: async (_url, target, onPercent) => {
      fs.writeFileSync(target, 'installer');
      onPercent(50);
      onPercent(100);
    },
    verify: async () => true,
    ...over,
  };
}

function collect() {
  const seen: DockerSetupProgress[] = [];
  return {
    seen,
    report: (progress: DockerSetupProgress) => void seen.push(progress),
  };
}

test('Windows: downloads, checks the signature, opens the installer', async () => {
  const { seen, report } = collect();
  let opened = '';
  const result = await setUpDocker(
    report,
    deps({ openPath: async (file) => ((opened = file), '') }),
  );
  assert.equal(result.phase, 'done');
  assert.match(opened, /Docker Desktop Installer\.exe$/);
  assert.deepEqual(
    [...new Set(seen.map((progress) => progress.phase))],
    ['download', 'verify', 'install', 'done'],
  );
});

test('Windows: an installer without a valid Docker signature is deleted and never opened', async () => {
  const d = deps({
    verify: async () => false,
    openPath: async () => assert.fail('must not open'),
  });
  const result = await setUpDocker(() => {}, d);
  assert.equal(result.phase, 'error');
  assert.match(result.message, /signature/);
  assert.equal(fs.readdirSync(d.downloadsDir).length, 0);
});

test('if the installer cannot be opened, the file is kept and its folder is shown', async () => {
  let shown = '';
  const result = await setUpDocker(
    () => {},
    deps({
      openPath: async () => 'blocked',
      showInFolder: (file) => (shown = file),
    }),
  );
  assert.equal(result.phase, 'done');
  assert.ok(result.savedTo && shown === result.savedTo);
  assert.match(result.message, /could not be opened/);
});

test('a failed download reports an error and opens nothing', async () => {
  const result = await setUpDocker(
    () => {},
    deps({
      fetchFile: async () => Promise.reject(new Error('offline')),
      openPath: async () => assert.fail('must not open'),
    }),
  );
  assert.equal(result.phase, 'error');
  assert.match(result.message, /offline/);
});

test('macOS opens the disk image with no signature step; Linux opens the guide', async () => {
  const { seen, report } = collect();
  const mac = await setUpDocker(
    report,
    deps({ platform: 'darwin', arch: 'arm64' }),
  );
  assert.equal(mac.phase, 'done');
  assert.equal(
    seen.some((progress) => progress.phase === 'verify'),
    false,
  );
  let guide = '';
  const linux = await setUpDocker(
    () => {},
    deps({
      platform: 'linux',
      openExternal: async (url) => void (guide = url),
    }),
  );
  assert.equal(linux.phase, 'done');
  assert.match(guide, /docs\.docker\.com/);
});
