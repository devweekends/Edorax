import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUpdateService, safeDownloadUrl, FOCUS_CHECK_GAP_MS, type UpdateServiceOptions } from '../src/update/update-service';
import { createPreviewClient } from '../src/api';
import { fetchCatalog } from '../src/api/catalog';
import { setDesktopVersion, setDesktopPlatform, DESKTOP_VERSION_HEADER, DESKTOP_PLATFORM_HEADER } from '../src/api/client-info';
import type { AppUpdateState } from '../src/domain/app-update';

const URL_OK = 'https://edorax.com/download';
const policyBody = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: { minimumVersion: '0.1.0', latestVersion: '0.1.0', downloadUrl: URL_OK, message: '', blockedVersions: [], ...over },
});
const json = (body: unknown, status = 200) => async () => Response.json(body, { status });
const offline = async (): Promise<Response> => {
  throw new TypeError('fetch failed');
};
const required = (over: Record<string, unknown> = {}) =>
  json({ success: false, code: 'DESKTOP_UPDATE_REQUIRED', message: 'Please update.', data: { minimumVersion: '0.5.0', downloadUrl: URL_OK, ...over } }, 426);

function setup(request: typeof fetch, options: Partial<UpdateServiceOptions> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edorax-update-'));
  const file = path.join(dir, 'nested', 'update-policy.json');
  const opened: string[] = [];
  const changes: AppUpdateState[] = [];
  const make = (req: typeof fetch = request) =>
    createUpdateService({
      currentVersion: '0.1.0',
      platform: 'linux',
      base: 'http://localhost:4000',
      request: req,
      file,
      openExternal: (url) => void opened.push(url),
      onChange: (state) => changes.push(state),
      ...options,
    });
  return { dir, file, opened, changes, make, service: make() };
}

test('below the minimum is required', async () => {
  const { service, dir } = setup(json(policyBody({ minimumVersion: '0.2.0', latestVersion: '0.3.0', message: 'Security fix.' })));
  const state = await service.check();
  assert.deepEqual(state, {
    status: 'required',
    currentVersion: '0.1.0',
    minimumVersion: '0.2.0',
    latestVersion: '0.3.0',
    downloadUrl: URL_OK,
    message: 'Security fix.',
    blocked: false,
  });
  fs.rmSync(dir, { recursive: true });
});

test('between the minimum and the latest is available', async () => {
  const { service } = setup(json(policyBody({ minimumVersion: '0.1.0', latestVersion: '0.2.0' })));
  assert.equal((await service.check()).status, 'available');
});

test('equal to the latest is ok', async () => {
  const { service } = setup(json(policyBody()));
  assert.equal((await service.check()).status, 'ok');
});

test('the request goes to the policy address with the platform query, both headers, a timeout and no redirects', async () => {
  setDesktopVersion('0.1.0');
  setDesktopPlatform('linux');
  let seen: { url: string; init?: RequestInit } | undefined;
  const { service } = setup(async (url, init) => {
    seen = { url: String(url), init };
    return Response.json(policyBody());
  });
  await service.check();
  assert.equal(seen?.url, 'http://localhost:4000/api/v1/desktop/version?platform=linux');
  assert.equal((seen!.init!.headers as Record<string, string>)[DESKTOP_VERSION_HEADER], '0.1.0');
  assert.equal((seen!.init!.headers as Record<string, string>)[DESKTOP_PLATFORM_HEADER], 'linux');
  assert.equal(seen?.init?.redirect, 'error');
  assert.ok(seen?.init?.signal);
});

test('offline with a stored policy keeps the app blocked, also after a restart', async () => {
  const { make, file, dir } = setup(offline);
  const first = make(json(policyBody({ minimumVersion: '0.2.0', latestVersion: '0.2.0' })));
  assert.equal((await first.check()).status, 'required');
  assert.ok(fs.existsSync(file));
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['update-policy.json']);

  const restarted = make(offline);
  assert.equal(restarted.state().status, 'required');
  assert.equal((await restarted.check()).status, 'required');
  // A server error or an odd answer changes nothing either.
  assert.equal((await make(json({ oops: true }, 500)).check()).status, 'required');
  assert.equal((await make(json({ success: true, data: { minimumVersion: 5 } })).check()).status, 'required');
  fs.rmSync(dir, { recursive: true });
});

test('offline with nothing stored is not blocked', async () => {
  const { service, dir } = setup(offline);
  const state = await service.check();
  assert.equal(state.status, 'ok');
  assert.equal(state.latestVersion, '');
  fs.rmSync(dir, { recursive: true });
});

test('a damaged stored file is ignored', async () => {
  const { make, file, dir } = setup(offline);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"policy": {"minimumVersion": "9.0.0"');
  assert.equal((await make().check()).status, 'ok');
  fs.rmSync(dir, { recursive: true });
});

test('a later good policy unlocks the app and is stored', async () => {
  const { make, dir } = setup(offline);
  await make(json(policyBody({ minimumVersion: '0.2.0', latestVersion: '0.2.0' }))).check();
  const fixed = make(json(policyBody({ minimumVersion: '0.1.0', latestVersion: '0.1.0' })));
  assert.equal(fixed.state().status, 'required');
  assert.equal((await fixed.check()).status, 'ok');
  assert.equal(make(offline).state().status, 'ok');
  fs.rmSync(dir, { recursive: true });
});

test('a 426 DESKTOP_UPDATE_REQUIRED from any request forces required at once', async () => {
  // The policy answer says everything is fine, but a backend request got 426.
  let answer = policyBody();
  const { service, changes, dir, make } = setup(async () => Response.json(answer));
  assert.equal((await service.check()).status, 'ok');
  // The server now wants 0.5.0; the full policy is read right after the 426.
  answer = policyBody({ minimumVersion: '0.5.0', latestVersion: '0.5.0' });
  service.noteUpdateRequired({ minimumVersion: '0.5.0', downloadUrl: URL_OK, message: 'Please update.', blockedVersions: [] });
  assert.equal(service.state().status, 'required', 'at once, before the policy is read again');
  assert.equal(service.state().minimumVersion, '0.5.0');
  assert.equal(changes.at(-1)?.status, 'required');
  // The forced state survives a restart while offline.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(make(offline).state().status, 'required');
  fs.rmSync(dir, { recursive: true });
});

test('a 426 answer to the policy request itself counts as required', async () => {
  const { service, dir } = setup(required());
  const state = await service.check();
  assert.equal(state.status, 'required');
  assert.equal(state.message, 'Please update.');
  assert.equal(state.downloadUrl, URL_OK);
  fs.rmSync(dir, { recursive: true });
});

test('a 426 with another code is not an update rule', async () => {
  const { service } = setup(json({ success: false, code: 'SOMETHING_ELSE', message: 'x', data: { minimumVersion: '9.0.0' } }, 426));
  assert.equal((await service.check()).status, 'ok');
});

test('the preview client sends both headers on every request and reports a 426', async () => {
  setDesktopVersion('0.1.0');
  setDesktopPlatform('darwin');
  const headers: Record<string, string>[] = [];
  const reported: unknown[] = [];
  let status = 200;
  const client = createPreviewClient(
    'http://localhost:4000',
    async (_url, init) => {
      headers.push(init?.headers as Record<string, string>);
      return status === 426
        ? Response.json({ success: false, code: 'DESKTOP_UPDATE_REQUIRED', message: 'Update now', data: { minimumVersion: '0.2.0', downloadUrl: URL_OK, blockedVersions: ['0.1.0', 'bad'] } }, { status })
        : Response.json({ success: true, data: { courses: [] } });
    },
    { onUpdateRequired: (info) => reported.push(info) },
  );
  await client.listCourses();
  await client.request('/api/v1/anything', 'GET');
  assert.equal(headers.length, 2);
  for (const sent of headers) {
    assert.equal(sent[DESKTOP_VERSION_HEADER], '0.1.0');
    assert.equal(sent[DESKTOP_PLATFORM_HEADER], 'darwin');
  }
  status = 426;
  const result = await client.request('/api/v1/anything', 'GET');
  assert.equal(result.ok === false && result.code, 'DESKTOP_UPDATE_REQUIRED');
  assert.deepEqual(reported, [{ minimumVersion: '0.2.0', downloadUrl: URL_OK, message: 'Update now', blockedVersions: ['0.1.0'] }]);
});

test('only an https download address from the policy is opened', async () => {
  const { service, opened, dir } = setup(json(policyBody({ minimumVersion: '0.2.0' })));
  assert.deepEqual(await service.openDownload(), { ok: false }, 'nothing known yet');
  await service.check();
  assert.deepEqual(await service.openDownload(), { ok: true });
  assert.deepEqual(opened, [URL_OK]);
  fs.rmSync(dir, { recursive: true });
});

test('an invalid or http download address is refused', async () => {
  for (const bad of ['http://edorax.com/download', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://x.com/a', 'not a url', '', 'https://user:pw@edorax.com/', 42, null]) {
    const { service, opened, dir } = setup(json(policyBody({ minimumVersion: '0.2.0', downloadUrl: bad })));
    const state = await service.check();
    assert.equal(state.status, 'required', `still enforces the version: ${String(bad)}`);
    assert.equal(state.downloadUrl, '', String(bad));
    assert.deepEqual(await service.openDownload(), { ok: false }, String(bad));
    assert.deepEqual(opened, []);
    fs.rmSync(dir, { recursive: true });
  }
  assert.equal(safeDownloadUrl('https://edorax.com/get?os=linux'), 'https://edorax.com/get?os=linux');
  assert.equal(safeDownloadUrl('HTTP://edorax.com'), '');
});

test('a stored http address cannot be opened either', async () => {
  const { make, file, dir } = setup(offline);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ forced: true, policy: { minimumVersion: '0.2.0', latestVersion: '0.2.0', downloadUrl: 'http://evil.test/a', message: '' } }));
  const service = make();
  assert.equal(service.state().status, 'required');
  assert.deepEqual(await service.openDownload(), { ok: false });
  fs.rmSync(dir, { recursive: true });
});

test('focus checks at most once per 10 minutes', async () => {
  let clock = 1_000_000;
  let calls = 0;
  const { service, dir } = setup(
    async () => {
      calls += 1;
      return Response.json(policyBody());
    },
    { now: () => clock },
  );
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  service.onFocus();
  await settle();
  assert.equal(calls, 1);
  clock += FOCUS_CHECK_GAP_MS - 1;
  service.onFocus();
  await settle();
  assert.equal(calls, 1, 'too soon');
  clock += 1;
  service.onFocus();
  await settle();
  assert.equal(calls, 2);
  // "Check again" ignores the gap.
  await service.check();
  assert.equal(calls, 3);
  fs.rmSync(dir, { recursive: true });
});

test('start checks at once and stop clears the timer', async () => {
  let calls = 0;
  const { service, dir } = setup(async () => {
    calls += 1;
    return Response.json(policyBody());
  });
  service.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  service.stop();
  assert.equal(calls, 1);
  fs.rmSync(dir, { recursive: true });
});

test('changes are announced once per change', async () => {
  const { service, changes, dir } = setup(json(policyBody({ minimumVersion: '0.2.0' })));
  await service.check();
  await service.check();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, 'required');
  fs.rmSync(dir, { recursive: true });
});

test('the platform in the policy request comes from the option, and an unsupported one sends no query', async () => {
  const urls: string[] = [];
  const spy = async (url: unknown) => {
    urls.push(String(url));
    return Response.json(policyBody());
  };
  for (const platform of ['darwin', 'win32', 'freebsd', 'aix', '']) {
    const { service, dir } = setup(spy, { platform });
    await service.check();
    fs.rmSync(dir, { recursive: true });
  }
  assert.deepEqual(urls, [
    'http://localhost:4000/api/v1/desktop/version?platform=darwin',
    'http://localhost:4000/api/v1/desktop/version?platform=win32',
    'http://localhost:4000/api/v1/desktop/version',
    'http://localhost:4000/api/v1/desktop/version',
    'http://localhost:4000/api/v1/desktop/version',
  ]);
});

test('every kind of backend request sends the version and platform headers', async () => {
  setDesktopVersion('0.1.0');
  setDesktopPlatform('win32');
  const seen: Record<string, string>[] = [];
  const spy = async (_url: unknown, init?: RequestInit) => {
    seen.push(init?.headers as Record<string, string>);
    return Response.json({ success: true, data: { courses: [], ...policyBody().data } });
  };
  // the preview client, the catalog fetch and the policy fetch
  await createPreviewClient('http://localhost:4000', spy as typeof fetch).request('/api/v1/anything', 'GET');
  await fetchCatalog('http://localhost:4000', spy as typeof fetch);
  const { service, dir } = setup(spy as typeof fetch, { platform: undefined });
  await service.check();
  fs.rmSync(dir, { recursive: true });
  assert.equal(seen.length, 3);
  for (const headers of seen) {
    assert.equal(headers[DESKTOP_VERSION_HEADER], '0.1.0');
    assert.equal(headers[DESKTOP_PLATFORM_HEADER], 'win32');
  }
});

test('an unsupported platform sends no platform header on any request, and the version header stays', async () => {
  setDesktopVersion('0.1.0');
  setDesktopPlatform('freebsd');
  const seen: Record<string, string>[] = [];
  let url = '';
  const spy = async (target: unknown, init?: RequestInit) => {
    url = String(target);
    seen.push(init?.headers as Record<string, string>);
    return Response.json({ success: true, data: { courses: [], ...policyBody().data } });
  };
  await createPreviewClient('http://localhost:4000', spy as typeof fetch).request('/api/v1/anything', 'GET');
  await fetchCatalog('http://localhost:4000', spy as typeof fetch);
  const { service, dir } = setup(spy as typeof fetch, { platform: undefined });
  await service.check();
  fs.rmSync(dir, { recursive: true });
  assert.equal(url, 'http://localhost:4000/api/v1/desktop/version');
  assert.equal(seen.length, 3);
  for (const headers of seen) {
    assert.equal(headers[DESKTOP_VERSION_HEADER], '0.1.0');
    assert.equal(DESKTOP_PLATFORM_HEADER in headers, false);
  }
  setDesktopPlatform('linux');
});

test('an exact blocked version is required, says it is blocked, and stays blocked when it is the latest', async () => {
  const { service, dir } = setup(json(policyBody({ minimumVersion: '0.1.0', latestVersion: '0.1.0', blockedVersions: ['0.1.0'] })));
  const state = await service.check();
  assert.equal(state.status, 'required');
  assert.equal(state.blocked, true);
  assert.equal(state.currentVersion, '0.1.0');
  fs.rmSync(dir, { recursive: true });
});

test('a build suffix does not hide a blocked version, and a different version is not blocked', async () => {
  const a = setup(json(policyBody({ blockedVersions: ['0.1.0+build.9'] })));
  assert.equal((await a.service.check()).status, 'required');
  const b = setup(json(policyBody({ minimumVersion: '0.1.0', latestVersion: '0.2.0', blockedVersions: ['0.1.1'] })));
  const state = await b.service.check();
  assert.equal(state.status, 'available');
  assert.equal(state.blocked, false);
  fs.rmSync(a.dir, { recursive: true });
  fs.rmSync(b.dir, { recursive: true });
});

test('below the minimum is not reported as blocked, even when also in the list', async () => {
  const { service, dir } = setup(json(policyBody({ minimumVersion: '0.2.0', latestVersion: '0.2.0', blockedVersions: ['0.1.0'] })));
  const state = await service.check();
  assert.equal(state.status, 'required');
  assert.equal(state.blocked, false);
  fs.rmSync(dir, { recursive: true });
});

test('invalid entries in blockedVersions are ignored and the rest of the policy is used', async () => {
  const { service, dir } = setup(json(policyBody({ minimumVersion: '0.1.0', latestVersion: '0.2.0', blockedVersions: ['junk', 7, null, '0.9.9'] })));
  const state = await service.check();
  assert.equal(state.status, 'available');
  assert.equal(state.latestVersion, '0.2.0');
  // A list that is not a list is treated as empty.
  const other = setup(json(policyBody({ blockedVersions: 'nope' })));
  assert.equal((await other.service.check()).status, 'ok');
  fs.rmSync(dir, { recursive: true });
  fs.rmSync(other.dir, { recursive: true });
});

test('a server with no blockedVersions (older server) still works', async () => {
  const body = policyBody();
  delete (body.data as Record<string, unknown>).blockedVersions;
  const { service, dir } = setup(json(body));
  const state = await service.check();
  assert.equal(state.status, 'ok');
  assert.equal(state.blocked, false);
  fs.rmSync(dir, { recursive: true });
});

test('the blocked list is saved, blocks offline after a restart, and an old file without it still loads', async () => {
  const { make, file, dir } = setup(offline);
  await make(json(policyBody({ blockedVersions: ['0.1.0', 'junk'] }))).check();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(saved.policy.blockedVersions, ['0.1.0']);
  assert.equal(saved.platform, 'linux');
  const restarted = make(offline);
  assert.equal(restarted.state().status, 'required');
  assert.equal(restarted.state().blocked, true);

  // A file written by the first version of this feature: no blockedVersions and no platform.
  fs.writeFileSync(file, JSON.stringify({ forced: false, policy: { minimumVersion: '0.2.0', latestVersion: '0.2.0', downloadUrl: URL_OK, message: 'Old file.' } }));
  const old = make(offline).state();
  assert.equal(old.status, 'required');
  assert.equal(old.message, 'Old file.');
  assert.equal(old.blocked, false);
  fs.rmSync(dir, { recursive: true });
});

test('a saved policy from another platform is ignored, one from this platform is used', async () => {
  const { make, file, dir } = setup(offline);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const policy = { minimumVersion: '0.9.0', latestVersion: '0.9.0', downloadUrl: URL_OK, message: '', blockedVersions: [] };
  fs.writeFileSync(file, JSON.stringify({ forced: true, platform: 'win32', policy }));
  const other = make(offline);
  assert.equal(other.state().status, 'ok');
  assert.equal(other.state().minimumVersion, '');
  assert.equal((await other.check()).status, 'ok', 'offline: still nothing known');
  fs.writeFileSync(file, JSON.stringify({ forced: false, platform: 'linux', policy }));
  assert.equal(make(offline).state().status, 'required');
  // A save from an unsupported platform is for no platform at all.
  fs.writeFileSync(file, JSON.stringify({ forced: false, platform: '', policy }));
  assert.equal(make(offline).state().status, 'ok');
  fs.rmSync(dir, { recursive: true });
});

test('a 426 with a blocked list reports the app as blocked, and keeps the list offline', async () => {
  const { service, make, dir } = setup(required({ minimumVersion: '0.1.0', blockedVersions: ['0.1.0', 'junk'] }));
  const state = await service.check();
  assert.equal(state.status, 'required');
  assert.equal(state.blocked, true);
  assert.equal(make(offline).state().blocked, true);
  fs.rmSync(dir, { recursive: true });
});

test('a 426 with no blocked list is simply out of date', async () => {
  const { service, dir } = setup(required());
  const state = await service.check();
  assert.equal(state.status, 'required');
  assert.equal(state.blocked, false);
  fs.rmSync(dir, { recursive: true });
});
