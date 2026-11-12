import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/pages/api/trending-books.json.ts';

const lookup = (period: string, readable = false) => GET({
  url: new URL(`http://localhost/api/trending-books.json?period=${period}&readable=${readable ? 1 : 0}`),
} as Parameters<typeof GET>[0]);

const work = {
  key: '/works/OL991W', title: 'Trending book',
  editions: { docs: [{ key: '/books/OL991M', title: 'Readable book', ebook_access: 'public' }] },
};

test('concurrent plain and readable requests share work while periods and variants remain separate', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json(url.pathname === '/search.json' ? { docs: [work] } : { works: [work] });
  };
  try {
    const responses = await Promise.all([
      lookup('daily'), lookup('daily'), lookup('daily', true), lookup('daily', true), lookup('monthly'),
    ]);
    assert.equal(requests.filter((path) => path === '/trending/daily.json').length, 1);
    assert.equal(requests.filter((path) => path === '/trending/monthly.json').length, 1);
    assert.equal(requests.filter((path) => path === '/search.json').length, 1);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=60, must-revalidate');
      const data = await response.json();
      assert.equal(data.books.length, 1);
      assert.equal(data.books[0].workKey, work.key);
    }
    await lookup('daily');
    await lookup('daily', true);
    assert.equal(requests.length, 3, 'completed responses still use the existing memory caches');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed shared requests are not cached and a later request can recover', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response('', { status: 503 });
  };
  try {
    const failures = await Promise.all([lookup('weekly'), lookup('weekly')]);
    assert.equal(calls, 1);
    for (const response of failures) {
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal((await response.json()).error, true);
    }
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ works: [work] });
    };
    const recovered = await lookup('weekly');
    assert.equal(recovered.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stale fallback responses are never CDN-cacheable and refresh failures do not stick', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  try {
    globalThis.fetch = async () => Response.json({ works: [work] });
    await lookup('daily');
    Date.now = () => originalNow() + 31 * 60 * 1000;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    const stale = await lookup('daily');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('Cache-Control'), 'no-store');
    assert.equal((await stale.json()).books[0].workKey, work.key);
    globalThis.fetch = async () => Response.json({ works: [{ ...work, title: 'Updated work' }] });
    const recovered = await lookup('daily');
    assert.equal(recovered.status, 200);
    assert.match(recovered.headers.get('Cache-Control') || '', /s-maxage=60/);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});

test('readable lookup failures clear the pending request so a retry can recover', async () => {
  const originalFetch = globalThis.fetch;
  let fail = true;
  let searches = 0;
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).pathname !== '/search.json') return Response.json({ works: [work] });
    searches++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (fail) return new Response('', { status: 503 });
    return Response.json({ docs: [work] });
  };
  try {
    const responses = await Promise.all([lookup('weekly', true), lookup('weekly', true)]);
    assert.equal(searches, 1);
    for (const response of responses) {
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
    fail = false;
    const response = await lookup('weekly', true);
    assert.equal(response.status, 200);
    assert.equal(searches, 2);
    assert.equal((await response.json()).books[0].editionKey, '/books/OL991M');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
