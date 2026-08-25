import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { RequireAuth } from "../lib/RequireAuth";
import { useApiGet } from "../lib/useApiGet";
import { Bone } from "../components/Bone";
import { WorkedExample } from "../components/WorkedExample";
import { paragraphs } from "../lib/text";
import { backLinkClass, errorClass, mutedClass, titleClass } from "../lib/styles";
import type { Problem } from "../lib/types";

type CourseTopicText = {
  id: string;
  title: string;
  intro: string;
};

type CatalogExample = Problem & { kp_title?: string };

export function CourseTopicPage() {
  const { courseId, topicId } = useParams({
    from: "/courses/$courseId/$topicId",
  });

  return (
    <RequireAuth>
      <CourseTopicContent
        key={`${courseId}-${topicId}`}
        courseId={courseId}
        topicId={topicId}
      />
    </RequireAuth>
  );
}

function CourseTopicSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading lesson…</p>
      <Bone className="mb-3 h-3 w-24" />
      <Bone className="mb-6 h-8 w-64 max-w-full" />
      <Bone className="mt-4 h-4 w-full" />
      <Bone className="mt-3 h-4 w-11/12" />
      <Bone className="mt-3 h-4 w-4/5" />
      <Bone className="mt-8 mb-3 h-3 w-20" />
      <Bone className="h-4 w-3/4" />
      <div className="mt-6 space-y-2">
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-full" />
      </div>
    </div>
  );
}

function CourseTopicContent({
  courseId,
  topicId,
}: {
  courseId: string;
  topicId: string;
}) {
  const { data, error } = useApiGet<{
    topic: CourseTopicText;
    examples: CatalogExample[];
  }>(`/courses/${courseId}/topics/${topicId}`);
  const topic = data?.topic ?? null;
  const examples = data?.examples ?? [];

  if (!topic) {
    return (
      <div>
        <p>
          <Link to="/learn" className={backLinkClass}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Link>
        </p>
        {error ? <p className={errorClass}>{error}</p> : <CourseTopicSkeleton />}
      </div>
    );
  }

  const parts = paragraphs(topic.intro);

  return (
    <div>
      <p>
        <Link to="/learn" className={backLinkClass}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Link>
      </p>
      <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
        Explanation
      </p>
      <h1 className={titleClass}>{topic.title}</h1>
      {parts.length === 0 ? (
        <p className={`mt-4 ${mutedClass}`}>No explanation yet.</p>
      ) : (
        parts.map((part) =>
          part.startsWith("Example") ? (
            <div key={part} className="mt-6">
              <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                Example
              </p>
              <p className="text-base leading-7 text-ink whitespace-pre-wrap">
                {part.replace(/^Example\n?/, "").trim()}
              </p>
            </div>
          ) : (
            <p
              key={part}
              className="mt-4 text-base leading-7 text-ink whitespace-pre-wrap"
            >
              {part}
            </p>
          ),
        )
      )}
      {examples.map((example) => (
        <div key={example.id} className="mt-8">
          <WorkedExample
            problem={example}
            heading={
              example.kp_title
                ? `Worked example · ${example.kp_title}`
                : "Worked example"
            }
          />
        </div>
      ))}
    </div>
  );
}
