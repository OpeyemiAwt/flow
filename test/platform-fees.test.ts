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
  isNearSourceGasSponsored,
  isNearToNearFlow,
  maxPrincipalBeforePlatformFee,
  resolveTransferFeeBreakdown,
  splitPlatformFee,
} from "../src/domain/platform-fees.ts";
import {
  checkNetworkGasBalance,
  computeMaxSendableAtomic,
} from "../src/domain/supported-assets-catalog.ts";
import {
  buildSponsorGasTopupTransactionBytes,
  buildSponsorStorageDepositTransactionBytes,
  computeNearGasTopupYocto,
  MAX_SINGLE_GAS_TOPUP_YOCTO,
} from "../src/server/custody/near-gas-sponsor.ts";

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

test("maxPrincipalBeforePlatformFee guarantees grossUp(maxPrincipal) <= maxGross and passes gas check across all 4 mainnets", () => {
  const cases: Array<{
    networkKey: string;
    balances: bigint[];
    minReserve: bigint;
  }> = [
    {
      networkKey: "ethereum-mainnet",
      minReserve: 1_500_000_000_000_000n, // 0.0015 ETH
      balances: [0n, 1_500_000_000_000_000n, 10_000_000_000_000_000n, 250_000_000_000_000_000n],
    },
    {
      networkKey: "base-mainnet",
      minReserve: 100_000_000_000_000n, // 0.0001 ETH
      balances: [0n, 100_000_000_000_000n, 500_000_000_000_000n, 50_000_000_000_000_000n],
    },
    {
      networkKey: "solana-mainnet",
      minReserve: 1_000_000n, // 0.001 SOL
      balances: [0n, 1_000_000n, 12_410_000n, 1_500_000_000n],
    },
    {
      networkKey: "near-mainnet",
      minReserve: 50_000_000_000_000_000_000_000n, // 0.05 NEAR
      balances: [
        0n,
        50_000_000_000_000_000_000_000n,
        150_000_000_000_000_000_000_000n,
        2_543_219_876_543_210_987_654_321n,
      ],
    },
  ];

  for (const c of cases) {
    for (const balanceAtomic of c.balances) {
      for (const feeBps of [0, CROSS_ASSET_SEND_FEE_BPS, CONVERT_BRIDGE_FEE_BPS]) {
        const afterGas = computeMaxSendableAtomic({
          networkKey: c.networkKey,
          sourceStandard: "NATIVE",
          balanceAtomic,
        });
        const maxPrincipal = maxPrincipalBeforePlatformFee(afterGas, feeBps);
        const { grossAtomic } = grossUpForPlatformFee(maxPrincipal, feeBps);
        assert.ok(
          grossAtomic <= afterGas,
          `${c.networkKey}: grossAtomic (${grossAtomic}) exceeded afterGas (${afterGas}) for feeBps=${feeBps}`,
        );
        if (maxPrincipal > 0n) {
          assert.ok(
            balanceAtomic - grossAtomic >= c.minReserve,
            `${c.networkKey}: remaining (${balanceAtomic - grossAtomic}) fell below reserve (${c.minReserve})`,
          );
          const gasCheck = checkNetworkGasBalance({
            networkKey: c.networkKey,
            sourceStandard: "NATIVE",
            requestedAmountAtomic: grossAtomic,
            nativeBalanceAtomic: balanceAtomic,
          });
          assert.equal(gasCheck.ok, true);
        }
      }
    }
  }
});

test("Solana native Max send leaves enough lamports for rent exemption plus base fee", () => {
  const RENT_EXEMPT_LAMPORTS = 890_880n;
  const BASE_FEE_LAMPORTS = 5_000n;
  const balanceAtomic = 12_410_000n; // 0.01241 SOL

  const maxSendable = computeMaxSendableAtomic({
    networkKey: "solana-mainnet",
    sourceStandard: "NATIVE",
    balanceAtomic,
  });
  const remainingAfterTx = balanceAtomic - maxSendable - BASE_FEE_LAMPORTS;
  assert.ok(
    remainingAfterTx >= RENT_EXEMPT_LAMPORTS,
    `remaining lamports (${remainingAfterTx}) must stay >= rent-exempt minimum (${RENT_EXEMPT_LAMPORTS})`,
  );

  // Sending too close to full balance (leaving < 0.001 SOL) must fail pre-check
  const tooClose = checkNetworkGasBalance({
    networkKey: "solana-mainnet",
    sourceStandard: "NATIVE",
    requestedAmountAtomic: 12_400_000n,
    nativeBalanceAtomic: balanceAtomic,
  });
  assert.equal(tooClose.ok, false);
});

test("NEAR-to-NEAR Send and Convert waive FLOW platform fees & gas reserves, while cross-chain keeps fees", () => {
  assert.equal(isNearToNearFlow("near-mainnet", "near-mainnet"), true);
  assert.equal(isNearToNearFlow("near-mainnet", "base-mainnet"), false);
  assert.equal(isNearToNearFlow("solana-mainnet", "near-mainnet"), false);

  const nearToNear = {
    sourceNetwork: "near-mainnet",
    destinationNetwork: "near-mainnet",
  };
  const nearToBase = {
    sourceNetwork: "near-mainnet",
    destinationNetwork: "base-mainnet",
  };

  assert.equal(getOperationPlatformFeeBps("SEND", false, nearToNear), 0);
  assert.deepEqual(getOperationAppFees("SEND", false, nearToNear), []);
  assert.equal(getOperationPlatformFeeBps("CONVERT", false, nearToNear), 0);
  assert.deepEqual(getOperationAppFees("CONVERT", false, nearToNear), []);

  // Cross-chain still carries platform fee
  assert.equal(getOperationPlatformFeeBps("SEND", false, nearToBase), 30);
  assert.equal(getOperationAppFees("SEND", false, nearToBase)[0]?.fee, 30);
  assert.equal(getOperationPlatformFeeBps("CONVERT", false, nearToBase), 150);
  assert.equal(getOperationAppFees("CONVERT", false, nearToBase)[0]?.fee, 150);

  // Gas-sponsored NEAR-to-NEAR allows 0 NEAR gas check & 100% Max sendable
  const zeroNearFtCheck = checkNetworkGasBalance({
    networkKey: "near-mainnet",
    sourceStandard: "NEP141",
    requestedAmountAtomic: 10_000_000n,
    nativeBalanceAtomic: 0n,
    gasSponsored: true,
  });
  assert.equal(zeroNearFtCheck.ok, true);

  const fullBalance = 1_500_000_000_000_000_000_000_000n; // 1.5 NEAR
  assert.equal(
    computeMaxSendableAtomic({
      networkKey: "near-mainnet",
      sourceStandard: "NATIVE",
      balanceAtomic: fullBalance,
      gasSponsored: true,
    }),
    fullBalance,
  );
});

test("NEAR gas sponsor top-up calculation and Borsh tx builders enforce safety bounds", () => {
  // Brand-new 0-NEAR wallet sending USDC on NEAR gets storage lock + FT gas buffer (~0.012 NEAR)
  const freshFtTopup = computeNearGasTopupYocto({
    isNativeTransfer: false,
    transferAmountYocto: 0n,
    senderAccount: { exists: false, balanceYocto: 0n, storageUsageBytes: 0n },
  });
  assert.equal(freshFtTopup, 12_000_000_000_000_000_000_001n); // 0.012 NEAR + 1 yocto ft_transfer deposit

  // Sending 100% Max of 2 NEAR gets exact deficit (~0.007 NEAR)
  const maxNativeTopup = computeNearGasTopupYocto({
    isNativeTransfer: true,
    transferAmountYocto: 2_000_000_000_000_000_000_000_000n,
    senderAccount: {
      exists: true,
      balanceYocto: 2_000_000_000_000_000_000_000_000n,
      storageUsageBytes: 182n,
    },
  });
  assert.equal(maxNativeTopup, 7_020_000_000_000_000_000_000n); // 0.00702 NEAR
  assert.ok(maxNativeTopup <= MAX_SINGLE_GAS_TOPUP_YOCTO);

  // Borsh Transfer & storage_deposit builders serialize cleanly
  const pubKey = Buffer.alloc(32, 7);
  const blockHash = "11111111111111111111111111111111";
  const topupTx = buildSponsorGasTopupTransactionBytes({
    signerId: "02e683a4da211743b6759d85a37e8ebe8d2ab22a22746d0c8c38f34395a0ae0c",
    publicKeyBytes: pubKey,
    nonce: 42n,
    receiverId: "alice.near",
    blockHashBase58: blockHash,
    amountYocto: 5_000_000_000_000_000_000_000n,
  });
  assert.ok(topupTx.txBytes.length > 64);
  assert.ok(topupTx.txHash.length > 20);

  const storageTx = buildSponsorStorageDepositTransactionBytes({
    signerId: "02e683a4da211743b6759d85a37e8ebe8d2ab22a22746d0c8c38f34395a0ae0c",
    publicKeyBytes: pubKey,
    nonce: 43n,
    tokenContractId: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    accountToRegister: "bob.near",
    blockHashBase58: blockHash,
    depositYocto: 1_250_000_000_000_000_000_000n,
  });
  assert.ok(storageTx.txBytes.length > 100);
  assert.match(storageTx.argsJson, /"registration_only":true/);
});

test("NEAR-to-other-chain routes sponsor NEAR gas while collecting platform fee, and Max deducts fee from amount sent", () => {
  assert.equal(isNearSourceGasSponsored("near-mainnet"), true);
  assert.equal(isNearSourceGasSponsored("base-mainnet"), false);
  assert.equal(isNearSourceGasSponsored("solana-mainnet"), false);

  const tenNear = 10_000_000_000_000_000_000_000_000n;
  const fourNear = 4_000_000_000_000_000_000_000_000n;

  // Clicking Max (feeInclusive: true) on 10 NEAR -> Base USDC (1.5% convert fee):
  // totalDebit stays 10 NEAR, fee (0.15 NEAR) is collected FROM the 10 NEAR, principal = 9.85 NEAR
  const maxConvert = resolveTransferFeeBreakdown({
    requestedAmountAtomic: tenNear,
    maxSpendableAtomic: tenNear,
    feeBps: CONVERT_BRIDGE_FEE_BPS,
    feeInclusive: true,
  });
  assert.equal(maxConvert.feeDeductedFromAmount, true);
  assert.equal(maxConvert.totalDebitAtomic, tenNear);
  assert.equal(maxConvert.feeAtomic, 150_000_000_000_000_000_000_000n); // 0.15 NEAR
  assert.equal(maxConvert.principalAtomic, 9_850_000_000_000_000_000_000_000n); // 9.85 NEAR

  // Clicking Max (feeInclusive: true) on 10 NEAR -> Base USDC (0.3% send fee):
  const maxSend = resolveTransferFeeBreakdown({
    requestedAmountAtomic: tenNear,
    maxSpendableAtomic: tenNear,
    feeBps: CROSS_ASSET_SEND_FEE_BPS,
    feeInclusive: true,
  });
  assert.equal(maxSend.feeDeductedFromAmount, true);
  assert.equal(maxSend.totalDebitAtomic, tenNear);
  assert.equal(maxSend.feeAtomic, 30_000_000_000_000_000_000_000n); // 0.03 NEAR
  assert.equal(maxSend.principalAtomic, 9_970_000_000_000_000_000_000_000n); // 9.97 NEAR

  // Manually typing full balance (10 NEAR out of 10 NEAR) without clicking Max also auto-deducts from amount
  const manualFull = resolveTransferFeeBreakdown({
    requestedAmountAtomic: tenNear,
    maxSpendableAtomic: tenNear,
    feeBps: CROSS_ASSET_SEND_FEE_BPS,
    feeInclusive: false,
  });
  assert.equal(manualFull.feeDeductedFromAmount, true);
  assert.equal(manualFull.totalDebitAtomic, tenNear);

  // Sending a partial amount (4 NEAR out of 10 NEAR) keeps charging fee on top
  const partial = resolveTransferFeeBreakdown({
    requestedAmountAtomic: fourNear,
    maxSpendableAtomic: tenNear,
    feeBps: CROSS_ASSET_SEND_FEE_BPS,
    feeInclusive: false,
  });
  assert.equal(partial.feeDeductedFromAmount, false);
  assert.equal(partial.principalAtomic, fourNear);
  assert.ok(partial.totalDebitAtomic > fourNear);
});
