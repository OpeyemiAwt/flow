"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FlowLogo } from "../../../components/flow-logo.tsx";
import { FlowAiMascot } from "../../../components/icons.tsx";
import { useTranslation } from "../../../components/language-provider.tsx";
import { Skeleton } from "../../../components/page-skeletons.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import type { AssistantMessage } from "../../../server/ai-assistant-service.ts";

interface AssistantViewProps {
  accountId: string | null;
  accountName?: string | null;
  userEmail: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  profileId?: string;
}

const SUGGESTION_PROMPTS = [
  {
    id: "balance",
    prompt: "What's my balance?",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </svg>
    ),
  },
  {
    id: "route",
    prompt: "Can I pay with USDC on Base?",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
  {
    id: "link",
    prompt: "Draft a payment link for $10",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
  },
  {
    id: "settlement",
    prompt: "Check recent settlement",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

export function AssistantView({
  accountId,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: AssistantViewProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const firstName =
    userName?.trim().split(/\s+/)[0] ||
    userEmail.split("@")[0] ||
    "there";

  const backHref = accountId ? `/accounts/${accountId}` : "/accounts";

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = async (queryText?: string) => {
    const text = (queryText ?? input).trim();
    if (!text || loading) return;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput("");

    if (!accountId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            "No active wallet account found yet. Open or create a wallet account first to use Flow AI.",
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });

      const data = await res.json();
      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content:
              data.error ||
              "Sorry, I could not complete your request. Please try again.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Network connection error. Please try again in a moment.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white transition-colors"
            >
              <FlowLogo className="h-5 w-auto" />
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-sm font-semibold tracking-tight">
              Flow AI
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {hasMessages && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#141414] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                New chat
              </button>
            )}
            <Link
              href={backHref}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] transition-colors"
            >
              {t.backToWallet}
            </Link>
            <UserAvatar
              name={userName || userEmail}
              email={userEmail}
              fallbackImage={userAvatarUrl}
              profileId={profileId}
              size={34}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 flex flex-col justify-between">
        {!hasMessages ? (
          /* Clean Opening Hero (No initial message) */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 sm:py-16">
            <div className="h-16 w-16 rounded-full bg-white dark:bg-[#161618] border border-neutral-200/70 dark:border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.06)] flex items-center justify-center text-neutral-950 dark:text-white">
              <FlowAiMascot size={30} />
            </div>

            <h1 className="mt-6 text-2xl sm:text-[28px] font-semibold tracking-tight text-neutral-950 dark:text-white">
              Hey, {firstName}
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] text-neutral-600 dark:text-neutral-300">
              Ask me anything about your money.
            </p>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              Flow Copilot can make mistakes. Check anything that moves money.
            </p>
          </div>
        ) : (
          /* Conversation Thread */
          <div className="flex-1 py-6 sm:py-8 space-y-5">
            {messages.map((msg, idx) => (
              <div
                key={msg.id ?? idx}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 rounded-br-xs shadow-xs"
                      : "bg-white dark:bg-[#141414] border border-neutral-200/70 dark:border-white/[0.08] text-neutral-900 dark:text-neutral-100 rounded-bl-xs shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Structured Action Card */}
                  {msg.card && (
                    <div className="mt-3 p-3.5 rounded-xl bg-[#FAF8F5] dark:bg-[#1b1b1d] border border-neutral-200/80 dark:border-white/[0.08] text-neutral-900 dark:text-white">
                      {msg.card.type === "BALANCE_SUMMARY" && (
                        <div>
                          <p className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
                            Verified Balances
                          </p>
                          <div className="space-y-1.5">
                            {Array.isArray(msg.card.data?.balances) &&
                              msg.card.data.balances.map(
                                (
                                  b: {
                                    asset?: string;
                                    balance?: string;
                                    usd?: string;
                                  },
                                  bIdx: number,
                                ) => (
                                  <div
                                    key={bIdx}
                                    className="flex items-center justify-between text-xs py-1 border-b border-neutral-200/60 dark:border-white/[0.06] last:border-0"
                                  >
                                    <span className="font-semibold">
                                      {b.asset}
                                    </span>
                                    <span className="font-mono">
                                      {b.balance}
                                    </span>
                                  </div>
                                ),
                              )}
                          </div>
                          {accountId && (
                            <Link
                              href={`/accounts/${accountId}?tab=receive`}
                              className="mt-3 block w-full py-2 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
                            >
                              + Add Money
                            </Link>
                          )}
                        </div>
                      )}

                      {msg.card.type === "PREVIEW_SWAP" && (
                        <div>
                          <p className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
                            Quote Preview
                          </p>
                          <p className="text-xs font-mono mb-2">
                            {String(msg.card.data?.route || "")}
                          </p>
                          <div className="p-2.5 rounded-lg bg-white dark:bg-[#141414] text-[11px] text-neutral-500 dark:text-neutral-400 border border-neutral-200/60 dark:border-white/[0.06]">
                            {String(msg.card.data?.safetyNotice || "")}
                          </div>
                          {accountId && (
                            <Link
                              href={`/accounts/${accountId}?tab=send`}
                              className="mt-3 block w-full py-2 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
                            >
                              Go to Send &amp; Transfer
                            </Link>
                          )}
                        </div>
                      )}

                      {msg.card.type === "DRAFT_PAYMENT_LINK" && (
                        <div>
                          <p className="font-bold text-[11px] uppercase tracking-wider text-amber-500 mb-1">
                            Draft Payment Link
                          </p>
                          <p className="text-xs font-semibold">
                            {String(msg.card.data?.title || "")}
                          </p>
                          <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 my-1">
                            {String(msg.card.data?.amount || "")}{" "}
                            {String(msg.card.data?.assetSymbol || "")}
                          </p>
                          {accountId && (
                            <Link
                              href={`/accounts/${accountId}?tab=request`}
                              className="mt-3 block w-full py-2 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
                            >
                              Open in Payment Links
                            </Link>
                          )}
                        </div>
                      )}

                      {msg.card.type === "PAYMENT_STATUS" && (
                        <div>
                          <p className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 mb-1">
                            Payment Details
                          </p>
                          <div className="space-y-1 text-xs">
                            <p>
                              Status:{" "}
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {String(msg.card.data?.status || "")}
                              </span>
                            </p>
                            <p className="font-mono text-[11px] truncate">
                              ID: {String(msg.card.data?.publicId || "")}
                            </p>
                            {msg.card.data?.amount ? (
                              <p className="font-mono text-[11px] truncate">
                                Amount: {String(msg.card.data.amount)}
                              </p>
                            ) : null}
                            {msg.card.data?.settlementTxHash ? (
                              <p className="font-mono text-[11px] truncate">
                                Tx: {String(msg.card.data.settlementTxHash)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-neutral-400 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex flex-col items-start">
                <div className="w-64 rounded-2xl rounded-bl-xs bg-white dark:bg-[#141414] border border-neutral-200/70 dark:border-white/[0.08] p-4 space-y-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                  <Skeleton className="h-3.5 w-44 rounded-md" />
                  <Skeleton className="h-3.5 w-32 rounded-md" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Bottom Prompt Grid (Opening state) + Pill Input Bar */}
        <div className="sticky bottom-0 pb-6 sm:pb-8 pt-3 bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/95 to-transparent dark:from-[#0B0B0B] dark:via-[#0B0B0B]/95">
          {!hasMessages && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {SUGGESTION_PROMPTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSend(item.prompt)}
                  className="flex items-center gap-3 rounded-2xl bg-white dark:bg-[#141414] border border-neutral-200/70 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.03)] px-4 py-3.5 text-left text-[13px] font-medium text-neutral-800 dark:text-neutral-200 hover:border-neutral-300 dark:hover:border-white/20 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-neutral-500 dark:text-neutral-400 shrink-0">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.prompt}</span>
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 rounded-full bg-white dark:bg-[#141414] border border-neutral-200/80 dark:border-white/[0.1] shadow-[0_4px_24px_rgba(0,0,0,0.05)] pl-5 pr-2 py-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything"
              className="flex-1 bg-transparent text-sm text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send query"
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                input.trim() && !loading
                  ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90"
                  : "bg-neutral-400/70 text-white dark:bg-neutral-700 dark:text-neutral-400"
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
