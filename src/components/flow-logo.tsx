export type FlowLogoVariant =
  "primary" | "inverse" | "mono-black" | "mono-white";

export function FlowMark({
  size = 32,
  variant = "primary",
  className = "",
}: {
  size?: number;
  variant?: FlowLogoVariant;
  className?: string;
}) {
  const isForcedWhite = variant === "inverse" || variant === "mono-white";
  const isForcedBlack = variant === "mono-black";

  if (isForcedWhite || isForcedBlack) {
    const src = isForcedWhite
      ? "/assets/flow-symbol-white.png"
      : "/assets/flow-symbol.png";
    return (
      <img
        src={src}
        alt="FLOW"
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px` }}
        className={`inline-block object-contain select-none ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <>
      <img
        src="/assets/flow-symbol.png"
        alt="FLOW"
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px` }}
        className={`inline-block object-contain select-none dark:hidden ${className}`}
        aria-hidden="true"
      />
      <img
        src="/assets/flow-symbol-white.png"
        alt="FLOW"
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px` }}
        className={`hidden object-contain select-none dark:inline-block ${className}`}
        aria-hidden="true"
      />
    </>
  );
}

export function FlowLogo({
  size = 32,
  variant = "primary",
  markOnly = false,
  subtitle,
  className = "",
}: {
  size?: number;
  variant?: FlowLogoVariant;
  markOnly?: boolean;
  subtitle?: string;
  className?: string;
}) {
  const isForcedWhite = variant === "inverse" || variant === "mono-white";
  const isForcedBlack = variant === "mono-black";

  if (markOnly) {
    return <FlowMark size={size} variant={variant} className={className} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
    >
      <span className="flex flex-col leading-none">
        {isForcedWhite || isForcedBlack ? (
          <img
            src={
              isForcedWhite
                ? "/assets/flow-logo-white.png"
                : "/assets/flow-logo.png"
            }
            alt="FLOW"
            height={size}
            style={{ height: `${size}px`, width: "auto" }}
            className="object-contain"
          />
        ) : (
          <>
            <img
              src="/assets/flow-logo.png"
              alt="FLOW"
              height={size}
              style={{ height: `${size}px`, width: "auto" }}
              className="object-contain dark:hidden"
            />
            <img
              src="/assets/flow-logo-white.png"
              alt="FLOW"
              height={size}
              style={{ height: `${size}px`, width: "auto" }}
              className="hidden object-contain dark:block"
            />
          </>
        )}
        {subtitle && (
          <span
            className={`mt-0.5 text-[10px] font-medium tracking-wider uppercase ${
              isForcedWhite
                ? "text-neutral-400"
                : isForcedBlack
                  ? "text-neutral-500"
                  : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}

export function FlowWaveGraphic({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none select-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="h-full w-full bg-[radial-gradient(ellipse_at_center,_rgba(255,26,26,0.18)_0%,_rgba(255,26,26,0.04)_40%,_transparent_75%)]" />
    </div>
  );
}
