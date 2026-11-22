import { z } from "zod";
import {
  type IndicativeQuote,
  generatePaymentAttemptPublicId,
  isBannedIllustrativeAddress,
  validateProviderAtomicAmount,
} from "../domain/quote-discovery.ts";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import { isValidPublicPaymentId } from "../domain/payment-requests.ts";
import {
  canonicalizeNetworkId,
  isSamePaymentDeployment,
} from "../domain/supported-assets-catalog.ts";
import { isFinancialExecutionDisabled } from "../domain/custody.ts";
import { supportsQuoteAddress } from "../domain/quote-addresses.ts";
import {
  readPaymentRequestFeePayer,
  readPaymentRequestUsage,
  readPaymentWalletAddresses,
} from "./payment-requests.ts";
import { clientBudget } from "./auth/limits.ts";
import { ApiFailure, reply } from "./http.ts";
import { runtime, type FlowDb } from "../foundation/prisma.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import {
  quoteOneClickPreview,
  validateProviderAddress,
} from "./providers/one-click-preview.ts";

const mode = z.enum(["WALLET", "EXCHANGE"]);
const requestInput = z.object({
  sourceDeploymentId: z.string().trim().max(128).optional(),
  sourceAssetId: z.string().trim().max(128).optional(),
  payerMode: mode.optional(),
  checkoutMode: mode.optional(),
  refundAddress: z.string().trim().max(128).nullish(),
  payerAmount: z.string().trim().max(116).nullish(),
  customSourceDisplayAmount: z.string().trim().max(116).nullish(),
  requestVersion: z.string().uuid().optional(),
});

export async function requestPaymentQuote(
  request: Request,
  publicId: string,
): Promise<Response> {
  if (!isValidPublicPaymentId(publicId)) {
    throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
  }
  const input = requestInput.safeParse(await request.json().catch(() => null));
  if (!input.success) throw new ApiFailure(400, "INVALID_INPUT");
  const sourceId = input.data.sourceDeploymentId ?? input.data.sourceAssetId;
  const payerMode = input.data.payerMode ?? input.data.checkoutMode;
  const refundTo = input.data.refundAddress || null;
  if (!sourceId || !payerMode)
    throw new ApiFailure(400, "SOURCE_AND_PAYER_MODE_REQUIRED");
  if (!(await clientBudget(request, "public:payment-quote"))) {
    throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
  }

  const { db } = runtime();
  const [invoice] = await db.$queryRaw<
    Array<{
      public_id: string;
      destination_network: string;
      destination_asset_id: string;
      destination_asset_symbol: string;
      destination_decimals: number;
      amount_mode: "FIXED" | "OPTIONAL";
      requested_atomic_amount: string | null;
      status: "ACTIVE" | "DISABLED" | "EXPIRED" | "COMPLETED";
      expires_at: Date | null;
    }>
  >`
    SELECT public_id, destination_network, destination_asset_id, destination_asset_symbol,
      destination_decimals, amount_mode, requested_atomic_amount::text, status, expires_at
    FROM flow.get_public_payment_request(${publicId})
  `;
  if (!invoice || invoice.status === "DISABLED") {
    throw new ApiFailure(404, "PAYMENT_REQUEST_UNAVAILABLE");
  }
  if (
    invoice.status === "EXPIRED" ||
    (invoice.expires_at && +invoice.expires_at <= Date.now())
  ) {
    throw new ApiFailure(400, "PAYMENT_REQUEST_EXPIRED");
  }
  if (invoice.status !== "ACTIVE")
    throw new ApiFailure(409, "PAYMENT_REQUEST_CLOSED");

  const [usage, feePayer] = await Promise.all([
    readPaymentRequestUsage(publicId),
    readPaymentRequestFeePayer(publicId),
  ]);
  if (usage.maxPayments !== null && usage.paidCount >= usage.maxPayments) {
    throw new ApiFailure(409, "PAYMENT_REQUEST_COMPLETED");
  }

  const [source, destination] = await Promise.all([
    resolveQuoteAsset(sourceId),
    resolveQuoteAsset(invoice.destination_asset_id),
  ]);
  if (!source || source.isWrapped || !supportsQuoteAddress(source)) {
    return reply(200, {
      routeStatus: "UNSUPPORTED_PAIR",
      isExecutionDisabled: isFinancialExecutionDisabled(),
      statusMessage: "Route unavailable",
    });
  }
  if (
    !destination?.capabilities.includes("CAN_RECEIVE_TO") ||
    destination.id !== invoice.destination_asset_id ||
    destination.networkKey !== invoice.destination_network ||
    destination.symbol !== invoice.destination_asset_symbol ||
    destination.decimals !== invoice.destination_decimals
  ) {
    throw new ApiFailure(400, "DESTINATION_DEPLOYMENT_MISMATCH");
  }

  const isDirect =
    source.assetId === destination.assetId &&
    isSamePaymentDeployment(source, destination);
  if (isDirect && payerMode === "EXCHANGE") {
    throw new ApiFailure(400, "EXCHANGE_MODE_NOT_SUPPORTED_FOR_ROUTE");
  }
  let swapType: "EXACT_OUTPUT" | "EXACT_INPUT" =
    invoice.amount_mode === "FIXED" ? "EXACT_OUTPUT" : "EXACT_INPUT";
  let amount = invoice.requested_atomic_amount;
  if (invoice.amount_mode === "OPTIONAL") {
    const payerAmount =
      input.data.customSourceDisplayAmount ?? input.data.payerAmount;
    if (!payerAmount) throw new ApiFailure(400, "PAYER_AMOUNT_REQUIRED");
    try {
      const parsed = parseDisplayToAtomic(payerAmount, source.decimals);
      if (parsed <= 0n) throw new Error("Nonpositive payer amount");
      amount = parsed.toString();
    } catch {
      throw new ApiFailure(400, "INVALID_PAYER_AMOUNT");
    }
  } else if (
    !isDirect &&
    feePayer === "MERCHANT" &&
    invoice.requested_atomic_amount
  ) {
    // Merchant covers cross-chain routing fees: payer sends face value of the invoice
    // in the chosen source asset (EXACT_INPUT), and routing fees are deducted from output.
    const requestedDestAtomic = BigInt(invoice.requested_atomic_amount);
    let faceValueSourceAtomic: bigint | null = null;
    if (source.symbol.toUpperCase() === destination.symbol.toUpperCase()) {
      const decDiff = source.decimals - destination.decimals;
      if (decDiff >= 0) {
        faceValueSourceAtomic = requestedDestAtomic * 10n ** BigInt(decDiff);
      } else {
        faceValueSourceAtomic = requestedDestAtomic / 10n ** BigInt(-decDiff);
      }
    } else if (
      source.priceUsd &&
      source.priceUsd > 0 &&
      destination.priceUsd &&
      destination.priceUsd > 0
    ) {
      const destDisplayNum = Number(
        formatAtomicToDisplay(requestedDestAtomic, destination.decimals),
      );
      if (Number.isFinite(destDisplayNum) && destDisplayNum > 0) {
        const srcDisplayNum =
          (destDisplayNum * destination.priceUsd) / source.priceUsd;
        const precision = Math.min(source.decimals, 8);
        try {
          const parsed = parseDisplayToAtomic(
            srcDisplayNum.toFixed(precision),
            source.decimals,
          );
          if (parsed > 0n) faceValueSourceAtomic = parsed;
        } catch {
          faceValueSourceAtomic = null;
        }
      }
    }
    if (faceValueSourceAtomic && faceValueSourceAtomic > 0n) {
      swapType = "EXACT_INPUT";
      amount = faceValueSourceAtomic.toString();
    }
  }
  if (!amount || !validateProviderAtomicAmount(amount)) {
    throw new ApiFailure(400, "INVALID_QUOTE_AMOUNT");
  }
  const addresses = await readPaymentWalletAddresses(publicId);
  const recipient = addresses.find(
    (row) => canonicalizeNetworkId(row.chain_id) === destination.networkKey,
  )?.address;
  if (!recipient) throw new ApiFailure(400, "RECIPIENT_ADDRESS_UNAVAILABLE");
  if (refundTo) {
    const addressCheck = validateProviderAddress(source, refundTo);
    if (!addressCheck.valid) {
      throw new ApiFailure(
        400,
        addressCheck.reason ?? "INVALID_REFUND_ADDRESS",
      );
    }
    if (
      isBannedIllustrativeAddress(refundTo) ||
      addresses.some(
        ({ address }) =>
          address === refundTo ||
          (refundTo.startsWith("0x") &&
            address.toLowerCase() === refundTo.toLowerCase()),
      )
    ) {
      throw new ApiFailure(
        400,
        "PAYER_REFUND_ADDRESS_CANNOT_BE_RECIPIENT: Enter an address you control on the source network.",
      );
    }
  }
  const attemptPublicId = generatePaymentAttemptPublicId();
  const execDisabled = isFinancialExecutionDisabled();
  const quoteBase = {
    requestVersion: input.data.requestVersion,
    attemptPublicId,
    paymentRequestPublicId: publicId,
    routeType: isDirect ? "DIRECT_TRANSFER" : "CROSS_CHAIN_1CLICK",
    sourceNetwork: source.networkKey,
    sourceAssetId: source.id,
    sourceAssetSymbol: source.symbol,
    sourceDecimals: source.decimals,
    destinationNetwork: destination.networkKey,
    destinationAssetId: destination.id,
    destinationAssetSymbol: destination.symbol,
    destinationDecimals: destination.decimals,
    payerMode,
    refundAddress: refundTo,
    swapType,
    verificationTier: "UNVERIFIED_OBSERVATION",
    isProviderVerified: false,
    isExchangeCompatible: !isDirect,
    isIndicativeOnly: true,
    isExecutionDisabled: execDisabled,
    executionBlockedNotice: execDisabled
      ? "Payment execution is disabled (FLOW_EXECUTION=disabled)."
      : "",
  } as const;

  if (isDirect) {
    const display = formatAtomicToDisplay(amount, source.decimals);
    return reply(200, {
      ...quoteBase,
      routeStatus: execDisabled
        ? "NOT_YET_ENABLED_FOR_PAYMENT"
        : "SUPPORTED_AND_QUOTABLE",
      sourceAtomicAmount: amount,
      sourceDisplayAmount: display,
      destinationAtomicAmount: amount,
      destinationDisplayAmount: display,
      estimatedDurationSeconds: null,
      exchangeRateDescription: "",
      fees: {
        isEstimate: true,
        description: execDisabled
          ? "Network fee unavailable."
          : "Standard network fee applies on transfer.",
      },
      quoteCreatedAt: new Date().toISOString(),
      localPreviewExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      providerQuoteExpiresAt: null,
      correlationId: null,
      statusMessage: execDisabled
        ? "Direct transfer preview. Payment execution is disabled."
        : "Direct transfer supported.",
    } satisfies IndicativeQuote);
  }

  if (!refundTo) throw new ApiFailure(400, "PAYER_REFUND_ADDRESS_REQUIRED");

  const result = await quoteOneClickPreview({
    source,
    destination,
    operationId: publicId,
    amountAtomic: amount,
    swapType,
    refundTo,
    recipient,
    signal: request.signal,
  });
  if (!result.ok) {
    return reply(200, {
      ...quoteBase,
      routeStatus: result.routeStatus,
      statusMessage: result.error,
    });
  }
  if (invoice.expires_at && +invoice.expires_at <= Date.now()) {
    throw new ApiFailure(400, "PAYMENT_REQUEST_EXPIRED");
  }
  const preview = result.quote;
  const expiresAt = new Date(
    Math.min(
      Date.parse(preview.identity.expiresAt),
      invoice.expires_at ? +invoice.expires_at : Infinity,
    ),
  );

  // Persist every valid quotable payment attempt so any supported cross-chain payer route can be committed.
  await recordPaymentAttemptRow(db, {
    paymentRequestPublicId: publicId,
    attemptPublicId,
    payerMode,
    payerRefundAddress: refundTo,
    sourceNetwork: source.networkKey,
    sourceAssetId: source.id,
    sourceAssetSymbol: source.symbol,
    sourceDecimals: source.decimals,
    routeType: "CROSS_CHAIN_1CLICK",
    routeStatus: "SUPPORTED_AND_QUOTABLE",
    swapType,
    quotedSourceAtomic: preview.amountInAtomic,
    quotedDestinationAtomic: preview.amountOutAtomic,
    estimatedDurationSeconds: preview.estimatedTimeSeconds,
    providerFees: preview.fees,
    providerCorrelationId: result.correlationId,
    providerSignature: result.signature,
    quoteExpiresAt: expiresAt,
  });

  return reply(200, {
    ...quoteBase,
    identity: { ...preview.identity, expiresAt: expiresAt.toISOString() },
    routeStatus: "SUPPORTED_AND_QUOTABLE",
    sourceAtomicAmount: preview.amountInAtomic,
    sourceDisplayAmount: preview.sourceDisplayAmount,
    destinationAtomicAmount: preview.amountOutAtomic,
    destinationDisplayAmount: preview.recipientDisplayAmount,
    estimatedDurationSeconds: preview.estimatedTimeSeconds,
    exchangeRateDescription: preview.rateDescription,
    fees: preview.fees,
    quoteCreatedAt: preview.identity.timestamp,
    localPreviewExpiresAt: expiresAt.toISOString(),
    providerQuoteExpiresAt: result.providerDeadline,
    correlationId: result.correlationId,
  } satisfies IndicativeQuote);
}

async function recordPaymentAttemptRow(
  db: FlowDb,
  input: {
    paymentRequestPublicId: string;
    attemptPublicId: string;
    payerMode: string;
    payerRefundAddress: string | null;
    sourceNetwork: string;
    sourceAssetId: string;
    sourceAssetSymbol: string;
    sourceDecimals: number;
    routeType: string;
    routeStatus: string;
    swapType: string;
    quotedSourceAtomic: string;
    quotedDestinationAtomic: string;
    estimatedDurationSeconds: number | null;
    providerFees: unknown;
    providerCorrelationId: string | null;
    providerSignature: string | null;
    quoteExpiresAt: Date;
  },
): Promise<void> {
  await db.$queryRaw`
    SELECT * FROM flow.record_public_payment_attempt(
      ${input.paymentRequestPublicId},
      ${input.attemptPublicId},
      ${input.payerMode},
      ${input.payerRefundAddress},
      ${input.sourceNetwork},
      ${input.sourceAssetId},
      ${input.sourceAssetSymbol},
      ${input.sourceDecimals},
      ${input.routeType},
      ${input.routeStatus},
      ${input.swapType},
      ${input.quotedSourceAtomic}::decimal,
      ${input.quotedDestinationAtomic}::decimal,
      ${input.estimatedDurationSeconds}::integer,
      ${JSON.stringify(input.providerFees)}::jsonb,
      ${input.providerCorrelationId},
      ${input.providerSignature},
      ${input.quoteExpiresAt}
    )
  `;
}

export const discoverPaymentQuote = requestPaymentQuote;
