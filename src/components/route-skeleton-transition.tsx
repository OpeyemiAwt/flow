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

function renderSkeletonForPath(path: string) {
  if (path.startsWith("/assistant")) return <AssistantPageSkeleton />;
  if (path.startsWith("/insights") || path.startsWith("/analytics")) {
    return <InsightsPageSkeleton />;
  }
  if (/^\/accounts\/[^/]+/.test(path)) return <PortfolioPageSkeleton />;
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

  const showBriefly = (targetPath: string, ms: number) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setOverlayPath(targetPath);
    timerRef.current = window.setTimeout(() => {
      setOverlayPath(null);
      timerRef.current = null;
    }, ms);
  };

  // Trigger brief skeleton when route pathname changes
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      showBriefly(pathname, 230);
    }
  }, [pathname]);

  // Also show target skeleton immediately on internal link clicks
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      const nextPath = href.split("?")[0]?.split("#")[0] || "/";
      if (nextPath === prevPathRef.current) return;
      showBriefly(nextPath, 380);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
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
