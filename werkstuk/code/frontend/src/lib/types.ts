// API contract types: these mirror the FastAPI response shapes.
// One shared definition so pages cannot drift apart.

export const CHOICE_LETTERS = ["a", "b", "c", "d", "e"] as const;
export type ChoiceLetter = (typeof CHOICE_LETTERS)[number];

export type Problem = {
  id: number;
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
  // only present on worked examples
  explanation?: string | null;
  correct_choice?: ChoiceLetter;
};

export function choiceText(problem: Problem, letter: ChoiceLetter): string {
  const texts: Record<ChoiceLetter, string> = {
    a: problem.choice_a,
    b: problem.choice_b,
    c: problem.choice_c,
    d: problem.choice_d,
    e: problem.choice_e,
  };
  return texts[letter];
}

export type TaskType =
  | "DIAGNOSTIC"
  | "NEW_LESSON"
  | "PRACTICE"
  | "REVIEW"
  | "REMEDIAL_REVIEW"
  | "FOUNDATION"
  | "QUIZ";

export type Task = {
  type: TaskType;
  title: string;
  reasons: string[];
  value: number;
  estimated_minutes: number;
  topic_id?: string;
  blocked_topic_id?: string;
  unlocks_topic_id?: string;
  quiz_id?: number;
  progress_pct: number;
  prerequisites?: { id: string; title: string; course_id: string }[];
};

// the course a response was scoped to
export type ActiveCourse = { id: string; title: string };

export type LearnPlan = {
  course: ActiveCourse;
  tasks: Task[];
  next_review_at: string | null;
  next_course: ActiveCourse | null;
};

export type LearningCalendar = {
  reviews: string[];
  practiced: string[];
};

export type Course = {
  id: string;
  title: string;
  description: string | null;
  topics_total: number;
  topics_completed: number;
  started: boolean;
  is_active: boolean;
  topics: CourseTopic[];
};

export type CourseTopic = {
  id: string;
  title: string;
  completed: boolean;
  started: boolean;
  can_open: boolean;
  kp_total: number;
  kp_mastered: number;
};

export type GraphCourse = {
  id: string;
  title: string;
};

export type GraphNode = {
  id: string;
  title: string;
  course_id: string;
  completed: boolean;
  started: boolean;
  can_open: boolean;
  kp_total: number;
  kp_mastered: number;
};

export type GraphEdge = {
  from_id: string;
  to_id: string;
  kind: "prerequisite" | "encompassing";
  weight: number;
};

export type KnowledgeGraph = {
  courses: GraphCourse[];
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type TopicState =
  | "locked"
  | "available"
  | "in_progress"
  | "halted"
  | "completed";

export type QueueItem = {
  topic_id: string;
  title: string;
  state: TopicState;
  kind: "lesson" | "review";
  can_start: boolean;
  due_review: boolean;
  mastery_pct: number;
  kp_mastered: number;
  kp_total: number;
};

export type KpProgress = {
  id: number;
  title: string;
  mastery_pct: number;
  threshold_pct: number;
};

export type NextProblemResponse = {
  kind: "example" | "practice";
  mode: "lesson" | "review";
  topic: { id: string; title: string };
  kp: KpProgress;
  problem: Problem;
};

export type LessonIntro = {
  kind: "intro";
  mode: "lesson" | "review";
  topic: { id: string; title: string };
  kp: KpProgress;
  intro: string;
  example: Problem | null;
  resume: boolean;
};

export type ImplicitUpdate = {
  topic_id: string;
  kp_id: number;
  kp_title: string;
  weight: number;
  mastery_pct: number;
  next_review_at: string | null;
};

export type QuizProgress = {
  quiz_id: number;
  completed: boolean;
  remaining: number;
  score: number | null;
};

export type AnswerResult = {
  context: string;
  quiz: QuizProgress | null;
  is_correct?: boolean;
  correct_choice?: string;
  explanation?: string | null;
  kp?: KpProgress & { mastered: boolean; status: string };
  topic_completed?: boolean;
  halted?: boolean;
  halt_reason?: string | null;
  sitting_capped?: boolean;
  sitting_cap_reason?: string | null;
  implicit_updates?: ImplicitUpdate[];
  next_review_at?: string | null;
  consecutive_correct?: number;
};

export type QuizRecapItem = {
  topic_id: string;
  topic_title: string;
  prompt: string;
  chosen_choice: ChoiceLetter | null;
  correct_choice: ChoiceLetter;
  is_correct: boolean | null;
  explanation: string | null;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
};

export type QuizDetail = {
  quiz_id: number;
  status: "active" | "completed";
  score: number | null;
  total: number;
  answered: number;
  next_question: { quiz_question_id: number; problem: Problem } | null;
  recap: QuizRecapItem[] | null;
};

export type DiagnosticStep = {
  session_id?: number;
  done: boolean;
  is_correct?: boolean;
  correct_choice?: ChoiceLetter;
  explanation?: string | null;
  problem?: Problem;
  known_topics?: { topic_id: string; title: string }[];
  message?: string;
  answered?: number;
  progress_pct?: number;
  active?: boolean;
};

export type AdminCourseListItem = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  listed: boolean;
  in_use: boolean;
  topic_count: number;
  teachable_count: number;
};

export type AdminChecklistKp = {
  id: number;
  title: string;
  sort_order: number;
  examples: number;
  probes: number;
  bank: number;
  ready: boolean;
};

export type AdminChecklist = {
  intro: boolean;
  knowledge_points: boolean;
  teachable: boolean;
  kps: AdminChecklistKp[];
};

export type AdminProblem = {
  id: number;
  knowledge_point_id: number;
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
  correct_choice: ChoiceLetter;
  role: "example" | "practice";
  sort_order: number;
  explanation: string | null;
  difficulty: number;
};
