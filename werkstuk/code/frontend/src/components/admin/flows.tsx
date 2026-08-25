import { useState, type ChangeEvent } from "react";
import {
  AdminProblemFields,
  ProblemContentFields,
  ProblemJobFields,
} from "../AdminProblemFields";
import {
  emptyDraftForJob,
  jobFromDraft,
  type ProblemDraft,
  type ProblemJob,
} from "../../lib/problemDraft";
import { Select } from "../Select";
import { SLUG_PATTERN, suggestSlug } from "../../lib/adminDocs";
import { apiPatch, apiPost } from "../../lib/api";
import { inputClass, mutedClass } from "../../lib/styles";
import { CHOICE_LETTERS } from "../../lib/types";
import { AdminDialog, AdminField, WizardFrame } from "./ui";

type TopicOption = { id: string; title: string; course_title: string | null };

export function CourseCreateWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function setTitleAndMaybeId(value: string) {
    setTitle(value);
    if (!idTouched) {
      setId(suggestSlug(value));
    }
  }

  function next() {
    setError("");
    if (step === 1) {
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }
      if (!SLUG_PATTERN.test(id.trim())) {
        setError("Id must start with a letter, then letters, numbers, or underscore.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    setBusy(true);
    apiPost<{ course: { id: string } }>("/admin/courses", {
      id: id.trim(),
      title: title.trim(),
      description: description.trim() || null,
      sort_order: Number(sortOrder) || 1,
    })
      .then((body) => onCreated(body.course.id))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Add course"
      step={step}
      stepCount={3}
      stepLabel={step === 1 ? "Identity" : step === 2 ? "Details" : "Review"}
      error={error}
      busy={busy}
      onClose={onClose}
      onBack={step > 1 ? () => setStep((value) => value - 1) : undefined}
      onNext={next}
      nextLabel={step === 3 ? "Create course" : "Continue"}
      unsaved={
        title.trim() !== "" ||
        id.trim() !== "" ||
        description.trim() !== "" ||
        sortOrder !== "1" ||
        step > 1
      }
    >
      {step === 1 ? (
        <>
          <AdminField
            label="Title"
            required
            help="course"
            hint="What students see in the Courses menu. Example: Arithmetic."
          >
            <input
              value={title}
              onChange={(event) => setTitleAndMaybeId(event.target.value)}
              className={inputClass}
              required
            />
          </AdminField>
          <AdminField
            label="Id"
            required
            help="slug"
            hint="Permanent URL key. You cannot change this later."
          >
            <input
              value={id}
              onChange={(event) => {
                setIdTouched(true);
                setId(event.target.value);
              }}
              className={inputClass}
              required
            />
          </AdminField>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <AdminField
            label="Description"
            hint="Optional short blurb under the course name. Leave blank if you do not need it."
          >
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={inputClass}
            />
          </AdminField>
          <AdminField
            label="List position"
            hint="Smaller number appears first. Use 1, 2, 3…"
          >
            <input
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className={inputClass}
            />
          </AdminField>
        </>
      ) : null}
      {step === 3 ? (
        <dl className={`space-y-2 ${mutedClass}`}>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Title</dt>
            <dd className="text-ink">{title.trim()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Id</dt>
            <dd className="text-ink">{id.trim()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Description</dt>
            <dd className="text-ink">{description.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">List position</dt>
            <dd className="text-ink">{sortOrder || "1"}</dd>
          </div>
        </dl>
      ) : null}
    </WizardFrame>
  );
}

export function CourseEditDialog({
  courseId,
  title: savedTitle,
  description: savedDescription,
  sortOrder: savedSort,
  listed: savedListed,
  inUse,
  onClose,
  onSaved,
}: {
  courseId: string;
  title: string;
  description: string;
  sortOrder: number;
  listed: boolean;
  inUse: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(savedTitle);
  const [description, setDescription] = useState(savedDescription);
  const [sortOrder, setSortOrder] = useState(String(savedSort));
  const [listed, setListed] = useState(savedListed);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    apiPatch(`/admin/courses/${courseId}`, {
      title: title.trim(),
      description: description.trim() || null,
      sort_order: Number(sortOrder) || 1,
      listed,
    })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Edit course"
      step={1}
      stepCount={1}
      stepLabel="Student-facing details. Id stays locked."
      error={error}
      busy={busy}
      onClose={onClose}
      onNext={save}
      nextLabel="Save changes"
      unsaved={
        title !== savedTitle ||
        description !== savedDescription ||
        sortOrder !== String(savedSort) ||
        listed !== savedListed
      }
    >
      <p className={`mb-4 ${mutedClass}`}>
        Id <span className="text-ink">{courseId}</span> cannot change. Renaming the title does not
        break student progress.
      </p>
      <AdminField label="Title" required hint="Shown in Courses and Learn.">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          required
        />
      </AdminField>
      <AdminField label="Description" hint="Optional.">
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={inputClass}
        />
      </AdminField>
      <AdminField label="List position">
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          className={inputClass}
        />
      </AdminField>
      <AdminField
        label="Show to students"
        help="course"
        hint={
          inUse && savedListed
            ? "This course is already in use, so it cannot be hidden."
            : "Off hides this course from Courses, /graph, and Learn. Admin still sees it."
        }
      >
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={listed}
            disabled={inUse && savedListed}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setListed(event.target.checked)
            }
          />
          Listed
        </label>
      </AdminField>
    </WizardFrame>
  );
}

export function TopicCreateWizard({
  courseId,
  onClose,
  onCreated,
}: {
  courseId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [intro, setIntro] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function next() {
    setError("");
    if (step === 1) {
      if (!title.trim()) {
        setError("Title is required.");
        return;
      }
      if (!SLUG_PATTERN.test(id.trim())) {
        setError("Id must start with a letter, then letters, numbers, or underscore.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    setBusy(true);
    apiPost<{ topic: { id: string } }>(`/admin/courses/${courseId}/topics`, {
      id: id.trim(),
      title: title.trim(),
      intro,
    })
      .then((body) => onCreated(body.topic.id))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Add topic"
      step={step}
      stepCount={3}
      stepLabel={step === 1 ? "Identity" : step === 2 ? "Intro" : "Review"}
      error={error}
      busy={busy}
      onClose={onClose}
      onBack={step > 1 ? () => setStep((value) => value - 1) : undefined}
      onNext={next}
      nextLabel={step === 3 ? "Create topic" : "Continue"}
      unsaved={
        title.trim() !== "" || id.trim() !== "" || intro.trim() !== "" || step > 1
      }
    >
      {step === 1 ? (
        <>
          <AdminField
            label="Title"
            required
            help="topic"
            hint="Shown on the graph and in Courses. Example: Addition."
          >
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!idTouched) {
                  setId(suggestSlug(event.target.value));
                }
              }}
              className={inputClass}
              required
            />
          </AdminField>
          <AdminField label="Id" required help="slug">
            <input
              value={id}
              onChange={(event) => {
                setIdTouched(true);
                setId(event.target.value);
              }}
              className={inputClass}
              required
            />
          </AdminField>
        </>
      ) : null}
      {step === 2 ? (
        <AdminField
          label="Intro"
          help="topic"
          hint="Catalog text students read on the topic page. Not a lesson. You can leave this empty and fill it later; the topic stays Incomplete until you do."
        >
          <textarea
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            rows={8}
            className={inputClass}
          />
        </AdminField>
      ) : null}
      {step === 3 ? (
        <dl className={`space-y-2 ${mutedClass}`}>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Title</dt>
            <dd className="text-ink">{title.trim()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Id</dt>
            <dd className="text-ink">{id.trim()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Intro</dt>
            <dd className="text-ink">
              {intro.trim() ? `${intro.trim().slice(0, 160)}${intro.trim().length > 160 ? "…" : ""}` : "Empty (Incomplete until filled)"}
            </dd>
          </div>
        </dl>
      ) : null}
    </WizardFrame>
  );
}

export function TopicEditDialog({
  topicId,
  title: savedTitle,
  intro: savedIntro,
  onClose,
  onSaved,
}: {
  topicId: string;
  title: string;
  intro: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(savedTitle);
  const [intro, setIntro] = useState(savedIntro);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    apiPatch(`/admin/topics/${topicId}`, { title: title.trim(), intro })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Edit topic"
      step={1}
      stepCount={1}
      stepLabel="Teaching text. Id stays locked."
      error={error}
      busy={busy}
      onClose={onClose}
      onNext={save}
      nextLabel="Save changes"
      unsaved={title !== savedTitle || intro !== savedIntro}
    >
      <p className={`mb-4 ${mutedClass}`}>
        Id <span className="text-ink">{topicId}</span> cannot change. Clearing the intro makes the
        topic Incomplete; Learn will not teach it until the intro is back.
      </p>
      <AdminField label="Title" required>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          required
        />
      </AdminField>
      <AdminField label="Intro" help="topic">
        <textarea
          value={intro}
          onChange={(event) => setIntro(event.target.value)}
          rows={8}
          className={inputClass}
        />
      </AdminField>
    </WizardFrame>
  );
}

export function KpCreateWizard({
  topicId,
  onClose,
  onCreated,
}: {
  topicId: string;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function next() {
    setError("");
    if (step === 1) {
      if (!title.trim()) {
        setError("Name is required.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    setBusy(true);
    apiPost<{ knowledge_point: { id: number } }>(
      `/admin/topics/${topicId}/knowledge-points`,
      { title: title.trim(), sort_order: Number(sortOrder) || 1 },
    )
      .then((body) => onCreated(body.knowledge_point.id))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Add knowledge point"
      step={step}
      stepCount={3}
      stepLabel={step === 1 ? "Skill name" : step === 2 ? "Order" : "Review"}
      error={error}
      busy={busy}
      onClose={onClose}
      onBack={step > 1 ? () => setStep((value) => value - 1) : undefined}
      onNext={next}
      nextLabel={step === 3 ? "Create knowledge point" : "Continue"}
      unsaved={title.trim() !== "" || sortOrder !== "1" || step > 1}
    >
      {step === 1 ? (
        <AdminField
          label="Name"
          required
          help="knowledgePoint"
          hint="One skill the engine tracks. Example: Add two-digit numbers without regrouping."
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
            required
          />
        </AdminField>
      ) : null}
      {step === 2 ? (
        <AdminField
          label="Order in the topic"
          hint="Smaller number is taught first. Use 1, 2, 3…"
        >
          <input
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className={inputClass}
          />
        </AdminField>
      ) : null}
      {step === 3 ? (
        <dl className={`space-y-2 ${mutedClass}`}>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Name</dt>
            <dd className="text-ink">{title.trim()}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide">Order</dt>
            <dd className="text-ink">{sortOrder || "1"}</dd>
          </div>
          <p>Next: open it and add 1 example, 3 placement questions, and 1 bank question.</p>
        </dl>
      ) : null}
    </WizardFrame>
  );
}

export function KpEditDialog({
  kpId,
  title: savedTitle,
  sortOrder: savedSort,
  onClose,
  onSaved,
}: {
  kpId: number;
  title: string;
  sortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(savedTitle);
  const [sortOrder, setSortOrder] = useState(String(savedSort));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function save() {
    if (!title.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    apiPatch(`/admin/knowledge-points/${kpId}`, {
      title: title.trim(),
      sort_order: Number(sortOrder) || 1,
    })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Edit knowledge point"
      step={1}
      stepCount={1}
      stepLabel="Name and order. Questions are edited in the table."
      error={error}
      busy={busy}
      onClose={onClose}
      onNext={save}
      nextLabel="Save changes"
      unsaved={title !== savedTitle || sortOrder !== String(savedSort)}
    >
      <AdminField label="Name" required>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={inputClass}
          required
        />
      </AdminField>
      <AdminField label="Order in the topic">
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          className={inputClass}
        />
      </AdminField>
    </WizardFrame>
  );
}

export function QuestionCreateWizard({
  kpId,
  suggested,
  onClose,
  onCreated,
}: {
  kpId: number;
  suggested: ProblemJob;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProblemDraft>(emptyDraftForJob(suggested));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const job = jobFromDraft(draft);

  function next() {
    setError("");
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!draft.prompt.trim()) {
        setError("Question text is required.");
        return;
      }
      for (const letter of CHOICE_LETTERS) {
        if (!draft[`choice_${letter}`].trim()) {
          setError(`Choice ${letter} is required.`);
          return;
        }
      }
      setStep(3);
      return;
    }
    setBusy(true);
    apiPost("/admin/problems", {
      knowledge_point_id: kpId,
      prompt: draft.prompt.trim(),
      choice_a: draft.choice_a.trim(),
      choice_b: draft.choice_b.trim(),
      choice_c: draft.choice_c.trim(),
      choice_d: draft.choice_d.trim(),
      choice_e: draft.choice_e.trim(),
      correct_choice: draft.correct_choice,
      role: draft.role,
      sort_order: draft.sort_order,
      explanation: draft.explanation.trim() || null,
    })
      .then(onCreated)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Add question"
      step={step}
      stepCount={3}
      stepLabel={step === 1 ? "Purpose" : step === 2 ? "Content" : "Review"}
      error={error}
      busy={busy}
      onClose={onClose}
      onBack={step > 1 ? () => setStep((value) => value - 1) : undefined}
      onNext={next}
      nextLabel={step === 3 ? "Create question" : "Continue"}
      unsaved={
        step > 1 ||
        draft.prompt.trim() !== "" ||
        draft.choice_a.trim() !== "" ||
        draft.choice_b.trim() !== "" ||
        draft.choice_c.trim() !== "" ||
        draft.choice_d.trim() !== "" ||
        draft.choice_e.trim() !== "" ||
        draft.explanation.trim() !== ""
      }
    >
      {step === 1 ? <ProblemJobFields value={draft} onChange={setDraft} /> : null}
      {step === 2 ? <ProblemContentFields value={draft} onChange={setDraft} /> : null}
      {step === 3 ? (
        <>
          <AdminField label="Explanation" hint="Optional. Useful on worked examples.">
            <textarea
              value={draft.explanation}
              onChange={(event) =>
                setDraft({ ...draft, explanation: event.target.value })
              }
              rows={3}
              className={inputClass}
            />
          </AdminField>
          <p className={mutedClass}>
            {job === "example"
              ? "Worked example"
              : job === "probe"
                ? `Placement question ${draft.sort_order} of 3`
                : `Bank item (order ${draft.sort_order})`}
            . Correct answer: {draft.correct_choice}.
          </p>
        </>
      ) : null}
    </WizardFrame>
  );
}

export function QuestionEditDialog({
  problemId,
  draft: saved,
  onClose,
  onSaved,
}: {
  problemId: number;
  draft: ProblemDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    apiPatch(`/admin/problems/${problemId}`, {
      prompt: draft.prompt.trim(),
      choice_a: draft.choice_a.trim(),
      choice_b: draft.choice_b.trim(),
      choice_c: draft.choice_c.trim(),
      choice_d: draft.choice_d.trim(),
      choice_e: draft.choice_e.trim(),
      correct_choice: draft.correct_choice,
      role: draft.role,
      sort_order: draft.sort_order,
      explanation: draft.explanation.trim() || null,
    })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <AdminDialog
      title="Edit question"
      onClose={onClose}
      wide
      unsaved={JSON.stringify(draft) !== JSON.stringify(saved)}
      locked={busy}
    >
      <p className={`mb-4 ${mutedClass}`}>
        Changing type or bank order can change whether this item is used in placement or in
        lessons. Students who already answered it cannot have this row deleted later.
      </p>
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <AdminProblemFields
        value={draft}
        onChange={setDraft}
        submitLabel="Save changes"
        saving={busy}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      />
    </AdminDialog>
  );
}

export function EdgeCreateWizard({
  topicId,
  others,
  onClose,
  onCreated,
}: {
  topicId: string;
  others: TopicOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState("prerequisite");
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const [weight, setWeight] = useState("0.3");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const otherTitle = others.find((item) => item.id === otherId)?.title ?? otherId;

  function next() {
    setError("");
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!otherId) {
        setError("Pick the other topic.");
        return;
      }
      setStep(3);
      return;
    }
    const payload =
      kind === "prerequisite"
        ? {
            from_topic_id: otherId,
            to_topic_id: topicId,
            kind: "prerequisite",
            weight: 1,
          }
        : {
            from_topic_id: topicId,
            to_topic_id: otherId,
            kind: "encompassing",
            weight: Number(weight) || 0.3,
          };
    setBusy(true);
    apiPost("/admin/edges", payload)
      .then(onCreated)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <WizardFrame
      title="Add graph arrow"
      step={step}
      stepCount={3}
      stepLabel={step === 1 ? "Kind" : step === 2 ? "Other topic" : "Review"}
      error={error}
      busy={busy}
      onClose={onClose}
      onBack={step > 1 ? () => setStep((value) => value - 1) : undefined}
      onNext={next}
      nextLabel={step === 3 ? "Create arrow" : "Continue"}
      nextDisabled={step === 2 && !otherId}
      unsaved={step > 1 || kind !== "prerequisite" || weight !== "0.3"}
    >
      {step === 1 ? (
        <AdminField
          label="Kind"
          required
          help={kind === "prerequisite" ? "prerequisite" : "encompassing"}
        >
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="prerequisite">Prerequisite — other topic first</option>
            <option value="encompassing">Encompassing — this also practices the other</option>
          </Select>
        </AdminField>
      ) : null}
      {step === 2 ? (
        <AdminField label="The other topic" required>
          <Select
            value={otherId}
            onChange={(event) => setOtherId(event.target.value)}
            required
          >
            {others.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
                {topic.course_title ? ` (${topic.course_title})` : ""}
              </option>
            ))}
          </Select>
        </AdminField>
      ) : null}
      {step === 3 ? (
        <>
          {kind === "encompassing" ? (
            <AdminField
              label="Weight"
              help="encompassing"
              hint="How much credit the other topic gets. Usually 0.3."
            >
              <input
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                className={inputClass}
              />
            </AdminField>
          ) : null}
          <p className={mutedClass}>
            {kind === "prerequisite"
              ? `Students must finish “${otherTitle}” before this topic.`
              : `Practicing this topic also practices “${otherTitle}”.`}
          </p>
        </>
      ) : null}
    </WizardFrame>
  );
}
