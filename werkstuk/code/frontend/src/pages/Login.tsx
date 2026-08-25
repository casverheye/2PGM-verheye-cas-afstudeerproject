import { useState, type SubmitEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { RequireGuest } from "../lib/RequireAuth";
import { supabase } from "../lib/supabase";
import { PasswordField } from "../components/PasswordField";
import { Field, PagePanel, PageTitle } from "../components/PageFrame";
import { buttonClass, errorClass, inputClass, linkClass, mutedClass } from "../lib/styles";

export function LoginPage() {
  return (
    <RequireGuest>
      <LoginContent />
    </RequireGuest>
  );
}

function LoginContent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    void navigate({ to: "/learn" });
  }

  return (
    <PagePanel center>
      <form className="w-full" onSubmit={onSubmit}>
        <PageTitle>Login</PageTitle>
        <p className={`mb-6 ${mutedClass}`}>Sign in to continue learning.</p>
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
            autoComplete="current-password"
          />
        </Field>
        <button type="submit" className={`mt-4 ${buttonClass}`}>
          Log in
        </button>
        {message ? <p className={`mt-3 ${errorClass}`}>{message}</p> : null}
        <p className={`mt-6 ${mutedClass}`}>
          Don't have an account?{" "}
          <Link to="/register" className={linkClass}>
            Register
          </Link>
        </p>
      </form>
    </PagePanel>
  );
}
