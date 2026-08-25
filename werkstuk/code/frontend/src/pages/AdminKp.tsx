import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  KpEditDialog,
  QuestionCreateWizard,
  QuestionEditDialog,
} from "../components/admin/flows";
import { jobFromDraft, type ProblemDraft, type ProblemJob } from "../lib/problemDraft";
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
import { kpGaps } from "../lib/adminStatus";
import { apiDelete } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import { buttonClass, inputClass, linkClass, mutedClass, textButtonClass } from "../lib/styles";
import type { AdminProblem } from "../lib/types";

type KpBody = {
  knowledge_point: {
    id: number;
    topic_id: string;
    title: string;
    sort_order: number;
  };
  topic: { id: string; title: string; course_id: string };
  counts: { examples: number; probes: number; bank: number; ready: boolean };
  problems: AdminProblem[];
};

function toDraft(problem: AdminProblem): ProblemDraft {
  return {
    prompt: problem.prompt,
    choice_a: problem.choice_a,
    choice_b: problem.choice_b,
    choice_c: problem.choice_c,
    choice_d: problem.choice_d,
    choice_e: problem.choice_e,
    correct_choice: problem.correct_choice,
    role: problem.role,
    sort_order: problem.sort_order,
    explanation: problem.explanation ?? "",
  };
}

function typeLabel(problem: AdminProblem): string {
  const job = jobFromDraft(toDraft(problem));
  if (job === "example") {
    return "Worked example";
  }
  if (job === "probe") {
    return `Placement ${problem.sort_order}`;
  }
  return `Bank ${problem.sort_order}`;
}

function nextJob(counts: KpBody["counts"]): ProblemJob {
  if (counts.examples < 1) {
    return "example";
  }
  if (counts.probes < 3) {
    return "probe";
  }
  return "bank";
}

export function AdminKpPage() {
  const { kpId } = useParams({ from: "/admin/kps/$kpId" });
  const { data, error: loadError, loading, reload } = useApiGet<KpBody>(
    `/admin/knowledge-points/${kpId}`,
  );
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editingKp, setEditingKp] = useState(false);
  const [editing, setEditing] = useState<AdminProblem | null>(null);
  const [removing, setRemoving] = useState<AdminProblem | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    let list = data?.problems ?? [];
    if (kind === "example") {
      list = list.filter((item) => item.role === "example");
    } else if (kind === "probe") {
      list = list.filter((item) => item.role === "practice" && item.sort_order < 20);
    } else if (kind === "bank") {
      list = list.filter((item) => item.role === "practice" && item.sort_order >= 20);
    }
    return filterRows(list, query, (item) => item.prompt);
  }, [data, query, kind]);

  function onDelete() {
    if (!removing) {
      return;
    }
    setBusy(true);
    setRemoveError("");
    apiDelete(`/admin/problems/${removing.id}`)
      .then(() => {
        setRemoving(null);
        reload();
      })
      .catch((error: Error) => setRemoveError(error.message))
      .finally(() => setBusy(false));
  }

  return (
    <div>
      {data ? (
        <nav className={`mb-3 flex flex-wrap gap-x-2 ${mutedClass}`}>
          <Link to="/admin" className={linkClass}>
            Courses
          </Link>
          <span>/</span>
          <Link
            to="/admin/courses/$courseId"
            params={{ courseId: data.topic.course_id }}
            className={linkClass}
          >
            {data.topic.course_id}
          </Link>
          <span>/</span>
          <Link
            to="/admin/courses/$courseId/topics/$topicId"
            params={{
              courseId: data.topic.course_id,
              topicId: data.topic.id,
            }}
            className={linkClass}
          >
            {data.topic.title}
          </Link>
          <span>/</span>
          <span>{data.knowledge_point.title}</span>
        </nav>
      ) : null}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <PageTitle>{data?.knowledge_point.title ?? "Knowledge point"}</PageTitle>
          <div className={`max-w-xl ${mutedClass}`}>
            {data ? <StatusBadge ready={data.counts.ready} /> : null}
            {data && !data.counts.ready ? (
              <span> Still needs {kpGaps(data.counts).join(", ")}.</span>
            ) : null}{" "}
            <HelpTip doc="question" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={`${textButtonClass} inline-flex items-center gap-1.5`}
            disabled={!data}
            onClick={() => setEditingKp(true)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename
          </button>
          <button type="button" className={`${buttonClass} gap-1.5`} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add question
          </button>
        </div>
      </div>
      {loadError ? <AdminAlert>{loadError}</AdminAlert> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search question text"
          aria-label="Search questions"
          className={`${inputClass} max-w-xs`}
        />
        <div className="w-full max-w-48">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Filter by question type"
          >
            <option value="all">All types</option>
            <option value="example">Worked examples</option>
            <option value="probe">Placement</option>
            <option value="bank">Bank</option>
          </Select>
        </div>
      </div>
      <AdminTable
        key={`${query}-${kind}`}
        loading={loading && !data}
        rows={rows}
        rowKey={(problem) => String(problem.id)}
        empty="No questions match. Use Add question."
        columns={[
          {
            header: "Type",
            sort: (problem) => typeLabel(problem),
            className: "w-40",
            cell: (problem) => typeLabel(problem),
          },
          {
            header: "Question",
            sort: (problem) => problem.prompt.toLowerCase(),
            cell: (problem) => (
              <span className="line-clamp-2">{problem.prompt}</span>
            ),
          },
          {
            header: "Answer",
            className: "w-20",
            cell: (problem) => problem.correct_choice,
          },
          {
            header: "Edit",
            className: "w-14 text-center",
            cell: (problem) => (
              <AdminIconButton
                label="Edit question"
                onClick={() => setEditing(problem)}
              >
                <Pencil className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
          {
            header: "Delete",
            className: "w-14 text-center",
            cell: (problem) => (
              <AdminIconButton
                label="Delete question"
                danger
                onClick={() => {
                  setRemoveError("");
                  setRemoving(problem);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </AdminIconButton>
            ),
          },
        ]}
      />
      {adding && data ? (
        <QuestionCreateWizard
          kpId={Number(kpId)}
          suggested={nextJob(data.counts)}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            reload();
          }}
        />
      ) : null}
      {editingKp && data ? (
        <KpEditDialog
          kpId={data.knowledge_point.id}
          title={data.knowledge_point.title}
          sortOrder={data.knowledge_point.sort_order}
          onClose={() => setEditingKp(false)}
          onSaved={() => {
            setEditingKp(false);
            reload();
          }}
        />
      ) : null}
      {editing ? (
        <QuestionEditDialog
          problemId={editing.id}
          draft={toDraft(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Delete this question?"
          body="Blocked if a student already answered it or it is on a quiz."
          busy={busy}
          error={removeError}
          onCancel={() => setRemoving(null)}
          onConfirm={onDelete}
        />
      ) : null}
    </div>
  );
}
