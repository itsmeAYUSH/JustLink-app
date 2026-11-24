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
import { FOLDER_ICONS, FOLDER_PRESETS, folderKey, QUICK_START_FOLDERS, type Folder } from "@/lib/folders";
import { CheckIcon, FolderMoveIcon, FolderPlusIcon, SpinnerIcon, XIcon } from "./icons";
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

/** Opens the New folder dialog. "sidebar" is a list row; "chip" fits the folder tabs. */
export function NewFolderButton({ variant = "sidebar" }: { variant?: "sidebar" | "chip" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className={
          variant === "sidebar"
            ? "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-400/60 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
        }
      >
        {variant === "sidebar" ? (
          <span className="grid w-5 place-items-center">
            <FolderPlusIcon className="size-4" />
          </span>
        ) : (
          <FolderPlusIcon className="size-4" />
        )}
        New folder
      </button>
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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-left text-base font-normal text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <form action={formAction} className="p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              New folder
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Make your own, or pick ready-made folders. You can rename them any time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-xl dark:border-zinc-700 dark:bg-zinc-800"
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
            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-indigo-400"
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
                  ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-500/20 dark:ring-indigo-400"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-500/40 ${
                  have
                    ? "cursor-default border-zinc-200 opacity-50 dark:border-zinc-800"
                    : on
                      ? "cursor-pointer border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                      : "cursor-pointer border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
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
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {have ? "Already added" : preset.hint}
                  </span>
                </span>
                {(on || have) && <CheckIcon className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" strokeWidth={2.5} />}
              </label>
            );
          })}
        </div>

        {state.status === "error" && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={total === 0 || pending}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
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

/** For people with no folders yet: one click makes a ready-made folder. */
export function QuickStartFolders() {
  const toast = useToast();
  const [working, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function create(names: string[]) {
    const formData = new FormData();
    for (const name of names) formData.append("preset", name);
    setBusy(names.length === 1 ? (names[0] ?? null) : "all");
    startTransition(async () => {
      const result = await createFolders(idle, formData);
      toast.show({ message: result.message ?? "Done", tone: result.status === "error" ? "error" : "success" });
      setBusy(null);
    });
  }

  return (
    <>
      <span className="shrink-0 pl-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Quick start:</span>
      {QUICK_START_FOLDERS.map((preset) => (
        <button
          key={preset.name}
          type="button"
          disabled={working}
          onClick={() => create([preset.name])}
          title={preset.hint}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-400/60 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
        >
          {busy === preset.name || busy === "all" ? <SpinnerIcon className="size-3.5" /> : <span aria-hidden="true">+</span>}
          {preset.icon} {preset.name}
        </button>
      ))}
      <button
        type="button"
        disabled={working}
        onClick={() => create(QUICK_START_FOLDERS.map((preset) => preset.name))}
        className="shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
      >
        Add all {QUICK_START_FOLDERS.length}
      </button>
    </>
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
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800";

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
            ? `relative z-10 inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-wait dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300 ${className}`
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
        className="fixed inset-auto m-0 w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 text-left text-sm font-normal text-zinc-800 shadow-2xl shadow-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-black/50"
      >
        <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {ids.length === 1 ? "Move to folder" : `Move ${ids.length} links to`}
        </p>
        <button type="button" role="menuitem" onClick={() => void move({ folder: "" })} className={item}>
          <span aria-hidden="true" className="w-5 text-center">
            📥
          </span>
          <span className="min-w-0 flex-1 truncate">No folder</span>
          {currentFolderId === null && <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-300" />}
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
            {currentFolderId === folder.id && <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-300" />}
          </button>
        ))}
        <div aria-hidden="true" className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-800" />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim()) void move({ newFolder: newName.trim() });
          }}
          className="flex items-center gap-1.5 px-1.5"
        >
          <FolderPlusIcon className="size-4 shrink-0 text-zinc-400" />
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={60}
            placeholder="New folder…"
            aria-label="New folder name"
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none placeholder:text-zinc-400"
          />
          {newName.trim() && (
            <button
              type="submit"
              className="shrink-0 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Create
            </button>
          )}
        </form>
      </div>
    </>
  );
}
