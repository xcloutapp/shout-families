// Turns everyday phrases ("in Sydney Mon to Wed", "staying at Matt's Fri and Sat night",
// "working 5-10 fri") into calendar entries. Rule-based; an AI step can replace it later.

export type EventKind = 'away' | 'work' | 'event';

export interface ParsedEvent {
  kind: EventKind;
  title: string;
  days: Date[];
  startTime?: string; // "17:00"
  endTime?: string;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_RE = /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|s|nesday|sday|urday|rsday)?\b|\b(today|tonight|tomorrow|tmrw|this weekend|the weekend|weekend)\b/gi;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function nextWeekday(idx: number, from: Date) {
  const today = startOfDay(from);
  const diff = (idx - today.getDay() + 7) % 7;
  return addDays(today, diff);
}

function tokenToDays(tok: string, now: Date): Date[] {
  const t = tok.toLowerCase();
  if (t === 'today' || t === 'tonight') return [startOfDay(now)];
  if (t === 'tomorrow' || t === 'tmrw') return [addDays(startOfDay(now), 1)];
  if (t.includes('weekend')) return [nextWeekday(6, now), nextWeekday(0, addDays(nextWeekday(6, now), 0))].sort((a, b) => +a - +b);
  const idx = DAYS.indexOf(t.slice(0, 3));
  return idx >= 0 ? [nextWeekday(idx, now)] : [];
}

/** Finds the days a message talks about. "Mon to Wed" is a range; "Fri and Sat" is two days. */
export function parseDays(text: string, now = new Date()): Date[] {
  const toks: { tok: string; at: number; end: number }[] = [];
  for (const m of text.matchAll(DAY_RE)) {
    const at = m.index ?? 0;
    // "back Thu" is when someone returns, not a day they're away.
    if (/\b(back|return(ing)?)\s+(on\s+)?$/i.test(text.slice(Math.max(0, at - 14), at))) continue;
    toks.push({ tok: (m[1] || m[2]) as string, at, end: at + m[0].length });
  }
  if (!toks.length) return [];
  // "swapped thurs shift to fri": only the day after "to" counts.
  if (/\bswap/i.test(text) && toks.length >= 2) return tokenToDays(toks[toks.length - 1].tok, now);
  const out: Date[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = tokenToDays(toks[i].tok, now);
    const next = toks[i + 1];
    const between = next ? text.slice(toks[i].end, next.at) : '';
    if (next && /^\s*(to|-|until|till|thru|through)\s*$/i.test(between)) {
      const b = tokenToDays(next.tok, now);
      if (a[0] && b[0]) {
        let end = b[0];
        if (end < a[0]) end = addDays(end, 7);
        for (let d = a[0]; d <= end; d = addDays(d, 1)) out.push(d);
        i++;
        continue;
      }
    }
    out.push(...a);
  }
  const seen = new Set<number>();
  return out.filter((d) => (seen.has(+d) ? false : (seen.add(+d), true))).sort((a, b) => +a - +b);
}

function to24(h: number, m: number, ap?: string, hintPm = true) {
  if (ap) {
    if (/p/i.test(ap) && h < 12) h += 12;
    if (/a/i.test(ap) && h === 12) h = 0;
  } else if (hintPm && h < 8) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimes(text: string): { start?: string; end?: string } {
  const r = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (r) {
    const start = to24(+r[1], r[2] ? +r[2] : 0, r[3] || r[6]);
    let end = to24(+r[4], r[5] ? +r[5] : 0, r[6] || r[3]);
    if (end <= start && !r[6]) end = to24(+r[4] + 12, r[5] ? +r[5] : 0, undefined, false);
    return { start, end };
  }
  const one = text.match(/\b(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (one) return { start: to24(+one[1], one[2] ? +one[2] : 0, one[3]) };
  return {};
}

const cap = (s: string) => s.replace(/(^|\s)([a-z])/g, (_m, a, c) => a + c.toUpperCase());

/** First word of a place, plus a second word only if it's capitalised ("Port Macquarie", not "Matt's this"). */
function placeName(raw: string) {
  const [a, b] = raw.split(/\s+/);
  const notWord = /^(mon|tue|wed|thu|fri|sat|sun|today|tonight|tomorrow|this|next|the|and|for|till|until|from|to|\d)/i;
  return b && /^[A-Z]/.test(b) && !notWord.test(b) ? `${a} ${b}` : a;
}

/** Returns a calendar entry if the message describes where someone will be. */
export function detectEvent(text: string, now = new Date()): ParsedEvent | null {
  const t = text.trim();
  if (!t || /https?:\/\//.test(t)) return null;
  const days = parseDays(t, now);
  if (!days.length) return null;
  const times = parseTimes(t);

  const work = t.match(/\b(?:working|work|shift|on at)\b(?:\s+(?:at|@)\s+([A-Za-z'’]+(?:\s[A-Z][\w'’]+)?))?/i);
  if (work) {
    const where = work[1] && !/^(mon|tue|wed|thu|fri|sat|sun|to|from|till|until|\d)/i.test(work[1]) ? ` at ${cap(placeName(work[1]))}` : '';
    return { kind: 'work', title: `Working${where}`, days, startTime: times.start, endTime: times.end };
  }
  const away = t.match(/\b(?:staying (?:at|in|with)|sleeping (?:at|over at)|i'?m (?:in|at|away in|away at)|away (?:in|at)|down in|up in|over at|at)\s+([A-Za-z'’]+(?:\s[A-Z][\w'’]+)?)/i);
  if (away && !/^(home|work|school|the shops)$/i.test(away[1]) && !/^(mon|tue|wed|thu|fri|sat|sun|today|tonight|tomorrow|\d)/i.test(away[1])) {
    return { kind: 'away', title: cap(placeName(away[1]).replace(/[’]/g, "'")), days, startTime: times.start, endTime: times.end };
  }
  if (/\b(away|not home|won'?t be home|out)\b/i.test(t)) {
    return { kind: 'away', title: 'Away', days, startTime: times.start, endTime: times.end };
  }
  return null;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function describeDays(days: string[]): string {
  if (!days.length) return '';
  const fmt = (k: string) => new Date(`${k}T00:00`).toLocaleDateString('en-AU', { weekday: 'short' });
  if (days.length === 1) return fmt(days[0]);
  return `${fmt(days[0])}–${fmt(days[days.length - 1])}`;
}

/** A calendar file (.ics) that Apple and Google Calendar can open to add the entries. */
export function toIcs(items: { title: string; day: string; start?: string; end?: string; uid: string }[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shout//Family//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    const d = it.day.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@shout-families`, `DTSTAMP:${stamp}`);
    if (it.start) {
      lines.push(`DTSTART:${d}T${it.start.replace(':', '')}00`);
      lines.push(`DTEND:${d}T${(it.end ?? it.start).replace(':', '')}00`);
    } else {
      const next = dayKey(addDays(new Date(`${it.day}T00:00`), 1)).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
    }
    lines.push(`SUMMARY:${it.title.replace(/[,;\n]/g, ' ')}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
