"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { IconShield } from "../components/icons.tsx";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "Sign in again to continue.",
  INVALID_PROOF:
    "The code is incorrect or expired. Try again or request a new code.",
  MAILBOX_UNAVAILABLE:
    "This mailbox cannot be used for security changes. Contact support.",
  LAST_LOGIN_METHOD: "Keep at least one usable sign-in method.",
  FRESH_PROOF_REQUIRED: "Request a new security code and try again.",
  INVITE_UNAVAILABLE:
    "This invitation is unavailable for your signed-in email.",
  ALREADY_MEMBER: "This email already belongs to the team.",
  FORBIDDEN: "Your role does not allow this change.",
  NOT_FOUND: "This account or record is unavailable.",
  INVALID_INPUT: "Check the information you entered and try again.",
  TRY_LATER: "Too many requests. Try again later.",
};

export async function send<T>(
  path: string,
  data: object = {},
  method = "POST",
  headers: Record<string, string> = {},
): Promise<T> {
  const isGetOrHead = method === "GET" || method === "HEAD";
  const response = await fetch(path, {
    method,
    headers: {
      ...(isGetOrHead ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: isGetOrHead ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  let result: { error?: string } | undefined;
  try {
    result = text ? (JSON.parse(text) as { error?: string }) : undefined;
  } catch {
    throw new Error("FLOW returned an unexpected response. Try again.");
  }
  if (!response.ok) {
    throw new Error(
      (result?.error ? messages[result.error] : undefined) ??
        "FLOW could not complete the request. Try again.",
    );
  }
  return result as T;
}

export function describe(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

export function googleNavigate(url: string) {
  const destination = new URL(url);
  if (
    destination.origin !== "https://accounts.google.com" ||
    destination.pathname !== "/o/oauth2/v2/auth"
  ) {
    throw new Error("The Google sign-in URL is unavailable.");
  }
  window.location.assign(destination.href);
}

export function Feedback({ text }: { text: string }) {
  return text ? (
    <p
      className="rounded-[8px] border border-[#FF1A1A]/30 bg-[#FF1A1A]/5 px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)]"
      role="status"
    >
      {text}
    </p>
  ) : null;
}

export function useResendClock() {
  const [seconds, setSeconds] = useState(0);
  const waiting = seconds > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(
      () => setSeconds((remaining) => Math.max(0, remaining - 1)),
      1_000,
    );
    return () => clearInterval(timer);
  }, [waiting]);
  return { seconds, startClock: () => setSeconds(60) };
}

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function signOut() {
    setBusy(true);
    try {
      await send("/api/auth/sign-out");
      window.location.replace("/sign-in");
    } catch (error) {
      setMessage(describe(error));
      setBusy(false);
    }
  }
  return (
    <div className="inline-flex items-center gap-2">
      <button
        className="flow-btn-secondary px-3 py-1.5 text-xs font-semibold"
        type="button"
        disabled={busy}
        onClick={signOut}
      >
        Sign out
      </button>
      <Feedback text={message} />
    </div>
  );
}

export type ProofPurpose =
  | "enroll-email"
  | "link-google"
  | "unlink-google"
  | "disable-email"
  | "revoke-all"
  | "team-change"
  | "transfer-authorize";

export function FreshProof({
  purpose,
  target,
  children,
  onConfirm,
  onCancel,
}: {
  purpose: ProofPurpose;
  target?: string;
  children: ReactNode;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [stage, setStage] = useState<"start" | "code">("start");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);
  const { seconds, startClock } = useResendClock();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    if (stage === "code") {
      codeInputRef.current?.focus();
    }
  }, [stage]);

  const digits = Array.from({ length: 8 }, (_, idx) => code[idx] ?? "");
  const activeDigitIdx = Math.min(code.length, 7);

  async function requestCode() {
    setBusy(true);
    setMessage("");
    try {
      await send("/api/security/code/start", { purpose, target });
      setStage("code");
      startClock();
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await send("/api/security/code/verify", { code: code.trim() });
      await onConfirm();
    } catch (error) {
      setMessage(describe(error));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Security confirmation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <section
        className="flow-card relative w-full max-w-[440px] space-y-5 p-6 sm:p-7 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF1A1A]/10 text-[#FF1A1A]">
            <IconShield size={20} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Confirm with a fresh email code
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {children}
            </p>
          </div>
        </div>

        {stage === "start" ? (
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={requestCode}
              className="flow-btn-primary px-4 py-2.5 text-xs"
            >
              Send security code
            </button>
            <button
              type="button"
              className="flow-btn-secondary px-4 py-2.5 text-xs"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={verify}>
            <div
              className="relative"
              onClick={() => codeInputRef.current?.focus()}
            >
              <label htmlFor="security-code-input" className="sr-only">
                Security code
              </label>
              <input
                ref={codeInputRef}
                id="security-code-input"
                aria-label="Security code"
                value={code}
                onChange={(event) => {
                  const sanitized = event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 8);
                  setCode(sanitized);
                }}
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{8}"
                maxLength={8}
                className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
              />
              <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                {digits.map((digit, idx) => {
                  const isActive = idx === activeDigitIdx;
                  return (
                    <div
                      key={idx}
                      className={`flex h-12 items-center justify-center rounded-xl bg-white dark:bg-[#161616] text-[18px] font-semibold text-[#0B0B0B] dark:text-white shadow-2xs transition sm:h-14 sm:text-[20px] ${
                        isActive
                          ? "border-2 border-[#FF1A1A]"
                          : "border border-[#DCDCDC] dark:border-white/[0.12]"
                      }`}
                    >
                      {digit}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                disabled={busy || code.length < 8}
                className="flow-btn-primary px-4 py-2.5 text-xs"
              >
                {busy ? "Confirming..." : "Confirm & continue"}
              </button>
              <button
                type="button"
                className="flow-btn-secondary px-3.5 py-2.5 text-xs"
                disabled={busy || seconds > 0}
                onClick={requestCode}
              >
                {seconds ? `Resend in ${seconds}s` : "Resend code"}
              </button>
              <button
                type="button"
                className="flow-btn-secondary px-3.5 py-2.5 text-xs"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        <Feedback text={message} />
      </section>
    </div>
  );
}
