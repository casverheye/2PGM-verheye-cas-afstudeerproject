import type { User } from "@supabase/supabase-js";

export function metaString(user: User, key: string) {
  const value = user.user_metadata[key];
  return typeof value === "string" ? value : "";
}
