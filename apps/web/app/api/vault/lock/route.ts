import { createClient } from "@/lib/supabase/server";

/**
 * Locks every open locked folder in this browser. Called with navigator.sendBeacon when
 * a tab with an open locked folder is closed or reloaded, where a Server Action can't
 * finish. Locking is always safe, so this needs nothing but the session cookie.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.rpc("lock_vault", { folder: null });
  return new Response(null, { status: 204 });
}
