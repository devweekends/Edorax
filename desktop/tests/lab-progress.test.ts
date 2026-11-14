import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { passedSteps, savePassedSteps, syncPassedSteps } from '../src/ui/shell-labs/progress';

// The progress helpers run in the page; give them a tiny localStorage and a fake app bridge.
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
};

let remote: Record<string, string[]> | null = null;
let sent: { slug: string; steps: string[] }[] = [];
g.window = {
  buildment: {
    shellLabs: {
      progress: async () => remote,
      saveProgress: async (slug: string, steps: string[]) => {
        sent.push({ slug, steps });
        return true;
      },
    },
  },
};

beforeEach(() => {
  store.clear();
  remote = {};
  sent = [];
});

describe('lab progress sync', () => {
  it('shows steps that exist only on the account', async () => {
    remote = { 'linux-102': ['a', 'b'], 'docker-first-container': ['x'] };
    assert.equal(await syncPassedSteps(), true);
    assert.deepEqual(passedSteps('linux-102'), ['a', 'b']);
    assert.deepEqual(passedSteps('docker-first-container'), ['x']);
    assert.deepEqual(sent, []);
  });

  it('sends steps that exist only on this computer to the account', async () => {
    store.set('edorax:shell-labs:v1', JSON.stringify({ 'linux-101': ['a', 'b'] }));
    assert.equal(await syncPassedSteps(), false);
    assert.deepEqual(sent, [{ slug: 'linux-101', steps: ['a', 'b'] }]);
  });

  it('keeps a step done on either side', async () => {
    store.set('edorax:shell-labs:v1', JSON.stringify({ 'linux-101': ['a'] }));
    remote = { 'linux-101': ['b'] };
    assert.equal(await syncPassedSteps(), true);
    assert.deepEqual(passedSteps('linux-101').sort(), ['a', 'b']);
    assert.deepEqual(sent[0].steps.sort(), ['a', 'b']);
  });

  it('changes nothing when signed out or offline', async () => {
    store.set('edorax:shell-labs:v1', JSON.stringify({ 'linux-101': ['a'] }));
    remote = null;
    assert.equal(await syncPassedSteps(), false);
    assert.deepEqual(passedSteps('linux-101'), ['a']);
    assert.deepEqual(sent, []);
  });

  it('saving a lab also saves it on the account, and a reset sends an empty list', () => {
    savePassedSteps('linux-101', ['a']);
    savePassedSteps('linux-101', []);
    assert.deepEqual(sent, [
      { slug: 'linux-101', steps: ['a'] },
      { slug: 'linux-101', steps: [] },
    ]);
    assert.deepEqual(passedSteps('linux-101'), []);
  });
});
