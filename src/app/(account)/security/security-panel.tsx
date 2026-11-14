"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "../../../components/theme-toggle.tsx";
import { FloatingNav } from "../../../components/floating-nav.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import {
  readProfilePreference,
  writeProfilePreference,
} from "../../../components/profile-preferences.ts";
import {
  describe,
  Feedback,
  FreshProof,
  googleNavigate,
  send,
} from "../../controls.tsx";

export interface SessionRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly current: boolean;
}

export interface SecurityPanelProps {
  readonly profileId: string;
  readonly email: string;
  readonly emailEnrolled: boolean;
  readonly mailboxPaused: boolean;
  readonly googleLinked: boolean;
  readonly sessions: readonly SessionRecord[];
  readonly accounts: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly role: string;
    readonly walletStatus: string;
  }[];
  readonly initialProfilePreference?: {
    readonly displayName: string | null;
    readonly avatarDataUrl: string | null;
  };
  readonly initialNotificationPreferences?: {
    readonly incomingPayments: boolean;
    readonly paymentLinkActivity: boolean;
    readonly securityAlerts: boolean;
  };
}

type SettingsTab = "notifications" | "security" | "preferences" | "profile";
type SecurityAction =
  | "enroll-email"
  | "disable-email"
  | "link-google"
  | "unlink-google"
  | "revoke-all";

async function compressAvatarDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image"));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  if (dataUrl.length <= 280_000) return dataUrl;
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 256;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL("image/jpeg", 0.85);
      if (encoded.length > 340_000) {
        return reject(new Error("Avatar image is too large."));
      }
      resolve(encoded);
    };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });
}

export function SecurityPanel({
  profileId,
  email,
  emailEnrolled,
  mailboxPaused,
  googleLinked,
  sessions: initialSessions,
  accounts,
  initialProfilePreference,
  initialNotificationPreferences,
}: SecurityPanelProps) {
  const searchParams = useSearchParams();
  const initialTab =
    (searchParams?.get("tab") as SettingsTab) || "notifications";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const [notificationPreferences, setNotificationPreferences] = useState({
    incomingPayments: initialNotificationPreferences?.incomingPayments ?? true,
    paymentLinkActivity:
      initialNotificationPreferences?.paymentLinkActivity ?? true,
    securityAlerts: initialNotificationPreferences?.securityAlerts ?? true,
  });
  const { incomingPayments, paymentLinkActivity, securityAlerts } =
    notificationPreferences;

  // Profile Customization state
  const primaryAccount = accounts[0];
  const [displayName, setDisplayName] = useState(
    initialProfilePreference?.displayName ||
      primaryAccount?.name ||
      "Personal Workspace",
  );
  const [profileSavedMessage, setProfileSavedMessage] = useState<string | null>(
    null,
  );

  // Sessions & security proof state
  const [sessions, setSessions] =
    useState<readonly SessionRecord[]>(initialSessions);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pendingSecurityAction, setPendingSecurityAction] =
    useState<SecurityAction | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [message, setMessage] = useState("");

  const backHref = primaryAccount ? `/accounts/${primaryAccount.id}` : "/";

  const defaultName =
    initialProfilePreference?.displayName ||
    primaryAccount?.name ||
    "Personal Workspace";
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (initialProfilePreference) {
        writeProfilePreference(
          profileId,
          "name",
          initialProfilePreference.displayName,
        );
        writeProfilePreference(
          profileId,
          "avatar",
          initialProfilePreference.avatarDataUrl,
        );
      }
      if (initialNotificationPreferences) {
        writeProfilePreference(
          profileId,
          "incomingPayments",
          String(initialNotificationPreferences.incomingPayments),
        );
        writeProfilePreference(
          profileId,
          "paymentLinkActivity",
          String(initialNotificationPreferences.paymentLinkActivity),
        );
        writeProfilePreference(
          profileId,
          "securityAlerts",
          String(initialNotificationPreferences.securityAlerts),
        );
      }
      setDisplayName(readProfilePreference(profileId, "name") || defaultName);
      setNotificationPreferences({
        incomingPayments:
          initialNotificationPreferences?.incomingPayments ??
          readProfilePreference(profileId, "incomingPayments") !== "false",
        paymentLinkActivity:
          initialNotificationPreferences?.paymentLinkActivity ??
          readProfilePreference(profileId, "paymentLinkActivity") !== "false",
        securityAlerts:
          initialNotificationPreferences?.securityAlerts ??
          readProfilePreference(profileId, "securityAlerts") !== "false",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    defaultName,
    initialNotificationPreferences,
    initialProfilePreference,
    profileId,
  ]);

  async function toggleNotification(key: keyof typeof notificationPreferences) {
    const next = !notificationPreferences[key];
    setNotificationPreferences({ ...notificationPreferences, [key]: next });
    try {
      writeProfilePreference(profileId, key, String(next));
      if (primaryAccount) {
        await send(
          `/api/accounts/${primaryAccount.id}/notification-preferences`,
          { [key]: next },
          "PATCH",
        );
      }
      setMessage("");
    } catch (err) {
      setNotificationPreferences({ ...notificationPreferences, [key]: !next });
      writeProfilePreference(profileId, key, String(!next));
      setMessage(describe(err));
    }
  }

  async function handleSaveDisplayName(event: React.FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name || name.length > 80) {
      setProfileSavedMessage(
        "Enter a display name between 1 and 80 characters.",
      );
      return;
    }
    try {
      await send("/api/me/preferences", { displayName: name }, "PATCH");
      writeProfilePreference(profileId, "name", name);
      setDisplayName(name);
      setProfileSavedMessage("Display name saved to your account.");
    } catch (err) {
      setProfileSavedMessage(describe(err));
    }
  }

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setProfileSavedMessage("Choose a PNG, JPEG, or WebP image up to 2 MB.");
      return;
    }
    try {
      const encoded = await compressAvatarDataUrl(file);
      await send("/api/me/preferences", { avatarDataUrl: encoded }, "PATCH");
      writeProfilePreference(profileId, "avatar", encoded);
      setProfileSavedMessage("Avatar saved to your account.");
    } catch (err) {
      setProfileSavedMessage(describe(err));
    }
  }

  async function handleResetAvatar() {
    try {
      await send("/api/me/preferences", { avatarDataUrl: null }, "PATCH");
      writeProfilePreference(profileId, "avatar", null);
      setProfileSavedMessage("Avatar reset to default.");
    } catch (err) {
      setProfileSavedMessage(describe(err));
    }
  }

  // Revoke session
  async function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    setMessage("");
    try {
      await send("/api/security/sessions/revoke", { id: sessionId }, "POST");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setMessage("Session revoked successfully.");
    } catch (err) {
      setMessage(describe(err));
    } finally {
      setRevokingId(null);
    }
  }

  async function executeSecurityAction(action: SecurityAction) {
    setSecurityBusy(true);
    setMessage("");
    try {
      if (action === "enroll-email") {
        await send("/api/security/email/enroll", {}, "POST");
        window.location.replace("/sign-in?notice=email-enrolled");
      } else if (action === "disable-email") {
        await send("/api/security/email/disable", {}, "POST");
        window.location.replace("/sign-in?notice=email-disabled");
      } else if (action === "link-google") {
        const res = await send<{ url: string }>(
          "/api/security/google/link",
          {},
          "POST",
        );
        googleNavigate(res.url);
      } else if (action === "unlink-google") {
        await send("/api/security/google/unlink", {}, "POST");
        window.location.replace("/sign-in?notice=google-unlinked");
      } else if (action === "revoke-all") {
        await send("/api/security/sessions/revoke-all", {}, "POST");
        window.location.replace("/sign-in?notice=sessions-revoked");
      }
    } catch (err) {
      setMessage(describe(err));
      setSecurityBusy(false);
      setPendingSecurityAction(null);
    }
  }

  function handleRevokeAll() {
    setMessage("");
    setPendingSecurityAction("revoke-all");
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-white pb-20 selection:bg-red-100 selection:text-red-900">
      <FloatingNav
        activeTab="settings"
        onTabChange={(tab) => {
          window.location.assign(
            tab === "dashboard" ? backHref : `${backHref}?view=${tab}`,
          );
        }}
        userEmail={email}
        userName={primaryAccount?.name ?? "Personal"}
        profileId={profileId}
      />

      {/* Main Settings Page Container */}
      <main className="mx-auto max-w-5xl px-4 sm:px-8 pt-6">
        {/* Back Link */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors mb-4"
        >
          <span>←</span>
          <span>Back</span>
        </Link>

        {/* Settings Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
              Settings
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
              Manage your profile ({email}), security, notifications, and
              preferences.
            </p>
          </div>
          <ThemeToggle />
        </div>

        {message && (
          <div className="mb-6">
            <Feedback text={message} />
          </div>
        )}

        {/* 2-Column Layout matching media_1794481849606_6993ee54.jpg */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Subnav Card (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-3 shadow-sm space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "profile"
                  ? "bg-red-50/70 dark:bg-red-950/30 text-neutral-950 dark:text-white border border-red-200/60 dark:border-red-900/40"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
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
                className={activeTab === "profile" ? "text-[#FF1A1A]" : ""}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Account &amp; Profile</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "notifications"
                  ? "bg-red-50/70 dark:bg-red-950/30 text-neutral-950 dark:text-white border border-red-200/60 dark:border-red-900/40"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={
                    activeTab === "notifications" ? "text-[#FF1A1A]" : ""
                  }
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <span>Notifications</span>
              </div>
              <span className="h-2 w-2 rounded-full bg-[#FF1A1A]" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "security"
                  ? "bg-red-50/70 dark:bg-red-950/30 text-neutral-950 dark:text-white border border-red-200/60 dark:border-red-900/40"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
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
                className={activeTab === "security" ? "text-[#FF1A1A]" : ""}
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Security &amp; Sessions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("preferences")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "preferences"
                  ? "bg-red-50/70 dark:bg-red-950/30 text-neutral-950 dark:text-white border border-red-200/60 dark:border-red-900/40"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              }`}
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
                className={activeTab === "preferences" ? "text-[#FF1A1A]" : ""}
              >
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span>Preferences</span>
            </button>
          </div>

          {/* Right Content Panels (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* TAB 1: NOTIFICATIONS (Matches Reference Screenshot) */}
            {activeTab === "notifications" && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm">
                  {/* Panel Header */}
                  <div className="flex items-start gap-4 mb-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40 text-[#FF1A1A]">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
                        Notifications
                      </h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Choose how you want to be notified about payments and
                        account activity.
                      </p>
                    </div>
                  </div>

                  {/* Toggle 1: Incoming payments */}
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors mb-3">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        Incoming payments
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Show received payments in your notification drawer.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={incomingPayments}
                      aria-label="Incoming payments"
                      onClick={() => toggleNotification("incomingPayments")}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        incomingPayments
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          incomingPayments ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Toggle 2: Payment link activity */}
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors mb-3">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        Payment link activity
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Show payment link activity in your notification drawer.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={paymentLinkActivity}
                      aria-label="Payment link activity"
                      onClick={() => toggleNotification("paymentLinkActivity")}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        paymentLinkActivity
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          paymentLinkActivity
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Toggle 3: Security alerts */}
                  <div className="flex items-center justify-between p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        Security alerts
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Show security notices in your notification drawer.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={securityAlerts}
                      aria-label="Security alerts"
                      onClick={() => toggleNotification("securityAlerts")}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        securityAlerts
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          securityAlerts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Secondary Navigation Strips matching reference screenshot */}
                <button
                  type="button"
                  onClick={() => setActiveTab("security")}
                  className="w-full flex items-center justify-between p-5 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-sm hover:border-neutral-300 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
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
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xs text-neutral-950 dark:text-white">
                        Security &amp; Sessions
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Keep your account secure and manage your active
                        sessions.
                      </p>
                    </div>
                  </div>
                  <span className="text-neutral-400 font-bold">&gt;</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("preferences")}
                  className="w-full flex items-center justify-between p-5 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-sm hover:border-neutral-300 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
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
                        <line x1="4" y1="21" x2="4" y2="14" />
                        <line x1="4" y1="10" x2="4" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12" y2="3" />
                        <line x1="20" y1="21" x2="20" y2="16" />
                        <line x1="20" y1="12" x2="20" y2="3" />
                        <line x1="1" y1="14" x2="7" y2="14" />
                        <line x1="9" y1="8" x2="15" y2="8" />
                        <line x1="17" y1="16" x2="23" y2="16" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xs text-neutral-950 dark:text-white">
                        Preferences
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Customize the look and feel of Flow.
                      </p>
                    </div>
                  </div>
                  <span className="text-neutral-400 font-bold">&gt;</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className="w-full flex items-center justify-between p-5 rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] shadow-sm hover:border-neutral-300 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
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
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-display font-bold text-xs text-neutral-950 dark:text-white">
                        Account &amp; Profile
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Update your personal details and profile picture.
                      </p>
                    </div>
                  </div>
                  <span className="text-neutral-400 font-bold">&gt;</span>
                </button>
              </div>
            )}

            {/* TAB 2: SECURITY & SESSIONS */}
            {activeTab === "security" && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-6">
                  <div>
                    <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
                      Security &amp; Authentication
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      Manage authentication credentials and active sessions for{" "}
                      <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-200">
                        {email}
                      </span>
                    </p>
                  </div>

                  {/* Authentication Methods */}
                  {mailboxPaused && (
                    <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
                      Security changes requiring email verification are paused
                      while your mailbox is flagged. Contact support to restore
                      mailbox access.
                    </div>
                  )}

                  {pendingSecurityAction && (
                    <FreshProof
                      purpose={pendingSecurityAction}
                      onConfirm={() =>
                        executeSecurityAction(pendingSecurityAction)
                      }
                      onCancel={() => {
                        setPendingSecurityAction(null);
                        setSecurityBusy(false);
                      }}
                    >
                      {pendingSecurityAction === "enroll-email"
                        ? `Verify your mailbox (${email}) to enable Email OTP sign-in. Your session will refresh afterward.`
                        : pendingSecurityAction === "disable-email"
                          ? `Verify your mailbox (${email}) to disable Email OTP sign-in. Your session will refresh afterward.`
                          : pendingSecurityAction === "link-google"
                            ? `Confirm with a security code before linking Google SSO to ${email}.`
                            : pendingSecurityAction === "unlink-google"
                              ? `Confirm with a security code before disconnecting Google SSO from ${email}.`
                              : `Verify with a security code to sign out all devices.`}
                    </FreshProof>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-neutral-950 dark:text-white">
                            Email OTP
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              emailEnrolled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                                : "bg-neutral-100 text-neutral-700 border-neutral-200/60"
                            }`}
                          >
                            {emailEnrolled ? "Enrolled" : "Available"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          Passwordless one-time verification codes sent to{" "}
                          {email}.
                        </p>
                      </div>
                      <div>
                        {!emailEnrolled ? (
                          <button
                            type="button"
                            disabled={mailboxPaused || securityBusy}
                            onClick={() =>
                              setPendingSecurityAction("enroll-email")
                            }
                            className="px-3 py-1.5 rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                          >
                            Enroll Email OTP
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              !googleLinked || mailboxPaused || securityBusy
                            }
                            title={
                              !googleLinked
                                ? "Connect Google SSO before disabling Email OTP."
                                : undefined
                            }
                            onClick={() =>
                              setPendingSecurityAction("disable-email")
                            }
                            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-[11px] font-semibold hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors"
                          >
                            Disable Email OTP
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-neutral-950 dark:text-white">
                            Google SSO
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              googleLinked
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {googleLinked ? "Connected" : "Not connected"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500">
                          Sign in directly using your verified Google account.
                        </p>
                      </div>
                      <div>
                        {!googleLinked ? (
                          <button
                            type="button"
                            disabled={mailboxPaused || securityBusy}
                            onClick={() =>
                              setPendingSecurityAction("link-google")
                            }
                            className="px-3 py-1.5 rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                          >
                            Connect Google
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              !emailEnrolled || mailboxPaused || securityBusy
                            }
                            title={
                              !emailEnrolled
                                ? "Enroll Email OTP before disconnecting Google SSO."
                                : undefined
                            }
                            onClick={() =>
                              setPendingSecurityAction("unlink-google")
                            }
                            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-[11px] font-semibold hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors"
                          >
                            Disconnect Google
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Sessions */}
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-display text-xs font-bold text-neutral-950 dark:text-white">
                          Active Sessions ({sessions.length})
                        </h3>
                        <p className="text-[11px] text-neutral-500">
                          Devices currently authorized to access this account.
                        </p>
                      </div>
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          onClick={handleRevokeAll}
                          disabled={revokingId === "all"}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors"
                        >
                          {revokingId === "all"
                            ? "Signing out..."
                            : "Sign out other sessions"}
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {sessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="flex items-center justify-between p-3.5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">💻</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                                  Authorized Browser Session
                                </span>
                                {sess.current && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    Current
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-neutral-500">
                                Created:{" "}
                                {new Date(sess.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {!sess.current && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(sess.id)}
                              disabled={revokingId === sess.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-neutral-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              {revokingId === sess.id
                                ? "Revoking..."
                                : "Revoke"}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PREFERENCES */}
            {activeTab === "preferences" && (
              <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-6">
                <div>
                  <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
                    Preferences
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Customize your display settings and theme preferences.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div>
                    <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                      Appearance Theme
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Toggle between clean light and deep dark visual styles.
                    </p>
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            )}

            {/* TAB 4: ACCOUNT & PROFILE */}
            {activeTab === "profile" && (
              <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-6">
                <div>
                  <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
                    Account &amp; Profile
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Manage your personal details and profile picture across
                    Flow.
                  </p>
                </div>

                {profileSavedMessage && (
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    {profileSavedMessage}
                  </div>
                )}

                {/* Profile Picture Card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30">
                  <div className="flex items-center gap-4">
                    <UserAvatar
                      profileId={profileId}
                      size={64}
                      className="rounded-full border-2 border-white dark:border-neutral-700 shadow-sm"
                    />
                    <div>
                      <p className="font-display font-bold text-sm text-neutral-950 dark:text-white">
                        Profile Picture
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        PNG or JPEG up to 2 MB. Saved in this browser.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-xs hover:opacity-90 transition-opacity cursor-pointer">
                      <span>Change photo</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleResetAvatar}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Personal Name Form */}
                <form
                  onSubmit={handleSaveDisplayName}
                  className="p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 space-y-4"
                >
                  <div>
                    <label
                      htmlFor="display-name-input"
                      className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5"
                    >
                      Display Name
                    </label>
                    <input
                      id="display-name-input"
                      type="text"
                      maxLength={100}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name or workspace title"
                      className="w-full px-4 py-2.5 rounded-2xl text-xs bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 text-neutral-950 dark:text-white focus:outline-hidden focus:border-neutral-900 dark:focus:border-white"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Primary Email:{" "}
                      <span className="font-mono text-neutral-800 dark:text-neutral-200">
                        {email}
                      </span>
                    </p>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>

                {/* Account Details */}
                <div className="p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Account Type</span>
                    <span className="font-semibold text-neutral-900 dark:text-white uppercase tracking-wider text-[11px]">
                      {primaryAccount?.kind ?? "PERSONAL"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Account ID</span>
                    <span className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">
                      {primaryAccount?.id ?? "acc_default"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Verification</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Verified Owner
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
