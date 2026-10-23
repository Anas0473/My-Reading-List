import {
  activeCloudBooks, applyCloudChanges, cloudSnapshot, diffCloudBooks, type CloudBook,
} from './cloud-library.ts';
import { diffShelves, shelfSnapshot, workIdOf } from './openlibrary-push.ts';

export function preserveOpenLibraryEdits(
  before: CloudBook[], current: CloudBook[], incoming: CloudBook[],
): CloudBook[] {
  const changes = diffCloudBooks(cloudSnapshot(before), cloudSnapshot(current));
  const editedWorks = new Set(diffShelves(shelfSnapshot(before), shelfSnapshot(current))
    .map((change) => change.workId));
  // A shelf edit wins even if Open Library returned a different edition of that work.
  const books = incoming.filter((book) => !editedWorks.has(workIdOf(book)));
  books.push(...current.filter((book) => editedWorks.has(workIdOf(book))));
  return activeCloudBooks(applyCloudChanges(cloudSnapshot(books), changes));
}
