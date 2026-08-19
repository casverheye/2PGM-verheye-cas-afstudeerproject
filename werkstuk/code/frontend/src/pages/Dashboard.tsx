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

  return (
    <div className="p-4">
      <h1 className="text-xl">Dashboard</h1>
      <p>{user?.email}</p>
    </div>
  );
}
