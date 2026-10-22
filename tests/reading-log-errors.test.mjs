import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/api/openlibrary-reading-log.json.ts', import.meta.url), 'utf8');
const script = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });

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
