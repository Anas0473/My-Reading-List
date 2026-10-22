import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const start = page.indexOf('      function setOpenLibrarySyncLocked(');
const end = page.indexOf('      let openLibrarySyncCloseTimer =', start);
assert.ok(start >= 0 && end > start);
const script = ts.transpile(page.slice(start, end), { target: ts.ScriptTarget.ES2022 });

test('sync lock blocks every dismissal route and never unlocks on a timer', () => {
  const buttons = new Map();
  const button = (id) => {
    if (!buttons.has(id)) buttons.set(id, {
      disabled: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; },
    });
    return buttons.get(id);
  };
  const dialog = {
    open: true, listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    close() { this.open = false; },
    getBoundingClientRect: () => ({ left: 10, right: 100, top: 10, bottom: 100 }),
  };
  const form = { setAttribute(name, value) { this[name] = value; } };
  const ctx = vm.createContext({
    openLibrarySyncLocked: false,
    openLibrarySyncCancel: button('cancel'),
    openLibraryLogoutButton: button('disconnect'),
    openLibrarySyncForm: form,
    openLibrarySyncDialog: dialog,
    document: { getElementById: button },
    window: { setTimeout() { assert.fail('Sync lock must not expire on a timer'); } },
  });
  vm.runInContext(script, ctx);
  ctx.setOpenLibrarySyncLocked(true);
  assert.equal(form['aria-busy'], 'true');
  for (const id of ['cancel', 'disconnect', 'open-library-sync-back', 'open-library-sync-close']) {
    assert.equal(button(id).disabled, true);
  }
  button('cancel').listeners.click();
  button('open-library-sync-close').listeners.click();
  dialog.listeners.click({ target: dialog, clientX: 0, clientY: 0 });
  assert.equal(dialog.open, true);
  for (const name of ['keydown', 'cancel']) {
    let prevented = false;
    dialog.listeners[name]({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  ctx.setOpenLibrarySyncLocked(false);
  assert.equal(form['aria-busy'], 'false');
  for (const control of buttons.values()) assert.equal(control.disabled, false);
  dialog.listeners.click({ target: dialog, clientX: 0, clientY: 0 });
  assert.equal(dialog.open, false);
});

const syncStart = page.indexOf('      function syncOpenLibrary(');
const syncEnd = page.indexOf('      // The last synced Open Library name', syncStart);
const syncScript = ts.transpile(page.slice(syncStart, syncEnd), { target: ts.ScriptTarget.ES2022 });

for (const quiet of [false, true]) {
  test(`${quiet ? 'background' : 'foreground'} sync opens only foreground dialog and locks until settled`, async () => {
    let finish;
    const locks = [];
    const dialog = { open: false, showModal() { this.open = true; } };
    const ctx = vm.createContext({
      openLibrarySyncInProgress: null, openLibrarySyncRunning: false,
      accountDialog: { close() {} },
      openLibrarySyncDialog: dialog,
      openLibrarySyncSubmit: {},
      showOpenLibraryCheckingMessage() {},
      updateAccountButton() {},
      setOpenLibrarySyncLocked: (locked) => locks.push(locked),
      runOpenLibrarySync: () => new Promise((resolve) => { finish = resolve; }),
    });
    vm.runInContext(syncScript, ctx);
    const pending = ctx.syncOpenLibrary('reader', { quiet });
    assert.equal(dialog.open, !quiet);
    assert.deepEqual(locks, [true]);
    finish();
    await pending;
    assert.deepEqual(locks, [true, false]);
    assert.equal(ctx.openLibrarySyncInProgress, null);
  });
}

test('startup sync is foreground for Open Library-only accounts without a no-open-dialog condition', () => {
  const startup = page.slice(page.indexOf('          const startupUser ='), page.indexOf('      keepTypingFocus();'));
  assert.match(startup, /quiet: accountDialog\.dataset\.openLibraryOnly !== "true"/);
  assert.doesNotMatch(startup, /querySelector|startupBoxOpened/);
});
