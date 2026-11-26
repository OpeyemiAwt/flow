"use client";

export type AgentBrandId =
  | "all"
  | "claude"
  | "codex"
  | "antigravity"
  | "grok"
  | "cursor";

export function inferAgentBrand(name: string): AgentBrandId {
  const n = name.trim().toLowerCase();
  if (n.includes("claude") || n.includes("anthropic")) return "claude";
  if (n.includes("codex") || n.includes("openai") || n.includes("chatgpt")) {
    return "codex";
  }
  if (n.includes("antigravity") || n.includes("gemini") || n.includes("agy")) {
    return "antigravity";
  }
  if (n.includes("grok") || n.includes("xai")) return "grok";
  if (n.includes("cursor")) return "cursor";
  return "all";
}

export function ClaudeIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#FAF2EA] dark:bg-[#2A201B] border border-[#EAD9C8] dark:border-[#4A352A]"
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <g stroke="#D97757" strokeWidth="2.05" strokeLinecap="round">
          <line x1="12" y1="2.5" x2="12" y2="21.5" />
          <line x1="2.5" y1="12" x2="21.5" y2="12" />
          <line x1="5.28" y1="5.28" x2="18.72" y2="18.72" />
          <line x1="18.72" y1="5.28" x2="5.28" y2="18.72" />
          <line x1="7.2" y1="3.7" x2="16.8" y2="20.3" />
          <line x1="16.8" y1="3.7" x2="7.2" y2="20.3" />
        </g>
        <circle cx="12" cy="12" r="2.2" fill="#D97757" />
      </svg>
    </span>
  );
}

export function CodexIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white dark:bg-[#1C1C1F] border border-neutral-200/90 dark:border-white/[0.12]"
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        viewBox="0 0 24 24"
        fill="none"
        className="text-neutral-900 dark:text-white"
      >
        <path
          d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0L4 14.01A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.86-5.84-3.37 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.68zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86 6.29 11.7a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.39.68zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function AntigravityIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#111216] dark:bg-[#1E2028] border border-neutral-800 dark:border-white/[0.14]"
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 3.5L4.8 19.2c-.3.65.18 1.3.88 1.15l4.4-1.05c.46-.11.84-.42 1.04-.85L12 16.5l.88 1.95c.2.43.58.74 1.04.85l4.4 1.05c.7.15 1.18-.5.88-1.15L12 3.5z"
          fill="url(#agy-grad)"
        />
        <circle cx="12" cy="11.2" r="1.7" fill="#111216" />
        <defs>
          <linearGradient id="agy-grad" x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" />
            <stop offset="0.55" stopColor="#A78BFA" />
            <stop offset="1" stopColor="#F472B6" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

export function GrokIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#0B0B0D] dark:bg-[#1C1C20] border border-neutral-800 dark:border-white/[0.14]"
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx="11.5"
          cy="12.5"
          r="6.2"
          stroke="#FFFFFF"
          strokeWidth="2.1"
          strokeDasharray="31 9"
          strokeLinecap="round"
        />
        <line
          x1="7"
          y1="18.2"
          x2="18.5"
          y2="5.5"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function CursorIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#121214] dark:bg-[#1E1E22] border border-neutral-800 dark:border-white/[0.14]"
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 3L20 7.6V16.4L12 21L4 16.4V7.6L12 3Z"
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M12 3V12M12 12L20 7.6M12 12L4 7.6M12 12V21"
          stroke="#FFFFFF"
          strokeOpacity="0.65"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function AllAssistantsCluster() {
  return (
    <div
      className="relative shrink-0"
      style={{ width: 42, height: 40 }}
      aria-hidden="true"
    >
      {/* Top-center: Claude */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full ring-[1.5px] ring-white dark:ring-[#141414]">
        <ClaudeIcon size={22} />
      </div>
      {/* Bottom-left: Codex / OpenAI */}
      <div className="absolute left-0 bottom-0 rounded-full ring-[1.5px] ring-white dark:ring-[#141414] z-10">
        <CodexIcon size={22} />
      </div>
      {/* Bottom-right: Grok */}
      <div className="absolute right-0 bottom-0 rounded-full ring-[1.5px] ring-white dark:ring-[#141414] z-20">
        <GrokIcon size={22} />
      </div>
    </div>
  );
}

export function AgentBrandIcon({
  brand,
  size = 32,
}: {
  brand: AgentBrandId;
  size?: number;
}) {
  switch (brand) {
    case "claude":
      return <ClaudeIcon size={size} />;
    case "codex":
      return <CodexIcon size={size} />;
    case "antigravity":
      return <AntigravityIcon size={size} />;
    case "grok":
      return <GrokIcon size={size} />;
    case "cursor":
      return <CursorIcon size={size} />;
    case "all":
    default:
      return <AllAssistantsCluster />;
  }
}
