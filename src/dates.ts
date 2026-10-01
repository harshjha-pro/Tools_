// Single-timezone date helpers (spec Section 3: no timezone handling).
// All calendar dates are local `YYYY-MM-DD` strings.

const pad = (n: number) => String(n).padStart(2, '0');

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(isoDate: string, n: number): string {
  const d = parse(isoDate);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function today(): string {
  return iso(new Date());
}

/** 0 = Sunday … 6 = Saturday */
export function dow(isoDate: string): number {
  return parse(isoDate).getDay();
}

export function isWeekend(isoDate: string): boolean {
  const d = dow(isoDate);
  return d === 0 || d === 6;
}

/** Monday of the week containing the date (weeks run Monday–Sunday). */
export function weekStart(isoDate: string): string {
  const d = dow(isoDate);
  return addDays(isoDate, d === 0 ? -6 : 1 - d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDay(isoDate: string): string {
  const d = parse(isoDate);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function fmtDayLong(isoDate: string): string {
  const d = parse(isoDate);
  return `${DAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtWeek(start: string): string {
  const end = addDays(start, 6);
  const s = parse(start);
  const e = parse(end);
  const sm = MONTHS[s.getMonth()].slice(0, 3);
  const em = MONTHS[e.getMonth()].slice(0, 3);
  return sm === em ? `${s.getDate()}–${e.getDate()} ${sm}` : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`;
}

export function fmtDateTime(ts: string): string {
  const d = new Date(ts);
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${fmtDay(iso(d))}, ${h12}:${pad(d.getMinutes())} ${ampm}`;
}

export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Local datetime string usable as the value of <input type="datetime-local">. */
export function toLocalInput(ts: string): string {
  const d = new Date(ts);
  return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
