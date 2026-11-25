"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

function resolveDisplayName(
  accountName: string | null | undefined,
  flowId: string,
): string {
  const cleaned = accountName?.trim() ?? "";
  if (
    cleaned &&
    !["personal", "personal account", "default", "main account"].includes(
      cleaned.toLowerCase(),
    )
  ) {
    return cleaned;
  }
  return flowId.split("@")[0] || flowId;
}

export function FlowIdLandingClient({
  flowId,
  accountName,
  exists,
  hasActiveWallet,
  isSignedIn = false,
  needsOnboarding = false,
}: {
  flowId: string;
  accountName?: string | null;
  exists: boolean;
  hasActiveWallet: boolean;
  isSignedIn?: boolean;
  needsOnboarding?: boolean;
}) {
  const router = useRouter();
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);

  const flowPayHref = isSignedIn
    ? needsOnboarding
      ? `/onboarding?to=${encodeURIComponent(flowId)}`
      : `/app/send?to=${encodeURIComponent(flowId)}`
    : `/sign-in?to=${encodeURIComponent(flowId)}`;

  useEffect(() => {
    if (exists && hasActiveWallet) {
      persistPendingSendFlowId(flowId);
      router.prefetch(flowPayHref);
    }
  }, [exists, flowId, flowPayHref, hasActiveWallet, router]);

  const handlePayWithFlow = () => {
    persistPendingSendFlowId(flowId);
    startRouteTransition(flowPayHref);
    router.push(flowPayHref);
  };

  const handlePayExternalWallet = async () => {
    if (externalLoading) return;
    setExternalLoading(true);
    setExternalError(null);
    try {
      const res = await fetch(
        `/api/flow-id/${encodeURIComponent(flowId)}/external-checkout`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(
          data.detail ||
            data.error ||
            "External wallet checkout is unavailable right now.",
        );
      }
      startRouteTransition(data.checkoutUrl);
      router.push(data.checkoutUrl);
    } catch (error) {
      setExternalError(
        error instanceof Error
          ? error.message
          : "Could not open external wallet checkout.",
      );
      setExternalLoading(false);
    }
  };

  const displayName = resolveDisplayName(accountName, flowId);
  const firstName = displayName.split(/\s+/)[0] || displayName;

  return (
    <div className="min-h-screen bg-[#F5F4F0] dark:bg-[#090A0C] text-[#0B0C0E] dark:text-white flex flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 transition-colors">
      {/* Minimal Top Bar */}
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between">
        <Link
          href="/"
          aria-label="FLOW Home"
          className="inline-flex items-center"
        >
          <FlowLogo className="h-6 sm:h-7 w-auto" />
        </Link>
        <Link
          href={isSignedIn ? "/app" : "/sign-in"}
          className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
        >
          {isSignedIn ? "Open FLOW" : "Sign in"}
        </Link>
      </header>

      {/* Center Stage */}
      <main className="mx-auto w-full max-w-[780px] my-auto py-8 sm:py-10 flex flex-col items-center">
        {exists && hasActiveWallet ? (
          <div className="w-full flex flex-col items-center gap-5 sm:gap-6">
            {/* Horizontal Mobile Frame on Desktop, Refined Sleek Frame on Mobile */}
            <div className="relative w-full max-w-[400px] sm:max-w-[740px] rounded-[30px] sm:rounded-[44px] p-[7px] sm:p-[12px] bg-gradient-to-br from-[#34373F] via-[#141519] to-[#282B32] shadow-[0_28px_70px_-20px_rgba(0,0,0,0.34)] dark:shadow-[0_32px_80px_-18px_rgba(0,0,0,0.85)] ring-1 ring-white/15">
              {/* Landscape hardware buttons (desktop) */}
              <div
                aria-hidden="true"
                className="hidden sm:block absolute -top-[3px] left-[160px] w-11 h-[3px] rounded-t-xs bg-[#2D3038]"
              />
              <div
                aria-hidden="true"
                className="hidden sm:block absolute -top-[3px] left-[216px] w-11 h-[3px] rounded-t-xs bg-[#2D3038]"
              />
              <div
                aria-hidden="true"
                className="hidden sm:block absolute -bottom-[3px] left-[200px] w-16 h-[3px] rounded-b-xs bg-[#2D3038]"
              />

              {/* Device Screen */}
              <div className="relative overflow-hidden rounded-[24px] sm:rounded-[33px] bg-gradient-to-b from-[#1B1D24] to-[#0D0E12] px-4 pt-6 pb-6 sm:pl-14 sm:pr-11 sm:py-8">
                {/* Mobile top subtle speaker / camera dot */}
                <div
                  aria-hidden="true"
                  className="sm:hidden mx-auto mb-4 h-[5px] w-14 rounded-full bg-black/80 ring-1 ring-white/[0.06]"
                />

                {/* Desktop landscape Dynamic Island on left bezel */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex flex-col items-center justify-end pb-3 absolute left-4 top-1/2 -translate-y-1/2 w-[17px] h-[90px] rounded-full bg-black ring-1 ring-white/[0.07]"
                >
                  <span className="h-2 w-2 rounded-full bg-[#1C2742]" />
                </div>

                {/* FLOW Thermal Paper Receipt Inside Device */}
                <div className="mx-auto w-full max-w-[575px]">
                  {/* Crimson Printer Slot Bar */}
                  <div className="h-2.5 sm:h-3 w-full rounded-full bg-gradient-to-b from-[#FF2424] to-[#C41212] shadow-[0_4px_14px_rgba(255,26,26,0.34)]" />

                  {/* Paper Body */}
                  <div className="mx-2 sm:mx-3.5 -mt-1 relative drop-shadow-[0_14px_26px_rgba(0,0,0,0.35)]">
                    <div className="bg-[#ECEEF1] dark:bg-[#1B1C21] text-[#0B0C0E] dark:text-white px-5 pt-5 pb-6 sm:px-7 sm:pt-5 sm:pb-6 shadow-[inset_0_10px_14px_-10px_rgba(0,0,0,0.24)]">
                      {/* Receipt Top Brand Row (no pill badge) */}
                      <div className="flex items-center justify-between pb-4 border-b border-dashed border-neutral-300 dark:border-white/[0.12]">
                        <FlowLogo className="h-[18px] w-auto" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-400">
                          Verified @flow
                        </span>
                      </div>

                      {/* Receipt Main Content: Stacked on mobile, clean 2-col inside horizontal phone on desktop */}
                      <div className="pt-5 sm:pt-5 grid grid-cols-1 sm:grid-cols-[1fr_1.15fr] gap-5 sm:gap-6 items-center">
                        {/* Recipient Name & Handle (no profile avatar) */}
                        <div className="text-center sm:text-left pb-5 sm:pb-0 sm:pr-5 border-b sm:border-b-0 sm:border-r border-dashed border-neutral-300 dark:border-white/[0.12] space-y-1.5">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-neutral-500 dark:text-neutral-400">
                            Pay to
                          </p>
                          <h1 className="text-2xl sm:text-[26px] font-bold tracking-[-0.025em] leading-tight text-neutral-950 dark:text-white break-words">
                            {displayName}
                          </h1>
                          <p className="font-mono text-xs sm:text-[12.5px] font-medium text-neutral-600 dark:text-neutral-400 break-all">
                            {flowId}
                          </p>
                        </div>

                        {/* Pay Actions Inside Receipt */}
                        <div className="flex flex-col items-center gap-3">
                          <button
                            type="button"
                            onClick={handlePayWithFlow}
                            className="w-full h-12 rounded-full bg-[#0B0C0E] dark:bg-white text-white dark:text-[#0B0C0E] px-5 text-[13.5px] sm:text-sm font-semibold tracking-[-0.01em] inline-flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer shadow-sm"
                          >
                            <span>Pay {firstName} with FLOW</span>
                          </button>

                          <div className="w-full flex items-center gap-3 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                            <span className="h-px flex-1 bg-neutral-300 dark:bg-white/[0.12]" />
                            <span>or</span>
                            <span className="h-px flex-1 bg-neutral-300 dark:bg-white/[0.12]" />
                          </div>

                          <div className="text-center space-y-1">
                            <button
                              type="button"
                              disabled={externalLoading}
                              onClick={() => void handlePayExternalWallet()}
                              className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-neutral-900 dark:text-white hover:text-[#FF1A1A] dark:hover:text-[#FF5C5C] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <span>
                                {externalLoading
                                  ? "Opening external checkout…"
                                  : "Pay with external wallet"}
                              </span>
                              {!externalLoading && (
                                <span
                                  aria-hidden="true"
                                  className="text-[#FF1A1A] font-bold"
                                >
                                  →
                                </span>
                              )}
                            </button>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              Send any token · Settles on NEAR
                            </p>
                          </div>

                          {externalError && (
                            <p className="text-xs text-red-600 dark:text-red-400 text-center">
                              {externalError}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Scalloped Zigzag Torn Paper Bottom Edge */}
                    <svg
                      viewBox="0 0 360 18"
                      preserveAspectRatio="none"
                      className="w-full h-[14px] block text-[#ECEEF1] dark:text-[#1B1C21]"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M0,0 L360,0 L360,5 Q348,18 336,5 Q324,18 312,5 Q300,18 288,5 Q276,18 264,5 Q252,18 240,5 Q228,18 216,5 Q204,18 192,5 Q180,18 168,5 Q156,18 144,5 Q132,18 120,5 Q108,18 96,5 Q84,18 72,5 Q60,18 48,5 Q36,18 24,5 Q12,18 0,5 Z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Desktop Landscape Home Indicator Bar */}
                <div
                  aria-hidden="true"
                  className="hidden sm:block mx-auto mt-5 h-1 w-32 rounded-full bg-white/20"
                />
              </div>
            </div>

            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 max-w-md leading-relaxed px-2">
              Non-custodial payment straight to {displayName}&apos;s FLOW
              wallet. Powered by NEAR Intents.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-7 sm:p-8 shadow-sm space-y-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
              FLOW Direct Link
            </p>
            <h1 className="font-serif text-3xl font-normal tracking-tight text-[#0B0B0B] dark:text-white">
              {exists ? `${flowId} isn’t ready yet` : `${flowId} is available`}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {exists
                ? `${flowId} has been claimed, but their multi-chain wallet is still finishing setup. Please try again in a moment.`
                : `No one has claimed ${flowId} yet. Create a free FLOW account to claim this handle and receive crypto with your own direct link.`}
            </p>
            <Link
              href={exists ? "/" : "/sign-in"}
              className="flow-liquid-btn-primary inline-flex w-full items-center justify-center py-4 rounded-full text-sm font-bold"
            >
              {exists ? "Go to FLOW" : `Claim ${flowId}`}
            </Link>
          </div>
        )}
      </main>

      {/* Clean Footer */}
      <footer className="mx-auto w-full max-w-5xl flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-500">
        <span>FLOW · Multi-chain payments</span>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
