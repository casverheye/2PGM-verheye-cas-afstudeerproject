import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PagePanel } from "../components/PageFrame";
import { apiGet } from "./api";
import { mutedClass } from "./styles";
import { useAuth } from "./authContext";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      void navigate({ to: "/login" });
      return;
    }
    let ignore = false;
    apiGet<{ admin: boolean }>("/me")
      .then((body) => {
        if (ignore) {
          return;
        }
        if (!body.admin) {
          void navigate({ to: "/learn" });
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (!ignore) {
          void navigate({ to: "/learn" });
        }
      });
    return () => {
      ignore = true;
    };
  }, [user, loading, navigate]);

  if (!allowed) {
    return (
      <PagePanel>
        <p className={mutedClass}>Loading…</p>
      </PagePanel>
    );
  }

  return children;
}
