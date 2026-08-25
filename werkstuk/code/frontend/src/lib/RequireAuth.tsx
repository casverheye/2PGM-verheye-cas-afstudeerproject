import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PagePanel } from "../components/PageFrame";
import { mutedClass } from "./styles";
import { useAuth } from "./authContext";

export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      void navigate({ to: "/learn" });
    }
  }, [loading, user, navigate]);

  if (loading || user) {
    return (
      <PagePanel>
        <p className={mutedClass}>Loading…</p>
      </PagePanel>
    );
  }

  return children;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <PagePanel>
        <p className={mutedClass}>Loading…</p>
      </PagePanel>
    );
  }

  return children;
}
