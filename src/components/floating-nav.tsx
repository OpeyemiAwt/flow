"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { FlowLogo } from "./flow-logo.tsx";
import { triggerHaptic } from "./haptics.ts";
import { FlowAiMascot, IconMoon, IconSun } from "./icons.tsx";
import { useTranslation } from "./language-provider.tsx";
import { UserAvatar } from "./user-avatar.tsx";
import {
  PROFILE_PREFERENCE_EVENT,
  THEME_CHANGE_EVENT,
  applyDarkTheme,
  readIsDarkTheme,
  readProfilePreference,
} from "./profile-preferences.ts";

export type NavTabId =
  | "dashboard"
  | "send"
  | "convert"
  | "receive"
  | "request"
  | "earn"
  | "activity"
  | "settings";

export interface FloatingNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  notificationsHref?: string;
  onOpenAssistant?: () => void;
  assistantHref?: string;
  userEmail?: string;
  userName?: string;
  userAvatarUrl?: string | null;
  profileId?: string;
}

interface NavTabItem {
  id: "dashboard" | "receive" | "request" | "earn";
  label: string;
  icon: ReactNode;
}

const TABS: NavTabItem[] = [
  {
    id: "dashboard",
    label: "Home",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    id: "receive",
    label: "Add money",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8" />
        <path d="m8.5 12.5 3.5 3.5 3.5-3.5" />
      </svg>
    ),
  },
  {
    id: "request",
    label: "Request",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    id: "earn",
    label: "Earn",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1" />
        <path d="M12 6v2m0 8v2" />
      </svg>
    ),
  },
];

export function FloatingNav({
  activeTab,
  onTabChange,
  unreadCount = 0,
  onOpenNotifications,
  notificationsHref,
  onOpenAssistant,
  assistantHref,
  userEmail = "user@flow.xyz",
  userName,
  userAvatarUrl,
  profileId,
}: FloatingNavProps) {
  const { t } = useTranslation();
  const effectiveUserName = userName || userEmail;
  const navLabels: Partial<Record<NavTabId, string>> = {
    dashboard: t.navHome,
    send: t.navSend,
    convert: "Convert",
    receive: t.actionAddMoney,
    earn: t.navEarn,
  };
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState(effectiveUserName);
  const [isDark, setIsDark] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileProfileRef = useRef<HTMLDivElement>(null);

  const navRef = useRef<HTMLElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillGeometry, setPillGeometry] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({ left: 0, width: 0, visible: false });
  const [pillGliding, setPillGliding] = useState(false);
  const prevTabRef = useRef<NavTabId>(activeTab);

  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileTabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [mobilePillGeometry, setMobilePillGeometry] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({ left: 0, width: 0, visible: false });
  const [mobilePillGliding, setMobilePillGliding] = useState(false);

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setPillGliding(true);
      setMobilePillGliding(true);
      const timer = window.setTimeout(() => {
        setPillGliding(false);
        setMobilePillGliding(false);
      }, 260);
      return () => window.clearTimeout(timer);
    }
  }, [activeTab]);

  const syncPillGeometry = useCallback(() => {
    const activeButton =
      activeTab === "settings" ? null : tabButtonRefs.current[activeTab];
    const container = navRef.current;
    if (!activeButton || !container) {
      setPillGeometry((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }
    setPillGeometry({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
      visible: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    syncPillGeometry();
  }, [syncPillGeometry]);

  useEffect(() => {
    const container = navRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncPillGeometry());
    observer.observe(container);
    window.addEventListener("resize", syncPillGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPillGeometry);
    };
  }, [syncPillGeometry]);

  const syncMobilePillGeometry = useCallback(() => {
    const activeButton =
      activeTab === "settings" ? null : mobileTabButtonRefs.current[activeTab];
    const container = mobileNavRef.current;
    if (!activeButton || !container) {
      setMobilePillGeometry((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }
    setMobilePillGeometry({
      left: activeButton.offsetLeft,
      width: activeButton.offsetWidth,
      visible: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    syncMobilePillGeometry();
  }, [syncMobilePillGeometry]);

  useEffect(() => {
    const container = mobileNavRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncMobilePillGeometry());
    observer.observe(container);
    window.addEventListener("resize", syncMobilePillGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncMobilePillGeometry);
    };
  }, [syncMobilePillGeometry]);

  useEffect(() => {
    const sync = () =>
      setCurrentUserName(
        readProfilePreference(profileId, "name")?.trim() || effectiveUserName,
      );
    sync();
    window.addEventListener(PROFILE_PREFERENCE_EVENT, sync);
    return () => window.removeEventListener(PROFILE_PREFERENCE_EVENT, sync);
  }, [effectiveUserName, profileId]);

  useEffect(() => {
    const syncTheme = () => setIsDark(readIsDarkTheme());
    syncTheme();
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError("");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status !== 204) throw new Error("Sign-out failed");
      window.location.replace("/sign-in");
    } catch {
      setSignOutError("Could not sign out. Try again.");
      setSigningOut(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inDesktop = profileRef.current?.contains(target) ?? false;
      const inMobile = mobileProfileRef.current?.contains(target) ?? false;
      if (!inDesktop && !inMobile) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  const renderProfileMenu = (direction: "down" | "up") => (
    <div
      className={`flow-anim-fade-up absolute ${
        direction === "up"
          ? "left-0 bottom-full mb-3"
          : "right-0 mt-2.5"
      } w-60 rounded-2xl bg-white/95 dark:bg-[#161618]/95 backdrop-blur-xl border border-neutral-200/90 dark:border-white/10 shadow-2xl p-1.5 z-50`}
    >
      <div className="px-3 py-2.5 border-b border-neutral-100 dark:border-white/[0.08] mb-1">
        <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
          {currentUserName}
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
          {userEmail}
        </p>
      </div>

      <div className="space-y-0.5 text-xs font-medium text-neutral-700 dark:text-neutral-200">
        <Link
          href="/security?tab=profile"
          onClick={() => setProfileOpen(false)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Profile</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            setProfileOpen(false);
            onTabChange("activity");
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left cursor-pointer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>{t.navActivity}</span>
        </button>

        <Link
          href="/insights"
          onClick={() => setProfileOpen(false)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          <span>{t.navInsights}</span>
        </Link>

        <Link
          href="/agents"
          onClick={() => setProfileOpen(false)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
          <span>AI Agents (MCP)</span>
        </Link>

        {userEmail?.trim().toLowerCase() ===
          "opeyemimosesawt@gmail.com" && (
          <Link
            href="/analytics"
            onClick={() => setProfileOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-3 3" />
            </svg>
            <span>{t.navAnalytics}</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => {
            const next = !isDark;
            setIsDark(next);
            applyDarkTheme(next);
          }}
          aria-label="Toggle appearance theme"
          className="w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            <span>Appearance</span>
          </span>
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            {isDark ? "Dark" : "Light"}
          </span>
        </button>

        <Link
          href="/security"
          onClick={() => setProfileOpen(false)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-neutral-100/90 dark:hover:bg-white/[0.07] transition-colors text-left"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>{t.navSettings}</span>
        </Link>
      </div>

      <div className="my-1 border-t border-neutral-100 dark:border-white/[0.08]" />

      <button
        type="button"
        disabled={signingOut}
        onClick={signOut}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors text-left cursor-pointer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{t.navSignOut}</span>
      </button>
      {signOutError && (
        <p role="alert" className="px-3 py-2 text-xs text-red-600">
          {signOutError}
        </p>
      )}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#FAF8F5] dark:bg-[#0B0B0B] border-b border-neutral-200/60 dark:border-white/[0.08] px-4 sm:px-8 pt-3.5 pb-3 transition-colors">
      <div className="mx-auto flex md:grid md:grid-cols-[1fr_auto_1fr] max-w-7xl items-center justify-between gap-4">
        {/* Brand Logo (Left Column) */}
        <div className="flex items-center justify-self-start">
          <Link
            href="/"
            aria-label="FLOW Home"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <FlowLogo size={30} />
          </Link>
        </div>

        {/* Center Floating Apple-style Liquid Glass Pill Navigation (Desktop) */}
        <nav
          ref={navRef}
          aria-label="Primary navigation"
          className="hidden md:flex justify-self-center relative items-center gap-1.5 p-2 rounded-full flow-nav-glass"
        >
          {/* Animated White Glossy Active Indicator */}
          {pillGeometry.visible && (
            <span
              aria-hidden="true"
              className="flow-nav-active-pill pointer-events-none absolute top-2 bottom-2 left-0 rounded-full"
              style={{
                width: `${pillGeometry.width}px`,
                transform: `translate3d(${pillGeometry.left}px, 0, 0) scale(${pillGliding ? 0.86 : 1})`,
              }}
            />
          )}

          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  onTabChange(tab.id);
                }}
                aria-current={isActive ? "page" : undefined}
                className={`flow-press relative z-10 flex items-center gap-2.5 px-5 lg:px-6 py-3.5 rounded-full text-[15px] font-semibold transition-colors duration-200 cursor-pointer select-none ${
                  isActive
                    ? pillGeometry.visible
                      ? "text-[#0B0B0B]"
                      : "flow-nav-active-pill text-[#0B0B0B]"
                    : "text-neutral-600 dark:text-neutral-300/80 hover:text-neutral-950 dark:hover:text-white"
                }`}
              >
                <span
                  key={isActive ? `icon-active-${tab.id}` : `icon-${tab.id}`}
                  className={`transition-transform duration-200 ${
                    isActive
                      ? "text-[#0B0B0B] flow-anim-icon-pop"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {tab.icon}
                </span>
                <span>{navLabels[tab.id] ?? tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Liquid Glass Controls: AI Mascot, Notifications, My Profile (Desktop) */}
        <div className="flex items-center justify-self-end gap-2.5">
          {/* Round Flow AI Mascot Button */}
          {assistantHref ? (
            <Link
              href={assistantHref}
              prefetch
              aria-label="Flow AI Assistant"
              title="Flow AI Assistant"
              className="flow-liquid-btn relative flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full text-neutral-900 dark:text-white cursor-pointer group"
            >
              <FlowAiMascot
                size={24}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            </Link>
          ) : onOpenAssistant ? (
            <button
              type="button"
              onClick={onOpenAssistant}
              aria-label="Flow AI Assistant"
              title="Flow AI Assistant"
              className="flow-liquid-btn relative flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full text-neutral-900 dark:text-white cursor-pointer group"
            >
              <FlowAiMascot
                size={24}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            </button>
          ) : null}

          {/* Liquid Glass Notifications Button */}
          {notificationsHref ? (
            <Link
              href={notificationsHref}
              prefetch
              aria-label="Notifications"
              title="Notifications"
              className="flow-liquid-btn relative flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full text-neutral-700 hover:text-neutral-950 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#FF1A1A] text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-[#18181B]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          ) : onOpenNotifications ? (
            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label="Notifications"
              title="Notifications"
              className="flow-liquid-btn relative flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full text-neutral-700 hover:text-neutral-950 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#FF1A1A] text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-[#18181B]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          ) : null}

          {/* Liquid Glass My Profile Dropdown Button (Desktop top bar; moved to bottom on mobile) */}
          <div className="hidden md:block relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label="Account menu"
              aria-expanded={profileOpen}
              className="flow-liquid-btn flex h-12 items-center gap-2.5 pl-1.5 pr-3.5 rounded-full select-none cursor-pointer"
            >
              <UserAvatar
                profileId={profileId}
                fallbackImage={userAvatarUrl}
                email={userEmail}
                name={currentUserName}
                alt={currentUserName}
                size={34}
              />
              <span className="hidden sm:inline text-xs font-semibold text-neutral-900 dark:text-white max-w-[130px] truncate">
                {currentUserName}
              </span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {profileOpen && renderProfileMenu("down")}
          </div>
        </div>
      </div>
      </header>

      {/* Bottom Floating Profile Pill + Big Liquid Glass Navigation (Mobile) */}
      <div className="md:hidden fixed bottom-4 inset-x-0 z-50 flex items-center justify-center gap-2.5 px-3 pointer-events-none">
        {/* Mobile Profile Trigger (Opens Upwards) */}
        <div className="relative pointer-events-auto shrink-0" ref={mobileProfileRef}>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setProfileOpen((prev) => !prev);
            }}
            aria-label="Account menu"
            aria-expanded={profileOpen}
            className="flow-nav-glass shadow-xl flex h-[62px] items-center gap-1.5 pl-2.5 pr-3 rounded-full select-none cursor-pointer"
          >
            <UserAvatar
              profileId={profileId}
              fallbackImage={userAvatarUrl}
              email={userEmail}
              name={currentUserName}
              alt={currentUserName}
              size={38}
            />
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {profileOpen && renderProfileMenu("up")}
        </div>

        <nav
          ref={mobileNavRef}
          aria-label="Mobile navigation"
          className="relative pointer-events-auto flex-1 max-w-md flex items-center justify-between gap-1 p-2 rounded-full flow-nav-glass shadow-xl"
        >
          {/* Animated White Glossy Active Indicator */}
          {mobilePillGeometry.visible && (
            <span
              aria-hidden="true"
              className="flow-nav-active-pill pointer-events-none absolute top-2 bottom-2 left-0 rounded-full"
              style={{
                width: `${mobilePillGeometry.width}px`,
                transform: `translate3d(${mobilePillGeometry.left}px, 0, 0) scale(${mobilePillGliding ? 0.86 : 1})`,
              }}
            />
          )}

          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  mobileTabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  onTabChange(tab.id);
                }}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                className={`flow-press relative z-10 flex-1 flex items-center justify-center py-3.5 px-2.5 rounded-full transition-colors duration-200 cursor-pointer select-none ${
                  isActive
                    ? mobilePillGeometry.visible
                      ? "text-[#0B0B0B]"
                      : "flow-nav-active-pill text-[#0B0B0B]"
                    : "text-neutral-600 dark:text-neutral-300/80 hover:text-neutral-950 dark:hover:text-white"
                }`}
              >
                <span
                  key={isActive ? `m-icon-active-${tab.id}` : `m-icon-${tab.id}`}
                  className={`transition-transform duration-200 ${
                    isActive
                      ? "text-[#0B0B0B] flow-anim-icon-pop"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {tab.icon}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
