// The whole of the planning's date logic.
//
// No date library, for the reasons the month view had: what is needed is a
// week's Monday, its seven days, the ISO week number and a cutoff a month back
// — all of which the `Date` constructor's day and month overflow handles,
// month ends, leap years and DST included — and `Intl` supplies the French
// names outright.
//
// Everything here is pure and takes the dates it works from, so a test can pin
// "today" instead of waiting for one.

const WEEK = 7;

/** Even or odd ISO week: which of the two plannings applies. */
export type Parity = "even" | "odd";

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Local midnight of the Monday of `d`'s week. */
export function mondayOf(d: Date) {
  // getDay() is Sunday-based; this shifts it to Monday = 0.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % WEEK));
}

/** `d` moved by `n` whole weeks, staying on local midnight across DST. */
export function addWeeks(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n * WEEK);
}

/** The seven days from `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from(
    { length: WEEK },
    (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
  );
}

/** ISO 8601 week number: weeks start Monday, week 1 holds the first Thursday. */
export function isoWeek(d: Date) {
  // Shift to that week's Thursday, then count weeks from the year's first one.
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % WEEK));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const days = Math.round((thursday.getTime() - jan1.getTime()) / 86_400_000);
  return 1 + Math.floor(days / WEEK);
}

/**
 * By the week's ISO number. A 53-week year therefore runs two odd weeks in a
 * row (53, then 1) — that is what "even and odd numbered weeks" means.
 */
export function parityOf(d: Date): Parity {
  return isoWeek(d) % 2 === 0 ? "even" : "odd";
}

/**
 * "2026-11-02": the local date, which is what a week is stored under.
 * Not `toISOString`, which is UTC and would name Sunday east of Greenwich.
 */
export function dateKey(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The oldest week whose notes are kept: the Monday a month before this week's.
 * Keys compare as strings, so this is returned as one.
 */
export function purgeBefore(today: Date) {
  const m = mondayOf(today);
  return dateKey(new Date(m.getFullYear(), m.getMonth() - 1, m.getDate()));
}

const dayNames = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** "lun" … "dim". 2024-01-01 was a Monday, which is all that date is for. */
export const WEEKDAYS = Array.from({ length: WEEK }, (_, i) =>
  dayNames.format(new Date(2024, 0, 1 + i)).replace(".", ""),
);

/** "2 nov." — under a day's name. */
export function dayLabel(d: Date) {
  return dayMonth.format(d);
}

/** "Semaine 45 · 2 nov. – 8 nov." */
export function weekLabel(monday: Date) {
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return `Semaine ${isoWeek(monday)} · ${dayLabel(monday)} – ${dayLabel(sunday)}`;
}
