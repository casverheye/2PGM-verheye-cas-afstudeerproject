import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthProvider";
import { RequireAuth } from "../lib/RequireAuth";
import { supabase } from "../lib/supabase";

export function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [health, setHealth] = useState("Checking API…");

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string;

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setHealth("No session token");
        return;
      }

      return fetch(`${apiUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        if (!response.ok) {
          setHealth("API did not accept login");
          return;
        }
        const body = (await response.json()) as { email: string };
        setHealth(`FastAPI sees: ${body.email}`);
      });
    }).catch(() => {
      setHealth("API is down");
    });
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl">Dashboard</h1>
      <p>{user?.email}</p>
      <p>{health}</p>
    </div>
  );
}
