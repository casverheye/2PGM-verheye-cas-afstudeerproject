import { Navigate } from "@tanstack/react-router";
import { PagePanel } from "../components/PageFrame";
import { useAuth } from "../lib/authContext";
import { mutedClass } from "../lib/styles";

export function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <PagePanel>
        <p className={mutedClass}>Loading…</p>
      </PagePanel>
    );
  }

  return <Navigate to={user ? "/learn" : "/login"} replace />;
}

/** Old course URLs land on Learn; the catalog lives there now. */
export function RedirectToLearn() {
  return <Navigate to="/learn" replace />;
}
