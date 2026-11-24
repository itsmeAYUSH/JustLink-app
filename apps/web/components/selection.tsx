"use client";

import { createContext, use, useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteLinksForever, restoreLinks, trashLinks, type LinksActionState } from "@/app/actions";
import { hasExtension, openTabsWithExtension } from "@/lib/extension-bridge";
import { DeleteDialog } from "./delete-dialog";
import { AlertIcon, CheckIcon, CheckSquareIcon, ExternalLinkIcon, RestoreIcon, SpinnerIcon, TrashIcon, XIcon } from "./icons";
import { MoveToFolderButton } from "./folders";
import { undoTrash } from "./link-trash-buttons";
import { idsFormData, useToast } from "./toast";

type Item = { id: string; title: string; url: string };

/** "library": selected links can be moved to the Trash. "trash": restored or deleted for good. */
export type SelectionMode = "library" | "trash";

type Selection = {
  selecting: boolean;
  isSelected: (id: string) => boolean;
  /** Selects or deselects one link; with Shift held, everything between it and the last one clicked. */
  toggle: (id: string) => void;
  start: () => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

/**
 * Lets people pick several links on the page and act on them together.
 * Wrap the toolbar and the links in it; cards and rows add <SelectCheckbox> and <SelectOverlay>.
 * While selecting, the wrapper carries `data-selecting`, so server-rendered markup can style itself
 * with `group-data-[selecting]/list:` variants.
 */
export function SelectionProvider({
  items,
  mode,
  hasMorePages,
  children,
}: {
  /** The links on this page, in display order (for Shift-click ranges and "Select all"). */
  items: Item[];
  mode: SelectionMode;
  hasMorePages: boolean;
  children: ReactNode;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [modeOn, setModeOn] = useState(false);
  const anchorRef = useRef<string | null>(null);
  const shiftRef = useRef(false);

  // Links deleted elsewhere, or no longer on this page, drop out of the selection.
  const selected = items.filter((item) => picked.has(item.id));
  const selecting = modeOn || selected.length > 0;

  function clear() {
    setPicked(new Set());
    setModeOn(false);
    anchorRef.current = null;
  }

  function toggle(id: string) {
    const ids = items.map((item) => item.id);
    const from = anchorRef.current ? ids.indexOf(anchorRef.current) : -1;
    const to = ids.indexOf(id);
    const range = shiftRef.current && from !== -1 && to !== -1;
    const targets = range ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];

    setPicked((current) => {
      const next = new Set(current);
      const select = !current.has(id);
      for (const target of targets) {
        if (select) next.add(target);
        else next.delete(target);
      }
      return next;
    });
    anchorRef.current = id;
  }

  // Track Shift for range selection: works the same for mouse clicks and the keyboard.
  useEffect(() => {
    const track = (event: KeyboardEvent) => {
      shiftRef.current = event.shiftKey;
    };
    const reset = () => {
      shiftRef.current = false;
    };
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
      window.removeEventListener("blur", reset);
    };
  }, []);

  // Escape leaves selection mode (unless a dialog is open: Escape closes that first).
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      setPicked(new Set());
      setModeOn(false);
      anchorRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const value: Selection = {
    selecting,
    isSelected: (id) => picked.has(id),
    toggle,
    start: () => setModeOn(true),
    clear,
  };

  return (
    <SelectionContext value={value}>
      <div className="group/list data-[selecting]:pb-24" data-selecting={selecting ? "" : undefined}>
        {children}
      </div>

      {selecting && (
        <BulkActionBar
          mode={mode}
          selected={selected}
          total={items.length}
          hasMorePages={hasMorePages}
          onSelectAll={() => setPicked(new Set(items.map((item) => item.id)))}
          onDeselectAll={() => {
            setPicked(new Set());
            setModeOn(true); // Stay in selection mode, even if it began with a checkbox.
          }}
          onClose={clear}
          onDone={clear}
        />
      )}
    </SelectionContext>
  );
}

/** The "Select" / "Cancel" button for the toolbar. */
export function SelectModeToggle() {
  const selection = use(SelectionContext);
  if (!selection) return null;
  const { selecting, start, clear } = selection;
  return (
    <button
      type="button"
      onClick={selecting ? clear : start}
      aria-pressed={selecting}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none ${
        selecting
          ? "border-brand/40 bg-brand-soft text-brand-ink"
          : "border-line bg-surface text-muted hover:bg-subtle hover:text-ink"
      }`}
    >
      {selecting ? <XIcon className="size-4" /> : <CheckSquareIcon className="size-4" />}
      {selecting ? "Cancel" : "Select"}
    </button>
  );
}

/** A link's checkbox. Shown on hover, on focus, and for every link while selecting. */
export function SelectCheckbox({ id, title }: { id: string; title: string }) {
  const selection = use(SelectionContext);
  if (!selection) return null;
  const checked = selection.isSelected(id);
  return (
    <label className="relative z-30 grid size-8 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => selection.toggle(id)}
        aria-label={`Select “${title}”`}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`grid size-5 place-items-center rounded-md border-[1.5px] transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand/50 peer-focus-visible:ring-offset-1 ${
          checked
            ? "border-brand bg-brand text-on-brand"
            : "border-muted/50 bg-surface/95 text-transparent hover:border-brand"
        }`}
      >
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    </label>
  );
}

/** While selecting, covers the whole card or row so a click anywhere on it selects instead of opening it. */
export function SelectOverlay({ id }: { id: string }) {
  const selection = use(SelectionContext);
  if (!selection?.selecting) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      // Shift-click would otherwise also select the text in between.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={() => selection.toggle(id)}
      className="absolute inset-0 z-20 cursor-pointer"
    />
  );
}

const barButton =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40";

function BulkActionBar({
  mode,
  selected,
  total,
  hasMorePages,
  onSelectAll,
  onDeselectAll,
  onClose,
  onDone,
}: {
  mode: SelectionMode;
  selected: Item[];
  total: number;
  hasMorePages: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClose: () => void;
  /** After the selected links were moved, restored or deleted. */
  onDone: () => void;
}) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [working, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Links the browser's pop-up blocker stopped last time, so "Open" can finish the job.
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const [deleteState, deleteAction, deleting] = useActionState<LinksActionState, FormData>(async (previous, formData) => {
    const result = await deleteLinksForever(previous, formData);
    if (result && !result.error) {
      dialogRef.current?.close();
      onDone();
      toast.show({ message: result.count === 1 ? "Deleted 1 link for good" : `Deleted ${result.count} links for good` });
    }
    return result;
  }, null);

  const count = selected.length;
  const ids = selected.map((item) => item.id);
  const allSelected = count > 0 && count === total;
  const stillBlocked = selected.filter((item) => blockedIds.includes(item.id));
  const shown = selected.slice(0, 3);
  const busy = working || deleting;

  // Ask once whether the extension is installed, so "Open" can use it straight away.
  useEffect(() => {
    void hasExtension();
  }, []);

  async function openTabs() {
    const toOpen = stillBlocked.length > 0 ? stillBlocked : selected;

    // The JustLink extension can open them all at once; a website gets one or two.
    const opened = await openTabsWithExtension(toOpen.map((item) => item.url));
    if (opened !== null) {
      setBlockedIds([]);
      toast.show({ message: opened === 1 ? "Opened 1 tab" : `Opened ${opened} tabs` });
      return;
    }

    const blocked: string[] = [];
    for (const item of toOpen) {
      // Not "noopener" in the features: with it, window.open always returns null and blocked tabs can't be told apart.
      const tab = window.open(item.url, "_blank");
      if (tab) tab.opener = null;
      else blocked.push(item.id);
    }
    setBlockedIds(blocked);
  }

  function moveToTrash() {
    setError(null);
    startTransition(async () => {
      const result = await trashLinks(null, idsFormData(ids));
      if (result?.error) return setError(result.error);
      onDone();
      const moved = result?.count ?? ids.length;
      toast.show({
        message: moved === 1 ? "Moved 1 link to Trash" : `Moved ${moved} links to Trash`,
        action: undoTrash(ids),
      });
    });
  }

  function restore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreLinks(null, idsFormData(ids));
      if (result?.error) return setError(result.error);
      onDone();
      const restored = result?.count ?? ids.length;
      toast.show({ message: restored === 1 ? "Restored 1 link" : `Restored ${restored} links` });
    });
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-4">
        {(error || stillBlocked.length > 0) && (
          <div
            role="alert"
            className="pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-accent-ink shadow-md motion-safe:animate-fade-up"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {error ?? (
              <span>
                Your browser blocked {stillBlocked.length === 1 ? "1 tab" : `${stillBlocked.length} tabs`}. Click the
                blocked pop-up icon at the right of the address bar, choose <strong>Always allow</strong> for this site,
                then press <strong>Open</strong> again. With the JustLink browser extension, they all open at once.
              </span>
            )}
          </div>
        )}

        <div
          role="toolbar"
          aria-label="Selected links"
          className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface/95 p-1.5 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.25)] backdrop-blur-xl motion-safe:animate-fade-up"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel selection"
            title="Cancel (Esc)"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
          >
            <XIcon className="size-[18px]" />
          </button>
          <span className="min-w-20 px-2 text-sm font-medium whitespace-nowrap tabular-nums" aria-live="polite">
            {count === 0 ? "Select links" : `${count} selected`}
          </span>
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-line" />
          <button
            type="button"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className={`${barButton} text-ink hover:bg-subtle focus-visible:ring-brand/40`}
          >
            {allSelected ? (
              "Deselect all"
            ) : (
              <>
                Select all<span className="hidden sm:inline">{hasMorePages ? ` ${total} on this page` : ` ${total}`}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void openTabs()}
            disabled={count === 0}
            title="Open each selected link in a new tab"
            className={`${barButton} text-ink hover:bg-subtle focus-visible:ring-brand/40`}
          >
            <ExternalLinkIcon className="size-4" />
            {stillBlocked.length > 0 ? `Open ${stillBlocked.length} more` : "Open"}
          </button>

          {mode === "library" ? (
            <>
              <MoveToFolderButton
                ids={ids}
                variant="bar"
                onMoved={onDone}
                className={`${barButton} text-ink hover:bg-subtle focus-visible:ring-brand/40`}
              />
              <button
                type="button"
                onClick={moveToTrash}
                disabled={count === 0 || busy}
                className={`${barButton} text-danger hover:bg-danger-soft focus-visible:ring-danger/40`}
              >
                {working ? <SpinnerIcon className="size-4" /> : <TrashIcon className="size-4" />}
                Move to Trash
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={restore}
                disabled={count === 0 || busy}
                className={`${barButton} text-brand-ink hover:bg-brand-soft focus-visible:ring-brand/40`}
              >
                {working ? <SpinnerIcon className="size-4" /> : <RestoreIcon className="size-4" />}
                Restore
              </button>
              <button
                type="button"
                onClick={() => {
                  dialogRef.current?.showModal();
                  cancelRef.current?.focus();
                }}
                disabled={count === 0 || busy}
                aria-haspopup="dialog"
                className={`${barButton} bg-danger text-on-brand shadow-sm hover:bg-danger/90 focus-visible:ring-danger/50 focus-visible:ring-offset-2`}
              >
                <TrashIcon className="size-4" />
                Delete forever
              </button>
            </>
          )}
        </div>
      </div>

      {/* Outside the bar's wrapper, which would pass `pointer-events: none` down to it. */}
      {mode === "trash" && (
        <DeleteDialog
          ref={dialogRef}
          cancelRef={cancelRef}
          id="bulk-delete"
          heading={count === 1 ? "Delete this link forever?" : `Delete ${count} links forever?`}
          subject={
            <ul className="space-y-1">
              {shown.map((item) => (
                <li key={item.id} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted">
                    •
                  </span>
                  <span className="line-clamp-1">{item.title}</span>
                </li>
              ))}
              {count > shown.length && (
                <li className="pl-4 font-normal text-muted">and {count - shown.length} more</li>
              )}
            </ul>
          }
          description={`${count === 1 ? "It's" : "They're"} deleted right away instead of at the end of the 7 days, with notes and tags. This can't be undone.`}
          confirmLabel={count === 1 ? "Delete forever" : `Delete ${count} forever`}
          action={deleteAction}
          pending={deleting}
          error={deleteState?.error}
        >
          {selected.map((item) => (
            <input key={item.id} type="hidden" name="id" value={item.id} />
          ))}
        </DeleteDialog>
      )}
    </>
  );
}
