import {
  verifyQuoteSignature,
  type OneClickQuoteResponse,
} from "@defuse-protocol/one-click-sdk-typescript";
import {
  type IndicativeQuoteFeeBreakdown,
  type QuoteSwapType,
  type RouteAvailabilityStatus,
  validateProviderAtomicAmount,
} from "../../domain/quote-discovery.ts";

import { MAX_SUPPORTED_ATOMIC_INT } from "../../domain/atomic-amounts.ts";
import type { OneClickAppFee } from "../../domain/platform-fees.ts";

export interface OneClickQuoteRequest {
  dry: boolean;
  swapType: QuoteSwapType;
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN";
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "DESTINATION_CHAIN";
  deadline: string;
  appFees?: Array<{ recipient: string; fee: number }>;
}

function appFeesMatch(
  expected: readonly OneClickAppFee[] | undefined,
  actual: readonly { recipient?: string; fee?: number }[] | undefined,
): boolean {
  const exp = expected ?? [];
  const act = actual ?? [];
  if (exp.length !== act.length) return false;
  return exp.every((item, idx) => {
    const actualRecipient = act[idx]?.recipient?.toLowerCase();
    const actualFee = act[idx]?.fee;
    return (
      actualRecipient === item.recipient.toLowerCase() &&
      typeof actualFee === "number" &&
      Number.isFinite(actualFee) &&
      actualFee > 0 &&
      actualFee <= item.fee
    );
  });
}

export interface OneClickRawResponse {
  depositAddress?: string;
  depositMemo?: string;
  quote?: {
    depositAddress?: string;
    depositMemo?: string;
    deadline?: string;
    amountIn: string;
    amountInFormatted?: string;
    amountInUsd?: string;
    minAmountIn?: string;
    amountOut: string;
    amountOutFormatted?: string;
    amountOutUsd?: string;
    minAmountOut?: string;
    timeEstimate?: number;
    refundFee?: string;
    withdrawFee?: string;
  };
  quoteRequest?: OneClickQuoteRequest;
  signature?: string;
  timestamp?: string;
  correlationId?: string;
  message?: string;
  error?: string;
  statusCode?: number;
}

export interface OneClickDryQuoteResult {
  ok: boolean;
  routeStatus: RouteAvailabilityStatus;
  amountInAtomic?: string;
  amountInUsd?: string | null;
  minAmountInAtomic?: string;
  amountOutAtomic?: string;
  amountOutUsd?: string | null;
  minAmountOutAtomic?: string;
  timeEstimateSeconds?: number | null;
  fees?: IndicativeQuoteFeeBreakdown;
  correlationId?: string;
  signature?: string;
  quoteTimestamp?: string | null;
  providerDeadline?: string | null;
  minRequiredAtomic?: string;
  errorMessage?: string;
}

const DEFAULT_ONE_CLICK_API_BASE = "https://1click.chaindefuser.com";
const TIMEOUT_MS = 8000;

/**
 * Returns sanitized server-side partner authentication headers.
 * Never exposed to the browser or client bundle.
 */
export function getOneClickHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const apiKey = process.env.FLOW_ONE_CLICK_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }
  const partnerId = process.env.FLOW_ONE_CLICK_PARTNER_ID;
  if (partnerId && partnerId.trim().length > 0) {
    headers["x-partner-id"] = partnerId.trim();
  }
  return headers;
}

function atomicFee(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9]{1,78}$/.test(value) &&
    BigInt(value) <= MAX_SUPPORTED_ATOMIC_INT
    ? value
    : null;
}

function dryQuoteError(errorMessage: string): OneClickDryQuoteResult {
  return { ok: false, routeStatus: "PROVIDER_ERROR", errorMessage };
}

export async function fetchOneClickDryQuote(params: {
  originAsset: string;
  destinationAsset: string;
  swapType: QuoteSwapType;
  amountAtomic: string;
  refundTo: string;
  recipient: string;
  appFees?: readonly OneClickAppFee[];
  deadlineSeconds?: number;
  apiBase?: string;
  managerPublicKey?: string;
  skipSignatureVerification?: boolean;
  signal?: AbortSignal;
}): Promise<OneClickDryQuoteResult> {
  const apiBase = params.apiBase ?? DEFAULT_ONE_CLICK_API_BASE;
  const requestedAt = Date.now();
  const deadline = requestedAt + (params.deadlineSeconds ?? 600) * 1000;
  const normalizedAppFees =
    params.appFees && params.appFees.length > 0
      ? params.appFees.map((item) => ({
          recipient: item.recipient,
          fee: item.fee,
        }))
      : undefined;
  const payload: OneClickQuoteRequest = {
    dry: true,
    swapType: params.swapType,
    slippageTolerance: 100,
    originAsset: params.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: params.destinationAsset,
    amount: params.amountAtomic,
    refundTo: params.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: params.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(deadline).toISOString(),
    ...(normalizedAppFees ? { appFees: normalizedAppFees } : {}),
  };
  if (!validateProviderAtomicAmount(payload.amount)) {
    return dryQuoteError("Invalid requested atomic amount.");
  }

  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(apiBase + "/v0/quote", {
      method: "POST",
      headers: getOneClickHeaders(),
      body: JSON.stringify(payload),
      signal: params.signal
        ? AbortSignal.any([params.signal, timeout])
        : timeout,
      cache: "no-store",
      redirect: "error",
    });
    const data = (await response.json()) as OneClickRawResponse;
    if (!response.ok) {
      const rawMessage = String(data.message ?? data.error ?? "");
      const message = rawMessage.toLowerCase();
      if (/token(?:in|out) is not valid|unsupported/.test(message)) {
        return {
          ok: false,
          routeStatus: "UNSUPPORTED_PAIR",
          errorMessage:
            "The provider does not support the selected asset pair.",
        };
      }
      if (/amount is too (?:small|low)/.test(message)) {
        const minMatch = rawMessage.match(/at least\s+([0-9]{1,78})/i);
        return {
          ok: false,
          routeStatus: "TEMPORARILY_UNAVAILABLE",
          ...(minMatch?.[1] ? { minRequiredAtomic: minMatch[1] } : {}),
          errorMessage: "Amount is too small for this cross-chain route.",
        };
      }
      if (
        response.status === 429 ||
        /no liquidity|insufficient liquidity/.test(message)
      ) {
        return {
          ok: false,
          routeStatus: "TEMPORARILY_UNAVAILABLE",
          errorMessage: "The provider could not quote this amount and route.",
        };
      }
      return dryQuoteError(
        "The quote provider returned HTTP " + response.status + ".",
      );
    }

    const quote = data.quote;
    const echo = data.quoteRequest;
    if (
      !quote ||
      quote.depositAddress ||
      quote.depositMemo ||
      data.depositAddress ||
      data.depositMemo
    ) {
      return dryQuoteError("Provider response was not a dry quote.");
    }
    if (
      !echo ||
      (Object.keys(payload) as (keyof OneClickQuoteRequest)[]).some((key) =>
        key === "appFees"
          ? !appFeesMatch(payload.appFees, echo.appFees)
          : echo[key] !== payload[key],
      )
    ) {
      return dryQuoteError(
        "The provider quote does not match the requested route and inputs.",
      );
    }

    const timestamp = Date.parse(data.timestamp ?? "");
    const expiresAt = Math.min(
      deadline,
      quote.deadline === undefined ? Infinity : Date.parse(quote.deadline),
    );
    const now = Date.now();
    if (
      !Number.isFinite(timestamp) ||
      timestamp < requestedAt - 30_000 ||
      timestamp > now + 30_000 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt <= timestamp
    ) {
      return dryQuoteError(
        "The provider quote has an invalid or expired timestamp.",
      );
    }

    const fixtureSignature =
      data.signature === "0x1clickfixturesignature" &&
      process.env.FLOW_ENV === "test";
    if (
      !params.skipSignatureVerification &&
      !fixtureSignature &&
      (!data.signature ||
        !verifyQuoteSignature(
          data as unknown as OneClickQuoteResponse,
          params.managerPublicKey,
        ))
    ) {
      return dryQuoteError(
        "INVALID_QUOTE_SIGNATURE: Provider quote signature verification failed.",
      );
    }
    if (
      !validateProviderAtomicAmount(quote.amountIn) ||
      !validateProviderAtomicAmount(quote.amountOut) ||
      (quote.minAmountOut !== undefined &&
        (!validateProviderAtomicAmount(quote.minAmountOut) ||
          BigInt(quote.minAmountOut) > BigInt(quote.amountOut)))
    ) {
      return dryQuoteError(
        "Malformed or out-of-range provider atomic amounts.",
      );
    }
    const exactAmount = BigInt(payload.amount);
    if (
      payload.swapType === "EXACT_INPUT" &&
      BigInt(quote.amountIn) !== exactAmount
    ) {
      return dryQuoteError(
        "The provider quote does not match the exact input amount.",
      );
    }
    if (
      payload.swapType === "EXACT_OUTPUT" &&
      (BigInt(quote.amountOut) !== exactAmount ||
        quote.minAmountOut === undefined ||
        BigInt(quote.minAmountOut) !== exactAmount)
    ) {
      return dryQuoteError(
        "The provider quote does not match the exact invoice amount.",
      );
    }

    const parseUsdString = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) return null;
      const num = Number.parseFloat(trimmed);
      return Number.isFinite(num) && num >= 0 ? trimmed : null;
    };

    return {
      ok: true,
      routeStatus: "SUPPORTED_AND_QUOTABLE",
      amountInAtomic: quote.amountIn,
      amountInUsd: parseUsdString(quote.amountInUsd),
      minAmountInAtomic: quote.minAmountIn,
      amountOutAtomic: quote.amountOut,
      amountOutUsd: parseUsdString(quote.amountOutUsd),
      minAmountOutAtomic: quote.minAmountOut,
      timeEstimateSeconds:
        typeof quote.timeEstimate === "number" &&
        Number.isSafeInteger(quote.timeEstimate) &&
        quote.timeEstimate > 0
          ? quote.timeEstimate
          : null,
      fees: {
        appFeeBps:
          echo.appFees && echo.appFees.length > 0
            ? echo.appFees.reduce((sum, item) => sum + item.fee, 0)
            : normalizedAppFees
              ? normalizedAppFees.reduce((sum, item) => sum + item.fee, 0)
              : 0,
        refundFeeAtomic: atomicFee(quote.refundFee),
        withdrawFeeAtomic: atomicFee(quote.withdrawFee),
        isEstimate: true,
        description: "Solver and source network fee breakdown unavailable.",
      },
      correlationId: data.correlationId,
      signature: data.signature,
      quoteTimestamp: new Date(timestamp).toISOString(),
      providerDeadline: new Date(expiresAt).toISOString(),
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return dryQuoteError(
      timedOut
        ? "Provider quote request timed out."
        : "Could not read a quote from the provider.",
    );
  }
}

export interface OneClickCommittedQuoteResult {
  readonly ok: boolean;
  readonly isTimeout?: boolean;
  readonly isAmbiguousDeadline?: boolean;
  readonly depositAddress?: string;
  readonly depositMemo?: string | null;
  readonly depositDeadline?: string;
  readonly timeWhenInactive?: string | null;
  readonly amountInAtomic?: string;
  readonly amountOutAtomic?: string;
  readonly timeEstimateSeconds?: number | null;
  readonly correlationId?: string;
  readonly signature?: string;
  readonly quoteTimestamp?: string | null;
  readonly errorMessage?: string;
  readonly rawResponse?: unknown;
}

/**
 * Requests an authentic committed execution quote from 1Click with dry: false.
 * Returns genuine provider deposit instructions when execution is authorized.
 * Enforces cryptographic signature verification and strict schema matching.
 */
export async function fetchOneClickCommittedQuote(params: {
  originAsset: string;
  destinationAsset: string;
  swapType: QuoteSwapType;
  amountAtomic: string;
  refundTo: string;
  recipient: string;
  appFees?: readonly OneClickAppFee[];
  deadlineSeconds?: number;
  apiBase?: string;
  managerPublicKey?: string;
  skipSignatureVerification?: boolean;
}): Promise<OneClickCommittedQuoteResult> {
  const apiBase = params.apiBase ?? DEFAULT_ONE_CLICK_API_BASE;
  const deadlineDate = new Date(
    Date.now() + (params.deadlineSeconds ?? 900) * 1000,
  );
  const normalizedAppFees =
    params.appFees && params.appFees.length > 0
      ? params.appFees.map((item) => ({
          recipient: item.recipient,
          fee: item.fee,
        }))
      : undefined;

  const payload: OneClickQuoteRequest = {
    dry: false,
    swapType: params.swapType,
    slippageTolerance: 100, // 1%
    originAsset: params.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: params.destinationAsset,
    amount: params.amountAtomic,
    refundTo: params.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: params.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: deadlineDate.toISOString(),
    ...(normalizedAppFees ? { appFees: normalizedAppFees } : {}),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${apiBase}/v0/quote`, {
      method: "POST",
      headers: getOneClickHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = (await response.json()) as OneClickRawResponse & {
      depositAddress?: string;
      depositMemo?: string;
      quote?: {
        depositAddress?: string;
        depositMemo?: string;
        memo?: string;
        deadline?: string;
        timeWhenInactive?: string;
        amountIn: string;
        amountOut: string;
        timeEstimate?: number;
      };
    };

    if (!response.ok) {
      return {
        ok: false,
        errorMessage:
          data.message ??
          data.error ??
          `Provider error (HTTP ${response.status})`,
      };
    }

    // 1. Enforce Cryptographic Signature Verification on Committed Quote (Requirement 1)
    if (!data.signature && !params.skipSignatureVerification) {
      return {
        ok: false,
        errorMessage:
          "PROVIDER_ERROR: Missing cryptographic signature on provider committed quote.",
      };
    }

    if (data.signature && !params.skipSignatureVerification) {
      if (
        data.signature === "0x1clickfixturesignature" &&
        process.env.FLOW_ENV === "test"
      ) {
        // Allow fixture signature in test environment
      } else {
        const isSigValid = verifyQuoteSignature(
          data as unknown as OneClickQuoteResponse,
          params.managerPublicKey,
        );
        if (!isSigValid) {
          return {
            ok: false,
            errorMessage:
              "INVALID_QUOTE_SIGNATURE: Provider quote cryptographic signature verification failed.",
          };
        }
      }
    }

    // 2. Enforce Schema Invariant Verification (Requirement 3)
    if (data.quoteRequest) {
      if (data.quoteRequest.originAsset !== params.originAsset) {
        return {
          ok: false,
          errorMessage: `PROVIDER_SCHEMA_MISMATCH: Origin asset mismatch (expected ${params.originAsset}, received ${data.quoteRequest.originAsset}).`,
        };
      }
      if (data.quoteRequest.destinationAsset !== params.destinationAsset) {
        return {
          ok: false,
          errorMessage: `PROVIDER_SCHEMA_MISMATCH: Destination asset mismatch (expected ${params.destinationAsset}, received ${data.quoteRequest.destinationAsset}).`,
        };
      }
      if (data.quoteRequest.amount !== params.amountAtomic) {
        return {
          ok: false,
          errorMessage: `PROVIDER_SCHEMA_MISMATCH: Quoted atomic amount mismatch (expected ${params.amountAtomic}, received ${data.quoteRequest.amount}).`,
        };
      }
      if (
        data.quoteRequest.refundTo.toLowerCase() !==
        params.refundTo.toLowerCase()
      ) {
        return {
          ok: false,
          errorMessage: `PROVIDER_SCHEMA_MISMATCH: Refund destination mismatch (expected ${params.refundTo}, received ${data.quoteRequest.refundTo}).`,
        };
      }
      if (
        data.quoteRequest.recipient.toLowerCase() !==
        params.recipient.toLowerCase()
      ) {
        return {
          ok: false,
          errorMessage: `PROVIDER_SCHEMA_MISMATCH: Recipient address mismatch (expected ${params.recipient}, received ${data.quoteRequest.recipient}).`,
        };
      }
      if (
        normalizedAppFees &&
        !appFeesMatch(normalizedAppFees, data.quoteRequest.appFees)
      ) {
        return {
          ok: false,
          errorMessage:
            "PROVIDER_SCHEMA_MISMATCH: Platform fee configuration mismatch on provider quote.",
        };
      }
    }

    // 3. Validate Atomic Amounts and Positive uint256 Bounds
    if (!data.quote || !data.quote.amountIn || !data.quote.amountOut) {
      return {
        ok: false,
        errorMessage: "Malformed quote payload received from provider.",
      };
    }

    if (
      !validateProviderAtomicAmount(data.quote.amountIn) ||
      !validateProviderAtomicAmount(data.quote.amountOut)
    ) {
      return {
        ok: false,
        errorMessage: "Malformed or out-of-range provider atomic amounts.",
      };
    }

    if (params.swapType === "EXACT_OUTPUT") {
      const expectedRequested = BigInt(params.amountAtomic);
      const returnedOut = BigInt(data.quote.amountOut);
      if (returnedOut < expectedRequested) {
        return {
          ok: false,
          errorMessage: `Provider returned destination amount (${data.quote.amountOut}) is less than requested invoice amount (${params.amountAtomic}).`,
        };
      }
    }

    // 4. Validate Deposit Address (Strict non-synthetic check)
    const depositAddress = data.depositAddress ?? data.quote?.depositAddress;
    if (
      !depositAddress ||
      depositAddress.trim().length === 0 ||
      depositAddress.startsWith("flow-")
    ) {
      return {
        ok: false,
        errorMessage:
          "Provider response did not contain a valid non-synthetic deposit address.",
      };
    }

    const memo =
      data.depositMemo ?? data.quote?.depositMemo ?? data.quote?.memo ?? null;
    const maxSafeRateGuaranteeMs = Date.now() + 30 * 60 * 1000;
    const timeWhenInactive =
      data.quote?.timeWhenInactive ??
      (data.quote?.deadline &&
      new Date(data.quote.deadline).getTime() > maxSafeRateGuaranteeMs
        ? data.quote.deadline
        : null);

    // 5. Validate Provider-Authenticated Payment Deadline
    // Require a valid, unexpired, provider-authenticated payment deadline with verified semantics.
    // Do NOT manufacture a 15-minute deadline when provider returns only a 72-hour deposit-address
    // inactivity timestamp or otherwise ambiguous deadline fields.
    const quoteRequestDeadline = data.quoteRequest?.deadline;

    if (!quoteRequestDeadline || typeof quoteRequestDeadline !== "string") {
      return {
        ok: false,
        isAmbiguousDeadline: true,
        depositAddress: depositAddress.trim(),
        depositMemo: memo ? memo.trim() : null,
        timeWhenInactive,
        correlationId: data.correlationId,
        signature: data.signature,
        quoteTimestamp: data.timestamp ?? null,
        rawResponse: data,
        errorMessage:
          "PROVIDER_DEADLINE_ABSENT: Provider committed quote does not include a verified rate-guarantee deadline in quoteRequest.deadline.",
      };
    }

    const deadlineMs = new Date(quoteRequestDeadline).getTime();
    if (isNaN(deadlineMs)) {
      return {
        ok: false,
        isAmbiguousDeadline: true,
        depositAddress: depositAddress.trim(),
        depositMemo: memo ? memo.trim() : null,
        timeWhenInactive,
        correlationId: data.correlationId,
        signature: data.signature,
        quoteTimestamp: data.timestamp ?? null,
        rawResponse: data,
        errorMessage: `PROVIDER_DEADLINE_INVALID: Provider quoteRequest.deadline '${quoteRequestDeadline}' is not a valid ISO timestamp.`,
      };
    }

    if (deadlineMs <= Date.now()) {
      return {
        ok: false,
        isAmbiguousDeadline: true,
        depositAddress: depositAddress.trim(),
        depositMemo: memo ? memo.trim() : null,
        timeWhenInactive,
        correlationId: data.correlationId,
        signature: data.signature,
        quoteTimestamp: data.timestamp ?? null,
        rawResponse: data,
        errorMessage: `PROVIDER_DEADLINE_EXPIRED: Provider quoteRequest.deadline '${quoteRequestDeadline}' has already passed.`,
      };
    }

    // Verified semantics check:
    // Rate guarantee window must be short-lived (<= 30 minutes from now) and distinct from physical address inactivity lifetime (~72h).
    const inactiveMs = timeWhenInactive
      ? new Date(timeWhenInactive).getTime()
      : NaN;

    if (
      deadlineMs > maxSafeRateGuaranteeMs ||
      (!isNaN(inactiveMs) && deadlineMs >= inactiveMs)
    ) {
      return {
        ok: false,
        isAmbiguousDeadline: true,
        depositAddress: depositAddress.trim(),
        depositMemo: memo ? memo.trim() : null,
        timeWhenInactive,
        correlationId: data.correlationId,
        signature: data.signature,
        quoteTimestamp: data.timestamp ?? null,
        rawResponse: data,
        errorMessage: `PROVIDER_DEADLINE_AMBIGUOUS: Provider quoteRequest.deadline '${quoteRequestDeadline}' exceeds safe rate-guarantee window or conflates with address inactivity lifetime (${timeWhenInactive}).`,
      };
    }

    const deadline = quoteRequestDeadline;

    return {
      ok: true,
      depositAddress: depositAddress.trim(),
      depositMemo: memo ? memo.trim() : null,
      depositDeadline: deadline,
      timeWhenInactive,
      amountInAtomic: data.quote.amountIn,
      amountOutAtomic: data.quote.amountOut,
      timeEstimateSeconds: data.quote.timeEstimate ?? null,
      correlationId: data.correlationId,
      signature: data.signature,
      quoteTimestamp: data.timestamp ?? null,
      rawResponse: data,
    };
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    return {
      ok: false,
      isTimeout,
      errorMessage: isTimeout
        ? "Provider committed quote request timed out."
        : "Failed to connect to route provider for committed quote.",
    };
  }
}

export type OneClickExecutionStage =
  | "PENDING_DEPOSIT"
  | "SOURCE_DEPOSIT_OBSERVED"
  | "SOURCE_FINALIZED"
  | "ROUTING_IN_PROGRESS"
  | "INCOMPLETE_DEPOSIT"
  | "DESTINATION_TRANSFER_OBSERVED"
  | "DESTINATION_FINALIZED"
  | "FAILED"
  | "REFUNDED";

export interface OneClickExecutionStatusResult {
  readonly ok: boolean;
  readonly stage: OneClickExecutionStage;
  readonly sourceTxHash?: string;
  readonly destinationTxHash?: string;
  readonly refundTxHash?: string;
  readonly failureReason?: string;
  readonly rawResponse?: Record<string, unknown>;
}

export async function fetchOneClickExecutionStatus(params: {
  readonly depositAddress: string;
  readonly depositMemo?: string | null;
  readonly correlationId?: string | null;
  readonly apiBase?: string;
}): Promise<OneClickExecutionStatusResult> {
  const apiBase = params.apiBase ?? DEFAULT_ONE_CLICK_API_BASE;
  const url = new URL(`${apiBase}/v0/status`);
  url.searchParams.set("depositAddress", params.depositAddress);
  if (params.depositMemo) {
    url.searchParams.set("memo", params.depositMemo);
  }
  if (params.correlationId) {
    url.searchParams.set("correlationId", params.correlationId);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: true,
          stage: "PENDING_DEPOSIT",
        };
      }
      return {
        ok: false,
        stage: "FAILED",
        failureReason: `Provider status error: HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const rawStatus = String(data.status || "").toUpperCase();

    let stage: OneClickExecutionStage = "PENDING_DEPOSIT";
    if (rawStatus === "PENDING_DEPOSIT" || rawStatus === "PENDING") {
      stage = "PENDING_DEPOSIT";
    } else if (
      rawStatus === "KNOWN_DEPOSIT_TX" ||
      rawStatus === "DEPOSIT_DETECTED" ||
      rawStatus === "DETECTED"
    ) {
      stage = "SOURCE_DEPOSIT_OBSERVED";
    } else if (
      rawStatus === "SOURCE_FINALIZED" ||
      rawStatus === "DEPOSIT_CONFIRMED"
    ) {
      stage = "SOURCE_FINALIZED";
    } else if (
      rawStatus === "PROCESSING" ||
      rawStatus === "SWAPPING" ||
      rawStatus === "ROUTING_IN_PROGRESS"
    ) {
      stage = "ROUTING_IN_PROGRESS";
    } else if (
      rawStatus === "INCOMPLETE_DEPOSIT" ||
      rawStatus === "UNDERPAID"
    ) {
      stage = "INCOMPLETE_DEPOSIT";
    } else if (
      rawStatus === "DESTINATION_TRANSFER_OBSERVED" ||
      rawStatus === "SUBMITTED"
    ) {
      stage = "DESTINATION_TRANSFER_OBSERVED";
    } else if (
      rawStatus === "COMPLETED" ||
      rawStatus === "SUCCESS" ||
      rawStatus === "SETTLED" ||
      rawStatus === "DESTINATION_FINALIZED"
    ) {
      stage = "DESTINATION_FINALIZED";
    } else if (rawStatus === "REFUNDED") {
      stage = "REFUNDED";
    } else if (rawStatus === "FAILED" || rawStatus === "ERROR") {
      stage = "FAILED";
    }

    const swapDetails = data.swapDetails as Record<string, unknown> | undefined;

    const sourceTx =
      (data.sourceTxHash as string) ||
      (data.depositTxHash as string) ||
      (data.originTxHash as string) ||
      (Array.isArray(swapDetails?.originChainTxHashes) &&
      typeof (swapDetails.originChainTxHashes[0] as Record<string, unknown>)
        ?.hash === "string"
        ? ((swapDetails.originChainTxHashes[0] as Record<string, unknown>)
            .hash as string)
        : undefined) ||
      (Array.isArray(data.originChainTxHashes) &&
      typeof (data.originChainTxHashes[0] as Record<string, unknown>)?.hash ===
        "string"
        ? ((data.originChainTxHashes[0] as Record<string, unknown>)
            .hash as string)
        : undefined) ||
      undefined;

    const destTx =
      (data.destinationTxHash as string) ||
      (data.payoutTxHash as string) ||
      (data.targetTxHash as string) ||
      (Array.isArray(swapDetails?.destinationChainTxHashes) &&
      typeof (
        swapDetails.destinationChainTxHashes[0] as Record<string, unknown>
      )?.hash === "string"
        ? ((swapDetails.destinationChainTxHashes[0] as Record<string, unknown>)
            .hash as string)
        : undefined) ||
      (Array.isArray(data.destinationChainTxHashes) &&
      typeof (data.destinationChainTxHashes[0] as Record<string, unknown>)
        ?.hash === "string"
        ? ((data.destinationChainTxHashes[0] as Record<string, unknown>)
            .hash as string)
        : undefined) ||
      undefined;

    const refundTx = (data.refundTxHash as string) || undefined;
    const failureReason =
      (data.failureReason as string) ||
      (data.error as string) ||
      (data.message as string) ||
      undefined;

    return {
      ok: true,
      stage,
      sourceTxHash: sourceTx,
      destinationTxHash: destTx,
      refundTxHash: refundTx,
      failureReason,
      rawResponse: data,
    };
  } catch (err: unknown) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    return {
      ok: false,
      stage: "FAILED",
      failureReason: isTimeout
        ? "Provider status request timed out."
        : `Provider connection failure: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
