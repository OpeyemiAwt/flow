"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "../../../components/theme-toggle.tsx";
import { FloatingNav } from "../../../components/floating-nav.tsx";
import { FlowIdClaimModal } from "../../../components/flow-id-claim-modal.tsx";
import { useTranslation } from "../../../components/language-provider.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import { TypewriterInput } from "../../../components/typewriter-input.tsx";
import {
  LOCALE_META,
  SUPPORTED_LOCALES,
  type FlowLocale,
} from "../../../lib/i18n.ts";
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
  readonly name?: string | null;
  readonly image?: string | null;
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
    readonly emailTransactions: boolean;
    readonly emailNewsletter: boolean;
  };
  readonly initialFlowId?: string | null;
}

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
  name,
  image,
  emailEnrolled,
  mailboxPaused,
  googleLinked,
  sessions: initialSessions,
  accounts,
  initialProfilePreference,
  initialNotificationPreferences,
  initialFlowId,
}: SecurityPanelProps) {
  const { locale, setLocale, t } = useTranslation();
  const [notificationPreferences, setNotificationPreferences] = useState({
    incomingPayments: initialNotificationPreferences?.incomingPayments ?? true,
    paymentLinkActivity:
      initialNotificationPreferences?.paymentLinkActivity ?? true,
    securityAlerts: initialNotificationPreferences?.securityAlerts ?? true,
    emailTransactions:
      initialNotificationPreferences?.emailTransactions ?? true,
    emailNewsletter: initialNotificationPreferences?.emailNewsletter ?? false,
  });
  const {
    incomingPayments,
    paymentLinkActivity,
    securityAlerts,
    emailTransactions,
    emailNewsletter,
  } = notificationPreferences;

  // Profile Customization state
  const primaryAccount = accounts[0];
  const [flowId, setFlowId] = useState<string | null>(initialFlowId ?? null);
  const [isFlowIdModalOpen, setIsFlowIdModalOpen] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [flowIdCopied, setFlowIdCopied] = useState(false);
  const [accountIdCopied, setAccountIdCopied] = useState(false);
  const walletStatusInfo = (() => {
    switch (primaryAccount?.walletStatus) {
      case "active":
        return { label: "Wallet active", dot: "bg-emerald-500" };
      case "provisioning":
        return {
          label: "Wallet provisioning in progress",
          dot: "bg-amber-500",
        };
      case "setup_failed":
        return { label: "Wallet setup failed", dot: "bg-red-500" };
      case "frozen":
        return { label: "Wallet frozen", dot: "bg-red-500" };
      case "recovery_pending":
        return { label: "Wallet recovery pending", dot: "bg-amber-500" };
      default:
        return { label: "Wallet setup pending", dot: "bg-amber-500" };
    }
  })();
  const initialResolvedName =
    initialProfilePreference?.displayName?.trim() || name?.trim() || email;
  const [displayName, setDisplayName] = useState(initialResolvedName);
  const [savedDisplayName, setSavedDisplayName] = useState(initialResolvedName);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
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

  const backHref = primaryAccount ? "/app" : "/";

  const defaultName =
    initialProfilePreference?.displayName?.trim() || name?.trim() || email;
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
        writeProfilePreference(
          profileId,
          "emailTransactions",
          String(initialNotificationPreferences.emailTransactions),
        );
        writeProfilePreference(
          profileId,
          "emailNewsletter",
          String(initialNotificationPreferences.emailNewsletter),
        );
      }
      const hydratedName =
        readProfilePreference(profileId, "name")?.trim() || defaultName;
      setDisplayName(hydratedName);
      setSavedDisplayName(hydratedName);
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
        emailTransactions:
          initialNotificationPreferences?.emailTransactions ??
          readProfilePreference(profileId, "emailTransactions") !== "false",
        emailNewsletter:
          initialNotificationPreferences?.emailNewsletter ??
          readProfilePreference(profileId, "emailNewsletter") === "true",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    defaultName,
    initialNotificationPreferences,
    initialProfilePreference,
    profileId,
  ]);

  const inAppNotifications =
    incomingPayments || paymentLinkActivity || securityAlerts;

  async function toggleInAppNotifications() {
    const prev = {
      incomingPayments: notificationPreferences.incomingPayments,
      paymentLinkActivity: notificationPreferences.paymentLinkActivity,
      securityAlerts: notificationPreferences.securityAlerts,
    };
    const next = !inAppNotifications;
    setNotificationPreferences({
      ...notificationPreferences,
      incomingPayments: next,
      paymentLinkActivity: next,
      securityAlerts: next,
    });
    try {
      writeProfilePreference(profileId, "incomingPayments", String(next));
      writeProfilePreference(profileId, "paymentLinkActivity", String(next));
      writeProfilePreference(profileId, "securityAlerts", String(next));
      if (primaryAccount) {
        await send(
          `/api/accounts/${primaryAccount.id}/notification-preferences`,
          {
            incomingPayments: next,
            paymentLinkActivity: next,
            securityAlerts: next,
          },
          "PATCH",
        );
      }
      setMessage("");
    } catch (err) {
      setNotificationPreferences({
        ...notificationPreferences,
        ...prev,
      });
      writeProfilePreference(
        profileId,
        "incomingPayments",
        String(prev.incomingPayments),
      );
      writeProfilePreference(
        profileId,
        "paymentLinkActivity",
        String(prev.paymentLinkActivity),
      );
      writeProfilePreference(
        profileId,
        "securityAlerts",
        String(prev.securityAlerts),
      );
      setMessage(describe(err));
    }
  }

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
      setSavedDisplayName(name);
      setEditingDisplayName(false);
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
        userName={savedDisplayName || email}
        userAvatarUrl={image}
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
              Manage your profile, security, notifications, and preferences.
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
              <span
                className={`h-2 w-2 rounded-full ${walletStatusInfo.dot}`}
                aria-hidden="true"
              />
              <span>{walletStatusInfo.label}</span>
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-6">
            <Feedback text={message} />
          </div>
        )}

        {/* Single-Scroll Settings Layout */}
        <div className="flow-anim-fade-up space-y-6">
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
                  <div className="flow-anim-fade-up p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    {profileSavedMessage}
                  </div>
                )}

                {/* Profile Avatar with Pencil Edit Overlay */}
                <div className="flex items-center">
                  <div className="relative inline-block">
                    <UserAvatar
                      profileId={profileId}
                      fallbackImage={image}
                      email={email}
                      name={savedDisplayName || name}
                      alt={savedDisplayName || email}
                      size={72}
                      className="rounded-full border-2 border-white dark:border-neutral-700 shadow-sm object-cover"
                    />
                    <label
                      aria-label="Change profile photo"
                      title="Change profile photo"
                      className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 border-2 border-white dark:border-[#141414] shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Personal Name Summary & Pencil Edit */}
                {editingDisplayName ? (
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
                      <TypewriterInput
                        id="display-name-input"
                        type="text"
                        maxLength={100}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={email}
                        className="w-full px-4 py-2.5 rounded-2xl text-xs bg-white dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 text-neutral-950 dark:text-white focus:outline-hidden focus:border-neutral-900 dark:focus:border-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Primary Email:{" "}
                        <span className="font-mono text-neutral-800 dark:text-neutral-200">
                          {email}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDisplayName(savedDisplayName);
                            setEditingDisplayName(false);
                          }}
                          className="px-4 py-2 rounded-full text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Display Name
                      </p>
                      <p className="mt-1 text-sm font-bold text-neutral-950 dark:text-white truncate">
                        {savedDisplayName}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        Primary Email:{" "}
                        <span className="font-mono text-neutral-800 dark:text-neutral-200">
                          {email}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Edit display name"
                      title="Edit display name"
                      onClick={() => {
                        setProfileSavedMessage(null);
                        setDisplayName(savedDisplayName);
                        setEditingDisplayName(true);
                      }}
                      className="shrink-0 p-2.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Unique Flow ID */}
                <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-xs font-bold text-neutral-950 dark:text-white">
                        Unique Flow ID
                      </p>
                    </div>
                    {flowId ? (
                      <p className="mt-1 font-mono text-sm font-bold text-neutral-950 dark:text-white truncate">
                        {flowId}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        Pick a permanent <span className="font-mono">@flow</span> handle so anyone on Flow can send assets straight to your wallet.
                      </p>
                    )}
                  </div>
                  {flowId ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const directUrl = `${window.location.origin}/${flowId}`;
                          navigator.clipboard?.writeText(directUrl).catch(() => {});
                          setFlowIdCopied(true);
                          window.setTimeout(() => setFlowIdCopied(false), 1800);
                        }}
                        className="px-3.5 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        {flowIdCopied ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(flowId).catch(() => {});
                          setFlowIdCopied(true);
                          window.setTimeout(() => setFlowIdCopied(false), 1800);
                        }}
                        className="px-3.5 py-2 rounded-full text-xs font-semibold border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        Copy ID
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!primaryAccount}
                      onClick={() => setIsFlowIdModalOpen(true)}
                      className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      Claim @flow ID
                    </button>
                  )}
                </div>

                {/* Account Details */}
                <div className="p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 text-xs space-y-2.5">
                  <div className="flex justify-between items-center gap-4">
                    <span className="shrink-0 whitespace-nowrap text-neutral-500">
                      Account Type
                    </span>
                    <span className="font-semibold text-neutral-900 dark:text-white uppercase tracking-wider text-[11px] text-right">
                      {primaryAccount?.kind ?? "PERSONAL"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="shrink-0 whitespace-nowrap text-neutral-500">
                      Account ID
                    </span>
                    <div className="min-w-0 flex items-center justify-end gap-1.5">
                      <span
                        title={primaryAccount?.id ?? "acc_default"}
                        className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px] truncate text-right"
                      >
                        {primaryAccount?.id ?? "acc_default"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const idToCopy = primaryAccount?.id ?? "acc_default";
                          void navigator.clipboard
                            ?.writeText(idToCopy)
                            .then(() => {
                              setAccountIdCopied(true);
                              window.setTimeout(
                                () => setAccountIdCopied(false),
                                1800,
                              );
                            });
                        }}
                        aria-label="Copy Account ID"
                        title={accountIdCopied ? "Copied" : "Copy Account ID"}
                        className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                      >
                        {accountIdCopied ? (
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-emerald-500"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="shrink-0 whitespace-nowrap text-neutral-500">
                      Wallet Status
                    </span>
                    <span className="inline-flex items-center justify-end gap-2 text-xs font-semibold text-neutral-900 dark:text-white text-right">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${walletStatusInfo.dot}`}
                        aria-hidden="true"
                      />
                      <span>{walletStatusInfo.label}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="shrink-0 whitespace-nowrap text-neutral-500">
                      Verification
                    </span>
                    <span className="inline-flex items-center justify-end gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 text-right">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      Verified Owner
                    </span>
                  </div>
                </div>
              </div>

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

                  {/* Unified In-App Notifications Toggle */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        In-app notifications
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Show incoming payments, payment link activity, and
                        security alerts in your notification drawer.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={inAppNotifications}
                      aria-label="In-app notifications"
                      onClick={() => void toggleInAppNotifications()}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        inAppNotifications
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          inAppNotifications ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Email Preferences Divider */}
                  <div className="pt-5 pb-3 border-t border-neutral-100 dark:border-neutral-800 mt-5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                      Email &amp; Newsletter
                    </p>
                  </div>

                  {/* Toggle 4: Transaction receipts in email */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors mb-3">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        Transaction receipts in email
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Receive a designed receipt email whenever your sends or
                        conversions succeed.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailTransactions}
                      aria-label="Transaction receipts in email"
                      onClick={() => toggleNotification("emailTransactions")}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        emailTransactions
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          emailTransactions ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Toggle 5: Subscribe to FLOW Blog newsletter */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                    <div>
                      <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                        FLOW Blog newsletter
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Subscribe to receive new FLOW blog posts, product
                        releases, and weekly shipping updates in your inbox.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailNewsletter}
                      aria-label="FLOW Blog newsletter"
                      onClick={() => toggleNotification("emailNewsletter")}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        emailNewsletter
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-200 dark:bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          emailNewsletter ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

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
                      {t.settingsAppearanceLabel}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {t.settingsAppearanceDesc}
                    </p>
                  </div>
                  <ThemeToggle />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                  <div>
                    <p className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                      {t.settingsLanguageLabel}
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {t.settingsLanguageDesc}
                    </p>
                  </div>
                  <select
                    aria-label={t.settingsLanguageLabel}
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as FlowLocale)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-950 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-600 cursor-pointer"
                  >
                    {SUPPORTED_LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {LOCALE_META[code].nativeName} ({LOCALE_META[code].englishName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-6">
                  <div>
                    <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
                      {t.settingsSecurityTitle}
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
                            className={`text-[11px] font-semibold ${
                              emailEnrolled
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-neutral-500 dark:text-neutral-400"
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
                            disabled
                            aria-disabled="true"
                            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-[11px] font-semibold opacity-40 cursor-not-allowed"
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
                            className={`text-[11px] font-semibold ${
                              googleLinked
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-neutral-500 dark:text-neutral-400"
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
                            disabled
                            aria-disabled="true"
                            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 text-[11px] font-semibold opacity-40 cursor-not-allowed"
                          >
                            Disconnect Google
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Help & Legal */}
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="mb-3">
                      <h3 className="font-display text-xs font-bold text-neutral-950 dark:text-white">
                        Help &amp; Legal
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Learn how FLOW works and review our policies.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <a
                        href="mailto:flow@devhub.forum?subject=FLOW%20Support"
                        className="group flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20 hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60 hover:border-neutral-200 dark:hover:border-neutral-700 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                            Contact Support
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            Need help or have feedback? Email{" "}
                            <span className="font-medium text-neutral-700 dark:text-neutral-300">
                              flow@devhub.forum
                            </span>
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 shrink-0 text-neutral-400 group-hover:text-neutral-950 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </a>
                      {[
                        {
                          href: "/docs#how-flow-works",
                          title: "How FLOW works",
                          description:
                            "Guide to private balances, multi-chain routes, and payment links.",
                        },
                        {
                          href: "/privacy",
                          title: "Privacy Policy",
                          description:
                            "What data FLOW stores, what stays private, and your controls.",
                        },
                        {
                          href: "/terms",
                          title: "Terms of Service",
                          description:
                            "Rules for using the FLOW interface and self-custodial accounts.",
                        },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="group flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/20 hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60 hover:border-neutral-200 dark:hover:border-neutral-700 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-950 dark:text-white">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              {item.description}
                            </p>
                          </div>
                          <svg
                            className="w-4 h-4 shrink-0 text-neutral-400 group-hover:text-neutral-950 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </Link>
                      ))}
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
                            <div className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center shrink-0">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect width="18" height="12" x="3" y="4" rx="2" ry="2" />
                                <line x1="2" x2="22" y1="20" y2="20" />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-display font-semibold text-xs text-neutral-950 dark:text-white">
                                  Authorized Browser Session
                                </span>
                                {sess.current && (
                                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    · Current
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

              {/* Danger Zone: Delete Account */}
              <div className="rounded-3xl border border-red-200/80 dark:border-red-900/50 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold text-red-600 dark:text-red-400">
                    Delete account
                  </h2>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 max-w-xl">
                    Permanently delete your FLOW account, sign out all active
                    sessions, disable your payment links, and release your @flow
                    ID. Make sure you have moved any remaining funds first.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmText("");
                    setDeleteAccountError("");
                    setDeleteAccountModalOpen(true);
                  }}
                  className="shrink-0 px-4 py-2.5 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors cursor-pointer"
                >
                  Delete account
                </button>
              </div>
        </div>
      </main>

      {/* Delete Account Confirmation Modal */}
      {deleteAccountModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
          onClick={() => {
            if (!deletingAccount) setDeleteAccountModalOpen(false);
          }}
        >
          <div
            className="flow-anim-fade-up w-full max-w-md rounded-[28px] border border-neutral-200/90 dark:border-white/[0.1] bg-white dark:bg-[#161618] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3
                id="delete-account-modal-title"
                className="font-serif text-2xl text-neutral-950 dark:text-white"
              >
                Delete your FLOW account?
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                This action is permanent and cannot be undone. All active
                sessions will be revoked, your payment links will be deleted,
                and your @flow ID will be released. Please withdraw any
                remaining wallet balances before proceeding.
              </p>
            </div>

            <div>
              <label
                htmlFor="delete-account-confirm-input"
                className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5"
              >
                Type <span className="font-mono text-red-600">DELETE</span> to
                confirm
              </label>
              <TypewriterInput
                id="delete-account-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={deletingAccount}
                className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono bg-neutral-50 dark:bg-[#1E1E20] border border-neutral-200 dark:border-white/[0.1] text-neutral-950 dark:text-white focus:outline-hidden focus:border-red-500"
              />
            </div>

            {deleteAccountError && (
              <p
                role="alert"
                className="text-xs font-medium text-red-600 dark:text-red-400"
              >
                {deleteAccountError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => setDeleteAccountModalOpen(false)}
                className="flow-liquid-btn px-4 py-2.5 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                onClick={async () => {
                  setDeletingAccount(true);
                  setDeleteAccountError("");
                  try {
                    const res = await fetch("/api/auth/delete-account", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setDeleteAccountError(
                        data?.error ||
                          "Could not delete account. Please try again.",
                      );
                      setDeletingAccount(false);
                      return;
                    }
                    window.location.replace("/sign-in");
                  } catch {
                    setDeleteAccountError(
                      "Network error while deleting account. Please try again.",
                    );
                    setDeletingAccount(false);
                  }
                }}
                className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingAccount ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
      {primaryAccount && (
        <FlowIdClaimModal
          isOpen={isFlowIdModalOpen}
          onClose={() => setIsFlowIdModalOpen(false)}
          accountId={primaryAccount.id}
          onClaimed={(claimedFlowId) => {
            setFlowId(claimedFlowId);
            setIsFlowIdModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
