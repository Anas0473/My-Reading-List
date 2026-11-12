import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../src/pages/api/edition-languages.json.ts';

function lookup(editionKeys: unknown) {
  return POST({
    request: new Request('http://localhost/api/edition-languages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionKeys }),
    }),
  } as Parameters<typeof POST>[0]);
}

test('language lookup normalizes and deduplicates IDs while ignoring invalid entries', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return Response.json({ languages: [{ key: '/languages/eng' }] });
  };
  try {
    const response = await lookup(['/books/ol991001m', 'OL991001M', null, 123, {}, '', 'invalid']);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      languages: { OL991001M: 'eng' },
      resolved: ['OL991001M'],
    });
    assert.deepEqual(requests, ['https://openlibrary.org/books/OL991001M.json']);
    const cached = await lookup(['OL991001M']);
    assert.equal(cached.status, 200);
    assert.equal(requests.length, 1);
    for (const input of [[], null, 'OL991001M']) {
      const empty = await lookup(input);
      assert.deepEqual(await empty.json(), { languages: {}, resolved: [] });
    }
    assert.equal(requests.length, 1);
    const oversized = await lookup(Array.from({ length: 41 }, (_, index) => `OL${991100 + index}M`));
    assert.equal(oversized.status, 413);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
