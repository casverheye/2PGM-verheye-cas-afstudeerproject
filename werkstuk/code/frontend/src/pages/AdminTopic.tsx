import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import {
  EdgeCreateWizard,
  KpCreateWizard,
  KpEditDialog,
  TopicEditDialog,
} from "../components/admin/flows";
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
import { kpGaps } from "../lib/adminStatus";
import { apiDelete } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { buttonClass, inputClass, linkClass, mutedClass, textButtonClass } from "../lib/styles";
import type { AdminChecklist, AdminChecklistKp } from "../lib/types";

type TopicBody = {
  topic: { id: string; title: string; course_id: string; intro: string };
  course: { id: string; title: string };
  checklist: AdminChecklist;
  knowledge_points: AdminChecklistKp[];
  edges: {
    id: number;
    from_topic_id: string;
    to_topic_id: string;
    kind: string;
    weight: number | null;
  }[];
  all_topics: {
    id: string;
    title: string;
    course_id: string | null;
    course_title: string | null;
  }[];
};

function titleOf(
  id: string,
  topicId: string,
  topicTitle: string,
  others: TopicBody["all_topics"],
) {
  if (id === topicId) {
    return topicTitle;
  }
  return others.find((topic) => topic.id === id)?.title ?? id;
}

export function AdminTopicPage() {
  const { courseId, topicId } = useParams({
    from: "/admin/courses/$courseId/topics/$topicId",
  });
  const navigate = useNavigate();
  const { data, error: loadError, loading, reload } = useApiGet<TopicBody>(
    `/admin/topics/${topicId}`,
  );
  const [query, setQuery] = useState("");
  const [addingKp, setAddingKp] = useState(false);
  const [addingEdge, setAddingEdge] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [editingKp, setEditingKp] = useState<AdminChecklistKp | null>(null);
  const [removingKp, setRemovingKp] = useState<AdminChecklistKp | null>(null);
  const [removingEdge, setRemovingEdge] = useState<TopicBody["edges"][number] | null>(
    null,
  );
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);

  const kps = useMemo(
    () =>
      filterRows(data?.knowledge_points ?? [], query, (kp) => kp.title),
    [data, query],
  );

  const others =
    data?.all_topics.filter((topic) => topic.id !== topicId) ?? [];

  function deleteKp() {
    if (!removingKp) {
      return;
    }
    setBusy(true);
    setRemoveError("");
    apiDelete(`/admin/knowledge-points/${removingKp.id}`)
      .then(() => {
        setRemovingKp(null);
        reload();
      })
      .catch((error: Error) => setRemoveError(error.message))
      .finally(() => setBusy(false));
  }

  function deleteEdge() {
    if (!removingEdge) {
      return;
    }
    setBusy(true);
    setRemoveError("");
    apiDelete(`/admin/edges/${removingEdge.id}`)
      .then(() => {
        setRemovingEdge(null);
        reload();
      })
      .catch((error: Error) => setRemoveError(error.message))
      .finally(() => setBusy(false));
  }

  const check = data?.checklist;

  return (
    <div>
      <nav className={`mb-3 flex flex-wrap gap-x-2 ${mutedClass}`}>
        <Link to="/admin" className={linkClass}>
          Courses
        </Link>
        <span>/</span>
        <Link
          to="/admin/courses/$courseId"
          params={{ courseId }}
          className={linkClass}
        >
          {data?.course.title ?? "Course"}
        </Link>
        <span>/</span>
        <span>{data?.topic.title ?? topicId}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>{data?.topic.title ?? "Topic"}</PageTitle>
          <div className={`max-w-xl ${mutedClass}`}>
            {check ? (
              <StatusBadge ready={check.teachable} />
            ) : null}{" "}
            Knowledge points are skills. Arrows tell the engine what must come first.{" "}
            <HelpTip doc="ready" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={`${textButtonClass} inline-flex items-center gap-1.5`}
            onClick={() => setEditingTopic(true)}
            disabled={!data}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit intro
          </button>
          <button
            type="button"
            className={`${buttonClass} gap-1.5`}
            onClick={() => setAddingKp(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add knowledge point
          </button>
        </div>
      </div>
      {loadError ? <AdminAlert>{loadError}</AdminAlert> : null}
      <h2 className="mb-2 text-lg font-semibold text-navy">Knowledge points</h2>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search skills"
        aria-label="Search knowledge points"
        className={`${inputClass} mb-3 max-w-xs`}
      />
      <AdminTable
        key={query}
        loading={loading && !data}
        rows={kps}
        rowKey={(kp) => String(kp.id)}
        empty="No knowledge points yet. Use Add knowledge point."
        columns={[
          {
            header: "Skill",
            sort: (kp) => kp.title.toLowerCase(),
            cell: (kp) => kp.title,
          },
          {
            header: "Order",
            sort: (kp) => kp.sort_order,
            className: "w-20",
            cell: (kp) => kp.sort_order,
          },
          {
            header: "Questions",
            cell: (kp) =>
              `ex ${kp.examples} · place ${kp.probes}/3 · bank ${kp.bank}`,
          },
          {
            header: "Status",
            sort: (kp) => (kp.ready ? 1 : 0),
            cell: (kp) => (
              <span>
                <StatusBadge ready={kp.ready} />
                {kp.ready ? null : (
                  <span className={`ml-2 ${mutedClass}`}>{kpGaps(kp).join(", ")}</span>
                )}
              </span>
            ),
          },
          {
            header: "View",
            className: "w-14 text-center",
            cell: (kp) => (
              <AdminIconButton
                label="Open knowledge point"
                onClick={() =>
                  void navigate({
                    to: "/admin/kps/$kpId",
                    params: { kpId: String(kp.id) },
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
            cell: (kp) => (
              <AdminIconButton
                label="Rename knowledge point"
                onClick={() => setEditingKp(kp)}
              >
                <Pencil className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
          {
            header: "Delete",
            className: "w-14 text-center",
            cell: (kp) => (
              <AdminIconButton
                label="Delete knowledge point"
                danger
                onClick={() => {
                  setRemoveError("");
                  setRemovingKp(kp);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
        ]}
      />
      <div className="mt-10 mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-navy">Graph arrows</h2>
          <div className={mutedClass}>
            Prerequisites and encompassing links. <HelpTip doc="prerequisite" />
          </div>
        </div>
        <button
          type="button"
          className={`${buttonClass} gap-1.5`}
          onClick={() => setAddingEdge(true)}
          disabled={others.length === 0}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add arrow
        </button>
      </div>
      <AdminTable
        loading={loading && !data}
        rows={data?.edges ?? []}
        rowKey={(edge) => String(edge.id)}
        empty="No arrows. This topic has no prerequisites."
        columns={[
          {
            header: "Kind",
            sort: (edge) => edge.kind,
            cell: (edge) => edge.kind,
          },
          {
            header: "Meaning",
            cell: (edge) => {
              const from = titleOf(
                edge.from_topic_id,
                topicId,
                data?.topic.title ?? topicId,
                data?.all_topics ?? [],
              );
              const to = titleOf(
                edge.to_topic_id,
                topicId,
                data?.topic.title ?? topicId,
                data?.all_topics ?? [],
              );
              if (edge.kind === "prerequisite") {
                return `Finish ${from} before ${to}`;
              }
              return `${from} also practices ${to}${edge.weight != null ? ` (${edge.weight})` : ""}`;
            },
          },
          {
            header: "Delete",
            className: "w-14 text-center",
            cell: (edge) => (
              <AdminIconButton
                label="Remove arrow"
                danger
                onClick={() => {
                  setRemoveError("");
                  setRemovingEdge(edge);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
        ]}
      />
      {addingKp ? (
        <KpCreateWizard
          topicId={topicId}
          onClose={() => setAddingKp(false)}
          onCreated={(id) => {
            setAddingKp(false);
            void navigate({ to: "/admin/kps/$kpId", params: { kpId: String(id) } });
          }}
        />
      ) : null}
      {addingEdge && data ? (
        <EdgeCreateWizard
          topicId={topicId}
          others={others}
          onClose={() => setAddingEdge(false)}
          onCreated={() => {
            setAddingEdge(false);
            reload();
          }}
        />
      ) : null}
      {editingTopic && data ? (
        <TopicEditDialog
          topicId={topicId}
          title={data.topic.title}
          intro={data.topic.intro}
          onClose={() => setEditingTopic(false)}
          onSaved={() => {
            setEditingTopic(false);
            reload();
          }}
        />
      ) : null}
      {editingKp ? (
        <KpEditDialog
          kpId={editingKp.id}
          title={editingKp.title}
          sortOrder={editingKp.sort_order}
          onClose={() => setEditingKp(null)}
          onSaved={() => {
            setEditingKp(null);
            reload();
          }}
        />
      ) : null}
      {removingKp ? (
        <ConfirmDialog
          title={`Delete ${removingKp.title}?`}
          body="Deletes this skill and its questions. Blocked if students already have progress on it."
          busy={busy}
          error={removeError}
          onCancel={() => setRemovingKp(null)}
          onConfirm={deleteKp}
        />
      ) : null}
      {removingEdge ? (
        <ConfirmDialog
          title="Remove this arrow?"
          body="Only the link is deleted. Both topics stay in the catalog."
          confirmLabel="Remove"
          busy={busy}
          error={removeError}
          onCancel={() => setRemovingEdge(null)}
          onConfirm={deleteEdge}
        />
      ) : null}
    </div>
  );
}
