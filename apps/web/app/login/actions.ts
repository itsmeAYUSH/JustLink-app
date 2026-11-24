"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error" | "check-email";
  message?: string;
  email?: string;
};

/** Only allow same-site relative paths after login. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // "//host" and "/\host" would leave the site.
  return /^\/(?![/\\])/.test(next) ? next : "/";
}

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const intent = formData.get("intent") === "signup" ? "signup" : "signin";
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { status: "error", message: "Email and password are required.", email };
  }

  const supabase = await createClient();

  if (intent === "signup") {
    if (password.length < 6) {
      return { status: "error", message: "Use a password with at least 6 characters.", email };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    if (error) return { status: "error", message: error.message, email };

    // With "Confirm email" turned on (the Supabase default) there is no session yet.
    if (!data.session) {
      return {
        status: "check-email",
        message: `We sent a confirmation link to ${email}. Open it to finish signing up.`,
        email,
      };
    }
    redirect(next);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: error.message, email };

  redirect(next);
}
