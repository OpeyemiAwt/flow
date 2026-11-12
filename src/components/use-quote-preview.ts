"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PreviewState<T> {
  readonly key: string | null;
  readonly quote: T | null;
  readonly error: string | null;
  readonly loading: boolean;
}

export function useQuotePreview<T>(key: string | null) {
  const [state, setState] = useState<PreviewState<T>>({
    key,
    quote: null,
    error: null,
    loading: false,
  });
  const controller = useRef<AbortController | null>(null);
  const matches = state.key === key;
  if (!matches) {
    setState({ key, quote: null, error: null, loading: false });
  }

  useEffect(() => () => controller.current?.abort(), [key]);

  const load = useCallback(
    async (
      request: (
        signal: AbortSignal,
      ) => Promise<{ quote: T; expiresAt: string }>,
    ) => {
      if (!key) return;
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      setState({ key, quote: null, error: null, loading: true });
      try {
        const { quote, expiresAt } = await request(active.signal);
        if (active.signal.aborted) return;
        const expiresIn = Date.parse(expiresAt) - Date.now();
        if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
          throw new Error("The quote has expired.");
        }
        const current = { key, quote, error: null, loading: false };
        setState(current);
        const timer = window.setTimeout(() => {
          setState((state) =>
            state === current
              ? {
                  key,
                  quote: null,
                  error: "The quote has expired.",
                  loading: false,
                }
              : state,
          );
        }, expiresIn);
        active.signal.addEventListener(
          "abort",
          () => window.clearTimeout(timer),
          { once: true },
        );
      } catch (error) {
        if (active.signal.aborted) return;
        setState({
          key,
          quote: null,
          error: error instanceof Error ? error.message : "Quote unavailable.",
          loading: false,
        });
      }
    },
    [key],
  );

  return {
    quote: matches ? state.quote : null,
    error: matches ? state.error : null,
    loading: matches && state.loading,
    load,
  };
}
