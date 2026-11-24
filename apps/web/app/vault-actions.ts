"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { VaultResult } from "@/lib/vault";

/**
 * Server Actions for locked folders. Each one calls a database function that checks
 * the PIN and the browser's unlock itself; nothing here can skip those checks.
 */

const PIN = /^[0-9]{4}$/;

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

function done(): VaultResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Sets the account's PIN (the first time, or to change it while unlocked) and unlocks this browser. */
export async function createPin(pin: string, confirm: string): Promise<VaultResult> {
  if (!PIN.test(pin)) return { ok: false, message: "Use exactly 4 digits." };
  if (pin !== confirm) return { ok: false, message: "The two PINs don't match. Try again." };
  const supabase = await signedIn();
  const { error } = await supabase.rpc("set_vault_pin", { new_pin: pin });
  if (error) return { ok: false, message: error.message };
  return done();
}

/**
 * Checks the PIN. With a folder, opens that folder for this visit (it locks again when
 * you leave it); without one, only marks the PIN as checked, to lock a folder or change the PIN.
 */
export async function unlockWithPin(pin: string, folderId?: string | null): Promise<VaultResult> {
  if (!PIN.test(pin)) return { ok: false, message: "Enter your 4-digit PIN." };
  const supabase = await signedIn();
  const { data, error } = await supabase.rpc("unlock_vault", { pin, folder: folderId ?? null });
  if (error) return { ok: false, message: error.message };

  const result = (data ?? {}) as { ok?: boolean; error?: string; attemptsLeft?: number; blockedUntil?: string | null };
  if (result.ok) return done();
  if (result.error === "no-pin") return { ok: false, message: "Set a PIN first." };
  if (result.error === "blocked") {
    return {
      ok: false,
      message: "Too many wrong tries. PIN entry is paused for a little while.",
      attemptsLeft: 0,
      blockedUntil: result.blockedUntil ?? null,
    };
  }
  const left = result.attemptsLeft ?? 0;
  return {
    ok: false,
    message: `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left before a short pause.`,
    attemptsLeft: left,
  };
}

/** Locks one folder again in this browser (leaving it), or everything when no folder is given. */
export async function lockNow(folderId?: string | null): Promise<void> {
  const supabase = await signedIn();
  await supabase.rpc("lock_vault", { folder: folderId ?? null });
  revalidatePath("/", "layout");
}

/** While a locked folder is on screen: keeps it open. False once it has locked. */
export async function keepFolderOpen(folderId: string): Promise<boolean> {
  const supabase = await signedIn();
  const { data } = await supabase.rpc("keep_folder_open", { folder: folderId });
  return data === true;
}

/** Locks or unlocks a folder. The PIN must be entered in this browser. */
export async function setFolderLock(folderId: string, locked: boolean): Promise<VaultResult> {
  const supabase = await signedIn();
  const { error } = await supabase.rpc("set_folder_locked", { folder: folderId, locked });
  if (error) return { ok: false, message: error.message };
  return done();
}

/** Removes a forgotten PIN and unlocks every folder. Only works soon after signing in with the password. */
export async function removePin(): Promise<VaultResult> {
  const supabase = await signedIn();
  const { data, error } = await supabase.rpc("reset_vault");
  if (error) return { ok: false, message: error.message };
  if ((data as { ok?: boolean } | null)?.ok) return done();
  return {
    ok: false,
    signInAgain: true,
    message: "To keep your folders safe, sign in again with your password first.",
  };
}

/** Removes a PIN you know (it must be entered in this browser). Every locked folder unlocks. */
export async function removeKnownPin(): Promise<VaultResult> {
  const supabase = await signedIn();
  const { error } = await supabase.rpc("remove_vault_pin");
  if (error) return { ok: false, message: error.message };
  return done();
}

/** Forgot the PIN: sign out, then sign back in with the password and come back to remove it. */
export async function signInToRemovePin(): Promise<void> {
  const supabase = await signedIn();
  await supabase.auth.signOut();
  redirect(`/login?next=${encodeURIComponent("/profile?reset-pin=1")}`);
}
