import { useEffect, useState, type SubmitEvent } from "react";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState("");

  function loadProblem() {
    const apiUrl = import.meta.env.VITE_API_URL as string;
    setSelected(null);
    setResult("");
    setMessage("Loading problem…");

    void supabase.auth
      .getSession()
      .then(({ data }) => {
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
      })
      .catch(() => {
        setMessage("API is down");
      });
  }

  useEffect(() => {
    loadProblem();
  }, [topicId]);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!problem || !selected || result) {
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL as string;

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setResult("No session token");
        return;
      }

      return fetch(`${apiUrl}/answers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problem_id: problem.id,
          chosen_choice: selected,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          setResult("Could not grade answer");
          return;
        }
        const body = (await response.json()) as {
          is_correct: boolean;
          correct_choice: string;
          consecutive_correct: number;
          status: string;
        };
        const streak = `${body.consecutive_correct}/2 in a row`;
        if (body.is_correct) {
          if (body.status === "completed") {
            setResult(`Correct. Skill completed (${streak})`);
          } else {
            setResult(`Correct. ${streak}`);
          }
        } else {
          setResult(`Wrong. The answer is ${body.correct_choice}. ${streak}`);
        }
      });
    });
  }

  return (
    <div className="p-4">
      <h1 className="text-xl">Learn: {topicId}</h1>
      {message ? <p>{message}</p> : null}
      {problem ? (
        <form onSubmit={onSubmit}>
          <p>{problem.prompt}</p>
          <p>
            <label>
              <input
                type="radio"
                name="choice"
                value="a"
                checked={selected === "a"}
                disabled={Boolean(result)}
                onChange={() => setSelected("a")}
              />{" "}
              a) {problem.choice_a}
            </label>
          </p>
          <p>
            <label>
              <input
                type="radio"
                name="choice"
                value="b"
                checked={selected === "b"}
                disabled={Boolean(result)}
                onChange={() => setSelected("b")}
              />{" "}
              b) {problem.choice_b}
            </label>
          </p>
          <p>
            <label>
              <input
                type="radio"
                name="choice"
                value="c"
                checked={selected === "c"}
                disabled={Boolean(result)}
                onChange={() => setSelected("c")}
              />{" "}
              c) {problem.choice_c}
            </label>
          </p>
          <p>
            <label>
              <input
                type="radio"
                name="choice"
                value="d"
                checked={selected === "d"}
                disabled={Boolean(result)}
                onChange={() => setSelected("d")}
              />{" "}
              d) {problem.choice_d}
            </label>
          </p>
          <p>
            <label>
              <input
                type="radio"
                name="choice"
                value="e"
                checked={selected === "e"}
                disabled={Boolean(result)}
                onChange={() => setSelected("e")}
              />{" "}
              e) {problem.choice_e}
            </label>
          </p>
          <button
            type="submit"
            className="border p-2"
            disabled={!selected || Boolean(result)}
          >
            Submit
          </button>
        </form>
      ) : null}
      {result ? <p>{result}</p> : null}
      {result ? (
        <p>
          <button type="button" className="border p-2" onClick={loadProblem}>
            Continue
          </button>
        </p>
      ) : null}
    </div>
  );
}
