import "server-only";
import {
  type PaymentAttemptStatus,
  type PaymentDepositInstructions,
  isValidPaymentAttemptPublicId,
  isBannedIllustrativeAddress,
} from "../domain/quote-discovery.ts";
import { formatAtomicToDisplay } from "../domain/atomic-amounts.ts";
import { isValidPublicPaymentId } from "../domain/payment-requests.ts";
import {
  isFinancialExecutionDisabled,
  isValidEvmAddress,
  validateAddressForNetwork,
} from "../domain/custody.ts";
import {
  canonicalizeNetworkId,
  isSamePaymentDeployment,
} from "../domain/supported-assets-catalog.ts";
import {
  readPaymentAttempt,
  readPaymentRequestFeePayer,
  readPaymentRequestUsage,
  readPaymentWalletAddresses,
} from "./payment-requests.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { validateProviderAddress } from "./providers/one-click-preview.ts";
import { getPrismaClient, runtime } from "../foundation/prisma.ts";
import { fetchOneClickCommittedQuote } from "./providers/one-click-adapter.ts";
import { clientBudget } from "./auth/limits.ts";
import { ApiFailure, reply } from "./http.ts";

export interface CommitPaymentAttemptInput {
  readonly attemptPublicId: string;
  readonly payerRefundAddress?: string;
}

/**
 * Commits a guest payer to a quote, generating verified deposit instructions
 * and transitioning the payment attempt to DEPOSIT_COMMITTED status.
 *
 * Mandatory Security Safeguards:
 * 1. Rejected if FLOW_EXECUTION=disabled (Requirement 8)
 * 2. Rejected if quote is expired (Requirement 12 - strictly enforced without 1-hour grace)
 * 3. Synthetic deposit addresses are strictly prohibited (Requirement 7 & 9)
 */
export async function commitPaymentAttempt(
  request: Request,
  publicId: string,
): Promise<Response> {
  if (!isValidPublicPaymentId(publicId)) {
    throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
  }

  // Parse body
  let body: CommitPaymentAttemptInput;
  try {
    body = (await request.json()) as CommitPaymentAttemptInput;
  } catch {
    throw new ApiFailure(400, "INVALID_JSON");
  }

  let committedPayerRefund: string | null =
    body.payerRefundAddress?.trim() || null;

  const { attemptPublicId } = body;
  if (!attemptPublicId || !isValidPaymentAttemptPublicId(attemptPublicId)) {
    if (isFinancialExecutionDisabled()) {
      throw new ApiFailure(
        403,
        "PAYMENT_EXECUTION_DISABLED: Payment execution and deposit commitment are disabled (FLOW_EXECUTION=disabled).",
      );
    }
    throw new ApiFailure(400, "INVALID_ATTEMPT_PUBLIC_ID");
  }

  // Rate limit
  const allowed = await clientBudget(request, "public:payment-commit");
  if (!allowed) {
    throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
  }

  const { db } = runtime();

  // If financial execution is disabled, check if an active, unconsumed rehearsal authorization exists
  if (isFinancialExecutionDisabled()) {
    const authRows = await db.$queryRaw<Array<{ res_auth_id: string }>>`
      SELECT res_auth_id FROM flow.check_active_payment_rehearsal_authorization(${publicId})
    `;
    if (authRows.length === 0 || !authRows[0]?.res_auth_id) {
      throw new ApiFailure(
        403,
        "PAYMENT_EXECUTION_DISABLED: Payment execution and deposit commitment are disabled (FLOW_EXECUTION=disabled).",
      );
    }
  }

  // Query attempt details to generate instructions
  const attempts = await db.$queryRaw<
    Array<{
      id: string;
      attempt_public_id: string;
      source_network: string;
      source_asset_id: string;
      source_asset_symbol: string;
      source_decimals: number;
      quoted_source_atomic_amount: string | null;
      quoted_destination_atomic_amount: string | null;
      status: string;
      quote_expires_at: Date | null;
      destination_network: string;
      destination_asset_symbol: string;
      destination_decimals: number;
      deposit_address: string | null;
      deposit_memo: string | null;
      deposit_deadline: Date | null;
      deposit_instructions: Record<string, unknown> | null;
    }>
  >`
    SELECT
      id,
      attempt_public_id,
      source_network,
      source_asset_id,
      source_asset_symbol,
      source_decimals,
      quoted_source_atomic_amount::text,
      quoted_destination_atomic_amount::text,
      status,
      quote_expires_at,
      destination_network,
      destination_asset_symbol,
      destination_decimals,
      deposit_address,
      deposit_memo,
      deposit_deadline,
      deposit_instructions
    FROM flow.get_public_payment_attempt(${publicId}, ${attemptPublicId})
    LIMIT 1
  `;

  if (attempts.length === 0) {
    if (isFinancialExecutionDisabled()) {
      throw new ApiFailure(
        403,
        "PAYMENT_EXECUTION_DISABLED: Payment execution and deposit commitment are disabled (FLOW_EXECUTION=disabled).",
      );
    }
    throw new ApiFailure(404, "PAYMENT_ATTEMPT_NOT_FOUND");
  }

  const attempt = attempts[0]!;

  if (
    attempt.status !== "QUOTE_OBSERVED" &&
    attempt.status !== "DEPOSIT_COMMITTED"
  ) {
    throw new ApiFailure(400, `INVALID_STATUS_FOR_COMMIT: ${attempt.status}`);
  }

  // Requirement 12: Strict quote expiration enforcement (applies only before commitment)
  if (
    attempt.status === "QUOTE_OBSERVED" &&
    attempt.quote_expires_at &&
    new Date(attempt.quote_expires_at).getTime() < Date.now()
  ) {
    throw new ApiFailure(400, "QUOTE_EXPIRED");
  }

  // Requirement 9, 10 & M6: Genuine provider and recipient address authorization
  let depositAddress = attempt.deposit_address;
  let depositMemo = attempt.deposit_memo;
  let deadline = attempt.deposit_deadline
    ? new Date(attempt.deposit_deadline)
    : new Date(Date.now() + 15 * 60 * 1000);
  let committedRes:
    Awaited<ReturnType<typeof fetchOneClickCommittedQuote>> | undefined;

  if (!depositAddress) {
    // 1. Fetch recipient wallet details with full custody, chain ID, and capability checks via SECURITY DEFINER (Blocker 1)
    const recipientDetails = await db.$queryRaw<
      Array<{
        payment_request_id: string;
        attempt_id: string;
        destination_asset_id: string;
        payer_refund_address: string | null;
        recipient_address: string | null;
        recipient_network: string | null;
        recipient_chain_id: string | null;
        wallet_environment: string | null;
        wallet_status: string | null;
        can_receive: boolean | null;
      }>
    >`
      SELECT *
      FROM flow.get_payment_attempt_commitment_details(${publicId}, ${attemptPublicId})
      LIMIT 1
    `;

    if (
      recipientDetails.length === 0 ||
      !recipientDetails[0]?.recipient_address
    ) {
      throw new ApiFailure(
        400,
        "RECIPIENT_WALLET_UNAVAILABLE: Recipient account has no registered wallet address for destination network.",
      );
    }

    const row = recipientDetails[0]!;
    const recipientAddress = row.recipient_address!;

    // Recipient wallet readiness validation (Blocker 1)
    if (row.wallet_status !== "ACTIVE") {
      throw new ApiFailure(
        400,
        `RECIPIENT_WALLET_NOT_ACTIVE: Recipient wallet status is ${row.wallet_status}, must be ACTIVE.`,
      );
    }

    if (!row.can_receive) {
      throw new ApiFailure(
        400,
        "RECIPIENT_RECEIVE_DISABLED: Recipient wallet does not have receive capability enabled.",
      );
    }

    const canonicalDest = canonicalizeNetworkId(attempt.destination_network);
    const expectedChainIds: Readonly<Record<string, string>> = {
      "base-mainnet": "8453",
      "ethereum-mainnet": "1",
      "solana-mainnet": "solana-mainnet",
      "near-mainnet": "near-mainnet",
    };
    const expectedChainId = canonicalDest
      ? expectedChainIds[canonicalDest]
      : undefined;

    if (expectedChainId && canonicalDest) {
      if (row.recipient_chain_id !== expectedChainId) {
        throw new ApiFailure(
          400,
          `RECIPIENT_CHAIN_ID_MISMATCH: ${canonicalDest} chain ID must be ${expectedChainId}, got ${row.recipient_chain_id}. Testnet wallets are strictly prohibited.`,
        );
      }
      if (row.wallet_environment !== "mainnet") {
        throw new ApiFailure(
          400,
          `RECIPIENT_ENVIRONMENT_MISMATCH: Recipient wallet environment must be mainnet, got ${row.wallet_environment}.`,
        );
      }
      const isValidAddress =
        canonicalDest === "base-mainnet" || canonicalDest === "ethereum-mainnet"
          ? isValidEvmAddress(recipientAddress)
          : validateAddressForNetwork(
              canonicalDest as Parameters<typeof validateAddressForNetwork>[0],
              recipientAddress,
            ).valid;
      if (!isValidAddress || isBannedIllustrativeAddress(recipientAddress)) {
        throw new ApiFailure(
          400,
          `RECIPIENT_ADDRESS_INVALID: Recipient ${canonicalDest} address must be a verified, valid non-probe address. Illustrative probe addresses are strictly prohibited.`,
        );
      }
    }

    const [
      sourceDeployment,
      destinationDeployment,
      merchantWallets,
      [invoice],
      feePayer,
    ] = await Promise.all([
      resolveQuoteAsset(attempt.source_asset_id),
      resolveQuoteAsset(row.destination_asset_id),
      readPaymentWalletAddresses(publicId),
      db.$queryRaw<
        Array<{
          payer_memo_required: boolean;
          status: string;
          amount_mode: string;
          requested_atomic_amount: string | null;
        }>
      >`
          SELECT
            payer_memo_required,
            status::text,
            amount_mode::text,
            requested_atomic_amount::text
          FROM flow.get_public_payment_request(${publicId})
        `,
      readPaymentRequestFeePayer(publicId),
    ]);
    if (invoice?.status === "DISABLED") {
      throw new ApiFailure(409, "PAYMENT_REQUEST_PAUSED");
    }
    if (invoice?.status === "COMPLETED") {
      throw new ApiFailure(409, "PAYMENT_REQUEST_COMPLETED");
    }
    const usage = await readPaymentRequestUsage(publicId);
    if (usage.maxPayments !== null && usage.paidCount >= usage.maxPayments) {
      throw new ApiFailure(409, "PAYMENT_REQUEST_COMPLETED");
    }
    if (invoice?.status === "EXPIRED") {
      throw new ApiFailure(409, "PAYMENT_REQUEST_EXPIRED");
    }
    if (
      !sourceDeployment ||
      !destinationDeployment ||
      !invoice ||
      sourceDeployment.networkKey !==
        (canonicalizeNetworkId(attempt.source_network) ??
          attempt.source_network) ||
      sourceDeployment.decimals !== attempt.source_decimals ||
      destinationDeployment.networkKey !==
        (canonicalizeNetworkId(attempt.destination_network) ??
          attempt.destination_network) ||
      destinationDeployment.decimals !== attempt.destination_decimals
    ) {
      throw new ApiFailure(400, "COMMITMENT_DEPLOYMENT_MISMATCH");
    }
    const isDirect = isSamePaymentDeployment(
      sourceDeployment,
      destinationDeployment,
    );
    committedPayerRefund =
      committedPayerRefund || row.payer_refund_address?.trim() || null;
    const payerRefund = committedPayerRefund;

    if (!isDirect) {
      // Task 1: Strict Refund Ownership for cross-chain payments
      if (
        !payerRefund ||
        payerRefund.length === 0 ||
        isBannedIllustrativeAddress(payerRefund)
      ) {
        throw new ApiFailure(
          400,
          "PAYER_REFUND_ADDRESS_REQUIRED: A valid payer refund address is strictly required before committing a cross-chain payment. Illustrative and synthetic probe addresses are prohibited.",
        );
      }

      // Check against all recipient OutLayer wallet addresses
      const isRecipientAddress = merchantWallets.some(
        (w) => w.address.trim().toLowerCase() === payerRefund.toLowerCase(),
      );
      if (isRecipientAddress) {
        throw new ApiFailure(
          400,
          "PAYER_REFUND_ADDRESS_CANNOT_BE_RECIPIENT: The payer refund address cannot be the recipient's wallet address. A distinct payer-controlled refund address is strictly required.",
        );
      }

      const refundValidation = validateProviderAddress(
        sourceDeployment,
        payerRefund,
      );
      if (!refundValidation.valid) {
        throw new ApiFailure(
          400,
          refundValidation.reason ?? "PAYER_REFUND_ADDRESS_INVALID",
        );
      }

      // Update attempt payer refund address if updated in commit body
      if (
        body.payerRefundAddress &&
        body.payerRefundAddress.trim() !== row.payer_refund_address
      ) {
        await db.$executeRaw`
          UPDATE flow.payment_attempts
          SET payer_refund_address = ${payerRefund}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${attempt.id}::uuid
        `.catch(() => {});
      }
    }

    // 2. Strict Rehearsal Authorization & Execution Guardrail (Blocker 2 & 3)
    let authConsumption: Array<{
      res_auth_id: string;
      res_operator_auth_id: string;
      res_max_atomic_amount: string;
      res_consumed_at: Date;
    }> = [];

    if (isFinancialExecutionDisabled()) {
      // Stored authorization bounds destination settlement amount (e.g. 5,000,000 USDC)
      const quotedAmtStr =
        attempt.quoted_destination_atomic_amount ??
        attempt.quoted_source_atomic_amount ??
        "0";

      authConsumption = await db.$queryRaw<
        Array<{
          res_auth_id: string;
          res_operator_auth_id: string;
          res_max_atomic_amount: string;
          res_consumed_at: Date;
        }>
      >`
        SELECT *
        FROM flow.consume_payment_rehearsal_authorization(
          ${row.payment_request_id}::uuid,
          ${attempt.id}::uuid,
          ${attempt.source_network},
          ${attempt.source_asset_id},
          ${attempt.destination_network},
          ${row.destination_asset_id},
          ${quotedAmtStr}::numeric,
          ${payerRefund},
          ${recipientAddress}
        )
      `.catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ApiFailure(403, `REHEARSAL_AUTHORIZATION_FAILED: ${msg}`);
      });

      if (authConsumption.length === 0 || !authConsumption[0]?.res_auth_id) {
        throw new ApiFailure(
          403,
          "PAYMENT_EXECUTION_DISABLED: Global financial execution is disabled and no valid, unconsumed rehearsal authorization exists for this payment request.",
        );
      }
    }

    if (isDirect) {
      depositAddress = recipientAddress;
    } else {
      // Task 3: Remote commit timeout & persistence safety
      const isMerchantFeeExactInput =
        invoice.amount_mode === "FIXED" &&
        feePayer === "MERCHANT" &&
        Boolean(invoice.requested_atomic_amount) &&
        attempt.quoted_destination_atomic_amount !==
          invoice.requested_atomic_amount;
      const commitSwapType =
        invoice.amount_mode === "OPTIONAL" || isMerchantFeeExactInput
          ? "EXACT_INPUT"
          : "EXACT_OUTPUT";
      const commitAmountAtomic =
        commitSwapType === "EXACT_INPUT"
          ? (attempt.quoted_source_atomic_amount ??
            attempt.quoted_destination_atomic_amount ??
            "0")
          : (attempt.quoted_destination_atomic_amount ??
            attempt.quoted_source_atomic_amount ??
            "0");
      try {
        committedRes = await fetchOneClickCommittedQuote({
          originAsset: sourceDeployment.assetId,
          destinationAsset: destinationDeployment.assetId,
          swapType: commitSwapType,
          amountAtomic: commitAmountAtomic,
          refundTo: payerRefund!,
          recipient: recipientAddress,
        });
      } catch (dispatchErr: unknown) {
        await db.$executeRaw`
          UPDATE flow.payment_attempts
          SET
            status = 'RECONCILIATION_REQUIRED',
            settlement_error = ${`RECONCILIATION_REQUIRED: Provider commitment dispatch failed or timed out: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}. Duplicate commitment blocked.`},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${attempt.id}::uuid
        `.catch(() => {});
        throw new ApiFailure(
          504,
          "COMMIT_TIMEOUT_RECONCILIATION_REQUIRED: Provider committed quote request timed out or network error. Payment attempt marked RECONCILIATION_REQUIRED to prevent duplicate commitment.",
        );
      }

      if (committedRes.ok) {
        const address = committedRes.depositAddress;
        if (
          !address ||
          !validateProviderAddress(sourceDeployment, address).valid ||
          isBannedIllustrativeAddress(address) ||
          merchantWallets.some(
            (wallet) => wallet.address.toLowerCase() === address.toLowerCase(),
          ) ||
          !committedRes.amountInAtomic ||
          !committedRes.depositDeadline ||
          (invoice.payer_memo_required && !committedRes.depositMemo)
        ) {
          committedRes = {
            ...committedRes,
            ok: false,
            errorMessage:
              "The provider did not return valid source deposit instructions.",
          };
        }
      }

      if (!committedRes.ok || !committedRes.depositAddress) {
        if (committedRes.isTimeout) {
          await db.$executeRaw`
            UPDATE flow.payment_attempts
            SET
              status = 'RECONCILIATION_REQUIRED',
              provider_correlation_id = COALESCE(${committedRes.correlationId ?? null}, provider_correlation_id),
              settlement_error = 'RECONCILIATION_REQUIRED: Provider committed quote timed out. Duplicate commitment blocked.',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${attempt.id}::uuid
          `.catch(() => {});
          throw new ApiFailure(
            504,
            "COMMIT_TIMEOUT_RECONCILIATION_REQUIRED: Provider committed quote timed out. Payment attempt marked RECONCILIATION_REQUIRED to prevent duplicate commitment.",
          );
        }

        // If the provider returned a deposit address remotely or deadline validation failed,
        // quarantine the attempt to protect funds and block duplicate commitments:
        if (committedRes.depositAddress || committedRes.isAmbiguousDeadline) {
          await db.$executeRaw`
            UPDATE flow.payment_attempts
            SET
              status = 'RECONCILIATION_REQUIRED',
              deposit_address = NULL,
              provider_correlation_id = COALESCE(${committedRes.correlationId ?? null}, provider_correlation_id),
              financial_evidence = ${JSON.stringify({
                rawResponse: committedRes.rawResponse ?? null,
                quarantineReason: committedRes.errorMessage,
                remoteDepositAddressDerived: Boolean(
                  committedRes.depositAddress,
                ),
                timeWhenInactive: committedRes.timeWhenInactive ?? null,
              })}::jsonb,
              settlement_error = ${`RECONCILIATION_REQUIRED: Remotely committed quote failed deadline/security validation (${committedRes.errorMessage}). Deposit address suppressed to protect funds.`},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${attempt.id}::uuid
          `.catch(() => {});
          throw new ApiFailure(
            422,
            `COMMIT_VALIDATION_FAILED_QUARANTINED: ${committedRes.errorMessage}. Attempt quarantined in RECONCILIATION_REQUIRED to prevent duplicate commitment.`,
          );
        }

        throw new ApiFailure(
          400,
          committedRes.errorMessage ?? "PROVIDER_COMMITTED_QUOTE_FAILED",
        );
      }

      // Task 1 & 2: Rehearsal/explicit payer cost cap enforcement
      const configuredSolCap = process.env.FLOW_MAX_SOL_LAMPORTS;
      const shouldEnforceSolCap =
        Boolean(configuredSolCap) || isFinancialExecutionDisabled();
      const MAX_APPROVED_SOL_LAMPORTS = BigInt(
        configuredSolCap ??
          (process.env.FLOW_ENV === "test" ? "100000000" : "15000000"),
      );
      if (
        shouldEnforceSolCap &&
        attempt.source_network === "solana-mainnet" &&
        attempt.source_asset_symbol.toUpperCase() === "SOL" &&
        committedRes.amountInAtomic &&
        BigInt(committedRes.amountInAtomic) > MAX_APPROVED_SOL_LAMPORTS
      ) {
        // Quarantine over-limit attempt and do NOT expose or store the payable deposit address
        await db.$executeRaw`
          UPDATE flow.payment_attempts
          SET
            status = 'RECONCILIATION_REQUIRED',
            deposit_address = NULL,
            provider_correlation_id = COALESCE(${committedRes.correlationId ?? null}, provider_correlation_id),
            settlement_error = ${`QUARANTINED_OVER_LIMIT: Committed amountIn ${committedRes.amountInAtomic} lamports exceeds owner approved cap of ${MAX_APPROVED_SOL_LAMPORTS} lamports. Deposit address suppressed.`},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${attempt.id}::uuid
        `.catch(() => {});
        throw new ApiFailure(
          403,
          `PAYER_COST_EXCEEDS_APPROVED_LIMIT: Fresh committed source amount ${committedRes.amountInAtomic} lamports exceeds owner approved limit of ${MAX_APPROVED_SOL_LAMPORTS} lamports. Attempt quarantined and deposit address suppressed.`,
        );
      }

      // 2. Bound destination amount against rehearsal authorization max bound (e.g. exactly 1,000,000 USDC)
      const committedDestAtomic =
        committedRes.amountOutAtomic ??
        attempt.quoted_destination_atomic_amount;
      if (
        committedDestAtomic &&
        authConsumption.length > 0 &&
        authConsumption[0]!.res_max_atomic_amount &&
        BigInt(committedDestAtomic) >
          BigInt(authConsumption[0]!.res_max_atomic_amount)
      ) {
        // Quarantine over-limit destination attempt
        await db.$executeRaw`
          UPDATE flow.payment_attempts
          SET
            status = 'RECONCILIATION_REQUIRED',
            deposit_address = NULL,
            provider_correlation_id = COALESCE(${committedRes.correlationId ?? null}, provider_correlation_id),
            settlement_error = ${`QUARANTINED_OVER_LIMIT: Committed destination amount ${committedDestAtomic} exceeds authorized limit of ${authConsumption[0]!.res_max_atomic_amount}. Deposit address suppressed.`},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${attempt.id}::uuid
        `.catch(() => {});
        throw new ApiFailure(
          403,
          `COMMITTED_QUOTE_EXCEEDS_AUTHORIZED_MAX_BOUND: Fresh committed destination amount ${committedDestAtomic} exceeds approved limit of ${authConsumption[0]!.res_max_atomic_amount} atomic units. Attempt quarantined and deposit address suppressed.`,
        );
      }

      depositAddress = committedRes.depositAddress;
      depositMemo = committedRes.depositMemo ?? null;
      if (committedRes.depositDeadline) {
        deadline = new Date(committedRes.depositDeadline);
      }
      if (committedRes.amountInAtomic) {
        attempt.quoted_source_atomic_amount = committedRes.amountInAtomic;
      }
      if (committedRes.amountOutAtomic) {
        attempt.quoted_destination_atomic_amount = committedRes.amountOutAtomic;
      }
    }
  }

  // Synthetic address fabrication is strictly prohibited.
  if (!depositAddress || depositAddress.startsWith("flow-")) {
    throw new ApiFailure(
      400,
      "PROVIDER_DEPOSIT_DESTINATION_UNAVAILABLE: Real provider deposit destination has not been authorized.",
    );
  }

  const hasExistingInstructions =
    attempt.deposit_instructions &&
    typeof attempt.deposit_instructions === "object" &&
    Object.keys(attempt.deposit_instructions).length > 0;

  const depositInstructionsPayload = hasExistingInstructions
    ? (attempt.deposit_instructions as Record<string, unknown>)
    : {
        network: attempt.source_network,
        tokenSymbol: attempt.source_asset_symbol,
        decimals: attempt.source_decimals,
        expectedAtomicAmount: attempt.quoted_source_atomic_amount,
        deadlineIso: deadline.toISOString(),
        timeWhenInactiveIso: committedRes?.timeWhenInactive ?? null,
        memo: depositMemo,
        depositAddress,
        payerRefundAddress: committedPayerRefund,
      };

  // Commit via stored procedure with persistence failure reconciliation protection (Task 3)
  let commitRows: Array<{
    id: string;
    attempt_public_id: string;
    status: string;
    deposit_address: string;
    deposit_memo: string | null;
    deposit_deadline: Date;
    deposit_instructions: Record<string, unknown>;
    updated_at: Date;
  }>;

  try {
    commitRows = await db.$queryRaw<
      Array<{
        id: string;
        attempt_public_id: string;
        status: string;
        deposit_address: string;
        deposit_memo: string | null;
        deposit_deadline: Date;
        deposit_instructions: Record<string, unknown>;
        updated_at: Date;
      }>
    >`
      SELECT *
      FROM flow.commit_payment_attempt(
        ${attemptPublicId},
        ${depositAddress},
        ${depositMemo},
        ${deadline},
        ${JSON.stringify(depositInstructionsPayload)}::jsonb,
        ${attempt.quoted_source_atomic_amount ? BigInt(attempt.quoted_source_atomic_amount).toString() : null}::numeric
      )
    `;
  } catch (dbErr: unknown) {
    await db.$executeRaw`
      UPDATE flow.payment_attempts
      SET
        status = 'RECONCILIATION_REQUIRED',
        deposit_address = ${depositAddress},
        deposit_memo = ${depositMemo},
        deposit_deadline = ${deadline},
        quote_expires_at = NULL,
        quoted_source_atomic_amount = COALESCE(${attempt.quoted_source_atomic_amount ? BigInt(attempt.quoted_source_atomic_amount).toString() : null}::numeric, quoted_source_atomic_amount),
        deposit_instructions = ${JSON.stringify(depositInstructionsPayload)}::jsonb,
        settlement_error = ${`RECONCILIATION_REQUIRED: Provider created deposit address but local persistence failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}. Duplicate commitment blocked.`},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${attempt.id}::uuid
    `.catch(() => {});

    throw new ApiFailure(
      500,
      "COMMIT_PERSISTENCE_FAILED_RECONCILIATION_REQUIRED: Provider issued deposit address but local persistence failed. Attempt marked RECONCILIATION_REQUIRED to block duplicate commitment.",
    );
  }

  if (commitRows.length === 0) {
    throw new ApiFailure(500, "COMMIT_FAILED");
  }

  const committed = commitRows[0]!;

  const sourceDisplayAmount = formatAtomicToDisplay(
    BigInt(attempt.quoted_source_atomic_amount ?? "0"),
    attempt.source_decimals,
  );
  const destDisplayAmount = formatAtomicToDisplay(
    BigInt(attempt.quoted_destination_atomic_amount ?? "0"),
    attempt.destination_decimals,
  );

  const instructions: PaymentDepositInstructions = {
    attemptPublicId: committed.attempt_public_id,
    status: committed.status as PaymentAttemptStatus,
    depositAddress: committed.deposit_address,
    depositMemo: committed.deposit_memo,
    depositDeadline: new Date(committed.deposit_deadline).toISOString(),
    sourceNetwork: attempt.source_network,
    sourceAssetId: attempt.source_asset_id,
    sourceAssetSymbol: attempt.source_asset_symbol,
    sourceDecimals: attempt.source_decimals,
    destinationNetwork: attempt.destination_network,
    destinationAssetSymbol: attempt.destination_asset_symbol,
    requiredAtomicAmount: attempt.quoted_source_atomic_amount ?? "0",
    requiredDisplayAmount: sourceDisplayAmount,
    destinationDisplayAmount: destDisplayAmount,
    qrData:
      typeof committed.deposit_instructions === "object" &&
      committed.deposit_instructions !== null
        ? (((committed.deposit_instructions as Record<string, unknown>)
            .qrData as string) ?? "")
        : "",
    instructionsNotice: `Send verified ${sourceDisplayAmount} ${attempt.source_asset_symbol} on ${attempt.source_network}.`,
    isExecutionDisabled: false,
    sourceTxHash: null,
    destinationTxHash: null,
    settledAt: null,
    payerRefundAddress: committedPayerRefund ?? null,
  };

  return reply(200, instructions);
}

/**
 * Polling endpoint for public guest checkout to inspect payment attempt lifecycle status.
 */
export async function getPaymentAttemptStatus(
  _request: Request,
  publicId: string,
  attemptPublicId: string,
): Promise<Response> {
  if (!isValidPublicPaymentId(publicId)) {
    throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
  }
  if (!isValidPaymentAttemptPublicId(attemptPublicId)) {
    throw new ApiFailure(400, "INVALID_ATTEMPT_PUBLIC_ID");
  }

  const merchantWallets = await readPaymentWalletAddresses(publicId);
  const attempt = await readPaymentAttempt(
    publicId,
    attemptPublicId,
    merchantWallets,
  );
  if (!attempt) throw new ApiFailure(404, "PAYMENT_ATTEMPT_NOT_FOUND");
  return reply(200, attempt);
}

/**
 * Worker-privileged function to settle a committed payment attempt,
 * recording transaction hashes and posting the balanced double-entry ledger journal.
 */
export async function workerSettlePayment(
  attemptPublicId: string,
  params: {
    sourceTxHash: string;
    destinationTxHash: string;
  },
): Promise<{
  id: string;
  attemptPublicId: string;
  status: string;
  settledAt: string;
  journalId: string;
  journalPublicId: string;
}> {
  const workerDb = getPrismaClient("payment");

  const rows = await workerDb.$queryRaw<
    Array<{
      id: string;
      attempt_public_id: string;
      status: string;
      settled_at: Date;
      journal_id: string;
      journal_public_id: string;
    }>
  >`
    SELECT *
    FROM flow.worker_settle_payment_attempt(
      ${attemptPublicId},
      ${params.sourceTxHash},
      ${params.destinationTxHash}
    )
  `;

  if (rows.length === 0) {
    throw new ApiFailure(500, "SETTLEMENT_FAILED");
  }

  const r = rows[0]!;
  return {
    id: r.id,
    attemptPublicId: r.attempt_public_id,
    status: r.status,
    settledAt: new Date(r.settled_at).toISOString(),
    journalId: r.journal_id,
    journalPublicId: r.journal_public_id,
  };
}
