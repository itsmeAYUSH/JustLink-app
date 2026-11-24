"use client";

import {
  createContext,
  use,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { createFolders, moveLinks, type CreateFoldersState } from "@/app/actions";
import { lockNow } from "@/app/vault-actions";
import { FOLDER_ICONS, FOLDER_PRESETS, folderKey, type Folder } from "@/lib/folders";
import { CheckIcon, FolderMoveIcon, FolderPlusIcon, PlusIcon, SpinnerIcon, XIcon } from "./icons";
import { idsFormData, useToast } from "./toast";
import { useVault } from "./vault";

const FoldersContext = createContext<Folder[]>([]);

/** Makes the user's folders available to the move menus and the New folder dialog. */
export function FoldersProvider({ folders, children }: { folders: Folder[]; children: ReactNode }) {
  return <FoldersContext value={folders}>{children}</FoldersContext>;
}

function useFolders(): Folder[] {
  return use(FoldersContext);
}

// ─── New folder ─────────────────────────────────────────────────────────────

const idle: CreateFoldersState = { status: "idle" };

/** Opens the New folder dialog. "sidebar" is a list row; "icon" a small + beside the Folders heading. */
export function NewFolderButton({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-haspopup="dialog"
          title="New folder"
          aria-label="New folder"
          className="grid size-6 place-items-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
        >
          <PlusIcon className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          <span className="grid size-5 place-items-center">
            <FolderPlusIcon className="size-4" />
          </span>
          New folder
        </button>
      )}
      <NewFolderDialog dialogRef={dialogRef} />
    </>
  );
}

function NewFolderDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const folders = useFolders();
  const toast = useToast();
  const titleId = useId();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [picked, setPicked] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState<CreateFoldersState, FormData>(async (previous, formData) => {
    const result = await createFolders(previous, formData);
    if (result.status === "success") {
      dialogRef.current?.close();
      toast.show({ message: result.message ?? "Folder created" });
    }
    return result;
  }, idle);

  const existing = new Set(folders.map((folder) => folderKey(folder.name)));
  const total = (name.trim() ? 1 : 0) + picked.length;

  function reset() {
    setName("");
    setIcon("📁");
    setPicked([]);
  }

  function togglePreset(presetName: string) {
    setPicked((current) =>
      current.includes(presetName) ? current.filter((item) => item !== presetName) : [...current, presetName],
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={reset}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up"
    >
      <form action={formAction} className="p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              New folder
            </h2>
            <p className="mt-1 text-sm text-muted">
              Make your own, or pick ready-made folders. You can rename them any time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <label htmlFor={`${titleId}-name`} className="mt-6 block text-sm font-medium">
          Your own folder
        </label>
        <div className="mt-2 flex gap-2">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-subtle text-xl"
          >
            {icon}
          </span>
          <input
            id={`${titleId}-name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoComplete="off"
            placeholder="e.g. Side project, Clients, Research"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <input type="hidden" name="icon" value={icon} />
        </div>
        <div role="radiogroup" aria-label="Folder icon" className="mt-2 flex flex-wrap gap-1">
          {FOLDER_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={icon === emoji}
              aria-label={emoji}
              onClick={() => setIcon(emoji)}
              className={`grid size-8 place-items-center rounded-lg text-lg transition ${
                icon === emoji
                  ? "bg-brand-soft ring-2 ring-brand"
                  : "hover:bg-subtle"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm font-medium">Ready-made folders</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FOLDER_PRESETS.map((preset) => {
            const have = existing.has(folderKey(preset.name));
            const on = picked.includes(preset.name);
            return (
              <label
                key={preset.name}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-brand/40 ${
                  have
                    ? "cursor-default border-line opacity-50"
                    : on
                      ? "cursor-pointer border-brand bg-brand-soft"
                      : "cursor-pointer border-line hover:border-line hover:bg-subtle"
                }`}
              >
                <input
                  type="checkbox"
                  name="preset"
                  value={preset.name}
                  checked={on}
                  disabled={have}
                  onChange={() => togglePreset(preset.name)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="text-lg">
                  {preset.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{preset.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {have ? "Already added" : preset.hint}
                  </span>
                </span>
                {(on || have) && <CheckIcon className="size-4 shrink-0 text-brand" strokeWidth={2.5} />}
              </label>
            );
          })}
        </div>

        {state.status === "error" && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {state.message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={pending}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={total === 0 || pending}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <>
                <SpinnerIcon />
                Creating…
              </>
            ) : total > 1 ? (
              `Create ${total} folders`
            ) : (
              "Create folder"
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ─── Move to folder ─────────────────────────────────────────────────────────

/**
 * A button with a menu of folders that moves links into one (or into a new folder named in
 * the menu). "icon" sits on cards and rows; "bar" in the selection bar.
 */
export function MoveToFolderButton({
  ids,
  currentFolderId,
  variant = "icon",
  className = "",
  onMoved,
}: {
  ids: string[];
  /** The folder the link is in now (null: no folder), marked in the menu. Leave out for several links. */
  currentFolderId?: string | null;
  variant?: "icon" | "bar";
  className?: string;
  onMoved?: () => void;
}) {
  const folders = useFolders();
  const toast = useToast();
  const vault = useVault();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [working, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  // Place the menu next to its button as it opens: below it, or above when there's more room there.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = (event: Event) => {
      const trigger = triggerRef.current;
      if ((event as ToggleEvent).newState !== "open" || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < 320 && rect.top > spaceBelow;
      menu.style.top = openAbove ? "auto" : `${rect.bottom + 6}px`;
      menu.style.bottom = openAbove ? `${window.innerHeight - rect.top + 6}px` : "auto";
      menu.style.maxHeight = `${Math.max(160, (openAbove ? rect.top : spaceBelow) - 16)}px`;
      // Line up with the button's right edge, kept on screen.
      menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      menu.style.left = "auto";
    };
    menu.addEventListener("beforetoggle", place);
    return () => menu.removeEventListener("beforetoggle", place);
  }, []);

  async function move(target: { folder: string } | { newFolder: string }) {
    const formData = idsFormData(ids);
    if ("newFolder" in target) formData.append("new_folder", target.newFolder);
    else formData.append("folder", target.folder);
    menuRef.current?.hidePopover();
    // Into a locked folder: its PIN first, and it locks again straight after.
    const into = "folder" in target ? folders.find((folder) => folder.id === target.folder) : undefined;
    const relock = into?.locked && !vault.isOpen(into.id) ? into.id : null;
    if (into?.locked && !(await vault.ensureUnlocked(into.id))) return;
    startTransition(async () => {
      const result = await moveLinks(null, formData);
      if (result?.error) {
        toast.show({ message: result.error, tone: "error" });
        return;
      }
      setNewName("");
      const moved = result?.count ?? ids.length;
      const folder = result?.folder;
      toast.show({
        message: folder
          ? moved === 1
            ? `Moved to ${folder.icon} ${folder.name}`
            : `Moved ${moved} links to ${folder.icon} ${folder.name}`
          : moved === 1
            ? "Taken out of its folder"
            : `Took ${moved} links out of their folders`,
      });
      onMoved?.();
      if (relock) void lockNow(relock);
    });
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        disabled={working || ids.length === 0}
        title="Move to folder"
        aria-label={variant === "icon" ? "Move to folder" : undefined}
        aria-haspopup="menu"
        className={
          variant === "icon"
            ? `relative z-10 inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-brand-soft hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none disabled:cursor-wait ${className}`
            : className
        }
      >
        {working ? <SpinnerIcon className="size-4" /> : <FolderMoveIcon className="size-4" />}
        {variant === "bar" && "Move to…"}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label="Move to folder"
        className="fixed inset-auto m-0 w-64 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 text-left text-sm font-normal text-ink shadow-2xl"
      >
        <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted">
          {ids.length === 1 ? "Move to folder" : `Move ${ids.length} links to`}
        </p>
        <button type="button" role="menuitem" onClick={() => void move({ folder: "" })} className={item}>
          <span aria-hidden="true" className="w-5 text-center">
            📥
          </span>
          <span className="min-w-0 flex-1 truncate">No folder</span>
          {currentFolderId === null && <CheckIcon className="size-4 text-brand" />}
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            role="menuitem"
            onClick={() => void move({ folder: folder.id })}
            className={item}
          >
            <span aria-hidden="true" className="w-5 text-center">
              {folder.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {folder.locked && (
              <span aria-label="Locked" title="Locked" className="text-xs">
                🔒
              </span>
            )}
            {currentFolderId === folder.id && <CheckIcon className="size-4 text-brand" />}
          </button>
        ))}
        <div aria-hidden="true" className="my-1.5 h-px bg-subtle" />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim()) void move({ newFolder: newName.trim() });
          }}
          className="flex items-center gap-1.5 px-1.5"
        >
          <FolderPlusIcon className="size-4 shrink-0 text-muted" />
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={60}
            placeholder="New folder…"
            aria-label="New folder name"
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none placeholder:text-muted"
          />
          {newName.trim() && (
            <button
              type="submit"
              className="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-medium text-on-brand hover:bg-brand/90"
            >
              Create
            </button>
          )}
        </form>
      </div>
    </>
  );
}
