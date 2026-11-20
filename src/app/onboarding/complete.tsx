"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FlowIdPickerForm } from "../../components/flow-id-claim-modal.tsx";
import { FlowLogo } from "../../components/flow-logo.tsx";
import { describe, Feedback, send } from "../controls.tsx";

type WalletStatus =
  | "active"
  | "setup_pending"
  | "provisioning"
  | "setup_failed"
  | "frozen"
  | "recovery_pending";

type OnboardingAccount = {
  id: string;
  walletStatus: WalletStatus;
  provisioningComplete: boolean;
  addresses?: { network: string; chainId: string; address: string }[];
};

const statusCopy: Record<WalletStatus, { title: string; detail: string }> = {
  active: { title: "Wallet ready", detail: "Opening your dashboard..." },
  setup_pending: {
    title: "Setting up your wallet",
    detail: "Preparing your account and multi-network addresses.",
  },
  provisioning: {
    title: "Setting up your wallet",
    detail: "Creating and verifying your addresses across supported networks.",
  },
  setup_failed: {
    title: "Wallet setup needs attention",
    detail:
      "Your wallet setup did not finish automatically. Try again or contact support.",
  },
  frozen: {
    title: "Account access is restricted",
    detail: "Contact FLOW support before taking further action.",
  },
  recovery_pending: {
    title: "Account recovery in progress",
    detail: "FLOW is checking your existing wallet recovery.",
  },
};

export function CompleteOnboarding({
  userEmail,
  userName,
  initialAccount,
  initialFlowId,
}: {
  initialStep?: string;
  userEmail: string;
  userName: string;
  initialAccount?: OnboardingAccount | null;
  initialFlowId?: string | null;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<OnboardingAccount | null>(
    initialAccount ?? null,
  );
  const [flowId, setFlowId] = useState<string | null>(initialFlowId ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState<number>(() => {
    if (initialAccount?.provisioningComplete) return 100;
    if (initialAccount?.walletStatus === "provisioning") return 72;
    if (initialAccount?.walletStatus === "setup_pending") return 45;
    return 18;
  });
  const autoStartedRef = useRef(false);
  const redirectedRef = useRef(false);

  const beginProvisioning = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setProgressPercent((prev) => Math.max(prev, 28));
    try {
      const response = await send<{ account: OnboardingAccount }>(
        "/api/onboarding/complete",
      );
      setAccount(response.account);
      setProgressPercent(
        response.account.provisioningComplete
          ? 100
          : response.account.walletStatus === "provisioning"
            ? 74
            : 48,
      );
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
    }
  }, []);

  // Automatically start/resume wallet creation without requiring manual clicks
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!account || account.walletStatus === "setup_pending") {
      autoStartedRef.current = true;
      let active = true;
      send<{ account: OnboardingAccount }>("/api/onboarding/complete")
        .then((response) => {
          if (!active) return;
          setAccount(response.account);
          setProgressPercent(
            response.account.provisioningComplete
              ? 100
              : response.account.walletStatus === "provisioning"
                ? 74
                : 48,
          );
        })
        .catch((error) => {
          if (!active) return;
          setMessage(describe(error));
        });
      return () => {
        active = false;
      };
    }
  }, [account]);

  // Redirect directly to dashboard once wallet is active AND Flow ID is claimed
  useEffect(() => {
    if (!account?.id) return;
    if (
      account.walletStatus === "active" &&
      account.provisioningComplete &&
      flowId &&
      !redirectedRef.current
    ) {
      redirectedRef.current = true;
      const timer = window.setTimeout(() => {
        router.replace("/app");
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [
    account?.id,
    account?.provisioningComplete,
    account?.walletStatus,
    flowId,
    router,
  ]);

  // Poll wallet readiness while setting up
  useEffect(() => {
    const accountId = account?.id;
    const walletStatus = account?.walletStatus;
    if (
      !accountId ||
      (walletStatus !== "setup_pending" && walletStatus !== "provisioning")
    ) {
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const response = await send<{
          walletStatus: WalletStatus;
          walletReady: boolean;
          addresses: NonNullable<OnboardingAccount["addresses"]>;
        }>(`/api/accounts/${accountId}/wallet/provision`, {}, "GET");
        if (!active) return;
        setAccount((previous) =>
          previous
            ? {
                ...previous,
                walletStatus: response.walletStatus,
                provisioningComplete: response.walletReady,
                addresses: response.addresses,
              }
            : previous,
        );
        setProgressPercent((prev) => {
          if (response.walletReady) return 100;
          if (response.walletStatus === "provisioning") {
            return Math.min(92, Math.max(prev + 4, 72));
          }
          return Math.min(68, Math.max(prev + 3, 45));
        });
      } catch {
        // Transient polling error; keep existing persisted state
      }
    };

    const kickoff = window.setTimeout(refresh, 400);
    const timer = window.setInterval(refresh, 1200);
    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [account?.id, account?.walletStatus]);

  const resolvedStatus: WalletStatus = account?.walletStatus ?? "setup_pending";
  const isBlockedState =
    resolvedStatus === "setup_failed" ||
    resolvedStatus === "frozen" ||
    resolvedStatus === "recovery_pending";
  const isSettingUp =
    !isBlockedState &&
    !(account?.walletStatus === "active" && account.provisioningComplete);
  const status =
    account?.walletStatus === "active" && !account.provisioningComplete
      ? {
          title: "Setting up your wallet",
          detail: "Finalizing security verification.",
        }
      : statusCopy[resolvedStatus];
  const displayUserName = userName.trim() || userEmail;

  async function leaveToSignIn(mode: "signed-out" | "switch-account") {
    setBusy(true);
    setMessage("");
    try {
      await send("/api/auth/sign-out");
      window.location.replace(`/sign-in?notice=${mode}`);
    } catch {
      setMessage("Could not sign out. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] px-5 py-8 text-[#0B0B0B] dark:text-neutral-100 sm:px-8 sm:py-12 transition-colors duration-200">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link href="/" aria-label="FLOW Home">
          <FlowLogo className="h-8 w-auto" />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#555] dark:text-neutral-400 px-2">
            {userEmail ? `Signed in: ${userEmail}` : "Personal account"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void leaveToSignIn("switch-account")}
            className="flow-liquid-btn flow-press rounded-full px-4 py-2 text-sm font-medium text-[#0B0B0B] dark:text-white disabled:opacity-50 cursor-pointer"
          >
            Switch account
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void leaveToSignIn("signed-out")}
            className="flow-liquid-btn flow-press rounded-full px-4 py-2 text-sm font-medium text-[#555] dark:text-neutral-300 disabled:opacity-50 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto mt-14 max-w-xl">
        <section className="flow-anim-fade-up rounded-[28px] border border-[#E8E4DC] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-7 shadow-[0_12px_36px_rgba(20,15,10,0.05)] sm:p-10">
          <div className="border-b border-[#F0EDE6] dark:border-white/[0.08] pb-5">
            <p className="text-base font-semibold text-neutral-950 dark:text-white">
              {displayUserName}
            </p>
            {userEmail && displayUserName !== userEmail && (
              <p className="mt-0.5 text-sm text-[#777] dark:text-neutral-400">
                {userEmail}
              </p>
            )}
          </div>

          <div className="pt-6">
            {account?.walletStatus === "active" &&
            account.provisioningComplete &&
            !flowId ? (
              <div className="space-y-5">
                <div>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Step 2 of 2 · Wallet Ready
                  </span>
                  <h1 className="mt-2 font-serif text-3xl leading-tight dark:text-white">
                    Claim your unique @flow ID
                  </h1>
                  <p className="mt-2 text-sm text-[#5A5A5A] dark:text-neutral-400">
                    Pick your permanent handle so anyone on Flow can send assets
                    directly to you.
                  </p>
                </div>

                <FlowIdPickerForm
                  accountId={account.id}
                  onClaimed={(claimedId) => {
                    setFlowId(claimedId);
                  }}
                  submitLabel="Claim & Open Wallet"
                />
              </div>
            ) : (
              <>
                <h1 className="font-serif text-3xl leading-tight dark:text-white">
                  {status.title}
                </h1>
                {isBlockedState ? (
                  <p className="mt-3 text-sm leading-6 text-[#5A5A5A] dark:text-neutral-400">
                    {status.detail}
                  </p>
                ) : null}

                {!isBlockedState && (
                  <div
                    role="progressbar"
                    aria-label="Wallet setup progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                    className="mt-7 h-2.5 w-full overflow-hidden rounded-full bg-[#ECE7DF] dark:bg-white/[0.08]"
                  >
                    <div
                      className={`h-full rounded-full bg-gradient-to-r from-[#FF1A1A] via-[#FF4D4D] to-[#FF1A1A] transition-all duration-700 ease-out ${
                        isSettingUp ? "animate-pulse" : ""
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}

                {(message || resolvedStatus === "setup_failed") && (
                  <div className="mt-6 space-y-3">
                    <Feedback text={message} />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void beginProvisioning()}
                      className="flow-liquid-btn-primary flow-press h-11 w-full rounded-full font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {busy ? "Retrying…" : "Try again"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
