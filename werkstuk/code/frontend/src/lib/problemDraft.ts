/** The admin question form's draft shape and the example/placement/bank
 * job rules. Kept apart from the form components so pages and wizards can
 * share the logic. */

import type { ChoiceLetter } from "./types";

export type ProblemJob = "example" | "probe" | "bank";

export type ProblemDraft = {
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
  correct_choice: ChoiceLetter;
  role: "example" | "practice";
  sort_order: number;
  explanation: string;
};

export function jobFromDraft(draft: ProblemDraft): ProblemJob {
  if (draft.role === "example") {
    return "example";
  }
  if (draft.sort_order < 20) {
    return "probe";
  }
  return "bank";
}

const emptyDraft = (
  role: "example" | "practice",
  sortOrder: number,
): ProblemDraft => ({
  prompt: "",
  choice_a: "",
  choice_b: "",
  choice_c: "",
  choice_d: "",
  choice_e: "",
  correct_choice: "a",
  role,
  sort_order: sortOrder,
  explanation: "",
});

export function emptyDraftForJob(job: ProblemJob): ProblemDraft {
  if (job === "example") {
    return emptyDraft("example", 1);
  }
  if (job === "probe") {
    return emptyDraft("practice", 1);
  }
  return emptyDraft("practice", 20);
}

export function applyJob(draft: ProblemDraft, job: ProblemJob): ProblemDraft {
  if (job === "example") {
    return { ...draft, role: "example", sort_order: 1 };
  }
  if (job === "probe") {
    const slot =
      draft.role === "practice" && draft.sort_order >= 1 && draft.sort_order <= 3
        ? draft.sort_order
        : 1;
    return { ...draft, role: "practice", sort_order: slot };
  }
  const order =
    draft.role === "practice" && draft.sort_order >= 20 ? draft.sort_order : 20;
  return { ...draft, role: "practice", sort_order: order };
}
