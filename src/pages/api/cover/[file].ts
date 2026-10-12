import type { APIRoute } from 'astro';
import { openLibraryCoverUrl } from '../../../lib/cover-url';

const maxCoverBytes = 5 * 1024 * 1024;

function cacheHeaders(seconds: number) {
  const value = `public, max-age=${seconds}${seconds >= 31536000 ? ', immutable' : ''}`;
  return { 'Cache-Control': value, 'CDN-Cache-Control': value };
}

export const GET: APIRoute = async ({ params }) => {
  const file = String(params.file || '');
  const source = openLibraryCoverUrl(file);
  if (!source) return new Response('Not found', { status: 404 });

  try {
    const response = await fetch(source, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const type = response.headers.get('content-type') || '';
    if (response.status === 404) {
      // Editions without a cover: remember the miss for a day so the page shows its fallback quickly.
      return new Response('No cover', { status: 404, headers: cacheHeaders(86400) });
    }
    if (!response.ok || !type.startsWith('image/')) {
      return new Response('Cover unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > maxCoverBytes) {
      return new Response('Cover too large', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    // A cover number always shows the same picture, so it's kept for a year.
    // An edition's cover can be replaced on Open Library, so those are kept for a week.
    return new Response(body, {
      headers: {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
        ...cacheHeaders(file.startsWith('OL') ? 604800 : 31536000),
      },
    });
  } catch {
    return new Response('Cover unavailable', { status: 504, headers: { 'Cache-Control': 'no-store' } });
  }
};
