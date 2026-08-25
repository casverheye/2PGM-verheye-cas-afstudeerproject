export type AdminDocId =
  | "catalog"
  | "course"
  | "topic"
  | "knowledgePoint"
  | "question"
  | "prerequisite"
  | "encompassing"
  | "ready"
  | "slug"
  | "delete"
  | "engine";

export type AdminDoc = {
  title: string;
  paragraphs: string[];
};

export const ADMIN_DOCS: Record<AdminDocId, AdminDoc> = {
  catalog: {
    title: "What you manage here",
    paragraphs: [
      "This catalog is the content tree students learn from: a course holds topics, a topic holds knowledge points, and a knowledge point holds questions.",
      "You do not write lessons, reviews, or quizzes. The learning engine builds those tasks from the questions you add.",
      "Students see topic intros in Courses. Real lessons only start from Learn, after the engine picks a topic.",
      "Show to students (listed) is a separate switch from Ready. Hidden courses stay in Admin. They do not appear in the Courses menu, on the graph, or in Learn.",
    ],
  },
  course: {
    title: "How to create a course",
    paragraphs: [
      "A course is a folder of topics, such as Arithmetic. Title is what students see in the Courses menu.",
      "Id is a permanent URL key (example: arithmetic). Lowercase letters, numbers, and underscore only. You cannot change it later.",
      "List position is a small number: 1 appears before 2 in the menu.",
      "Show to students starts off. After you create a course, tick Listed on the catalog when you want it in the Courses menu, on /graph, and in Learn. Ready/Incomplete is a content checklist; this switch is visibility.",
      "After you create a course, open it and add topics. A course is useful to students only when it is listed and its topics are marked Ready.",
    ],
  },
  topic: {
    title: "How to create a topic",
    paragraphs: [
      "A topic is one node on the knowledge graph, such as Addition. Students can open its intro from Courses.",
      "Id is a permanent URL key (example: addition). You cannot change it later.",
      "Intro is the teaching text on the topic page. It is not a lesson. Empty intro keeps the topic incomplete.",
      "Then add knowledge points (skills) and, if needed, graph arrows that say what must come first.",
    ],
  },
  knowledgePoint: {
    title: "How to create a knowledge point",
    paragraphs: [
      "A knowledge point is one skill the engine tracks, such as “Add two-digit numbers without regrouping”.",
      "Order is a small number: smaller is taught first inside the topic.",
      "Open the knowledge point and add questions: 1 worked example, 3 placement questions, and at least 1 bank question. Until then the topic stays incomplete.",
    ],
  },
  question: {
    title: "How to create a question",
    paragraphs: [
      "Worked example: shown in a lesson with the correct answer visible. Students study it; they do not guess. Need at least one per knowledge point.",
      "Placement question: used only in the diagnostic (slots 1, 2, and 3). The engine does not reuse these in a normal lesson. Need all three.",
      "Lesson / review / quiz bank: the engine picks from this pool. Order must be 20 or higher so they stay out of placement. Need at least one.",
      "The correct choice is graded on the server. Students never receive it on practice items.",
    ],
  },
  prerequisite: {
    title: "How prerequisites work",
    paragraphs: [
      "A prerequisite arrow means: students must finish the other topic before this one can be taught.",
      "Example: Addition must be done before Subtraction. The engine will not skip ahead.",
      "The server rejects a loop (A needs B and B needs A). A topic cannot require itself.",
    ],
  },
  encompassing: {
    title: "How encompassing arrows work",
    paragraphs: [
      "An encompassing arrow means practicing this topic also counts toward another topic, with a weight (usually 0.3).",
      "Use this when a broader skill already includes a narrower one. It does not replace a prerequisite.",
    ],
  },
  ready: {
    title: "Ready versus incomplete",
    paragraphs: [
      "There is no separate draft or publish switch. Incomplete catalog rows stay in the back office; the engine only teaches a topic when it is Ready.",
      "Ready means: intro text is filled, the topic has at least one knowledge point, and every knowledge point has 1 worked example, 3 placement questions, and 1+ bank questions.",
      "You can still edit a Ready topic. Changing questions later does not un-teach students who already have progress, but new lessons will use the new bank.",
    ],
  },
  slug: {
    title: "What an id is",
    paragraphs: [
      "Id is the permanent key used in URLs and the database, not the student-facing title.",
      "Allowed: start with a letter, then letters, numbers, or underscore. Max 64 characters. Example: two_digit_addition.",
      "Do not use spaces, capitals, or punctuation. You cannot rename an id after create.",
    ],
  },
  delete: {
    title: "How to delete safely",
    paragraphs: [
      "Delete is blocked if students already used the row: answers, quizzes, progress, or an active course selection.",
      "If delete is allowed, unused child rows go with it (a course takes unused topics, a knowledge point takes its questions).",
      "Graph arrows can always be removed; that only deletes the link, not the topics.",
    ],
  },
  engine: {
    title: "How Learn uses this catalog",
    paragraphs: [
      "Learn asks FastAPI for the next task. The engine may assign a diagnostic, a new lesson, practice, review, or a quiz.",
      "Those task types are not catalog rows. You only supply topics, skills, questions, and graph arrows.",
      "Placement uses the three low-order practice questions. Lessons prefer bank questions (order 20+).",
    ],
  },
};

export const SLUG_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function suggestSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (!slug) {
    return "";
  }
  return SLUG_PATTERN.test(slug) ? slug : `c_${slug}`.slice(0, 64);
}
