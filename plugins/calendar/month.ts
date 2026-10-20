// The whole of the calendar's date logic.
//
// No date library. What is needed here is the first of the month, a weekday
// index shifted so weeks start on Monday, and 42 cells — a fixed problem with
// no edge cases the platform does not already handle, and `Intl` supplies the
// French month and weekday names outright. `date-fns` with its `fr` locale, or
// `dayjs` with the `weekday` and `localeData` plugins, would be the first
// dependency added to a repo carrying only preact, zustand and pdf.js, and
// would buy none of what those libraries are actually for: parsing, durations
// and time zones appear nowhere below.
//
// Everything here is pure and takes the dates it works from, so a test can pin
// "today" instead of waiting for one.

export interface Day {
  date: Date;
  day: number;
  /** false for the leading and trailing days of the neighbouring months */
  inMonth: boolean;
  isToday: boolean;
}

/** A month grid always has six rows, so the panel does not change height. */
const ROWS = 6;
const WEEK = 7;
const CELLS = ROWS * WEEK;

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The 42 cells of `view`'s month, Monday first.
 *
 * Days are built by letting the `Date` constructor overflow the day-of-month,
 * which is what makes month ends, leap years and DST transitions land on the
 * right local midnight without any arithmetic here.
 */
export function monthGrid(view: Date, today: Date): Day[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  // getDay() is Sunday-based; this shifts it to Monday = 0.
  const lead = (first.getDay() + 6) % WEEK;

  return Array.from({ length: CELLS }, (_, i) => {
    const date = new Date(
      first.getFullYear(),
      first.getMonth(),
      1 - lead + i,
    );
    return {
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === first.getMonth(),
      isToday: sameDay(date, today),
    };
  });
}

/** The grid split into its six weeks. */
export function weeksOf(days: Day[]): Day[][] {
  return Array.from({ length: ROWS }, (_, i) =>
    days.slice(i * WEEK, (i + 1) * WEEK),
  );
}

/** ISO 8601 week number: weeks start Monday, week 1 holds the first Thursday. */
export function isoWeek(d: Date) {
  // Shift to that week's Thursday, then count weeks from the year's first one.
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % WEEK));
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const days = Math.round(
    (thursday.getTime() - jan1.getTime()) / 86_400_000,
  );
  return 1 + Math.floor(days / WEEK);
}

const dayNames = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const monthName = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

/** "lun" … "dim". 2024-01-01 was a Monday, which is all that date is for. */
export const WEEKDAYS = Array.from({ length: WEEK }, (_, i) =>
  dayNames.format(new Date(2024, 0, 1 + i)).replace(".", ""),
);

/** "septembre 2026" — capitalised by the stylesheet, as French prefers. */
export function monthLabel(d: Date) {
  return monthName.format(d);
}
