import type { APIRoute } from 'astro';
import { genresFromSubjects } from '../../lib/genres.ts';

const maxBatchSize = 40;
const maxConcurrentRequests = 8;
const requestTimeoutMs = 2500;
const cache = new Map<string, { expiresAt: number; genres: string[] }>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const workKeys = Array.isArray(body.workKeys)
      ? [...new Set(body.workKeys
          .map((value: unknown) => String(value || '').match(/OL\d+W/i)?.[0].toUpperCase())
          .filter(Boolean))] as string[]
      : [];

    if (workKeys.length > maxBatchSize) {
      return jsonResponse({ genres: {} }, 413);
    }

    const genres: Record<string, string[]> = {};
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < workKeys.length) {
        const workId = workKeys[nextIndex++];
        const cached = cache.get(workId);
        if (cached && cached.expiresAt > Date.now()) {
          genres[workId] = cached.genres;
          continue;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const response = await fetch(`https://openlibrary.org/works/${workId}.json`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'my-book-library/0.0.1' },
          });
          if (response.ok) {
            const record = await response.json();
            const workGenres = genresFromSubjects(Array.isArray(record.subjects) ? record.subjects : []);
            cache.set(workId, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, genres: workGenres });
            genres[workId] = workGenres;
          }
        } catch {
          // Unresolved works are retried on a later visit.
        } finally {
          clearTimeout(timeout);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(maxConcurrentRequests, workKeys.length) }, worker),
    );
    return jsonResponse({ genres });
  } catch {
    return jsonResponse({ genres: {} }, 400);
  }
};
