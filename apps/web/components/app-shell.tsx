"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/preferences";
import { ImportIcon, LinkIcon, MenuIcon, PanelLeftIcon, XIcon } from "./icons";

/** From this width (Tailwind's lg) the sidebar sits beside the page; below it, it's a drawer. */
const DESKTOP = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`items-center gap-2 text-[15px] font-semibold tracking-tight text-ink ${className}`}>
      <span className="grid size-7 place-items-center rounded-lg bg-brand text-on-brand">
        <LinkIcon className="size-4" strokeWidth={2.2} />
      </span>
      {APP_NAME}
    </Link>
  );
}

const iconButton =
  "size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none";

/**
 * The signed-in app's frame: the sidebar at the far left and the page beside it. On large
 * screens the sidebar can be collapsed out of the way (remembered in a cookie, so the
 * server renders it the same way next time); on smaller ones it's a drawer over the page.
 */
export function AppShell({
  sidebar,
  footer,
  header,
  initiallyCollapsed,
  children,
}: {
  /** The sidebar's scrolling middle: sections, folders, tags. */
  sidebar: ReactNode;
  /** Pinned to the bottom of the sidebar: the signed-in person. */
  footer: ReactNode;
  /** Page title and actions shown in the top navbar. */
  header?: ReactNode;
  initiallyCollapsed: boolean;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = !isDesktop && drawerOpen;

  // The drawer: Escape closes it, and the page behind it doesn't scroll.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape in a menu or dialog opened from the drawer closes only that.
      if (event.key === "Escape" && !(event.target as Element | null)?.closest?.("dialog, [popover]")) {
        setDrawerOpen(false);
      }
    };
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  function setCollapsedAndRemember(next: boolean) {
    setCollapsed(next);
    document.cookie = next
      ? `${SIDEBAR_COLLAPSED_COOKIE}=1; path=/; max-age=31536000; samesite=lax`
      : `${SIDEBAR_COLLAPSED_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }

  return (
    <div className="flex min-h-dvh flex-1">
      {/* Behind the drawer: dims the page, and a click on it closes the drawer. */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        // Out of the way: skipped by Tab and screen readers.
        inert={isDesktop ? collapsed : !drawerOpen}
        // Following a link from the drawer closes it.
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setDrawerOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-hidden border-r border-line bg-surface transition-[translate,box-shadow] duration-300 ease-out lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:transition-[width] lg:duration-200 ${
          drawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        } ${collapsed ? "lg:w-0 lg:border-r-0" : "lg:w-64"}`}
      >
        {/* Fixed width inside, so nothing reflows while the sidebar slides shut. */}
        <div className="flex h-full w-72 max-w-[85vw] flex-col lg:w-64 lg:max-w-none">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-2.5 pl-4">
            <Brand className="flex" />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              title="Close menu"
              className={`grid lg:hidden ${iconButton}`}
            >
              <XIcon className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsedAndRemember(true)}
              aria-label="Hide sidebar"
              title="Hide sidebar"
              className={`hidden lg:grid ${iconButton}`}
            >
              <PanelLeftIcon className="size-[18px]" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4">{sidebar}</div>
          <div className="shrink-0 border-t border-line p-3">{footer}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-1.5 px-3 sm:px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              title="Open menu"
              aria-controls="app-sidebar"
              aria-expanded={drawerOpen}
              className={`grid lg:hidden ${iconButton}`}
            >
              <MenuIcon className="size-5" />
            </button>
            {/* On a large screen these only show while the sidebar is hidden. */}
            {collapsed && (
              <button
                type="button"
                onClick={() => setCollapsedAndRemember(false)}
                aria-label="Show sidebar"
                title="Show sidebar"
                aria-controls="app-sidebar"
                aria-expanded={false}
                className={`hidden lg:grid ${iconButton}`}
              >
                <PanelLeftIcon className="size-[18px]" />
              </button>
            )}
            <Brand
              className={`ml-1 ${
                header
                  ? collapsed
                    ? "hidden sm:flex"
                    : "hidden sm:flex lg:hidden"
                  : `flex ${collapsed ? "" : "lg:hidden"}`
              }`}
            />
            {header ? (
              <>
                <span
                  aria-hidden="true"
                  className={`mx-1.5 h-4 w-px shrink-0 bg-line ${
                    collapsed ? "hidden sm:block" : "hidden sm:block lg:hidden"
                  }`}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
              </>
            ) : (
              <div className="flex-1" />
            )}
            <Link
              href="/import-export"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              <ImportIcon className="size-4" />
              <span className="hidden sm:inline">Import / Export</span>
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
