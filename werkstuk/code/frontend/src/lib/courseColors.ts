import type { GraphCourse } from "./types";

/** Ring colors that tell courses apart on the knowledge graph. */
const COURSE_RINGS = ["#ea580c", "#0d9488", "#7c3aed", "#db2777", "#0284c7"];
const FALLBACK_RING = "#c5cad3";

export function courseRing(courseId: string, courses: GraphCourse[]): string {
  const index = courses.findIndex((course) => course.id === courseId);
  if (index < 0) {
    return FALLBACK_RING;
  }
  return COURSE_RINGS[index % COURSE_RINGS.length];
}
