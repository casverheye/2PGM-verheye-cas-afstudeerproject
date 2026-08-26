import { useState, type SubmitEvent } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { apiPost } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { ProblemChoices } from "../components/ProblemChoices";
import { QuestionShell } from "../components/QuestionShell";
import {
  buttonClass,
  errorClass,
  linkClass,
  mutedClass,
  successClass,
} from "../lib/styles";
import {
  type AnswerResult,
  type ChoiceLetter,
  type QuizDetail,
} from "../lib/types";

export function QuizPage() {
  const { quizId } = useParams({ from: "/quiz/$quizId" });

  return (
    <RequireAuth>
      <QuizContent key={quizId} quizId={quizId} />
    </RequireAuth>
  );
}

function QuizContent({ quizId }: { quizId: string }) {
  const { data: quiz, error: loadError, reload } = useApiGet<QuizDetail>(
    `/quizzes/${quizId}`,
  );
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<ChoiceLetter | null>(null);
  const [busy, setBusy] = useState(false);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quiz?.next_question || !selected || busy) {
      return;
    }
    setBusy(true);
    apiPost<AnswerResult>("/answers", {
      problem_id: quiz.next_question.problem.id,
      chosen_choice: selected,
      quiz_question_id: quiz.next_question.quiz_question_id,
    })
      .then(() => {
        setSelected(null);
        setMessage("");
        reload();
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setBusy(false));
  }

  if (quiz?.status === "completed") {
    return (
      <QuestionShell>
        <p className="mb-2 text-lg font-bold text-navy">Quiz finished</p>
        <p className="mb-4">Score: {quiz.score}%</p>
        {quiz.recap && quiz.recap.length > 0 ? (
          <ul className="mb-6 space-y-4">
            {quiz.recap.map((item, index) => (
              <li key={`${item.topic_id}-${index}`}>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  {item.topic_title}
                </p>
                <p className="mt-1">{item.prompt}</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    item.is_correct ? successClass : errorClass
                  }`}
                >
                  {item.is_correct
                    ? "Correct"
                    : `Your answer: ${item.chosen_choice ?? "—"}. The answer is ${item.correct_choice}.`}
                </p>
                {item.explanation ? (
                  <p className="mt-2 text-sm">{item.explanation}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedClass}>
            Your results were fed back into your learning plan.
          </p>
        )}
        <p className="mt-6">
          <Link to="/learn" className={linkClass}>
            Back to learn
          </Link>
        </p>
      </QuestionShell>
    );
  }

  if (!quiz) {
    return (
      <QuestionShell>
        <p className={`mb-4 ${loadError ? errorClass : mutedClass}`}>
          {loadError ?? "Loading quiz…"}
        </p>
        <Link to="/learn" className={linkClass}>
          Back to learn
        </Link>
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      questionNumber={quiz.answered + 1}
      total={quiz.total}
      currentIndex={quiz.answered + 1}
    >
      {message ? <p className={`mb-4 ${errorClass}`}>{message}</p> : null}
      <p className={`mb-4 ${mutedClass}`}>
        Mixed quiz. Answers are shown at the end.
      </p>
      {quiz.status === "active" && quiz.next_question ? (
        <form onSubmit={onSubmit}>
          <p className="mb-6">{quiz.next_question.problem.prompt}</p>
          <ProblemChoices
            problem={quiz.next_question.problem}
            selected={selected}
            onSelect={setSelected}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!selected || busy}
            className={buttonClass}
          >
            Submit
          </button>
        </form>
      ) : null}
    </QuestionShell>
  );
}
