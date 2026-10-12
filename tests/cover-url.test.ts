import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachedCoverUrl, openLibraryCoverUrl } from '../src/lib/cover-url.ts';

test('Open Library covers go through the cached cover route', () => {
  assert.equal(cachedCoverUrl('https://covers.openlibrary.org/b/id/9168732-M.jpg'), '/api/cover/9168732-M.jpg');
  assert.equal(cachedCoverUrl('https://covers.openlibrary.org/b/olid/ol1m-L.jpg?default=false'), '/api/cover/OL1M-L.jpg');
  assert.equal(cachedCoverUrl('https://archive.org/services/img/item'), 'https://archive.org/services/img/item');
  assert.equal(cachedCoverUrl(''), '');
  assert.equal(cachedCoverUrl(undefined), undefined);
});

test('the cover route only accepts real cover file names', () => {
  assert.equal(openLibraryCoverUrl('9168732-M.jpg'), 'https://covers.openlibrary.org/b/id/9168732-M.jpg');
  assert.equal(openLibraryCoverUrl('OL1M-L.jpg'), 'https://covers.openlibrary.org/b/olid/OL1M-L.jpg?default=false');
  for (const file of ['../etc-M.jpg', '123.jpg', '123-X.jpg', 'OL1W-M.jpg', '123-M.jpg?x=1', 'https://evil.example/1-M.jpg']) {
    assert.equal(openLibraryCoverUrl(file), null, file);
  }
});
