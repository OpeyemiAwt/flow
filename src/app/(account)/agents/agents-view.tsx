"use client";

import Link from "next/link";
import { McpAgentsSection } from "../../../components/mcp-agents-section.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import type { SerializedMcpAgentKey } from "../../../server/mcp-agent-keys-service.ts";

interface AgentsViewProps {
  readonly accountId: string | null;
  readonly flowId: string | null;
  readonly appBaseUrl: string;
  readonly initialKeys: readonly SerializedMcpAgentKey[];
  readonly userEmail: string;
  readonly userName?: string | null;
  readonly userAvatarUrl?: string | null;
  readonly profileId?: string;
}

export function AgentsView({
  accountId,
  appBaseUrl,
  initialKeys,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: AgentsViewProps) {
  const backHref = accountId ? "/app" : "/accounts";

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50 pb-20">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold tracking-tight text-neutral-950 dark:text-white">
            AI Agents
          </span>

          <div className="flex items-center gap-2.5">
            <Link
              href={backHref}
              aria-label="Back to Wallet"
              title="Back to Wallet"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-neutral-800 dark:text-neutral-100 transition-colors"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <Link href="/security" aria-label="Settings">
              <UserAvatar
                name={userName || userEmail}
                email={userEmail}
                fallbackImage={userAvatarUrl}
                profileId={profileId}
                size={28}
              />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <McpAgentsSection
          accountId={accountId}
          appBaseUrl={appBaseUrl}
          initialKeys={initialKeys}
        />
      </main>
    </div>
  );
}
