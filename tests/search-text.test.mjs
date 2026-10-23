import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeSearchText } from '../src/lib/search-text.ts';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const queryStart = page.indexOf('          const queryTerms =');
const queryEnd = page.indexOf('          const sortVal =', queryStart);
assert.ok(queryStart >= 0 && queryEnd > queryStart);
const matchStart = page.indexOf('            const searchableFields =', queryEnd);
const matchEnd = page.indexOf('            const matchesLanguage =', matchStart);
assert.ok(matchStart > queryEnd && matchEnd > matchStart);
const script = ts.transpile(
  `${page.slice(queryStart, queryEnd)}\n${page.slice(matchStart, matchEnd)}\nresult = matchesText;`,
  { target: ts.ScriptTarget.ES2022 },
);

function matches(query, title, subtitle = '', author = '', matchesIsbn = false) {
  const context = vm.createContext({
    query, title, subtitle, author, matchesIsbn, normalizeSearchText, result: false,
  });
  vm.runInContext(script, context);
  return context.result;
}

test('pasted book-club titles match saved titles in either apostrophe style', () => {
  for (const [pasted, saved] of [
    ['The Composition of the Qur\u2019an', "The Composition of the Qur'an"],
    ['Structure and Qur\u2019anic Interpretation', "Structure and Qur'anic Interpretation"],
  ]) {
    assert.equal(matches(pasted, saved), true);
    assert.equal(matches(saved, pasted), true);
  }
});

test('apostrophe-free queries and common transliterations match', () => {
  for (const mark of ["'", '\u2018', '\u2019', '\u201b', '\u02bb', '\u02bc', '\u02be', '\u02bf', '\uff07']) {
    assert.equal(matches('Quran', `Qur${mark}an`), true);
    assert.equal(matches(`Qur${mark}an`, 'Quran'), true);
  }
});

test('subtitles and authors use the same normalization', () => {
  assert.equal(matches('Qur\u2019anic', 'Structure', "Qur'anic Interpretation"), true);
  assert.equal(matches('O\u2019Connor', 'A Book', '', "O'Connor"), true);
});

test('case, accents, partial matches, typo tolerance and ISBN matching still work', () => {
  assert.equal(matches('MICHEL', 'A Book', '', 'Michel Cuypers'), true);
  assert.equal(matches('cafe', 'Caf\u00e9'), true);
  assert.equal(matches('compo', 'The Composition'), true);
  assert.equal(matches('compositon', 'The Composition'), true);
  assert.equal(matches('9781234567890', 'A Book', '', '', true), true);
  assert.equal(matches('', 'A Book'), true);
  assert.equal(matches('unrelated', 'The Composition of the Quran'), false);
});
