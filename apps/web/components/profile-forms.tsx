"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition, type ReactNode } from "react";
import { signOut } from "@/app/actions";
import {
  changeEmail,
  changePassword,
  removeAvatar,
  updateName,
  uploadAvatar,
  type ProfileState,
} from "@/app/profile-actions";
import { lockNow, removeKnownPin, setFolderLock, signInToRemovePin } from "@/app/vault-actions";
import { AVATAR_SIZE, type Profile } from "@/lib/profile";
import type { VaultStatus } from "@/lib/vault";
import { Avatar } from "./avatar";
import { AlertIcon, CheckIcon, LockIcon, SpinnerIcon } from "./icons";
import { SubmitButton } from "./submit-button";
import { useToast } from "./toast";
import { SetupPin, UnlockPin, useVault } from "./vault";

const idle: ProfileState = { status: "idle" };

const field =
  "h-11 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-indigo-400";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

/** A settings card: what it is on top, the controls, then a footer with the save button. */
function Section({
  id,
  title,
  description,
  children,
  footer,
}: {
  id?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="p-6">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        <div className="mt-5">{children}</div>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/70 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          {footer}
        </div>
      )}
    </section>
  );
}

function StatusLine({ state }: { state: ProfileState }) {
  if (state.status === "idle" || !state.message) return <span className="mr-auto" />;
  const good = state.status === "success";
  return (
    <p
      role={good ? "status" : "alert"}
      className={`mr-auto flex items-start gap-1.5 text-sm ${good ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
    >
      {good ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : <AlertIcon className="mt-0.5 size-4 shrink-0" />}
      {state.message}
    </p>
  );
}

// ─── Photo ──────────────────────────────────────────────────────────────────

/** Crops the picture to its centre square and shrinks it, so uploads are small and quick. */
async function squarePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize pictures.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that picture."))), "image/jpeg", 0.88),
  );
}

export function PhotoSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<ProfileState>(idle);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "That isn't a picture. Try a JPEG, PNG or WebP." });
      return;
    }
    let photo: Blob;
    try {
      photo = await squarePhoto(file);
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't read that picture." });
      return;
    }
    setPreview(URL.createObjectURL(photo));
    const formData = new FormData();
    formData.append("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
    startTransition(async () => {
      const result = await uploadAvatar(formData);
      setState(result);
      if (result.status === "success") router.refresh();
      else setPreview(null);
    });
  }

  return (
    <Section
      title="Profile photo"
      description="Shown in the top bar. Any picture works: we crop it to a square."
      footer={<StatusLine state={state} />}
    >
      <div
        className={`flex flex-wrap items-center gap-5 rounded-2xl border-2 border-dashed p-4 transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10" : "border-transparent"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void pickPhoto(event.dataTransfer.files[0]);
        }}
      >
        <div className="relative">
          <Avatar profile={profile} size={80} src={preview} />
          {pending && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white">
              <SpinnerIcon className="size-5" />
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {profile.avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {profile.avatarUrl && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeAvatar();
                    setState(result);
                    setPreview(null);
                    if (result.status === "success") router.refresh();
                  })
                }
                className={secondaryButton}
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Or drop a picture here. JPEG, PNG or WebP.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={(event) => {
            void pickPhoto(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </Section>
  );
}

// ─── Name ───────────────────────────────────────────────────────────────────

export function NameSection({ name }: { name: string | null }) {
  const [state, formAction] = useActionState(updateName, idle);
  return (
    <form action={formAction}>
      <Section
        title="Name"
        description="What JustLink calls you. Leave it empty to show your email instead."
        footer={
          <>
            <StatusLine state={state} />
            <SubmitButton pendingText="Saving…">Save name</SubmitButton>
          </>
        }
      >
        <label htmlFor="profile-name" className="sr-only">
          Name
        </label>
        <input
          id="profile-name"
          name="name"
          defaultValue={name ?? ""}
          maxLength={80}
          autoComplete="name"
          placeholder="Your name"
          className={`${field} max-w-sm`}
        />
      </Section>
    </form>
  );
}

// ─── Email ──────────────────────────────────────────────────────────────────

export function EmailSection({ email, pendingEmail }: { email: string | null; pendingEmail: string | null }) {
  const [state, formAction] = useActionState(changeEmail, idle);
  return (
    <form action={formAction}>
      <Section
        title="Email"
        description={
          <>
            You sign in with <strong className="font-medium text-zinc-800 dark:text-zinc-200">{email ?? "no email"}</strong>.
            A new address takes effect once you open the confirmation link we send.
          </>
        }
        footer={
          <>
            <StatusLine state={state} />
            <SubmitButton pendingText="Sending…">Change email</SubmitButton>
          </>
        }
      >
        {pendingEmail && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Waiting for you to confirm <strong className="font-medium">{pendingEmail}</strong>. Check that inbox.
          </p>
        )}
        <label htmlFor="profile-email" className="sr-only">
          New email
        </label>
        <input
          id="profile-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="new@example.com"
          required
          className={`${field} max-w-sm`}
        />
      </Section>
    </form>
  );
}

// ─── Password ───────────────────────────────────────────────────────────────

export function PasswordSection() {
  const [state, formAction] = useActionState(changePassword, idle);
  return (
    <form action={formAction}>
      <Section
        title="Password"
        description="Enter your current password, then the new one twice. At least 6 characters."
        footer={
          <>
            <StatusLine state={state} />
            <SubmitButton pendingText="Changing…">Change password</SubmitButton>
          </>
        }
      >
        <div className="grid max-w-sm gap-3">
          <input name="current" type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" className={field} />
          <input name="password" type="password" autoComplete="new-password" placeholder="New password" aria-label="New password" minLength={6} className={field} />
          <input name="confirm" type="password" autoComplete="new-password" placeholder="New password again" aria-label="New password again" minLength={6} className={field} />
        </div>
      </Section>
    </form>
  );
}

// ─── PIN for locked folders ─────────────────────────────────────────────────

type PinStep = "idle" | "setup" | "change-check" | "change-new" | "remove-check" | "remove-confirm";

export function PinSection({ status, lockedCount }: { status: VaultStatus; lockedCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<PinStep>("idle");
  const [pending, startTransition] = useTransition();
  const folders = lockedCount === 1 ? "1 locked folder" : `${lockedCount} locked folders`;

  /** Forgets the PIN check made for a change, so nothing stays unlocked. */
  function finished(message: string) {
    toast.show({ message });
    setStep("idle");
    void lockNow().then(() => router.refresh());
  }

  const cancel = (
    <button
      type="button"
      onClick={() => {
        setStep("idle");
        void lockNow();
      }}
      className={secondaryButton}
    >
      Cancel
    </button>
  );

  let body: ReactNode;
  if (step === "setup") {
    body = <SetupPin onDone={() => finished("PIN set. Now choose folders to lock below.")} />;
  } else if (step === "change-check" || step === "remove-check") {
    body = (
      <UnlockPin
        title="Enter your current PIN"
        blockedUntil={status.blockedUntil}
        onDone={() => setStep(step === "change-check" ? "change-new" : "remove-confirm")}
      />
    );
  } else if (step === "change-new") {
    body = <SetupPin title="Choose a new PIN" onDone={() => finished("PIN changed.")} />;
  } else if (step === "remove-confirm") {
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Remove your PIN? {lockedCount > 0 ? `Your ${folders} will unlock.` : ""} Nothing is deleted, and you can set a new PIN any time.
        </p>
        <div className="flex justify-center gap-2">
          {cancel}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeKnownPin();
                if (result.ok) finished("PIN removed. Your folders are unlocked.");
                else toast.show({ message: result.message, tone: "error" });
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {pending && <SpinnerIcon />}
            Remove PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <Section
      id="pin"
      title="PIN for locked folders"
      description="One 4-digit PIN locks any folders you choose. Like a password-protected folder, a locked folder asks for the PIN every time you open it and locks again as soon as you leave."
    >
      {body ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-6 dark:border-zinc-800 dark:bg-zinc-950/40">
          {body}
          {step !== "remove-confirm" && <div className="mt-5 flex justify-center">{cancel}</div>}
        </div>
      ) : status.hasPin ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <LockIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">PIN is set · {folders}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Locked folders ask for it every time they&apos;re opened.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setStep("change-check")} className={secondaryButton}>
              Change PIN
            </button>
            <button type="button" onClick={() => setStep("remove-check")} className={secondaryButton}>
              Remove PIN
            </button>
            <form action={signInToRemovePin} className="ml-auto">
              <button type="submit" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">
                Forgot PIN?
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-zinc-300 px-4 py-4 dark:border-zinc-700">
          <span className="grid size-9 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <LockIcon className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
            No PIN yet. Set one to lock folders you want to keep private.
          </p>
          <button
            type="button"
            onClick={() => setStep("setup")}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Set a PIN
          </button>
        </div>
      )}
    </Section>
  );
}

// ─── Which folders are locked ───────────────────────────────────────────────

type LockableFolder = { id: string; name: string; icon: string; locked: boolean };

/** Every folder with a lock switch. Changing one asks for the PIN first. */
export function LockedFoldersSection({ folders, hasPin }: { folders: LockableFolder[]; hasPin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const vault = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(folder: LockableFolder) {
    if (busy || !(await vault.ensureUnlocked())) return;
    setBusy(folder.id);
    startTransition(async () => {
      const result = await setFolderLock(folder.id, !folder.locked);
      await lockNow(); // the PIN check was for this change only
      setBusy(null);
      toast.show(
        result.ok
          ? {
              message: folder.locked
                ? `${folder.icon} ${folder.name} is no longer locked`
                : `${folder.icon} ${folder.name} is locked`,
            }
          : { message: result.message, tone: "error" },
      );
      router.refresh();
    });
  }

  return (
    <Section
      id="locked-folders"
      title="Locked folders"
      description="Choose which folders need your PIN. A locked folder is hidden everywhere else, asks for the PIN every time it's opened, and can't be shared."
    >
      {!hasPin && (
        <p className="mb-4 rounded-xl bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Set a PIN above first, then lock any folder here.
        </p>
      )}
      {folders.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You don&apos;t have any folders yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {folders.map((folder) => (
            <li key={folder.id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden="true" className="w-6 text-center text-lg">
                {folder.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
              {folder.locked && <LockIcon className="size-4 text-indigo-600 dark:text-indigo-300" />}
              <button
                type="button"
                role="switch"
                aria-checked={folder.locked}
                aria-label={`Lock ${folder.name}`}
                disabled={!hasPin || busy !== null}
                onClick={() => void toggle(folder)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                  folder.locked ? "bg-indigo-600 dark:bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full bg-white shadow transition-transform ${
                    folder.locked ? "translate-x-5.5" : "translate-x-0.5"
                  }`}
                >
                  {busy === folder.id && <SpinnerIcon className="size-3 text-zinc-500" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ─── Account ────────────────────────────────────────────────────────────────

export function AccountSection() {
  return (
    <Section title="Sign out" description="Signs you out of JustLink in this browser. Locked folders lock again here.">
      <form action={signOut}>
        <SubmitButton variant="secondary" pendingText="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </Section>
  );
}
