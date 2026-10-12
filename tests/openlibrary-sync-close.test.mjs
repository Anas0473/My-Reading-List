import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const start = page.indexOf('      let openLibrarySyncCloseTimer =');
const end = page.indexOf('      updateOpenLibrarySyncLabel();', start);
assert.ok(start >= 0 && end > start);

function setup(message = 'Up to date.') {
  const timers = new Map();
  let nextTimer = 0;
  let submit;
  let finish;
  const context = vm.createContext({
    window: {
      clearTimeout: (id) => timers.delete(id),
      setTimeout: (callback, delay) => {
        assert.equal(delay, 1200);
        timers.set(++nextTimer, callback);
        return nextTimer;
      },
    },
    openLibrarySyncDialog: { open: true, close() { this.open = false; } },
    openLibrarySyncMessage: { textContent: 'Checking for updates...' },
    openLibrarySyncInProgress: {},
    openLibrarySyncForm: { addEventListener: (event, handler) => { assert.equal(event, 'submit'); submit = handler; } },
    getOpenLibraryPushUser: () => 'reader',
    cloudReauthenticationRequired: false,
    syncOpenLibrary: (username, options) => {
      assert.equal(username, 'reader');
      assert.equal(options.sendLocalOnlyBooks, true);
      return new Promise((resolve) => {
        finish = () => {
          context.openLibrarySyncInProgress = null;
          context.openLibrarySyncMessage.textContent = message;
          resolve();
        };
      });
    },
    logInToOpenLibrary: () => { throw new Error('Unexpected login'); },
  });
  vm.runInContext(page.slice(start, end), context);
  return {
    context, timers,
    submit: () => submit({ preventDefault() {} }),
    finish: () => finish(),
    runTimers: () => { for (const callback of timers.values()) callback(); timers.clear(); },
  };
}

test('Sync now waits for success, then closes after showing the result briefly', async () => {
  const state = setup();
  const pending = state.submit();
  assert.equal(state.timers.size, 0);
  assert.equal(state.context.openLibrarySyncDialog.open, true);
  state.finish();
  await pending;
  assert.equal(state.timers.size, 1);
  assert.equal(state.context.openLibrarySyncDialog.open, true);
  state.runTimers();
  assert.equal(state.context.openLibrarySyncDialog.open, false);
});

test('errors and incomplete-sync warnings remain visible', async () => {
  for (const message of ['Could not sync Open Library.', 'Older synced books were kept.']) {
    const state = setup(message);
    const pending = state.submit();
    state.finish();
    await pending;
    assert.equal(state.timers.size, 0);
    assert.equal(state.context.openLibrarySyncDialog.open, true);
  }
});

test('a new sync or changed message prevents a pending auto-close', async () => {
  for (const change of [
    (context) => { context.openLibrarySyncInProgress = {}; },
    (context) => { context.openLibrarySyncMessage.textContent = 'Checking for updates...'; },
  ]) {
    const state = setup();
    const pending = state.submit();
    state.finish();
    await pending;
    change(state.context);
    state.runTimers();
    assert.equal(state.context.openLibrarySyncDialog.open, true);
  }
});
