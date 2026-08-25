import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { apiGet, apiPost } from "../lib/api";
import { Bone } from "../components/Bone";
import { ActivityCalendar } from "../components/learn/ActivityCalendar";
import { ProgressRing } from "../components/learn/ProgressRing";
import { TaskCard } from "../components/learn/TaskCard";
import { cardClass, errorClass, mutedClass, taskClass } from "../lib/styles";
import type {
  ActiveCourse,
  Course,
  LearnPlan,
  LearningCalendar,
  QueueItem,
  Task,
} from "../lib/types";

export function LearnHomePage() {
  return (
    <RequireAuth>
      <LearnHomeContent />
    </RequireAuth>
  );
}

function LearnHomeContent() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [preparingQuiz, setPreparingQuiz] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [course, setCourse] = useState<ActiveCourse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [topics, setTopics] = useState<QueueItem[]>([]);
  const [nextReviewAt, setNextReviewAt] = useState<string | null>(null);
  const [nextCourse, setNextCourse] = useState<ActiveCourse | null>(null);
  const [calendar, setCalendar] = useState<LearningCalendar | null>(null);
  const calendarRequest = useRef(0);

  function applyPlan(plan: LearnPlan, library: { items: QueueItem[] }) {
    setCourse(plan.course);
    setTasks(plan.tasks);
    setTopics(library.items);
    setNextReviewAt(plan.next_review_at);
    setNextCourse(plan.next_course);
    setPlanLoading(false);
    setError("");
  }

  function loadCalendar() {
    const requestId = calendarRequest.current + 1;
    calendarRequest.current = requestId;
    return apiGet<LearningCalendar>("/calendar").then((month) => {
      if (calendarRequest.current === requestId) {
        setCalendar(month);
      }
    });
  }

  useEffect(() => {
    let ignore = false;
    apiGet<{ courses: Course[] }>("/courses")
      .then((catalog) => {
        if (ignore) {
          return;
        }
        setCourses(catalog.courses);
        const active = catalog.courses.find((item) => item.is_active);
        if (active) {
          setCourse((current) => current ?? { id: active.id, title: active.title });
        }
      })
      .catch(() => {
        // Title can still come from /next-tasks.
      });
    Promise.all([
      apiGet<LearnPlan>("/next-tasks"),
      apiGet<{ course: ActiveCourse; items: QueueItem[] }>("/learn-queue"),
    ])
      .then(([plan, library]) => {
        if (ignore) {
          return;
        }
        applyPlan(plan, library);
      })
      .catch((loadError: Error) => {
        if (!ignore) {
          setPlanLoading(false);
          setError(loadError.message);
        }
      });
    loadCalendar().catch(() => {
      // Plan still works if the month view fails.
    });
    return () => {
      ignore = true;
      calendarRequest.current += 1;
    };
  }, []);

  function switchCourse(courseId: string) {
    if (courseId === course?.id) {
      return;
    }
    const picked = courses.find((item) => item.id === courseId);
    if (picked) {
      setCourse({ id: picked.id, title: picked.title });
    }
    setPlanLoading(true);
    setTasks([]);
    setTopics([]);
    setNextCourse(null);
    setError("");
    calendarRequest.current += 1;
    setCalendar(null);
    apiPost<{ active: ActiveCourse }>(`/courses/${courseId}/activate`)
      .then(() =>
        Promise.all([
          apiGet<LearnPlan>("/next-tasks"),
          apiGet<{ course: ActiveCourse; items: QueueItem[] }>("/learn-queue"),
        ]),
      )
      .then(([plan, library]) => {
        applyPlan(plan, library);
        setCourses((current) =>
          current.map((item) => ({
            ...item,
            is_active: item.id === plan.course.id,
          })),
        );
        loadCalendar().catch(() => {
          // Keep the new plan even if the month view fails.
        });
      })
      .catch((switchError: Error) => {
        setPlanLoading(false);
        setError(switchError.message);
      });
  }

  function startQuiz(task: Task) {
    setError("");
    setPreparingQuiz(true);
    const load = task.quiz_id
      ? apiGet<{ quiz_id: number }>(`/quizzes/${task.quiz_id}`)
      : apiPost<{ quiz_id: number }>("/quizzes");
    load
      .then((quiz) => {
        void navigate({
          to: "/quiz/$quizId",
          params: { quizId: String(quiz.quiz_id) },
          replace: true,
        });
      })
      .catch((quizError: Error) => {
        setPreparingQuiz(false);
        setError(quizError.message);
      });
  }

  const recommendedIds = new Set(
    tasks.map((task) => task.topic_id).filter((id): id is string => Boolean(id)),
  );
  const completed = topics.filter(
    (item) => item.state === "completed" && !recommendedIds.has(item.topic_id),
  );
  const topicsCompleted = topics.filter((item) => item.state === "completed").length;
  const topicsTotal = topics.length;
  const progressPct =
    topicsTotal === 0 ? 0 : Math.round((topicsCompleted / topicsTotal) * 100);

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:gap-6">
      <aside className="flex w-full flex-col gap-6 lg:w-72 lg:shrink-0">
        <div className={`p-5 ${cardClass}`}>
          <CoursePicker course={course} courses={courses}>
            <ProgressRing percent={progressPct} topics={topics} />
          </CoursePicker>
        </div>
        {calendar ? (
          <div className={`p-5 ${cardClass}`}>
            <ActivityCalendar data={calendar} />
          </div>
        ) : null}
      </aside>

      <section className="min-w-0 flex-1">
        {error ? (
          <p className={`mb-4 ${errorClass}`}>{error}</p>
        ) : preparingQuiz ? (
          <p className={`mb-4 ${mutedClass}`}>Preparing quiz…</p>
        ) : null}
        {planLoading ? (
          <>
            <p className="sr-only">Loading your plan…</p>
            <PlanSkeleton />
          </>
        ) : (
          <>
            {tasks.length === 0 ? (
              <p className={`mb-4 ${mutedClass}`}>
                {nextReviewAt
                  ? `You're caught up. The next review is on ${new Date(nextReviewAt).toLocaleDateString()}.`
                  : "You're caught up. Reviews will appear here when they're due."}
              </p>
            ) : null}
            {tasks.length === 1 && tasks[0].type === "DIAGNOSTIC" ? (
              <p className={`mb-4 ${mutedClass}`}>
                Finish the placement test to unlock lessons in this course.
              </p>
            ) : null}

            {nextCourse ? (
              <button
                type="button"
                className={`${taskClass} cursor-pointer`}
                onClick={() => switchCourse(nextCourse.id)}
              >
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  Next course
                </p>
                <p className="mt-1 text-lg font-semibold text-navy">
                  Continue with {nextCourse.title}
                </p>
              </button>
            ) : null}

            {tasks.map((task, index) => (
              <TaskCard
                key={`${task.type}-${index}`}
                task={task}
                onQuiz={() => startQuiz(task)}
              />
            ))}

            {completed.length > 0 ? (
              <>
                <h2 className="mt-8 mb-3 text-xs font-bold tracking-[0.12em] text-muted uppercase">
                  Done
                </h2>
                {completed.map((item) => (
                  <div key={item.topic_id} className={`mb-3 p-5 ${cardClass}`}>
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">
                      Lesson
                    </p>
                    <p className="mt-1 text-lg font-semibold text-navy">{item.title}</p>
                    <p className={`mt-2 ${mutedClass}`}>
                      Completed · {item.mastery_pct}%
                    </p>
                  </div>
                ))}
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function PlanSkeleton() {
  return (
    <div aria-busy="true">
      <div className={`${cardClass} mb-3 px-5 py-4`}>
        <Bone className="h-3 w-16" />
        <Bone className="mt-3 h-6 w-2/3" />
        <Bone className="mt-4 h-1.5 w-full rounded-full" />
        <Bone className="mt-4 h-10 w-28 rounded-full" />
      </div>
      <div className={`${cardClass} mb-3 px-5 py-4`}>
        <Bone className="h-3 w-16" />
        <Bone className="mt-3 h-6 w-1/2" />
        <Bone className="mt-4 h-1.5 w-full rounded-full" />
        <Bone className="mt-4 h-10 w-28 rounded-full" />
      </div>
    </div>
  );
}

function CoursePicker({
  course,
  courses,
  children,
}: {
  course: ActiveCourse | null;
  courses: Course[];
  children: ReactNode;
}) {
  const title = course?.title ?? "Course";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col items-start gap-1">
        <h1 className="text-lg font-bold text-navy">{title}</h1>
        {courses.length >= 2 ? (
          <Link to="/settings/course" className={`flex items-center gap-1 ${mutedClass}`}>
            Switch course
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}
