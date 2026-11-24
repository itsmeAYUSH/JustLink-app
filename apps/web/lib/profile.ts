import type { User } from "@supabase/supabase-js";

/**
 * The signed-in person as the app shows them. Name and photo live in the auth
 * user's metadata (set from the profile page), so there is no profiles table.
 */
export type Profile = {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
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
    avatarUrl: avatar && /^https?:\/\//i.test(avatar) ? avatar : null,  };
}

/** "Ayush" or "ayush@example.com": what to call the person. */
export function displayName(profile: Profile): string {
  return profile.name || profile.email || "You";
}

/**
 * What the sidebar calls the person: their name, or without one the part of their
 * email before the @ (the full address isn't shown there).
 */
export function shortName(profile: Profile): string {
  return profile.name || profile.email?.replace(/@.*/, "") || "You";
}

/** The first letter of the first name (or of the email without a name), for an avatar without a photo. */
export function initials(profile: Profile): string {
  const source = (profile.name || profile.email || "?").trim();
  return (Array.from(source)[0] ?? "?").toUpperCase();
}

/** Profile photo uploads: the browser crops and shrinks them to this square first. */
export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
