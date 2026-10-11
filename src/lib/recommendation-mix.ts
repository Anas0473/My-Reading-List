export type SubjectWorks = {
  weight: number;
  works: { key: string; overlap: number }[];
};

/**
 * Picks the most common subjects across the reader's books.
 * Each book adds its weight (favourites count more) to every subject it has.
 */
export function weightedSubjects(
  books: { subjects: string[]; weight: number }[],
  limit: number,
) {
  const counts = new Map<string, { subject: string; weight: number; order: number }>();
  let nextOrder = 0;
  for (const { subjects, weight } of books) {
    for (const subject of new Set(subjects.map((item) => item.trim()))) {
      const key = subject.toLowerCase();
      const current = counts.get(key);
      counts.set(key, {
        subject: current?.subject || subject,
        weight: (current?.weight || 0) + weight,
        order: current?.order ?? nextOrder++,
      });
    }
  }
  return Array.from(counts.values())
    .sort((first, second) => second.weight - first.weight || first.order - second.order)
    .slice(0, limit);
}

/**
 * Orders recommended works so each subject gets a share that matches how
 * common it is in the reader's lists. A work that fits several subjects
 * counts toward all of them.
 */
export function mixBySubject(subjects: SubjectWorks[], excluded: Set<string> = new Set()) {
  const queues = subjects.map((subject) => ({
    weight: Math.max(subject.weight, 0.0001),
    taken: 0,
    works: subject.works
      .map((work, index) => ({ ...work, index }))
      .sort((first, second) => second.overlap - first.overlap || first.index - second.index),
  }));
  const membership = new Map<string, number[]>();
  queues.forEach((queue, queueIndex) => {
    for (const work of queue.works) {
      membership.set(work.key, [...(membership.get(work.key) || []), queueIndex]);
    }
  });

  const ordered: string[] = [];
  const used = new Set(excluded);
  while (true) {
    queues.forEach((queue) => {
      while (queue.works.length && used.has(queue.works[0].key)) queue.works.shift();
    });
    const candidates = queues
      .map((queue, index) => ({ queue, index }))
      .filter(({ queue }) => queue.works.length);
    if (!candidates.length) break;
    const { queue } = candidates.sort((first, second) =>
      first.queue.taken / first.queue.weight - second.queue.taken / second.queue.weight
      || second.queue.weight - first.queue.weight
      || first.index - second.index,
    )[0];
    const work = queue.works.shift()!;
    used.add(work.key);
    ordered.push(work.key);
    for (const index of new Set(membership.get(work.key))) queues[index].taken++;
  }
  return ordered;
}
