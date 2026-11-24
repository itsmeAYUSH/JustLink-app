"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AVATAR_MAX_BYTES } from "@/lib/profile";
import { siteUrl } from "@/lib/site-url";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** What a profile form shows after saving. */
export type ProfileState = { status: "idle" | "success" | "error"; message?: string };

const AVATARS = "avatars";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function saved(message: string): ProfileState {
  revalidatePath("/", "layout");
  return { status: "success", message };
}

// ─── Name ───────────────────────────────────────────────────────────────────

export async function updateName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const { supabase } = await signedIn();
  const { error } = await supabase.auth.updateUser({ data: { full_name: name || null } });
  if (error) return { status: "error", message: error.message };
  return saved(name ? "Name saved." : "Name removed.");
}

// ─── Photo ──────────────────────────────────────────────────────────────────

/** Old photos in the user's folder, to tidy up after a new one is in place. */
async function removePhotos(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, keep?: string) {
  const { data: files } = await supabase.storage.from(AVATARS).list(userId);
  const old = (files ?? []).map((file) => `${userId}/${file.name}`).filter((path) => path !== keep);
  if (old.length) await supabase.storage.from(AVATARS).remove(old);
}

/** Saves a profile photo, already cropped and shrunk by the browser. */
export async function uploadAvatar(formData: FormData): Promise<ProfileState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a photo first." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { status: "error", message: "Use a JPEG, PNG or WebP picture." };
  }
  if (file.size > AVATAR_MAX_BYTES) return { status: "error", message: "That picture is larger than 2 MB." };

  const { supabase, user } = await signedIn();
  // A new name each time, so browsers and CDNs never show the old photo from cache.
  const path = `${user.id}/${Date.now()}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATARS)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return {
      status: "error",
      message: /bucket not found/i.test(uploadError.message)
        ? "Photo uploads aren't set up yet: run the profile migration (supabase/migrations/*_profile.sql)."
        : uploadError.message,
    };
  }

  const { data } = supabase.storage.from(AVATARS).getPublicUrl(path);
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
  if (error) return { status: "error", message: error.message };
  await removePhotos(supabase, user.id, path);
  return saved("Photo updated.");
}

export async function removeAvatar(): Promise<ProfileState> {
  const { supabase, user } = await signedIn();
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
  if (error) return { status: "error", message: error.message };
  await removePhotos(supabase, user.id);
  return saved("Photo removed.");
}

// ─── Email ──────────────────────────────────────────────────────────────────

export async function changeEmail(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email address, like name@example.com." };

  const { supabase, user } = await signedIn();
  if (email === user.email?.toLowerCase()) return { status: "error", message: "That's already your email." };

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent("/profile")}` },
  );
  if (error) {
    const taken = error.code === "email_exists" || /already/i.test(error.message);
    return { status: "error", message: taken ? "Another account already uses that email." : error.message };
  }
  return saved(
    `Almost done: open the confirmation link we sent to ${email}. If your project asks for it, confirm from your current address too. Your email changes once that's done.`,
  );
}

// ─── Password ───────────────────────────────────────────────────────────────

export async function changePassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current) return { status: "error", message: "Enter your current password." };
  if (next.length < 6) return { status: "error", message: "Use at least 6 characters for the new password." };
  if (next !== confirm) return { status: "error", message: "The new passwords don't match." };

  const { supabase, user } = await signedIn();
  if (!user.email) return { status: "error", message: "This account has no email to check the password against." };

  // Check the current password with a throwaway client, so this browser's session
  // (and anything unlocked in it) is left alone; then end that check's session.
  const { url, key } = getSupabaseEnv();
  const check = createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { status: "error", message: "Your current password isn't right." };
  await check.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "That's already your password." };
    if (error.code === "reauthentication_needed") {
      return { status: "error", message: "For safety, sign out and back in, then change your password." };
    }
    return { status: "error", message: error.message };
  }
  return saved("Password changed.");
}
