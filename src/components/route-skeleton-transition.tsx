"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  AssistantPageSkeleton,
  CenteredCardSkeleton,
  GenericPageSkeleton,
  InsightsPageSkeleton,
  PortfolioPageSkeleton,
} from "./page-skeletons.tsx";

const ROUTE_TRANSITION_EVENT = "flow:route-transition";

export function startRouteTransition(targetHref: string) {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!targetHref || !targetHref.startsWith("/") || targetHref.startsWith("//")) {
    return;
  }
  const nextPath = targetHref.split("?")[0]?.split("#")[0] || "/";
  window.dispatchEvent(
    new CustomEvent<string>(ROUTE_TRANSITION_EVENT, { detail: nextPath }),
  );
}

function renderSkeletonForPath(path: string) {
  if (path.startsWith("/assistant")) return <AssistantPageSkeleton />;
  if (path.startsWith("/insights") || path.startsWith("/analytics")) {
    return <InsightsPageSkeleton />;
  }
  if (
    path === "/app" ||
    path.startsWith("/app/") ||
    /^\/accounts\/[^/]+/.test(path)
  ) {
    return <PortfolioPageSkeleton />;
  }
  if (
    path.startsWith("/pay/") ||
    path.startsWith("/sign-in") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/invites/")
  ) {
    return <CenteredCardSkeleton />;
  }
  return <GenericPageSkeleton />;
}

export function RouteSkeletonTransition({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const prevPathRef = useRef<string>(pathname);
  const timerRef = useRef<number | null>(null);
  const [overlayPath, setOverlayPath] = useState<string | null>(null);

  const clearOverlay = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOverlayPath(null);
  };

  const beginTransition = (targetPath: string) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!targetPath || targetPath === prevPathRef.current) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setOverlayPath(targetPath);
    // Safety fallback in case navigation is cancelled or times out
    timerRef.current = window.setTimeout(() => {
      setOverlayPath(null);
      timerRef.current = null;
    }, 10_000);
  };

  // Clear transition skeleton as soon as the new route has committed
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      clearOverlay();
    }
  }, [pathname]);

  // Show target skeleton immediately on internal link clicks and programmatic transitions
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const nextPath = href.split("?")[0]?.split("#")[0] || "/";
      if (nextPath === prevPathRef.current) return;
      beginTransition(nextPath);
    };

    const onProgrammatic = (e: Event) => {
      const nextPath = (e as CustomEvent<string>).detail;
      if (typeof nextPath === "string") {
        beginTransition(nextPath);
      }
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener(ROUTE_TRANSITION_EVENT, onProgrammatic);
    window.addEventListener("popstate", clearOverlay);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(ROUTE_TRANSITION_EVENT, onProgrammatic);
      window.removeEventListener("popstate", clearOverlay);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <>
      {children}
      {overlayPath && (
        <div
          aria-busy="true"
          aria-label="Loading page"
          className="fixed inset-0 z-[90] overflow-hidden bg-[#FAF8F5] dark:bg-[#0B0B0B]"
        >
          {renderSkeletonForPath(overlayPath)}
        </div>
      )}
    </>
  );
}
