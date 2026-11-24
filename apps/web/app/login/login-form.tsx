"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { authenticate, type AuthState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-800";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(authenticate, {
    status: initialError ? "error" : "idle",
    message: initialError,
  });

  if (state.status === "check-email") {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className={inputClass}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          className={inputClass}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <SubmitButton name="intent" value="signin" pendingText="Signing in…">
          Sign in
        </SubmitButton>
        <SubmitButton name="intent" value="signup" variant="secondary" pendingText="Creating account…">
          Create account
        </SubmitButton>
      </div>
    </form>
  );
}
