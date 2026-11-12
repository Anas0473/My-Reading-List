import type { APIRoute } from 'astro';
import { MAX_PAGE_SIZE } from '../../lib/responsive-page-size.ts';
import { mapDiscoveryBook as mapTrendingWork } from '../../lib/discovery-book.ts';
import { findReadableWorks } from '../../lib/readable-editions.ts';
export { mapTrendingWork };

export const TRENDING_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type TrendingPeriod = typeof TRENDING_PERIODS[number];

// Fetch extra books so hiding books already in the reader's lists can still fill the grid.
const UPSTREAM_LIMIT = MAX_PAGE_SIZE * 2;
const CACHE_MS = 30 * 60 * 1000;
const trendingCache = new Map<TrendingPeriod, { expiresAt: number; books: any[] }>();
const readableTrendingCache = new Map<TrendingPeriod, { expiresAt: number; books: any[] }>();
const pendingTrending = new Map<string, Promise<any[]>>();

async function sharedTrending(period: TrendingPeriod, readableOnly: boolean) {
  const key = `${period}:${readableOnly}`;
  const pending = pendingTrending.get(key);
  if (pending) return pending;
  const request = readableOnly ? fetchReadableTrending(period) : fetchTrending(period);
  pendingTrending.set(key, request);
  try {
    return await request;
  } finally {
    pendingTrending.delete(key);
  }
}

// Open Library mixes work-level data (original title, first publish year) with a cover from an
// arbitrary edition, so ask for its matched edition and take everything shown from that edition.
const TRENDING_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'author_key', 'cover_i', 'cover_edition_key',
  'edition_count', 'first_publish_year', 'language', 'editions', 'editions.key', 'editions.title',
  'editions.subtitle', 'editions.publish_date', 'editions.cover_i', 'editions.language',
  'editions.publisher', 'editions.isbn', 'ratings_average', 'ratings_count',
].join(',');

async function fetchTrending(period: TrendingPeriod) {
  const cached = trendingCache.get(period);
  if (cached && cached.expiresAt > Date.now()) return cached.books;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://openlibrary.org/trending/${period}.json?limit=${UPSTREAM_LIMIT}&fields=${TRENDING_FIELDS}`,
      { signal: controller.signal, headers: { 'User-Agent': 'my-book-library/0.0.1' } },
    );
    if (!response.ok) throw new Error(`Open Library responded with ${response.status}`);
    const data = await response.json();
    const books = (Array.isArray(data.works) ? data.works : [])
      .filter((work: any) => work?.key && work?.title)
      .map(mapTrendingWork);
    trendingCache.set(period, { expiresAt: Date.now() + CACHE_MS, books });
    return books;
  } finally {
    clearTimeout(timeout);
  }
}

// Trending lists one edition per book, which may not be readable, so Open Library is asked for a
// readable edition of each trending book: English first, then any language. Trending order is kept.
async function fetchReadableTrending(period: TrendingPeriod) {
  const cached = readableTrendingCache.get(period);
  if (cached && cached.expiresAt > Date.now()) return cached.books;

  const trending = await sharedTrending(period, false);
  const workKeys: string[] = trending
    .map((book: any) => book.workKey)
    .filter((key: string) => /^\/works\/OL\d+W$/.test(key));
  if (workKeys.length === 0) return [];
  const readableWorks = await findReadableWorks(workKeys, { languages: ['eng'] });
  const books = workKeys
    .filter((key) => readableWorks.has(key))
    .map((key) => mapTrendingWork(readableWorks.get(key)));
  readableTrendingCache.set(period, { expiresAt: Date.now() + CACHE_MS, books });
  return books;
}

export const GET: APIRoute = async ({ url }) => {
  const requested = url.searchParams.get('period') as TrendingPeriod;
  const period = TRENDING_PERIODS.includes(requested) ? requested : 'weekly';
  const readableOnly = url.searchParams.get('readable') === '1';
  const cache = readableOnly ? readableTrendingCache : trendingCache;
  try {
    const books = await sharedTrending(period, readableOnly);
    return new Response(JSON.stringify({ period, books }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=60, must-revalidate',
      },
    });
  } catch (error) {
    console.warn(`Open Library trending lookup failed (${period}, readable=${readableOnly}):`, error);
    const stale = cache.get(period)?.books;
    return new Response(JSON.stringify({ period, books: stale || [], error: !stale }), {
      status: stale ? 200 : 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
