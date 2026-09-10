/**
 * Fun score messages based on percentage.
 * Each tier has 5 messages — pick 3 random ones per call.
 */

const scoreMessages: Record<string, [string, string, string, string, string]> = {
  '0':  ['💀 Absolutely Cooked',      '🤡 No Signal',             '😭 Bro Forgot Everything', '🪦 Academic Funeral',     '💀 Brain.exe Failed'],
  '10': ['😭 The Questions Won',      '💀 That Hurt',             '🥲 Rough Day',             '🤡 Wild Guessing',        '🫠 It\'s Over Bro'],
  '20': ['🥲 Needs a Comeback',       '😭 We Need to Talk',       '🤡 Guessing Pro Max',      '💀 Barely Alive',         '🫡 Respect the Attempt'],
  '30': ['😅 Comeback Begins',        '🥲 Still Loading',         '🤡 Vibes Were Strong',     '🫠 Getting Cooked',       '🏃 Keep Running'],
  '40': ['😅 Almost There',           '🤔 Getting Warmer',        '🫡 Keep Grinding',         '🥲 One More Push',        '😬 Dangerously Close'],
  '50': ['😂 Half Knowledge, Half Vibes', '😐 50/50 Warrior',  '🗿 Mid Mode',              '🤷 Could Go Either Way',  '😏 We Take Those'],
  '60': ['😏 Okay, We\'re Cooking',   '😎 Looking Solid',         '🔥 Warming Up',            '🫡 Getting Serious',      '😏 Not Bad, Bro'],
  '70': ['😎 Now We\'re Cooking',     '🔥 Pretty Strong',         '🚀 On the Rise',           '🗿 Locked In',            '😏 Getting Dangerous'],
  '80': ['🔥 You\'re Cooking',        '🚀 PSC Mode ON',           '😎 Absolutely Solid',      '🗿 Certified Beast',      '🔥 Almost Unstoppable'],
  '90': ['🗿 Absolutely Cracked',     '🔥 Answer Key Fears You',  '👑 Almost GOAT',           '🚀 Final Boss Energy',    '🧠 Galaxy Brain'],
  '100': ['👑 Bro IS the Answer Key', '🗿 Certified Legend',      '🔥 Perfectly Cooked',      '🐐 GOAT Behavior',        '👑 Who Needs Luck?'],
};

function getTierKey(percentage: number): string {
  if (percentage >= 100) return '100';
  if (percentage >= 90) return '90';
  if (percentage >= 80) return '80';
  if (percentage >= 70) return '70';
  if (percentage >= 60) return '60';
  if (percentage >= 50) return '50';
  if (percentage >= 40) return '40';
  if (percentage >= 30) return '30';
  if (percentage >= 20) return '20';
  if (percentage >= 10) return '10';
  return '0';
}

/**
 * Pick 3 random unique messages from a tier.
 * Uses optional seed so the same percentage can get different messages
 * on different calls (for variety).
 */
export function getRandomScoreMessages(percentage: number, count: number = 3): string[] {
  const key = getTierKey(percentage);
  const pool = scoreMessages[key];
  if (!pool) return ['Keep going!'];

  // Fisher-Yates shuffle a copy and take first `count`
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Get a single random message for a percentage.
 */
export function getRandomScoreMessage(percentage: number): string {
  return getRandomScoreMessages(percentage, 1)[0];
}
