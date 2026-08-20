import { useAuth } from "../lib/AuthProvider";
import { RequireAuth } from "../lib/RequireAuth";

export function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}

function ProfileContent() {
  const { user, signOut } = useAuth();

  return (
    <div className="p-4">
      <h1 className="text-xl">Profile</h1>
      <p>{user?.email}</p>
      <p>
        <button type="button" className="border p-2" onClick={() => void signOut()}>
          Log out
        </button>
      </p>
    </div>
  );
}
