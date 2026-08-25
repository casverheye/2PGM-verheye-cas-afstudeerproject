import { useState, type ChangeEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { useApiGet } from "../lib/useApiGet";
import { TopicGraph } from "../components/TopicGraph";
import { courseRing } from "../lib/courseColors";
import { cardClass, cx, errorClass, mutedClass } from "../lib/styles";
import type { GraphCourse, GraphNode, KnowledgeGraph } from "../lib/types";

export function GraphPage() {
  return (
    <RequireAuth>
      <GraphContent />
    </RequireAuth>
  );
}

function GraphContent() {
  const navigate = useNavigate();
  const { data, error } = useApiGet<KnowledgeGraph>("/graph");
  const [showEncompassing, setShowEncompassing] = useState(false);

  function onToggle(event: ChangeEvent<HTMLInputElement>) {
    setShowEncompassing(event.target.checked);
  }

  function openTopic(node: GraphNode) {
    void navigate({
      to: "/courses/$courseId/$topicId",
      params: { courseId: node.course_id, topicId: node.id },
    });
  }

  return (
    <div className="relative h-full overflow-hidden">
      <TopicGraph
        nodes={data?.nodes ?? []}
        edges={data?.edges ?? []}
        courses={data?.courses ?? []}
        showEncompassing={showEncompassing}
        onSelect={openTopic}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl justify-end px-4 pt-4 sm:px-6">
          {data ? (
            <GraphLegend
              courses={data.courses}
              showEncompassing={showEncompassing}
              onToggle={onToggle}
            />
          ) : (
            <div
              className={cx(
                cardClass,
                "pointer-events-auto px-3 py-2 text-xs",
              )}
            >
              <p className={error ? errorClass : mutedClass}>
                {error ?? "Loading map…"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GraphLegend({
  courses,
  showEncompassing,
  onToggle,
}: {
  courses: GraphCourse[];
  showEncompassing: boolean;
  onToggle: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={cx(cardClass, "pointer-events-auto space-y-2 px-3 py-2 text-xs text-muted")}>
      <label className="flex cursor-pointer items-center gap-2 text-ink">
        <input
          type="checkbox"
          checked={showEncompassing}
          onChange={onToggle}
        />
        Show encompassing
      </label>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-8 rounded-full border border-line bg-white" />
          Not started
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-8 rounded-full border border-line bg-white"
            style={{
              backgroundImage: "radial-gradient(#8a93a3 1px, transparent 1.2px)",
              backgroundSize: "5px 5px",
            }}
          />
          In progress
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-8 rounded-full border border-line"
            style={{
              background:
                "repeating-linear-gradient(-45deg, #ffffff, #ffffff 2px, #8a93a3 2px, #8a93a3 3px)",
            }}
          />
          Completed
        </li>
        {showEncompassing ? (
          <li className="flex items-center gap-2">
            <span className="inline-block w-8 border-t border-dashed border-muted" />
            Encompassing (refresh)
          </li>
        ) : (
          <li className="flex items-center gap-2">
            <span className="inline-block w-8 border-t border-muted" />
            Prerequisite (door)
          </li>
        )}
      </ul>
      <ul className="space-y-1.5 border-t border-line pt-2">
        {courses.map((course) => (
          <li key={course.id} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full bg-white"
              style={{ border: `1.5px solid ${courseRing(course.id, courses)}` }}
            />
            {course.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
