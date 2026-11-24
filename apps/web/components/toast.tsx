"use client";

import { createContext, use, useEffect, useState, useTransition, type ReactNode } from "react";
import { AlertIcon, CheckIcon, SpinnerIcon, XIcon } from "./icons";

type Toast = {
  message: string;
  tone?: "success" | "error";
  /** An "Undo"-style button. `run` returns the message to show next. */
  action?: { label: string; run: () => Promise<{ message: string; tone?: Toast["tone"] }> };
};

type ToastApi = { show: (toast: Toast) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Shows one short message at a time at the bottom of the screen, optionally with an Undo button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  // `key` restarts the timer (and the entrance animation) when a new toast replaces the old one.
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null);
  const [hovered, setHovered] = useState(false);
  const [running, startTransition] = useTransition();

  const show = (next: Toast) => setToast({ ...next, key: Date.now() });

  useEffect(() => {
    if (!toast || hovered || running) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, hovered, running]);

  function runAction() {
    const action = toast?.action;
    if (!action) return;
    startTransition(async () => {
      try {
        show(await action.run());
      } catch {
        show({ message: "Something went wrong. Try again.", tone: "error" });
      }
    });
  }

  return (
    <ToastContext value={{ show }}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {toast?.message}
      </div>
      {toast && (
        <div
          key={toast.key}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          // Sits above the selection bar while that is showing.
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-zinc-900 py-2 pr-2 pl-4 text-sm text-white shadow-2xl shadow-zinc-950/30 motion-safe:animate-fade-up [body:has([data-selecting])_&]:bottom-24 dark:bg-zinc-800 dark:ring-1 dark:ring-white/10"
        >
          {toast.tone === "error" ? (
            <AlertIcon className="size-4 shrink-0 text-rose-400" />
          ) : (
            <CheckIcon className="size-4 shrink-0 text-emerald-400" strokeWidth={2.5} />
          )}
          <span className="min-w-0 truncate font-medium">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={runAction}
              disabled={running}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold text-indigo-300 transition-colors hover:bg-white/10 hover:text-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:outline-none disabled:opacity-70"
            >
              {running && <SpinnerIcon className="size-3.5" />}
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
    </ToastContext>
  );
}

const noToasts: ToastApi = { show: () => {} };

/** Shows a toast; does nothing outside a <ToastProvider>. */
export function useToast(): ToastApi {
  return use(ToastContext) ?? noToasts;
}

/** Shortens a title for a one-line toast. */
export function shortTitle(title: string, max = 40): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

/** FormData with one "id" field per link, as the link actions expect. */
export function idsFormData(ids: string[]): FormData {
  const formData = new FormData();
  for (const id of ids) formData.append("id", id);
  return formData;
}
