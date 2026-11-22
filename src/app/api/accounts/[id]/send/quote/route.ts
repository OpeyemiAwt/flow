import { z } from "zod";
import { parseDisplayToAtomic } from "../../../../../../domain/atomic-amounts.ts";
import { getConvertBridgeAppFees } from "../../../../../../domain/platform-fees.ts";
import {
  getMainnetWalletAddress,
  isBalanceMatchingDeployment,
  serializePortfolio,
} from "../../../../../../domain/portfolio.ts";
import { isBannedIllustrativeAddress } from "../../../../../../domain/quote-discovery.ts";
import { MAINNET_SUPPORTED_DEPLOYMENTS } from "../../../../../../domain/supported-assets-catalog.ts";
import { runtime as appRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import { getAccountBalances } from "../../../../../../server/assets/asset-service.ts";
import {
  ApiFailure,
  api,
  input,
  reply,
} from "../../../../../../server/http.ts";
import { resolveQuoteAsset } from "../../../../../../server/providers/near-intents-discovery.ts";
import { quoteOneClickPreview } from "../../../../../../server/providers/one-click-preview.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  operation: z.enum(["SEND", "CONVERT", "ADD_MONEY"]).default("SEND"),
  sourceDeploymentId: z.string().trim().min(1).max(128),
  destinationDeploymentId: z.string().trim().min(1).max(128),
  sourceDisplayAmount: z.string().trim().min(1).max(116),
  recipientAddress: z.string().trim().max(128).optional(),
  refundAddress: z.string().trim().max(128).optional(),
  requestVersion: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await params).id);
    const { db } = appRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    if (!actor.session.token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const body = await input(request, schema);
    const destinationDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) => d.id === body.destinationDeploymentId,
    );
    if (!destinationDeployment) {
      throw new ApiFailure(
        400,
        "The selected destination asset is unavailable.",
      );
    }

    const sourceDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) => d.id === body.sourceDeploymentId,
    );
    const isAddMoney = body.operation === "ADD_MONEY";
    if (!isAddMoney && !sourceDeployment) {
      throw new ApiFailure(
        400,
        "Select a supported asset held in this FLOW wallet.",
      );
    }
    const [source, destination] = await Promise.all([
      resolveQuoteAsset(body.sourceDeploymentId),
      resolveQuoteAsset(destinationDeployment.id),
    ]);
    if (!source || !destination) {
      throw new ApiFailure(400, "The selected asset pair is unavailable.");
    }
    if (
      isAddMoney &&
      (destination.id !== "near-mainnet:NEAR" ||
        source.networkKey === destination.networkKey)
    ) {
      throw new ApiFailure(
        400,
        "The selected source has no supported cross-chain deposit route to native NEAR.",
      );
    }

    let amount: bigint;
    try {
      amount = parseDisplayToAtomic(body.sourceDisplayAmount, source.decimals);
    } catch {
      throw new ApiFailure(
        400,
        "Enter a valid amount for the selected source asset.",
      );
    }
    if (amount <= 0n)
      throw new ApiFailure(400, "Enter an amount greater than zero.");

    const portfolio = serializePortfolio(
      await getAccountBalances(db, id, { sessionToken: actor.session.token }),
    );
    if (!portfolio.wallet || portfolio.wallet.status !== "ACTIVE") {
      throw new ApiFailure(400, "An active wallet is required for this quote.");
    }
    const recipient =
      body.operation === "SEND"
        ? body.recipientAddress
        : getMainnetWalletAddress(portfolio.wallet, destination.networkKey);
    const refundTo = isAddMoney
      ? body.refundAddress
      : getMainnetWalletAddress(portfolio.wallet, source.networkKey);
    if (
      !recipient ||
      !refundTo ||
      isBannedIllustrativeAddress(recipient) ||
      isBannedIllustrativeAddress(refundTo)
    ) {
      throw new ApiFailure(
        400,
        "A valid recipient and refund address on the selected networks are required.",
      );
    }

    if (sourceDeployment && !isAddMoney) {
      const balance = portfolio.balances.find(
        (record) =>
          record.networkAsset.isVerified &&
          record.networkAsset.status === "ACTIVE" &&
          isBalanceMatchingDeployment(record, sourceDeployment),
      );
      if (!balance || BigInt(balance.atomicBalance) <= 0n) {
        throw new ApiFailure(
          400,
          "No available balance for the selected source asset.",
        );
      }
      if (amount > BigInt(balance.atomicBalance)) {
        throw new ApiFailure(
          400,
          "The amount exceeds the available source balance.",
        );
      }
    }

    const result = await quoteOneClickPreview({
      source,
      destination,
      operationId: body.operation + ":" + id,
      amountAtomic: amount.toString(),
      swapType: "EXACT_INPUT",
      recipient,
      refundTo,
      ...(body.operation === "CONVERT"
        ? { appFees: getConvertBridgeAppFees() }
        : {}),
      signal: request.signal,
    });
    if (!result.ok) {
      return reply(422, {
        ok: false,
        routeStatus: result.routeStatus,
        error: result.error,
      });
    }
    return reply(200, {
      ok: true,
      quote: result.quote,
      requestVersion: body.requestVersion,
    });
  });
}
