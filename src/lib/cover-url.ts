// Old Open Library covers are unpacked from archive.org zips on every request, which can take
// 10 seconds. Sending them through /api/cover lets Vercel keep a copy so they load quickly.
const coverIdPattern = /^https:\/\/covers\.openlibrary\.org\/b\/id\/(\d{1,12})-([SML])\.jpg$/;
const editionCoverPattern = /^https:\/\/covers\.openlibrary\.org\/b\/olid\/(OL\d{1,12}M)-([SML])\.jpg\?default=false$/i;

export function cachedCoverUrl<T extends string | null | undefined>(url: T): T | string {
  if (!url) return url;
  const byId = url.match(coverIdPattern);
  if (byId) return `/api/cover/${byId[1]}-${byId[2]}.jpg`;
  const byEdition = url.match(editionCoverPattern);
  if (byEdition) return `/api/cover/${byEdition[1].toUpperCase()}-${byEdition[2]}.jpg`;
  return url;
}

// Turns a /api/cover file name back into the Open Library address, or null if it isn't a cover.
export function openLibraryCoverUrl(file: string): string | null {
  const match = file.match(/^(\d{1,12}|OL\d{1,12}M)-([SML])\.jpg$/);
  if (!match) return null;
  return match[1].startsWith('OL')
    ? `https://covers.openlibrary.org/b/olid/${match[1]}-${match[2]}.jpg?default=false`
    : `https://covers.openlibrary.org/b/id/${match[1]}-${match[2]}.jpg`;
}
