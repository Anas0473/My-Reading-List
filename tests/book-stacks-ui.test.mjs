import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/BookSearch.astro', import.meta.url), 'utf8');
const start = source.indexOf('  function renderStack()');
const end = source.indexOf("  document.addEventListener('click'", start);
assert.ok(start > 0 && end > start);
const script = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });

function harness() {
  const listeners = new Map();
  const element = () => ({
    hidden: true, textContent: '', dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren() {},
    addEventListener(name, callback) { listeners.set(this, { ...(listeners.get(this) || {}), [name]: callback }); },
  });
  const tiles = ['biography', 'fantasy'].map((stack) => ({
    ...element(), dataset: { stack },
    querySelector: () => ({ textContent: stack }),
  }));
  const pending = [];
  const renders = [];
  const context = vm.createContext({
    URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    stacksSection: element(), stackContent: element(), stackContainer: element(),
    stackTitle: element(), stackStatus: element(), stackRetry: element(), stackMore: element(),
    hideAddedToggle: element(), readableOnlyToggle: element(), searchInput: { ...element(), value: '' },
    stackTiles: tiles, currentQuery: '', currentHideAdded: false, currentReadableOnly: false,
    isInMyLists: (book) => book.workKey === '/works/OL1W',
    renderBookCards(_container, books) { renders.push(books); },
    fetch(url) { return new Promise((resolve) => pending.push({ url, resolve })); },
  });
  vm.runInContext(`let selectedStack = '', stackBooks = [], stackPage = 0, stackHasMore = false,
    stackLoading = false, stackReadable = false, stackRequestId = 0, stackController = null;`, context);
  vm.runInContext(script, context);
  const click = (element) => listeners.get(element).click();
  const settle = async (index, books, hasMore = false, ok = true) => {
    const params = new URL(pending[index].url, 'http://localhost').searchParams;
    pending[index].resolve({ ok, json: async () => ({
      stack: params.get('stack'), page: Number(params.get('page')),
      books, hasMore, error: ok ? undefined : 'Test failure',
    }) });
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { context, tiles, pending, renders, click, settle };
}
const book = (id) => ({ title: `Book ${id}`, workKey: `/works/OL${id}W` });

test('stacks fetch only after selection and ignore slow responses from a previous selection', async () => {
  const h = harness();
  assert.equal(h.pending.length, 0);
  h.click(h.tiles[0]);
  h.click(h.tiles[1]);
  await h.settle(1, [book(2)]);
  await h.settle(0, [book(1)]);
  assert.equal(h.renders.at(-1)[0].workKey, '/works/OL2W');
  assert.equal(h.context.stackTitle.textContent, 'fantasy');
  assert.equal(h.tiles[1].attributes['aria-pressed'], 'true');
});

test('show more deduplicates, hide-added filters, and failed pages can retry without losing books', async () => {
  const h = harness();
  h.click(h.tiles[0]);
  await h.settle(0, [book(1), book(2)], true);
  h.click(h.context.stackMore);
  await h.settle(1, [], false, false);
  assert.equal(h.context.stackRetry.hidden, false);
  assert.equal(h.renders.at(-1).length, 2);
  h.click(h.context.stackRetry);
  await h.settle(2, [book(2), book(3)]);
  assert.equal(h.renders.at(-1).length, 3);
  h.context.currentHideAdded = true;
  h.context.renderStack();
  assert.deepEqual(Array.from(h.renders.at(-1), (book) => book.workKey), ['/works/OL2W', '/works/OL3W']);
});

test('search hides stacks and discards requests; readable changes reload the selected stack', async () => {
  const h = harness();
  h.click(h.tiles[0]);
  h.context.searchInput.value = 'query';
  h.context.updateStacksVisibility();
  await h.settle(0, [book(1)]);
  assert.equal(h.renders.length, 0);
  assert.equal(h.context.stacksSection.hidden, true);
  h.context.searchInput.value = '';
  h.context.updateStacksVisibility();
  h.context.updateStacksVisibility();
  assert.equal(h.pending.length, 2, 'visibility updates do not duplicate an active request');
  await h.settle(1, [book(2)]);
  h.context.currentReadableOnly = true;
  h.context.updateStacksVisibility();
  assert.match(h.pending[2].url, /readable=1/);
  await h.settle(2, [book(3)]);
  assert.equal(h.renders.at(-1)[0].workKey, '/works/OL3W');
});
