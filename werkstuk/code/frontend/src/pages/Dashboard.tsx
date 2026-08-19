import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthProvider";
import { RequireAuth } from "../lib/RequireAuth";

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

    void fetch(`${apiUrl}/health`)
      .then((response) => response.json())
      .then((data: { ok: boolean }) => {
        setHealth(data.ok ? "API is up" : "API said not ok");
      })
      .catch(() => {
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
