import { useEffect, useState } from 'react';

/* Shared day/night signal: real sunrise/sunset at the viewer's IP location,
   Kathmandu 6:00–18:00 only when the location can't be obtained.
   Used by the top-bar sun/moon AND the Auto theme (no duplication). */

export interface ViewerLoc {
  lat: number;
  lon: number;
  tz: string;
  label: string;
}

const LOC_KEY = 'fpsc-geo-v1';

function readCachedLoc(): ViewerLoc | null {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || Date.now() - v.at > 86400000) return null;
    if (typeof v.lat !== 'number' || typeof v.lon !== 'number' || !v.tz) return null;
    return v as ViewerLoc;
  } catch {
    return null;
  }
}

async function lookupLoc(): Promise<ViewerLoc | null> {
  const cached = readCachedLoc();
  if (cached) return cached;
  const save = (loc: ViewerLoc) => {
    try {
      localStorage.setItem(LOC_KEY, JSON.stringify({ ...loc, at: Date.now() }));
    } catch {}
    return loc;
  };
  try {
    const r = await fetch('https://ipwho.is/?fields=country,city,latitude,longitude,timezone');
    const j = await r.json();
    if (j && typeof j.latitude === 'number' && j.timezone?.id) {
      return save({
        lat: j.latitude,
        lon: j.longitude,
        tz: j.timezone.id,
        label: [j.city, j.country].filter(Boolean).join(', '),
      });
    }
  } catch {}
  try {
    const r = await fetch('http://ip-api.com/json/?fields=status,country,city,lat,lon,timezone');
    const j = await r.json();
    if (j && j.status === 'success' && typeof j.lat === 'number' && j.timezone) {
      return save({ lat: j.lat, lon: j.lon, tz: j.timezone, label: [j.city, j.country].filter(Boolean).join(', ') });
    }
  } catch {}
  return null;
}

function tzOffsetMinutes(tz: string, at: Date): number | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts: Record<string, string> = {};
    dtf.formatToParts(at).forEach((p) => {
      if (p.type !== 'literal') parts[p.type] = p.value;
    });
    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return null;
  }
}

function sunHours(
  lat: number,
  lon: number,
  y: number,
  m: number,
  d: number,
  tzOffsetMin: number
): { rise: number; set: number } | null {
  const rad = Math.PI / 180;
  const N = Math.floor((275 * m) / 9) - 2 * Math.floor((m + 9) / 12) + d - 30;
  const calc = (isRise: boolean) => {
    const lngHour = lon / 15;
    const t = N + (isRise ? 6 - lngHour : 18 - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = ((RA % 360) + 360) % 360;
    const Lq = Math.floor(L / 90) * 90;
    const RAq = Math.floor(RA / 90) * 90;
    RA = RA + (Lq - RAq);
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    let H = Math.acos(cosH) / rad;
    if (isRise) H = 360 - H;
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    let UT = T - lngHour;
    UT = ((UT % 24) + 24) % 24;
    return UT + tzOffsetMin / 60;
  };
  const rise = calc(true);
  const set = calc(false);
  if (rise == null || set == null) return null;
  return { rise, set };
}

export interface DayNight {
  /** true = sun up at the viewer's location right now */
  isDay: boolean;
  /** 'geo' = real location, 'ktm' = Kathmandu fallback */
  source: 'geo' | 'ktm';
  label: string;
}

export function useDayNight(): DayNight {
  const [now, setNow] = useState(() => new Date());
  const [loc, setLoc] = useState<ViewerLoc | null>(null);
  // The last verdict we published. The 60s tick exists to catch sunrise and
  // sunset, so re-rendering on every tick when the answer has not changed is
  // pure waste: it re-renders every theme consumer for nothing.
  const [verdict, setVerdict] = useState<{ isDay: boolean; source: 'geo' | 'ktm'; label: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    lookupLoc()
      .then((l) => {
        if (alive) setLoc(l);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Publish the verdict only when it actually changes. This is what keeps the
  // 60s tick from re-rendering the whole theme tree.
  useEffect(() => {
    let next: { isDay: boolean; source: 'geo' | 'ktm'; label: string };
    if (!loc) {
      // Unresolved: Kathmandu rule so first paint is never wrong-side.
      let h = 12;
      try {
        h = Number(
          new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', hour12: false }).format(now)
        );
      } catch {}
      next = { isDay: h >= 6 && h < 18, source: 'ktm', label: 'Kathmandu' };
    } else {
      try {
        const off = tzOffsetMinutes(loc.tz, now);
        if (off == null) throw new Error('tz');
        const here = new Date(now.getTime() + off * 60000);
        const h = here.getUTCHours() + here.getUTCMinutes() / 60;
        const sun = sunHours(loc.lat, loc.lon, here.getUTCFullYear(), here.getUTCMonth() + 1, here.getUTCDate(), off);
        next = sun
          ? { isDay: h >= sun.rise && h < sun.set, source: 'geo', label: loc.label }
          : { isDay: h >= 6 && h < 18, source: 'geo', label: loc.label };
      } catch {
        next = { isDay: true, source: 'geo', label: loc.label };
      }
    }
    setVerdict((prev) =>
      prev && prev.isDay === next.isDay && prev.source === next.source && prev.label === next.label
        ? prev
        : next
    );
  }, [now, loc]);

  if (!verdict) {
    // First paint before the effect runs: Kathmandu rule, never wrong-side.
    let h = 12;
    try {
      h = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', hour12: false }).format(now)
      );
    } catch {}
    return { isDay: h >= 6 && h < 18, source: 'ktm', label: 'Kathmandu' };
  }
  return verdict;
}
