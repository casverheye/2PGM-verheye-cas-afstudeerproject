import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { CourseEditDialog, TopicCreateWizard, TopicEditDialog } from "../components/admin/flows";
import { AdminTable } from "../components/admin/table";
import { filterRows } from "../lib/filterRows";
import {
  AdminAlert,
  AdminIconButton,
  ConfirmDialog,
  HelpTip,
  StatusBadge,
} from "../components/admin/ui";
import { PageTitle } from "../components/PageFrame";
import { Select } from "../components/Select";
import { topicGaps } from "../lib/adminStatus";
import { apiDelete, apiPatch } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { buttonClass, inputClass, linkClass, mutedClass, textButtonClass } from "../lib/styles";
import type { AdminChecklist } from "../lib/types";

type TopicRow = {
  id: string;
  title: string;
  intro: string;
  teachable: boolean;
  checklist: AdminChecklist;
};

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  listed: boolean;
  in_use: boolean;
};

export function AdminCoursePage() {
  const { courseId } = useParams({ from: "/admin/courses/$courseId" });
  const navigate = useNavigate();
  const { data, error: loadError, loading, reload } = useApiGet<{
    course: CourseRow;
    topics: TopicRow[];
  }>(`/admin/courses/${courseId}`);
  const course = data?.course ?? null;
  const topics = useMemo(() => data?.topics ?? [], [data]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TopicRow | null>(null);
  const [editingCourse, setEditingCourse] = useState(false);
  const [removing, setRemoving] = useState<TopicRow | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const searched = filterRows(topics, query, (topic) => `${topic.title} ${topic.id}`);
    if (status === "ready") {
      return searched.filter((topic) => topic.teachable);
    }
    if (status === "incomplete") {
      return searched.filter((topic) => !topic.teachable);
    }
    return searched;
  }, [topics, query, status]);

  function onDelete() {
    if (!removing) {
      return;
    }
    setBusy(true);
    setRemoveError("");
    apiDelete(`/admin/topics/${removing.id}`)
      .then(() => {
        setRemoving(null);
        reload();
      })
      .catch((error: Error) => setRemoveError(error.message))
      .finally(() => setBusy(false));
  }

  return (
    <div>
      <nav className={`mb-3 flex flex-wrap gap-x-2 ${mutedClass}`}>
        <Link to="/admin" className={linkClass}>
          Courses
        </Link>
        <span>/</span>
        <span>{course?.title ?? courseId}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>{course?.title ?? "Course"}</PageTitle>
          <div className={`max-w-xl ${mutedClass}`}>
            Topics in this course. Use the eye icon to manage knowledge points and graph arrows.{" "}
            <HelpTip doc="topic" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {course ? (
            <button
              type="button"
              className={textButtonClass}
              disabled={busy || (course.listed && course.in_use)}
              title={
                course.listed && course.in_use
                  ? "This course is already in use, so it cannot be hidden."
                  : undefined
              }
              onClick={() => {
                setBusy(true);
                apiPatch(`/admin/courses/${course.id}`, { listed: !course.listed })
                  .then(() => reload())
                  .catch((error: Error) => setMessage(error.message))
                  .finally(() => setBusy(false));
              }}
            >
              {course.listed ? "Hide from students" : "Show to students"}
            </button>
          ) : null}
          <button
            type="button"
            className={`${textButtonClass} inline-flex items-center gap-1.5`}
            onClick={() => setEditingCourse(true)}
            disabled={!course}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Course details
          </button>
          <button type="button" className={`${buttonClass} gap-1.5`} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add topic
          </button>
        </div>
      </div>
      {message || loadError ? (
        <AdminAlert>{message || loadError}</AdminAlert>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics"
          aria-label="Search topics"
          className={`${inputClass} max-w-xs`}
        />
        <div className="w-full max-w-40">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="incomplete">Incomplete</option>
          </Select>
        </div>
      </div>
      <AdminTable
        key={`${query}-${status}`}
        loading={loading && !data}
        rows={rows}
        rowKey={(topic) => topic.id}
        empty="No topics yet. Use Add topic."
        columns={[
          {
            header: "Topic",
            sort: (topic) => topic.title.toLowerCase(),
            cell: (topic) => (
              <div>
                <p className="font-medium text-navy">{topic.title}</p>
                <p className={mutedClass}>{topic.id}</p>
              </div>
            ),
          },
          {
            header: "Skills",
            sort: (topic) => topic.checklist.kps.length,
            cell: (topic) =>
              `${topic.checklist.kps.filter((kp) => kp.ready).length}/${topic.checklist.kps.length} ready`,
          },
          {
            header: "Status",
            sort: (topic) => (topic.teachable ? 1 : 0),
            cell: (topic) => (
              <span>
                <StatusBadge ready={topic.teachable} />
                {topic.teachable ? null : (
                  <span className={`ml-2 ${mutedClass}`}>
                    {topicGaps(topic.checklist)[0] ?? ""}
                  </span>
                )}
              </span>
            ),
          },
          {
            header: "View",
            className: "w-14 text-center",
            cell: (topic) => (
              <AdminIconButton
                label="Open topic"
                onClick={() =>
                  void navigate({
                    to: "/admin/courses/$courseId/topics/$topicId",
                    params: { courseId, topicId: topic.id },
                  })
                }
              >
                <Eye className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
          {
            header: "Edit",
            className: "w-14 text-center",
            cell: (topic) => (
              <AdminIconButton
                label="Edit topic text"
                onClick={() => setEditing(topic)}
              >
                <Pencil className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
          {
            header: "Delete",
            className: "w-14 text-center",
            cell: (topic) => (
              <AdminIconButton
                label="Delete topic"
                danger
                onClick={() => {
                  setRemoveError("");
                  setRemoving(topic);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
        ]}
      />
      {editingCourse && course ? (
        <CourseEditDialog
          courseId={course.id}
          title={course.title}
          description={course.description ?? ""}
          sortOrder={course.sort_order}
          listed={course.listed}
          inUse={course.in_use}
          onClose={() => setEditingCourse(false)}
          onSaved={() => {
            setEditingCourse(false);
            reload();
          }}
        />
      ) : null}
      {adding ? (
        <TopicCreateWizard
          courseId={courseId}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            void navigate({
              to: "/admin/courses/$courseId/topics/$topicId",
              params: { courseId, topicId: id },
            });
          }}
        />
      ) : null}
      {editing ? (
        <TopicEditDialog
          topicId={editing.id}
          title={editing.title}
          intro={editing.intro}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.title}?`}
          body="Deletes this topic and unused knowledge points. Blocked if students already have progress. Graph arrows to this topic are removed."
          busy={busy}
          error={removeError}
          onCancel={() => setRemoving(null)}
          onConfirm={onDelete}
        />
      ) : null}
    </div>
  );
}
