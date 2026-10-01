export type Lang = 'en' | 'ne';

/** UI-chrome strings. Untouched by translation (always as authored):
 *  category names, question text/options, usernames/user IDs.
 *  Missing keys fall back to English — translate incrementally, safely. */

const NE_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/** Devanagari numerals when Nepali is active, Latin otherwise. */
export function num(lang: Lang, value: number | string): string {
  const s = typeof value === 'number' ? formatLatin(value) : String(value);
  if (lang !== 'ne') return s;
  return s.replace(/[0-9]/g, (d) => NE_DIGITS[Number(d)]);
}

function formatLatin(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(n);
}

const STRINGS: Record<string, { en: string; ne: string }> = {
  // nav + groups
  'nav.home': { en: 'Home', ne: 'गृह' },
  'nav.practice': { en: 'Practice', ne: 'अभ्यास' },
  'nav.mock': { en: 'Mock Exam', ne: 'मक परीक्षा' },
  'nav.questions': { en: 'Questions', ne: 'प्रश्नहरू' },
  'nav.bookmarks': { en: 'Bookmarks', ne: 'बुकमार्क' },
  'nav.notes': { en: 'My Notes', ne: 'मेरा नोटहरू' },
  'nav.wrong': { en: 'Wrong Questions', ne: 'गलत प्रश्नहरू' },
  'nav.results': { en: 'Results', ne: 'नतिजा' },
  'nav.progress': { en: 'Progress', ne: 'प्रगति' },
  'nav.contribute': { en: 'Past Papers', ne: 'पुराना प्रश्नपत्र' },
  'nav.gis': { en: 'GIS Studio', ne: 'GIS स्टुडियो' },
  'nav.admin': { en: 'Admin', ne: 'एडमिन' },
  'nav.about': { en: 'About', ne: 'बारेमा' },
  'nav.settings': { en: 'Settings', ne: 'सेटिङ' },
  'nav.more': { en: 'More', ne: 'थप' },
  'group.study': { en: 'Study', ne: 'अध्ययन' },
  'group.review': { en: 'Review', ne: 'समीक्षा' },
  'group.system': { en: 'System', ne: 'प्रणाली' },
  'greet.morning': { en: 'Good morning', ne: 'शुभ बिहान' },
  'greet.afternoon': { en: 'Good afternoon', ne: 'शुभ दिउँसो' },
  'greet.evening': { en: 'Good evening', ne: 'शुभ साँझ' },
  'greet.night': { en: 'Good evening', ne: 'शुभ रात्री' },
  'dash.continue': { en: 'continue your Forestry PSC preparation.', ne: 'आफ्नो फरेष्ट्री पिएससी तयारी जारी राख्नुहोस्।' },
  // buttons
  'btn.startPractice': { en: 'Start Practice', ne: 'अभ्यास सुरु' },
  'btn.startQuiz': { en: 'Start Quiz', ne: 'क्विज सुरु' },
  'btn.startExam': { en: 'Start exam', ne: 'परीक्षा सुरु' },
  'btn.next': { en: 'Next', ne: 'अर्को' },
  'btn.prev': { en: 'Previous', ne: 'अघिल्लो' },
  'btn.submit': { en: 'Submit', ne: 'बुझाउनुहोस्' },
  'btn.cancel': { en: 'Cancel', ne: 'रद्द गर्नुहोस्' },
  'btn.back': { en: 'Back', ne: 'फर्कनुहोस्' },
  'btn.save': { en: 'Save', ne: 'सेभ' },
  'btn.retry': { en: 'Retry', ne: 'पुनः प्रयास' },
  // login
  'login.title': { en: 'Forestry PSC', ne: 'फरेष्ट्री पिएससी' },
  'login.subtitle': { en: 'Prepare with confidence', ne: 'आत्मविश्वासका साथ तयारी' },
  'login.username': { en: 'Username', ne: 'प्रयोगकर्ता नाम' },
  'login.password': { en: 'Password', ne: 'पासवर्ड' },
  'login.signin': { en: 'Sign in', ne: 'साइन इन' },
  'login.signing': { en: 'Signing in…', ne: 'साइन इन हुँदै…' },
  'login.appearance': { en: 'Appearance', ne: 'देखावट' },
  'login.hint': { en: 'Sign in with your username, member ID, or Google.', ne: 'आफ्नो प्रयोगकर्ता नाम, सदस्य ID, वा Google मार्फत साइन इन गर्नुहोस्।' },
  // setup
  'setup.questions': { en: 'Questions', ne: 'प्रश्नहरू' },
  'setup.category': { en: 'Category', ne: 'श्रेणी' },
  'setup.allCategories': { en: 'All Categories', ne: 'सबै श्रेणीहरू' },
  // quiz chrome
  'quiz.exitTitle': { en: 'Exit this quiz?', ne: 'यो क्विज छोड्ने?' },
  'quiz.exitHint': { en: 'Enter to exit · Esc to cancel', ne: 'बाहिरिन Enter · रद्द गर्न Esc' },
  'quiz.exit': { en: 'Exit quiz', ne: 'क्विज छोड्नुहोस्' },
  'quiz.submitAnswer': { en: 'Answer to continue', ne: 'अगाडि बढ्न उत्तर दिनुहोस्' },
  'quiz.checkAnswer': { en: 'Check Answer', ne: 'उत्तर हेर्नुहोस्' },
  'quiz.correct': { en: 'Correct!', ne: 'सही!' },
  'quiz.incorrect': { en: 'Incorrect answer', ne: 'गलत उत्तर' },
  'quiz.correctIs': { en: 'Correct answer:', ne: 'सही उत्तर:' },
  'quiz.explanation': { en: 'Explanation', ne: 'व्याख्या' },
  'quiz.why': { en: 'Why: ', ne: 'किनभने: ' },
  'quiz.myNote': { en: 'My note', ne: 'मेरो टिपोट' },
  'quiz.saved': { en: '· saved ✓', ne: '· सेभ भयो ✓' },
  'quiz.notePh': { en: 'Why is this the answer? Write it in your own words…', ne: 'यो उत्तर किन हो? आफ्नै शब्दमा लेख्नुहोस्…' },
  'quiz.saveNote': { en: 'Save note', ne: 'टिपोट सेभ' },
  'quiz.clearNote': { en: 'Clear note', ne: 'टिपोट हटाउनुहोस्' },
  'quiz.saving': { en: 'Saving…', ne: 'सेभ हुँदै…' },
  // results
  'res.complete': { en: 'Practice Complete', ne: 'अभ्यास पूरा' },
  'res.correct': { en: 'Correct', ne: 'सही' },
  'res.wrong': { en: 'Wrong', ne: 'गलत' },
  'res.accuracy': { en: 'Accuracy', ne: 'शुद्धता' },
  'res.reviewWrong': { en: 'Review Wrong Questions', ne: 'गलत प्रश्न दोहोर्‍याउनुहोस्' },
  'res.practiceAgain': { en: 'Practice Again', ne: 'फेरि अभ्यास' },
  'res.pastAttempts': { en: 'Past Attempts', ne: 'विगत प्रयासहरू' },
  'res.backHome': { en: 'Back to Home', ne: 'गृह फर्कनुहोस्' },
  // library
  'lib.title': { en: 'Question Library', ne: 'प्रश्न पुस्तकालय' },
  'lib.searchPh': { en: 'Search questions...', ne: 'प्रश्न खोज्नुहोस्...' },
  'lib.solved': { en: 'Solved', ne: 'हलसहित' },
  'lib.practice': { en: 'Practice', ne: 'अभ्यास' },
  'lib.browse': { en: 'Browse Questions', ne: 'प्रश्न हेर्नुहोस्' },
  'lib.random': { en: 'Random Quiz', ne: 'अनियमित क्विज' },
  'lib.empty': { en: 'No questions found', ne: 'कुनै प्रश्न भेटिएन' },
  'lib.clearFilters': { en: 'Clear Filters', ne: 'फिल्टर हटाउनुहोस्' },
  // dashboard
  'dash.practiceTitle': { en: 'Start a Practice Session', ne: 'अभ्यास सत्र सुरु' },
  'dash.progress': { en: 'Your progress', ne: 'तपाईंको प्रगति' },
  'dash.attempted': { en: 'Attempted', ne: 'प्रयास' },
  'dash.review': { en: 'Review', ne: 'समीक्षा' },
  'dash.quickActions': { en: 'Quick Actions', ne: 'द्रुत कार्य' },
  'dash.categories': { en: 'Categories', ne: 'श्रेणीहरू' },
  'dash.recent': { en: 'Recent Activity', ne: 'हालको गतिविधि' },
  // mock
  'mock.custom': { en: 'Custom paper', ne: 'आफ्नै प्रश्नपत्र' },
  'mock.timeFixed': { en: 'Time · fixed', ne: 'समय · तोकिएको' },
  'mock.scoring': { en: 'Scoring', ne: 'अङ्कन' },
  'mock.noPenalty': { en: 'No penalty', ne: 'जरिवाना छैन' },
  // bookmarks
  'bm.removeAll': { en: 'Unbookmark all', ne: 'सबै हटाउनुहोस्' },
  'bm.confirmAll': { en: 'Tap again to remove all', ne: 'सबै हटाउन फेरि थिच्नुहोस्' },
  'bm.practiceAll': { en: 'Practice all', ne: 'सबै अभ्यास' },
  'bm.empty': { en: 'No bookmarks yet', ne: 'अहिलेसम्म बुकमार्क छैन' },
  // settings + misc
  'language': { en: 'Language', ne: 'भाषा' },
  'language.hint': { en: 'English or Nepali interface', ne: 'अङ्ग्रेजी वा नेपाली इन्टरफेस' },
  'common.loading': { en: 'Loading…', ne: 'लोड हुँदै…' },
  'common.questions': { en: 'questions', ne: 'प्रश्नहरू' },
  'common.question': { en: 'question', ne: 'प्रश्न' },
  'common.min': { en: 'min', ne: 'मिनेट' },
  'common.all': { en: 'All', ne: 'सबै' },
  'time.minute': { en: 'minute', ne: 'मिनेट' },
  'time.minutes': { en: 'minutes', ne: 'मिनेट' },
};

export function tr(lang: Lang, key: string): string {
  const e = STRINGS[key];
  if (!e) return key;
  return e[lang] || e.en;
}
