import { useState, type SubmitEvent } from "react";
import { useAuth } from "../lib/authContext";
import { supabase } from "../lib/supabase";
import { PasswordField } from "../components/PasswordField";
import { Field, PageTitle } from "../components/PageFrame";
import { buttonClass, errorClass, mutedClass, successClass } from "../lib/styles";

export function SettingsPasswordPage() {
  const { user } = useAuth();
  const email = user?.email ?? "";

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave =
    currentPassword.length > 0 &&
    password.length >= 6 &&
    password === confirm &&
    password !== currentPassword;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password === currentPassword) {
      setError("New password must be different.");
      return;
    }

    setSaving(true);

    const { error: checkError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (checkError) {
      setSaving(false);
      setError("Current password is wrong.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      current_password: currentPassword,
    });

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setSaved(true);
  }

  return (
    <form className="w-full max-w-sm" onSubmit={onSubmit}>
      <PageTitle>Password</PageTitle>
      <p className={`mb-6 ${mutedClass}`}>Change the password for this account.</p>
      <Field label="Current Password">
        <PasswordField
          name="current_password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="New Password">
        <PasswordField
          name="new_password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm Password">
        <PasswordField
          name="confirm_password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </Field>
      <button
        type="submit"
        disabled={saving || !canSave}
        className={`mt-4 ${buttonClass}`}
      >
        Save Changes
      </button>
      {error ? (
        <p className={`mt-3 ${errorClass}`}>{error}</p>
      ) : saved ? (
        <p className={`mt-3 ${successClass}`}>Password updated.</p>
      ) : null}
    </form>
  );
}
