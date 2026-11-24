"use server";

import { isAuthRetryableFetchError, isAuthWeakPasswordError, type AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type AuthMode = "signin" | "signup";
export type AuthField = "email" | "password";

export type AuthState = {
  status: "idle" | "error" | "check-email";
  /** Short heading. Errors with a title show as a banner; without one, under `field`. */
  title?: string;
  message?: string;
  /** The input the error is about: it is outlined and focused. */
  field?: AuthField;
  /** Offer to switch to the other mode, e.g. when the account already exists. */
  suggest?: AuthMode;
  email?: string;
};

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only allow same-site relative paths after login. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // "//host" and "/\host" would leave the site.
  return /^\/(?![/\\])/.test(next) ? next : "/";
}

/** Turns a Supabase auth error into something a person can act on. */
function describeError(error: AuthError, mode: AuthMode): Omit<AuthState, "status" | "email"> {
  if (isAuthRetryableFetchError(error)) {
    return {
      title: "Can't reach the server",
      message: "Check your internet connection and try again.",
    };
  }
  if (isAuthWeakPasswordError(error)) {
    return {
      field: "password",
      message: error.reasons.includes("pwned")
        ? "This password has shown up in a data breach. Choose a different one."
        : "That password is too easy to guess. Make it longer, or mix in numbers and symbols.",
    };
  }

  switch (error.code) {
    case "invalid_credentials":
      return {
        title: "Incorrect email or password",
        message: "Check both and try again. Passwords are case-sensitive.",
        field: "password",
        suggest: "signup",
      };
    case "email_not_confirmed":
      return {
        title: "Confirm your email first",
        message: "Open the confirmation link we emailed you, then sign in. It may be in your spam folder.",
      };
    case "user_already_exists":
    case "email_exists":
      return {
        title: "You already have an account",
        message: "An account with this email already exists. Sign in with your password instead.",
        field: "email",
        suggest: "signin",
      };
    case "email_address_invalid":
    case "email_address_not_authorized":
      return { field: "email", message: "We can't send email to this address. Check it for typos or use another one." };
    case "over_email_send_rate_limit":
      return {
        title: "Too many emails sent",
        message: "We've emailed this address several times recently. Wait a few minutes, then try again.",
      };
    case "over_request_rate_limit":
      return { title: "Too many attempts", message: "Wait a minute, then try again." };
    case "signup_disabled":
    case "email_provider_disabled":
      return { title: "Sign-ups are closed", message: "New accounts can't be created right now." };
    default:
      return {
        title: mode === "signup" ? "Couldn't create your account" : "Couldn't sign you in",
        message: error.message,
      };
  }
}

export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const mode: AuthMode = formData.get("intent") === "signup" ? "signup" : "signin";
  const next = safeNext(formData.get("next"));

  // The form checks these first; this is the fallback for when its script hasn't loaded.
  if (!email) return { status: "error", field: "email", message: "Enter your email address.", email };
  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", field: "email", message: "Enter a valid email address, like name@example.com.", email };
  }
  if (!password) return { status: "error", field: "password", message: "Enter your password.", email };

  const supabase = await createClient();

  if (mode === "signup") {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        status: "error",
        field: "password",
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        email,
      };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    if (error) return { status: "error", ...describeError(error, mode), email };

    // With "Confirm email" turned on (the Supabase default) there is no session yet.
    if (!data.session) return { status: "check-email", email };
    redirect(next);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", ...describeError(error, mode), email };

  redirect(next);
}
