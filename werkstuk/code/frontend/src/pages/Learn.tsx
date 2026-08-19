import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { supabase } from "../lib/supabase";

type Problem = {
  id: number;
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  choice_e: string;
};

export function LearnPage() {
  const { topicId } = useParams({ from: "/learn/$topicId" });

  return (
    <RequireAuth>
      <LearnContent topicId={topicId} />
    </RequireAuth>
  );
}

function LearnContent({ topicId }: { topicId: string }) {
  const [message, setMessage] = useState("Loading problem…");
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string;

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setMessage("No session token");
        return;
      }

      return fetch(`${apiUrl}/topics/${topicId}/next-problem`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        if (!response.ok) {
          setMessage("Could not load problem");
          return;
        }
        const body = (await response.json()) as Problem;
        setProblem(body);
        setMessage("");
      });
    }).catch(() => {
      setMessage("API is down");
    });
  }, [topicId]);

  return (
    <div className="p-4">
      <h1 className="text-xl">Learn: {topicId}</h1>
      {message ? <p>{message}</p> : null}
      {problem ? (
        <div>
          <p>{problem.prompt}</p>
          <p>a) {problem.choice_a}</p>
          <p>b) {problem.choice_b}</p>
          <p>c) {problem.choice_c}</p>
          <p>d) {problem.choice_d}</p>
          <p>e) {problem.choice_e}</p>
        </div>
      ) : null}
    </div>
  );
}
