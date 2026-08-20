import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";
import { supabase } from "../lib/supabase";

type QueueItem = {
  topic_id: string;
  title: string;
  kind: string;
  can_start: boolean;
};

export function LearnHomePage() {
  return (
    <RequireAuth>
      <LearnHomeContent />
    </RequireAuth>
  );
}

function LearnHomeContent() {
  const [message, setMessage] = useState("Loading tasks…");
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string;

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setMessage("No session token");
        return;
      }

      return fetch(`${apiUrl}/learn-queue`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        if (!response.ok) {
          setMessage("Could not load learn queue");
          return;
        }
        const body = (await response.json()) as { items: QueueItem[] };
        setItems(body.items);
        setMessage("");
      });
    }).catch(() => {
      setMessage("API is down");
    });
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl">Learn</h1>
      {message ? <p>{message}</p> : null}
      {items.map((item) => (
        <div key={item.topic_id}>
          <p>{item.title}</p>
          <p>{item.kind}</p>
          {item.can_start ? (
            <p>
              <Link to="/learn/$topicId" params={{ topicId: item.topic_id }}>
                Start
              </Link>
            </p>
          ) : (
            <p>Not ready yet</p>
          )}
        </div>
      ))}
    </div>
  );
}
