import { useParams } from "@tanstack/react-router";
import { RequireAuth } from "../lib/RequireAuth";

export function LearnPage() {
  const { topicId } = useParams({ from: "/learn/$topicId" });

  return (
    <RequireAuth>
      <h1 className="p-4 text-xl">Learn: {topicId}</h1>
    </RequireAuth>
  );
}
