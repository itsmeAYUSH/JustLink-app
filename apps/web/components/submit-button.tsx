"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<"button"> & {
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary: "bg-brand text-on-brand hover:bg-brand/90",
  secondary: "border border-line bg-surface text-ink hover:bg-subtle",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
};

/** A submit button that disables itself and shows `pendingText` while its form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
  disabled = false,
  ...props
}: Props) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form, only label the one that was clicked.
  const isThisButton = pending && (!props.name || data?.get(props.name) === String(props.value));

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    >
      {isThisButton && pendingText ? pendingText : children}
    </button>
  );
}
