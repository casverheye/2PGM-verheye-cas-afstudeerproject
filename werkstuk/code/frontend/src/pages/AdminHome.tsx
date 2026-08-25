import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { CourseCreateWizard, CourseEditDialog } from "../components/admin/flows";
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
import { apiDelete, apiGet, apiPatch } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { buttonClass, cx, inputClass, mutedClass } from "../lib/styles";
import type { AdminCourseListItem } from "../lib/types";

export function AdminHomePage() {
  const navigate = useNavigate();
  const { data, setData, error: loadError, loading, reload } = useApiGet<{
    courses: AdminCourseListItem[];
  }>("/admin/courses");
  const courses = useMemo(() => data?.courses ?? [], [data]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminCourseListItem | null>(null);
  const [removing, setRemoving] = useState<AdminCourseListItem | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [deleteBlock, setDeleteBlock] = useState<string | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const searched = filterRows(
      courses,
      query,
      (course) => `${course.title} ${course.id} ${course.description ?? ""}`,
    );
    if (status === "ready") {
      return searched.filter(
        (course) => course.topic_count > 0 && course.teachable_count === course.topic_count,
      );
    }
    if (status === "incomplete") {
      return searched.filter(
        (course) => course.topic_count === 0 || course.teachable_count < course.topic_count,
      );
    }
    return searched;
  }, [courses, query, status]);

  function onDelete() {
    if (!removing) {
      return;
    }
    setBusy(true);
    setRemoveError("");
    apiDelete(`/admin/courses/${removing.id}`)
      .then(() => {
        const id = removing.id;
        // Drop the row locally so it disappears without a refetch.
        setData((current) =>
          current
            ? { courses: current.courses.filter((row) => row.id !== id) }
            : current,
        );
        setRemoving(null);
        setDeleteBlock(null);
      })
      .catch((error: Error) => setDeleteBlock(error.message))
      .finally(() => setBusy(false));
  }

  function closeRemove() {
    setRemoving(null);
    setDeleteBlock(null);
    setRemoveError("");
    setCheckingDelete(false);
  }

  function askDelete(course: AdminCourseListItem) {
    setRemoving(course);
    setDeleteBlock(null);
    setRemoveError("");
    setCheckingDelete(true);
    apiGet<{ blocked: string | null }>(`/admin/courses/${course.id}/delete-check`)
      .then((body) => setDeleteBlock(body.blocked))
      .catch((error: Error) => setRemoveError(error.message))
      .finally(() => setCheckingDelete(false));
  }

  function toggleListed(course: AdminCourseListItem) {
    setTogglingId(course.id);
    setMessage("");
    apiPatch(`/admin/courses/${course.id}`, { listed: !course.listed })
      .then(() => reload())
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setTogglingId(null));
  }

  const listingBusy = togglingId != null;

  return (
    <div className="relative" aria-busy={listingBusy}>
      {listingBusy ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/55">
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-navy">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Saving listing…
          </p>
        </div>
      ) : null}
      <div className={cx(listingBusy && "pointer-events-none")}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>Courses</PageTitle>
          <div className={`max-w-xl ${mutedClass}`}>
            Content tree for Learn. Lessons, reviews, and quizzes are built by the engine from
            the questions you add.{" "}
            <HelpTip doc="catalog" />
          </div>
        </div>
        <button type="button" className={`${buttonClass} gap-1.5`} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add course
        </button>
      </div>
      {message || loadError ? (
        <AdminAlert>{message || loadError}</AdminAlert>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title or id"
          aria-label="Search courses"
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
        rowKey={(course) => course.id}
        empty="No courses match. Use Add course to create the first one."
        columns={[
          {
            header: "Listed",
            sort: (course) => (course.listed ? 1 : 0),
            className: "w-16",
            cell: (course) => {
              const lockHide = course.listed && course.in_use;
              return (
              <input
                type="checkbox"
                checked={course.listed}
                disabled={listingBusy || lockHide}
                title={
                  lockHide
                    ? "This course is already in use, so it cannot be hidden."
                    : undefined
                }
                aria-label={
                  lockHide
                    ? `${course.title} is in use and cannot be hidden`
                    : course.listed
                      ? `Hide ${course.title} from students`
                      : `Show ${course.title} to students`
                }
                onChange={() => toggleListed(course)}
              />
              );
            },
          },
          {
            header: "Course",
            sort: (course) => course.title.toLowerCase(),
            cell: (course) => (
              <div>
                <p className="font-medium text-navy">{course.title}</p>
                <p className={mutedClass}>{course.id}</p>
              </div>
            ),
          },
          {
            header: "Topics",
            sort: (course) => course.topic_count,
            cell: (course) =>
              `${course.teachable_count}/${course.topic_count} ready`,
          },
          {
            header: "Status",
            sort: (course) =>
              course.topic_count > 0 && course.teachable_count === course.topic_count
                ? 1
                : 0,
            cell: (course) => (
              <StatusBadge
                ready={
                  course.topic_count > 0 && course.teachable_count === course.topic_count
                }
              />
            ),
          },
          {
            header: "Order",
            sort: (course) => course.sort_order,
            className: "w-20",
            cell: (course) => course.sort_order,
          },
          {
            header: "View",
            className: "w-14 text-center",
            cell: (course) => (
              <AdminIconButton
                label="Open course"
                onClick={() =>
                  void navigate({
                    to: "/admin/courses/$courseId",
                    params: { courseId: course.id },
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
            cell: (course) => (
              <AdminIconButton
                label="Edit course details"
                onClick={() => setEditing(course)}
              >
                <Pencil className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
          {
            header: "Delete",
            className: "w-14 text-center",
            cell: (course) => (
              <AdminIconButton
                label="Delete course"
                danger
                onClick={() => askDelete(course)}
              >
                <Trash2 className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
        ]}
      />
      {adding ? (
        <CourseCreateWizard
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            void navigate({ to: "/admin/courses/$courseId", params: { courseId: id } });
          }}
        />
      ) : null}
      {editing ? (
        <CourseEditDialog
          courseId={editing.id}
          title={editing.title}
          description={editing.description ?? ""}
          sortOrder={editing.sort_order}
          listed={editing.listed}
          inUse={editing.in_use}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={
            deleteBlock
              ? `Can't delete ${removing.title}`
              : `Delete ${removing.title}?`
          }
          body={
            checkingDelete
              ? "Checking whether this course can be deleted…"
              : deleteBlock
                ? "This course is already in use, so it cannot be deleted."
                : "Deletes this course and unused topics. This cannot be undone in the app."
          }
          busy={busy}
          error={removeError}
          onCancel={closeRemove}
          onConfirm={
            !checkingDelete && !deleteBlock && !removeError ? onDelete : undefined
          }
        />
      ) : null}
    </div>
    </div>
  );
}
