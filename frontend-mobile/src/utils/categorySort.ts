/**
 * Sort categories: topic categories first (alphabetical),
 * then practice-question categories (alphabetical).
 *
 * Topic categories are identified by NOT containing "PracticeQns"
 * in their name.
 */
export function sortCategories(categories: string[]): string[] {
  const topics: string[] = [];
  const practice: string[] = [];

  for (const cat of categories) {
    if (cat.toLowerCase().includes('practiceqns') || cat.toLowerCase().includes('practice qns')) {
      practice.push(cat);
    } else {
      topics.push(cat);
    }
  }

  topics.sort((a, b) => a.localeCompare(b));
  practice.sort((a, b) => a.localeCompare(b));

  return [...topics, ...practice];
}
