"use client";

import { useEffect, useState } from "react";
import { SegmentedTabPill } from "./motion.tsx";
import type {
  DiscoveredToken,
  TokenCapability,
} from "../server/providers/near-intents-discovery.ts";
import { AssetAvatar, ChainBadge, NearIntentsBadge } from "./icons.tsx";

export interface UnifiedAssetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: DiscoveredToken) => void;
  title?: string;
  subtitle?: string;
  filterCapability?: TokenCapability;
  selectableIds?: readonly string[];
  excludeNearNative?: boolean;
  darkTheme?: boolean;
}

export function UnifiedAssetSelectorModal({
  isOpen,
  onClose,
  onSelectToken,
  title = "Pay with any token",
  subtitle,
  filterCapability,
  selectableIds,
  excludeNearNative = false,
  darkTheme = false,
}: UnifiedAssetSelectorModalProps) {
  const [tokens, setTokens] = useState<DiscoveredToken[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"ALL" | "STABLE" | "MAJOR" | "NEAR">(
    "ALL",
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function fetchTokens() {
      try {
        setLoading(true);
        const url = new URL("/api/tokens/discovery", window.location.origin);
        if (filterCapability) {
          url.searchParams.set("capability", filterCapability);
        }
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.ok) {
          setTokens(data.tokens || []);
        }
      } catch (err) {
        console.error("Failed to load discovery tokens:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchTokens();
    return () => {
      mounted = false;
    };
  }, [isOpen, filterCapability]);

  if (!isOpen) return null;

  const filtered = tokens.filter((t) => {
    if (
      excludeNearNative &&
      t.networkKey === "near-mainnet" &&
      t.symbol.toUpperCase() === "NEAR"
    ) {
      return false;
    }
    if (selectableIds && !selectableIds.includes(t.id)) return false;
    // Search filter
    const q = search.trim().toLowerCase();
    if (q) {
      const match =
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.networkName.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category filter
    if (category === "STABLE") {
      return (
        t.symbol.includes("USD") ||
        t.symbol.includes("DAI") ||
        t.symbol.includes("USDT") ||
        t.symbol.includes("USDC")
      );
    }
    if (category === "MAJOR") {
      return ["ETH", "SOL", "BTC", "NEAR", "USDC", "USDT"].includes(t.symbol);
    }
    if (category === "NEAR") {
      return t.networkKey.includes("near");
    }

    return true;
  });

  const isDark = darkTheme;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="flow-anim-backdrop fixed inset-0 bg-neutral-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-selector-title"
          className={`flow-anim-modal relative w-full max-w-lg rounded-[28px] border shadow-2xl p-6 overflow-hidden ${
            isDark
              ? "bg-[#121212] border-neutral-800 text-white"
              : "bg-white dark:bg-[#141414] border-neutral-200/90 dark:border-neutral-800 text-neutral-950 dark:text-white"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between pb-4 border-b ${
              isDark
                ? "border-neutral-800"
                : "border-neutral-100 dark:border-neutral-800"
            }`}
          >
            <div>
              <h2
                id="asset-selector-title"
                className="text-xl font-bold tracking-tight"
              >
                {title}
              </h2>
              <p
                className={`text-xs mt-0.5 ${
                  isDark
                    ? "text-neutral-400"
                    : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close token selector"
              className={`p-1.5 rounded-full transition-colors ${
                isDark
                  ? "text-neutral-400 hover:text-white hover:bg-neutral-800"
                  : "text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search bar */}
          <div className="my-4">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a token or network"
                className={`w-full px-4 py-2.5 pl-9 rounded-2xl text-xs border focus:outline-hidden ${
                  isDark
                    ? "bg-[#1e1e1e] border-neutral-700 text-white placeholder-neutral-500 focus:border-neutral-500"
                    : "bg-neutral-100 dark:bg-neutral-800 border-transparent text-neutral-950 dark:text-white focus:border-neutral-300 dark:focus:border-neutral-700"
                }`}
              />
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-3.5 text-neutral-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>

          {/* Filter Categories */}
          <div className="pb-3 overflow-x-auto no-scrollbar">
            <SegmentedTabPill
              tabs={[
                { id: "ALL", label: "All assets" },
                { id: "STABLE", label: "Stablecoins" },
                { id: "MAJOR", label: "Major tokens" },
                { id: "NEAR", label: "NEAR Ecosystem" },
              ] as const}
              activeTab={category}
              onChange={setCategory}
              size="sm"
            />
          </div>

          {/* Token List */}
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
            {loading ? (
              <div className="py-16 text-center text-xs text-neutral-400 animate-pulse">
                Loading assets and networks…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-xs text-neutral-400">
                No tokens found matching &quot;{search}&quot;.
              </div>
            ) : (
              filtered.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => {
                    onSelectToken(token);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                    isDark
                      ? "border-neutral-800/80 bg-[#161616] hover:bg-[#1f1f1f] hover:border-neutral-700"
                      : "border-neutral-100 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-[#181818] hover:bg-neutral-100/80 dark:hover:bg-[#202020] hover:border-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <AssetAvatar
                        symbol={token.symbol}
                        coingeckoId={token.coingeckoId}
                        size={28}
                      />
                      <div className="absolute -bottom-1 -right-1">
                        <ChainBadge chainKey={token.networkKey} size={14} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {token.symbol}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            isDark
                              ? "bg-neutral-800 text-neutral-300"
                              : "bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                          }`}
                        >
                          {token.networkName}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] truncate max-w-[200px] ${
                          isDark
                            ? "text-neutral-400"
                            : "text-neutral-500 dark:text-neutral-400"
                        }`}
                      >
                        {token.name}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {(() => {
                      const chain = token.networkName.toLowerCase();
                      const minUsd =
                        chain.includes("ethereum") || chain.includes("bitcoin")
                          ? 5
                          : 1;
                      if (token.priceUsd && token.priceUsd > 0) {
                        const rawMin = minUsd / token.priceUsd;
                        const formatted =
                          rawMin >= 100
                            ? Math.ceil(rawMin).toString()
                            : rawMin >= 1
                              ? rawMin.toFixed(2)
                              : rawMin >= 0.001
                                ? rawMin.toFixed(4)
                                : rawMin.toPrecision(2);
                        return (
                          <>
                            <p
                              className={`text-[11px] font-semibold tabular-nums ${
                                isDark
                                  ? "text-neutral-200"
                                  : "text-neutral-800 dark:text-neutral-200"
                              }`}
                            >
                              Min ~{formatted} {token.symbol}
                            </p>
                            <p
                              className={`text-[10px] tabular-nums ${
                                isDark
                                  ? "text-neutral-500"
                                  : "text-neutral-400 dark:text-neutral-500"
                              }`}
                            >
                              (~${minUsd} NEAR Intents)
                            </p>
                          </>
                        );
                      }
                      return (
                        <p
                          className={`text-[10px] font-medium ${
                            isDark
                              ? "text-neutral-400"
                              : "text-neutral-500 dark:text-neutral-400"
                          }`}
                        >
                          Min ~${minUsd}
                        </p>
                      );
                    })()}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer branding matching screenshot */}
          <div className="pt-3.5 mt-2 border-t border-neutral-100 dark:border-neutral-800 flex justify-center">
            <NearIntentsBadge />
          </div>
        </div>
      </div>
    </div>
  );
}
