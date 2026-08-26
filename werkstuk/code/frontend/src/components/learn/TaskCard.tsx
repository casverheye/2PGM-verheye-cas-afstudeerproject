import { Link } from "@tanstack/react-router";
import { BookOpen, ClipboardList, RotateCcw } from "lucide-react";
import { buttonClass, cardClass, linkClass, mutedClass } from "../../lib/styles";
import type { Task, TaskType } from "../../lib/types";

const KIND_LABEL: Record<TaskType, string> = {
  DIAGNOSTIC: "Diagnostic",
  NEW_LESSON: "Lesson",
  PRACTICE: "Lesson",
  REVIEW: "Review",
  REMEDIAL_REVIEW: "Review",
  FOUNDATION: "Lesson",
  QUIZ: "Quiz",
};

function TaskIcon({ type }: { type: TaskType }) {
  const className = "h-4 w-4 text-blue";
  if (type === "QUIZ" || type === "DIAGNOSTIC") {
    return <ClipboardList className={className} aria-hidden="true" />;
  }
  if (type === "REVIEW" || type === "REMEDIAL_REVIEW") {
    return <RotateCcw className={className} aria-hidden="true" />;
  }
  return <BookOpen className={className} aria-hidden="true" />;
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-line">
        <div
          className="h-1.5 rounded-full bg-blue"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-muted">{clamped}%</span>
    </div>
  );
}

function taskActionLabel(task: Task) {
  if (task.title.startsWith("Resume")) {
    return "Resume";
  }
  if (task.type === "PRACTICE") {
    return "Continue";
  }
  if (task.type === "QUIZ" && task.quiz_id != null) {
    return "Continue";
  }
  if (task.type === "DIAGNOSTIC" && task.progress_pct > 0) {
    return "Continue";
  }
  if (task.type === "FOUNDATION" && task.progress_pct > 0) {
    return "Continue";
  }
  return "Start";
}

/** One task from the plan: kind, title, prerequisites, progress, and action. */
export function TaskCard({ task, onQuiz }: { task: Task; onQuiz: () => void }) {
  const kind = KIND_LABEL[task.type];
  const prereqs = task.prerequisites ?? [];
  const label = taskActionLabel(task);

  return (
    <div className={`${cardClass} mb-3 px-5 py-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted uppercase">
          <TaskIcon type={task.type} />
          <span>{kind}</span>
        </p>
        <span className="text-xs tracking-wide text-muted uppercase">
          {task.estimated_minutes} min
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold text-navy">{task.title}</p>
      {task.reasons[0] ? (
        <p className={`mt-2 ${mutedClass}`}>{task.reasons[0]}</p>
      ) : null}
      {prereqs.length > 0 ? (
        <p className={`mt-2 ${mutedClass}`}>
          Prerequisites:{" "}
          {prereqs.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? ", " : null}
              <Link
                to="/courses/$courseId/$topicId"
                params={{ courseId: item.course_id, topicId: item.id }}
                className={linkClass}
              >
                {item.title}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
      <ProgressBar percent={task.progress_pct} />
      {task.type === "QUIZ" ? (
        <button type="button" className={`mt-4 ${buttonClass}`} onClick={onQuiz}>
          {label}
        </button>
      ) : task.type === "DIAGNOSTIC" ? (
        <Link to="/diagnostic" className={`mt-4 ${buttonClass}`}>
          {label}
        </Link>
      ) : task.topic_id ? (
        <Link
          to="/learn/$topicId"
          params={{ topicId: task.topic_id }}
          className={`mt-4 ${buttonClass}`}
        >
          {label}
        </Link>
      ) : null}
    </div>
  );
}
