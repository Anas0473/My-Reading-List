import { communityRating } from './community-rating.ts';

const firstValue = (value: any) => (Array.isArray(value) ? value[0] : value) || '';

export function mapDiscoveryBook(work: any) {
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
    // A work cover may describe a different edition, so only use it for work-level results.
    heroImage: editionCover || (!edition && work.cover_i
      ? `https://covers.openlibrary.org/b/id/${work.cover_i}-M.jpg`
      : ''),
    communityRating: communityRating(work),
  };
}
