// Open Library subjects are free text, so map them onto a small fixed genre list.
export const GENRES = [
  'Fantasy',
  'Science fiction',
  'Mystery & thriller',
  'Romance',
  'Horror',
  'Historical fiction',
  "Children's",
  'Young adult',
  'Comics',
  'Poetry',
  'Classics',
  'Biography',
  'History',
  'Science',
  'Self-help',
  'Philosophy & religion',
] as const;

export type Genre = (typeof GENRES)[number];

export const MAX_GENRES_PER_BOOK = 3;

const genrePatterns: Array<[Genre, RegExp]> = [
  ['Fantasy', /\b(fantasy|fantasi|magic|wizards?|witch(es|craft)?|dragons?|elves|fairies|sorcer)/],
  ['Science fiction', /\b(science fiction|sci-fi|space opera|dystopia|cyberpunk|time travel|robots?|extraterrestrial|interplanetary|aliens?\b)/],
  ['Mystery & thriller', /\b(myster|detective|thriller|crime|suspense|murder|krimi|spenning|private investigators?)/],
  ['Romance', /\b(romance|love stories|romantic)/],
  ['Horror', /\b(horror|ghost stories|vampires?|zombies?|supernatural|gyser)/],
  ['Historical fiction', /\b(historical fiction|historical novels?|fiction, historical)/],
  ["Children's", /\b(juvenile|children'?s|picture books?|børnebøger|bornebog)/],
  ['Young adult', /\b(young adult|teen|adolescen)/],
  ['Comics', /\b(comics?|graphic novels?|manga|cartoons?|tegneserie)/],
  ['Poetry', /\b(poetry|poems|digte)/],
  ['Classics', /\b(classics?|classic literature)/],
  ['Biography', /\b(biograph|autobiograph|memoirs?)/],
  ['History', /^(history|world history)$|\bhistory\b(?!.*fiction)|\bhistorie\b/],
  ['Science', /\b(science|physics|chemistry|biology|mathematics|astronomy|evolution)\b(?!.*fiction)/],
  ['Self-help', /\b(self-help|self-actualization|success|personal development|motivation|happiness|habits)/],
  ['Philosophy & religion', /\b(philosophy|religion|theology|spiritual|bible|ethics)/],
];

export function genresFromSubjects(subjects: unknown[]): Genre[] {
  const hits = new Map<Genre, number>();
  for (const subject of subjects) {
    if (typeof subject !== 'string') continue;
    const text = subject.trim().toLowerCase();
    if (!text) continue;
    for (const [genre, pattern] of genrePatterns) {
      if (pattern.test(text)) hits.set(genre, (hits.get(genre) || 0) + 1);
    }
  }
  if (hits.has('Historical fiction')) hits.delete('History');
  // Drop passing mentions, like "Ghosts" on a fantasy book with dozens of tags.
  const topHits = Math.max(0, ...hits.values());
  return [...hits.entries()]
    .filter(([, count]) => count * 4 >= topHits)
    .sort((a, b) => b[1] - a[1] || GENRES.indexOf(a[0]) - GENRES.indexOf(b[0]))
    .slice(0, MAX_GENRES_PER_BOOK)
    .map(([genre]) => genre);
}

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value);
}
