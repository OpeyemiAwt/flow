"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlowLogo } from "./flow-logo.tsx";
import {
  THEME_CHANGE_EVENT,
  applyDarkTheme,
  readIsDarkTheme,
} from "./profile-preferences.ts";

export interface DocsTocItem {
  readonly id: string;
  readonly label: string;
}

interface SidebarGroup {
  readonly label: string;
  readonly items: readonly {
    readonly href: string;
    readonly label: string;
    readonly sectionId?: string;
    readonly route?: "docs" | "whitepaper" | "privacy" | "terms";
  }[];
}

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    label: "Start here",
    items: [
      { href: "/docs#introduction", label: "Overview", sectionId: "introduction", route: "docs" },
      { href: "/docs#quickstart", label: "Quickstart", sectionId: "quickstart", route: "docs" },
      { href: "/docs#how-flow-works", label: "How FLOW works", sectionId: "how-flow-works", route: "docs" },
    ],
  },
  {
    label: "Core product",
    items: [
      { href: "/docs#send", label: "Send & @flow ID", sectionId: "send", route: "docs" },
      { href: "/docs#payment-links", label: "Payment links", sectionId: "payment-links", route: "docs" },
      { href: "/docs#convert", label: "Convert & Bridge", sectionId: "convert", route: "docs" },
      { href: "/docs#earn", label: "Earn (LiNEAR & Burrow)", sectionId: "earn", route: "docs" },
      { href: "/docs#assistant", label: "Flow AI Assistant", sectionId: "assistant", route: "docs" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/docs#networks", label: "Networks & assets", sectionId: "networks", route: "docs" },
      { href: "/docs#security", label: "Security & custody", sectionId: "security", route: "docs" },
      { href: "/docs#fees", label: "Fees", sectionId: "fees", route: "docs" },
    ],
  },
  {
    label: "Deeper",
    items: [
      { href: "/whitepaper", label: "Whitepaper", route: "whitepaper" },
      { href: "/privacy", label: "Privacy Policy", route: "privacy" },
      { href: "/terms", label: "Terms of Service", route: "terms" },
    ],
  },
];

const TOP_TABS = [
  { href: "/docs", label: "Overview", match: "docs-overview" },
  { href: "/docs#how-flow-works", label: "How it works", match: "how-flow-works" },
  { href: "/docs#payment-links", label: "Payments", match: "payment-links" },
  { href: "/docs#convert", label: "Convert & Bridge", match: "convert" },
  { href: "/docs#earn", label: "Earn", match: "earn" },
  { href: "/docs#fees", label: "Fees", match: "fees" },
  { href: "/whitepaper", label: "Whitepaper", match: "whitepaper" },
] as const;

const SEARCH_INDEX = [
  { title: "Overview · What is FLOW?", section: "Docs · Start here", href: "/docs#introduction", keywords: "what is flow overview multi-chain wallet stablecoin" },
  { title: "Quickstart", section: "Docs · Start here", href: "/docs#quickstart", keywords: "sign in google email otp create wallet deposit" },
  { title: "How FLOW works", section: "Docs · Start here", href: "/docs#how-flow-works", keywords: "mpc outlayer near intents 1click architecture" },
  { title: "Send & @flow ID", section: "Docs · Core product", href: "/docs#send", keywords: "send transfer flow id handle username address" },
  { title: "Payment links & checkout", section: "Docs · Core product", href: "/docs#payment-links", keywords: "request payment link max payers delete fee payer gas checkout" },
  { title: "Convert & Bridge", section: "Docs · Core product", href: "/docs#convert", keywords: "swap bridge convert 1click near intents solana base ethereum" },
  { title: "Earn (LiNEAR & Burrow Finance)", section: "Docs · Core product", href: "/docs#earn", keywords: "stake yield apy linear burrow usdc near unstake claim" },
  { title: "Flow AI Assistant", section: "Docs · Core product", href: "/docs#assistant", keywords: "ai assistant chat natural language draft payment" },
  { title: "Networks & assets", section: "Docs · Reference", href: "/docs#networks", keywords: "near solana base ethereum usdc usdt eth sol supported tokens" },
  { title: "Security & custody", section: "Docs · Reference", href: "/docs#security", keywords: "security non-custodial mpc sessions delete account" },
  { title: "Fees", section: "Docs · Reference", href: "/docs#fees", keywords: "fees pricing 0.15% earn 1% convert 0% payment links" },
  { title: "Whitepaper · Abstract & Thesis", section: "Whitepaper", href: "/whitepaper#abstract", keywords: "whitepaper thesis product architecture vision" },
  { title: "Whitepaper · Non-custodial MPC & Identity", section: "Whitepaper", href: "/whitepaper#mpc", keywords: "mpc outlayer signing policy encryption" },
  { title: "Whitepaper · Cross-chain Routing", section: "Whitepaper", href: "/whitepaper#routing", keywords: "1click intents solver cross-chain settlement" },
  { title: "Whitepaper · Economics & Fees", section: "Whitepaper", href: "/whitepaper#fees", keywords: "economics fees treasury sponsor near" },
  { title: "Privacy Policy", section: "Legal", href: "/privacy", keywords: "privacy data cookies storage deletion" },
  { title: "Terms of Service", section: "Legal", href: "/terms", keywords: "terms legal conditions risk" },
] as const;

export function DocsShell({
  activeRoute,
  eyebrow,
  toc,
  children,
}: {
  activeRoute: "docs" | "whitepaper";
  eyebrow: string;
  toc: readonly DocsTocItem[];
  children: ReactNode;
}) {
  const [dark, setDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? "");
  const articleRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const isDark = readIsDarkTheme();
      document.documentElement.classList.toggle("dark", isDark);
      setDark(isDark);
    };
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
    setSearchQuery("");
  }, [searchOpen]);

  useEffect(() => {
    if (toc.length === 0) return;
    const elements = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [toc]);

  const filteredSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SEARCH_INDEX;
    return SEARCH_INDEX.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        item.keywords.includes(q),
    );
  }, [searchQuery]);

  function setThemeMode(isDark: boolean) {
    setDark(isDark);
    applyDarkTheme(isDark);
  }

  async function handleCopyPage() {
    const text = articleRef.current?.innerText?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  const isTopTabActive = (match: string) => {
    if (activeRoute === "whitepaper") return match === "whitepaper";
    if (match === "whitepaper") return false;
    if (match === "docs-overview") {
      return (
        !activeId ||
        activeId === "introduction" ||
        activeId === "quickstart" ||
        activeId === "networks" ||
        activeId === "security" ||
        activeId === "send" ||
        activeId === "assistant"
      );
    }
    return activeId === match;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0c0e] text-[#0b0c0e] dark:text-[#f5f6f8] transition-colors duration-200">
      {/* Top Sticky Gloam-style Docs Header */}
      <header className="sticky top-0 z-40 border-b border-[#e4e6e9] dark:border-white/[0.08] bg-white/90 dark:bg-[#0b0c0e]/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-[#0b0c0e]/80">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:grid lg:h-16 lg:grid-cols-[1fr_minmax(0,440px)_1fr] lg:gap-6 lg:px-8">
            {/* Left: Mobile Menu + Brand + Docs label */}
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open documentation menu"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#0b0c0e] dark:text-white hover:bg-[#f3f4f5] dark:hover:bg-white/[0.08] transition-colors lg:hidden cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>

              <div className="flex min-w-0 items-center gap-2.5">
                <Link
                  href="/"
                  aria-label="FLOW home"
                  className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1A1A]"
                >
                  <FlowLogo className="h-6 w-auto" />
                </Link>
                <span className="h-4 w-px bg-[#e4e6e9] dark:bg-white/[0.12]" aria-hidden="true" />
                <Link
                  href="/docs"
                  className="text-[17px] leading-none tracking-[-0.015em] text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
                >
                  {activeRoute === "whitepaper" ? "Whitepaper" : "Docs"}
                </Link>
              </div>
            </div>

            {/* Center: Search Trigger (Desktop) */}
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search the docs"
                className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-transparent bg-[#f3f4f5] dark:bg-white/[0.06] pl-3.5 pr-2 text-left text-[14px] text-[#6b6f76] dark:text-neutral-400 transition-colors hover:border-[#cfd2d6] dark:hover:border-white/[0.14] hover:bg-white dark:hover:bg-white/[0.09] cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="min-w-0 flex-1 truncate">Search the docs</span>
                <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-[#e4e6e9] dark:border-white/[0.12] bg-white dark:bg-[#141518] px-1.5 font-sans text-[11.5px] font-medium leading-none text-[#5f636a] dark:text-neutral-400">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Right: Search (Mobile) + Theme + Open app */}
            <div className="ml-auto flex items-center justify-end gap-1.5 lg:ml-0 lg:gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search the docs"
                className="grid h-9 w-9 place-items-center rounded-full text-[#0b0c0e] dark:text-white hover:bg-[#f3f4f5] dark:hover:bg-white/[0.08] transition-colors lg:hidden cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode(!dark)}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                className="hidden sm:grid h-9 w-9 place-items-center rounded-full text-[#0b0c0e] dark:text-white hover:bg-[#f3f4f5] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                {dark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
              </button>

              <Link
                href="/sign-in"
                className="inline-flex h-9 items-center justify-center rounded-full bg-[#0b0c0e] dark:bg-white px-4 text-[13px] font-medium text-white dark:text-[#0b0c0e] hover:opacity-90 transition-opacity"
              >
                Open app
              </Link>
            </div>
          </div>

          {/* Horizontal Section Tab Row */}
          <div className="-mb-px overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <nav
              aria-label="Documentation sections"
              className="flex h-11 w-max items-stretch gap-6 px-4 sm:px-6 lg:h-12 lg:gap-8 lg:px-8"
            >
              {TOP_TABS.map((tab) => {
                const active = isTopTabActive(tab.match);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`relative flex items-center whitespace-nowrap text-[14px] transition-colors ${
                      active
                        ? "font-medium text-[#0b0c0e] dark:text-white"
                        : "text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white"
                    }`}
                  >
                    {tab.label}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-colors ${
                        active ? "bg-[#0b0c0e] dark:bg-white" : "bg-transparent"
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main 3-Column Layout */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_210px] lg:gap-10">
          {/* Left Sticky Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-[112px] flex h-[calc(100dvh-112px)] flex-col justify-between pb-6 pt-8">
              <nav
                aria-label="Sidebar navigation"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
              >
                {SIDEBAR_GROUPS.map((group) => (
                  <div key={group.label} className="mb-7 last:mb-0">
                    <p className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
                      {group.label}
                    </p>
                    <ul className="mt-2 space-y-0.5">
                      {group.items.map((item) => {
                        const active =
                          (item.route === "whitepaper" && activeRoute === "whitepaper") ||
                          (item.route === "docs" &&
                            activeRoute === "docs" &&
                            item.sectionId === activeId);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`flex items-center rounded-full px-3 py-2 text-[14px] transition-colors ${
                                active
                                  ? "bg-[#f3f4f5] dark:bg-white/[0.08] font-medium text-[#0b0c0e] dark:text-white"
                                  : "text-[#5f636a] dark:text-neutral-400 hover:bg-[#f3f4f5]/70 dark:hover:bg-white/[0.05] hover:text-[#0b0c0e] dark:hover:text-white"
                              }`}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>

              {/* Appearance Segmented Pill */}
              <div className="pt-4 border-t border-[#e4e6e9] dark:border-white/[0.08]">
                <div
                  role="radiogroup"
                  aria-label="Appearance"
                  className="inline-flex rounded-full bg-[#f3f4f5] dark:bg-white/[0.06] p-1 text-[12.5px]"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!dark}
                    onClick={() => setThemeMode(false)}
                    className={`h-7 rounded-full px-3.5 transition-colors cursor-pointer ${
                      !dark
                        ? "bg-white text-[#0b0c0e] shadow-xs font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={dark}
                    onClick={() => setThemeMode(true)}
                    className={`h-7 rounded-full px-3.5 transition-colors cursor-pointer ${
                      dark
                        ? "bg-[#1d1f23] text-white shadow-xs font-medium"
                        : "text-[#5f636a] hover:text-[#0b0c0e]"
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Center Article */}
          <main id="main" className="min-w-0 pb-10 pt-7 sm:pt-9 lg:pt-10">
            <article ref={articleRef} className="mx-auto w-full max-w-[760px]">
              {/* Top Eyebrow + Copy Page Button */}
              <div className="flex min-h-8 items-center justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-[#5f636a] dark:text-neutral-400">
                  {eyebrow}
                </p>
                <button
                  type="button"
                  onClick={handleCopyPage}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#e4e6e9] dark:border-white/[0.12] px-3 text-[12.5px] font-medium text-[#5f636a] dark:text-neutral-300 hover:bg-[#f3f4f5] dark:hover:bg-white/[0.07] hover:text-[#0b0c0e] dark:hover:text-white transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </svg>
                      <span>Copy page</span>
                    </>
                  )}
                </button>
              </div>

              {children}
            </article>
          </main>

          {/* Right Sticky "On this page" TOC */}
          <aside className="hidden xl:block">
            <div className="sticky top-[112px] max-h-[calc(100dvh-112px)] overflow-y-auto pb-12 pt-10">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
                On this page
              </p>
              <ul className="mt-3 space-y-1.5 border-l border-[#e4e6e9] dark:border-white/[0.08]">
                {toc.map((item) => {
                  const active = activeId === item.id;
                  return (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className={`-ml-px block border-l-2 pl-3 py-0.5 text-[13px] leading-snug transition-colors ${
                          active
                            ? "border-[#0b0c0e] dark:border-white font-medium text-[#0b0c0e] dark:text-white"
                            : "border-transparent text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white"
                        }`}
                      >
                        {item.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {/* Rounded Dark Footer Card (Gloam-style) */}
      <footer className="mx-auto w-full max-w-[1400px] px-4 pb-6 pt-16 sm:px-7 sm:pb-8 sm:pt-24">
        <div className="rounded-[28px] bg-[#0b0c0e] dark:bg-[#111214] border border-transparent dark:border-white/[0.08] text-white">
          <div className="mx-auto max-w-[1240px] px-6 py-12 sm:px-12 sm:py-16">
            <div className="grid gap-12 lg:grid-cols-[1.25fr_2fr]">
              <div>
                <Link href="/" className="inline-flex items-center">
                  <FlowLogo className="h-6 w-auto text-white" />
                </Link>
                <p className="mt-5 max-w-[22ch] text-[24px] font-light leading-[1.18] tracking-[-0.02em] text-white/75">
                  Multi-chain money that feels instant.
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <Link
                    href="/sign-in"
                    className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-[#0b0c0e] hover:opacity-90 transition-opacity"
                  >
                    Open app
                  </Link>
                  <Link
                    href="/whitepaper"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 px-4 text-[13px] font-medium text-white/80 hover:text-white hover:border-white/30 transition-colors"
                  >
                    Read whitepaper
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-[14px]">
                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
                    Product
                  </p>
                  <ul className="space-y-2 text-white/70">
                    <li><Link href="/docs#how-flow-works" className="hover:text-white transition-colors">How FLOW works</Link></li>
                    <li><Link href="/docs#payment-links" className="hover:text-white transition-colors">Payment links</Link></li>
                    <li><Link href="/docs#convert" className="hover:text-white transition-colors">Convert &amp; Bridge</Link></li>
                    <li><Link href="/docs#earn" className="hover:text-white transition-colors">Earn on NEAR</Link></li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
                    Resources
                  </p>
                  <ul className="space-y-2 text-white/70">
                    <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
                    <li><Link href="/whitepaper" className="hover:text-white transition-colors">Whitepaper</Link></li>
                    <li><Link href="/docs#fees" className="hover:text-white transition-colors">Fees</Link></li>
                    <li><Link href="/docs#networks" className="hover:text-white transition-colors">Networks</Link></li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
                    Legal
                  </p>
                  <ul className="space-y-2 text-white/70">
                    <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                    <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px] text-white/45">
              <span>FLOW is an independent non-custodial software project.</span>
              <span>NEAR · Solana · Base · Ethereum</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-[290px] max-w-[85vw] flex-col bg-white dark:bg-[#0b0c0e] border-r border-[#e4e6e9] dark:border-white/[0.08] p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#e4e6e9] dark:border-white/[0.08]">
              <FlowLogo className="h-6 w-auto" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-full text-[#5f636a] dark:text-neutral-400 hover:bg-[#f3f4f5] dark:hover:bg-white/[0.08]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="mt-4 flex-1 overflow-y-auto space-y-6">
              {SIDEBAR_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
                    {group.label}
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center rounded-full px-3 py-2 text-[14px] text-[#5f636a] dark:text-neutral-300 hover:bg-[#f3f4f5] dark:hover:bg-white/[0.08] hover:text-[#0b0c0e] dark:hover:text-white"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="pt-4 border-t border-[#e4e6e9] dark:border-white/[0.08] flex items-center justify-between">
              <span className="text-xs text-[#5f636a] dark:text-neutral-400">Appearance</span>
              <div className="inline-flex rounded-full bg-[#f3f4f5] dark:bg-white/[0.06] p-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => setThemeMode(false)}
                  className={`h-7 rounded-full px-3 ${!dark ? "bg-white text-[#0b0c0e] font-medium" : "text-neutral-400"}`}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setThemeMode(true)}
                  className={`h-7 rounded-full px-3 ${dark ? "bg-[#1d1f23] text-white font-medium" : "text-[#5f636a]"}`}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal (⌘K) */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setSearchOpen(false)}
          />
          <div className="relative z-10 w-full max-w-[540px] overflow-hidden rounded-[20px] border border-[#e4e6e9] dark:border-white/[0.12] bg-white dark:bg-[#141518] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[#e4e6e9] dark:border-white/[0.08] px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b6f76] shrink-0">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs and whitepaper..."
                className="w-full bg-transparent text-[15px] text-[#0b0c0e] dark:text-white placeholder:text-[#6b6f76] focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="rounded-md border border-[#e4e6e9] dark:border-white/[0.12] px-1.5 py-0.5 text-[11px] text-[#6b6f76] dark:text-neutral-400"
              >
                ESC
              </button>
            </div>
            <ul className="max-h-[340px] overflow-y-auto p-2">
              {filteredSearch.length === 0 ? (
                <li className="px-3 py-8 text-center text-[13px] text-[#6b6f76]">
                  No matching sections found.
                </li>
              ) : (
                filteredSearch.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f3f4f5] dark:hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[#0b0c0e] dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-[12px] text-[#6b6f76] dark:text-neutral-400">
                          {item.section}
                        </p>
                      </div>
                      <span className="text-[12px] text-[#6b6f76]">→</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
