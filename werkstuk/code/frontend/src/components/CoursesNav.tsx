import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useApiGet } from "../lib/useApiGet";
import { navLinkClass } from "../lib/styles";
import type { Course } from "../lib/types";

export function CoursesNav({
  open,
  onOpen,
  onToggle,
}: {
  open: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={`${navLinkClass} inline-flex items-center gap-1`}
      onMouseEnter={onOpen}
      onClick={onToggle}
    >
      Courses
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform duration-200 ease-out ${
          open ? "rotate-180" : ""
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

export function CoursesMegaPanel({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const { data } = useApiGet<{ courses: Course[] }>("/courses");
  const courses = data?.courses ?? [];
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Until the user hovers a course, preview the active one.
  const activeId =
    courses.find((course) => course.is_active)?.id ?? courses[0]?.id ?? null;
  const preview =
    courses.find((course) => course.id === (hoverId ?? activeId)) ??
    courses[0] ??
    null;

  return (
    <div
      className={
        open
          ? "absolute inset-x-0 top-full z-30 grid grid-rows-[1fr] bg-surface transition-[grid-template-rows] duration-200 ease-out"
          : "pointer-events-none absolute inset-x-0 top-full z-30 grid grid-rows-[0fr] bg-surface transition-[grid-template-rows] duration-200 ease-out"
      }
    >
      <div className="min-h-0 overflow-hidden">
        <div className="h-52 w-full border-y border-line">
          <div className="mx-auto flex h-full w-full max-w-6xl gap-10 px-4 py-6 sm:px-6">
            <div className="w-56 shrink-0">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className={
                    course.id === preview?.id
                      ? "block w-full cursor-pointer py-1.5 text-left text-sm font-semibold text-navy"
                      : "block w-full cursor-pointer py-1.5 text-left text-sm text-muted hover:text-navy"
                  }
                  onMouseEnter={() => setHoverId(course.id)}
                >
                  {course.title}
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto">
              {preview ? (
                <>
                  <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
                    Lessons
                  </p>
                  <div className="grid grid-cols-3 gap-x-8 gap-y-2">
                    {preview.topics.map((topic) => (
                      <Link
                        key={topic.id}
                        to="/courses/$courseId/$topicId"
                        params={{ courseId: preview.id, topicId: topic.id }}
                        className="text-sm text-navy hover:text-blue"
                        onClick={onDismiss}
                      >
                        {topic.title}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">Loading courses…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
