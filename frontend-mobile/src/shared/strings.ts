export type Lang = 'en' | 'ne';

/** UI-chrome strings. Question content stays as authored (EN/NE mixed). */
const STRINGS: Record<string, { en: string; ne: string }> = {
  'nav.home': { en: 'Home', ne: 'गृह' },
  'nav.practice': { en: 'Practice', ne: 'अभ्यास' },
  'nav.mock': { en: 'Mock Exam', ne: 'मक परीक्षा' },
  'nav.questions': { en: 'Questions', ne: 'प्रश्नहरू' },
  'nav.bookmarks': { en: 'Bookmarks', ne: 'बुकमार्क' },
  'nav.wrong': { en: 'Wrong Questions', ne: 'गलत प्रश्नहरू' },
  'nav.results': { en: 'Results', ne: 'नतिजा' },
  'nav.progress': { en: 'Progress', ne: 'प्रगति' },
  'nav.contribute': { en: 'Contribute', ne: 'योगदान' },
  'nav.about': { en: 'About', ne: 'बारेमा' },
  'nav.settings': { en: 'Settings', ne: 'सेटिङ' },
  'nav.gis': { en: 'GIS Studio', ne: 'GIS स्टुडियो' },
  'nav.admin': { en: 'Admin', ne: 'एडमिन' },
  'nav.more': { en: 'More', ne: 'थप' },
  'group.study': { en: 'Study', ne: 'अध्ययन' },
  'group.review': { en: 'Review', ne: 'समीक्षा' },
  'group.system': { en: 'System', ne: 'प्रणाली' },
  'btn.startPractice': { en: 'Start Practice', ne: 'अभ्यास सुरु' },
  'btn.startQuiz': { en: 'Start Quiz', ne: 'क्विज सुरु' },
  'btn.startExam': { en: 'Start exam', ne: 'परीक्षा सुरु' },
  'language': { en: 'Language', ne: 'भाषा' },
  'language.hint': { en: 'English or Nepali interface', ne: 'अङ्ग्रेजी वा नेपाली इन्टरफेस' },
};

export function tr(lang: Lang, key: string): string {
  const e = STRINGS[key];
  if (!e) return key;
  return e[lang] || e.en;
}
