import assert from 'node:assert/strict';
import { test } from 'node:test';
import { genresFromSubjects, MAX_GENRES_PER_BOOK } from '../src/lib/genres.ts';

test('maps messy Open Library subjects onto fixed genres', () => {
  assert.deepEqual(
    genresFromSubjects(['Wizards', 'Magic', 'Schools', 'Juvenile fiction', 'Fantasy fiction']),
    ['Fantasy', "Children's"],
  );
  assert.deepEqual(genresFromSubjects(['Detective and mystery stories', 'Murder']), ['Mystery & thriller']);
  assert.deepEqual(genresFromSubjects(['Fiction, historical', 'History']), ['Historical fiction']);
});

test('ignores unknown subjects and caps genres per book', () => {
  assert.deepEqual(genresFromSubjects(['Fiction', 'Large type books', 42]), []);
  const many = genresFromSubjects(['fantasy', 'horror', 'romance', 'poetry', 'comics']);
  assert.equal(many.length, MAX_GENRES_PER_BOOK);
});

test('drops genres that are only mentioned in passing', () => {
  const subjects = ['Fantasy', 'Magic', 'Wizards', 'Witches', 'Dragons', 'Fantasy fiction', 'Magic in fiction', 'Wizards in fiction', 'Ghosts'];
  assert.deepEqual(genresFromSubjects(subjects), ['Fantasy']);
});
