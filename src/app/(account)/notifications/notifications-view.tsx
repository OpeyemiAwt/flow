"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FloatingNav, type NavTabId } from "../../../components/floating-nav.tsx";
import { FlowIdClaimModal } from "../../../components/flow-id-claim-modal.tsx";
import { startRouteTransition } from "../../../components/route-skeleton-transition.tsx";
import { SegmentedTabPill } from "../../../components/motion.tsx";
import {
  isInAppNotificationEnabled,
  PROFILE_PREFERENCE_EVENT,
} from "../../../components/profile-preferences.ts";
import type { AccountNotification } from "../../../server/notifications-service.ts";

export interface NotificationsViewProps {
  accountId: string | null;
  userEmail: string;
  userName: string;
  userAvatarUrl?: string | null;
  profileId: string;
}

export function NotificationsView({
  accountId,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: NotificationsViewProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PAYMENTS" | "SYSTEM">("ALL");
  const [loading, setLoading] = useState(true);
  const [isFlowIdModalOpen, setIsFlowIdModalOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/accounts/${accountId}/notifications`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        const rows = (data.notifications as AccountNotification[]).filter(
          (item) => isInAppNotificationEnabled(profileId, item.type),
        );
        setNotifications(rows);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, profileId]);

  useEffect(() => {
    void loadNotifications();
    const refresh = () => {
      void loadNotifications();
    };
    window.addEventListener(PROFILE_PREFERENCE_EVENT, refresh);
    return () => {
      window.removeEventListener(PROFILE_PREFERENCE_EVENT, refresh);
    };
  }, [loadNotifications]);

  const markAllRead = async () => {
    if (!accountId) return;
    try {
      const ids = notifications
        .filter((n) => n.type !== "CLAIM_FLOW_ID")
        .map((n) => n.id);
      if (ids.length === 0) return;
      const response = await fetch(`/api/accounts/${accountId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true, ids }),
      });
      if (!response.ok) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.type === "CLAIM_FLOW_ID" ? n : { ...n, isRead: true },
        ),
      );
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const markSingleRead = async (id: string) => {
    if (!accountId) return;
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
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleTabChange = (tab: NavTabId) => {
    const target = tab === "dashboard" ? "/app" : `/app/${tab}`;
    startRouteTransition(target);
    router.push(target);
  };

  const filtered = notifications.filter((n) => {
    if (filter === "PAYMENTS") {
      return (
        n.type === "PAYMENT_RECEIVED" ||
        n.type === "PAYMENT_COMPLETED" ||
        n.type === "PAYMENT_LINK_CREATED" ||
        n.type === "DEPOSIT_DETECTED" ||
        n.type === "SWAP_COMPLETED"
      );
    }
    if (filter === "SYSTEM") {
      return n.category === "system";
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      <FloatingNav
        activeTab="dashboard"
        onTabChange={handleTabChange}
        unreadCount={unreadCount}
        onOpenNotifications={() => void loadNotifications()}
        assistantHref={
          accountId ? `/assistant?account=${accountId}` : "/assistant"
        }
        userEmail={userEmail}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        profileId={profileId}
      />

      <main className="mx-auto max-w-3xl px-4 sm:px-8 pt-6 pb-28 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/app"
              aria-label="Back to dashboard"
              title="Back to dashboard"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-neutral-800 dark:text-neutral-100 transition-colors mb-3"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FF1A1A] text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
              Live updates for deposits, transfers, payment links, and account
              activity.
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="flow-liquid-btn px-4 py-2 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div>
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

        {/* Notifications Card */}
        <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-xs text-neutral-500 dark:text-neutral-400">
              Loading notifications…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 dark:text-neutral-400">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </div>
              <p className="text-sm font-bold text-neutral-950 dark:text-white">
                You&apos;re all caught up
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                No notifications in this view yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
              {filtered.map((n) => {
                const isClaim = n.type === "CLAIM_FLOW_ID";
                const isIncoming =
                  n.type === "DEPOSIT_DETECTED" ||
                  n.type === "PAYMENT_RECEIVED";
                const isOutgoing = n.type === "PAYMENT_COMPLETED";
                const formattedDate = new Date(n.createdAt).toLocaleString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  },
                );
                const formattedDescription = n.description.replace(
                  /(?<![\w.])(\d+\.\d{4,})(?![\w.])/g,
                  (match) => {
                    const num = Number.parseFloat(match);
                    if (!Number.isFinite(num)) return match;
                    if (num > 0 && num < 0.001) return "<0.001";
                    return num.toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3,
                    });
                  },
                );

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (isClaim) {
                        setIsFlowIdModalOpen(true);
                        return;
                      }
                      if (!n.isRead) {
                        void markSingleRead(n.id);
                      }
                      if (n.link) {
                        startRouteTransition(n.link);
                        router.push(n.link);
                      }
                    }}
                    className={`w-full text-left p-3.5 sm:px-6 sm:py-4 flex items-start gap-3 sm:gap-4 transition-colors cursor-pointer ${
                      !n.isRead
                        ? "bg-blue-50/40 dark:bg-blue-950/15 hover:bg-blue-50/70 dark:hover:bg-blue-950/25"
                        : "hover:bg-neutral-50/80 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full ${
                        isClaim
                          ? "bg-red-50 dark:bg-red-950/40 text-[#FF1A1A]"
                          : isIncoming
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                            : isOutgoing
                              ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                              : "bg-neutral-100 dark:bg-white/[0.07] text-neutral-700 dark:text-neutral-200"
                      }`}
                    >
                      {isIncoming ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14" />
                          <path d="m19 12-7 7-7-7" />
                        </svg>
                      ) : isOutgoing ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 19V5" />
                          <path d="m5 12 7-7 7 7" />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs sm:text-sm font-bold text-neutral-950 dark:text-white truncate">
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span
                              className="h-2 w-2 rounded-full bg-[#FF1A1A] shrink-0"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 shrink-0 whitespace-nowrap tabular-nums">
                          {formattedDate}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400 break-words tabular-nums">
                        {formattedDescription}
                      </p>
                      {isClaim && (
                        <span className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-[#FF1A1A] text-white">
                          Claim @flow ID →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {accountId && (
        <FlowIdClaimModal
          isOpen={isFlowIdModalOpen}
          onClose={() => setIsFlowIdModalOpen(false)}
          accountId={accountId}
          onClaimed={() => {
            setIsFlowIdModalOpen(false);
            void loadNotifications();
          }}
        />
      )}
    </div>
  );
}
