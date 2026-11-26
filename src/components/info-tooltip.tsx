"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { IconInfo } from "./icons.tsx";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface InfoTooltipProps {
  readonly content: ReactNode;
  readonly label?: string;
  readonly size?: number;
  readonly className?: string;
}

interface TooltipCoords {
  readonly top: number;
  readonly left: number;
  readonly arrowLeft: number;
  readonly placement: "top" | "bottom";
}

export function InfoTooltip({
  content,
  label = "More information",
  size = 14,
  className = "",
}: InfoTooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);

  const open = hovered || pinned;

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelCloseTimer]);

  const closeAll = useCallback(() => {
    cancelCloseTimer();
    setHovered(false);
    setPinned(false);
  }, [cancelCloseTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tooltipRef.current;
    if (!trigger || !tip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Close if scrolled off screen
    if (
      triggerRect.bottom < 0 ||
      triggerRect.top > vh ||
      triggerRect.right < 0 ||
      triggerRect.left > vw
    ) {
      closeAll();
      return;
    }

    const tipRect = tip.getBoundingClientRect();
    const pad = 12;
    const gap = 8;
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;

    const left = Math.max(
      pad,
      Math.min(triggerCenterX - tipRect.width / 2, vw - tipRect.width - pad),
    );

    const spaceAbove = triggerRect.top;
    const placement: "top" | "bottom" =
      spaceAbove >= tipRect.height + gap + pad ? "top" : "bottom";

    const top =
      placement === "top"
        ? Math.max(pad, triggerRect.top - tipRect.height - gap)
        : Math.min(vh - tipRect.height - pad, triggerRect.bottom + gap);

    const arrowLeft = Math.max(
      14,
      Math.min(triggerCenterX - left, tipRect.width - 14),
    );

    setCoords({ top, left, arrowLeft, placement });
  }, [closeAll]);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, content, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        triggerRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      closeAll();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAll();
        triggerRef.current?.focus();
      }
    };

    const handleReposition = () => {
      updatePosition();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, closeAll, updatePosition]);

  useEffect(() => {
    return () => cancelCloseTimer();
  }, [cancelCloseTimer]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          cancelCloseTimer();
          setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          scheduleHoverClose();
        }}
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) {
            cancelCloseTimer();
            setHovered(true);
          }
        }}
        onBlur={() => {
          if (!pinned) {
            scheduleHoverClose();
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelCloseTimer();
          if (pinned) {
            setPinned(false);
            setHovered(false);
          } else {
            setPinned(true);
          }
        }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#FF1A1A]/40 transition-colors cursor-pointer align-middle ${className}`}
      >
        <IconInfo size={size} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              cancelCloseTimer();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              scheduleHoverClose();
            }}
            style={
              coords
                ? {
                    position: "fixed",
                    top: `${coords.top}px`,
                    left: `${coords.left}px`,
                    opacity: 1,
                  }
                : {
                    position: "fixed",
                    top: "-9999px",
                    left: "-9999px",
                    opacity: 0,
                  }
            }
            className="z-[9999] w-max max-w-[min(264px,calc(100vw-24px))] rounded-xl border border-neutral-800 dark:border-white/[0.14] bg-neutral-950 dark:bg-[#1E1E22] px-3 py-2 text-[11px] font-normal leading-relaxed text-neutral-100 shadow-xl"
          >
            {content}
            {coords && (
              <span
                aria-hidden="true"
                style={{ left: `${coords.arrowLeft}px` }}
                className={`pointer-events-none absolute -translate-x-1/2 h-2 w-2 rotate-45 border-neutral-800 dark:border-white/[0.14] bg-neutral-950 dark:bg-[#1E1E22] ${
                  coords.placement === "top"
                    ? "-bottom-1 border-r border-b"
                    : "-top-1 border-l border-t"
                }`}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
