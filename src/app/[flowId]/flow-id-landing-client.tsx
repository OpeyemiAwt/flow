"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FlowLogo } from "../../components/flow-logo.tsx";
import { startRouteTransition } from "../../components/route-skeleton-transition.tsx";
import { PENDING_SEND_FLOW_ID_COOKIE } from "../../domain/flow-id.ts";

export function persistPendingSendFlowId(flowId: string) {
  if (typeof window === "undefined") return;
  try {
    const encoded = encodeURIComponent(flowId);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${PENDING_SEND_FLOW_ID_COOKIE}=${encoded}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
  } catch {}
  try {
    window.localStorage.setItem(PENDING_SEND_FLOW_ID_COOKIE, flowId);
  } catch {}
}

export function clearPendingSendFlowId() {
  if (typeof window === "undefined") return;
  try {
    document.cookie = `${PENDING_SEND_FLOW_ID_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {}
  try {
    window.localStorage.removeItem(PENDING_SEND_FLOW_ID_COOKIE);
  } catch {}
}

export function readPendingSendFlowIdFromClient(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const match = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${PENDING_SEND_FLOW_ID_COOKIE}=`));
    if (match) {
      const value = decodeURIComponent(
        match.slice(PENDING_SEND_FLOW_ID_COOKIE.length + 1),
      ).trim();
      if (value) return value;
    }
  } catch {}
  try {
    const stored = window.localStorage.getItem(PENDING_SEND_FLOW_ID_COOKIE);
    if (stored?.trim()) return stored.trim();
  } catch {}
  return null;
}

export function FlowIdLandingClient({
  flowId,
  accountName,
  exists,
  hasActiveWallet,
}: {
  flowId: string;
  accountName?: string | null;
  exists: boolean;
  hasActiveWallet: boolean;
}) {
  const router = useRouter();
  const signInHref = `/sign-in?to=${encodeURIComponent(flowId)}`;

  useEffect(() => {
    if (exists && hasActiveWallet) {
      persistPendingSendFlowId(flowId);
      router.prefetch(signInHref);
    }
  }, [exists, flowId, hasActiveWallet, router, signInHref]);

  const handleContinue = () => {
    persistPendingSendFlowId(flowId);
    startRouteTransition(signInHref);
    router.push(signInHref);
  };

  const initial = (accountName || flowId).trim().charAt(0).toUpperCase() || "F";

  return (
    <div className="min-h-screen bg-[#F8F6F3] dark:bg-[#0B0B0B] text-[#0B0B0B] dark:text-white flex flex-col justify-between px-5 py-8 sm:px-8 transition-colors">
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between">
        <Link href="/" aria-label="FLOW Home" className="inline-flex items-center">
          <FlowLogo className="h-7 w-auto" />
        </Link>
        <Link
          href="/docs#send"
          className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
        >
          How @flow ID works
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md my-10">
        {exists && hasActiveWallet ? (
          <div className="rounded-[32px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-7 sm:p-8 shadow-sm space-y-6 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Verified FLOW ID</span>
            </div>

            <div className="flex flex-col items-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-[#0B0B0B] dark:bg-white text-white dark:text-[#0B0B0B] flex items-center justify-center font-serif text-2xl shadow-sm">
                {initial}
              </div>
              <div className="space-y-1">
                <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#0B0B0B] dark:text-white">
                  Pay {flowId}
                </h1>
                {accountName &&
                  accountName.toLowerCase() !== "personal" &&
                  accountName.toLowerCase() !== flowId.toLowerCase() && (
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {accountName}
                    </p>
                  )}
              </div>
            </div>

            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Sign in or create your FLOW account to send directly to{" "}
              <span className="font-mono font-semibold text-[#0B0B0B] dark:text-white">
                {flowId}
              </span>{" "}
              across NEAR, Solana, Base, or Ethereum.
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleContinue}
                className="flow-liquid-btn-primary w-full py-4 rounded-full text-sm font-bold cursor-pointer"
              >
                Continue to Send
              </button>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                After signing in or creating your account, you&apos;ll land
                straight on Send with{" "}
                <span className="font-mono font-medium">{flowId}</span>{" "}
                pre-filled.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[32px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-7 sm:p-8 shadow-sm space-y-5 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-white/[0.08] px-3 py-1 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              <span>FLOW Direct Link</span>
            </div>
            <h1 className="font-serif text-3xl font-normal tracking-tight text-[#0B0B0B] dark:text-white">
              {exists ? `${flowId} isn't active yet` : `${flowId} isn't claimed yet`}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {exists
                ? `${flowId} has not finished activating their FLOW wallet yet. Ask them to complete onboarding and try again.`
                : `No FLOW account is registered for ${flowId} yet. Double-check the spelling or sign in to claim it for yourself.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <Link
                href="/sign-in"
                className="flow-liquid-btn-primary flex-1 py-3.5 rounded-full text-xs font-bold text-center"
              >
                {exists ? "Open FLOW" : "Claim a @flow ID"}
              </Link>
              <Link
                href="/"
                className="flow-liquid-btn flex-1 py-3.5 rounded-full text-xs font-bold text-center text-[#0B0B0B] dark:text-white"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-5xl text-center text-[11px] text-neutral-500 dark:text-neutral-400">
        FLOW · Non-custodial multi-chain payments across NEAR, Solana, Base &amp;
        Ethereum
      </footer>
    </div>
  );
}
