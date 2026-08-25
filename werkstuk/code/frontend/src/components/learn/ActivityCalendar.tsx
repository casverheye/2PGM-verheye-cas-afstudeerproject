import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { LearningCalendar } from "../../lib/types";

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daySet(stamps: string[]) {
  return new Set(stamps.map((stamp) => dayKey(new Date(stamp))));
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Month view of practiced days and upcoming reviews for the active course. */
export function ActivityCalendar({ data }: { data: LearningCalendar }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const year = cursor.year;
  const month = cursor.month;
  const practiced = daySet(data.practiced);
  const reviews = daySet(data.reviews);
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(step: number) {
    setCursor((current) => {
      const next = new Date(current.year, current.month + step, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  function goToday() {
    setCursor({
      year: today.getFullYear(),
      month: today.getMonth(),
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium tracking-wide text-muted uppercase">
          {monthLabel}
        </p>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className="cursor-pointer text-muted"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {isCurrentMonth ? null : (
            <button
              type="button"
              className="cursor-pointer px-1 text-xs text-muted hover:text-navy"
              onClick={goToday}
            >
              Today
            </button>
          )}
          <button
            type="button"
            className="cursor-pointer text-muted"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-muted">
        {WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
        {cells.map((day, index) => {
          if (day == null) {
            return <span key={`empty-${index}`} />;
          }
          const key = dayKey(new Date(year, month, day));
          const isToday = key === dayKey(today);
          const didPractice = practiced.has(key);
          const hasReview = reviews.has(key);
          return (
            <span
              key={key}
              className="relative mx-auto flex h-8 w-8 items-center justify-center"
            >
              <span
                className={`relative flex h-7 w-7 items-center justify-center rounded-full text-navy ${
                  isToday ? "bg-blue-soft" : ""
                }`}
              >
                {day}
                {hasReview ? (
                  <span
                    className={`absolute top-[1px] flex h-3.5 w-3.5 items-center justify-center ${
                      didPractice ? "right-[11px]" : "-right-[3px]"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-blue" />
                  </span>
                ) : null}
                {didPractice ? (
                  <span className="absolute top-[1px] -right-[3px] flex h-3.5 w-3.5 items-center justify-center">
                    <Check
                      className="h-3.5 w-3.5 translate-x-[1.5px] -translate-y-[1.5px] overflow-visible text-ok"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  </span>
                ) : null}
              </span>
            </span>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span className="inline-flex h-3 w-8 shrink-0 items-center justify-center">
            <Check className="h-3 w-3 text-ok" strokeWidth={3} aria-hidden="true" />
          </span>
          Practiced
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-flex h-3 w-8 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-blue" />
          </span>
          Review
        </li>
      </ul>
    </div>
  );
}
