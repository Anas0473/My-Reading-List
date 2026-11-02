import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../src/pages/api/search-books.json.ts';

const search = (params: Record<string, string>) =>
  GET({ url: new URL(`http://localhost/api/search-books.json?${new URLSearchParams(params)}`) } as Parameters<typeof GET>[0]);

test('short multiword queries use a title phrase, with consistent totals and pagination', async () => {
  const originalFetch = globalThis.fetch;
  const searches: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/search.json') {
      searches.push(url);
      assert.equal(url.searchParams.get('q'), 'title:"30 for"');
      return Response.json({
        numFound: 134,
        docs: [{
          key: '/works/OL42540192W',
          title: "Qur'an 30 For 30",
          author_name: ['Omar Suleiman', 'Ismail Kamdar'],
          cover_i: 123,
        }],
      });
    }
    if (url.pathname.endsWith('/editions.json')) return Response.json({ entries: [] });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = await search({ q: '30 for', page: '2', limit: '18' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.totalResults, 134);
    assert.equal(data.totalPages, 8);
    assert.equal(data.books[0].title, "Qur'an 30 For 30");
    assert.equal(searches.length, 1, 'phrase matches must not be mixed with broad term matches');
    assert.equal(searches[0].searchParams.get('offset'), '18');
    assert.equal(searches[0].searchParams.get('limit'), '18');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a missing title phrase falls back to title/subtitle/author terms without losing filters', async () => {
  const originalFetch = globalThis.fetch;
  const searches: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/editions.json')) return Response.json({ entries: [] });
    assert.equal(url.pathname, '/search.json');
    searches.push(url);
    const query = url.searchParams.get('q') || '';
    assert.equal(url.searchParams.get('sort'), 'new');
    assert.ok(query.endsWith('AND NOT key:/works/OL999W AND NOT isbn:9781234567890'));
    if (query.startsWith('title:"Suleiman Quran"')) {
      return Response.json({ numFound: 0, docs: [] });
    }
    assert.ok(query.includes('title:"Suleiman"'));
    assert.ok(query.includes('subtitle:"Quran"'));
    assert.ok(query.includes('author:"Suleiman"'));
    assert.ok(query.includes('title:Quran*'), 'partial final terms remain supported by the fallback');
    return Response.json({
      numFound: 1,
      docs: [{
        key: '/works/OL42540192W',
        title: "Qur'an 30 For 30",
        author_name: ['Omar Suleiman'],
        cover_i: 123,
      }],
    });
  };
  try {
    const response = await search({
      q: 'Suleiman Quran', sort: 'year-desc',
      exclude_work_key: '/works/OL999W', exclude_isbn: '9781234567890',
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.books.length, 1);
    assert.equal(searches.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('phrase search keeps language discovery, language filtering and readable-only filtering', async () => {
  const originalFetch = globalThis.fetch;
  const searches: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/search.json');
    searches.push(url);
    assert.ok(url.searchParams.get('q')?.endsWith('AND ebook_access:[borrowable TO *]'));
    return Response.json({ numFound: 0, docs: [] });
  };
  try {
    const response = await search({
      q: 'language phrase', language: 'dan', readable: '1', discover_languages: '1',
    });
    assert.equal(response.status, 200);
    assert.equal(searches.length, 3);
    assert.equal(searches[0].searchParams.get('q'), 'title:"language phrase" AND ebook_access:[borrowable TO *]');
    assert.ok(searches[1].searchParams.get('q')?.includes('author:"language"'));
    assert.equal(searches[1].searchParams.get('language'), 'dan');
    assert.equal(searches[2].searchParams.get('language'), null);
    assert.equal(searches[2].searchParams.get('q'), searches[1].searchParams.get('q'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
