import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  verify as cryptoVerify,
} from "node:crypto";
import { test } from "node:test";
import { buildDefaultDenyCustodyPolicy } from "../src/domain/custody.ts";
import {
  assertIndexerEnvironment,
  assertOperatorEnvironment,
  assertPaymentEnvironment,
  assertWebEnvironment,
  assertWorkerEnvironment,
} from "../src/foundation/environment.ts";
import {
  MAX_HARD_PER_WALLET_SPONSOR_YOCTO,
  OUTLAYER_POLICY_CONTRACT_ID,
  readPolicySponsorConfig,
} from "../src/foundation/wallet-environment.ts";
import {
  buildStoreWalletPolicyTransactionBytes,
  encodeBase58,
  encodeSignedNearTransactionBase64,
  parseNearEd25519PrivateKey,
  STORE_WALLET_POLICY_GAS_TGAS,
  STORE_WALLET_POLICY_METHOD,
} from "../src/server/custody/near-policy-sponsor.ts";

const TEST_PW = "fixture-only-password";

function generateEphemeralNearKey(): {
  readonly rawPrivateKey: string;
  readonly expectedPublicKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const pub32 = spki.subarray(spki.length - 32);
  const seed32 = pkcs8.subarray(pkcs8.length - 32);
  return {
    rawPrivateKey: `ed25519:${encodeBase58(Buffer.concat([seed32, pub32]))}`,
    expectedPublicKey: `ed25519:${encodeBase58(pub32)}`,
  };
}

test("sponsor credentials are strictly isolated from web, worker, payment, indexer, and operator processes", () => {
  const key = generateEphemeralNearKey().rawPrivateKey;
  const envChecks: Array<{
    name: string;
    assertFn: (env: Record<string, string | undefined>) => void;
    baseEnv: Record<string, string | undefined>;
  }> = [
    {
      name: "web",
      assertFn: assertWebEnvironment,
      baseEnv: {
        FLOW_ENV: "local",
        FLOW_EXECUTION: "disabled",
        FLOW_DATABASE_URL: `postgresql://flow_local_app:${TEST_PW}@127.0.0.1:55432/flow_local`,
        FLOW_AUTH_SECRET: "a".repeat(32),
        FLOW_OTP_KEY: "b".repeat(32),
      },
    },
    {
      name: "worker",
      assertFn: assertWorkerEnvironment,
      baseEnv: {
        FLOW_ENV: "local",
        FLOW_EXECUTION: "disabled",
        FLOW_WORKER_DATABASE_URL: `postgresql://flow_local_worker:${TEST_PW}@127.0.0.1:55432/flow_local`,
      },
    },
    {
      name: "payment",
      assertFn: assertPaymentEnvironment,
      baseEnv: {
        FLOW_ENV: "local",
        FLOW_EXECUTION: "disabled",
        FLOW_PAYMENT_DATABASE_URL: `postgresql://flow_local_payment_worker:${TEST_PW}@127.0.0.1:55432/flow_local`,
      },
    },
    {
      name: "indexer",
      assertFn: assertIndexerEnvironment,
      baseEnv: {
        FLOW_ENV: "local",
        FLOW_EXECUTION: "disabled",
        FLOW_INDEXER_DATABASE_URL: `postgresql://flow_local_indexer_worker:${TEST_PW}@127.0.0.1:55432/flow_local`,
      },
    },
    {
      name: "operator",
      assertFn: assertOperatorEnvironment,
      baseEnv: {
        FLOW_ENV: "local",
        FLOW_EXECUTION: "disabled",
        FLOW_OPERATOR_DATABASE_URL: `postgresql://flow_local_operator:${TEST_PW}@127.0.0.1:55432/flow_local`,
      },
    },
  ];

  for (const check of envChecks) {
    assert.throws(
      () =>
        check.assertFn({
          ...check.baseEnv,
          FLOW_NEAR_SPONSOR_PRIVATE_KEY: key,
        }),
      { code: "INVALID_CONFIGURATION" },
      `${check.name} process must reject FLOW_NEAR_SPONSOR_PRIVATE_KEY`,
    );
    assert.throws(
      () =>
        check.assertFn({
          ...check.baseEnv,
          FLOW_NEAR_SPONSOR_SIGNER_TOKEN: "signer-bearer-token-value",
        }),
      { code: "INVALID_CONFIGURATION" },
      `${check.name} process must reject FLOW_NEAR_SPONSOR_SIGNER_TOKEN`,
    );
  }
});

test("readPolicySponsorConfig enforces fail-closed bounds, HTTPS URLs, signer exclusivity, and contract identity", () => {
  const { rawPrivateKey } = generateEphemeralNearKey();

  assert.deepEqual(
    readPolicySponsorConfig({ FLOW_POLICY_SPONSOR_ENABLED: "disabled" }),
    { enabled: false },
  );

  const validLocal = readPolicySponsorConfig({
    NODE_ENV: "production",
    FLOW_POLICY_SPONSOR_ENABLED: "enabled",
    FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
    FLOW_NEAR_SPONSOR_PRIVATE_KEY: rawPrivateKey,
  });
  assert.equal(validLocal.enabled, true);
  if (validLocal.enabled) {
    assert.equal(validLocal.signerMode, "local-ed25519");
    assert.equal(validLocal.contractId, OUTLAYER_POLICY_CONTRACT_ID);
    assert.equal(validLocal.sponsorAccountId, "flow-policy-sponsor.near");
  }

  const validRemote = readPolicySponsorConfig({
    NODE_ENV: "production",
    FLOW_POLICY_SPONSOR_ENABLED: "enabled",
    FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
    FLOW_NEAR_SPONSOR_SIGNER_URL: "https://signer.internal.flow.example/sign",
    FLOW_NEAR_SPONSOR_SIGNER_TOKEN: "a".repeat(24),
    FLOW_NEAR_SPONSOR_APPROVAL_ACCOUNT_ID: "flow-policy-admin.near",
    FLOW_NEAR_SPONSOR_LOCK_INITIAL_POLICY: "true",
  });
  assert.equal(validRemote.enabled, true);
  if (validRemote.enabled) {
    assert.equal(validRemote.signerMode, "remote-signer");
    assert.equal(validRemote.approvalAccountId, "flow-policy-admin.near");
    assert.equal(validRemote.lockInitialPolicy, true);
  }

  // Reject non-outlayer.near contract when not in test override mode
  assert.throws(
    () =>
      readPolicySponsorConfig({
        NODE_ENV: "production",
        FLOW_POLICY_SPONSOR_ENABLED: "enabled",
        FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
        FLOW_NEAR_POLICY_CONTRACT_ID: "attacker.near",
        FLOW_NEAR_SPONSOR_PRIVATE_KEY: rawPrivateKey,
      }),
    { code: "INVALID_CONFIGURATION" },
  );

  // Reject non-HTTPS RPC URL outside loopback
  assert.throws(
    () =>
      readPolicySponsorConfig({
        NODE_ENV: "production",
        FLOW_POLICY_SPONSOR_ENABLED: "enabled",
        FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
        FLOW_NEAR_RPC_URL: "http://rpc.mainnet.near.org",
        FLOW_NEAR_SPONSOR_PRIVATE_KEY: rawPrivateKey,
      }),
    { code: "INVALID_CONFIGURATION" },
  );

  // Reject mixing local private key and remote signer URL
  assert.throws(
    () =>
      readPolicySponsorConfig({
        NODE_ENV: "production",
        FLOW_POLICY_SPONSOR_ENABLED: "enabled",
        FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
        FLOW_NEAR_SPONSOR_PRIVATE_KEY: rawPrivateKey,
        FLOW_NEAR_SPONSOR_SIGNER_URL: "https://signer.internal.flow.example/sign",
        FLOW_NEAR_SPONSOR_SIGNER_TOKEN: "a".repeat(24),
      }),
    { code: "INVALID_CONFIGURATION" },
  );

  // Reject per-wallet cap above absolute 0.05 NEAR protocol ceiling
  assert.throws(
    () =>
      readPolicySponsorConfig({
        NODE_ENV: "production",
        FLOW_POLICY_SPONSOR_ENABLED: "enabled",
        FLOW_NEAR_SPONSOR_ACCOUNT_ID: "flow-policy-sponsor.near",
        FLOW_NEAR_SPONSOR_PRIVATE_KEY: rawPrivateKey,
        FLOW_NEAR_SPONSOR_MAX_PER_WALLET_YOCTO: (
          MAX_HARD_PER_WALLET_SPONSOR_YOCTO + 1n
        ).toString(),
      }),
    { code: "INVALID_CONFIGURATION" },
  );
});

test("Borsh store_wallet_policy builder signs deterministically and blocks arbitrary destinations or over-cap deposits", () => {
  const { rawPrivateKey, expectedPublicKey } = generateEphemeralNearKey();
  const keyPair = parseNearEd25519PrivateKey(rawPrivateKey);
  assert.equal(keyPair.publicKeyString, expectedPublicKey);

  const blockHashBase58 = encodeBase58(randomBytes(32));
  const walletPubkey = `ed25519:${"ab".repeat(32)}`;
  const depositYocto = 14_230_000_000_000_000_000_000n; // 0.01423 NEAR

  const { txBytes, txHash, argsJson } = buildStoreWalletPolicyTransactionBytes({
    signerId: "flow-policy-sponsor.near",
    publicKeyBytes: keyPair.publicKeyBytes,
    nonce: 42n,
    receiverId: OUTLAYER_POLICY_CONTRACT_ID,
    blockHashBase58,
    depositYocto,
    maxDepositYocto: 30_000_000_000_000_000_000_000n,
    args: {
      wallet_pubkey: walletPubkey,
      encrypted_data: "ZW5jcnlwdGVk",
      wallet_signature: "cc".repeat(64),
      version: 1,
      locked: false,
      valid_until: 1_900_000_000,
      storage_refund_to: "flow-policy-sponsor.near",
    },
  });

  const digest = createHash("sha256").update(txBytes).digest();
  assert.equal(txHash, encodeBase58(digest));
  const sig = keyPair.signDigest(digest);
  const signedBase64 = encodeSignedNearTransactionBase64(txBytes, sig);
  const signedBuf = Buffer.from(signedBase64, "base64");
  assert.equal(signedBuf[txBytes.length], 0); // Signature::Ed25519 tag
  assert.equal(signedBuf.length, txBytes.length + 1 + 64);

  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    keyPair.publicKeyBytes,
  ]);
  assert.equal(
    cryptoVerify(
      null,
      digest,
      { key: spki, format: "der", type: "spki" },
      sig,
    ),
    true,
  );
  assert.ok(argsJson.includes(`"${STORE_WALLET_POLICY_METHOD}"`) === false);
  assert.ok(txBytes.includes(Buffer.from(STORE_WALLET_POLICY_METHOD, "utf8")));
  assert.equal(STORE_WALLET_POLICY_GAS_TGAS, 100_000_000_000_000n);

  // Reject non-outlayer.near contract
  assert.throws(
    () =>
      buildStoreWalletPolicyTransactionBytes({
        signerId: "flow-policy-sponsor.near",
        publicKeyBytes: keyPair.publicKeyBytes,
        nonce: 43n,
        receiverId: "arbitrary-contract.near",
        blockHashBase58,
        depositYocto,
        maxDepositYocto: 30_000_000_000_000_000_000_000n,
        args: {
          wallet_pubkey: walletPubkey,
          encrypted_data: "ZW5jcnlwdGVk",
          wallet_signature: "cc".repeat(64),
          version: 1,
          locked: false,
          valid_until: 1_900_000_000,
          storage_refund_to: "flow-policy-sponsor.near",
        },
      }),
    { code: "POLICY_SPONSOR_TARGET_DENIED" },
  );

  // Reject storage_refund_to pointing away from sponsor
  assert.throws(
    () =>
      buildStoreWalletPolicyTransactionBytes({
        signerId: "flow-policy-sponsor.near",
        publicKeyBytes: keyPair.publicKeyBytes,
        nonce: 43n,
        receiverId: OUTLAYER_POLICY_CONTRACT_ID,
        blockHashBase58,
        depositYocto,
        maxDepositYocto: 30_000_000_000_000_000_000_000n,
        args: {
          wallet_pubkey: walletPubkey,
          encrypted_data: "ZW5jcnlwdGVk",
          wallet_signature: "cc".repeat(64),
          version: 1,
          locked: false,
          valid_until: 1_900_000_000,
          storage_refund_to: "other.near",
        },
      }),
    { code: "POLICY_SPONSOR_TARGET_DENIED" },
  );

  // Reject deposit above configured cap
  assert.throws(
    () =>
      buildStoreWalletPolicyTransactionBytes({
        signerId: "flow-policy-sponsor.near",
        publicKeyBytes: keyPair.publicKeyBytes,
        nonce: 43n,
        receiverId: OUTLAYER_POLICY_CONTRACT_ID,
        blockHashBase58,
        depositYocto: 31_000_000_000_000_000_000_000n,
        maxDepositYocto: 30_000_000_000_000_000_000_000n,
        args: {
          wallet_pubkey: walletPubkey,
          encrypted_data: "ZW5jcnlwdGVk",
          wallet_signature: "cc".repeat(64),
          version: 1,
          locked: false,
          valid_until: 1_900_000_000,
          storage_refund_to: "flow-policy-sponsor.near",
        },
      }),
    { code: "POLICY_SPONSOR_CAP_EXCEEDED" },
  );
});

test("buildDefaultDenyCustodyPolicy supports optional locked multi-sig admin approval while keeping all transfers denied", () => {
  const lockedPolicy = buildDefaultDenyCustodyPolicy({
    approvalAccountId: "flow-policy-admin.near",
    lockPolicy: true,
  });

  assert.equal(lockedPolicy.rules.limits.per_transaction["*"], "0");
  assert.equal(lockedPolicy.rules.limits.daily["*"], "0");
  assert.deepEqual(lockedPolicy.rules.transaction_types, []);
  assert.equal(lockedPolicy.capabilities.evm_sign.allowed, false);
  assert.equal(lockedPolicy.capabilities.solana_sign.allowed, false);
  assert.deepEqual(lockedPolicy.approval, {
    threshold: 1,
    approvers: [{ id: "flow-policy-admin.near", role: "admin" }],
    locked: true,
  });
});
