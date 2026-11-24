"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<"button"> & {
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger:
    "border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950",
};

/** A submit button that disables itself and shows `pendingText` while its form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form, only label the one that was clicked.
  const isThisButton = pending && (!props.name || data?.get(props.name) === String(props.value));

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {isThisButton && pendingText ? pendingText : children}
    </button>
  );
}
