"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { signOut } from "@/app/actions";
import {
  changePassword,
  deleteAccount,
  removeAvatar,
  updateName,
  uploadAvatar,
  type ProfileState,
} from "@/app/profile-actions";
import { lockNow, removeKnownPin, setFolderLock, signInToRemovePin } from "@/app/vault-actions";
import { AVATAR_SIZE, type Profile } from "@/lib/profile";
import type { VaultStatus } from "@/lib/vault";
import { Avatar } from "./avatar";
import { AlertIcon, CheckIcon, LockIcon, MailIcon, SpinnerIcon, TrashIcon } from "./icons";
import { SubmitButton } from "./submit-button";
import { useToast } from "./toast";
import { SetupPin, UnlockPin, useVault } from "./vault";

const idle: ProfileState = { status: "idle" };

const field =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-60";

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
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="p-6">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <div className="mt-5">{children}</div>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-subtle/70 px-6 py-3">
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
      className={`mr-auto flex items-start gap-1.5 text-sm ${good ? "text-brand-ink" : "text-danger"}`}
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
          dragging ? "border-brand bg-brand-soft/60" : "border-transparent"
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
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/50 text-canvas">
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand/90 disabled:opacity-60"
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
          <p className="text-xs text-muted">Or drop a picture here. JPEG, PNG or WebP.</p>
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

/** The address the account signs in with. Each account has one, and it can't be changed. */
export function EmailSection({ email }: { email: string | null }) {
  return (
    <Section title="Email" description="The address you sign in with. Each account has one email, and it can't be changed.">
      <p className="flex h-11 max-w-sm items-center gap-2.5 rounded-xl border border-line bg-subtle px-3.5 text-sm text-ink">
        <MailIcon className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{email ?? "No email"}</span>
        <LockIcon className="size-3.5 shrink-0 text-muted" aria-label="Can't be changed" />
      </p>
    </Section>
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
        <p className="text-sm text-muted">
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
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-on-brand hover:bg-danger/90 disabled:opacity-60"
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
        <div className="rounded-2xl border border-line bg-subtle/60 p-6">
          {body}
          {step !== "remove-confirm" && <div className="mt-5 flex justify-center">{cancel}</div>}
        </div>
      ) : status.hasPin ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
              <LockIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">PIN is set · {folders}</p>
              <p className="text-xs text-muted">Locked folders ask for it every time they&apos;re opened.</p>
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
              <button type="submit" className="text-sm font-medium text-brand hover:underline">
                Forgot PIN?
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-line px-4 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-subtle text-muted">
            <LockIcon className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">
            No PIN yet. Set one to lock folders you want to keep private.
          </p>
          <button
            type="button"
            onClick={() => setStep("setup")}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand/90"
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
        <p className="mb-4 rounded-xl bg-subtle px-3.5 py-2.5 text-sm text-muted">
          Set a PIN above first, then lock any folder here.
        </p>
      )}
      {folders.length === 0 ? (
        <p className="text-sm text-muted">You don&apos;t have any folders yet.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {folders.map((folder) => (
            <li key={folder.id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden="true" className="w-6 text-center text-lg">
                {folder.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
              {folder.locked && <LockIcon className="size-4 text-brand" />}
              <button
                type="button"
                role="switch"
                aria-checked={folder.locked}
                aria-label={`Lock ${folder.name}`}
                disabled={!hasPin || busy !== null}
                onClick={() => void toggle(folder)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                  folder.locked ? "bg-brand" : "bg-line"
                }`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full bg-surface shadow transition-transform ${
                    folder.locked ? "translate-x-5.5" : "translate-x-0.5"
                  }`}
                >
                  {busy === folder.id && <SpinnerIcon className="size-3 text-muted" />}
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

/** Closes the account after the password is entered again; see deleteAccount for what that does. */
export function DeleteAccountSection({ email }: { email: string | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, formAction, pending] = useActionState(deleteAccount, idle);

  return (
    <section className="rounded-2xl border border-danger/30 bg-surface">
      <div className="flex flex-wrap items-center gap-4 p-6">
        <div className="min-w-60 flex-1">
          <h2 className="text-base font-semibold text-danger">Delete account</h2>
          <p className="mt-1 text-sm text-muted">
            Closes your account: you&apos;re signed out everywhere and can&apos;t sign in with{" "}
            {email ? <strong className="font-medium text-ink">{email}</strong> : "this email"} again. Shared folders stop
            being shared.
          </p>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-haspopup="dialog"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
        >
          <TrashIcon className="size-4" />
          Delete account
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !pending) event.currentTarget.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up"
      >
        <form action={formAction} className="p-6">
          <div className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
              <AlertIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                Delete your account?
              </h2>
              <p className="mt-2 text-sm text-muted">
                You&apos;ll be signed out on every device, and this account can&apos;t be signed in to again. Enter your
                password to confirm.
              </p>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                aria-label="Your password"
                required
                className={`${field} mt-4`}
              />
            </div>
          </div>

          {state.status === "error" && (
            <p role="alert" className="mt-4 flex items-start gap-1.5 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              {state.message}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className={secondaryButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80"
            >
              {pending ? (
                <>
                  <SpinnerIcon />
                  Deleting…
                </>
              ) : (
                "Delete account"
              )}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
