import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeSearchText } from '../src/lib/search-text.ts';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const transpile = (source) => ts.transpile(source, { target: ts.ScriptTarget.ES2022 });

function filterHarness(count = 1282) {
  const cards = Array.from({ length: count }, (_, index) => ({
    dataset: {
      title: `Book ${count - index}`,
      subtitle: 'A subtitle',
      author: 'An Author',
      language: 'eng',
      editionKey: `/books/OL${index + 1}M`,
      year: String(1900 + index % 100),
      dateAdded: String(index + 1),
    },
    style: {},
  }));
  let normalizations = 0;
  let comparisons = 0;
  let optionBuilds = 0;
  let gridWrites = 0;
  const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const languageSelect = {
    value: '', disabled: false,
    set innerHTML(_value) { optionBuilds++; },
    appendChild() {},
  };
  const grid = {
    querySelectorAll: () => cards,
    appendChild(fragment) {
      gridWrites++;
      cards.splice(0, cards.length, ...fragment.cards);
    },
  };
  const context = vm.createContext({
    searchInput: { value: '' },
    sortSelect: { value: 'title-asc' },
    languageSelect,
    grid,
    noMatchMsg: { style: {} },
    resetFiltersButton: {},
    clearFilterButton: {},
    readableOnlyCheckbox: { checked: false },
    editionLanguageCache: {},
    normalizeEditionId: (key) => key,
    isKnownEditionLanguage: (language) => Boolean(language && language !== 'unknown'),
    normalizeSearchText(value) { normalizations++; return normalizeSearchText(value); },
    cachedReadability: () => true,
    intlLanguageNames: new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }),
    libraryTitleCollator: {
      compare(a, b) {
        comparisons++;
        return titleCollator.compare(a, b);
      },
    },
    document: {
      createElement: () => ({}),
      createDocumentFragment: () => ({ cards: [], appendChild(card) { this.cards.push(card); } }),
    },
  });
  const stateStart = page.indexOf('        let readabilityStatus:');
  const stateEnd = page.indexOf('        if (!searchInput', stateStart);
  const updateStart = page.indexOf('        function updatePanel()', stateEnd);
  const updateEnd = page.indexOf('        async function loadMissingEditionLanguages()', updateStart);
  assert.ok(stateStart > 0 && stateEnd > stateStart && updateStart > stateEnd && updateEnd > updateStart);
  vm.runInContext(transpile(page.slice(stateStart, stateEnd) + page.slice(updateStart, updateEnd)), context);
  return {
    cards, context,
    update: () => context.updatePanel(),
    counts: () => ({ normalizations, comparisons, optionBuilds, gridWrites }),
  };
}

test('filtering 1,282 books reuses text, language options and order across keystrokes', () => {
  const h = filterHarness();
  h.update();
  const first = h.counts();
  assert.equal(first.normalizations, 1 + 1282 * 3);
  assert.equal(first.optionBuilds, 1);
  assert.ok(first.comparisons > 0);
  assert.equal(first.gridWrites, 1);

  h.context.searchInput.value = 'book 12';
  h.update();
  const second = h.counts();
  assert.equal(second.normalizations, first.normalizations + 1, 'only the query is normalized again');
  assert.equal(second.comparisons, first.comparisons, 'typing does not sort again');
  assert.equal(second.optionBuilds, first.optionBuilds, 'typing does not rebuild language options');
  assert.equal(second.gridWrites, first.gridWrites);
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 94);
});

test('cached filtering updates after metadata, language and card-set changes', () => {
  const h = filterHarness(3);
  h.context.searchInput.value = 'changed';
  h.update();
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 0);
  h.cards[0].dataset.title = 'Changed title';
  h.cards[0].dataset.language = 'fre';
  h.update();
  assert.equal(h.cards[0].style.display, 'flex');
  assert.equal(h.counts().optionBuilds, 2);
  h.context.languageSelect.value = 'fre';
  h.update();
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 1);
  h.cards.push({ dataset: { title: 'Changed book', language: 'fre' }, style: {} });
  h.update();
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 2);
  assert.equal(h.counts().optionBuilds, 3);
});

test('cached sorting preserves numeric title, subtitle, date and year ordering', () => {
  const h = filterHarness(3);
  h.cards[0].dataset.title = 'Book 10';
  h.cards[1].dataset.title = 'Book 2';
  h.cards[2].dataset.title = 'Book 2';
  h.cards[1].dataset.subtitle = 'Z';
  h.cards[2].dataset.subtitle = 'A';
  const expected = [...h.cards];
  for (const [sort, order] of [
    ['title-asc', [2, 1, 0]],
    ['title-desc', [0, 1, 2]],
    ['date-added-asc', [0, 1, 2]],
    ['date-added-desc', [2, 1, 0]],
    ['year-asc', [0, 1, 2]],
    ['year-desc', [2, 1, 0]],
  ]) {
    h.context.sortSelect.value = sort;
    h.update();
    assert.deepEqual(h.cards, order.map((index) => expected[index]), sort);
  }
});

test('replacing cards invalidates sorting even when the count and sort selection are unchanged', () => {
  const h = filterHarness(3);
  h.update();
  const before = h.counts().comparisons;
  const replacement = { dataset: { ...h.cards[0].dataset, title: 'Book 99' }, style: {} };
  h.cards[0] = replacement;
  h.update();
  assert.equal(h.cards.at(-1), replacement);
  assert.ok(h.counts().comparisons > before);
});

test('language and readability filters still combine with text and reset on an empty library', () => {
  const h = filterHarness(3);
  h.cards[0].dataset.language = 'unknown';
  h.cards[0].dataset.editionKey = '';
  h.context.cachedReadability = () => false;
  h.context.languageSelect.value = 'unknown';
  h.context.readableOnlyCheckbox.checked = true;
  h.update();
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 0);
  h.context.readableOnlyCheckbox.checked = false;
  h.update();
  assert.equal(h.cards.filter((card) => card.style.display === 'flex').length, 1);
  h.cards.splice(0);
  h.update();
  assert.equal(h.context.languageSelect.disabled, true);
  assert.equal(h.context.languageSelect.value, '');
});

test('library rebuild scans content cards once and appends once per shelf', () => {
  const start = page.indexOf('      function appendLibraryCards()');
  const end = page.indexOf('      appendLibraryCards();', start);
  assert.ok(start > 0 && end > start);
  let scans = 0;
  let appends = 0;
  let rendered = 0;
  const context = vm.createContext({
    shelfDefinitions: ['Plan to Read', 'Reading', 'Read'].map((status) => ({ status, id: status })),
    localBooks: Array.from({ length: 1282 }, (_, index) => ({
      status: index < 1205 ? 'Plan to Read' : index < 1209 ? 'Reading' : 'Read',
    })),
    document: {
      createDocumentFragment: () => ({ cards: [] }),
      querySelectorAll() { scans++; return []; },
      getElementById: () => ({ querySelector: () => ({ appendChild() { appends++; } }) }),
    },
    renderLocalBook(book, fragment) {
      assert.ok(fragment, 'cards are rendered off-DOM');
      fragment.cards.push(book);
      rendered++;
    },
    removeMatchingContentBooks() { assert.fail('empty content cards should skip matching'); },
  });
  vm.runInContext(transpile(page.slice(start, end) + '\nappendLibraryCards();'), context);
  assert.equal(scans, 1);
  assert.equal(rendered, 1282);
  assert.equal(appends, 3);
});

test('a shared content-card snapshot removes and counts a duplicate only once', () => {
  const start = page.indexOf('      function removeMatchingContentBooks(');
  const end = page.indexOf('      function createShelfControl(', start);
  const counts = new Map([['plan-to-read', 2]]);
  const card = {
    dataset: { title: 'Book', status: 'Plan to Read' },
    isConnected: true,
    remove() { this.isConnected = false; },
  };
  const context = vm.createContext({
    shelfDefinitions: [{ id: 'plan-to-read', status: 'Plan to Read' }],
    serverShelfCounts: counts,
    isSameBook: (a, b) => a.title === b.title,
    cards: [card],
  });
  vm.runInContext(transpile(page.slice(start, end)
    + '\nremoveMatchingContentBooks({title: "Book"}, cards);'
    + '\nremoveMatchingContentBooks({title: "Book"}, cards);'), context);
  assert.equal(counts.get('plan-to-read'), 1);
});
