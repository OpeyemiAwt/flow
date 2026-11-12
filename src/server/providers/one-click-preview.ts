import { createHash } from "node:crypto";
import { formatAtomicToDisplay } from "../../domain/atomic-amounts.ts";
import { decodeBase58 } from "../../domain/custody.ts";
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
  swapType: QuoteSwapType;
  refundTo: string;
  recipient: string;
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
    signal,
  });
  if (
    !result.ok ||
    !result.amountInAtomic ||
    !result.amountOutAtomic ||
    !result.quoteTimestamp ||
    !result.providerDeadline
  ) {
    return {
      ok: false,
      routeStatus: result.routeStatus,
      error: result.errorMessage ?? "Provider quote unavailable.",
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
  const feeDescription = [
    withdrawFeeDisplay === null
      ? null
      : `Withdrawal fee ${withdrawFeeDisplay} ${destination.symbol}`,
    refundFeeDisplay === null
      ? null
      : `Refund fee if refunded ${refundFeeDisplay} ${source.symbol}`,
    "Source network and solver fee breakdown unavailable.",
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
      sourceDisplayAmount: formatAtomicToDisplay(
        result.amountInAtomic,
        source.decimals,
      ),
      recipientDisplayAmount: formatAtomicToDisplay(
        result.amountOutAtomic,
        destination.decimals,
      ),
      minimumRecipientDisplayAmount: result.minAmountOutAtomic
        ? formatAtomicToDisplay(result.minAmountOutAtomic, destination.decimals)
        : null,
      rateDescription: buildRateDescription(
        source.symbol,
        source.decimals,
        result.amountInAtomic,
        destination.symbol,
        destination.decimals,
        result.amountOutAtomic,
      ),
      estimatedTimeSeconds: result.timeEstimateSeconds ?? null,
      fees: {
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
