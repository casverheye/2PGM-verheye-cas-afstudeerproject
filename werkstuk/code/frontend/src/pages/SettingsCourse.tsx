import { useState, type ChangeEvent, type SubmitEvent } from "react";
import { Field, PageTitle } from "../components/PageFrame";
import { Select } from "../components/Select";
import { apiPost } from "../lib/api";
import { useApiGet } from "../lib/useApiGet";
import {
  buttonClass,
  errorClass,
  mutedClass,
  successClass,
} from "../lib/styles";
import type { ActiveCourse, Course } from "../lib/types";

export function SettingsCoursePage() {
  const { data, setData, error: loadError, loading } = useApiGet<{
    courses: Course[];
  }>("/courses");
  const courses = data?.courses ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // The saved course comes straight from the server data; the only local
  // state is which option the user picked but has not saved yet.
  const savedId =
    courses.find((item) => item.is_active)?.id ?? courses[0]?.id ?? "";
  const selected = selectedId || savedId;
  const dirty = selected !== "" && selected !== savedId;

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedId(event.target.value);
    setError("");
    setSaved(false);
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) {
      return;
    }
    setError("");
    setSaved(false);
    setSaving(true);
    apiPost<{ active: ActiveCourse }>(`/courses/${selected}/activate`)
      .then((body) => {
        setData((current) =>
          current
            ? {
                courses: current.courses.map((item) => ({
                  ...item,
                  is_active: item.id === body.active.id,
                })),
              }
            : current,
        );
        setSaved(true);
      })
      .catch((saveError: Error) => setError(saveError.message))
      .finally(() => setSaving(false));
  }

  return (
    <form className="w-full max-w-sm" onSubmit={onSubmit}>
      <PageTitle>Course</PageTitle>
      <p className={`mb-6 ${mutedClass}`}>
        Learn uses this course for today's plan.
      </p>
      <Field label="Course">
        <Select
          name="course_id"
          value={loading ? "" : selected}
          onChange={onChange}
          required
          disabled={loading || saving}
        >
            {loading ? (
              <option value="">Loading…</option>
            ) : (
              courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))
            )}
        </Select>
      </Field>
      <button
        type="submit"
        disabled={!dirty || saving}
        className={`mt-4 ${buttonClass}`}
      >
        Save Changes
      </button>
      {error || loadError ? (
        <p className={`mt-3 ${errorClass}`}>{error || loadError}</p>
      ) : saved ? (
        <p className={`mt-3 ${successClass}`}>Saved.</p>
      ) : null}
    </form>
  );
}
