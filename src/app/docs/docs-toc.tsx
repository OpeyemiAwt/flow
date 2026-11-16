"use client";

import { useState } from "react";

export interface TocItem {
  readonly id: string;
  readonly label: string;
}

export function DocsToc({ items }: { items: readonly TocItem[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile collapsible contents menu */}
      <div className="mb-6 lg:hidden">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="docs-mobile-toc"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-2xl border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] px-4 py-3 text-sm font-semibold text-[#0B0B0B] dark:text-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
        >
          <span>Contents</span>
          <span
            aria-hidden="true"
            className="text-xs text-[#666] dark:text-neutral-400"
          >
            {mobileOpen ? "Hide ▲" : "Show ▼"}
          </span>
        </button>

        {mobileOpen && (
          <nav
            id="docs-mobile-toc"
            aria-label="Documentation sections"
            className="mt-2 rounded-2xl border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] p-3 shadow-sm"
          >
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-xl px-3 py-2 text-[#444] dark:text-neutral-300 hover:bg-[#F8F6F3] dark:hover:bg-white/[0.05] hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF1A1A]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* Desktop sticky left-hand Table of Contents */}
      <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
        <nav
          aria-label="Documentation table of contents"
          className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-white/80 dark:bg-[#141414]/90 p-4 shadow-xs"
        >
          <p className="px-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D51B24]">
            On this page
          </p>
          <ul className="mt-3 space-y-1 text-[13px]">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block rounded-xl px-2.5 py-1.5 text-[#4B4B4B] dark:text-neutral-300 transition-colors hover:bg-[#F8F6F3] dark:hover:bg-white/[0.05] hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF1A1A]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
