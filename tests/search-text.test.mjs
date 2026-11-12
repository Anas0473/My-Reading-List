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
const matchEnd = page.indexOf('            textMatches.set(', matchStart);
assert.ok(matchStart > queryEnd && matchEnd > matchStart);
const cacheStart = page.indexOf('        const searchFieldsCache =');
const cacheEnd = page.indexOf('        if (!searchInput', cacheStart);
const script = ts.transpile(
  `${page.slice(cacheStart, cacheEnd)}\n${page.slice(queryStart, queryEnd)}\n${page.slice(matchStart, matchEnd)}\nresult = matchesText;`,
  { target: ts.ScriptTarget.ES2022 },
);

function matches(query, title, subtitle = '', author = '', matchesIsbn = false) {
  const context = vm.createContext({
    query, card: { dataset: { title, subtitle, author } }, matchesIsbn, normalizeSearchText, result: false,
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

test('completed query words do not match inside unrelated words', () => {
  assert.equal(matches('the art of', 'The Art of Walt Disney'), true);
  assert.equal(matches('the art of', 'Winning the Heart of Your Husband'), false);
  assert.equal(matches('the art of', 'Digital Finance', 'Big Data, Start-ups, and the Future'), false);
});

test('multiword filters match a consecutive phrase within one field', () => {
  assert.equal(matches('the art of', 'Breath', 'The New Science of a Lost Art'), false);
  assert.equal(matches('the art of', 'The Subtle Art of Not Giving a F*ck'), false);
  assert.equal(matches('the art of', 'How to Read a Book', 'The Art of Getting a Liberal Education'), true);
  assert.equal(matches('the art of', 'The Art', 'Of Living'), false);
  assert.equal(matches('omar suleiman', 'A Book', '', 'Omar Suleiman'), true);
  assert.equal(matches('the art of lov', 'The Art of Loving'), true);
  assert.equal(matches('the compositon of', 'The Composition of the Quran'), true);
});

test('phrase matching handles punctuation and non-Latin words', () => {
  assert.equal(matches('art of war', 'The Art-of-War'), true);
  assert.equal(matches('f*ck', 'The Subtle Art of Not Giving a F*ck'), true);
  assert.equal(matches('\u0641\u0646 \u0627\u0644\u062d\u0631\u0628', '\u0641\u0646 \u0627\u0644\u062d\u0631\u0628'), true);
  assert.equal(matches('\u0641\u0646 \u0627\u0644\u062d\u0631\u0628', '\u0627\u0644\u062d\u0631\u0628 \u0641\u0646'), false);
});
