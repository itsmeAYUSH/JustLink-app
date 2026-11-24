import type { User } from "@supabase/supabase-js";

/**
 * The signed-in person as the app shows them. Name and photo live in the auth
 * user's metadata (set from the profile page), so there is no profiles table.
 */
export type Profile = {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** A new address waiting for its confirmation link to be opened. */
  pendingEmail: string | null;
};

export function profileFromUser(user: User | null | undefined): Profile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const avatar = text(meta.avatar_url);
  return {
    email: user.email ?? null,
    name: text(meta.full_name),
    // Only our own https storage links (or http on localhost) are shown as pictures.
    avatarUrl: avatar && /^https?:\/\//i.test(avatar) ? avatar : null,
    pendingEmail: user.new_email ?? null,
  };
}

/** "Ayush" or "ayush@example.com": what to call the person. */
export function displayName(profile: Profile): string {
  return profile.name || profile.email || "You";
}

/** One or two letters for an avatar without a photo. */
export function initials(profile: Profile): string {
  const source = profile.name || profile.email || "?";
  const words = source.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : source.slice(0, 1);
  return letters.toUpperCase();
}

/** Profile photo uploads: the browser crops and shrinks them to this square first. */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
