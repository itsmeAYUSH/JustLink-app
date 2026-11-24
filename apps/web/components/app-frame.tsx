import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Filters } from "@/lib/filters";
import { readStats, type LibraryStats } from "@/lib/links";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/preferences";
import { profileFromUser, type Profile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { readVaultStatus, type VaultStatus } from "@/lib/vault";
import { AppShell } from "./app-shell";
import { FoldersProvider } from "./folders";
import { Sidebar, SidebarUser, type SidebarFolder } from "./sidebar";
import { ToastProvider } from "./toast";
import { VaultProvider } from "./vault";

/** What the sidebar shows. */
export type FrameData = {
  user: Profile | null;
  collections: SidebarFolder[];
  stats: LibraryStats;
  vault: VaultStatus;
};

/**
 * The signed-in frame around a page, from data already loaded: the toast, PIN and folder
 * providers, the sidebar at the left and the header. `filters` marks the current section
 * on the library page; elsewhere it's null.
 */
export async function Frame({
  data,
  filters,
  header,
  children,
}: {
  data: FrameData;
  filters: Filters | null;
  header?: ReactNode;
  children: ReactNode;
}) {
  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
  const folders = data.collections.map(({ id, name, icon, is_locked }) => ({ id, name, icon, locked: is_locked }));

  return (
    <ToastProvider>
      <VaultProvider status={data.vault}>
        <FoldersProvider folders={folders}>
          <AppShell
            initiallyCollapsed={collapsed}
            header={header}
            sidebar={
              <Sidebar
                filters={filters}
                stats={data.stats}
                collections={data.collections}
                openFolders={data.vault.openFolders}
              />
            }
            footer={data.user && <SidebarUser user={data.user} />}
          >
            {children}
          </AppShell>
        </FoldersProvider>
      </VaultProvider>
    </ToastProvider>
  );
}

/** The sidebar's data, for pages that don't load it themselves. */
export async function loadFrameData(): Promise<FrameData> {
  const supabase = await createClient();
  const [{ data: userData }, { data: collectionRows }, { data: statsJson }, { data: vaultJson }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("collections").select("id, name, icon, is_public, is_locked, share_id").order("name"),
    supabase.rpc("get_library_stats"),
    supabase.rpc("vault_status"),
  ]);
  return {
    user: profileFromUser(userData.user),
    collections: collectionRows ?? [],
    stats: readStats(statsJson),
    vault: readVaultStatus(vaultJson),
  };
}

/** The frame for pages outside the library (profile, import, a link's page): loads its own data. */
export async function AppFrame({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <Frame data={await loadFrameData()} filters={null} header={header}>
      {children}
    </Frame>
  );
}
