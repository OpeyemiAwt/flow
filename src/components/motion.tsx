"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { triggerHaptic } from "./haptics.ts";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return reduced;
}

export interface MotionRevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  delayMs?: number;
  distancePx?: number;
  durationMs?: number;
  immediate?: boolean;
}

/**
 * Viewport-aware reveal using IntersectionObserver.
 * SSR-safe: renders visible on first paint if already in viewport or when reduced-motion is on.
 */
export function MotionReveal({
  children,
  delayMs = 0,
  distancePx = 12,
  durationMs = 340,
  immediate = false,
  className = "",
  style,
  ...rest
}: MotionRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate || reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [immediate, reduced]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible || reduced ? 1 : 0,
        transform:
          visible || reduced
            ? "translate3d(0, 0, 0)"
            : `translate3d(0, ${distancePx}px, 0)`,
        transitionProperty: "opacity, transform",
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MotionHeadlineLine({
  children,
  delayMs = 0,
  onScroll = false,
  className = "",
}: {
  children: ReactNode;
  delayMs?: number;
  onScroll?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(!onScroll);

  useEffect(() => {
    if (!onScroll || reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -24px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScroll, reduced]);

  return (
    <span
      ref={ref}
      className={`inline-block overflow-hidden align-bottom ${className}`}
    >
      <span
        className={`inline-block ${
          visible && !reduced ? "flow-anim-mask-reveal" : ""
        }`}
        style={{
          animationDelay: `${delayMs}ms`,
          opacity: visible || reduced ? undefined : 0,
        }}
      >
        {children}
      </span>
    </span>
  );
}

export function MotionStaggerItem({
  children,
  index,
  stepMs = 45,
  maxDelayMs = 320,
  className = "",
}: {
  children: ReactNode;
  index: number;
  stepMs?: number;
  maxDelayMs?: number;
  className?: string;
}) {
  const delay = Math.min(index * stepMs, maxDelayMs);
  return (
    <div
      className={`flow-anim-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function MotionTabPanel({
  children,
  direction = "neutral",
  className = "",
}: {
  children: ReactNode;
  direction?: "forward" | "backward" | "neutral";
  className?: string;
}) {
  const animClass =
    direction === "forward"
      ? "flow-anim-slide-forward"
      : direction === "backward"
        ? "flow-anim-slide-backward"
        : "flow-anim-fade-up";
  return <div className={`${animClass} ${className}`}>{children}</div>;
}

/**
 * Smoothly transitions between genuine numeric values (e.g. live USD balance).
 * Never counts up from 0 on initial mount; only animates when a non-null value changes.
 */
export function MotionNumber({
  value,
  format,
  durationMs = 380,
  className = "",
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const prevRef = useRef<number | null>(null);
  const [display, setDisplay] = useState<number>(value);

  useEffect(() => {
    if (prevRef.current === null || reduced || !Number.isFinite(value)) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    const startVal = prevRef.current;
    const diff = value - startVal;
    if (Math.abs(diff) < 1e-9) {
      setDisplay(value);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      if (typeof document !== "undefined" && document.hidden) {
        prevRef.current = value;
        setDisplay(value);
        return;
      }
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startVal + diff * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = value;
        setDisplay(value);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      prevRef.current = value;
    };
  }, [value, durationMs, reduced]);

  return (
    <span className={`tabular-nums ${className}`}>{format(display)}</span>
  );
}

/**
 * Bounded pointer parallax container (max +-4px) for hero product visuals.
 * Disabled automatically for touch/reduced-motion users.
 */
export function MotionParallaxCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [offset, setOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={className}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        setOffset({
          x: Math.max(-4, Math.min(4, nx * 8)),
          y: Math.max(-4, Math.min(4, ny * 8)),
        });
      }}
      onMouseLeave={() => setOffset({ x: 0, y: 0 })}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Restrained cross-chain routing illustration for landing & guest checkout.
 */
export function CrossChainFlowVisual({
  fromLabel,
  toLabel,
  active = true,
  className = "",
}: {
  fromLabel: string;
  toLabel: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 px-3.5 py-2.5 text-xs ${className}`}
      aria-label={`Illustrative routing from ${fromLabel} through FLOW to ${toLabel}`}
    >
      <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
        {fromLabel}
      </span>
      <svg
        className="w-16 h-4 shrink-0 text-[#FF1A1A]"
        viewBox="0 0 64 16"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="2"
          y1="8"
          x2="58"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.75"
          className={active ? "flow-anim-route-dash" : ""}
        />
        <path
          d="M54 4L60 8L54 12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="px-2 py-0.5 rounded-full bg-[#0B0B0B] text-white dark:bg-white dark:text-[#0B0B0B] font-bold text-[10px] tracking-wide shrink-0">
        FLOW
      </span>
      <svg
        className="w-16 h-4 shrink-0 text-[#FF1A1A]"
        viewBox="0 0 64 16"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="2"
          y1="8"
          x2="58"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.75"
          className={active ? "flow-anim-route-dash" : ""}
        />
        <path
          d="M54 4L60 8L54 12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
        {toLabel}
      </span>
    </div>
  );
}

export interface SegmentedTabOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface SegmentedTabPillProps<T extends string> {
  readonly tabs: readonly SegmentedTabOption<T>[];
  readonly activeTab: T;
  readonly onChange: (tab: T) => void;
  readonly className?: string;
  readonly size?: "sm" | "md";
}

/**
 * Universal gliding segmented pill tabs matching FLOW FloatingNav:
 * - Liquid glass pill container
 * - Gliding active pill indicator that zooms out while moving and glides smoothly
 * - Haptic feedback on switch
 * - Accessible ARIA tablist/tab structure
 */
export function SegmentedTabPill<T extends string>({
  tabs,
  activeTab,
  onChange,
  className = "",
  size = "md",
}: SegmentedTabPillProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [geometry, setGeometry] = useState<{
    left: number;
    width: number;
    visible: boolean;
  }>({
    left: 0,
    width: 0,
    visible: false,
  });
  const [gliding, setGliding] = useState(false);
  const prevTabRef = useRef<T>(activeTab);

  const syncGeometry = useCallback(() => {
    const btn = buttonRefs.current[activeTab];
    const container = containerRef.current;
    if (!btn || !container) {
      setGeometry((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }
    setGeometry({
      left: btn.offsetLeft,
      width: btn.offsetWidth,
      visible: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    syncGeometry();
  }, [syncGeometry]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncGeometry());
    observer.observe(container);
    window.addEventListener("resize", syncGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncGeometry);
    };
  }, [syncGeometry]);

  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      prevTabRef.current = activeTab;
      setGliding(true);
      const timer = window.setTimeout(() => setGliding(false), 260);
      return () => window.clearTimeout(timer);
    }
  }, [activeTab]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Switch tabs"
      className={`flow-nav-glass relative flex items-center gap-1 p-1 rounded-full w-fit ${className}`}
    >
      {geometry.visible && (
        <span
          aria-hidden="true"
          className="flow-nav-active-pill pointer-events-none absolute top-1 bottom-1 left-0 rounded-full"
          style={{
            width: `${geometry.width}px`,
            transform: `translate3d(${geometry.left}px, 0, 0) scale(${gliding ? 0.86 : 1})`,
          }}
        />
      )}
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              triggerHaptic("light");
              onChange(tab.id);
            }}
            className={`flow-press relative z-10 flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors duration-200 cursor-pointer select-none ${
              size === "sm" ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs"
            } ${
              isActive
                ? geometry.visible
                  ? "text-[#0B0B0B]"
                  : "flow-nav-active-pill text-[#0B0B0B]"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
            }`}
          >
            {tab.icon && (
              <span className={isActive ? "flow-anim-icon-pop" : ""}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
