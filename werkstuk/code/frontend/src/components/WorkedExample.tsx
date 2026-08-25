import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ProblemChoices } from "./ProblemChoices";
import type { Problem } from "../lib/types";

export function WorkedExample({
  problem,
  heading = "Worked example",
}: {
  problem: Problem;
  heading?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const correct = problem.correct_choice ?? null;

  return (
    <>
      <p className="mb-2 text-sm font-semibold text-navy">{heading}</p>
      <p className="mb-6">{problem.prompt}</p>
      <ProblemChoices
        problem={problem}
        selected={revealed ? correct : null}
        interactive={false}
      />
      <button
        type="button"
        onClick={() => setRevealed((open) => !open)}
        aria-label={revealed ? "Hide answer" : "Show answer"}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{revealed ? "Hide answer" : "Show answer"}</span>
      </button>
      {revealed && problem.explanation ? (
        <>
          <p className="text-sm font-semibold text-navy">Explanation</p>
          <p className="mt-1 mb-4">{problem.explanation}</p>
        </>
      ) : null}
    </>
  );
}
