import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { test } from "node:test";
import { FlowError } from "../src/foundation/errors.ts";
import { assertCustodyEnvironment } from "../src/foundation/environment.ts";
import type { FlowDb } from "../src/foundation/prisma.ts";
import { processAssistantQuery } from "../src/server/ai-assistant-service.ts";
import {
  decodeBase58,
  resolveChainRpc,
} from "../src/server/custody/outgoing-executor.ts";
import { OutLayerAdapter } from "../src/server/custody/outlayer-adapter.ts";
import { getAccountNotifications } from "../src/server/notifications-service.ts";

function buildMockDb(
  handler: (sql: string, values: unknown[]) => unknown,
): FlowDb {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      return handler(sql, values);
    },
    $executeRaw: async () => 0,
  } as unknown as FlowDb;
}

test("M36 migration enforces RLS, least-privilege SECURITY DEFINER functions, and cross-chain provider state", async () => {
  const migrationPath = path.join(
    process.cwd(),
    "prisma/migrations/20261117000000_mvp_settings_add_money_outgoing/migration.sql",
  );
  const sql = await readFile(migrationPath, "utf8");

  for (const table of [
    "user_profile_preferences",
    "account_notification_preferences",
    "add_money_intents",
    "outgoing_transfer_jobs",
  ]) {
    assert.match(
      sql,
      new RegExp(`ALTER TABLE flow\\.${table} ENABLE ROW LEVEL SECURITY;`),
      `Expected RLS enabled on flow.${table}`,
    );
    assert.match(
      sql,
      new RegExp(`ALTER TABLE flow\\.${table} FORCE ROW LEVEL SECURITY;`),
      `Expected FORCE RLS on flow.${table}`,
    );
  }

  for (const fn of [
    "claim_active_add_money_intents",
    "transition_add_money_intent",
    "claim_outgoing_transfer_for_custody",
    "mark_outgoing_transfer_signing_started",
    "mark_outgoing_transfer_broadcast",
    "fail_outgoing_transfer_before_broadcast",
    "claim_outgoing_transfers_for_confirmation",
    "complete_outgoing_transfer_settlement",
  ]) {
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION flow\\.${fn}`));
  }

  assert.match(sql, /provider_deposit_address IS NOT NULL/);
  assert.doesNotMatch(sql, /\bGRANT\s+ALL\b/i);
});

test("assertCustodyEnvironment supports execute mode only with compatibility disabled", () => {
  const baseEnv = {
    FLOW_ENV: "staging",
    FLOW_CUSTODY_DATABASE_URL:
      "postgresql://flow_custody:secret@127.0.0.1:5432/flow",
    FLOW_WALLET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    FLOW_CUSTODY_WORKER_MODE: "execute",
  };

  assert.doesNotThrow(() =>
    assertCustodyEnvironment({
      ...baseEnv,
      FLOW_EXECUTION: "enabled",
      FLOW_PROVIDER_COMPATIBILITY_MODE: "disabled",
    }),
  );

  assert.throws(
    () =>
      assertCustodyEnvironment({
        ...baseEnv,
        FLOW_EXECUTION: "enabled",
        FLOW_PROVIDER_COMPATIBILITY_MODE: "authorized",
      }),
    (err: unknown) =>
      err instanceof FlowError && err.code === "INVALID_CONFIGURATION",
  );

  assert.throws(
    () =>
      assertCustodyEnvironment({
        FLOW_ENV: "staging",
        FLOW_CUSTODY_DATABASE_URL:
          "postgresql://flow_custody:secret@127.0.0.1:5432/flow",
        FLOW_WALLET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
        FLOW_CUSTODY_WORKER_MODE: "provision",
        FLOW_EXECUTION: "enabled",
        FLOW_PROVIDER_COMPATIBILITY_MODE: "disabled",
      }),
    (err: unknown) =>
      err instanceof FlowError && err.code === "INVALID_CONFIGURATION",
  );
});

test("OutLayerAdapter blocks live signing/transfer methods when execution is disabled and hits endpoints in rehearsal", async () => {
  const previousExec = process.env.FLOW_EXECUTION;
  const requests: Array<{ url: string; method: string; auth?: string }> = [];
  const server = createServer((req, res) => {
    requests.push({
      url: req.url ?? "",
      method: req.method ?? "",
      auth: req.headers.authorization,
    });
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("/wallet/v1/transfer")) {
      res.end(
        JSON.stringify({
          request_id: "req_near_1",
          status: "success",
          tx_hash: "tx_near_1",
        }),
      );
      return;
    }
    if (req.url?.includes("/wallet/v1/call")) {
      res.end(
        JSON.stringify({
          request_id: "req_call_1",
          status: "success",
          tx_hash: "tx_call_1",
        }),
      );
      return;
    }
    if (req.url?.includes("/wallet/v1/evm/sign-transaction")) {
      res.end(
        JSON.stringify({
          signature: "0xabc123",
          chain: "base",
          wallet_id: "wallet_1",
        }),
      );
      return;
    }
    if (req.url?.includes("/wallet/v1/solana/sign-transaction")) {
      res.end(
        JSON.stringify({
          signature: "11111sig",
          chain: "solana",
          wallet_id: "wallet_1",
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        request_id: "req_near_1",
        type: "transfer",
        status: "success",
        result: { tx_hash: "tx_near_1" },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl =
    address && typeof address === "object"
      ? `http://127.0.0.1:${address.port}`
      : "";

  try {
    process.env.FLOW_EXECUTION = "disabled";
    const blockedAdapter = new OutLayerAdapter(baseUrl);
    await assert.rejects(
      () =>
        blockedAdapter.transferNearNative("wk_secret", {
          to: "alice.near",
          amountYocto: "1000",
        }),
      (err: unknown) =>
        err instanceof FlowError && err.code === "CUSTODY_EXECUTION_BLOCKED",
    );
    await assert.rejects(
      () =>
        blockedAdapter.callNearContract("wk_secret", {
          receiverId: "usdc.tether-token.near",
          methodName: "ft_transfer",
          args: { receiver_id: "alice.near", amount: "1000" },
        }),
      (err: unknown) =>
        err instanceof FlowError && err.code === "CUSTODY_EXECUTION_BLOCKED",
    );
    await assert.rejects(
      () =>
        blockedAdapter.signEvmTransaction("wk_secret", {
          chain: "base",
          unsignedTxHex: "0x02c0",
        }),
      (err: unknown) =>
        err instanceof FlowError && err.code === "CUSTODY_EXECUTION_BLOCKED",
    );
    await assert.rejects(
      () =>
        blockedAdapter.signSolanaTransaction("wk_secret", {
          unsignedTxBase64: "AQAA",
        }),
      (err: unknown) =>
        err instanceof FlowError && err.code === "CUSTODY_EXECUTION_BLOCKED",
    );
    await assert.rejects(
      () => blockedAdapter.getRequestStatus("wk_secret", "req_near_1"),
      (err: unknown) =>
        err instanceof FlowError && err.code === "CUSTODY_EXECUTION_BLOCKED",
    );
    assert.equal(requests.length, 0);

    process.env.FLOW_EXECUTION = "enabled";
    const liveAdapter = new OutLayerAdapter(baseUrl);
    const nearTx = await liveAdapter.transferNearNative("wk_live", {
      to: "alice.near",
      amountYocto: "1000",
    });
    assert.equal(nearTx.tx_hash, "tx_near_1");

    const callTx = await liveAdapter.callNearContract("wk_live", {
      receiverId: "usdc.tether-token.near",
      methodName: "ft_transfer",
      args: { receiver_id: "alice.near", amount: "1000" },
    });
    assert.equal(callTx.tx_hash, "tx_call_1");

    const evmSig = await liveAdapter.signEvmTransaction("wk_live", {
      chain: "base",
      unsignedTxHex: "0x02c0",
    });
    assert.equal(evmSig.signature, "0xabc123");

    const solSig = await liveAdapter.signSolanaTransaction("wk_live", {
      unsignedTxBase64: "AQAA",
    });
    assert.equal(solSig.signature, "11111sig");

    const reqStatus = await liveAdapter.getRequestStatus(
      "wk_live",
      "req_near_1",
    );
    assert.equal(reqStatus.status, "success");
    assert.equal(requests.length, 5);
    assert.ok(requests.every((r) => r.auth === "Bearer wk_live"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousExec === undefined) {
      delete process.env.FLOW_EXECUTION;
    } else {
      process.env.FLOW_EXECUTION = previousExec;
    }
  }
});

test("decodeBase58 and resolveChainRpc handle Solana keys/signatures and network mapping", () => {
  const systemProgramBytes = decodeBase58(
    "11111111111111111111111111111111",
    32,
  );
  assert.equal(systemProgramBytes.length, 32);
  assert.ok(systemProgramBytes.every((b) => b === 0));

  assert.throws(
    () => decodeBase58("0OIl", 32),
    (err: unknown) =>
      err instanceof FlowError && err.code === "CUSTODY_PROVIDER_ERROR",
  );
  assert.throws(
    () => decodeBase58("111", 32),
    (err: unknown) =>
      err instanceof FlowError && err.code === "CUSTODY_PROVIDER_ERROR",
  );

  const baseMainnet = resolveChainRpc("base-mainnet", "mainnet");
  assert.ok(baseMainnet.primary.startsWith("http"));
  assert.ok(baseMainnet.fallback?.startsWith("http"));

  const solDevnet = resolveChainRpc("solana-mainnet", "testnet");
  assert.match(solDevnet.primary, /devnet/i);

  const nearMainnet = resolveChainRpc("near-mainnet", "mainnet");
  assert.ok(nearMainnet.primary.includes("near"));
});

test("getAccountNotifications honors account notification preferences and read state", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const viewerUserId = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-11-14T00:00:00Z");

  const db = buildMockDb((sql) => {
    if (sql.includes("FROM flow.payment_attempts pa")) {
      return [
        {
          attempt_id: "att_1",
          public_id: "pay_1",
          title: "Invoice #1",
          source_network: "base-mainnet",
          source_asset_symbol: "USDC",
          destination_network: "near-mainnet",
          destination_asset_symbol: "USDC",
          settled_atomic_amount: "25000000",
          destination_decimals: 6,
          settled_at: now,
          created_at: now,
        },
      ];
    }
    if (sql.includes("FROM flow.payment_requests")) {
      return [
        {
          id: "pr_1",
          public_id: "link_1",
          title: "Design Retainer",
          created_at: now,
        },
      ];
    }
    if (sql.includes("FROM flow.wallet_balances wb")) {
      return [
        {
          id: "wb_1",
          network: "solana-mainnet",
          last_error: "rpc timeout",
          observed_at: now,
        },
      ];
    }
    if (sql.includes("FROM flow.account_notification_preferences")) {
      return [
        {
          incoming_payments: false,
          payment_link_activity: true,
          security_alerts: true,
        },
      ];
    }
    if (sql.includes("FROM flow.account_notification_reads")) {
      return [{ notification_id: "notif_pr_pr_1" }];
    }
    return [];
  });

  const rows = await getAccountNotifications(db, accountId, viewerUserId);
  assert.equal(
    rows.some((r) => r.id === "notif_settled_att_1"),
    false,
  );
  const prNotif = rows.find((r) => r.id === "notif_pr_pr_1");
  assert.ok(prNotif);
  assert.equal(prNotif.isRead, true);
  const syncNotif = rows.find((r) => r.id === "notif_sync_wb_1");
  assert.ok(syncNotif);
  assert.equal(syncNotif.isRead, false);
});

test("processAssistantQuery returns structured balances, dynamic payment link drafts, and outgoing transfer status", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111";

  const db = buildMockDb((sql) => {
    if (sql.includes("FROM flow.wallet_balances wb")) {
      return [
        {
          symbol: "USDC",
          network: "base-mainnet",
          atomic_balance: "15000000",
          decimals: 6,
        },
      ];
    }
    if (sql.includes("FROM flow.outgoing_transfer_jobs")) {
      return [
        {
          public_id: "out_99",
          job_kind: "SEND",
          status: "CONFIRMING",
          source_atomic_amount: "5000000",
          source_decimals: 6,
          source_asset_symbol: "USDC",
          destination_asset_symbol: "USDC",
          source_tx_hash: "0xabc",
          destination_tx_hash: null,
          settled_at: null,
        },
      ];
    }
    if (sql.includes("FROM flow.wallet_activity_ledger wal")) {
      return [];
    }
    if (sql.includes("FROM flow.payment_requests pr")) {
      return [];
    }
    return [];
  });

  const balanceRes = await processAssistantQuery({
    accountId,
    prompt: "Check my wallet balance",
    db,
  });
  assert.ok(balanceRes.card);
  const cardData = balanceRes.card.data as {
    balances?: Array<{ asset: string; balance: string }>;
    assets?: Array<{ symbol: string; network: string; balance: string }>;
  };
  assert.equal(cardData.balances?.[0]?.asset, "USDC (base-mainnet)");
  assert.equal(cardData.balances?.[0]?.balance, "15");
  assert.equal(cardData.assets?.[0]?.symbol, "USDC");

  const linkRes = await processAssistantQuery({
    accountId,
    prompt:
      'Create a payment link for 42.5 SOL on Solana called "Hackathon Prize"',
    db,
  });
  assert.ok(linkRes.card);
  const draft = linkRes.card.data as {
    amount: string;
    assetSymbol: string;
    network: string;
    title: string;
  };
  assert.equal(draft.amount, "42.5");
  assert.equal(draft.assetSymbol, "SOL");
  assert.equal(draft.network, "solana-mainnet");
  assert.equal(draft.title, "Hackathon Prize");

  const statusRes = await processAssistantQuery({
    accountId,
    prompt: "What is the status of my recent payment?",
    db,
  });
  assert.ok(statusRes.card);
  const statusData = statusRes.card.data as {
    publicId?: string;
    status?: string;
    amount?: string;
  };
  assert.equal(statusData.publicId, "out_99");
  assert.equal(statusData.status, "CONFIRMING");
});
