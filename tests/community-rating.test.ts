import assert from 'node:assert/strict';
import { test } from 'node:test';
import { communityRating, communityRatingLabel, communityRatingText } from '../src/lib/community-rating.ts';

test('community ratings are rounded and formatted', () => {
  const rating = communityRating({ ratings_average: 3.971724, ratings_count: 1450 });
  assert.deepEqual(rating, { average: 4, count: 1450 });
  assert.equal(communityRatingText(rating!), '★ 4.0 (1,450)');
  assert.equal(communityRatingLabel(rating!), 'Open Library average: 4.0 out of 5 from 1,450 ratings');
});

test('too few or missing ratings are not shown', () => {
  assert.equal(communityRating({ ratings_average: 5, ratings_count: 1 }), null);
  assert.equal(communityRating({ ratings_average: 0, ratings_count: 0 }), null);
  assert.equal(communityRating({}), null);
  assert.equal(communityRating({ ratings_average: 9, ratings_count: 100 }), null);
});
