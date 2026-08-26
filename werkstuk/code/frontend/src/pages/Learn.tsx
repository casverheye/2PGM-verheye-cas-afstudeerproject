import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { useAuth } from "../lib/authContext";
import { apiGet, apiPost } from "../lib/api";
import {
  clearSavedSession,
  readSavedSession,
  writeSavedSession,
} from "../lib/savedSession";
import { paragraphs } from "../lib/text";
import { ProblemChoices } from "../components/ProblemChoices";
import { QuestionShell } from "../components/QuestionShell";
import { WorkedExample } from "../components/WorkedExample";
import { buttonClass, errorClass, linkClass, mutedClass, successClass } from "../lib/styles";
import {
  type AnswerResult,
  type ChoiceLetter,
  type LessonIntro,
  type NextProblemResponse,
  type Problem,
} from "../lib/types";

type IntroScreen = { kind: "intro"; intro: LessonIntro };
type ExampleScreen = {
  kind: "example";
  problem: Problem;
  revealed: boolean;
};
type PracticeScreen = {
  kind: "practice";
  problem: Problem;
  selected: ChoiceLetter | null;
  answer: AnswerResult | null;
};
type Screen = IntroScreen | ExampleScreen | PracticeScreen;

function sessionKey(userId: string, topicId: string) {
  return `mathlete.lesson.${userId}.${topicId}`;
}

function isScreen(value: unknown): value is Screen {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  return value.kind === "intro" || value.kind === "example" || value.kind === "practice";
}

function dropCappedScreens(screens: Screen[]): Screen[] {
  return screens.filter(
    (item) => !(item.kind === "practice" && item.answer?.sitting_capped),
  );
}

function lastAnsweredNeedsNext(screens: Screen[]): boolean {
  const last = screens[screens.length - 1];
  return (
    last != null &&
    last.kind === "practice" &&
    last.answer != null &&
    !last.answer.topic_completed &&
    !last.answer.halted
  );
}

export function LearnPage() {
  const { topicId } = useParams({ from: "/learn/$topicId" });

  return (
    <RequireAuth>
      <LearnContent key={topicId} topicId={topicId} />
    </RequireAuth>
  );
}

function IntroBody({ intro }: { intro: LessonIntro }) {
  return (
    <>
      <p className="mb-1 text-lg font-bold text-navy">Introduction</p>
      <p className={`mb-4 ${mutedClass}`}>{intro.topic.title}</p>
      {paragraphs(intro.intro).map((part) =>
        part.startsWith("Example") ? (
          <div key={part} className="mb-4">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
              Example
            </p>
            <p className="leading-relaxed whitespace-pre-wrap">
              {part.replace(/^Example\n?/, "").trim()}
            </p>
          </div>
        ) : (
          <p key={part} className="mb-4 leading-relaxed whitespace-pre-wrap">
            {part}
          </p>
        ),
      )}
    </>
  );
}

function LessonHelp({ intro }: { intro: LessonIntro }) {
  return (
    <div className="flex flex-col items-start">
      {intro.intro ? <IntroBody intro={intro} /> : null}
      {intro.example ? <WorkedExample problem={intro.example} /> : null}
    </div>
  );
}

function LearnContent({ topicId }: { topicId: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  // Only ever a failure; "still loading" is simply having no screen yet.
  const [error, setError] = useState("");
  const [screens, setScreens] = useState<Screen[]>([]);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [helpIntro, setHelpIntro] = useState<LessonIntro | null>(null);

  // LearnPage keys this component by topicId, so switching topics remounts
  // it with fresh state; no manual reset needed here.
  useEffect(() => {
    let ignore = false;
    apiGet<LessonIntro>(`/topics/${topicId}/intro`)
      .then((body) => {
        if (ignore) {
          return;
        }
        setHelpIntro(body);
        if (body.mode === "review" || (!body.intro && !body.example)) {
          const saved = userId
            ? readSavedSession(sessionKey(userId, topicId), isScreen)
            : null;
          if (saved) {
            const restored = dropCappedScreens(
              saved.screens.map((item) => {
                if (item.kind === "practice" && item.answer?.halted) {
                  return {
                    ...item,
                    answer: { ...item.answer, halted: false, halt_reason: null },
                  };
                }
                return item;
              }),
            );
            if (restored.length > 0) {
              const nextIndex = Math.min(Math.max(saved.index, 0), restored.length - 1);
              setScreens(restored);
              setIndex(nextIndex);
              const landed = restored[nextIndex];
              if (landed.kind === "practice" && landed.answer == null) {
                setStartedAt(Date.now());
              }
              setError("");
              setReady(true);
              if (lastAnsweredNeedsNext(restored)) {
                loadPractice(
                  topicId,
                  () => ignore,
                  setScreens,
                  setIndex,
                  setStartedAt,
                  setError,
                  setBusy,
                );
              }
              return;
            }
          }
          loadPractice(topicId, () => ignore, setScreens, setIndex, setStartedAt, setError, setBusy);
          setReady(true);
          return;
        }
        const saved = userId
          ? readSavedSession(sessionKey(userId, topicId), isScreen)
          : null;
        if (saved) {
          const restored = dropCappedScreens(
            saved.screens.map((item) => {
              if (item.kind === "intro") {
                return { ...item, intro: body };
              }
              if (item.kind === "example" && body.example) {
                return { ...item, problem: body.example };
              }
              if (item.kind === "practice" && item.answer?.halted) {
                return {
                  ...item,
                  answer: { ...item.answer, halted: false, halt_reason: null },
                };
              }
              return item;
            }),
          );
          if (restored.length > 0) {
            const nextIndex = Math.min(Math.max(saved.index, 0), restored.length - 1);
            setScreens(restored);
            setIndex(nextIndex);
            const landed = restored[nextIndex];
            if (landed.kind === "practice" && landed.answer == null) {
              setStartedAt(Date.now());
            }
            setError("");
            setReady(true);
            if (lastAnsweredNeedsNext(restored)) {
              loadPractice(
                topicId,
                () => ignore,
                setScreens,
                setIndex,
                setStartedAt,
                setError,
                setBusy,
              );
            }
            return;
          }
        }
        const next: Screen[] = [{ kind: "intro", intro: body }];
        if (body.example) {
          next.push({
            kind: "example",
            problem: body.example,
            revealed: false,
          });
        }
        setScreens(next);
        setIndex(0);
        setError("");
        setReady(true);
      })
      .catch((introError: Error) => {
        if (!ignore) {
          setError(introError.message);
        }
      });
    return () => {
      ignore = true;
    };
  }, [topicId, userId]);

  useEffect(() => {
    if (!ready || !userId || screens.length === 0) {
      return;
    }
    const finished = screens.some(
      (item) => item.kind === "practice" && item.answer?.topic_completed,
    );
    if (finished) {
      clearSavedSession(sessionKey(userId, topicId));
      return;
    }
    const persistable = dropCappedScreens(screens);
    if (persistable.length === 0) {
      clearSavedSession(sessionKey(userId, topicId));
      return;
    }
    const persistIndex = Math.min(index, persistable.length - 1);
    writeSavedSession(sessionKey(userId, topicId), {
      index: persistIndex,
      screens: persistable,
    });
  }, [ready, userId, topicId, index, screens]);

  const screen = screens[index] ?? null;

  function goBack() {
    if (index > 0) {
      setIndex(index - 1);
    }
  }

  function goNext() {
    if (busy) {
      return;
    }
    if (index < screens.length - 1) {
      const target = screens[index + 1];
      // The response timer starts when the unanswered question comes on screen.
      if (target.kind === "practice" && target.answer == null) {
        setStartedAt(Date.now());
      }
      setIndex(index + 1);
      return;
    }
    const current = screens[index];
    if (!current) {
      return;
    }
    if (current.kind === "intro" || current.kind === "example") {
      loadPractice(topicId, () => false, setScreens, setIndex, setStartedAt, setError, setBusy);
    }
    if (
      current.kind === "practice" &&
      current.answer &&
      !current.answer.topic_completed &&
      !current.answer.halted &&
      !current.answer.sitting_capped
    ) {
      loadPractice(topicId, () => false, setScreens, setIndex, setStartedAt, setError, setBusy);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (screen?.kind !== "practice" || !screen.selected || screen.answer || busy) {
      return;
    }
    const selected = screen.selected;
    const problemId = screen.problem.id;
    setBusy(true);
    apiPost<AnswerResult>("/answers", {
      problem_id: problemId,
      chosen_choice: selected,
      response_ms: Date.now() - startedAt,
    })
      .then((result) => {
        setScreens((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index && item.kind === "practice"
              ? { ...item, answer: result }
              : item,
          ),
        );
      })
      .catch((answerError: Error) => setError(answerError.message))
      .finally(() => setBusy(false));
  }

  const canGoNext =
    index < screens.length - 1 ||
    screen?.kind === "intro" ||
    screen?.kind === "example" ||
    (screen?.kind === "practice" &&
      screen.answer != null &&
      !screen.answer.topic_completed &&
      !screen.answer.halted &&
      !screen.answer.sitting_capped);

  const practiceNumber =
    screen?.kind === "practice"
      ? screens.slice(0, index + 1).filter((item) => item.kind === "practice").length
      : undefined;
  const done =
    screen?.kind === "practice" &&
    screen.answer != null &&
    (screen.answer.topic_completed ||
      screen.answer.halted ||
      screen.answer.sitting_capped);

  if (!screen) {
    return (
      <QuestionShell>
        <p className={`mb-4 ${error ? errorClass : mutedClass}`}>
          {error || "Loading…"}
        </p>
        <Link to="/learn" className={linkClass}>
          Back to learn
        </Link>
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      questionNumber={practiceNumber}
      currentIndex={index + 1}
      total={screens.length}
      onBack={index > 0 ? goBack : undefined}
      onNext={canGoNext && !busy ? goNext : undefined}
      footer={
        screen.kind === "practice" && screen.answer ? (
          <AnswerFooter
            answer={screen.answer}
            done={Boolean(done)}
            busy={busy}
            onNext={goNext}
          />
        ) : undefined
      }
      help={
        screen.kind === "practice" &&
        helpIntro &&
        (helpIntro.intro || helpIntro.example) ? (
          <LessonHelp key={screen.problem.id} intro={helpIntro} />
        ) : undefined
      }
    >
      {error ? <p className={`mb-4 ${errorClass}`}>{error}</p> : null}
      {screen.kind === "intro" ? (
        <>
          <IntroBody intro={screen.intro} />
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className={`mt-4 ${buttonClass}`}
          >
            Continue
          </button>
        </>
      ) : null}
      {screen.kind === "example" ? (
        <div className="flex flex-col items-start">
          <WorkedExample problem={screen.problem} />
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className={`mt-2 ${buttonClass}`}
          >
            Continue
          </button>
        </div>
      ) : null}
      {screen.kind === "practice" ? (
        <form onSubmit={onSubmit}>
          <p className="mb-6">{screen.problem.prompt}</p>
          <ProblemChoices
            problem={screen.problem}
            selected={screen.selected}
            onSelect={(letter) => {
              if (screen.answer) {
                return;
              }
              setScreens((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index && item.kind === "practice"
                    ? { ...item, selected: letter }
                    : item,
                ),
              );
            }}
            disabled={screen.answer !== null}
          />
          <button
            type="submit"
            disabled={!screen.selected || screen.answer !== null || busy}
            className={buttonClass}
          >
            Submit
          </button>
        </form>
      ) : null}
    </QuestionShell>
  );
}

function AnswerFooter({
  answer,
  done,
  busy,
  onNext,
}: {
  answer: AnswerResult;
  done: boolean;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <>
      <p className={answer.is_correct ? `font-semibold ${successClass}` : `font-semibold ${errorClass}`}>
        {answer.is_correct ? "Correct" : `Wrong. The answer is ${answer.correct_choice}.`}
      </p>
      {answer.explanation ? (
        <>
          <p className={`mt-3 text-sm font-semibold text-navy`}>Explanation</p>
          <p className="mt-1">{answer.explanation}</p>
        </>
      ) : null}
      {answer.topic_completed ? (
        <p className="mt-3">
          {answer.context === "review" ? "Review complete. " : "Topic complete. "}
          {answer.next_review_at
            ? `Next review scheduled: ${new Date(answer.next_review_at).toLocaleDateString()}`
            : null}
        </p>
      ) : null}
      {answer.halted ? <p className={`mt-3 ${errorClass}`}>{answer.halt_reason}</p> : null}
      {answer.sitting_capped && !answer.halted ? (
        <p className={`mt-3 ${mutedClass}`}>{answer.sitting_cap_reason}</p>
      ) : null}
      <div className="mt-6">
        {done ? (
          <Link to="/learn" className={linkClass}>
            Back to learn
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={busy}
            className={buttonClass}
          >
            Continue
          </button>
        )}
      </div>
    </>
  );
}

function loadPractice(
  topicId: string,
  // A function, not a boolean: a boolean would be copied when the call
  // starts, so the cleanup flipping it later could never cancel us.
  isStale: () => boolean,
  setScreens: (update: (current: Screen[]) => Screen[]) => void,
  setIndex: (value: number) => void,
  setStartedAt: (value: number) => void,
  setError: (value: string) => void,
  setBusy: (value: boolean) => void,
) {
  setBusy(true);
  setError("");
  apiGet<NextProblemResponse>(`/topics/${topicId}/next-problem`)
    .then((body) => {
      if (isStale()) {
        return;
      }
      appendPractice(body.problem, setScreens, setIndex, setStartedAt, setError);
    })
    .catch((practiceError: Error) => {
      if (!isStale()) {
        setError(practiceError.message);
      }
    })
    .finally(() => {
      if (!isStale()) {
        setBusy(false);
      }
    });
}

function appendPractice(
  problem: Problem,
  setScreens: (update: (current: Screen[]) => Screen[]) => void,
  setIndex: (value: number) => void,
  setStartedAt: (value: number) => void,
  setError: (value: string) => void,
) {
  setScreens((current) => {
    const next: Screen[] = [
      ...current,
      { kind: "practice", problem, selected: null, answer: null },
    ];
    setIndex(next.length - 1);
    return next;
  });
  setStartedAt(Date.now());
  setError("");
}
