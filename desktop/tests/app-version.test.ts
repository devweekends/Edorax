import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseVersion, updateStatus } from '../src/domain/app-version';

test('parseVersion reads releases, prereleases and build info', () => {
  assert.deepEqual(parseVersion('0.1.0'), { major: 0, minor: 1, patch: 0, prerelease: [] });
  assert.deepEqual(parseVersion('1.2.3-beta.4'), { major: 1, minor: 2, patch: 3, prerelease: ['beta', 4] });
  assert.deepEqual(parseVersion(' v2.0.0 '), { major: 2, minor: 0, patch: 0, prerelease: [] });
  assert.deepEqual(parseVersion('1.0.0+build.7'), { major: 1, minor: 0, patch: 0, prerelease: [] });
});

test('parseVersion returns null for anything that is not a version', () => {
  for (const bad of ['', '1', '1.2', '1.2.3.4', 'a.b.c', '1.2.x', '01.2.3', '1.2.3-', '1.2.3-01', '1.2.3-a..b', 'latest', '99999999999999999999.0.0', null, undefined, 12, {}, ['1.0.0']])
    assert.equal(parseVersion(bad), null, String(bad));
});

test('compareVersions compares numbers, not text', () => {
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0+a', '1.0.0+b'), 0);
});

test('a prerelease is lower than its release and prereleases follow semver order', () => {
  assert.equal(compareVersions('0.2.0-beta.1', '0.2.0'), -1);
  assert.equal(compareVersions('0.2.0', '0.2.0-beta.1'), 1);
  assert.equal(compareVersions('0.2.0-beta.1', '0.1.9'), 1);
  assert.equal(compareVersions('0.2.0-beta.2', '0.2.0-beta.10'), -1);
  assert.equal(compareVersions('0.2.0-alpha', '0.2.0-beta'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-rc.1'), 0);
});

test('compareVersions returns null when either side is invalid', () => {
  assert.equal(compareVersions('nope', '1.0.0'), null);
  assert.equal(compareVersions('1.0.0', ''), null);
  assert.equal(compareVersions(undefined, '1.0.0'), null);
  assert.equal(compareVersions('1.0', '1.0.0'), null);
});

const policy = (minimumVersion: string, latestVersion: string) => ({ minimumVersion, latestVersion });

test('updateStatus: below the minimum is required', () => {
  assert.equal(updateStatus('0.1.0', policy('0.2.0', '0.3.0')), 'required');
  assert.equal(updateStatus('0.9.0', policy('0.10.0', '0.10.0')), 'required');
  assert.equal(updateStatus('1.0.0-beta.1', policy('1.0.0', '1.0.0')), 'required');
});

test('updateStatus: at or above the minimum but below the latest is available', () => {
  assert.equal(updateStatus('0.2.0', policy('0.2.0', '0.3.0')), 'available');
  assert.equal(updateStatus('0.2.5', policy('0.1.0', '0.3.0')), 'available');
  assert.equal(updateStatus('0.3.0-beta.1', policy('0.1.0', '0.3.0')), 'available');
});

test('updateStatus: equal or newer than the latest is ok', () => {
  assert.equal(updateStatus('0.3.0', policy('0.1.0', '0.3.0')), 'ok');
  assert.equal(updateStatus('0.4.0', policy('0.1.0', '0.3.0')), 'ok');
  assert.equal(updateStatus('0.1.0', policy('0.1.0', '0.1.0')), 'ok');
});

test('updateStatus never locks anyone out on bad data', () => {
  assert.equal(updateStatus('bad', policy('9.0.0', '9.0.0')), 'ok');
  assert.equal(updateStatus('', policy('9.0.0', '9.0.0')), 'ok');
  assert.equal(updateStatus('0.1.0', policy('garbage', '9.0.0')), 'available');
  assert.equal(updateStatus('0.1.0', policy('9.0.0', 'garbage')), 'required');
  assert.equal(updateStatus('0.1.0', policy('', '')), 'ok');
  assert.equal(updateStatus('0.1.0', null), 'ok');
  assert.equal(updateStatus('0.1.0', undefined), 'ok');
});
