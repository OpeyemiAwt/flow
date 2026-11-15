export function Skeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-2xl bg-neutral-200/75 dark:bg-white/[0.08] ${className}`}
    />
  );
}

function TopBarSkeleton() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-20 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </header>
  );
}

export function PortfolioPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B]">
      {/* Top Floating Nav Skeleton */}
      <header className="sticky top-0 z-30 bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-24 rounded-lg" />
          <Skeleton className="hidden md:block h-12 w-[430px] rounded-full" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-11 w-11 rounded-full" />
            <Skeleton className="h-11 w-11 rounded-full" />
            <Skeleton className="h-11 w-11 rounded-full" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-12 pb-28 space-y-6">
        {/* Hero Balance Card Skeleton */}
        <div className="rounded-[28px] border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-28 rounded-lg" />
              <Skeleton className="h-11 w-48 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-28 rounded-full" />
            <Skeleton className="h-11 w-28 rounded-full" />
          </div>
        </div>

        {/* Assets & Activity Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-[28px] border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32 rounded-lg" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 border-b border-neutral-100 dark:border-white/[0.05] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded-md" />
                  </div>
                </div>
                <div className="space-y-1.5 text-right">
                  <Skeleton className="h-4 w-20 rounded-md ml-auto" />
                  <Skeleton className="h-3 w-14 rounded-md ml-auto" />
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-5 rounded-[28px] border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-6 space-y-4">
            <Skeleton className="h-5 w-36 rounded-lg" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-28 rounded-md" />
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function InsightsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B]">
      <TopBarSkeleton />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-8 w-56 rounded-xl" />
            <Skeleton className="h-4 w-72 rounded-md" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-3xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-5 space-y-3"
            >
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-7 w-32 rounded-lg" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-44 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

export function AssistantPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] flex flex-col">
      <TopBarSkeleton />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col justify-between">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-7 w-44 rounded-xl" />
          <Skeleton className="h-4 w-60 rounded-lg" />
          <Skeleton className="h-3 w-72 rounded-lg" />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-14 w-full rounded-full" />
        </div>
      </main>
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B]">
      <TopBarSkeleton />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-4 w-72 rounded-lg" />
        </div>
        <div className="rounded-3xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-[#141414] p-6 space-y-4">
          <Skeleton className="h-5 w-36 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

export function CenteredCardSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-neutral-200/70 dark:border-white/[0.08] bg-white/85 dark:bg-[#141414] p-7 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20 rounded-lg" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-xl" />
          <Skeleton className="h-4 w-64 rounded-lg" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
}
