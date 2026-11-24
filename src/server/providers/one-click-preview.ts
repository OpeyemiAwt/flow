import { createHash } from "node:crypto";
import { formatAtomicToDisplay } from "../../domain/atomic-amounts.ts";
import { decodeBase58 } from "../../domain/custody.ts";
import type { OneClickAppFee } from "../../domain/platform-fees.ts";
import {
  validateQuoteAddress,
  type QuoteNetwork,
} from "../../domain/quote-addresses.ts";
import {
  buildRateDescription,
  type IndicativeQuoteFeeBreakdown,
  type ProviderQuoteIdentity,
  type QuoteSwapType,
  type RouteAvailabilityStatus,
} from "../../domain/quote-discovery.ts";
import type { DiscoveredToken } from "./near-intents-discovery.ts";
import { fetchOneClickDryQuote } from "./one-click-adapter.ts";

export interface OneClickPreview {
  readonly identity: ProviderQuoteIdentity;
  readonly sourceDeploymentId: string;
  readonly destinationDeploymentId: string;
  readonly amountInAtomic: string;
  readonly amountOutAtomic: string;
  readonly sourceDisplayAmount: string;
  readonly recipientDisplayAmount: string;
  readonly sourceAmountUsd?: string | null;
  readonly recipientAmountUsd?: string | null;
  readonly minimumRecipientDisplayAmount: string | null;
  readonly rateDescription: string;
  readonly estimatedTimeSeconds: number | null;
  readonly fees: IndicativeQuoteFeeBreakdown;
  readonly canExecute: false;
}

export function validateProviderAddress(
  network: QuoteNetwork,
  address: string,
) {
  const syntax = validateQuoteAddress(network, address);
  if (!syntax.valid) return syntax;
  const value = address.trim();
  if (network.ecosystem === "solana" && decodeBase58(value)?.length !== 32) {
    return { valid: false, reason: "Enter a 32-byte Solana public key." };
  }
  if (network.networkKey === "tron-mainnet") {
    const bytes = decodeBase58(value);
    if (bytes?.length === 25 && bytes[0] === 0x41) {
      const payload = bytes.subarray(0, 21);
      const firstHash = createHash("sha256").update(payload).digest();
      const checksum = createHash("sha256")
        .update(firstHash)
        .digest()
        .subarray(0, 4);
      if (checksum.equals(bytes.subarray(21))) return syntax;
    }
    return { valid: false, reason: "Enter a valid Tron Base58Check address." };
  }
  return syntax;
}

export async function quoteOneClickPreview(input: {
  source: DiscoveredToken;
  destination: DiscoveredToken;
  operationId: string;
  amountAtomic: string;
  principalAmountAtomic?: string;
  platformFeeAtomic?: string;
  swapType: QuoteSwapType;
  refundTo: string;
  recipient: string;
  appFees?: readonly OneClickAppFee[];
  signal?: AbortSignal;
}): Promise<
  | {
      ok: true;
      quote: OneClickPreview;
      providerDeadline: string;
      correlationId: string | null;
      signature: string | null;
    }
  | { ok: false; routeStatus: RouteAvailabilityStatus; error: string }
> {
  const { source, destination, swapType, amountAtomic, operationId, signal } =
    input;
  const refundTo = input.refundTo.trim();
  const recipient = input.recipient.trim();
  if (
    source.isWrapped ||
    destination.isWrapped ||
    source.assetId === destination.assetId
  ) {
    return {
      ok: false,
      routeStatus: "UNSUPPORTED_PAIR",
      error: "The selected asset pair is unavailable for a provider quote.",
    };
  }
  const refund = validateProviderAddress(source, refundTo);
  const destinationAddress = validateProviderAddress(destination, recipient);
  if (!refund.valid || !destinationAddress.valid) {
    return {
      ok: false,
      routeStatus: "UNSUPPORTED_PAIR",
      error:
        refund.reason ?? destinationAddress.reason ?? "Invalid route address.",
    };
  }
  const result = await fetchOneClickDryQuote({
    originAsset: source.assetId,
    destinationAsset: destination.assetId,
    amountAtomic,
    swapType,
    refundTo,
    recipient,
    appFees: input.appFees,
    signal,
  });
  if (
    !result.ok ||
    !result.amountInAtomic ||
    !result.amountOutAtomic ||
    !result.quoteTimestamp ||
    !result.providerDeadline
  ) {
    let error = result.errorMessage ?? "Provider quote unavailable.";
    if (result.minRequiredAtomic) {
      try {
        const rawMin = formatAtomicToDisplay(
          result.minRequiredAtomic,
          source.decimals,
        );
        const dot = rawMin.indexOf(".");
        let minDisplay = rawMin;
        if (dot !== -1) {
          const intPart = rawMin.slice(0, dot);
          const fracPart = rawMin.slice(dot + 1);
          if (intPart !== "0") {
            const trimmed = fracPart.slice(0, 4).replace(/0+$/, "");
            minDisplay = trimmed ? `${intPart}.${trimmed}` : intPart;
          } else {
            const firstNonZero = fracPart.search(/[1-9]/);
            if (firstNonZero !== -1) {
              const cut = Math.min(fracPart.length, firstNonZero + 2);
              const trimmed = fracPart.slice(0, cut).replace(/0+$/, "");
              minDisplay = `0.${trimmed}`;
            }
          }
        }
        error = `Amount is too small for cross-chain transfer. Minimum for this route is ~${minDisplay} ${source.symbol}.`;
      } catch {
        error = "Amount is too small for this cross-chain route.";
      }
    }
    return {
      ok: false,
      routeStatus: result.routeStatus,
      error,
    };
  }

  const formatFee = (amount: string | null | undefined, decimals: number) =>
    amount == null ? null : formatAtomicToDisplay(amount, decimals);
  const refundFeeDisplay = formatFee(
    result.fees?.refundFeeAtomic,
    source.decimals,
  );
  const withdrawFeeDisplay = formatFee(
    result.fees?.withdrawFeeAtomic,
    destination.decimals,
  );
  const appFeeBps = result.fees?.appFeeBps ?? 0;
  const appFeePercent =
    appFeeBps > 0 ? `${Number((appFeeBps / 100).toFixed(2))}%` : null;
  const principalAtomic = input.principalAmountAtomic ?? result.amountInAtomic;
  const platformFeeAtomic =
    input.platformFeeAtomic && BigInt(input.platformFeeAtomic) > 0n
      ? input.platformFeeAtomic
      : null;
  const platformFeeDisplay = formatFee(platformFeeAtomic, source.decimals);
  const principalSourceDisplay = formatAtomicToDisplay(
    principalAtomic,
    source.decimals,
  );
  const totalSourceDisplay = formatAtomicToDisplay(
    result.amountInAtomic,
    source.decimals,
  );
  const feeDescription = [
    appFeePercent
      ? platformFeeDisplay
        ? `FLOW platform fee (${appFeePercent}: ${platformFeeDisplay} ${source.symbol})`
        : `Includes ${appFeePercent} FLOW platform fee`
      : null,
    withdrawFeeDisplay === null
      ? null
      : `Withdrawal fee ${withdrawFeeDisplay} ${destination.symbol}`,
    refundFeeDisplay === null
      ? null
      : `Refund fee if refunded ${refundFeeDisplay} ${source.symbol}`,
    "Network and solver fees are included in the quoted output.",
  ]
    .filter(Boolean)
    .join(". ");
  return {
    ok: true,
    providerDeadline: result.providerDeadline,
    correlationId: result.correlationId ?? null,
    signature: result.signature ?? null,
    quote: {
      identity: {
        operationId,
        originAsset: source.assetId,
        sourceNetwork: source.networkKey,
        destinationAsset: destination.assetId,
        destinationNetwork: destination.networkKey,
        amountAtomic,
        swapType,
        refundTo,
        recipient,
        timestamp: result.quoteTimestamp,
        expiresAt: new Date(
          Math.min(Date.parse(result.providerDeadline), Date.now() + 60_000),
        ).toISOString(),
      },
      sourceDeploymentId: source.id,
      destinationDeploymentId: destination.id,
      amountInAtomic: result.amountInAtomic,
      amountOutAtomic: result.amountOutAtomic,
      sourceDisplayAmount: totalSourceDisplay,
      recipientDisplayAmount: formatAtomicToDisplay(
        result.amountOutAtomic,
        destination.decimals,
      ),
      sourceAmountUsd: result.amountInUsd ?? null,
      recipientAmountUsd: result.amountOutUsd ?? null,
      minimumRecipientDisplayAmount: result.minAmountOutAtomic
        ? formatAtomicToDisplay(result.minAmountOutAtomic, destination.decimals)
        : null,
      rateDescription: buildRateDescription(
        source.symbol,
        source.decimals,
        principalAtomic,
        destination.symbol,
        destination.decimals,
        result.amountOutAtomic,
      ),
      estimatedTimeSeconds: result.timeEstimateSeconds ?? null,
      fees: {
        appFeeBps,
        platformFeeAtomic,
        platformFeeDisplay,
        platformFeeAssetSymbol: platformFeeDisplay === null ? null : source.symbol,
        principalSourceAtomic: principalAtomic,
        principalSourceDisplay,
        totalSourceAtomic: result.amountInAtomic,
        totalSourceDisplay,
        refundFeeAtomic: result.fees?.refundFeeAtomic ?? null,
        refundFeeDisplay,
        refundFeeAssetSymbol: refundFeeDisplay === null ? null : source.symbol,
        withdrawFeeAtomic: result.fees?.withdrawFeeAtomic ?? null,
        withdrawFeeDisplay,
        withdrawFeeAssetSymbol:
          withdrawFeeDisplay === null ? null : destination.symbol,
        isEstimate: true,
        description: feeDescription,
      },
      canExecute: false,
    },
  };
}
