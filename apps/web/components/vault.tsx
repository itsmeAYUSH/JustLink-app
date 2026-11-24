"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  createPin,
  keepFolderOpen,
  lockNow,
  removePin,
  signInToRemovePin,
  unlockWithPin,
} from "@/app/vault-actions";
import type { VaultResult, VaultStatus } from "@/lib/vault";
import { AlertIcon, LockIcon, SpinnerIcon, UnlockIcon, XIcon } from "./icons";
import { useToast } from "./toast";

/**
 * Locked folders on the client: the 4-digit PIN entry, the dialog that asks for it,
 * the lock screen of a locked folder, and the bar inside an open one. A locked folder
 * works like a password-protected folder: the PIN opens it for one visit, and leaving
 * locks it again. The database decides what is visible; these only ask for the PIN.
 */

// ─── PIN entry ──────────────────────────────────────────────────────────────

/**
 * Four boxes for a 4-digit PIN. One real input sits over them, so typing, pasting,
 * Backspace and phone number pads all just work. Calls `onComplete` at the 4th digit.
 */
export function PinInput({
  onComplete,
  disabled = false,
  invalid = false,
  label,
  autoFocus = true,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative mx-auto w-fit" onClick={() => inputRef.current?.focus()}>
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => {
          const filled = index < value.length;
          const current = index === value.length && !disabled;
          return (
            <span
              key={index}
              className={`grid size-14 place-items-center rounded-xl border-[1.5px] bg-surface text-2xl transition-colors ${
                invalid
                  ? "border-danger"
                  : current
                    ? "border-brand ring-4 ring-brand/15"
                    : filled
                      ? "border-muted/50"
                      : "border-line"
              }`}
            >
              {filled ? <span className="size-3 rounded-full bg-brand" /> : null}
            </span>
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={4}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
          setValue(digits);
          if (digits.length === 4) {
            onComplete(digits);
            setValue("");
          }
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </div>
  );
}

// ─── The vault: who's unlocked, and the dialog that asks ───────────────────

/** "needs-pin": no PIN yet; PINs are set on the profile page. */
type Mode = "needs-pin" | "unlock";

type Vault = {
  status: VaultStatus;
  /** This locked folder was opened with the PIN for the current visit. */
  isOpen: (folderId: string) => boolean;
  /**
   * Asks for the PIN (or points to the profile to set one). With a folder, opens that
   * folder for this visit; without one, only checks the PIN. Resolves true when done.
   */
  ensureUnlocked: (folderId?: string) => Promise<boolean>;
};

const VaultContext = createContext<Vault | null>(null);

/** Without a provider (pages that don't use locked folders), just try: the server still checks. */
const noVault: Vault = {
  status: { hasPin: false, blockedUntil: null, openFolders: [], pinChecked: false },
  isOpen: () => false,
  ensureUnlocked: async () => true,
};

export function useVault(): Vault {
  return use(VaultContext) ?? noVault;
}


export function VaultProvider({ status, children }: { status: VaultStatus; children: ReactNode }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [mode, setMode] = useState<Mode>("unlock");
  /** The folder the open dialog will open, or null to only check the PIN. */
  const [askFor, setAskFor] = useState<string | null>(null);
  const isOpen = (folderId: string) => status.openFolders.includes(folderId);

  function finish(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    dialogRef.current?.close();
    if (ok) router.refresh();
  }

  const ensureUnlocked = (folderId?: string) => {
    if (folderId ? isOpen(folderId) : status.pinChecked) return Promise.resolve(true);
    setAskFor(folderId ?? null);
    setMode(status.hasPin ? "unlock" : "needs-pin");
    dialogRef.current?.showModal();
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  };

  return (
    <VaultContext value={{ status, isOpen, ensureUnlocked }}>
      {children}
      <dialog
        ref={dialogRef}
        aria-label={mode === "needs-pin" ? "Set a PIN first" : "Enter your PIN"}
        onClose={() => {
          // Closed with Escape or the X: whoever asked gets a "no".
          resolver.current?.(false);
          resolver.current = null;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up"
      >
        <div className="relative p-7">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
          >
            <XIcon className="size-4" />
          </button>
          {/* Keyed by mode so each opening starts fresh. */}
          {mode === "needs-pin" ? (
            <NeedsPin />
          ) : (
            <UnlockPin key={askFor ?? "pin"} folderId={askFor} blockedUntil={status.blockedUntil} onDone={() => finish(true)} />
          )}
        </div>
      </dialog>
    </VaultContext>
  );
}

function LockBadge({ open = false }: { open?: boolean }) {
  return (
    <div className="relative mx-auto w-fit">
      <span className="relative grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
        {open ? <UnlockIcon className="size-6" /> : <LockIcon className="size-6" />}
      </span>
    </div>
  );
}

function Message({ result }: { result: Extract<VaultResult, { ok: false }> | null }) {
  if (!result) return <p className="min-h-5" />;
  return (
    <p role="alert" className="flex min-h-5 items-start justify-center gap-1.5 text-sm text-danger">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      {result.message}
      {result.blockedUntil && ` Try again after ${new Date(result.blockedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}
    </p>
  );
}

/** No PIN yet: locked folders need one, and it's set on the profile page. */
function NeedsPin() {
  return (
    <div className="space-y-5 text-center">
      <LockBadge />
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Set a PIN first</h2>
        <p className="mt-1.5 text-sm text-muted">
          Locked folders open with a 4-digit PIN. Set yours on your profile, where you also choose which folders to lock.
        </p>
      </div>
      <Link
        href="/profile#pin"
        className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand/90"
      >
        Set a PIN in your profile
      </Link>
    </div>
  );
}

/** Choose a PIN, then type it again. */
export function SetupPin({
  onDone,
  title = "Create a 4-digit PIN",
}: {
  onDone: () => void;
  title?: string;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<VaultResult, { ok: false }> | null>(null);
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  function confirm(pin: string) {
    if (!first) {
      setFirst(pin);
      setResult(null);
      return;
    }
    startTransition(async () => {
      const outcome = await createPin(first, pin);
      if (outcome.ok) onDone();
      else {
        setResult(outcome);
        setFirst(null);
      }
    });
  }

  return (
    <div className="space-y-5 text-center" aria-labelledby={titleId}>
      <LockBadge />
      <div>
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">
          {first ? "Type it again" : title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {first
            ? "To make sure it's the one you meant."
            : "One PIN for all your locked folders. You'll enter it each time you open one."}
        </p>
      </div>
      <PinInput key={first ? "confirm" : "first"} label={first ? "Repeat the PIN" : "New PIN"} onComplete={confirm} disabled={pending} invalid={Boolean(result)} />
      {pending ? (
        <p className="flex min-h-5 items-center justify-center gap-2 text-sm text-muted">
          <SpinnerIcon /> Saving your PIN…
        </p>
      ) : (
        <Message result={result} />
      )}
    </div>
  );
}

/** Enter the PIN; or, having forgotten it, sign in again to remove it. */
export function UnlockPin({
  onDone,
  blockedUntil,
  folderId = null,
  title = "Enter your PIN",
}: {
  onDone: () => void;
  blockedUntil: string | null;
  /** Opens this folder for the visit; without it, the PIN is only checked. */
  folderId?: string | null;
  title?: string;
}) {
  const [result, setResult] = useState<Extract<VaultResult, { ok: false }> | null>(
    blockedUntil ? { ok: false, message: "Too many wrong tries. PIN entry is paused for a little while.", blockedUntil } : null,
  );
  const [attempt, setAttempt] = useState(0);
  const [forgot, setForgot] = useState(false);
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  function submit(pin: string) {
    startTransition(async () => {
      const outcome = await unlockWithPin(pin, folderId);
      if (outcome.ok) onDone();
      else {
        setResult(outcome);
        setAttempt((n) => n + 1);
      }
    });
  }

  if (forgot) {
    return (
      <div className="space-y-5 text-center">
        <LockBadge />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Forgot your PIN?</h2>
          <p className="mt-1.5 text-sm text-muted">
            Sign in again with your password, and you can remove the PIN. Your locked folders unlock; nothing in them is
            deleted, and you can set a new PIN.
          </p>
        </div>
        <form action={signInToRemovePin} className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => setForgot(false)}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-subtle"
          >
            Back
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand/90"
          >
            Sign in again
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center" aria-labelledby={titleId}>
      <LockBadge />
      <div>
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {folderId ? "It locks again as soon as you leave." : "Your PIN keeps locked folders private."}
        </p>
      </div>
      <PinInput key={attempt} label="PIN" onComplete={submit} disabled={pending} invalid={Boolean(result)} />
      {pending ? (
        <p className="flex min-h-5 items-center justify-center gap-2 text-sm text-muted">
          <SpinnerIcon /> Checking…
        </p>
      ) : (
        <Message result={result} />
      )}
      <button
        type="button"
        onClick={() => setForgot(true)}
        className="text-sm font-medium text-brand hover:underline"
      >
        Forgot PIN?
      </button>
    </div>
  );
}

// ─── In the page ────────────────────────────────────────────────────────────

/**
 * Shown instead of a locked folder's links until its PIN is entered, on every visit.
 * The page centres it in the space beside the sidebar.
 */
export function LockedFolderScreen({ folderId, name, icon }: { folderId: string; name: string; icon?: string }) {
  const router = useRouter();
  const { status } = useVault();
  return (
    <div className="w-full max-w-sm motion-safe:animate-fade-up">
      <section className="rounded-2xl border border-line bg-surface p-8 shadow-xl shadow-black/5">
        <UnlockPin
          title={`${icon ? `${icon} ` : ""}“${name}” is locked`}
          folderId={folderId}
          blockedUntil={status.blockedUntil}
          onDone={() => router.refresh()}
        />
      </section>
      <p className="mt-4 text-center text-sm">
        <Link href="/" className="text-muted transition-colors hover:text-ink">
          ← Back to all links
        </Link>
      </p>
    </div>
  );
}

/** The folder being left, waiting a moment in case React mounts it again at once (development). */
let leaving: { folderId: string; timer: ReturnType<typeof setTimeout> } | null = null;

/**
 * The bar inside an open locked folder. While the folder is on screen it stays open;
 * leaving it (another view, another folder, closing or reloading the tab) locks it again.
 */
export function FolderSession({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (leaving?.folderId === folderId) {
      clearTimeout(leaving.timer);
      leaving = null;
    }
    // Still here: keep it open (the server locks it 3 minutes after the last of these).
    const keepOpen = setInterval(() => {
      if (document.visibilityState === "visible") void keepFolderOpen(folderId);
    }, 60_000);
    // Back from another tab: check it hasn't locked meanwhile.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    // Closing or reloading the tab: lock it on the way out.
    const onLeavePage = () => navigator.sendBeacon("/api/vault/lock");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeavePage);
    return () => {
      clearInterval(keepOpen);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeavePage);
      leaving = {
        folderId,
        timer: setTimeout(() => {
          leaving = null;
          void lockNow(folderId);
        }, 400),
      };
    };
  }, [folderId, router]);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
      <UnlockIcon className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">Unlocked. It locks again as soon as you leave this folder.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await lockNow(folderId);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-60"
      >
        {pending ? <SpinnerIcon className="size-3.5" /> : <LockIcon className="size-3.5" />}
        Lock
      </button>
    </div>
  );
}

/** After signing in again from "Forgot PIN?": confirm removing the PIN. */
export function RemovePinPrompt({ returnTo = "/profile" }: { returnTo?: string }) {
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Extract<VaultResult, { ok: false }> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function leave() {
    dialogRef.current?.close();
    router.replace(returnTo);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => router.replace(returnTo)}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-7 text-center text-base text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="space-y-5">
        <LockBadge open />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Remove your PIN?</h2>
          <p className="mt-1.5 text-sm text-muted">
            Every locked folder unlocks. Their links stay where they are, and you can set a new PIN and lock them again.
          </p>
        </div>
        <Message result={result} />
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={leave}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-subtle"
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await removePin();
                if (outcome.ok) {
                  toast.show({ message: "PIN removed. Your folders are unlocked." });
                  leave();
                } else setResult(outcome);
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-on-brand hover:bg-danger/90 disabled:opacity-60"
          >
            {pending && <SpinnerIcon />}
            Remove PIN
          </button>
        </div>
      </div>
    </dialog>
  );
}
