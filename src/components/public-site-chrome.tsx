import Link from "next/link";
import type { ReactNode } from "react";
import { FlowLogo } from "./flow-logo.tsx";

export function PublicSiteChrome({
  activeRoute,
  children,
}: {
  activeRoute: "docs" | "whitepaper" | "blog" | "privacy" | "terms";
  children: ReactNode;
}) {
  const navLinkClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A] ${
      active
        ? "bg-[#0B0B0B] text-white dark:bg-white dark:text-[#0B0B0B]"
        : "text-[#3B3B3B] hover:text-[#FF1A1A] dark:text-neutral-300 dark:hover:text-[#FF4D4D]"
    }`;

  return (
    <div className="min-h-screen bg-[#F8F6F3] dark:bg-[#0B0B0B] text-[#0B0B0B] dark:text-neutral-100 transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-[#E6E2DA]/80 dark:border-white/[0.08] bg-[#F8F6F3]/95 dark:bg-[#0B0B0B]/95 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            href="/"
            aria-label="FLOW Home"
            className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF1A1A]"
          >
            <FlowLogo className="h-7 w-auto" />
          </Link>

          <nav
            aria-label="Public resources"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto"
          >
            <Link href="/blog" className={navLinkClass(activeRoute === "blog")}>
              Blog
            </Link>
            <Link href="/docs" className={navLinkClass(activeRoute === "docs")}>
              Docs
            </Link>
            <Link
              href="/whitepaper"
              className={navLinkClass(activeRoute === "whitepaper")}
            >
              Whitepaper
            </Link>
            <Link
              href="/privacy"
              className={`hidden sm:inline-flex ${navLinkClass(activeRoute === "privacy")}`}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className={`hidden sm:inline-flex ${navLinkClass(activeRoute === "terms")}`}
            >
              Terms
            </Link>
            <Link
              href="/sign-in"
              className="ml-1 inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#0B0B0B] dark:bg-white px-4 text-xs font-semibold text-white dark:text-[#0B0B0B] hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#0B0B0B] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 text-sm text-[#666] dark:text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-3">
            <FlowLogo className="h-5 w-auto" />
            <span>Multi-chain wallet &amp; payment infrastructure</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link
              href="/blog"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Blog
            </Link>
            <Link
              href="/docs"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Docs
            </Link>
            <Link
              href="/whitepaper"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Whitepaper
            </Link>
            <Link
              href="/privacy"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Terms
            </Link>
            <Link
              href="/"
              className="hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
            >
              Home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
