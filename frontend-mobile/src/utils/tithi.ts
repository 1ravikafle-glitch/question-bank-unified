/** Pico panchanga: tithi (lunar day) from Schlyter's low-precision
 *  sun/moon longitudes. ±arcminutes accuracy — plenty for 12° tithis.
 *  Evaluated at 06:00 NPT so the day carries its sunrise tithi. */

const RAD = Math.PI / 180;

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** Julian day number for a UTC millisecond timestamp. */
function jdFromMs(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

function sunLongitude(d: number): number {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = norm360(356.047 + 0.9856002585 * d);
  const E =
    M +
    (180 / Math.PI) * e * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
  const x = Math.cos(E * RAD) - e;
  const y = Math.sin(E * RAD) * Math.sqrt(1 - e * e);
  const v = (Math.atan2(y, x) / RAD + 360) % 360;
  return norm360(v + w);
}

function moonLongitude(d: number, sunM: number, sunLs: number): number {
  const N = norm360(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = norm360(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = norm360(115.3654 + 13.0649929509 * d);
  let E =
    M + (180 / Math.PI) * e * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
  for (let k = 0; k < 3; k++) {
    E =
      E -
      (E - (180 / Math.PI) * e * Math.sin(E * RAD) - M) /
        (1 - e * Math.cos(E * RAD));
  }
  const x = a * (Math.cos(E * RAD) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = ((Math.atan2(y, x) / RAD) % 360 + 360) % 360;
  const r = Math.sqrt(x * x + y * y);
  const cosN = Math.cos(N * RAD);
  const sinN = Math.sin(N * RAD);
  const cosi = Math.cos(i * RAD);
  const arg = (v + w) * RAD;
  const xh =
    r * (cosN * Math.cos(arg) - sinN * Math.sin(arg) * cosi);
  const yh =
    r * (sinN * Math.cos(arg) + cosN * Math.sin(arg) * cosi);
  let lon = ((Math.atan2(yh, xh) / RAD) % 360 + 360) % 360;
  const Ms = sunM;
  const Mm = M;
  const Lm = norm360(N + w + M);
  const D = norm360(Lm - sunLs);
  const F = norm360(Lm - N);
  lon +=
    -1.274 * Math.sin((Mm - 2 * D) * RAD) +
    0.658 * Math.sin(2 * D * RAD) -
    0.186 * Math.sin(Ms * RAD) -
    0.114 * Math.sin(2 * F * RAD);
  return norm360(lon);
}

function sunMeanAnomaly(d: number): number {
  return norm360(356.047 + 0.9856002585 * d);
}

function sunMeanLongitude(d: number): number {
  return norm360(sunMeanAnomaly(d) + 282.9404 + 4.70935e-5 * d);
}

export interface Tithi {
  /** 1..30 */
  index: number;
  paksha: 'शुक्ल' | 'कृष्ण';
  name: string;
}

const NAMES = [
  'प्रतिपदा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पञ्चमी',
  'षष्ठी', 'सप्तमी', 'अष्टमी', 'नवमी', 'दशमी',
  'एकादशी', 'द्वादशी', 'त्रयोदशी', 'चतुर्दशी',
];

/** Tithi at 06:00 NPT for a Kathmandu calendar date (y, m1-12, d). */
export function getTithi(y: number, m: number, d: number): Tithi {
  // 06:00 NPT == 00:15 UTC same calendar day
  const ms = Date.UTC(y, m - 1, d, 0, 15, 0);
  const jd = jdFromMs(ms);
  const dd = jd - 2451543.5;
  const sunM = sunMeanAnomaly(dd);
  const elong = norm360(moonLongitude(dd, sunM, sunMeanLongitude(dd)) - sunLongitude(dd));
  const index = Math.min(30, Math.floor(elong / 12) + 1);
  if (index <= 15) {
    return {
      index,
      paksha: 'शुक्ल',
      name: index === 15 ? 'पूर्णिमा' : NAMES[index - 1],
    };
  }
  const k = index - 15;
  return {
    index,
    paksha: 'कृष्ण',
    name: k === 15 ? 'औंसी' : NAMES[k - 1],
  };
}

export const BS_MONTHS_NE = [
  'बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज',
  'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत',
];
