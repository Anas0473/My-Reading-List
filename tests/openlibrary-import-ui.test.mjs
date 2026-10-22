import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
test('import guidance is concise with optional details collapsed by default', () => {
  const dialog = page.slice(page.indexOf('<dialog id="open-library-import-dialog"'), page.indexOf('    <script>', page.indexOf('<dialog id="open-library-import-dialog"')));
  assert.match(dialog, /One-time copy, not ongoing sync/);
  assert.match(dialog, /aria-describedby="open-library-import-help"/);
  assert.match(dialog, /<details class="import-details">\s*<summary>How importing works<\/summary>/);
  assert.match(dialog, /Later changes or deletions on Open Library aren't copied here/);
  assert.doesNotMatch(dialog, /<details[^>]*\bopen\b|class="open-library-account-note"/);
});
const start = page.indexOf('      importForm.addEventListener("submit"');
const end = page.indexOf('      openLibraryBackButton.addEventListener', start);
assert.ok(start >= 0 && end > start);
const source = ts.transpile(page.slice(start, end), { target: ts.ScriptTarget.ES2022 });

function setup() {
  let submit;
  let complete;
  const context = vm.createContext({
    AbortSignal,
    importRunning: false,
    setImportRunning(running) {
      context.importRunning = running;
      context.importSubmit.disabled = running;
    },
    importForm: { addEventListener: (_, handler) => { submit = handler; } },
    websiteOwner: 'clerk:A', websiteUserId: 'A', websiteAccountGeneration: 1,
    importUsername: { value: 'reader' }, importSubmit: {}, importMessage: { dataset: {} },
    importDialog: { open: true, close() { this.open = false; } },
    localBooks: [{ title: 'Existing', status: 'Read' }],
    fetch: (url, options) => {
      context.request = { url, options };
      return new Promise((resolve) => { complete = resolve; });
    },
    mergeOpenLibraryImport: (existing, incoming) => ({ books: [...existing, ...incoming], added: incoming.length }),
    saved: false,
    saveLocalBooksWithoutPush: () => { context.saved = true; },
    refreshed: false,
    refreshLibraryView: () => { context.refreshed = true; },
  });
  vm.runInContext(source, context);
  return {
    context,
    start: () => submit({ preventDefault() {} }),
    finish: (data = { username: 'reader', books: [{ title: 'Imported', status: 'Read' }], incompleteShelves: [] }, ok = true) =>
      complete({ ok, json: async () => data }),
  };
}

test('one-time import makes only a credential-free public read and updates the website library', async () => {
  const { context, start, finish } = setup();
  const pending = start();
  assert.match(context.request.url, /public=1&username=reader/);
  assert.equal(context.request.options.credentials, 'omit');
  assert.equal(context.request.options.method, undefined);
  finish();
  await pending;
  assert.equal(context.saved, true);
  assert.equal(context.refreshed, true);
  assert.equal(context.localBooks.length, 2);
  assert.match(context.importMessage.textContent, /Imported 1 new book/);
  assert.equal(context.importSubmit.disabled, false);
  assert.equal(context.importDialog.open, false);
  assert.equal(context.importMessage.dataset.state, 'success');
});

test('switching website accounts while importing prevents applying the old response', async () => {
  const { context, start, finish } = setup();
  const pending = start();
  context.websiteOwner = 'clerk:B';
  context.websiteUserId = 'B';
  context.websiteAccountGeneration++;
  finish();
  await pending;
  assert.equal(context.saved, false);
  assert.equal(context.localBooks.length, 1);
  assert.match(context.importMessage.textContent, /account changed/);
  assert.equal(context.importDialog.open, true);
});

test('signed-out visitors cannot import into a website account', async () => {
  const { context, start } = setup();
  context.websiteUserId = null;
  await start();
  assert.equal(context.request, undefined);
  assert.equal(context.saved, false);
  assert.match(context.importMessage.textContent, /Sign in/);
  assert.equal(context.importMessage.dataset.state, 'error');
});

test('incomplete import explicitly reports partial results', async () => {
  const { context, start, finish } = setup();
  const pending = start();
  finish({ username: 'reader', books: [], incompleteShelves: [{ status: 'Read' }] });
  await pending;
  assert.match(context.importMessage.textContent, /Some shelves were incomplete/);
  assert.equal(context.importDialog.open, true);
  assert.equal(context.importMessage.dataset.state, 'warning');
});

test('failed imports show prominent errors, keep existing books and reset styling on retry', async () => {
  const { context, start, finish } = setup();
  const pending = start();
  finish({ error: 'Could not find a public reading log for "reader". No books were imported.' }, false);
  await pending;
  assert.equal(context.importMessage.dataset.state, 'error');
  assert.match(context.importMessage.textContent, /Could not find a public reading log/);
  assert.equal(context.importDialog.open, true);
  assert.equal(context.saved, false);
  assert.equal(context.localBooks.length, 1);
  const retry = start();
  assert.equal(context.importMessage.dataset.state, 'pending');
  finish();
  await retry;
  assert.equal(context.importMessage.dataset.state, 'success');
});

test('imports are locked while pending and duplicate submits do not start another request', async () => {
  const { context, start, finish } = setup();
  const pending = start();
  assert.equal(context.importRunning, true);
  assert.equal(context.importSubmit.disabled, true);
  const request = context.request;
  await start();
  assert.equal(context.request, request);
  finish();
  await pending;
  assert.equal(context.importRunning, false);
  assert.equal(context.importSubmit.disabled, false);
});

const controlsStart = page.indexOf('      const importDialog =');
const controlsEnd = page.indexOf('      importForm.addEventListener("submit"', controlsStart);
const controlsSource = ts.transpile(page.slice(controlsStart, controlsEnd), { target: ts.ScriptTarget.ES2022 });

function setupControls() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      disabled: false, dataset: {}, listeners: {}, attributes: {}, open: true,
      addEventListener(name, callback) { this.listeners[name] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      close() { this.open = false; },
      showModal() { this.open = true; },
      getBoundingClientRect: () => ({ left: 10, right: 100, top: 10, bottom: 100 }),
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element },
    openLibrarySyncButtonSignedIn: element('import-trigger'),
    accountDialog: element('account'),
    canAutoFocusTextFields: () => false,
  });
  vm.runInContext(controlsSource, context);
  return { context, element };
}

test('import lock disables all controls and blocks back, close, cancel, Escape and backdrop dismissal', () => {
  const { context, element } = setupControls();
  const dialog = element('open-library-import-dialog');
  context.setImportRunning(true);
  assert.equal(element('open-library-import-form').attributes['aria-busy'], 'true');
  for (const id of ['back', 'close', 'cancel']) {
    const button = element(`open-library-import-${id}`);
    assert.equal(button.disabled, true);
    button.listeners.click();
    assert.equal(dialog.open, true);
  }
  assert.equal(element('open-library-import-username').disabled, true);
  assert.equal(element('open-library-import-submit').disabled, true);
  for (const name of ['keydown', 'cancel']) {
    let prevented = false;
    dialog.listeners[name]({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  dialog.listeners.click({ target: dialog, clientX: 0, clientY: 0 });
  assert.equal(dialog.open, true);
  context.setImportRunning(false);
  assert.equal(element('open-library-import-form').attributes['aria-busy'], 'false');
  assert.equal(element('open-library-import-username').disabled, false);
  for (const id of ['back', 'close', 'cancel']) {
    dialog.open = true;
    const button = element(`open-library-import-${id}`);
    assert.equal(button.disabled, false);
    button.listeners.click();
    assert.equal(dialog.open, false);
  }
  dialog.open = true;
  dialog.listeners.click({ target: dialog, clientX: 0, clientY: 0 });
  assert.equal(dialog.open, false);
});
