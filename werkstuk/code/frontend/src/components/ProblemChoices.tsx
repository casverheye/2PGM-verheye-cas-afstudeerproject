import {
  CHOICE_LETTERS,
  choiceText,
  type ChoiceLetter,
  type Problem,
} from "../lib/types";

type ProblemChoicesProps = {
  problem: Problem;
  selected: ChoiceLetter | null;
  onSelect?: (letter: ChoiceLetter) => void;
  disabled?: boolean;
  interactive?: boolean;
};

export function ProblemChoices({
  problem,
  selected,
  onSelect,
  disabled = false,
  interactive = true,
}: ProblemChoicesProps) {
  const canPick = interactive && !disabled;

  return (
    <div className={interactive ? "mb-8" : "mb-3"}>
      {CHOICE_LETTERS.map((letter) => {
        const active = selected === letter;
        const circle = active
          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue text-sm font-medium text-white"
          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm font-medium text-navy";
        const body = (
          <>
            <span
              className={
                canPick
                  ? `${circle} group-hover:border-blue group-focus-within:ring-2 group-focus-within:ring-blue group-focus-within:ring-offset-2`
                  : circle
              }
            >
              {letter}
            </span>
            <span>{choiceText(problem, letter)}</span>
          </>
        );

        if (!interactive) {
          return (
            <div key={letter} className="mb-3 flex items-center gap-3">
              {body}
            </div>
          );
        }

        return (
          <label
            key={letter}
            className={`group mb-3 flex items-center gap-3 ${canPick ? "cursor-pointer" : ""}`}
          >
            <input
              type="radio"
              name="choice"
              value={letter}
              checked={active}
              disabled={disabled}
              onChange={() => onSelect?.(letter)}
              className="sr-only"
            />
            {body}
          </label>
        );
      })}
    </div>
  );
}
