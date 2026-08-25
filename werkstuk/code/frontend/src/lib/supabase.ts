import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

// Auth only. Table reads/writes go through FastAPI so the browser
// cannot edit mastery or invent answers with this key.
export const supabase = createClient(url, anonKey);
