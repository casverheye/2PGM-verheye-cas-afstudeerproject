import { useAuth } from "../lib/AuthProvider";

export function DashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-4">Loading…</p>;
  }

  if (!user) {
    return <p className="p-4">Not logged in. Use Login first.</p>;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl">Dashboard</h1>
      <p>{user.email}</p>
    </div>
  );
}
