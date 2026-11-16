import test from "node:test";
import assert from "node:assert/strict";
import {
  getDiscoveredTokens,
  isUserFacingWrappedToken,
  normalizeDiscoveredToken,
  resolveQuoteAsset,
} from "../src/server/providers/near-intents-discovery.ts";
import {
  getAccountNotifications,
  markNotificationsAsRead,
} from "../src/server/notifications-service.ts";
import { processAssistantQuery } from "../src/server/ai-assistant-service.ts";

test("near-intents-discovery: excludes wrapped tokens and assigns capabilities", async () => {
  // Test raw mapping
  const rawWrapped = {
    assetId: "wrap.near",
    decimals: 24,
    blockchain: "near",
    symbol: "wNEAR",
    price: 3.5,
  };
  const discoveredWrapped = normalizeDiscoveredToken(rawWrapped);
  assert.equal(discoveredWrapped.isWrapped, true);
  assert.equal(isUserFacingWrappedToken("WETH(DEPRECATED)", "ethereum"), true);
  assert.equal(isUserFacingWrappedToken("cbBTC", "coinbase-wrapped-btc"), true);
  assert.equal(isUserFacingWrappedToken("wNEARKAT", "nearkat-2"), false);
  assert.equal(
    discoveredWrapped.capabilities.includes("CAN_DIRECT_DEPOSIT"),
    false,
  );

  const rawUsdc = {
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    decimals: 6,
    blockchain: "base",
    symbol: "USDC",
    contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    price: 1.0,
  };
  const discoveredUsdc = normalizeDiscoveredToken(rawUsdc);
  assert.equal(discoveredUsdc.isWrapped, false);
  assert.equal(discoveredUsdc.capabilities.includes("CAN_HOLD_IN_FLOW"), true);
  assert.equal(
    discoveredUsdc.capabilities.includes("DISCOVERABLE_BY_PROVIDER"),
    true,
  );
  assert.equal(
    discoveredUsdc.capabilities.includes("CAN_DIRECT_DEPOSIT"),
    true,
  );
});

test("near-intents-discovery: keeps exact provider asset IDs and chain context", async (t) => {
  const fixture = [
    {
      assetId: "nep141:sui.omft.near",
      blockchain: "sui",
      symbol: "SUI",
      decimals: 9,
    },
    {
      assetId: "nep141:tron.omft.near",
      blockchain: "tron",
      symbol: "TRX",
      decimals: 6,
    },
    {
      assetId: "nep245:v2_1.omni.hot.tg:143_11111111111111111111",
      blockchain: "monad",
      symbol: "MON",
      decimals: 18,
    },
    {
      assetId: "nep141:wrap.near",
      blockchain: "near",
      symbol: "wNEAR",
      decimals: 24,
      contractAddress: "wrap.near",
    },
    {
      assetId: "nep141:bridged-usdc.near",
      blockchain: "base",
      symbol: "USDC",
      decimals: 6,
      contractAddress: "0x1111111111111111111111111111111111111111",
    },
  ];
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json(fixture),
  );
  const tokens = await getDiscoveredTokens({
    forceRefresh: true,
    excludeWrapped: true,
  });
  for (const row of fixture.slice(0, 3)) {
    const token = await resolveQuoteAsset(row.assetId);
    assert.equal(token?.id, row.assetId);
    assert.equal(token?.networkKey, row.blockchain + "-mainnet");
    assert.equal(token?.symbol, row.symbol);
    assert.equal(
      token?.capabilities.includes("DISCOVERABLE_BY_PROVIDER"),
      true,
    );
    assert.equal(token?.capabilities.includes("CAN_RECEIVE_TO"), false);
  }
  const btc = normalizeDiscoveredToken({
    assetId: "nep141:btc.omft.near",
    blockchain: "btc",
    symbol: "BTC",
    decimals: 8,
  });
  assert.equal(btc.networkKey, "bitcoin-mainnet");
  assert.deepEqual(btc.capabilities, ["DISCOVERABLE_BY_PROVIDER"]);
  assert.equal(await resolveQuoteAsset("SUI"), null);
  assert.equal(await resolveQuoteAsset("USDC"), null);
  assert.equal(await resolveQuoteAsset("nep141:unknown.near"), null);
  assert.equal(
    (
      await resolveQuoteAsset("nep141:bridged-usdc.near")
    )?.capabilities.includes("CAN_HOLD_IN_FLOW"),
    false,
  );
  assert.equal((await resolveQuoteAsset("near-mainnet:NEAR"))?.decimals, 24);
  assert.ok(
    tokens.length > 0,
    "Tokens should be returned from live or fallback",
  );

  // Verify none of the returned tokens are user-facing wrapped tokens
  const forbidden = ["wNEAR", "WETH", "WBTC", "WSOL", "WAVAX"];
  for (const t of tokens) {
    assert.equal(
      forbidden.includes(t.symbol),
      false,
      `Token ${t.symbol} should have been excluded`,
    );
  }

  // Verify cache hit by requesting immediately again
  const cached = await getDiscoveredTokens({ excludeWrapped: true });
  assert.equal(cached.length, tokens.length);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("notifications-service: persists read IDs idempotently for one account and user", async () => {
  const executions: unknown[] = [];
  const db = {
    $executeRaw: async (query: unknown) => {
      executions.push(query);
      return 2;
    },
  } as unknown as import("../src/foundation/prisma.ts").FlowDb;
  await markNotificationsAsRead(db, "account-id", "user-id", [
    "notif-a",
    "notif-b",
  ]);
  assert.equal(executions.length, 1);
  assert.match(String(executions[0]), /account_notification_reads/);
  assert.match(String(executions[0]), /ON CONFLICT/);
});

test("notifications-service: loads persisted read state and propagates query failure", async () => {
  const db = {
    $queryRaw: async (query: unknown) => {
      const sql = String(query);
      if (sql.includes("payment_attempts")) {
        return [
          {
            attempt_id: "attempt-1",
            public_id: "pay-test",
            title: "Test invoice",
            source_network: "base-mainnet",
            source_asset_symbol: "USDC",
            destination_network: "base-mainnet",
            destination_asset_symbol: "USDC",
            settled_atomic_amount: "1000000",
            destination_decimals: 6,
            settled_at: new Date("2026-11-14T00:00:00Z"),
            created_at: new Date("2026-11-13T00:00:00Z"),
          },
        ];
      }
      if (sql.includes("payment_requests")) return [];
      if (sql.includes("wallet_balances")) return [];
      if (sql.includes("account_notification_reads")) {
        return [{ notification_id: "notif_settled_attempt-1" }];
      }
      if (sql.includes("flow.accounts")) {
        return [{ flow_id: "alice@flow" }];
      }
      return [];
    },
  } as unknown as import("../src/foundation/prisma.ts").FlowDb;
  const notifications = await getAccountNotifications(
    db,
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  );
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.isRead, true);

  const failingDb = {
    $queryRaw: async () => {
      throw new Error("database unavailable");
    },
  } as unknown as import("../src/foundation/prisma.ts").FlowDb;
  await assert.rejects(
    getAccountNotifications(
      failingDb,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ),
    /database unavailable/,
  );
});

import type { FlowDb } from "../src/foundation/prisma.ts";

test("ai-assistant-service: balance inquiry returns card without autonomous fund movement", async () => {
  // Mock db with dummy raw query returns
  const mockDb = {
    $queryRaw: async (query: unknown) => {
      const q = String(query);
      if (q.includes("wallet_balances")) {
        return [
          {
            network: "base-mainnet",
            symbol: "USDC",
            atomic_balance: "1000000",
            decimals: 6,
          },
        ];
      }
      return [];
    },
  };

  const response = await processAssistantQuery({
    accountId: "test-acc-1",
    prompt: "what is my balance?",
    db: mockDb as unknown as FlowDb,
  });

  assert.equal(response.role, "assistant");
  assert.ok(response.content.includes("1 USDC"));
  assert.equal(response.card?.type, "BALANCE_SUMMARY");
});

test("ai-assistant-service: draft payment link generates interactive card", async () => {
  const mockDb = {
    $queryRaw: async () => [],
  };

  const response = await processAssistantQuery({
    accountId: "test-acc-1",
    prompt: "draft a payment link for $25 for website design",
    db: mockDb as unknown as FlowDb,
  });

  assert.equal(response.role, "assistant");
  assert.equal(response.card?.type, "DRAFT_PAYMENT_LINK");
  assert.equal(response.card?.data?.amount, "25.00");
  assert.equal(response.card?.data?.assetSymbol, "USDC");
});

test("ai-assistant-service: payment status formats the quoted token with exact decimals", async () => {
  const mockDb = {
    $queryRaw: async (query: unknown) => {
      const sql = String(query);
      if (sql.includes("wallet_balances")) return [];
      if (sql.includes("payment_attempts")) {
        return [
          {
            title: "Native token invoice",
            public_id: "pay-native",
            status: "PROCESSING",
            amount: "1234567890123456789",
            destination_asset_symbol: "ETH",
            destination_decimals: 18,
            settled_at: null,
          },
        ];
      }
      return [];
    },
  };
  const response = await processAssistantQuery({
    accountId: "test-acc-1",
    prompt: "what is the latest payment status?",
    db: mockDb as unknown as FlowDb,
  });
  assert.equal(response.card?.type, "PAYMENT_STATUS");
  assert.equal(response.card?.data?.amount, "Quoted: 1.234567890123456789 ETH");
});
