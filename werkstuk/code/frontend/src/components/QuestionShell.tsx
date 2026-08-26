import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import { buttonClass, cardClass } from "../lib/styles";

export function QuestionShell({
  questionNumber,
  total,
  currentIndex,
  onBack,
  onNext,
  children,
  footer,
  help,
  showClose = true,
}: {
  questionNumber?: number;
  total?: number;
  currentIndex?: number;
  onBack?: () => void;
  onNext?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  help?: ReactNode;
  showClose?: boolean;
}) {
  // Help is only "open" for the question it was opened on, so moving to
  // another question closes it by itself — no reset effect needed.
  const [openHelpFor, setOpenHelpFor] = useState<number | null>(null);
  const helpOpen = questionNumber != null && openHelpFor === questionNumber;
  const pillCount = total != null && total > 0 ? total : 7;
  const filled = Math.min(
    Math.max(currentIndex ?? questionNumber ?? 1, 1),
    pillCount,
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative mb-6 flex min-h-8 items-center">
        <div className="absolute inset-y-0 left-0 right-8 flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted disabled:cursor-not-allowed disabled:text-line"
            disabled={!onBack}
            onClick={onBack}
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            {Array.from({ length: pillCount }, (_, index) => {
              const isCurrent = index === filled - 1;
              const isDone = index < filled - 1;
              return (
                <span
                  key={index}
                  className={
                    isCurrent
                      ? "h-1.5 w-8 min-w-0 shrink rounded-full bg-blue-bright"
                      : isDone
                        ? "h-1.5 w-8 min-w-0 shrink rounded-full bg-blue"
                        : "h-1.5 w-8 min-w-0 shrink rounded-full bg-line"
                  }
                />
              );
            })}
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer text-muted disabled:cursor-not-allowed disabled:text-line"
            disabled={!onNext}
            onClick={onNext}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {showClose ? (
          <Link
            to="/learn"
            aria-label="Close lesson. Your progress is saved."
            className="relative z-10 ml-auto text-navy/70 transition-colors hover:text-navy"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className="relative z-10 ml-auto h-4 w-4" aria-hidden="true" />
        )}
      </div>

      <div className={`p-6 sm:p-10 ${cardClass}`}>
        {questionNumber ? (
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-lg font-bold text-navy">Question {questionNumber}</p>
            {help ? (
              <button
                type="button"
                onClick={() =>
                  setOpenHelpFor(helpOpen ? null : (questionNumber ?? null))
                }
                aria-label="How this topic works"
                aria-expanded={helpOpen}
                className="cursor-pointer text-navy/70 transition-colors hover:text-navy"
              >
                <CircleHelp className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
        {helpOpen && help ? (
          <>
            {help}
            <button
              type="button"
              onClick={() => setOpenHelpFor(null)}
              className={`mt-4 ${buttonClass}`}
            >
              Back to question
            </button>
          </>
        ) : (
          <>
            {children}
            {footer ? <div className="mt-8">{footer}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
