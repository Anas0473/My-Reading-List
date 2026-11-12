import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOK_STACKS } from '../src/lib/book-stacks.ts';
import { GET } from '../src/pages/api/book-stacks.json.ts';
import { mapDiscoveryBook } from '../src/lib/discovery-book.ts';

const lookup = (params: string) => GET({
  url: new URL(`http://localhost/api/book-stacks.json?${params}`),
} as Parameters<typeof GET>[0]);

const work = {
  key: '/works/OL991W', title: 'Work title', cover_i: 10,
  author_name: ['Test Author'], author_key: ['OL1A'], edition_count: 5,
  editions: { docs: [{
    key: '/books/OL992M', title: 'Edition title', subtitle: 'Edition subtitle',
    cover_i: 20, language: ['eng'], publish_date: ['2020'], isbn: ['9781234567890'],
    publisher: ['Test Publisher'],
  }] },
};

test('all requested stacks are alphabetical and use fixed subjects', () => {
  assert.equal(BOOK_STACKS.length, 12);
  const labels = BOOK_STACKS.map((stack) => stack.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.equal(BOOK_STACKS.find((stack) => stack.id === 'featured')?.subject, 'fiction');
});

test('stack API rejects unknown subjects and invalid pages without fetching', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Must not fetch invalid requests'); };
  try {
    for (const params of ['stack=unknown', 'stack=horror&page=0', 'stack=horror&page=101',
      'stack=horror&page=1.5', 'stack=horror&page=NaN', 'page=1']) {
      const response = await lookup(params);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stack pages share in-flight work, preserve edition details and isolate page/readability caches', async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ docs: [work], numFound: 25 });
  };
  try {
    const responses = await Promise.all([
      lookup('stack=fantasy'), lookup('stack=fantasy'), lookup('stack=fantasy&page=2'),
      lookup('stack=fantasy&readable=1'), lookup('stack=history'),
    ]);
    assert.equal(requests.length, 4);
    assert.ok(requests.every((url) => url.pathname === '/search.json'
      && url.searchParams.get('sort') === 'editions'
      && url.searchParams.get('limit') === '24'));
    assert.ok(requests.some((url) => url.searchParams.get('q') === 'subject:fantasy AND ebook_access:[borrowable TO *]'));
    for (let index = 0; index < responses.length; index++) {
      const response = responses[index];
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Cache-Control') || '', /s-maxage=60/);
      const data = await response.json();
      assert.equal(data.hasMore, index !== 2);
      assert.deepEqual(data.books, [mapDiscoveryBook(work)]);
      assert.equal(data.books[0].editionKey, '/books/OL992M');
      assert.equal(data.books[0].heroImage, 'https://covers.openlibrary.org/b/id/20-M.jpg');
    }
    await lookup('stack=fantasy');
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed and malformed stack requests are uncached and recover on retry', async () => {
  const originalFetch = globalThis.fetch;
  let mode = 'http';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (mode === 'http') return new Response('', { status: 403 });
    if (mode === 'malformed') return Response.json({ docs: [] });
    return Response.json({ docs: [], numFound: 0 });
  };
  try {
    for (mode of ['http', 'malformed', 'recovered']) {
      const response = await lookup('stack=mystery');
      assert.equal(response.status, mode === 'recovered' ? 200 : 502);
      const data = await response.json();
      if (mode === 'recovered') {
        assert.deepEqual(data.books, []);
        assert.equal(data.hasMore, false);
      } else {
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.ok(data.error);
        assert.equal(data.books, undefined);
      }
    }
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
