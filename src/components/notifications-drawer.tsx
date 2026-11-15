"use client";

import { useEffect, useState } from "react";
import { SegmentedTabPill } from "./motion.tsx";

import type { AccountNotification } from "../server/notifications-service.ts";
import {
  isInAppNotificationEnabled,
  PROFILE_PREFERENCE_EVENT,
} from "./profile-preferences.ts";

export interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  profileId?: string;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationsDrawer({
  isOpen,
  onClose,
  accountId,
  profileId,
  onUnreadCountChange,
}: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PAYMENTS" | "SYSTEM">("ALL");
  const [loading, setLoading] = useState(false);

  // Fetch notifications
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function loadNotifications() {
      try {
        setLoading(true);
        const res = await fetch(`/api/accounts/${accountId}/notifications`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.ok) {
          const rows = (data.notifications as AccountNotification[]).filter(
            (item) => isInAppNotificationEnabled(profileId, item.type),
          );
          setNotifications(rows);
          onUnreadCountChange?.(rows.filter((item) => !item.isRead).length);
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadNotifications();
    const refresh = () => {
      void loadNotifications();
    };
    window.addEventListener(PROFILE_PREFERENCE_EVENT, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(PROFILE_PREFERENCE_EVENT, refresh);
    };
  }, [isOpen, accountId, profileId, onUnreadCountChange]);

  const markAllRead = async () => {
    try {
      const ids = notifications.map((n) => n.id);
      const response = await fetch(`/api/accounts/${accountId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, ids }),
      });
      if (!response.ok) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const markSingleRead = async (id: string) => {
    try {
      const response = await fetch(`/api/accounts/${accountId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      const remaining = notifications.filter(
        (n) => n.id !== id && !n.isRead,
      ).length;
      if (onUnreadCountChange) onUnreadCountChange(remaining);
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (filter === "PAYMENTS") {
      return (
        n.type === "PAYMENT_RECEIVED" ||
        n.type === "PAYMENT_LINK_CREATED" ||
        n.type === "DEPOSIT_DETECTED"
      );
    }
    if (filter === "SYSTEM") {
      return n.category === "system";
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="flow-anim-backdrop absolute inset-0 bg-neutral-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
          aria-label="Account notifications drawer"
          className="flow-anim-drawer-right w-screen max-w-md bg-white dark:bg-[#141414] border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FF1A1A] text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs font-semibold text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close notifications drawer"
                className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-6 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center">
            <SegmentedTabPill
              tabs={[
                { id: "ALL", label: "All" },
                { id: "PAYMENTS", label: "Payments" },
                { id: "SYSTEM", label: "System" },
              ] as const}
              activeTab={filter}
              onChange={setFilter}
              size="sm"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <div className="py-12 text-center text-xs text-neutral-500 animate-pulse">
                Loading notifications...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-neutral-500">
                <p className="text-sm font-semibold">No notifications</p>
                <p className="text-xs text-neutral-400 mt-1">
                  You&apos;re all caught up with your account events.
                </p>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => !item.isRead && markSingleRead(item.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    item.isRead
                      ? "bg-white dark:bg-[#141414] border-neutral-200/60 dark:border-neutral-800/60 text-neutral-600 dark:text-neutral-400"
                      : "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-800/60 text-neutral-900 dark:text-white shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {item.type === "PAYMENT_RECEIVED" ? (
                          <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17 7 7 17" />
                              <path d="M17 17H7V7" />
                            </svg>
                          </div>
                        ) : item.type === "DEPOSIT_DETECTED" ? (
                          <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 3v12" />
                              <path d="m7 10 5 5 5-5" />
                              <path d="M5 20h14" />
                            </svg>
                          </div>
                        ) : item.type === "PAYMENT_LINK_CREATED" ? (
                          <div className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 16v-4" />
                              <path d="M12 8h.01" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-neutral-950 dark:text-white">
                            {item.title}
                          </p>
                          {!item.isRead && (
                            <span className="h-2 w-2 rounded-full bg-[#FF1A1A]" />
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-400 shrink-0">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
