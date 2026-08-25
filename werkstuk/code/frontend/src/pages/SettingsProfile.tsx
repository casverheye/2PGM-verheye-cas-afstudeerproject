import { useState, type SubmitEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "../lib/authContext";
import { supabase } from "../lib/supabase";
import { Field, PageTitle } from "../components/PageFrame";
import { buttonClass, errorClass, inputClass, mutedClass, successClass } from "../lib/styles";
import { metaString } from "../lib/userMeta";

export function SettingsProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <ProfileForm user={user} />;
}

function ProfileForm({ user }: { user: User }) {
  const savedFirst = metaString(user, "first_name");
  const savedLast = metaString(user, "last_name");
  const savedEmail = user.email ?? "";

  const [firstName, setFirstName] = useState(savedFirst);
  const [lastName, setLastName] = useState(savedLast);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    firstName.trim() !== savedFirst || lastName.trim() !== savedLast;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);

    const { error: saveError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      },
    });

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSaved(true);
  }

  return (
    <form className="w-full max-w-sm" onSubmit={onSubmit}>
      <PageTitle>Profile</PageTitle>
      <p className={`mb-6 ${mutedClass}`}>Your name as it appears in the app.</p>
      <Field label="First Name">
        <input
          type="text"
          name="first_name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
          autoComplete="given-name"
          className={inputClass}
        />
      </Field>
      <Field label="Last Name">
        <input
          type="text"
          name="last_name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
          autoComplete="family-name"
          className={inputClass}
        />
      </Field>
      <Field label="Email">
        <p className={`${inputClass} bg-canvas text-muted`}>{savedEmail}</p>
      </Field>
      <button
        type="submit"
        disabled={!dirty || saving}
        className={`mt-4 ${buttonClass}`}
      >
        Save Changes
      </button>
      {error ? (
        <p className={`mt-3 ${errorClass}`}>{error}</p>
      ) : saved ? (
        <p className={`mt-3 ${successClass}`}>Saved.</p>
      ) : null}
    </form>
  );
}
