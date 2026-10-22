import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeOpenLibraryImport } from '../src/lib/openlibrary-import.ts';

const source = readFileSync(new URL('../src/pages/api/openlibrary-reading-log.json.ts', import.meta.url), 'utf8');
const script = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });

test('numeric publication years without edition dates produce importable books', async () => {
  const exports = {};
  const context = vm.createContext({
    exports, URL, URLSearchParams, Response, console,
    setTimeout: (callback) => { callback(); },
    require(name) {
      if (name.endsWith('openlibrary-read')) return {
        OpenLibraryReadTimeoutError: class extends Error {},
        readOpenLibrary: async (url) => typeof url === 'string' ? {
          response: new Response(),
          data: { 'OLID:OL2M': { details: { key: '/books/OL2M', covers: [123] } } },
        } : ({
          response: new Response(),
          data: { reading_log_entries: url.pathname.endsWith('/want-to-read.json')
            && url.searchParams.get('page') === '1'
            ? [
              { work: { key: '/works/OL1W', title: 'Work-only book', first_publish_year: 2023 } },
              { work: { key: '/works/OL2W', title: 'Edition without date', first_publish_year: 1999 }, logged_edition: '/books/OL2M' },
            ] : [] },
        }),
      };
      if (name.endsWith('openlibrary-session')) return { getSession: () => null };
      if (name.endsWith('editions')) return {};
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  vm.runInContext(script, context);
  const response = await exports.GET({
    url: new URL('https://example.com/api/openlibrary-reading-log.json?public=1&username=reader'),
    cookies: {},
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.books.map((book) => book.pubDate), ['2023', '1999']);
  const imported = mergeOpenLibraryImport([], data.books);
  assert.equal(imported.added, 2);
  assert.equal(imported.books[0].pubDate, '2023');
});

for (const status of [401, 403, 404, 503]) {
  test(`reading-log ${status} returns clear failure without claiming books were imported`, async () => {
    const exports = {};
    const context = vm.createContext({
      exports, URL, Response,
      require(name) {
        if (name.endsWith('openlibrary-read')) return {
          OpenLibraryReadTimeoutError: class extends Error {},
          readOpenLibrary: async () => ({ response: new Response(null, { status }), data: null }),
        };
        if (name.endsWith('openlibrary-session')) return { getSession: () => null };
        if (name.endsWith('editions')) return {};
        throw new Error(`Unexpected module: ${name}`);
      },
    });
    vm.runInContext(script, context);
    const response = await exports.GET({
      url: new URL('https://example.com/api/openlibrary-reading-log.json?public=1&username=fake-reader'),
      cookies: {},
    });
    assert.equal(response.status, status === 503 ? 502 : status);
    const data = await response.json();
    assert.match(data.error, /No books were imported/);
    if (status === 503) assert.match(data.error, /try again later/);
    else {
      assert.match(data.error, /Could not find a public reading log for "fake-reader"/);
      assert.match(data.error, /make sure the reading log is public/);
    }
    assert.equal(data.books, undefined);
  });
}
