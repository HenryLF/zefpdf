import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { useInterval, cx, IconButton, appearanceVars } from "@/plugins/sdk";
import { PluginWidget } from "../shared/PluginWidget";
import {
  isoWeek,
  monthGrid,
  monthLabel,
  WEEKDAYS,
  weeksOf,
} from "./month";
import { useCalendar } from "./store";
import s from "./Overlay.module.css";

/** A session left open overnight must highlight the right day in the morning. */
const ROLLOVER_MS = 60_000;

export function Overlay() {
  const visible = useCalendar((s) => s.visible);
  const showWeekNumbers = useCalendar((s) => s.showWeekNumbers);
  const todayColor = useCalendar((s) => s.todayColor);
  const appearance = useCalendar((s) => s.appearance);

  const [today, setToday] = useState(() => new Date());
  /** Month offset from today's. Transient: reopening starts on this month. */
  const [offset, setOffset] = useState(0);

  useInterval(() => setToday(new Date()), visible ? ROLLOVER_MS : null, []);

  if (!visible) return null;

  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const weeks = weeksOf(monthGrid(view, today));

  return (
    <PluginWidget
      id="calendar"
      // Opposite side from the clock, so two widgets never open on top of
      // each other; after that the user's own position is what counts. A
      // fraction of the free room, so 0.985 is just short of the right edge
      // on any screen.
      defaults={{ x: 0.985, y: 0.06 }}
    >
      <div
        class={s.card}
        style={{ ...appearanceVars(appearance), "--today": todayColor }}
      >
        <header class={s.head}>
          <IconButton title="Previous month" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </IconButton>
          <button
            class={s.title}
            title="Back to this month"
            onClick={() => setOffset(0)}
          >
            {monthLabel(view)}
          </button>
          <IconButton title="Next month" onClick={() => setOffset((o) => o + 1)}>
            ›
          </IconButton>
        </header>

        <div class={cx(s.grid, showWeekNumbers && s.withWeeks)}>
          {showWeekNumbers && <span class={s.week} />}
          {WEEKDAYS.map((d) => (
            <span key={d} class={s.dow}>
              {d}
            </span>
          ))}

          {weeks.map((week, i) => (
            <Fragment key={i}>
              {showWeekNumbers && week[0] && (
                <span class={s.week}>{isoWeek(week[0].date)}</span>
              )}
              {week.map((d) => (
                <span
                  key={d.date.getTime()}
                  // Found by data attribute, not by class: module names are hashed.
                  data-day="true"
                  data-in-month={d.inMonth ? "true" : "false"}
                  data-today={d.isToday ? "true" : undefined}
                  class={cx(s.day, !d.inMonth && s.out, d.isToday && s.now)}
                >
                  {d.day}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </PluginWidget>
  );
}
