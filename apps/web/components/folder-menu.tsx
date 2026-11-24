"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition, type RefObject } from "react";
import { deleteFolder, setCollectionPublic, updateCollection, type CollectionState } from "@/app/actions";
import { lockNow } from "@/app/vault-actions";
import { FOLDER_ICONS } from "@/lib/folders";
import { TRASH_DAYS } from "@/lib/links";
import { DeleteDialog } from "./delete-dialog";
import { CheckIcon, CopyIcon, LinkIcon, MoreIcon, PencilIcon, SpinnerIcon, TrashIcon, XIcon } from "./icons";
import { useToast } from "./toast";
import { useVault } from "./vault";

type MenuFolder = { id: string; name: string; icon: string; isPublic: boolean; isLocked: boolean; shareId: string };

const item =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none disabled:opacity-50";

const idle: CollectionState = { status: "idle" };

/**
 * The ⋯ menu of a folder: rename it, share it, copy its link or delete it. "title" sits
 * beside the open folder's name; "row" over the folder's row in the sidebar. A locked
 * folder asks for the PIN before it's renamed or deleted from outside it.
 */
export function FolderMenu({
  folder,
  shareUrl = null,
  linkCount,
  current,
  variant = "title",
}: {
  folder: MenuFolder;
  shareUrl?: string | null;
  /** Links in the folder (not counting archived ones), or null while a locked folder is closed. */
  linkCount: number | null;
  /** This folder is the one on screen, so deleting it goes back to All links. */
  current: boolean;
  variant?: "title" | "row";
}) {
  const router = useRouter();
  const toast = useToast();
  const vault = useVault();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [sharing, startSharing] = useTransition();
  const [linkChoice, setLinkChoice] = useState<"keep" | "trash">("keep");
  /** Opened with the PIN just to rename or delete it: lock it again afterwards. */
  const relock = useRef(false);

  // Open the menu under its button, lined up with its left edge.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = (event: Event) => {
      const trigger = triggerRef.current;
      if ((event as ToggleEvent).newState !== "open" || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 272))}px`;
      menu.style.right = "auto";
      menu.style.bottom = "auto";
    };
    menu.addEventListener("beforetoggle", place);
    return () => menu.removeEventListener("beforetoggle", place);
  }, []);

  const link = () => shareUrl ?? `${window.location.origin}/s/${folder.shareId}`;

  /** A locked folder that isn't open asks for the PIN first. False when that's cancelled. */
  async function openFirst(): Promise<boolean> {
    if (!folder.isLocked || vault.isOpen(folder.id)) return true;
    if (!(await vault.ensureUnlocked(folder.id))) return false;
    relock.current = true;
    return true;
  }

  function lockAgain() {
    if (!relock.current) return;
    relock.current = false;
    void lockNow(folder.id).then(() => router.refresh());
  }

  async function copyLink() {
    menuRef.current?.hidePopover();
    await navigator.clipboard.writeText(link());
    toast.show({ message: "Share link copied" });
  }

  function toggleSharing() {
    menuRef.current?.hidePopover();
    const formData = new FormData();
    formData.append("id", folder.id);
    formData.append("value", String(!folder.isPublic));
    startSharing(async () => {
      await setCollectionPublic(formData);
      if (folder.isPublic) {
        toast.show({ message: "Sharing stopped. The link no longer works." });
      } else {
        await navigator.clipboard.writeText(link()).catch(() => {});
        toast.show({ message: "Shared publicly. Link copied." });
      }
      router.refresh();
    });
  }

  async function openRename() {
    menuRef.current?.hidePopover();
    if (await openFirst()) renameRef.current?.showModal();
  }

  async function openDelete() {
    menuRef.current?.hidePopover();
    if (!(await openFirst())) return;
    setLinkChoice("keep");
    deleteRef.current?.showModal();
    cancelRef.current?.focus();
  }

  const [deleteState, deleteAction, deleting] = useActionState<CollectionState, FormData>(async (previous, formData) => {
    const result = await deleteFolder(previous, formData);
    if (result.status === "success") {
      relock.current = false; // nothing left to lock
      deleteRef.current?.close();
      toast.show({ message: result.message ?? "Folder deleted" });
      if (current) router.push("/");
      else router.refresh();
    }
    return result;
  }, idle);

  const count = linkCount;
  const links = count === null ? "its links" : count === 1 ? "its link" : `its ${count} links`;
  const trashingLinks = linkChoice === "trash" && count !== 0;

  return (
    <>
      {variant === "title" && folder.isPublic && (
        <button
          type="button"
          onClick={() => void copyLink()}
          title="Copy the share link"
          className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink transition-colors hover:bg-brand-soft"
        >
          <LinkIcon className="size-3" />
          Shared
        </button>
      )}
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        title="Folder options"
        aria-label={variant === "row" ? `Options for ${folder.name}` : "Folder options"}
        aria-haspopup="menu"
        disabled={sharing}
        className={`grid place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none ${
          variant === "row" ? "size-7 hover:bg-line/60" : "size-8"
        }`}
      >
        {sharing ? <SpinnerIcon className="size-4" /> : <MoreIcon className={variant === "row" ? "size-4" : "size-5"} />}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label="Folder options"
        className="fixed inset-auto m-0 w-64 rounded-xl border border-line bg-surface p-1.5 text-left text-sm font-normal text-ink shadow-2xl"
      >
        <button type="button" role="menuitem" className={item} onClick={() => void openRename()}>
          <PencilIcon className="size-4 text-muted" />
          Rename or change icon
        </button>
        {folder.isLocked ? (
          <p className="flex items-center gap-2.5 px-2.5 py-2 text-muted">
            <LinkIcon className="size-4" />
            Locked folders can&apos;t be shared
          </p>
        ) : (
          <>
            <button type="button" role="menuitem" className={item} onClick={toggleSharing}>
              <LinkIcon className="size-4 text-muted" />
              {folder.isPublic ? "Stop sharing" : "Share publicly"}
            </button>
            {folder.isPublic && (
              <button type="button" role="menuitem" className={item} onClick={() => void copyLink()}>
                <CopyIcon className="size-4 text-muted" />
                Copy share link
              </button>
            )}
          </>
        )}
        <div aria-hidden="true" className="my-1.5 h-px bg-subtle" />
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger hover:bg-danger-soft`}
          onClick={() => void openDelete()}
        >
          <TrashIcon className="size-4" />
          Delete folder
        </button>
      </div>

      <RenameDialog dialogRef={renameRef} folder={folder} onClose={lockAgain} />

      <DeleteDialog
        ref={deleteRef}
        cancelRef={cancelRef}
        id={`delete-folder-${folder.id}-${variant}`}
        heading="Delete this folder?"
        subject={
          <p>
            {folder.icon} {folder.name}
          </p>
        }
        description={count === 0 ? "There are no links in it." : `What should happen to ${links}?`}
        options={
          count !== 0 && (
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">The links in this folder</legend>
              <LinkChoice
                value="keep"
                checked={linkChoice === "keep"}
                onPick={setLinkChoice}
                title={`Keep ${links}`}
                hint={
                  folder.isLocked
                    ? "They move to No folder, where they're no longer locked."
                    : "They move to No folder."
                }
              />
              <LinkChoice
                value="trash"
                checked={linkChoice === "trash"}
                onPick={setLinkChoice}
                title={`Delete ${links} too`}
                hint={`They go to the Trash, where you can restore them for ${TRASH_DAYS} days.`}
                danger
              />
            </fieldset>
          )
        }
        confirmLabel={
          trashingLinks ? (count === null ? "Delete folder and links" : `Delete folder and ${count === 1 ? "link" : `${count} links`}`) : "Delete folder"
        }
        action={deleteAction}
        pending={deleting}
        error={deleteState.status === "error" ? deleteState.message : undefined}
        onClose={lockAgain}
      >
        <input type="hidden" name="id" value={folder.id} />
        <input type="hidden" name="links" value={trashingLinks ? "trash" : "keep"} />
      </DeleteDialog>
    </>
  );
}

function LinkChoice({
  value,
  checked,
  onPick,
  title,
  hint,
  danger = false,
}: {
  value: "keep" | "trash";
  checked: boolean;
  onPick: (value: "keep" | "trash") => void;
  title: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:ring-2 ${
        checked
          ? danger
            ? "border-danger/40 bg-danger-soft has-focus-visible:ring-danger/30"
            : "border-brand/40 bg-brand-soft has-focus-visible:ring-brand/30"
          : "border-line hover:bg-subtle has-focus-visible:ring-brand/30"
      }`}
    >
      <input
        type="radio"
        name="link-choice"
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
        className={`mt-0.5 size-4 shrink-0 ${danger ? "accent-danger" : "accent-brand"}`}
      />
      <span className="min-w-0">
        <span className={`block font-medium ${checked && danger ? "text-danger" : "text-ink"}`}>{title}</span>
        <span className="mt-0.5 block text-muted">{hint}</span>
      </span>
    </label>
  );
}

function RenameDialog({
  dialogRef,
  folder,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  folder: MenuFolder;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const titleId = useId();
  const [icon, setIcon] = useState(folder.icon);
  const [state, formAction, pending] = useActionState<CollectionState, FormData>(async (previous, formData) => {
    const result = await updateCollection(previous, formData);
    if (result.status === "success") {
      dialogRef.current?.close();
      toast.show({ message: "Folder renamed" });
      router.refresh();
    }
    return result;
  }, idle);
  const icons = FOLDER_ICONS.includes(folder.icon) ? FOLDER_ICONS : [folder.icon, ...FOLDER_ICONS];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up"
    >
      <form action={formAction} className="p-6">
        <input type="hidden" name="id" value={folder.id} />
        <input type="hidden" name="icon" value={icon} />
        <div className="flex items-start gap-4">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold">
            Rename folder
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-subtle text-xl"
          >
            {icon}
          </span>
          <input
            name="name"
            defaultValue={folder.name}
            required
            maxLength={60}
            aria-label="Folder name"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </div>
        <div role="radiogroup" aria-label="Folder icon" className="mt-2 flex flex-wrap gap-1">
          {icons.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={icon === emoji}
              aria-label={emoji}
              onClick={() => setIcon(emoji)}
              className={`grid size-8 place-items-center rounded-lg text-lg transition ${
                icon === emoji ? "bg-brand-soft ring-2 ring-brand" : "hover:bg-subtle"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {state.status === "error" && <p className="mt-3 text-sm text-danger">{state.message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand/90 disabled:opacity-60"
          >
            {pending ? <SpinnerIcon /> : <CheckIcon className="size-4" />}
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
