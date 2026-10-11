import type { APIRoute } from 'astro';
import { findReadableEditionIds } from '../../lib/readable-editions.ts';

const maxBatchSize = 200;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Tells My Lists which saved editions can be read or borrowed on Open Library.
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const editionIds: string[] = Array.isArray(body.editionKeys)
      ? [...new Set<string>(body.editionKeys
          .map((value: unknown) => String(value || '').match(/OL\d+M/i)?.[0].toUpperCase() || '')
          .filter(Boolean))]
      : [];
    if (editionIds.length > maxBatchSize) return jsonResponse({ readable: [] }, 413);
    const readable = await findReadableEditionIds(editionIds);
    return jsonResponse({ readable: Array.from(readable), checked: editionIds });
  } catch {
    return jsonResponse({ error: 'Open Library is temporarily unavailable.' }, 502);
  }
};
