import assert from "node:assert/strict";
import test from "node:test";
import {
  CONVERT_BRIDGE_FEE_BPS,
  CROSS_ASSET_SEND_FEE_BPS,
  DIRECT_SEND_FEE_BPS,
  EARN_DEPOSIT_FEE_BPS,
  getOperationAppFees,
  getOperationPlatformFeeBps,
  grossUpForPlatformFee,
  maxPrincipalBeforePlatformFee,
  splitPlatformFee,
} from "../src/domain/platform-fees.ts";
import {
  checkNetworkGasBalance,
  computeMaxSendableAtomic,
} from "../src/domain/supported-assets-catalog.ts";

test("direct same-asset send is free, cross-asset send & earn charge 0.3% (30 bps), and convert charges 1.5% (150 bps)", () => {
  assert.equal(DIRECT_SEND_FEE_BPS, 0);
  assert.equal(CROSS_ASSET_SEND_FEE_BPS, 30);
  assert.equal(EARN_DEPOSIT_FEE_BPS, 30);
  assert.equal(CONVERT_BRIDGE_FEE_BPS, 150);
  assert.equal(getOperationPlatformFeeBps("SEND", true), 0);
  assert.equal(getOperationPlatformFeeBps("SEND", false), 30);
  assert.equal(getOperationPlatformFeeBps("CONVERT", false), 150);
  assert.equal(getOperationPlatformFeeBps("ADD_MONEY", false), 0);

  assert.deepEqual(getOperationAppFees("SEND", true), []);
  const crossSendFees = getOperationAppFees("SEND", false);
  assert.equal(crossSendFees.length, 1);
  assert.equal(crossSendFees[0]?.fee, 30);

  const convertFees = getOperationAppFees("CONVERT", false);
  assert.equal(convertFees.length, 1);
  assert.equal(convertFees[0]?.fee, 150);
});

test("grossUpForPlatformFee charges fee on top of principal so net >= principal", () => {
  const testPrincipals = [
    1n,
    10n,
    999n,
    10_000n,
    1_000_000n, // 1 USDC
    12_345_678n,
    1_000_000_000n, // 1 SOL
    100_000_000_000_000_000n, // 0.1 ETH
    2_000_000_000_000_000_000_000_000n, // 2 NEAR
    999_999_999_999_999_999_999_999n,
  ];
  for (const feeBps of [CROSS_ASSET_SEND_FEE_BPS, EARN_DEPOSIT_FEE_BPS, CONVERT_BRIDGE_FEE_BPS]) {
    for (const principal of testPrincipals) {
      const { feeAtomic, grossAtomic } = grossUpForPlatformFee(principal, feeBps);
      assert.equal(grossAtomic, principal + feeAtomic);
      assert.ok(feeAtomic >= 0n);
      // Protocol / 1Click takes floor(gross * feeBps / 10_000)
      const { netAtomic } = splitPlatformFee(grossAtomic, feeBps);
      assert.ok(
        netAtomic >= principal,
        `net (${netAtomic}) must be >= principal (${principal}) for feeBps=${feeBps}`,
      );
    }
  }
});

test("maxPrincipalBeforePlatformFee guarantees grossUp(maxPrincipal) <= maxGross and passes gas check", () => {
  const balances = [
    0n,
    10_000_000_000_000_000_000_000n, // exact NEAR reserve (0.01 NEAR)
    15_000_000_000_000_000_000_000n, // 0.015 NEAR
    1_010_000_000_000_000_000_000_000n, // 1.01 NEAR
    2_543_219_876_543_210_987_654_321n, // arbitrary NEAR
  ];
  for (const balanceAtomic of balances) {
    for (const feeBps of [0, CROSS_ASSET_SEND_FEE_BPS, CONVERT_BRIDGE_FEE_BPS]) {
      const afterGas = computeMaxSendableAtomic({
        networkKey: "near-mainnet",
        sourceStandard: "NATIVE",
        balanceAtomic,
      });
      const maxPrincipal = maxPrincipalBeforePlatformFee(afterGas, feeBps);
      const { grossAtomic } = grossUpForPlatformFee(maxPrincipal, feeBps);
      assert.ok(
        grossAtomic <= afterGas,
        `grossAtomic (${grossAtomic}) exceeded afterGas (${afterGas}) for feeBps=${feeBps}`,
      );
      if (maxPrincipal > 0n) {
        const gasCheck = checkNetworkGasBalance({
          networkKey: "near-mainnet",
          sourceStandard: "NATIVE",
          requestedAmountAtomic: grossAtomic,
          nativeBalanceAtomic: balanceAtomic,
        });
        assert.equal(gasCheck.ok, true);
      }
    }
  }
});
