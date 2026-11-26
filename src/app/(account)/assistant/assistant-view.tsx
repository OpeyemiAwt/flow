"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AssetAvatar,
  FlowAiMascot,
} from "../../../components/icons.tsx";
import { useTranslation } from "../../../components/language-provider.tsx";
import { Skeleton } from "../../../components/page-skeletons.tsx";
import {
  PaymentTimelineTracker,
  type TrackedTransfer,
} from "../../../components/payment-timeline-tracker.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import { TypewriterInput } from "../../../components/typewriter-input.tsx";
import type { AssistantMessage } from "../../../server/ai-assistant-service.ts";
import type { AiConversationSummary } from "../../../server/ai-conversations-service.ts";

interface AssistantViewProps {
  accountId: string | null;
  accountName?: string | null;
  userEmail: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  profileId?: string;
}

interface DisputeDraftState {
  subject: string;
  category: string;
  transactionRef: string;
  message: string;
}

interface SentDisputeState {
  referenceCode: string;
  supportEmail: string;
}

const DISPUTE_CATEGORIES = [
  "Missing Funds",
  "Failed Transfer",
  "Checkout Issue",
  "Account Support",
] as const;

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
    id: "send",
    prompt: "Send 5 USDC to name@flow",
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
    id: "dispute",
    prompt: "File a dispute with FLOW support",
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
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
];

function formatCompactAmount(raw: string | null | undefined, maxDecimals = 4): string {
  if (!raw) return "0";
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return "0";
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return raw;
  if (parsed === 0) return "0";
  const effectiveDecimals =
    parsed > 0 && parsed < 0.01 ? Math.max(maxDecimals, 6) : maxDecimals;
  const formatInt = (intStr: string) =>
    intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const [rawInt = "0", frac = ""] = cleaned.split(".");
    const intPart = rawInt.replace(/^0+(?=\d)/, "") || "0";
    if (!frac) return formatInt(intPart);
    const trimmed = frac.slice(0, effectiveDecimals).replace(/0+$/, "");
    if (!trimmed) {
      if (intPart === "0" && /[1-9]/.test(frac)) {
        return `<0.${"0".repeat(effectiveDecimals - 1)}1`;
      }
      return formatInt(intPart);
    }
    return `${formatInt(intPart)}.${trimmed}`;
  }
  const factor = 10 ** effectiveDecimals;
  const floored = Math.floor(parsed * factor) / factor;
  if (floored === 0 && parsed > 0) {
    return `<0.${"0".repeat(effectiveDecimals - 1)}1`;
  }
  const [iPart = "0", fPart] = floored
    .toFixed(effectiveDecimals)
    .replace(/\.?0+$/, "")
    .split(".");
  return fPart ? `${formatInt(iPart)}.${fPart}` : formatInt(iPart);
}

function formatReadableNetwork(network: string | null | undefined): string {
  const norm = (network ?? "").toLowerCase().trim();
  if (norm.startsWith("near")) {
    return norm.includes("testnet") ? "NEAR Testnet" : "NEAR Mainnet";
  }
  if (norm.startsWith("solana")) {
    return norm.includes("devnet") ? "Solana Devnet" : "Solana Mainnet";
  }
  if (norm.startsWith("base")) {
    return norm.includes("sepolia") ? "Base Sepolia" : "Base Mainnet";
  }
  if (norm.startsWith("ethereum") || norm === "eth") {
    return norm.includes("sepolia") ? "Ethereum Sepolia" : "Ethereum Mainnet";
  }
  return network || "Mainnet";
}

function shortenHashOrAddress(value: string, head = 8, tail = 6): string {
  const trimmed = value.trim();
  if (trimmed.length <= head + tail + 3 || trimmed.includes("@flow")) {
    return trimmed;
  }
  return `${trimmed.slice(0, head)}...${trimmed.slice(-tail)}`;
}

function formatRelativeDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatInlineSpans(line: string, keyPrefix: string): ReactNode[] {
  // Trim any stray 6+ decimal raw numbers inside prose too
  const normalized = line.replace(
    /(?<![\w.x])(\d+\.\d{5,})(?![\w.])/g,
    (match) => formatCompactAmount(match, 4),
  );
  const parts = normalized.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={`${keyPrefix}-${idx}`}
          className="font-semibold text-neutral-950 dark:text-white"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-${idx}`}
          className="rounded-md bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] text-neutral-900 dark:text-neutral-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}-${idx}`}>{part}</span>;
  });
}

function renderFormattedAssistantText(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (idx: number) => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${idx}`}
        className="space-y-1.5 pl-4 list-disc marker:text-neutral-400"
      >
        {bulletBuffer.map((item, bIdx) => (
          <li key={`li-${idx}-${bIdx}`} className="leading-relaxed">
            {formatInlineSpans(item, `li-${idx}-${bIdx}`)}
          </li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (/^[-•*]\s+/.test(trimmed)) {
      bulletBuffer.push(trimmed.replace(/^[-•*]\s+/, ""));
      return;
    }
    flushBullets(idx);
    if (!trimmed) return;
    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {formatInlineSpans(trimmed, `p-${idx}`)}
      </p>,
    );
  });
  flushBullets(lines.length);

  return <div className="space-y-2">{blocks}</div>;
}

function parseBalanceRow(b: Record<string, unknown>) {
  const rawAsset = String(b.asset ?? "");
  let symbol = String(b.symbol ?? "").trim();
  let networkName = String(b.networkName ?? "").trim();
  if (!symbol && rawAsset) {
    const match = rawAsset.match(/^([A-Za-z0-9]+)/);
    symbol = match?.[1] ?? rawAsset;
  }
  if (!networkName) {
    if (typeof b.network === "string" && b.network.trim()) {
      networkName = formatReadableNetwork(b.network);
    } else {
      const paren = rawAsset.match(/\(([^)]+)\)/);
      if (paren?.[1]) {
        networkName = formatReadableNetwork(paren[1]);
      } else if (rawAsset.includes("·")) {
        networkName = rawAsset.split("·")[1]?.trim() ?? "";
      }
    }
  }
  const balance = formatCompactAmount(String(b.balance ?? "0"), 4);
  const usdValue =
    typeof b.usdValue === "string" && b.usdValue.trim() ? b.usdValue : null;
  return { symbol: symbol || "ASSET", networkName, balance, usdValue };
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as SpeechRecognitionCtor | undefined) ??
    (w.webkitSpeechRecognition as SpeechRecognitionCtor | undefined) ??
    null
  );
}

export function AssistantView({
  accountId,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: AssistantViewProps) {
  const { t } = useTranslation();

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Synced History Drawer state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<AiConversationSummary[]>(
    [],
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  // Card action states
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [createdLinks, setCreatedLinks] = useState<Record<string, string>>({});
  const [liveTransfers, setLiveTransfers] = useState<
    Record<string, TrackedTransfer>
  >({});
  const [disputeDrafts, setDisputeDrafts] = useState<
    Record<string, DisputeDraftState>
  >({});
  const [sentDisputes, setSentDisputes] = useState<
    Record<string, SentDisputeState>
  >({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Voice Note state (MediaRecorder -> Groq Whisper + Web Speech fallback)
  const [voiceState, setVoiceState] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceBars, setVoiceBars] = useState<number[]>([
    0.25, 0.45, 0.35, 0.6, 0.4, 0.5, 0.3, 0.45, 0.35, 0.25,
  ]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const speechRecRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const liveTranscriptRef = useRef<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const firstName =
    userName?.trim().split(/\s+/)[0] || userEmail.split("@")[0] || "there";
  const backHref = "/app";

  const fetchConversationList = useCallback(async () => {
    if (!accountId) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/ai-assistant/conversations`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        conversations?: AiConversationSummary[];
      };
      if (json.ok && Array.isArray(json.conversations)) {
        setConversations(json.conversations);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }, [accountId]);

  useEffect(() => {
    void fetchConversationList();
  }, [fetchConversationList]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, liveTransfers, createdLinks, sentDisputes]);

  // Poll any active outgoing transfers launched from AI cards
  useEffect(() => {
    if (!accountId) return;
    const activeEntries = Object.entries(liveTransfers).filter(
      ([, tr]) =>
        !["SETTLED", "FAILED", "REFUNDED", "RECONCILIATION_REQUIRED"].includes(
          tr.status,
        ),
    );
    if (activeEntries.length === 0) return;

    const timer = window.setInterval(async () => {
      for (const [msgKey, tr] of activeEntries) {
        try {
          const res = await fetch(
            `/api/accounts/${accountId}/transfers/${tr.id}`,
            { cache: "no-store" },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as {
            transfer?: TrackedTransfer;
          };
          if (data.transfer) {
            setLiveTransfers((prev) => ({
              ...prev,
              [msgKey]: data.transfer!,
            }));
          }
        } catch {
          // Ignore transient poll errors
        }
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [accountId, liveTransfers]);

  const cleanupVoiceResources = useCallback(() => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (animFrameRef.current !== null) {
      window.cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupVoiceResources();
  }, [cleanupVoiceResources]);

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const resetToNewChat = () => {
    setConversationId(null);
    setConversationTitle(null);
    setMessages([]);
    setCardErrors({});
    setCreatedLinks({});
    setLiveTransfers({});
    setDisputeDrafts({});
    setSentDisputes({});
    setHistoryOpen(false);
  };

  const openConversation = async (id: string) => {
    if (!accountId || loadingThreadId) return;
    setLoadingThreadId(id);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/ai-assistant/conversations?conversationId=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        conversation?: {
          id: string;
          title: string;
          messages: AssistantMessage[];
        };
      };
      if (json.ok && json.conversation) {
        setConversationId(json.conversation.id);
        setConversationTitle(json.conversation.title);
        setMessages(json.conversation.messages);
        setCardErrors({});
        setCreatedLinks({});
        setLiveTransfers({});
        setDisputeDrafts({});
        const restoredSent: Record<string, SentDisputeState> = {};
        json.conversation.messages.forEach((m, i) => {
          const key = m.id ?? `msg-${i}`;
          if (
            m.card?.type === "DISPUTE_EMAIL" &&
            typeof m.card.data?.sentReferenceCode === "string"
          ) {
            restoredSent[key] = {
              referenceCode: m.card.data.sentReferenceCode,
              supportEmail: String(
                m.card.data.supportEmail || "flow@devhub.forum",
              ),
            };
          }
        });
        setSentDisputes(restoredSent);
        setHistoryOpen(false);
      }
    } catch {
      // ignore
    } finally {
      setLoadingThreadId(null);
    }
  };

  const handleDeleteConversation = async (
    id: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    if (!accountId || deletingThreadId) return;
    setDeletingThreadId(id);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/ai-assistant/conversations?conversationId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          resetToNewChat();
        }
      }
    } catch {
      // ignore
    } finally {
      setDeletingThreadId(null);
    }
  };

  const handleSend = useCallback(
    async (queryText?: string, opts?: { viaVoice?: boolean }) => {
      const text = (queryText ?? input).trim();
      if (!text || loading) return;

      setVoiceError(null);
      const tempUserId = `user-${Date.now()}`;
      const userMsg: AssistantMessage = {
        id: tempUserId,
        role: "user",
        content: text,
        ...(opts?.viaVoice ? { viaVoice: true } : {}),
        timestamp: new Date().toISOString(),
      };

      const historySnapshot = messages.slice(-14).map((m) => ({
        role: m.role,
        content: m.content,
        card: m.card ?? null,
      }));

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
      const startedAt = Date.now();
      const ensureMinimumThinking = async () => {
        const remaining = 550 - (Date.now() - startedAt);
        if (remaining > 0) {
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, remaining),
          );
        }
      };

      try {
        const res = await fetch(`/api/accounts/${accountId}/ai-assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            history: historySnapshot,
            conversationId,
            viaVoice: Boolean(opts?.viaVoice),
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          message?: AssistantMessage;
          userMessageId?: string;
          conversationId?: string | null;
          conversationTitle?: string | null;
          error?: string;
        };

        await ensureMinimumThinking();

        if (data.ok && data.message) {
          if (data.conversationId) {
            setConversationId(data.conversationId);
          }
          if (data.conversationTitle) {
            setConversationTitle(data.conversationTitle);
          }
          setMessages((prev) => {
            const synced = data.userMessageId
              ? prev.map((m) =>
                  m.id === tempUserId ? { ...m, id: data.userMessageId } : m,
                )
              : prev;
            return [
              ...synced,
              {
                ...data.message!,
                id: data.message!.id ?? `assistant-${Date.now()}`,
              },
            ];
          });
          void fetchConversationList();
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
    },
    [accountId, conversationId, fetchConversationList, input, loading, messages],
  );

  // Voice Note Recording -> Groq Whisper + Browser Speech Recognition fallback
  const startVoiceRecording = async () => {
    if (loading || voiceState !== "idle") return;
    setVoiceError(null);
    discardRecordingRef.current = false;
    liveTranscriptRef.current = "";

    const hasMediaRecorder =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined";

    if (!hasMediaRecorder) {
      // Fallback directly to browser SpeechRecognition if MediaRecorder is unavailable
      const SpeechCtor = getSpeechRecognitionCtor();
      if (!SpeechCtor) {
        setVoiceError("Voice notes are not supported in this browser.");
        return;
      }
      try {
        const rec = new SpeechCtor();
        rec.lang = "en-US";
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = (ev) => {
          let combined = "";
          for (let i = 0; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r?.[0]?.transcript) combined += `${r[0].transcript} `;
          }
          liveTranscriptRef.current = combined.trim();
        };
        rec.onerror = () => {
          cleanupVoiceResources();
          setVoiceState("idle");
          setVoiceError("Could not capture audio. Check microphone permissions.");
        };
        speechRecRef.current = rec;
        rec.start();
        setVoiceState("recording");
        setRecordingSeconds(0);
        recordTimerRef.current = window.setInterval(() => {
          setRecordingSeconds((s) => s + 1);
        }, 1000);
      } catch {
        setVoiceError("Could not start microphone recording.");
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Also run passive SpeechRecognition in parallel as an instant fallback if Groq hits rate limit
      const SpeechCtor = getSpeechRecognitionCtor();
      if (SpeechCtor) {
        try {
          const rec = new SpeechCtor();
          rec.lang = "en-US";
          rec.interimResults = true;
          rec.continuous = true;
          rec.onresult = (ev) => {
            let combined = "";
            for (let i = 0; i < ev.results.length; i++) {
              const r = ev.results[i];
              if (r?.[0]?.transcript) combined += `${r[0].transcript} `;
            }
            liveTranscriptRef.current = combined.trim();
          };
          rec.onerror = () => {};
          speechRecRef.current = rec;
          rec.start();
        } catch {
          // Optional backup only
        }
      }

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const chosenMime =
        preferredTypes.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const wasDiscarded = discardRecordingRef.current;
        const backupTranscript = liveTranscriptRef.current.trim();
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || chosenMime || "audio/webm",
        });
        audioChunksRef.current = [];
        cleanupVoiceResources();

        if (wasDiscarded) {
          setVoiceState("idle");
          setRecordingSeconds(0);
          return;
        }

        if (blob.size < 200) {
          setVoiceState("idle");
          setVoiceError("Voice note was too short. Hold or speak clearly and try again.");
          return;
        }

        setVoiceState("transcribing");
        try {
          if (!accountId) {
            throw new Error("No active account.");
          }
          const form = new FormData();
          form.append("audio", blob, "voice-note.webm");
          const res = await fetch(
            `/api/accounts/${accountId}/ai-assistant/transcribe`,
            {
              method: "POST",
              body: form,
            },
          );
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            text?: string;
            error?: string;
          };
          if (res.ok && json.ok && json.text?.trim()) {
            setVoiceState("idle");
            setRecordingSeconds(0);
            void handleSend(json.text.trim(), { viaVoice: true });
            return;
          }
          // Fallback to browser live transcript if Groq Whisper rate-limited or failed
          if (backupTranscript) {
            setVoiceState("idle");
            setRecordingSeconds(0);
            void handleSend(backupTranscript, { viaVoice: true });
            return;
          }
          setVoiceError(
            json.error === "NO_SPEECH_DETECTED"
              ? "No speech detected in that voice note. Please try again."
              : "Could not transcribe voice note. Please try again.",
          );
        } catch {
          if (backupTranscript) {
            setVoiceState("idle");
            setRecordingSeconds(0);
            void handleSend(backupTranscript, { viaVoice: true });
            return;
          }
          setVoiceError("Network error while transcribing voice note.");
        } finally {
          setVoiceState("idle");
          setRecordingSeconds(0);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setVoiceState("recording");
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 59) {
            recorder.stop();
            return 60;
          }
          return s + 1;
        });
      }, 1000);

      // Drive live waveform bars from microphone amplitude
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          const bins = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(bins);
            const nextBars: number[] = [];
            for (let i = 0; i < 12; i++) {
              const val = bins[i + 1] ?? 0;
              nextBars.push(Math.max(0.18, Math.min(1, val / 170)));
            }
            setVoiceBars(nextBars);
            animFrameRef.current = window.requestAnimationFrame(tick);
          };
          animFrameRef.current = window.requestAnimationFrame(tick);
        }
      } catch {
        // Waveform animation optional
      }
    } catch {
      cleanupVoiceResources();
      setVoiceState("idle");
      setVoiceError("Microphone access denied. Allow mic access to send voice notes.");
    }
  };

  const stopAndSendVoice = () => {
    if (voiceState !== "recording") return;
    discardRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }
    // Browser-only SpeechRecognition fallback mode
    const transcript = liveTranscriptRef.current.trim();
    cleanupVoiceResources();
    setVoiceState("idle");
    setRecordingSeconds(0);
    if (transcript) {
      void handleSend(transcript, { viaVoice: true });
    } else {
      setVoiceError("No speech detected. Please try again.");
    }
  };

  const cancelVoiceRecording = () => {
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      cleanupVoiceResources();
      setVoiceState("idle");
      setRecordingSeconds(0);
    }
  };

  const handleExecuteSend = async (
    msgKey: string,
    data: Record<string, unknown>,
  ) => {
    if (!accountId || executingId) return;
    setExecutingId(msgKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[msgKey];
      return next;
    });
    const idempotencyKey = crypto.randomUUID();
    const rawAmount = String(data.rawAmount ?? data.amount ?? "").replace(
      /,/g,
      "",
    );
    try {
      const res = await fetch(`/api/accounts/${accountId}/send/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          sourceDeploymentId: data.sourceDeploymentId,
          destinationDeploymentId: data.destinationDeploymentId,
          recipientAddress: String(data.recipientAddress ?? "").trim(),
          sourceDisplayAmount: rawAmount,
          memo:
            typeof data.memo === "string" && data.memo.trim()
              ? data.memo.trim()
              : undefined,
          idempotencyKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        transfer?: TrackedTransfer;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !json.transfer) {
        throw new Error(
          json.detail || json.error || "Unable to submit outgoing payment.",
        );
      }
      setLiveTransfers((prev) => ({ ...prev, [msgKey]: json.transfer! }));
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [msgKey]:
          err instanceof Error ? err.message : "Payment execution failed.",
      }));
    } finally {
      setExecutingId(null);
    }
  };

  const handleExecuteConvert = async (
    msgKey: string,
    data: Record<string, unknown>,
  ) => {
    if (!accountId || executingId) return;
    setExecutingId(msgKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[msgKey];
      return next;
    });
    const idempotencyKey = crypto.randomUUID();
    const rawAmount = String(data.amount ?? "").replace(/,/g, "");
    try {
      const res = await fetch(`/api/accounts/${accountId}/convert/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          sourceDeploymentId: data.sourceDeploymentId,
          destinationDeploymentId: data.destinationDeploymentId,
          sourceDisplayAmount: rawAmount,
          idempotencyKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        transfer?: TrackedTransfer;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !json.transfer) {
        throw new Error(
          json.detail || json.error || "Unable to submit conversion.",
        );
      }
      setLiveTransfers((prev) => ({ ...prev, [msgKey]: json.transfer! }));
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [msgKey]:
          err instanceof Error ? err.message : "Conversion execution failed.",
      }));
    } finally {
      setExecutingId(null);
    }
  };

  const handleCreatePaymentLink = async (
    msgKey: string,
    data: Record<string, unknown>,
  ) => {
    if (!accountId || executingId) return;
    setExecutingId(msgKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[msgKey];
      return next;
    });
    try {
      const res = await fetch(`/api/accounts/${accountId}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.title || "Payment request"),
          description: null,
          destinationNetwork: String(data.network || "base-mainnet"),
          destinationAssetId: String(
            data.destinationAssetId || "base-mainnet:USDC",
          ),
          amountMode: "FIXED",
          requestedAmount: String(data.amount || "10.00").replace(/,/g, ""),
          expiresInHours: 168,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        shareUrl?: string;
        publicId?: string;
        error?: string;
        detail?: string;
      };
      const shareUrl =
        json.shareUrl ||
        (json.publicId
          ? `${window.location.origin}/pay/${json.publicId}`
          : null);
      if (!res.ok || !shareUrl) {
        throw new Error(
          json.detail || json.error || "Unable to create payment link.",
        );
      }
      setCreatedLinks((prev) => ({ ...prev, [msgKey]: shareUrl }));
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [msgKey]:
          err instanceof Error ? err.message : "Could not create payment link.",
      }));
    } finally {
      setExecutingId(null);
    }
  };

  const getDisputeDraft = (
    msgKey: string,
    data: Record<string, unknown>,
  ): DisputeDraftState => {
    return (
      disputeDrafts[msgKey] ?? {
        subject: String(data.subject ?? "Transaction Dispute"),
        category: String(data.category ?? "General Dispute"),
        transactionRef: String(data.transactionRef ?? ""),
        message: String(data.message ?? ""),
      }
    );
  };

  const updateDisputeDraft = (
    msgKey: string,
    data: Record<string, unknown>,
    patch: Partial<DisputeDraftState>,
  ) => {
    setDisputeDrafts((prev) => ({
      ...prev,
      [msgKey]: {
        ...getDisputeDraft(msgKey, data),
        ...patch,
      },
    }));
  };

  const handleSendDispute = async (
    msgKey: string,
    msgId: string | undefined,
    data: Record<string, unknown>,
  ) => {
    if (!accountId || executingId) return;
    const draft = getDisputeDraft(msgKey, data);
    if (draft.subject.trim().length < 3 || draft.message.trim().length < 8) {
      setCardErrors((prev) => ({
        ...prev,
        [msgKey]: "Please include a clear subject and details before sending.",
      }));
      return;
    }

    setExecutingId(msgKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[msgKey];
      return next;
    });

    try {
      const res = await fetch(
        `/api/accounts/${accountId}/ai-assistant/dispute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: draft.subject.trim(),
            category: draft.category.trim(),
            message: draft.message.trim(),
            transactionRef: draft.transactionRef.trim() || undefined,
            conversationId,
            messageId: msgId,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        referenceCode?: string;
        supportEmail?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.referenceCode) {
        throw new Error(json.error || "Could not send dispute email.");
      }
      setSentDisputes((prev) => ({
        ...prev,
        [msgKey]: {
          referenceCode: json.referenceCode!,
          supportEmail: json.supportEmail || "flow@devhub.forum",
        },
      }));
    } catch (err) {
      setCardErrors((prev) => ({
        ...prev,
        [msgKey]:
          err instanceof Error ? err.message : "Could not send dispute email.",
      }));
    } finally {
      setExecutingId(null);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base font-bold tracking-tight text-neutral-950 dark:text-white shrink-0">
              Flow AI
            </span>
            {conversationTitle && hasMessages && (
              <span className="hidden sm:inline-block text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[260px]">
                · {conversationTitle}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Synced Conversation History Button */}
            <button
              type="button"
              aria-label="Conversation history"
              title="History"
              onClick={() => {
                setHistoryOpen(true);
                void fetchConversationList();
              }}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#141414] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
              {conversations.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#FF1A1A]" />
              )}
            </button>

            {hasMessages && (
              <button
                type="button"
                aria-label="New chat"
                title="New chat"
                onClick={resetToNewChat}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#141414] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            <Link
              href={backHref}
              aria-label={t.backToWallet}
              title={t.backToWallet}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-neutral-800 dark:text-neutral-100 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
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
          /* Clean Opening Hero */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 sm:py-16">
            <div className="h-16 w-16 rounded-full bg-white dark:bg-[#161618] border border-neutral-200/70 dark:border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.06)] flex items-center justify-center text-neutral-950 dark:text-white">
              <FlowAiMascot size={30} />
            </div>

            <h1 className="mt-6 font-serif text-3xl sm:text-[34px] font-normal tracking-tight text-neutral-950 dark:text-white">
              Hey, {firstName}
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] text-neutral-600 dark:text-neutral-300">
              Type or tap the mic to send, check balances, or report a dispute.
            </p>
            <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
              Flow AI always asks for confirmation before moving funds or emailing support.
            </p>
          </div>
        ) : (
          /* Conversation Thread */
          <div className="flex-1 py-6 sm:py-8 space-y-6">
            {messages.map((msg, idx) => {
              const msgKey = msg.id ?? `msg-${idx}`;
              const liveTransfer = liveTransfers[msgKey];
              const createdLink = createdLinks[msgKey];
              const cardErr = cardErrors[msgKey];
              const isBusy = executingId === msgKey;
              const sentDispute =
                sentDisputes[msgKey] ??
                (msg.card?.type === "DISPUTE_EMAIL" &&
                typeof msg.card.data?.sentReferenceCode === "string"
                  ? {
                      referenceCode: msg.card.data.sentReferenceCode,
                      supportEmail: String(
                        msg.card.data.supportEmail || "flow@devhub.forum",
                      ),
                    }
                  : null);

              if (msg.role === "user") {
                return (
                  <div
                    key={msgKey}
                    className="flow-anim-fade-up flex flex-col items-end"
                  >
                    <div className="max-w-[85%] sm:max-w-[74%] rounded-[22px] rounded-br-md bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 px-4 py-3 text-[14px] leading-relaxed shadow-xs">
                      {msg.viaVoice && (
                        <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" x2="12" y1="19" y2="22" />
                          </svg>
                          <span>Voice note</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.timestamp && (
                      <span className="text-[10px] text-neutral-400 mt-1 px-1 tabular-nums">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={msgKey}
                  className="flow-anim-fade-up flex items-start gap-3"
                >
                  <div className="hidden sm:flex h-8 w-8 shrink-0 rounded-full bg-white dark:bg-[#161618] border border-neutral-200/80 dark:border-white/[0.1] items-center justify-center text-neutral-900 dark:text-white mt-0.5 shadow-2xs">
                    <FlowAiMascot size={15} />
                  </div>

                  <div className="min-w-0 flex-1 max-w-[94%] sm:max-w-[84%] space-y-2.5">
                    <div className="rounded-[22px] rounded-tl-md bg-white dark:bg-[#141414] border border-neutral-200/75 dark:border-white/[0.08] px-4.5 py-3.5 text-[14px] text-neutral-800 dark:text-neutral-200 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                      {renderFormattedAssistantText(msg.content)}

                      {/* Structured Action Card */}
                      {msg.card && (
                        <div className="mt-3.5 rounded-2xl bg-[#FAF8F5] dark:bg-[#1A1A1D] border border-neutral-200/80 dark:border-white/[0.08] p-4 text-neutral-900 dark:text-white">
                          {/* BALANCE_SUMMARY */}
                          {msg.card.type === "BALANCE_SUMMARY" && (
                            <div className="space-y-3">
                              <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-neutral-200/70 dark:border-white/[0.08]">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                    {msg.card.title || "Portfolio Balances"}
                                  </p>
                                  {typeof msg.card.data?.totalUsd === "string" &&
                                    msg.card.data.totalUsd !== "Live balance" && (
                                      <p className="mt-0.5 font-display text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white tabular-nums">
                                        {msg.card.data.totalUsd}
                                      </p>
                                    )}
                                </div>
                                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                  Synced
                                </span>
                              </div>

                              <div className="divide-y divide-neutral-200/60 dark:divide-white/[0.06]">
                                {Array.isArray(msg.card.data?.balances) &&
                                  msg.card.data.balances.map(
                                    (rawRow: Record<string, unknown>, bIdx: number) => {
                                      const row = parseBalanceRow(rawRow);
                                      return (
                                        <div
                                          key={bIdx}
                                          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <AssetAvatar
                                              symbol={row.symbol}
                                              size={28}
                                            />
                                            <div className="min-w-0">
                                              <p className="text-xs font-bold text-neutral-950 dark:text-white leading-tight">
                                                {row.symbol}
                                              </p>
                                              {row.networkName && (
                                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate leading-tight mt-0.5">
                                                  {row.networkName}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0 tabular-nums">
                                            <p className="text-xs font-bold font-mono text-neutral-950 dark:text-white">
                                              {row.balance} {row.symbol}
                                            </p>
                                            {row.usdValue && (
                                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                                {row.usdValue}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                              </div>

                              {accountId && (
                                <Link
                                  href="/app/receive"
                                  className="mt-1 block w-full py-2.5 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity"
                                >
                                  Add Money
                                </Link>
                              )}
                            </div>
                          )}

                          {/* SEND_PREVIEW */}
                          {msg.card.type === "SEND_PREVIEW" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-200/70 dark:border-white/[0.08]">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                  {msg.card.title || "Payment Preview"}
                                </span>
                                <span className="font-mono text-sm font-bold text-neutral-950 dark:text-white tabular-nums">
                                  {formatCompactAmount(
                                    String(msg.card.data?.amount ?? "0"),
                                    6,
                                  )}{" "}
                                  {String(msg.card.data?.assetSymbol ?? "")}
                                </span>
                              </div>

                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-neutral-500 dark:text-neutral-400">
                                    Route
                                  </span>
                                  <span className="font-medium text-right text-neutral-900 dark:text-neutral-100">
                                    {formatReadableNetwork(
                                      String(msg.card.data?.networkName ?? ""),
                                    )}
                                  </span>
                                </div>
                                {typeof msg.card.data?.recipientFlowId ===
                                  "string" &&
                                  msg.card.data.recipientFlowId && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-neutral-500 dark:text-neutral-400">
                                        FLOW ID
                                      </span>
                                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                        {msg.card.data.recipientFlowId}
                                      </span>
                                    </div>
                                  )}
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-neutral-500 dark:text-neutral-400">
                                    Destination
                                  </span>
                                  <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                                    {shortenHashOrAddress(
                                      String(
                                        msg.card.data?.recipientAddress ?? "",
                                      ),
                                    )}
                                  </span>
                                </div>
                                {typeof msg.card.data?.memo === "string" &&
                                  msg.card.data.memo && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-neutral-500 dark:text-neutral-400">
                                        Memo
                                      </span>
                                      <span className="text-right text-neutral-800 dark:text-neutral-200 truncate max-w-[200px]">
                                        {msg.card.data.memo}
                                      </span>
                                    </div>
                                  )}
                                {msg.card.data?.availableBalance !==
                                  undefined && (
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-neutral-500 dark:text-neutral-400">
                                      Available
                                    </span>
                                    <span className="font-mono text-neutral-700 dark:text-neutral-300 tabular-nums">
                                      {formatCompactAmount(
                                        String(msg.card.data.availableBalance),
                                      )}{" "}
                                      {String(msg.card.data?.assetSymbol ?? "")}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {liveTransfer ? (
                                <div className="pt-2">
                                  <PaymentTimelineTracker
                                    transfer={liveTransfer}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={
                                    isBusy || !msg.card.data?.sufficientBalance
                                  }
                                  onClick={() =>
                                    handleExecuteSend(msgKey, msg.card!.data)
                                  }
                                  className="mt-1 w-full py-2.5 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                                >
                                  {isBusy
                                    ? "Submitting Payment..."
                                    : msg.card.data?.sufficientBalance
                                      ? "Confirm & Send"
                                      : "Insufficient Balance"}
                                </button>
                              )}
                            </div>
                          )}

                          {/* PREVIEW_SWAP */}
                          {msg.card.type === "PREVIEW_SWAP" && (
                            <div className="space-y-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                {msg.card.title || "Conversion Preview"}
                              </p>
                              <p className="text-sm font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
                                {String(msg.card.data?.route || "")}
                              </p>
                              {Boolean(msg.card.data?.safetyNotice) && (
                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                                  {String(msg.card.data?.safetyNotice)}
                                </p>
                              )}

                              {liveTransfer ? (
                                <div className="pt-2">
                                  <PaymentTimelineTracker
                                    transfer={liveTransfer}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleExecuteConvert(msgKey, msg.card!.data)
                                  }
                                  className="w-full py-2.5 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                                >
                                  {isBusy
                                    ? "Submitting Conversion..."
                                    : "Confirm & Convert"}
                                </button>
                              )}
                            </div>
                          )}

                          {/* DRAFT_PAYMENT_LINK */}
                          {msg.card.type === "DRAFT_PAYMENT_LINK" && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                  Payment Link Draft
                                </span>
                                <span className="text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                                  {formatCompactAmount(
                                    String(msg.card.data?.amount || "0"),
                                  )}{" "}
                                  {String(msg.card.data?.assetSymbol || "")}
                                </span>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-sm font-semibold text-neutral-950 dark:text-white">
                                  {String(msg.card.data?.title || "")}
                                </p>
                                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                  Settles on{" "}
                                  {formatReadableNetwork(
                                    String(
                                      msg.card.data?.networkName ||
                                        msg.card.data?.network ||
                                        "",
                                    ),
                                  )}
                                </p>
                              </div>

                              {createdLink ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-[#141414] border border-emerald-500/30 px-3 py-2.5 text-[11px] font-mono">
                                  <a
                                    href={createdLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate text-emerald-700 dark:text-emerald-400 hover:underline"
                                  >
                                    {createdLink}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyText(`link-${msgKey}`, createdLink)
                                    }
                                    className="shrink-0 font-sans font-semibold text-neutral-800 dark:text-neutral-200 hover:underline cursor-pointer"
                                  >
                                    {copiedKey === `link-${msgKey}`
                                      ? "Copied"
                                      : "Copy"}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleCreatePaymentLink(
                                      msgKey,
                                      msg.card!.data,
                                    )
                                  }
                                  className="w-full py-2.5 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                                >
                                  {isBusy
                                    ? "Creating Payment Link..."
                                    : "Create Payment Link"}
                                </button>
                              )}
                            </div>
                          )}

                          {/* RECEIVE_ADDRESS */}
                          {msg.card.type === "RECEIVE_ADDRESS" && (
                            <div className="space-y-2.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                Deposit Addresses
                              </p>
                              <div className="space-y-2">
                                {Array.isArray(msg.card.data?.addresses) &&
                                  msg.card.data.addresses.map(
                                    (
                                      addr: {
                                        network?: string;
                                        address?: string;
                                      },
                                      aIdx: number,
                                    ) => (
                                      <div
                                        key={aIdx}
                                        className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-[#141414] border border-neutral-200/70 dark:border-white/[0.06] px-3 py-2.5 text-[11px]"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                                            {formatReadableNetwork(
                                              addr.network,
                                            )}
                                          </p>
                                          <p className="font-mono text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                                            {addr.address}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            copyText(
                                              `addr-${msgKey}-${aIdx}`,
                                              addr.address ?? "",
                                            )
                                          }
                                          className="shrink-0 font-semibold text-[#FF1A1A] hover:underline cursor-pointer"
                                        >
                                          {copiedKey ===
                                          `addr-${msgKey}-${aIdx}`
                                            ? "Copied"
                                            : "Copy"}
                                        </button>
                                      </div>
                                    ),
                                  )}
                              </div>
                            </div>
                          )}

                          {/* PAYMENT_STATUS */}
                          {msg.card.type === "PAYMENT_STATUS" && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                  {msg.card.title || "Payment Details"}
                                </span>
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  {String(msg.card.data?.status || "")}
                                </span>
                              </div>
                              <div className="space-y-1.5 text-xs pt-1 border-t border-neutral-200/70 dark:border-white/[0.06]">
                                {Boolean(msg.card.data?.amount) && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-neutral-500 dark:text-neutral-400">
                                      Amount
                                    </span>
                                    <span className="font-mono font-semibold text-neutral-950 dark:text-white tabular-nums">
                                      {String(msg.card.data?.amount)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-neutral-500 dark:text-neutral-400">
                                    Reference
                                  </span>
                                  <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                                    {shortenHashOrAddress(
                                      String(msg.card.data?.publicId || ""),
                                    )}
                                  </span>
                                </div>
                                {Boolean(msg.card.data?.settlementTxHash) && (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-neutral-500 dark:text-neutral-400">
                                      Tx Hash
                                    </span>
                                    <span className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                                      {shortenHashOrAddress(
                                        String(
                                          msg.card.data?.settlementTxHash,
                                        ),
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* DISPUTE_EMAIL */}
                          {msg.card.type === "DISPUTE_EMAIL" &&
                            (() => {
                              const draft = getDisputeDraft(
                                msgKey,
                                msg.card.data,
                              );
                              return (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-200/70 dark:border-white/[0.08]">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF1A1A]">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#FF1A1A]" />
                                      FLOW Support Dispute
                                    </span>
                                    <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                                      {String(
                                        msg.card.data?.supportEmail ||
                                          "flow@devhub.forum",
                                      )}
                                    </span>
                                  </div>

                                  {sentDispute ? (
                                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                                          Dispute sent to{" "}
                                          {sentDispute.supportEmail}
                                        </span>
                                        <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                          {sentDispute.referenceCode}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                                        Our team received your dispute and will
                                        reply directly to {userEmail}.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2.5">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                          <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                                            Subject
                                          </label>
                                          <TypewriterInput
                                            type="text"
                                            value={draft.subject}
                                            onChange={(e) =>
                                              updateDisputeDraft(
                                                msgKey,
                                                msg.card!.data,
                                                { subject: e.target.value },
                                              )
                                            }
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-950 dark:text-white focus:outline-hidden focus:border-neutral-900 dark:focus:border-white/30"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                                            Category
                                          </label>
                                          <select
                                            value={
                                              DISPUTE_CATEGORIES.includes(
                                                draft.category as (typeof DISPUTE_CATEGORIES)[number],
                                              )
                                                ? draft.category
                                                : "Account Support"
                                            }
                                            onChange={(e) =>
                                              updateDisputeDraft(
                                                msgKey,
                                                msg.card!.data,
                                                { category: e.target.value },
                                              )
                                            }
                                            className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-950 dark:text-white focus:outline-hidden cursor-pointer"
                                          >
                                            {DISPUTE_CATEGORIES.map((cat) => (
                                              <option key={cat} value={cat}>
                                                {cat}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      <div>
                                        <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                                          Transaction or Link Reference (Optional)
                                        </label>
                                        <TypewriterInput
                                          type="text"
                                          value={draft.transactionRef}
                                          onChange={(e) =>
                                            updateDisputeDraft(
                                              msgKey,
                                              msg.card!.data,
                                              {
                                                transactionRef: e.target.value,
                                              },
                                            )
                                          }
                                          placeholder="Tx hash, pa_..., or pr_..."
                                          className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:border-neutral-900 dark:focus:border-white/30"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                                          Dispute Message
                                        </label>
                                        <textarea
                                          rows={3}
                                          value={draft.message}
                                          onChange={(e) =>
                                            updateDisputeDraft(
                                              msgKey,
                                              msg.card!.data,
                                              { message: e.target.value },
                                            )
                                          }
                                          placeholder="Describe what happened..."
                                          className="w-full px-3 py-2 rounded-xl text-xs leading-relaxed bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:border-neutral-900 dark:focus:border-white/30 resize-none"
                                        />
                                      </div>

                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          handleSendDispute(
                                            msgKey,
                                            msg.id,
                                            msg.card!.data,
                                          )
                                        }
                                        className="w-full py-2.5 text-center text-xs font-semibold rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                                      >
                                        {isBusy
                                          ? "Sending Dispute..."
                                          : "Send Dispute to Support"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                          {cardErr && (
                            <p className="mt-2.5 text-xs font-medium text-[#FF1A1A] dark:text-red-400">
                              {cardErr}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.timestamp && (
                      <span className="block text-[10px] text-neutral-400 px-1 tabular-nums">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div
                role="status"
                aria-live="polite"
                aria-label="Flow AI is thinking"
                className="flow-anim-fade-up flex items-start gap-3"
              >
                <div className="hidden sm:flex h-8 w-8 shrink-0 rounded-full bg-white dark:bg-[#161618] border border-neutral-200/80 dark:border-white/[0.1] items-center justify-center text-neutral-900 dark:text-white mt-0.5 shadow-2xs">
                  <FlowAiMascot size={15} />
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-[22px] rounded-tl-md bg-white dark:bg-[#141414] border border-neutral-200/75 dark:border-white/[0.08] px-4 py-3.5 shadow-[0_2px_14px_rgba(0,0,0,0.03)]">
                  <span
                    className="flow-ai-think-dot h-2 w-2 rounded-full bg-neutral-800 dark:bg-neutral-200"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="flow-ai-think-dot h-2 w-2 rounded-full bg-neutral-800 dark:bg-neutral-200"
                    style={{ animationDelay: "180ms" }}
                  />
                  <span
                    className="flow-ai-think-dot h-2 w-2 rounded-full bg-neutral-800 dark:bg-neutral-200"
                    style={{ animationDelay: "360ms" }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Bottom Prompt Grid (Opening state) + Voice-Enabled Composer */}
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

          {voiceError && (
            <div
              role="alert"
              className="mb-2.5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/90 dark:bg-red-950/30 px-4 py-2 text-xs font-medium text-[#FF1A1A] dark:text-red-400 flex items-center justify-between gap-2"
            >
              <span>{voiceError}</span>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                aria-label="Dismiss voice error"
                className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {voiceState === "recording" ? (
            /* Live Voice Note Recording Bar */
            <div className="flex items-center justify-between gap-3 rounded-full bg-white dark:bg-[#141414] border border-[#FF1A1A]/40 shadow-[0_4px_24px_rgba(255,26,26,0.08)] pl-4 pr-2 py-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF1A1A] animate-pulse shrink-0" />
                <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-white tabular-nums shrink-0">
                  {Math.floor(recordingSeconds / 60)}:
                  {(recordingSeconds % 60).toString().padStart(2, "0")}
                </span>
                <div
                  className="flex items-center gap-1 h-6 flex-1 max-w-[180px]"
                  aria-hidden="true"
                >
                  {voiceBars.map((level, bIdx) => (
                    <span
                      key={bIdx}
                      style={{
                        height: `${Math.round(level * 22)}px`,
                      }}
                      className="w-1 rounded-full bg-[#FF1A1A]/80 transition-[height] duration-75"
                    />
                  ))}
                </div>
                <span className="hidden sm:inline text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  Listening…
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  aria-label="Cancel voice note"
                  title="Cancel"
                  className="h-9 px-3 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={stopAndSendVoice}
                  aria-label="Send voice note"
                  title="Send voice note"
                  className="h-9 w-9 rounded-full bg-[#FF1A1A] text-white hover:bg-[#E01515] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ) : voiceState === "transcribing" ? (
            <div className="flex items-center justify-center gap-2.5 rounded-full bg-white dark:bg-[#141414] border border-neutral-200/80 dark:border-white/[0.1] shadow-[0_4px_24px_rgba(0,0,0,0.05)] px-5 py-3 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-300 border-t-[#FF1A1A] animate-spin" />
              <span>Transcribing voice note…</span>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-[#141414] border border-neutral-200/80 dark:border-white/[0.1] shadow-[0_4px_24px_rgba(0,0,0,0.05)] pl-5 pr-2 py-2"
            >
              <TypewriterInput
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything or tap mic to speak"
                className="flex-1 py-1 bg-transparent text-sm text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden"
              />

              {/* Voice Note Mic Button */}
              <button
                type="button"
                disabled={loading}
                onClick={() => void startVoiceRecording()}
                aria-label="Record voice note"
                title="Voice note"
                className="h-9 w-9 rounded-full flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.08] hover:text-neutral-950 dark:hover:text-white transition-colors shrink-0 cursor-pointer disabled:opacity-40"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </button>

              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send query"
                className={`h-9 w-9 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                  input.trim() && !loading
                    ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90"
                    : "bg-neutral-300/80 text-white dark:bg-neutral-800 dark:text-neutral-500"
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
                  aria-hidden="true"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </main>

      {/* Synced Conversation History Slide-Over Drawer */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]"
          onClick={() => setHistoryOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Conversation history"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm h-full bg-white dark:bg-[#121214] border-l border-neutral-200 dark:border-white/[0.08] shadow-2xl flex flex-col"
          >
            <div className="px-5 py-4 border-b border-neutral-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                  Conversation History
                </h2>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Synced across your devices
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={resetToNewChat}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  New chat
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loadingHistory && conversations.length === 0 ? (
                <div className="space-y-2.5 p-2">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-1.5">
                  <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    No saved conversations yet
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Your Flow AI chats will appear here automatically.
                  </p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === conversationId;
                  const isLoadingThis = loadingThreadId === conv.id;
                  const isDeletingThis = deletingThreadId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => void openConversation(conv.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openConversation(conv.id);
                        }
                      }}
                      className={`group flex items-start justify-between gap-2 rounded-2xl px-3.5 py-3 transition-colors cursor-pointer ${
                        isActive
                          ? "bg-neutral-100 dark:bg-white/[0.09] border border-neutral-200/80 dark:border-white/[0.12]"
                          : "hover:bg-neutral-50 dark:hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-neutral-950 dark:text-white truncate">
                            {isLoadingThis ? "Loading…" : conv.title}
                          </p>
                          <span className="text-[10px] text-neutral-400 shrink-0 tabular-nums">
                            {formatRelativeDate(conv.updatedAt)}
                          </span>
                        </div>
                        {conv.preview && (
                          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {conv.preview}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={isDeletingThis}
                        onClick={(e) => void handleDeleteConversation(conv.id, e)}
                        aria-label={`Delete ${conv.title}`}
                        title="Delete conversation"
                        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-[#FF1A1A] hover:bg-red-50 dark:hover:bg-red-950/30 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
