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
import { FlowAiMascot, IconMoon, IconSun } from "./icons.tsx";
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
  | "receive"
  | "request"
  | "activity"
  | "settings";

export interface FloatingNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  onOpenAssistant?: () => void;
  userEmail?: string;
  userName?: string;
  profileId?: string;
}

interface NavTabItem {
  id: Exclude<NavTabId, "settings">;
  label: string;
  icon: ReactNode;
}

const TABS: NavTabItem[] = [
  {
    id: "dashboard",
    label: "Home",
    icon: (
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
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    id: "send",
    label: "Send",
    icon: (
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
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
  {
    id: "receive",
    label: "Receive",
    icon: (
      <svg
        width="20"
        height="20"
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
        width="20"
        height="20"
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
    id: "activity",
    label: "Activity",
    icon: (
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
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

export function FloatingNav({
  activeTab,
  onTabChange,
  unreadCount = 0,
  onOpenNotifications,
  onOpenAssistant,
  userEmail = "user@flow.xyz",
  userName,
  profileId,
}: FloatingNavProps) {
  const effectiveUserName = userName || userEmail;
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState(effectiveUserName);
  const [isDark, setIsDark] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const navRef = useRef<HTMLElement>(null);
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillGeometry, setPillGeometry] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({ left: 0, width: 0, visible: false });

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
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
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

  return (
    <header className="sticky top-0 z-40 w-full px-4 sm:px-8 pt-4 pb-3">
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
          className="hidden md:flex justify-self-center relative items-center gap-1 p-1.5 rounded-full flow-nav-glass"
        >
          {/* Animated White Glossy Active Indicator */}
          {pillGeometry.visible && (
            <span
              aria-hidden="true"
              className="flow-nav-active-pill pointer-events-none absolute top-1.5 bottom-1.5 left-0 rounded-full"
              style={{
                width: `${pillGeometry.width}px`,
                transform: `translate3d(${pillGeometry.left}px, 0, 0)`,
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
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative z-10 flex items-center gap-2.5 px-4 lg:px-5 py-2.5 rounded-full text-[13.5px] font-semibold transition-colors duration-200 cursor-pointer select-none ${
                  isActive
                    ? pillGeometry.visible
                      ? "text-[#0B0B0B]"
                      : "flow-nav-active-pill text-[#0B0B0B]"
                    : "text-neutral-600 dark:text-neutral-300/80 hover:text-neutral-950 dark:hover:text-white"
                }`}
              >
                <span
                  className={`transition-transform duration-200 ${
                    isActive
                      ? "text-[#0B0B0B] scale-[1.04]"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Liquid Glass Controls: AI Mascot, Notifications, My Profile */}
        <div className="flex items-center justify-self-end gap-2.5">
          {/* Round Flow AI Mascot Button */}
          {onOpenAssistant && (
            <button
              type="button"
              onClick={onOpenAssistant}
              aria-label="Flow AI Assistant"
              title="Flow AI Assistant"
              className="flow-liquid-btn relative flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 dark:text-white cursor-pointer group"
            >
              <FlowAiMascot
                size={24}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            </button>
          )}

          {/* Liquid Glass Notifications Button */}
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label="Notifications"
              title="Notifications"
              className="flow-liquid-btn relative flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:text-neutral-950 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
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
                <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-[#FF1A1A] ring-2 ring-white dark:ring-[#18181B]" />
              )}
            </button>
          )}

          {/* Liquid Glass My Profile Dropdown Button */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label="Account menu"
              aria-expanded={profileOpen}
              className="flow-liquid-btn flex h-11 items-center gap-2.5 pl-1.5 pr-3.5 rounded-full select-none cursor-pointer"
            >
              <UserAvatar
                profileId={profileId}
                alt={currentUserName}
                size={32}
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

            {/* Profile Dropdown Menu: Profile, Settings, Instant Appearance Toggle, Sign out */}
            {profileOpen && (
              <div className="absolute right-0 mt-2.5 w-60 rounded-2xl bg-white/95 dark:bg-[#161618]/95 backdrop-blur-xl border border-neutral-200/90 dark:border-white/10 shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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
                    <span>Settings</span>
                  </Link>

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
                  <span>Sign out</span>
                </button>
                {signOutError && (
                  <p role="alert" className="px-3 py-2 text-xs text-red-600">
                    {signOutError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="flow-liquid-btn md:hidden flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 dark:text-neutral-200 cursor-pointer"
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
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2.5 p-2 rounded-3xl flow-nav-glass shadow-xl space-y-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onTabChange(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "flow-nav-active-pill text-[#0B0B0B]"
                    : "text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </div>
                {isActive && (
                  <span className="h-2 w-2 rounded-full bg-[#FF1A1A]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
