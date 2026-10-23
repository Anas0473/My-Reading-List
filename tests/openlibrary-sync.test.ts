import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preserveOpenLibraryEdits } from '../src/lib/openlibrary-sync.ts';
import type { CloudBook } from '../src/lib/cloud-library.ts';

const book: CloudBook = {
  title: 'Original', status: 'Read', workKey: '/works/OL1W',
  editionKey: '/books/OL1M', rating: 3,
};

test('unchanged books accept refreshed metadata and remote shelf moves', () => {
  const incoming = [{ ...book, title: 'Updated', status: 'Reading' }];
  assert.deepEqual(preserveOpenLibraryEdits([book], [book], incoming), incoming);
});

test('a rating edit survives without losing unrelated incoming books', () => {
  const rated = { ...book, rating: 5 };
  const added = { title: 'Other', status: 'Read', key: '/works/OL2W' };
  assert.deepEqual(preserveOpenLibraryEdits([book], [rated], [book, added]), [rated, added]);
});

test('a removal also excludes a different edition returned for the same work', () => {
  assert.deepEqual(preserveOpenLibraryEdits([book], [], [
    { ...book, editionKey: '/books/OL2M' },
  ]), []);
});

test('a local shelf move takes precedence over a different returned edition', () => {
  const moved = { ...book, status: 'Reading' };
  assert.deepEqual(preserveOpenLibraryEdits([book], [moved], [
    { ...book, editionKey: '/books/OL2M' },
  ]), [moved]);
});

test('an added extra edition stays alongside refreshed existing editions', () => {
  const added = { ...book, editionKey: '/books/OL2M', openLibraryLocalOnly: true };
  const updated = { ...book, title: 'Updated' };
  assert.deepEqual(preserveOpenLibraryEdits([book], [book, added], [updated]), [updated, added]);
});
