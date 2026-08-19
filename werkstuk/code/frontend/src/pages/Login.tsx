import { useState, type SubmitEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

export function LoginPage() {
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

    void navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3 p-4">
      <h1 className="text-xl">Login</h1>
      <input
        type="email"
        name="email"
        placeholder="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        className="border p-2"
      />
      <input
        type="password"
        name="password"
        placeholder="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={6}
        className="border p-2"
      />
      <button type="submit" className="border p-2">
        Log in
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
