import type { APIRoute } from 'astro';
import { MAX_PAGE_SIZE } from '../../lib/responsive-page-size';
import { communityRating } from '../../lib/community-rating';
import { findReadableWorks } from '../../lib/readable-editions';

export const TRENDING_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type TrendingPeriod = typeof TRENDING_PERIODS[number];

// Fetch extra books so hiding books already in the reader's lists can still fill the grid.
const UPSTREAM_LIMIT = MAX_PAGE_SIZE * 2;
const CACHE_MS = 30 * 60 * 1000;
const trendingCache = new Map<TrendingPeriod, { expiresAt: number; books: any[] }>();
const readableTrendingCache = new Map<TrendingPeriod, { expiresAt: number; books: any[] }>();

// Open Library mixes work-level data (original title, first publish year) with a cover from an
// arbitrary edition, so ask for its matched edition and take everything shown from that edition.
const TRENDING_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'author_key', 'cover_i', 'cover_edition_key',
  'edition_count', 'first_publish_year', 'language', 'editions', 'editions.key', 'editions.title',
  'editions.subtitle', 'editions.publish_date', 'editions.cover_i', 'editions.language',
  'editions.publisher', 'editions.isbn', 'ratings_average', 'ratings_count',
].join(',');

const firstValue = (value: any) => (Array.isArray(value) ? value[0] : value) || '';

export function mapTrendingWork(work: any) {
  const edition = work.editions?.docs?.[0];
  const editionId = String(edition?.key || '').match(/OL\d+M/i)?.[0].toUpperCase() || '';
  const editionKey = editionId ? `/books/${editionId}` : '';
  const editionCover = edition?.cover_i
    ? `https://covers.openlibrary.org/b/id/${edition.cover_i}-M.jpg`
    : '';
  const authors = Array.isArray(work.author_name) ? work.author_name : [];
  const editionLanguages = Array.isArray(edition?.language) ? edition.language : [];
  return {
    key: work.key,
    workKey: work.key,
    editionKey,
    editionUrl: editionKey ? `https://openlibrary.org${editionKey}` : '',
    editionLanguage: editionLanguages[0] || '',
    editionHeroImage: editionCover
      || (editionId ? `https://covers.openlibrary.org/b/olid/${editionId}-M.jpg?default=false` : ''),
    title: edition?.title || work.title || 'Untitled',
    subtitle: edition?.subtitle || (edition ? '' : work.subtitle) || '',
    author: authors.length ? authors.join(', ') : 'Unknown Author',
    publisher: firstValue(edition?.publisher),
    authorKeys: Array.isArray(work.author_key) ? work.author_key : [],
    editionKeys: editionId ? [editionId] : [],
    editionCount: Number(work.edition_count) || 0,
    languages: editionLanguages.length ? editionLanguages : Array.isArray(work.language) ? work.language : [],
    pubDate: /\d{4}/.test(String(firstValue(edition?.publish_date)))
      ? String(firstValue(edition?.publish_date))
      : String(work.first_publish_year || ''),
    isbn: firstValue(edition?.isbn),
    // Without a matched edition the work cover is the only cover that belongs with the work title.
    heroImage: editionCover || (!edition && work.cover_i
      ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg`
      : ''),
    communityRating: communityRating(work),
  };
}

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

  const trending = await fetchTrending(period);
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
    const books = readableOnly ? await fetchReadableTrending(period) : await fetchTrending(period);
    return new Response(JSON.stringify({ period, books }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    const stale = cache.get(period)?.books;
    return new Response(JSON.stringify({ period, books: stale || [], error: !stale }), {
      status: stale ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
