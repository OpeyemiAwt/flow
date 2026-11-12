import assert from "node:assert/strict";
import test from "node:test";
import { parseDisplayToAtomic } from "../src/domain/atomic-amounts.ts";
import { resolveQuoteAsset } from "../src/server/providers/near-intents-discovery.ts";
import {
  quoteOneClickPreview,
  validateProviderAddress,
} from "../src/server/providers/one-click-preview.ts";

test("previews use exact provider atomic amounts and fee denominations", async (t) => {
  const oldEnvironment = process.env.FLOW_ENV;
  process.env.FLOW_ENV = "test";
  t.after(() => {
    if (oldEnvironment === undefined) delete process.env.FLOW_ENV;
    else process.env.FLOW_ENV = oldEnvironment;
  });
  let fixtureOutput = "5853077195269072290382299549";
  let fixtureWithdrawalFee: string | undefined = "0";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      assert.equal(payload.dry, true);
      assert.equal(payload.recipientType, "DESTINATION_CHAIN");
      return Response.json({
        quoteRequest: payload,
        signature: "0x1clickfixturesignature",
        timestamp: new Date().toISOString(),
        quote: {
          amountIn: payload.amount,
          amountOut: fixtureOutput,
          amountOutFormatted: "99999",
          amountOutUsd: "99999",
          withdrawFee: fixtureWithdrawalFee,
        },
      });
    },
  );
  const eth = await resolveQuoteAsset("ethereum-mainnet:ETH");
  const near = await resolveQuoteAsset("near-mainnet:NEAR");
  const usdc = await resolveQuoteAsset("base-mainnet:USDC");
  assert.ok(eth && near && usdc);
  const common = {
    operationId: "fixture-operation",
    swapType: "EXACT_INPUT" as const,
    refundTo: "0x1111111111111111111111111111111111111111",
  };
  const addMoney = await quoteOneClickPreview({
    ...common,
    source: eth,
    destination: near,
    amountAtomic: parseDisplayToAtomic("10", eth.decimals).toString(),
    recipient: "fixture.near",
  });
  assert.ok(addMoney.ok);
  assert.equal(addMoney.quote.identity.destinationAsset, "nep141:wrap.near");
  assert.equal(addMoney.quote.identity.amountAtomic, "10000000000000000000");
  assert.equal(
    addMoney.quote.recipientDisplayAmount,
    "5853.077195269072290382299549",
  );
  assert.equal(addMoney.quote.fees.withdrawFeeDisplay, "0");
  assert.equal(addMoney.quote.fees.refundFeeDisplay, null);
  assert.equal(addMoney.quote.canExecute, false);

  fixtureOutput = "459082174293001";
  fixtureWithdrawalFee = "35000000000000";
  const send = await quoteOneClickPreview({
    ...common,
    source: usdc,
    destination: eth,
    amountAtomic: parseDisplayToAtomic("1", usdc.decimals).toString(),
    recipient: "0x2222222222222222222222222222222222222222",
  });
  assert.ok(send.ok);
  assert.equal(send.quote.amountInAtomic, "1000000");
  assert.equal(send.quote.recipientDisplayAmount, "0.000459082174293001");
  assert.equal(send.quote.fees.withdrawFeeDisplay, "0.000035");
  assert.equal(send.quote.fees.withdrawFeeAssetSymbol, "ETH");
  assert.equal(send.quote.estimatedTimeSeconds, null);
});

test("quote refund formats follow Sui, Tron and Monad", () => {
  const sui = {
    networkKey: "sui-mainnet",
    networkName: "Sui",
    ecosystem: "other" as const,
  };
  const tron = {
    networkKey: "tron-mainnet",
    networkName: "Tron",
    ecosystem: "other" as const,
  };
  const monad = {
    networkKey: "monad-mainnet",
    networkName: "Monad",
    ecosystem: "evm" as const,
  };
  const evmAddress = "0x" + "1".repeat(40);
  assert.equal(validateProviderAddress(sui, "0x" + "1".repeat(64)).valid, true);
  assert.match(validateProviderAddress(sui, evmAddress).reason ?? "", /Sui/);
  assert.equal(
    validateProviderAddress(tron, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb").valid,
    true,
  );
  assert.equal(
    validateProviderAddress(tron, "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwc").valid,
    false,
  );
  assert.equal(validateProviderAddress(monad, evmAddress).valid, true);
  assert.match(validateProviderAddress(monad, "invalid").reason ?? "", /Monad/);
});
