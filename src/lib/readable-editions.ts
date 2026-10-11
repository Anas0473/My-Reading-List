// Borrowable or public; printdisabled is only readable by print-disabled users.
export const READABLE_FILTER = 'ebook_access:[borrowable TO *]';
export const READABLE_ACCESS = ['borrowable', 'public'];

export const READABLE_WORK_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'author_key', 'cover_i', 'cover_edition_key',
  'edition_count', 'first_publish_year', 'language', 'editions', 'editions.key', 'editions.title',
  'editions.subtitle', 'editions.publish_date', 'editions.cover_i', 'editions.language',
  'editions.publisher', 'editions.isbn', 'editions.ebook_access', 'ratings_average', 'ratings_count',
].join(',');

const BATCH_SIZE = 100;

async function searchBatch(workKeys: string[], language?: string) {
  const params = new URLSearchParams({
    q: `key:(${workKeys.map((key) => `"${key}"`).join(' OR ')}) AND ${READABLE_FILTER}`,
    fields: READABLE_WORK_FIELDS,
    limit: String(workKeys.length),
  });
  // With a language set, Open Library returns a readable edition in that language.
  if (language) params.set('language', language);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'my-book-library/0.0.1' },
    });
    if (!response.ok) throw new Error(`Open Library responded with ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.docs) ? data.docs : [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Finds a readable edition for each work. Languages are tried in order; when anyLanguage is set,
 * works still missing one may use a readable edition in any language. Returns search docs whose
 * editions.docs[0] is the readable edition.
 */
export async function findReadableWorks(
  workKeys: string[],
  { languages = [], anyLanguage = true }: { languages?: string[]; anyLanguage?: boolean } = {},
) {
  const found = new Map<string, any>();
  const validKeys = Array.from(new Set(workKeys.filter((key) => /^\/works\/OL\d+W$/.test(key))));
  const passes: (string | undefined)[] = [...languages, ...(anyLanguage || !languages.length ? [undefined] : [])];
  for (const language of passes) {
    const remaining = validKeys.filter((key) => !found.has(key));
    for (let index = 0; index < remaining.length; index += BATCH_SIZE) {
      const docs = await searchBatch(remaining.slice(index, index + BATCH_SIZE), language);
      for (const work of docs) {
        const edition = work.editions?.docs?.[0];
        if (edition?.key && READABLE_ACCESS.includes(edition.ebook_access)) found.set(work.key, work);
      }
    }
  }
  return found;
}

async function searchEditionBatch(editionIds: string[]) {
  const params = new URLSearchParams({
    q: `edition_key:(${editionIds.join(' OR ')}) AND ${READABLE_FILTER}`,
    fields: 'key,editions,editions.key,editions.ebook_access',
    limit: String(editionIds.length),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'my-book-library/0.0.1' },
    });
    if (!response.ok) throw new Error(`Open Library responded with ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.docs) ? data.docs : [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns which of the given edition IDs (OL...M) can be read or borrowed on Open Library. */
export async function findReadableEditionIds(editionIds: string[]) {
  const readable = new Set<string>();
  let remaining = Array.from(new Set(editionIds.filter((id) => /^OL\d+M$/.test(id))));
  // Each work lists only one matching edition, so a second saved edition of the same work is
  // hidden behind the first. Unmatched IDs are retried after a batch with matches.
  for (let pass = 0; pass < 3 && remaining.length; pass++) {
    const retry: string[] = [];
    for (let index = 0; index < remaining.length; index += BATCH_SIZE) {
      const batch = remaining.slice(index, index + BATCH_SIZE);
      const docs = await searchEditionBatch(batch);
      const matched = new Set<string>();
      docs.forEach((work: any) => {
        const edition = work.editions?.docs?.[0];
        const id = String(edition?.key || '').split('/').pop() || '';
        if (batch.includes(id) && READABLE_ACCESS.includes(edition?.ebook_access)) matched.add(id);
      });
      matched.forEach((id) => readable.add(id));
      if (matched.size) retry.push(...batch.filter((id) => !matched.has(id)));
    }
    remaining = retry;
  }
  return readable;
}
