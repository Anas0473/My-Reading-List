// Below this many ratings an average says little, so it is not shown.
export const MIN_COMMUNITY_RATINGS = 5;

export type CommunityRating = { average: number; count: number };

/** Turns Open Library's ratings fields into a rating worth showing, or null. */
export function communityRating(doc: any): CommunityRating | null {
  const average = Number(doc?.ratings_average);
  const count = Math.floor(Number(doc?.ratings_count));
  if (!Number.isFinite(average) || !Number.isFinite(count)) return null;
  if (count < MIN_COMMUNITY_RATINGS || average < 1 || average > 5) return null;
  return { average: Math.round(average * 10) / 10, count };
}

export function communityRatingText(rating: CommunityRating) {
  return `★ ${rating.average.toFixed(1)} (${rating.count.toLocaleString('en')})`;
}

export function communityRatingLabel(rating: CommunityRating) {
  const people = rating.count === 1 ? 'rating' : 'ratings';
  return `Open Library average: ${rating.average.toFixed(1)} out of 5 from ${rating.count.toLocaleString('en')} ${people}`;
}
