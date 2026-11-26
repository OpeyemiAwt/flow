"use client";

import { useEffect, useState } from "react";
import { validateFlowIdHandle } from "../domain/flow-id.ts";
import { TypewriterInput } from "./typewriter-input.tsx";

export function FlowIdPickerForm({
  accountId,
  onClaimed,
  submitLabel = "Claim permanent @flow ID",
}: {
  accountId: string;
  onClaimed: (flowId: string) => void;
  submitLabel?: string;
}) {
  const [handle, setHandle] = useState("");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    available: boolean;
    flowId: string | null;
    reason?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = handle.trim();
    if (!trimmed) {
      setAvailability(null);
      setChecking(false);
      return;
    }
    const localCheck = validateFlowIdHandle(trimmed);
    if (!localCheck.valid) {
      setAvailability({
        available: false,
        flowId: null,
        reason: localCheck.reason,
      });
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/flow-id/check?handle=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          available?: boolean;
          flowId?: string | null;
          reason?: string;
        };
        if (!cancelled) {
          setAvailability({
            available: Boolean(data.available),
            flowId: data.flowId ?? null,
            reason: data.reason,
          });
        }
      } catch {
        if (!cancelled) {
          setAvailability(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availability?.available || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/flow-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        flowId?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok || !data.flowId) {
        throw new Error(
          data.detail || data.error || "Could not claim that Flow ID.",
        );
      }
      onClaimed(data.flowId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not claim that Flow ID.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300 mb-1.5">
          Choose your unique Flow ID
        </label>
        <div className="flex items-center rounded-2xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-[#1A1A1C] px-4 py-3 focus-within:border-neutral-950 dark:focus-within:border-white transition-colors">
          <TypewriterInput
            type="text"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.toLowerCase().replace(/\s+/g, ""));
              setError(null);
            }}
            placeholder="name"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm font-medium text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-hidden"
          />
          <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 select-none">
            @flow
          </span>
        </div>

        <div className="mt-2 min-h-[20px] text-xs">
          {checking && (
            <span className="text-neutral-400">Checking availability…</span>
          )}
          {!checking && availability?.available && availability.flowId && (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              ✓ {availability.flowId} is available
            </span>
          )}
          {!checking && availability && !availability.available && (
            <span className="text-[#FF1A1A] dark:text-red-400">
              {availability.reason || "This Flow ID is unavailable."}
            </span>
          )}
        </div>
      </div>

      <p className="rounded-xl bg-neutral-100/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        Your <span className="font-semibold">@flow</span> ID is unique and{" "}
        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
          permanent once claimed
        </span>
        . Anyone on Flow can use it to send assets directly to your wallet.
      </p>

      {error && (
        <p role="alert" className="text-xs text-[#FF1A1A] dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!availability?.available || checking || submitting}
        className="flow-liquid-btn-primary w-full py-3.5 rounded-full text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {submitting ? "Claiming Flow ID…" : submitLabel}
      </button>
    </form>
  );
}

export function FlowIdClaimModal({
  isOpen,
  onClose,
  accountId,
  onClaimed,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  onClaimed: (flowId: string) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="flow-anim-backdrop absolute inset-0 bg-neutral-950/50 backdrop-blur-xs"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Claim your unique Flow ID"
        className="flow-anim-fade-up relative z-10 w-full max-w-md rounded-[28px] border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-[#FF1A1A]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FF1A1A]">
              New
            </span>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-neutral-950 dark:text-white">
              Claim your unique @flow ID
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Receive direct payments from anyone on Flow using one simple ID.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Flow ID modal"
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
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

        <FlowIdPickerForm
          accountId={accountId}
          onClaimed={(claimedId) => {
            onClaimed(claimedId);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
