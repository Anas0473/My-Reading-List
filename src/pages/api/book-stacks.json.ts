import type { APIRoute } from 'astro';
import { BOOK_STACKS } from '../../lib/book-stacks.ts';
import { readOpenLibrary } from '../../lib/openlibrary-read.ts';
import { READABLE_FILTER, READABLE_WORK_FIELDS } from '../../lib/readable-editions.ts';
import { mapDiscoveryBook } from '../../lib/discovery-book.ts';

const pageSize = 24;
const cacheMs = 5 * 60 * 1000;
interface StackPage {
  books: ReturnType<typeof mapDiscoveryBook>[];
  hasMore: boolean;
}
const cache = new Map<string, { expiresAt: number; data: StackPage }>();
const pending = new Map<string, Promise<StackPage>>();

async function loadStack(subject: string, page: number, readable: boolean) {
  const key = `${subject}:${page}:${readable}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const running = pending.get(key);
  if (running) return running;
  const request = (async () => {
    const params = new URLSearchParams({
      q: `subject:${subject}${readable ? ` AND ${READABLE_FILTER}` : ''}`,
      fields: READABLE_WORK_FIELDS,
      sort: 'editions',
      limit: String(pageSize),
      page: String(page),
    });
    const { response, data } = await readOpenLibrary(`https://openlibrary.org/search.json?${params}`, {
      timeoutMs: 10000,
      headers: { 'User-Agent': 'my-book-library/0.0.1' },
    }, (response) => response.json());
    if (!response.ok) throw new Error(`Open Library returned ${response.status}`);
    if (!data || !Array.isArray(data.docs) || !Number.isSafeInteger(data.numFound) || data.numFound < 0) {
      throw new Error('Open Library returned invalid stack results.');
    }
    const result = {
      books: data.docs.filter((work: any) => /^\/works\/OL\d+W$/.test(work?.key || '') && work?.title)
        .map(mapDiscoveryBook),
      hasMore: page * pageSize < data.numFound,
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { expiresAt: Date.now() + cacheMs, data: result });
    return result;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

export const GET: APIRoute = async ({ url }) => {
  const stack = BOOK_STACKS.find((item) => item.id === url.searchParams.get('stack'));
  const rawPage = url.searchParams.get('page') || '1';
  const page = Number(rawPage);
  if (!stack || !/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 100) {
    return Response.json({ error: 'Choose a valid stack and page (1-100).' }, {
      status: 400, headers: { 'Cache-Control': 'no-store' },
    });
  }
  try {
    const data = await loadStack(stack.subject, page, url.searchParams.get('readable') === '1');
    return Response.json({ stack: stack.id, page, ...data }, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, must-revalidate' },
    });
  } catch (error) {
    console.warn(`Open Library stack lookup failed (${stack.id}, page ${page}):`, error);
    return Response.json({ error: 'Could not load this stack from Open Library. Please try again.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
};
