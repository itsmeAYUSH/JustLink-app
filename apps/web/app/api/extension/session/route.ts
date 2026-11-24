import { fromExtension, json } from "@/lib/extension-api";
import { createClient } from "@/lib/supabase/server";
import { readVaultStatus } from "@/lib/vault";

/**
 * Whether the browser is signed in to JustLink, and the user's folders for the save card.
 * Locked folders come marked, and `open` while one is open in JustLink right now.
 */
export async function GET(request: Request) {
  if (!fromExtension(request)) return json({ error: "Not allowed." }, 403);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ signedIn: false });

  const [{ data: folders }, { data: vault }] = await Promise.all([
    supabase.from("collections").select("id, name, icon, is_locked").order("name"),
    supabase.rpc("vault_status"),
  ]);
  const { openFolders } = readVaultStatus(vault);
  return json({
    signedIn: true,
    email: user.email ?? null,
    folders: (folders ?? []).map(({ id, name, icon, is_locked }) => ({
      id,
      name,
      icon,
      locked: is_locked,
      open: openFolders.includes(id),
    })),
  });
}
