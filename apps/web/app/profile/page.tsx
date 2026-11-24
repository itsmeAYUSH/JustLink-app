import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { Avatar } from "@/components/avatar";
import {
  AccountSection,
  DeleteAccountSection,
  EmailSection,
  LockedFoldersSection,
  NameSection,
  PasswordSection,
  PhotoSection,
  PinSection,
} from "@/components/profile-forms";
import { RemovePinPrompt } from "@/components/vault";
import { displayName, profileFromUser } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { readVaultStatus } from "@/lib/vault";

export const metadata: Metadata = { title: "Profile" };

/** Everything about the account in one place: photo, name, email, password and the folder PIN. */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: vaultJson },
    { data: folderRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("vault_status"),
    supabase.from("collections").select("id, name, icon, is_locked").order("name"),
  ]);
  const folders = (folderRows ?? []).map(({ id, name, icon, is_locked }) => ({ id, name, icon, locked: is_locked }));
  const lockedCount = folders.filter((folder) => folder.locked).length;

  const profile = profileFromUser(user);
  if (!profile) redirect("/login?next=/profile");
  const vault = readVaultStatus(vaultJson);

  return (
    <AppFrame
      header={<span className="truncate text-base font-semibold tracking-tight sm:text-lg">Profile</span>}
    >
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-8 sm:pt-5">
        <Link href="/" className="mb-4 inline-block text-sm text-muted hover:text-ink">
          ← Back to your library
        </Link>

        <div className="mb-8 flex items-center gap-4">
          <Avatar profile={profile} size={64} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName(profile)}</h1>
            {profile.name && <p className="truncate text-sm text-muted">{profile.email}</p>}
          </div>
        </div>

        <div className="space-y-6">
          <PhotoSection profile={profile} />
          <NameSection name={profile.name} />
          <EmailSection email={profile.email} />
          <PasswordSection />
          <PinSection status={vault} lockedCount={lockedCount} />
          <LockedFoldersSection folders={folders} hasPin={vault.hasPin} />
          <AccountSection />
          <DeleteAccountSection email={profile.email} />
        </div>
      </main>
      {params["reset-pin"] === "1" && <RemovePinPrompt returnTo="/profile" />}
    </AppFrame>
  );
}
