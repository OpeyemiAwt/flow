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
    "welcome" | "security" | "confirm" | "status"
  >(initialStep === "status" || initialAccount ? "status" : "welcome");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (account?.provisioningComplete)
      router.replace(`/accounts/${account.id}`);
  }, [account, router]);

  useEffect(() => {
    if (
      step !== "status" ||
      !account ||
      (account.walletStatus !== "setup_pending" &&
        account.walletStatus !== "provisioning")
    )
      return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await send<{ accounts: OnboardingAccount[] }>(
          "/api/me",
          {},
          "GET",
        );
        const latest = response.accounts.find((item) => item.id === account.id);
        if (active && latest) setAccount(latest);
      } catch {
        // A polling error is transient. The page keeps showing the last persisted status.
      }
    };
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [account, step]);

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

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-5 py-8 text-[#0B0B0B] sm:px-8 sm:py-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" aria-label="FLOW Home">
          <FlowLogo className="h-8 w-auto" />
        </Link>
        <span className="rounded-full border border-[#E8E4DC] bg-white px-4 py-2 text-sm text-[#555]">
          Personal account
        </span>
      </header>

      <main className="mx-auto mt-10 grid max-w-6xl gap-8 lg:mt-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <section className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E92935]">
            FLOW WALLET SETUP
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">
            {step === "status"
              ? status?.title
              : step === "welcome"
                ? "Welcome to FLOW"
                : step === "security"
                  ? "Your wallet, carefully set up"
                  : "Confirm wallet setup"}
          </h1>
          <p className="mt-4 text-base leading-7 text-[#5A5A5A]">
            {step === "status"
              ? status?.detail
              : "Set up your Personal FLOW account and verify its wallet before entering the dashboard."}
          </p>
          <div className="mt-8 flex flex-wrap gap-2" aria-label="Setup steps">
            {["Welcome", "Security", "Confirm", "Wallet status"].map(
              (label, index) => {
                const current = [
                  "welcome",
                  "security",
                  "confirm",
                  "status",
                ].indexOf(step);
                const passed = index < current;
                return (
                  <span
                    key={label}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === current ? "bg-[#0B0B0B] text-white" : passed ? "bg-[#E9F8F1] text-[#137A50]" : "border border-[#E3DED7] bg-white text-[#777]"}`}
                  >
                    {label}
                  </span>
                );
              },
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-[#E8E4DC] bg-white p-6 shadow-[0_12px_36px_rgba(20,15,10,0.05)] sm:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-[#F0EDE6] pb-6">
            <div>
              <p className="text-sm font-semibold">
                {userName.trim() || "Your FLOW profile"}
              </p>
              <p className="mt-1 text-sm text-[#777]">{userEmail}</p>
            </div>
            {account && (
              <span className="rounded-full bg-[#F7F5F1] px-3 py-1 text-xs text-[#555]">
                {account.walletStatus.replaceAll("_", " ")}
              </span>
            )}
          </div>

          {step === "welcome" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl">
                One account for your FLOW wallet
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A]">
                FLOW will create or resume one Personal account for this
                signed-in identity. You can return here later without creating
                another wallet.
              </p>
              <button
                type="button"
                onClick={() => setStep("security")}
                className="mt-8 h-12 w-full rounded-full bg-[#0B0B0B] font-semibold text-white"
              >
                Continue
              </button>
            </div>
          )}

          {step === "security" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl">
                Provider-managed wallet setup
              </h2>
              <p className="mt-3 leading-6 text-[#5A5A5A]">
                FLOW requests wallet registration through its custody provider.
                The app will show addresses only after the provider returns them
                and FLOW verifies their association.
              </p>
              <p className="mt-4 rounded-2xl bg-[#FFF8E8] p-4 text-sm leading-6 text-[#76521A]">
                Wallet recovery depends on the provider configuration. Do not
                assume a recovery method is available until FLOW confirms it for
                your account.
              </p>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="mt-8 h-12 w-full rounded-full bg-[#0B0B0B] font-semibold text-white"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="mt-3 w-full py-2 text-sm text-[#666]"
              >
                Back
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="pt-6">
              <h2 className="font-serif text-2xl">Start wallet setup?</h2>
              <p className="mt-3 leading-6 text-[#5A5A5A]">
                This saves a Personal account and an idempotent provisioning
                request. It does not guarantee a wallet is active; setup remains
                pending until the custody worker completes verification.
              </p>
              <label className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E8E4DC] p-4 text-sm leading-6">
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
                className="mt-6 h-12 w-full rounded-full bg-[#0B0B0B] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#9B9B9B]"
              >
                {busy ? "Saving request…" : "Confirm and continue"}
              </button>
              <button
                type="button"
                onClick={() => setStep("security")}
                className="mt-3 w-full py-2 text-sm text-[#666]"
              >
                Back
              </button>
            </div>
          )}

          {step === "status" && (
            <div className="pt-6">
              {status ? (
                <>
                  <h2 className="font-serif text-2xl">{status.title}</h2>
                  <p className="mt-3 leading-6 text-[#5A5A5A]">
                    {status.detail}
                  </p>
                  <p className="mt-5 rounded-2xl bg-[#F7F5F1] p-4 text-sm leading-6 text-[#555]">
                    This status comes from FLOW&apos;s saved account record. No
                    wallet address or balance is shown until it has been
                    returned and verified.
                  </p>
                  {account?.walletStatus === "setup_failed" && (
                    <button
                      type="button"
                      onClick={() =>
                        setMessage(
                          "The existing provisioning job requires support review. No replacement wallet was requested.",
                        )
                      }
                      className="mt-5 h-12 w-full rounded-full border border-[#E8E4DC] font-semibold"
                    >
                      Review recovery options
                    </button>
                  )}
                  {(account?.walletStatus === "setup_pending" ||
                    account?.walletStatus === "provisioning") && (
                    <>
                      {account.walletStatus === "setup_pending" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={beginProvisioning}
                          className="mt-5 h-12 w-full rounded-full bg-[#0B0B0B] font-semibold text-white disabled:bg-[#999]"
                        >
                          {busy ? "Resuming…" : "Resume wallet setup"}
                        </button>
                      )}
                      <p className="mt-3 text-center text-xs text-[#777]">
                        Status refreshes automatically while this page is open.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-serif text-2xl">
                    Continue your wallet setup
                  </h2>
                  <p className="mt-3 leading-6 text-[#5A5A5A]">
                    Your Personal account and wallet state will be reused.
                    Review the custody information, then confirm to start or
                    resume setup.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep("security")}
                    className="mt-6 h-12 w-full rounded-full bg-[#0B0B0B] font-semibold text-white"
                  >
                    Review setup
                  </button>
                </>
              )}
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
