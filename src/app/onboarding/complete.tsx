"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
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

const stepProgressPercent: Record<
  "welcome" | "details" | "security" | "confirm" | "status" | "ready" | "dashboard",
  number
> = {
  welcome: 14,
  details: 28,
  security: 42,
  confirm: 58,
  status: 72,
  ready: 92,
  dashboard: 100,
};

const statusCopy: Record<WalletStatus, { title: string; detail: string }> = {
  active: { title: "Wallet verified", detail: "Your wallet is ready." },
  setup_pending: {
    title: "Setup is waiting to start",
    detail:
      "Your request is saved. Wallet registration has not been confirmed yet.",
  },
  provisioning: {
    title: "Wallet setup is in progress",
    detail:
      "FLOW is waiting for the custody provider to derive and verify your network addresses.",
  },
  setup_failed: {
    title: "Wallet setup needs attention",
    detail:
      "The existing setup did not complete. Your account and any existing wallet remain unchanged.",
  },
  frozen: {
    title: "Wallet access is restricted",
    detail: "Contact FLOW support before taking further action.",
  },
  recovery_pending: {
    title: "Wallet recovery is in progress",
    detail:
      "FLOW is checking the existing wallet. Do not start another wallet setup.",
  },
};

export function CompleteOnboarding({
  initialStep,
  userEmail,
  userName,
  initialAccount,
}: {
  initialStep?: string;
  userEmail: string;
  userName: string;
  initialAccount?: OnboardingAccount | null;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<OnboardingAccount | null>(
    initialAccount ?? null,
  );
  const [step, setStep] = useState<
    | "welcome"
    | "details"
    | "security"
    | "confirm"
    | "status"
    | "ready"
    | "dashboard"
  >(initialStep === "status" || initialAccount ? "status" : "welcome");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const accountId = account?.id;
    const walletStatus = account?.walletStatus;
    if (
      step !== "status" ||
      !accountId ||
      (walletStatus !== "setup_pending" && walletStatus !== "provisioning")
    )
      return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await send<{
          walletStatus: WalletStatus;
          walletReady: boolean;
          addresses: NonNullable<OnboardingAccount["addresses"]>;
        }>(`/api/accounts/${accountId}/wallet/provision`, {}, "GET");
        if (active) {
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
          if (response.walletReady) setStep("ready");
        }
      } catch {
        // A polling error is transient. The page keeps showing the last persisted status.
      }
    };
    const kickoff = window.setTimeout(refresh, 600);
    const timer = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [account?.id, account?.walletStatus, step]);

  async function beginProvisioning() {
    setBusy(true);
    setMessage("");
    try {
      const response = await send<{ account: OnboardingAccount }>(
        "/api/onboarding/complete",
      );
      setAccount(response.account);
      setStep("status");
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
    }
  }

  const status = account
    ? account.walletStatus === "active" && !account.provisioningComplete
      ? {
          title: "Wallet verification is incomplete",
          detail:
            "FLOW has not confirmed all required custody and policy checks. Dashboard access remains unavailable until verification completes.",
        }
      : statusCopy[account.walletStatus]
    : null;

  const progressPercent =
    step === "status"
      ? account?.walletStatus === "provisioning"
        ? 82
        : account?.walletStatus === "active" && account.provisioningComplete
          ? 92
          : 72
      : stepProgressPercent[step];
  const isActivelyCreating =
    step === "status" &&
    (account?.walletStatus === "setup_pending" ||
      account?.walletStatus === "provisioning");

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
            className="flow-liquid-btn rounded-full px-4 py-2 text-sm font-medium text-[#0B0B0B] dark:text-white disabled:opacity-50 cursor-pointer"
          >
            Switch account
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void leaveToSignIn("signed-out")}
            className="flow-liquid-btn rounded-full px-4 py-2 text-sm font-medium text-[#555] dark:text-neutral-300 disabled:opacity-50 cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto mt-10 grid max-w-6xl gap-8 lg:mt-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E92935]">
            FLOW WALLET SETUP
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl dark:text-white">
            {step === "status"
              ? status?.title
              : step === "welcome"
                ? "Welcome to FLOW"
                : step === "details"
                  ? "Your Personal account"
                  : step === "security"
                    ? "Your wallet, carefully set up"
                    : step === "confirm"
                      ? "Confirm wallet setup"
                      : step === "ready"
                        ? "Your FLOW wallet is ready"
                        : step === "dashboard"
                          ? "Enter your FLOW dashboard"
                          : "Wallet setup status"}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#5A5A5A] dark:text-neutral-400">
            {step === "status"
              ? status?.detail
              : step === "details"
                ? "These details come from your authenticated identity and will be used for your Personal FLOW account."
                : "Set up your Personal FLOW account and verify its wallet before entering the dashboard."}
          </p>
          <div
            role="progressbar"
            aria-label="Wallet onboarding progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className="mt-8 h-2.5 w-full overflow-hidden rounded-full bg-[#ECE7DF] dark:bg-white/[0.08]"
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r from-[#FF1A1A] via-[#FF4D4D] to-[#FF1A1A] transition-all duration-700 ease-out ${
                isActivelyCreating ? "animate-pulse" : ""
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E8E4DC] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-[0_12px_36px_rgba(20,15,10,0.05)] sm:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-[#F0EDE6] dark:border-white/[0.08] pb-6">
            <div>
              <p className="text-sm font-semibold dark:text-white">
                {userName.trim() || "Your FLOW profile"}
              </p>
              <p className="mt-1 text-sm text-[#777] dark:text-neutral-400">
                {userEmail}
              </p>
            </div>
          </div>

          {step === "welcome" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl dark:text-white">
                One account for your FLOW wallet
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                FLOW will create or resume one Personal account for this
                signed-in identity. You can return here later without creating
                another wallet.
              </p>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="flow-liquid-btn-primary mt-8 h-12 w-full rounded-full font-semibold cursor-pointer"
              >
                Continue
              </button>
            </div>
          )}

          {step === "details" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl dark:text-white">
                Signed-in identity
              </h2>
              <dl className="mt-5 space-y-3 rounded-2xl bg-[#F7F5F1] dark:bg-[#1A1A1A] p-5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#777] dark:text-neutral-400">Name</dt>
                  <dd className="font-medium dark:text-white">
                    {userName.trim() || "Not provided"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#777] dark:text-neutral-400">Email</dt>
                  <dd className="break-all text-right font-medium dark:text-white">
                    {userEmail}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#777] dark:text-neutral-400">
                    Account type
                  </dt>
                  <dd className="font-medium dark:text-white">Personal</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm leading-6 text-[#5A5A5A] dark:text-neutral-400">
                FLOW keeps this account connected to the identity you used to
                sign in. Returning to FLOW restores the same account.
              </p>
              <button
                type="button"
                onClick={() => setStep("security")}
                className="flow-liquid-btn-primary mt-8 h-12 w-full rounded-full font-semibold cursor-pointer"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="mt-3 w-full py-2 text-sm text-[#666] dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>
          )}

          {step === "security" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl dark:text-white">
                Provider-managed wallet setup
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                FLOW requests wallet registration through its custody provider.
                The app will show addresses only after the provider returns them
                and FLOW verifies their association.
              </p>
              <p className="mt-4 rounded-2xl bg-[#FFF8E8] dark:bg-amber-950/30 p-4 text-sm leading-6 text-[#76521A] dark:text-amber-200 border border-transparent dark:border-amber-800/40">
                Wallet recovery depends on the provider configuration. Do not
                assume a recovery method is available until FLOW confirms it for
                your account.
              </p>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="flow-liquid-btn-primary mt-8 h-12 w-full rounded-full font-semibold cursor-pointer"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="mt-3 w-full py-2 text-sm text-[#666] dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl dark:text-white">
                Start wallet setup?
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                This saves a Personal account and an idempotent provisioning
                request. It does not guarantee a wallet is active; setup remains
                pending until the custody worker completes verification.
              </p>
              <label className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E8E4DC] dark:border-white/[0.1] bg-transparent dark:bg-[#1A1A1A] p-4 text-sm leading-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 accent-[#E92935]"
                />
                <span>
                  I want FLOW to create or resume one wallet setup for this
                  Personal account.
                </span>
              </label>
              <button
                type="button"
                disabled={!confirmed || busy}
                onClick={beginProvisioning}
                className="flow-liquid-btn-primary mt-6 h-12 w-full rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
              >
                {busy ? "Saving request…" : "Confirm and continue"}
              </button>
              <button
                type="button"
                onClick={() => setStep("security")}
                className="mt-3 w-full py-2 text-sm text-[#666] dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>
          )}

          {step === "status" && (
            <div className="pt-6">
              {status ? (
                <>
                  <h2 className="font-serif text-2xl dark:text-white">
                    {status.title}
                  </h2>
                  <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                    {status.detail}
                  </p>
                  {account?.walletStatus === "setup_failed" && (
                    <button
                      type="button"
                      onClick={() =>
                        setMessage(
                          "The existing provisioning job requires support review. No replacement wallet was requested.",
                        )
                      }
                      className="flow-liquid-btn mt-5 h-12 w-full rounded-full font-semibold cursor-pointer"
                    >
                      Review recovery options
                    </button>
                  )}
                  {(account?.walletStatus === "setup_pending" ||
                    account?.walletStatus === "provisioning") && (
                    <>
                      <div
                        aria-hidden="true"
                        className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[#ECE7DF] dark:bg-white/[0.08]"
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#FF1A1A] via-[#FF4D4D] to-[#FF1A1A] animate-pulse transition-all duration-700 ease-out"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      {account.walletStatus === "setup_pending" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={beginProvisioning}
                          className="flow-liquid-btn-primary mt-6 h-12 w-full rounded-full font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {busy ? "Resuming…" : "Resume wallet setup"}
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-serif text-2xl dark:text-white">
                    Continue your wallet setup
                  </h2>
                  <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                    Your Personal account and wallet state will be reused.
                    Review the custody information, then confirm to start or
                    resume setup.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep("security")}
                    className="flow-liquid-btn-primary mt-6 h-12 w-full rounded-full font-semibold cursor-pointer"
                  >
                    Review setup
                  </button>
                </>
              )}
            </div>
          )}
          {step === "ready" &&
            account?.provisioningComplete &&
            account.addresses && (
              <div className="pt-6">
                <h2 className="font-serif text-2xl dark:text-white">
                  Four verified networks
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#5A5A5A] dark:text-neutral-400">
                  These public addresses were returned by OutLayer and checked
                  by FLOW.
                </p>
                <ul className="mt-5 space-y-3">
                  {account.addresses.map((address) => (
                    <li
                      key={address.network}
                      className="rounded-2xl border border-[#E8E4DC] dark:border-white/[0.08] bg-transparent dark:bg-[#1A1A1A] p-4"
                    >
                      <div className="text-sm font-semibold capitalize dark:text-white">
                        {address.network}{" "}
                        <span className="font-normal text-[#777] dark:text-neutral-400">
                          · {address.chainId}
                        </span>
                      </div>
                      <code className="mt-2 block break-all text-xs text-[#444] dark:text-neutral-300">
                        {address.address}
                      </code>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setStep("dashboard")}
                  className="flow-liquid-btn-primary mt-6 h-12 w-full rounded-full font-semibold cursor-pointer"
                >
                  Continue
                </button>
              </div>
            )}
          {step === "dashboard" && account?.provisioningComplete && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl dark:text-white">
                Wallet verified and ready
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A] dark:text-neutral-400">
                Your account and network addresses are verified. Financial
                execution remains disabled behind its separate safety gates.
              </p>
              <button
                type="button"
                onClick={() => router.replace(`/accounts/${account.id}`)}
                className="flow-liquid-btn-primary mt-8 h-12 w-full rounded-full font-semibold cursor-pointer"
              >
                Enter dashboard
              </button>
            </div>
          )}
          <div className="mt-5">
            <Feedback text={message} />
          </div>
        </section>
      </main>
    </div>
  );
}
