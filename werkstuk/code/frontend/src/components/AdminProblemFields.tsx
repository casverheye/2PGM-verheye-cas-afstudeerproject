import { type ChangeEvent, type SubmitEvent } from "react";
import { AdminField } from "./admin/ui";
import { Select } from "./Select";
import {
  applyJob,
  jobFromDraft,
  type ProblemDraft,
  type ProblemJob,
} from "../lib/problemDraft";
import { buttonClass, inputClass, textButtonClass } from "../lib/styles";
import { CHOICE_LETTERS, type ChoiceLetter } from "../lib/types";

const JOB_HINT: Record<ProblemJob, string> = {
  example:
    "Shown in a lesson with the correct answer visible. Students study it; they do not guess.",
  probe:
    "Placement test only. Each knowledge point needs questions 1, 2, and 3. The engine does not reuse these in a normal lesson.",
  bank:
    "The engine picks from this pool for lessons, reviews, and quizzes. Use 20 or higher so they stay out of placement.",
};

type DraftFieldsProps = {
  value: ProblemDraft;
  onChange: (next: ProblemDraft) => void;
};

/** Job picker (example / placement / bank) plus its slot or order field.
 * Shared by the create wizard and the flat edit form. */
export function ProblemJobFields({ value, onChange }: DraftFieldsProps) {
  const job = jobFromDraft(value);

  function set<K extends keyof ProblemDraft>(key: K, next: ProblemDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <>
      <AdminField
        label="What this question is for"
        required
        help="question"
        hint={JOB_HINT[job]}
      >
        <Select
          value={job}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onChange(applyJob(value, event.target.value as ProblemJob))
          }
        >
          <option value="example">Worked example (lesson, answer shown)</option>
          <option value="probe">Placement question (diagnostic only)</option>
          <option value="bank">Lesson / review / quiz bank</option>
        </Select>
      </AdminField>
      {job === "probe" ? (
        <AdminField
          label="Placement slot"
          hint="Diagnostic asks three questions per topic, in this order."
        >
          <Select
            value={String(Math.min(Math.max(value.sort_order, 1), 3))}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              set("sort_order", Number(event.target.value))
            }
          >
            <option value="1">Question 1 of 3</option>
            <option value="2">Question 2 of 3</option>
            <option value="3">Question 3 of 3</option>
          </Select>
        </AdminField>
      ) : null}
      {job === "bank" ? (
        <AdminField
          label="Bank order"
          hint="Must be 20 or higher. 20 is first in the bank, then 21, 22…"
        >
          <input
            type="number"
            min={20}
            value={value.sort_order}
            onChange={(event) =>
              set("sort_order", Math.max(20, Number(event.target.value) || 20))
            }
            className={inputClass}
          />
        </AdminField>
      ) : null}
    </>
  );
}

/** Question text, the five choices, and the correct answer.
 * Shared by the create wizard and the flat edit form. */
export function ProblemContentFields({ value, onChange }: DraftFieldsProps) {
  function set<K extends keyof ProblemDraft>(key: K, next: ProblemDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <>
      <AdminField label="Question text" required>
        <textarea
          value={value.prompt}
          onChange={(event) => set("prompt", event.target.value)}
          required
          rows={3}
          className={inputClass}
        />
      </AdminField>
      {(["a", "b", "c", "d", "e"] as const).map((letter) => {
        const key = `choice_${letter}` as
          | "choice_a"
          | "choice_b"
          | "choice_c"
          | "choice_d"
          | "choice_e";
        return (
          <AdminField key={letter} label={`Choice ${letter}`} required>
            <input
              value={value[key]}
              onChange={(event) => set(key, event.target.value)}
              required
              className={inputClass}
            />
          </AdminField>
        );
      })}
      <AdminField
        label="Correct choice"
        required
        hint="Never shown to students on practice items. FastAPI grades this on the server."
      >
        <Select
          value={value.correct_choice}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            set("correct_choice", event.target.value as ChoiceLetter)
          }
        >
          {CHOICE_LETTERS.map((letter) => (
            <option key={letter} value={letter}>
              {letter}
            </option>
          ))}
        </Select>
      </AdminField>
    </>
  );
}

export function AdminProblemFields({
  value,
  onChange,
  submitLabel,
  onSubmit,
  onCancel,
  saving,
}: {
  value: ProblemDraft;
  onChange: (next: ProblemDraft) => void;
  submitLabel: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  function set<K extends keyof ProblemDraft>(key: K, next: ProblemDraft[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <form onSubmit={onSubmit}>
      <ProblemJobFields value={value} onChange={onChange} />
      <ProblemContentFields value={value} onChange={onChange} />
      <AdminField
        label="Explanation"
        hint="Optional. Shown after a worked example, or when you choose to show it."
      >
        <textarea
          value={value.explanation}
          onChange={(event) => set("explanation", event.target.value)}
          rows={3}
          className={inputClass}
        />
      </AdminField>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={saving} className={buttonClass}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className={textButtonClass} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
