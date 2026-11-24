import type { Json } from "./supabase/database.types";

/**
 * The PIN that locks folders ("the vault"). The rules live in the database
 * (supabase/migrations/*_locked_folders.sql and *_folder_pin_per_visit.sql);
 * this is what the app sees of them.
 *
 * A locked folder works like a password-protected folder: the PIN opens that one
 * folder for one visit, and it locks again as soon as you leave it.
 */

export type VaultStatus = {
  /** A PIN has been set for this account. */
  hasPin: boolean;
  /** Too many wrong tries: PIN entry is paused until then, or null. */
  blockedUntil: string | null;
  /** Locked folders opened with the PIN in this browser, for the current visit. */
  openFolders: string[];
  /** The PIN was checked in this browser moments ago (to lock a folder, or change the PIN). */
  pinChecked: boolean;
};

export function readVaultStatus(value: Json | null): VaultStatus {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const open = Array.isArray(raw.openFolders) ? raw.openFolders.filter((id): id is string => typeof id === "string") : [];
  return {
    hasPin: raw.hasPin === true,
    blockedUntil: typeof raw.blockedUntil === "string" && raw.blockedUntil ? raw.blockedUntil : null,
    openFolders: open,
    pinChecked: raw.pinChecked === true,
  };
}

export type VaultResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      /** Wrong tries left before a pause. */
      attemptsLeft?: number;
      blockedUntil?: string | null;
      /** Removing a forgotten PIN needs a fresh sign-in with the password. */
      signInAgain?: boolean;
    };
