import type { AdminChecklist, AdminChecklistKp } from "./types";

export function kpGaps(kp: Pick<AdminChecklistKp, "examples" | "probes" | "bank">): string[] {
  const gaps: string[] = [];
  if (kp.examples < 1) {
    gaps.push("1 worked example");
  }
  if (kp.probes < 3) {
    const need = 3 - kp.probes;
    gaps.push(`${need} placement question${need === 1 ? "" : "s"}`);
  }
  if (kp.bank < 1) {
    gaps.push("1 lesson-bank question");
  }
  return gaps;
}

export function topicGaps(checklist: AdminChecklist): string[] {
  const gaps: string[] = [];
  if (!checklist.intro) {
    gaps.push("intro text students read on the topic page");
  }
  if (!checklist.knowledge_points) {
    gaps.push("at least one knowledge point");
  }
  for (const kp of checklist.kps) {
    if (!kp.ready) {
      gaps.push(`${kp.title}: ${kpGaps(kp).join(", ")}`);
    }
  }
  return gaps;
}
