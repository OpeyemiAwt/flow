"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SlideToPayProps {
  label: string;
  submittingLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/**
 * Interactive horizontal slider confirmation control for outgoing payments.
 */
export function SlideToPay({
  label,
  submittingLabel = "Sending payment…",
  disabled = false,
  loading = false,
  onConfirm,
}: SlideToPayProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const triggeredRef = useRef(false);
  const [progress, setProgress] = useState(0); // 0 to 1

  useEffect(() => {
    if (!loading) {
      triggeredRef.current = false;
      setProgress(0);
    }
  }, [loading]);

  const computeProgress = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const thumbSize = 48;
    const usable = Math.max(1, rect.width - thumbSize - 8);
    const raw = (clientX - rect.left - thumbSize / 2 - 4) / usable;
    return Math.max(0, Math.min(1, raw));
  }, []);

  const finishDrag = useCallback(
    (finalProgress: number) => {
      draggingRef.current = false;
      if (finalProgress >= 0.85 && !triggeredRef.current && !disabled && !loading) {
        triggeredRef.current = true;
        setProgress(1);
        onConfirm();
      } else if (!triggeredRef.current) {
        setProgress(0);
      }
    },
    [disabled, loading, onConfirm],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const next = computeProgress(e.clientX);
      setProgress(next);
      if (next >= 0.94 && !triggeredRef.current) {
        finishDrag(next);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      finishDrag(computeProgress(e.clientX));
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [computeProgress, finishDrag]);

  const isDisabled = disabled || loading;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={isDisabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-disabled={isDisabled}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          finishDrag(1);
        }
      }}
      className={`relative h-14 w-full rounded-full border p-1 select-none overflow-hidden transition-colors ${
        isDisabled
          ? "border-neutral-200 dark:border-white/[0.08] bg-neutral-100 dark:bg-white/[0.05] opacity-60 cursor-not-allowed"
          : "border-neutral-900/15 dark:border-white/15 bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 cursor-grab active:cursor-grabbing"
      }`}
    >
      {/* Filled progress rail */}
      <div
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-emerald-500/25 transition-[width] duration-75"
        style={{
          width: `calc(${Math.round(progress * 100)}% + ${progress > 0 ? 44 : 0}px)`,
          maxWidth: "calc(100% - 8px)",
        }}
      />

      {/* Centered prompt */}
      <div className="relative z-10 h-full w-full flex items-center justify-center pointer-events-none px-14">
        <span
          className="text-xs sm:text-sm font-bold tracking-tight truncate transition-opacity duration-150"
          style={{ opacity: loading ? 1 : Math.max(0.2, 1 - progress * 1.1) }}
        >
          {loading ? submittingLabel : label}
        </span>
      </div>

      {/* Draggable thumb */}
      <button
        type="button"
        disabled={isDisabled}
        aria-label={label}
        onPointerDown={(e) => {
          if (isDisabled) return;
          e.preventDefault();
          draggingRef.current = true;
          setProgress(computeProgress(e.clientX));
        }}
        style={{
          left: `calc(4px + ${progress} * (100% - 56px))`,
        }}
        className={`absolute top-1 z-20 h-12 w-12 rounded-full flex items-center justify-center shadow-md transition-[left] ${
          draggingRef.current ? "duration-0" : "duration-200"
        } ${
          isDisabled
            ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500"
            : "bg-white dark:bg-neutral-950 text-neutral-950 dark:text-white"
        }`}
      >
        {loading ? (
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </button>
    </div>
  );
}
