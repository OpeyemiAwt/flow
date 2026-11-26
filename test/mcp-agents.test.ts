import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMcpClientConfigs,
  centsToUsd,
  computeTransferUsdCents,
  evaluateMcpSpendGuard,
  formatUsdCentsLabel,
  isValidMcpTokenFormat,
  resolveMcpDeployment,
  usdToCents,
} from "../src/domain/mcp-agents.ts";
import { generateMcpToken, hashMcpToken } from "../src/server/mcp-token-crypto.ts";

test("generateMcpToken produces high-entropy flw_mcp_ tokens and deterministic SHA-256 hashes", () => {
  const a = generateMcpToken();
  const b = generateMcpToken();
  assert.notEqual(a.rawToken, b.rawToken);
  assert.notEqual(a.tokenHash, b.tokenHash);
  assert.equal(isValidMcpTokenFormat(a.rawToken), true);
  assert.equal(isValidMcpTokenFormat("invalid_token"), false);
  assert.equal(a.tokenHash, hashMcpToken(a.rawToken));
  assert.equal(a.tokenHash.length, 64);
  assert.equal(a.rawToken.startsWith(a.tokenPrefix), true);
});

test("USD cents helpers round conservatively upwards so micro-transfers cannot slip past caps", () => {
  assert.equal(usdToCents(50), 5000);
  assert.equal(centsToUsd(5000), 50);
  assert.equal(formatUsdCentsLabel(1250), "$12.50");
  assert.equal(computeTransferUsdCents("10", 1), 1000);
  assert.equal(computeTransferUsdCents("0.001", 1), 1); // rounds up to at least 1 cent
  assert.equal(computeTransferUsdCents("2.5", 4.5), 1125);
  assert.equal(computeTransferUsdCents("5", null), null);
  assert.equal(computeTransferUsdCents("0", 1), null);
});

test("evaluateMcpSpendGuard enforces per-tx, daily, total, status, expiry, chain, and recipient limits", () => {
  const base = {
    status: "ACTIVE" as const,
    expiresAtIso: null,
    nowMs: Date.parse("2026-11-26T18:00:00Z"),
    operation: "SEND" as const,
    canSend: true,
    canConvert: true,
    sourceNetwork: "near-mainnet",
    destinationNetwork: "solana-mainnet",
    allowedNetworks: [
      "near-mainnet",
      "solana-mainnet",
      "base-mainnet",
      "ethereum-mainnet",
    ],
    allowedRecipients: [] as string[],
    recipientAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    recipientLabel: "alex@flow",
    requestedUsdCents: 1000, // $10
    maxTotalUsdCents: 5000, // $50
    maxPerTxUsdCents: 1500, // $15
    maxDailyUsdCents: 2500, // $25
    spentTotalUsdCents: 1000, // $10 spent
    spent24hUsdCents: 1000, // $10 today
  };

  // Allowed SEND within all limits
  assert.equal(evaluateMcpSpendGuard(base).ok, true);

  // Exceeds per-tx cap ($16 > $15)
  const overPerTx = evaluateMcpSpendGuard({ ...base, requestedUsdCents: 1600 });
  assert.equal(overPerTx.ok, false);
  if (!overPerTx.ok) assert.equal(overPerTx.code, "MCP_PER_TX_LIMIT_EXCEEDED");

  // Exceeds rolling 24h cap ($10 spent + $16? No, $14 + $15 = $29 > $25)
  const overDaily = evaluateMcpSpendGuard({
    ...base,
    spent24hUsdCents: 1600,
    requestedUsdCents: 1000,
  });
  assert.equal(overDaily.ok, false);
  if (!overDaily.ok) assert.equal(overDaily.code, "MCP_DAILY_LIMIT_EXCEEDED");

  // Exceeds total lifetime cap ($45 spent + $10 > $50)
  const overTotal = evaluateMcpSpendGuard({
    ...base,
    spentTotalUsdCents: 4500,
    spent24hUsdCents: 0,
    requestedUsdCents: 1000,
  });
  assert.equal(overTotal.ok, false);
  if (!overTotal.ok) assert.equal(overTotal.code, "MCP_TOTAL_LIMIT_EXCEEDED");

  // Read-only $0 cap blocks SEND
  const readOnly = evaluateMcpSpendGuard({
    ...base,
    maxTotalUsdCents: 0,
    maxPerTxUsdCents: 0,
  });
  assert.equal(readOnly.ok, false);
  if (!readOnly.ok) assert.equal(readOnly.code, "MCP_READ_ONLY_BUDGET");

  // Missing USD price fails closed
  const noPrice = evaluateMcpSpendGuard({ ...base, requestedUsdCents: null });
  assert.equal(noPrice.ok, false);
  if (!noPrice.ok) assert.equal(noPrice.code, "MCP_USD_VALUATION_REQUIRED");

  // Paused / expired keys block
  const paused = evaluateMcpSpendGuard({ ...base, status: "PAUSED" });
  assert.equal(paused.ok, false);
  if (!paused.ok) assert.equal(paused.code, "MCP_KEY_NOT_ACTIVE");

  const expired = evaluateMcpSpendGuard({
    ...base,
    expiresAtIso: "2026-11-26T17:00:00Z",
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, "MCP_KEY_EXPIRED");

  // Recipient allowlist checks both @flow handle and raw address
  const allowOk = evaluateMcpSpendGuard({
    ...base,
    allowedRecipients: ["Alex@Flow"],
  });
  assert.equal(allowOk.ok, true);

  const allowBlocked = evaluateMcpSpendGuard({
    ...base,
    allowedRecipients: ["treasury@flow"],
  });
  assert.equal(allowBlocked.ok, false);
  if (!allowBlocked.ok) {
    assert.equal(allowBlocked.code, "MCP_RECIPIENT_NOT_ALLOWED");
  }

  // Disallowed destination chain blocks
  const netBlocked = evaluateMcpSpendGuard({
    ...base,
    allowedNetworks: ["near-mainnet"],
  });
  assert.equal(netBlocked.ok, false);
  if (!netBlocked.ok) assert.equal(netBlocked.code, "MCP_NETWORK_NOT_ALLOWED");

  // CONVERT stays in user's own wallet: works even when Send budget is $0, if canConvert = true
  const convertOk = evaluateMcpSpendGuard({
    ...base,
    operation: "CONVERT",
    canSend: false,
    canConvert: true,
    maxTotalUsdCents: 0,
    requestedUsdCents: 0,
  });
  assert.equal(convertOk.ok, true);

  const convertBlocked = evaluateMcpSpendGuard({
    ...base,
    operation: "CONVERT",
    canConvert: false,
  });
  assert.equal(convertBlocked.ok, false);
  if (!convertBlocked.ok) {
    assert.equal(convertBlocked.code, "MCP_CONVERT_NOT_ALLOWED");
  }
});

test("resolveMcpDeployment resolves exact IDs and human-friendly LLM asset shorthand", () => {
  assert.equal(
    resolveMcpDeployment({ asset: "near-mainnet:USDC" })?.id,
    "near-mainnet:USDC",
  );
  assert.equal(
    resolveMcpDeployment({ asset: "USDC", network: "solana" })?.id,
    "solana-mainnet:USDC",
  );
  assert.equal(
    resolveMcpDeployment({ asset: "USDC on base" })?.id,
    "base-mainnet:USDC",
  );
  assert.equal(
    resolveMcpDeployment({ asset: "NEAR" })?.id,
    "near-mainnet:NEAR",
  );
  assert.equal(
    resolveMcpDeployment({ asset: "SOL" })?.id,
    "solana-mainnet:SOL",
  );
  assert.equal(
    resolveMcpDeployment({ asset: "USDC" })?.id,
    "near-mainnet:USDC",
  );
});

test("buildMcpClientConfigs emits valid configs for Claude, Codex, Antigravity, Cursor, and tokenized URL", () => {
  const { rawToken } = generateMcpToken();
  const cfg = buildMcpClientConfigs({
    baseUrl: "https://flow.devhub.forum/",
    rawToken,
  });
  assert.equal(cfg.endpointUrl, "https://flow.devhub.forum/api/mcp");
  assert.equal(cfg.tokenizedUrl, `https://flow.devhub.forum/api/mcp/${rawToken}`);
  assert.equal(JSON.parse(cfg.claudeJson).mcpServers.flow.url, cfg.endpointUrl);
  assert.equal(
    JSON.parse(cfg.antigravityJson).mcpServers.flow.serverUrl,
    cfg.endpointUrl,
  );
  assert.equal(cfg.codexToml.includes(rawToken), true);
  assert.equal(JSON.parse(cfg.cursorJson).mcpServers.flow.url, cfg.endpointUrl);
});
