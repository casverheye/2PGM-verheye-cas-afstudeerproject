import { useEffect, useState, type SubmitEvent } from "react";
import { Link } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { useAuth } from "../lib/authContext";
import { apiGet, apiPost } from "../lib/api";
import {
  clearSavedSession,
  readSavedSession,
  writeSavedSession,
} from "../lib/savedSession";
import { ProblemChoices } from "../components/ProblemChoices";
import { QuestionShell } from "../components/QuestionShell";
import { buttonClass, errorClass, linkClass, mutedClass, successClass } from "../lib/styles";
import type { ChoiceLetter, DiagnosticStep, Problem } from "../lib/types";

type DiagnosticScreen = {
  problem: Problem;
  selected: ChoiceLetter | null;
  isCorrect: boolean | null;
  correctChoice: ChoiceLetter | null;
  explanation: string | null;
};

function sessionKey(userId: string, sessionId: number) {
  return `mathlete.diagnostic.${userId}.${sessionId}`;
}

function isScreen(value: unknown): value is DiagnosticScreen {
  return typeof value === "object" && value !== null && "problem" in value && "isCorrect" in value;
}

export function DiagnosticPage() {
  return (
    <RequireAuth>
      <DiagnosticContent />
    </RequireAuth>
  );
}

function DiagnosticContent() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [screens, setScreens] = useState<DiagnosticScreen[]>([]);
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<DiagnosticStep | null>(null);
  const [done, setDone] = useState<DiagnosticStep | null>(null);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    apiGet<DiagnosticStep>("/diagnostic/current")
      .then((body) => {
        if (ignore) {
          return;
        }
        if (body.active && body.session_id != null && body.problem) {
          openSession(body.session_id, body.problem, userId);
        }
      })
      .catch((loadError: Error) => {
        if (!ignore) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setChecking(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId || sessionId == null || screens.length === 0 || done) {
      return;
    }
    writeSavedSession(sessionKey(userId, sessionId), { index, screens });
  }, [ready, userId, sessionId, index, screens, done]);

  function openSession(id: number, problem: Problem, uid: string) {
    const saved = uid ? readSavedSession(sessionKey(uid, id), isScreen) : null;
    let nextScreens: DiagnosticScreen[];
    let nextIndex: number;
    if (saved) {
      const answered = saved.screens.filter((item) => item.isCorrect !== null);
      const last = saved.screens[saved.screens.length - 1];
      if (last && last.isCorrect === null && last.problem.id === problem.id) {
        nextScreens = saved.screens;
      } else {
        nextScreens = [...answered, { problem, selected: null, isCorrect: null, correctChoice: null, explanation: null }];
      }
      nextIndex = Math.min(Math.max(saved.index, 0), nextScreens.length - 1);
    } else {
      nextScreens = [{ problem, selected: null, isCorrect: null, correctChoice: null, explanation: null }];
      nextIndex = 0;
    }
    setSessionId(id);
    setScreens(nextScreens);
    setIndex(nextIndex);
    setPending(null);
    setDone(null);
    setReady(true);
  }

  function start() {
    setBusy(true);
    setError("");
    apiPost<DiagnosticStep>("/diagnostic/start")
      .then((body) => {
        if (body.session_id != null && body.problem) {
          openSession(body.session_id, body.problem, userId);
        }
      })
      .catch((startError: Error) => setError(startError.message))
      .finally(() => setBusy(false));
  }

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
      setIndex(index + 1);
      return;
    }
    if (!pending) {
      return;
    }
    if (pending.done) {
      if (userId && sessionId != null) {
        clearSavedSession(sessionKey(userId, sessionId));
      }
      setDone(pending);
      setPending(null);
      return;
    }
    if (!pending.problem) {
      return;
    }
    const nextProblem = pending.problem;
    setPending(null);
    setScreens((current) => {
      const next = [...current, { problem: nextProblem, selected: null, isCorrect: null, correctChoice: null, explanation: null }];
      setIndex(next.length - 1);
      return next;
    });
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const screen = screens[index];
    if (!screen?.selected || screen.isCorrect !== null || sessionId === null || busy) {
      return;
    }
    const selected = screen.selected;
    const problemId = screen.problem.id;
    setBusy(true);
    apiPost<DiagnosticStep>(`/diagnostic/${sessionId}/answer`, {
      problem_id: problemId,
      chosen_choice: selected,
    })
      .then((body) => {
        setScreens((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  selected,
                  isCorrect: body.is_correct ?? false,
                  correctChoice: body.correct_choice ?? null,
                  explanation: body.explanation ?? null,
                }
              : item,
          ),
        );
        setPending(body);
      })
      .catch((answerError: Error) => setError(answerError.message))
      .finally(() => setBusy(false));
  }

  const screen = screens[index] ?? null;
  const canGoNext =
    index < screens.length - 1 || (screen != null && screen.isCorrect !== null);

  if (checking) {
    return (
      <QuestionShell>
        <p className={mutedClass}>Loading…</p>
      </QuestionShell>
    );
  }

  if (done) {
    const answeredCount = screens.filter((item) => item.isCorrect !== null).length;
    return (
      <QuestionShell>
        <p className="mb-2 text-lg font-bold text-navy">Placement complete</p>
        <p className="mb-4">Done after {answeredCount} questions.</p>
        {done.known_topics && done.known_topics.length > 0 ? (
          <p>
            You passed:{" "}
            {done.known_topics.map((topic) => topic.title).join(", ")}
          </p>
        ) : (
          <p className={mutedClass}>
            We will start from the beginning — that is completely fine.
          </p>
        )}
        {done.message ? <p className={`mt-3 ${mutedClass}`}>{done.message}</p> : null}
        <p className="mt-6">
          <Link to="/learn" className={linkClass}>
            See my learning plan
          </Link>
        </p>
      </QuestionShell>
    );
  }

  if (sessionId === null || !screen) {
    return (
      <QuestionShell>
        <p className="mb-2 text-lg font-bold text-navy">Placement</p>
        <p className={`mb-6 ${mutedClass}`}>
          A short probe for every topic in this course. Three questions per
          topic: two correct is a pass. Topics you pass are marked known;
          the rest stay for lessons.
        </p>
        {error ? <p className={`mb-4 ${errorClass}`}>{error}</p> : null}
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className={buttonClass}
        >
          Start
        </button>
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      questionNumber={index + 1}
      currentIndex={index + 1}
      total={screens.length}
      onBack={index > 0 ? goBack : undefined}
      onNext={canGoNext && !busy ? goNext : undefined}
      footer={
        screen.isCorrect !== null ? (
          <>
            <p
              className={
                screen.isCorrect
                  ? `font-semibold ${successClass}`
                  : `font-semibold ${errorClass}`
              }
            >
              {screen.isCorrect
                ? "Correct"
                : `Wrong. The answer is ${screen.correctChoice ?? "—"}.`}
            </p>
            {screen.explanation ? (
              <>
                <p className="mt-3 text-sm font-semibold text-navy">Explanation</p>
                <p className="mt-1">{screen.explanation}</p>
              </>
            ) : null}
            <div className="mt-6">
              <button
                type="button"
                onClick={goNext}
                disabled={busy}
                className={buttonClass}
              >
                Continue
              </button>
            </div>
          </>
        ) : undefined
      }
    >
      {error ? <p className={`mb-4 ${errorClass}`}>{error}</p> : null}
      <form onSubmit={onSubmit}>
        <p className="mb-6">{screen.problem.prompt}</p>
        <ProblemChoices
          problem={screen.problem}
          selected={screen.selected}
          onSelect={(letter) => {
            if (screen.isCorrect !== null) {
              return;
            }
            setScreens((current) =>
              current.map((item, itemIndex) =>
                itemIndex === index ? { ...item, selected: letter } : item,
              ),
            );
          }}
          disabled={screen.isCorrect !== null}
        />
        <button
          type="submit"
          disabled={!screen.selected || screen.isCorrect !== null || busy}
          className={buttonClass}
        >
          Submit
        </button>
      </form>
    </QuestionShell>
  );
}
