import { useState, type SubmitEvent } from "react";
import { Link } from "@tanstack/react-router";
import { RequireGuest } from "../lib/RequireAuth";
import { supabase } from "../lib/supabase";
import { PasswordField } from "../components/PasswordField";
import { Field, PagePanel, PageTitle } from "../components/PageFrame";
import { buttonClass, errorClass, inputClass, linkClass, mutedClass, successClass } from "../lib/styles";

export function RegisterPage() {
  return (
    <RequireGuest>
      <RegisterContent />
    </RequireGuest>
  );
}

function RegisterContent() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreated(false);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setCreated(true);
  }

  return (
    <PagePanel center>
      <form className="w-full" onSubmit={onSubmit}>
        <PageTitle>Register</PageTitle>
        <p className={`mb-6 ${mutedClass}`}>Create an account to start.</p>
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
          <input
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label="Password">
          <PasswordField
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </Field>
        <button type="submit" className={`mt-4 ${buttonClass}`}>
          Create account
        </button>
        {error ? (
          <p className={`mt-3 ${errorClass}`}>{error}</p>
        ) : created ? (
          <p className={`mt-3 ${successClass}`}>
            Account created. You can log in.
          </p>
        ) : null}
        <p className={`mt-6 ${mutedClass}`}>
          Already have an account?{" "}
          <Link to="/login" className={linkClass}>
            Log in
          </Link>
        </p>
      </form>
    </PagePanel>
  );
}
