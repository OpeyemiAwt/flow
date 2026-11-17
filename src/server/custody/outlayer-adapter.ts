import { z } from "zod";
import {
  isFinancialExecutionDisabled,
  isValidNearAddress,
  mintTrustedAdapterPolicyEvidence,
  validateAddressForNetwork,
  verifyPublicKeyMatchesAddress,
  type DefaultDenyCustodyPolicyPayload,
  type OnChainWalletPolicyView,
  type TrustedProviderPolicyEvidence,
} from "../../domain/custody.ts";
import type { NetworkId } from "../../domain/providers.ts";
import { FlowError } from "../../foundation/errors.ts";
import { log } from "../../foundation/logger.ts";
import {
  ALLOWED_OUTLAYER_HOSTS,
  type ProviderCompatibilityConfig,
} from "../../foundation/wallet-environment.ts";

export type SanitizedProviderErrorCode =
  | "BAD_REQUEST"
  | "AUTHENTICATION_FAILED"
  | "RESOURCE_NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "GATEWAY_TIMEOUT"
  | "NETWORK_ERROR"
  | "CORRUPTED_RESPONSE"
  | "UNSUPPORTED_CHAIN"
  | "CORRELATION_ERROR"
  | "INVALID_ADDRESS";

export type OutLayerEndpoint =
  | "/register"
  | "/wallet/v1/address"
  | "/wallet/v1/policy"
  | "/wallet/v1/encrypt-policy"
  | "/wallet/v1/sign-policy"
  | "/wallet/v1/invalidate-cache"
  | "/wallet/v1/transfer"
  | "/wallet/v1/call"
  | "/wallet/v1/evm/sign-transaction"
  | "/wallet/v1/solana/sign-transaction"
  | "/wallet/v1/requests";

export interface SanitizedProviderError {
  readonly classification: SanitizedProviderErrorCode;
  readonly safeMessage: string;
  readonly httpStatus?: number;
  readonly endpoint?: OutLayerEndpoint;
  readonly chain?: OutLayerChain;
}

/**
 * Maps raw HTTP status codes and allowlisted error contexts to sanitized, allowlisted classifications.
 * Prevents arbitrary provider response bodies (HTML, stack traces, headers, cookies, emails,
 * database URLs, or bearer tokens) from entering application logs or persisted database records.
 */
export function classifyProviderError(
  status: number | null,
  context?: {
    readonly endpoint?: OutLayerEndpoint;
    readonly chain?: OutLayerChain;
  },
): SanitizedProviderError {
  const safeStatus =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : undefined;

  const metadata = {
    ...(safeStatus !== undefined ? { httpStatus: safeStatus } : {}),
    ...(context?.endpoint !== undefined ? { endpoint: context.endpoint } : {}),
    ...(context?.chain !== undefined ? { chain: context.chain } : {}),
  };

  if (safeStatus === 429) {
    return {
      classification: "RATE_LIMITED",
      safeMessage: "OutLayer rate limit exceeded (30 req/min).",
      ...metadata,
    };
  }
  if (safeStatus === 402) {
    return {
      classification: "BAD_REQUEST",
      safeMessage: "OutLayer wallet gas balance is underfunded (402 wallet_underfunded).",
      ...metadata,
    };
  }
  if (safeStatus === 400) {
    if (context?.chain === "bitcoin") {
      return {
        classification: "UNSUPPORTED_CHAIN",
        safeMessage: "Bitcoin is unsupported by OutLayer wallet v1.",
        ...metadata,
      };
    }
    return {
      classification: "BAD_REQUEST",
      safeMessage: "OutLayer rejected the request as invalid (HTTP 400).",
      ...metadata,
    };
  }
  if (safeStatus === 401) {
    return {
      classification: "AUTHENTICATION_FAILED",
      safeMessage: "OutLayer authentication failed (HTTP 401): API key rejected.",
      ...metadata,
    };
  }
  if (safeStatus === 403) {
    return {
      classification: "AUTHENTICATION_FAILED",
      safeMessage:
        "OutLayer rejected the request (HTTP 403): wallet policy or permission check failed.",
      ...metadata,
    };
  }
  if (safeStatus === 404) {
    return {
      classification: "RESOURCE_NOT_FOUND",
      safeMessage: "Requested OutLayer resource was not found (HTTP 404).",
      ...metadata,
    };
  }
  if (safeStatus === 408 || safeStatus === 504) {
    return {
      classification: "GATEWAY_TIMEOUT",
      safeMessage: `OutLayer request timed out (HTTP ${safeStatus}).`,
      ...metadata,
    };
  }
  if (
    safeStatus === 409 ||
    safeStatus === 425 ||
    (safeStatus && safeStatus >= 500 && safeStatus < 600)
  ) {
    return {
      classification: "UPSTREAM_UNAVAILABLE",
      safeMessage: `OutLayer service temporarily unavailable (HTTP ${safeStatus}).`,
      ...metadata,
    };
  }
  return {
    classification: "NETWORK_ERROR",
    safeMessage: "OutLayer communication failed due to a network error.",
    ...metadata,
  };
}

async function logSafeOutlayerFailure(
  response: Response,
  endpoint: OutLayerEndpoint,
  chain?: OutLayerChain,
): Promise<string | undefined> {
  const raw = await response.text().catch(() => "");
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(raw) as {
      error?: unknown;
      message?: unknown;
      code?: unknown;
    };
    const msg =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.code === "string"
            ? parsed.code
            : undefined;
    if (msg) detail = msg.slice(0, 200);
  } catch {
    if (raw && !raw.trimStart().startsWith("<")) {
      detail = raw.trim().slice(0, 200);
    }
  }
  log("error", "outlayer_http_error", {
    endpoint,
    ...(chain ? { chain } : {}),
    httpStatus: response.status,
    ...(detail ? { detail } : {}),
  });
  return detail;
}

/**
 * Authoritative Chain enum aligned with OutLayer OpenAPI 0.1.0-alpha.4 (`components.schemas.Chain`).
 */
export const outlayerChainSchema = z.enum([
  "near",
  "ethereum",
  "polygon",
  "base",
  "arbitrum",
  "optimism",
  "bsc",
  "avalanche",
  "hyperevm",
  "hood",
  "solana",
  "bitcoin",
]);

export type OutLayerChain = z.infer<typeof outlayerChainSchema>;

const registerResponseSchema = z.object({
  wallet_id: z.string().uuid(),
  api_key: z.string().regex(/^wk_[\w-]+$/),
  near_account_id: z.string().min(2).max(64),
  handoff_url: z.string().optional(),
  trial: z
    .object({
      available: z.boolean().optional(),
      calls: z.number().int().optional(),
      days: z.number().int().optional(),
      claim_url: z.string().optional(),
      scope: z.string().optional(),
    })
    .optional(),
});

const addressResponseSchema = z.object({
  wallet_id: z.string().uuid(),
  chain: outlayerChainSchema,
  sub_path: z.string().nullable().optional(),
  address: z.string().min(1).max(128),
  public_key: z.string().min(1).max(256),
  vault_id: z.string().nullable().optional(),
  asset_account_id: z.string().nullable().optional(),
  executor_account_id: z.string().nullable().optional(),
  gas_balance: z.string().nullable().optional(),
});

const policyResponseSchema = z.object({
  wallet_id: z.string().uuid(),
  controller: z.string().nullish(),
  frozen: z.boolean(),
  version: z.number().int().nullish(),
  locked: z.boolean().nullish(),
  policy: z.enum(["none", "stored"]).nullish(),
  rules: z.record(z.string(), z.unknown()).nullish(),
  approval: z.record(z.string(), z.unknown()).nullish(),
  capabilities: z.record(z.string(), z.unknown()).nullish(),
  authorized_key_hashes: z.array(z.string()).nullish(),
  refund_addresses: z.record(z.string(), z.string().nullish()).nullish(),
  usage: z.record(z.string(), z.unknown()).nullish(),
});

const encryptPolicyResponseSchema = z.object({
  encrypted_base64: z.string().min(1),
  wallet_pubkey: z.string().trim().min(32).max(160),
  policy_hash: z.string().trim().min(32).max(128),
});

const signPolicyResponseSchema = z.union([
  z.object({
    signature_hex: z.string().min(64),
    public_key_hex: z.string().min(64),
    version: z.number().int().nonnegative(),
    locked: z.boolean(),
    valid_until: z.number().int().positive(),
    policy_hash: z.string().trim().min(32).max(128),
    request_hash: z.string().nullish(),
  }),
  z.object({
    status: z.literal("pending_approval"),
    approval_id: z.string().min(1),
    request_id: z.string().min(1),
    required_approvals: z.number().int().positive(),
    expires_at: z.string().nullish(),
  }),
]);

export type OutLayerEncryptPolicyResult = z.infer<
  typeof encryptPolicyResponseSchema
>;
export type OutLayerSignPolicyResult = z.infer<typeof signPolicyResponseSchema>;

export type OutLayerRegisterResult = z.infer<typeof registerResponseSchema>;
export type OutLayerAddressResult = z.infer<typeof addressResponseSchema>;
export type OutLayerPolicyResult = TrustedProviderPolicyEvidence;

const transferOrCallResponseSchema = z.object({
  request_id: z.string().min(1),
  status: z.string().min(1),
  tx_hash: z.string().nullable().optional(),
  approval_id: z.string().nullable().optional(),
  poll_url: z.string().nullable().optional(),
});

const signTransactionResponseSchema = z.object({
  signature: z.string().min(1),
  chain: z.string().min(1),
  wallet_id: z.string().min(1),
});

const requestStatusResponseSchema = z.object({
  request_id: z.string().min(1),
  type: z.string().min(1),
  status: z.string().min(1),
  result: z.unknown().optional(),
});

export type OutLayerTransferOrCallResult = z.infer<
  typeof transferOrCallResponseSchema
>;
export type OutLayerSignTransactionResult = z.infer<
  typeof signTransactionResponseSchema
>;
export type OutLayerRequestStatusResult = z.infer<
  typeof requestStatusResponseSchema
>;

/**
 * Strips any one-time bearer credential (`key`, `api_key`, `token`, or `wk_...`)
 * from an OutLayer handoff URL before persisting it to `flow.wallets.handoff_url`.
 */
export function scrubHandoffUrl(
  handoffUrl?: string | null,
): string | undefined {
  if (!handoffUrl || typeof handoffUrl !== "string") {
    return undefined;
  }
  try {
    const parsed = new URL(handoffUrl);
    for (const key of Array.from(parsed.searchParams.keys())) {
      const val = parsed.searchParams.get(key) ?? "";
      if (
        /^(key|api_key|apikey|token|secret)$/i.test(key) ||
        val.startsWith("wk_")
      ) {
        parsed.searchParams.delete(key);
      }
    }
    if (parsed.hash.includes("wk_") || parsed.hash.includes("key=")) {
      parsed.hash = "";
    }
    return parsed.toString().replace(/wk_[\w-]+/g, "[REDACTED]");
  } catch {
    return handoffUrl
      .replace(/([?&](key|api_key|token)=)[^&#]+/gi, "$1[REDACTED]")
      .replace(/wk_[\w-]+/g, "[REDACTED]");
  }
}

export interface OutLayerRegisterInput {
  readonly seed?: string;
  readonly accountId?: string;
  readonly pubkey?: string;
  readonly message?: string;
  readonly signature?: string;
  readonly vaultId?: string;
}

const ALLOWED_REGISTER_FIELDS = new Set([
  "wallet_id",
  "api_key",
  "near_account_id",
  "handoff_url",
]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class OutLayerAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly compatibilityConfig?: ProviderCompatibilityConfig;
  private readonly controlledRegistrationAuthorized: boolean;
  private readonly openRegistrationAuthorized: boolean;
  private readonly policyPreparationAuthorized: boolean;
  private liveRegistrationCount = 0;

  constructor(
    baseUrl = "https://api.outlayer.ai",
    timeoutMs = 5_000,
    options?: {
      readonly compatibilityConfig?: ProviderCompatibilityConfig;
      readonly controlledRegistrationAuthorized?: boolean;
      readonly openRegistrationAuthorized?: boolean;
      readonly policyPreparationAuthorized?: boolean;
    },
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.compatibilityConfig = options?.compatibilityConfig;
    this.controlledRegistrationAuthorized =
      options?.controlledRegistrationAuthorized === true;
    this.openRegistrationAuthorized =
      options?.openRegistrationAuthorized === true;
    this.policyPreparationAuthorized =
      options?.policyPreparationAuthorized === true;
  }

  private assertEndpointPermitted(
    action: "register" | "query" = "query",
    endpointPath = "/register",
  ): void {
    let parsed: URL;
    try {
      parsed = new URL(this.baseUrl);
    } catch {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "OutLayer adapter baseUrl is not a valid URL.",
      );
    }
    if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return;
    }

    // Remote endpoint reachability check:
    if (!isFinancialExecutionDisabled()) {
      // Live execution path: compatibility rehearsal mode cannot remain enabled.
      if (this.compatibilityConfig?.mode === "authorized") {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "Provider compatibility mode cannot remain authorized when FLOW_EXECUTION is enabled.",
        );
      }
      if (!ALLOWED_OUTLAYER_HOSTS.includes(parsed.hostname.toLowerCase())) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          `OutLayer host ${parsed.hostname} is not in the authorized OutLayer host allowlist.`,
        );
      }
      const ALLOWED_LIVE_ENDPOINTS = new Set([
        "/register",
        "/wallet/v1/address",
        "/wallet/v1/policy",
        "/wallet/v1/encrypt-policy",
        "/wallet/v1/sign-policy",
        "/wallet/v1/invalidate-cache",
        "/wallet/v1/transfer",
        "/wallet/v1/call",
        "/wallet/v1/evm/sign-transaction",
        "/wallet/v1/solana/sign-transaction",
      ]);
      if (
        !ALLOWED_LIVE_ENDPOINTS.has(endpointPath) &&
        !endpointPath.startsWith("/wallet/v1/requests/")
      ) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          `OutLayer endpoint ${endpointPath} is not in the authorized OutLayer endpoint allowlist.`,
        );
      }
      return;
    }

    // Explicit registration & policy setup when FLOW_EXECUTION=disabled:
    // NEVER permits /wallet/v1/transfer, /wallet/v1/call, or tx signing.
    const anySetupModeAuthorized =
      this.policyPreparationAuthorized ||
      this.controlledRegistrationAuthorized ||
      this.openRegistrationAuthorized;
    if (
      anySetupModeAuthorized &&
      (!this.compatibilityConfig ||
        this.compatibilityConfig.mode === "disabled")
    ) {
      if (!ALLOWED_OUTLAYER_HOSTS.includes(parsed.hostname.toLowerCase())) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          `OutLayer host ${parsed.hostname} is not in the authorized OutLayer host allowlist.`,
        );
      }
      const permittedEndpoints = new Set<string>(["/wallet/v1/policy"]);
      if (
        this.controlledRegistrationAuthorized ||
        this.openRegistrationAuthorized
      ) {
        permittedEndpoints.add("/register");
        permittedEndpoints.add("/wallet/v1/address");
      }
      if (this.policyPreparationAuthorized) {
        permittedEndpoints.add("/wallet/v1/encrypt-policy");
        permittedEndpoints.add("/wallet/v1/sign-policy");
        permittedEndpoints.add("/wallet/v1/invalidate-cache");
      }
      if (!permittedEndpoints.has(endpointPath)) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          `OutLayer endpoint ${endpointPath} is not permitted under current FLOW_EXECUTION=disabled custody setup authorization.`,
        );
      }
      if (
        action === "register" &&
        this.controlledRegistrationAuthorized &&
        !this.openRegistrationAuthorized &&
        this.liveRegistrationCount >= 1
      ) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "Controlled wallet registration allows at most one registration per worker authorization.",
        );
      }
      return;
    }

    if (
      !this.compatibilityConfig ||
      this.compatibilityConfig.mode !== "authorized"
    ) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "Live OutLayer network requests are prohibited while FLOW_EXECUTION=disabled; only local simulated loopback endpoints are permitted.",
      );
    }

    // 3. Strict host allowlist (must be in ALLOWED_OUTLAYER_HOSTS)
    if (!ALLOWED_OUTLAYER_HOSTS.includes(parsed.hostname.toLowerCase())) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        `OutLayer host ${parsed.hostname} is not in the authorized compatibility allowlist.`,
      );
    }

    // 3b. Fail-closed testnet coordinator enforcement (Requirement 7)
    if (this.compatibilityConfig.providerEnvironment === "testnet") {
      if (parsed.hostname.toLowerCase() !== "testnet-api.outlayer.ai") {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "Testnet compatibility rehearsal strictly requires coordinator to be https://testnet-api.outlayer.ai; mainnet or legacy endpoints are strictly prohibited.",
        );
      }
    }

    // 4. Exact endpoint allowlist for compatibility rehearsal
    const ALLOWED_ENDPOINTS = new Set([
      "/register",
      "/wallet/v1/address",
      "/wallet/v1/policy",
    ]);
    if (!ALLOWED_ENDPOINTS.has(endpointPath)) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        `OutLayer endpoint ${endpointPath} is not in the authorized compatibility allowlist.`,
      );
    }

    // 5. Registration quota check
    if (action === "register") {
      if (
        this.liveRegistrationCount >= this.compatibilityConfig.maxRegistrations
      ) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          `Provider compatibility mode registration limit reached (maximum ${this.compatibilityConfig.maxRegistrations} registration allowed).`,
        );
      }
    }
  }

  private async fetchWithTimeout(
    endpoint: string,
    options: RequestInit,
  ): Promise<Response> {
    const endpointPath = endpoint.split("?")[0]!;
    this.assertEndpointPermitted("query", endpointPath);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new FlowError(
          "CUSTODY_PROVIDER_TIMEOUT",
          `OutLayer request timed out after ${this.timeoutMs}ms.`,
        );
      }
      // Never propagate raw upstream network error messages, headers, URLs, or bodies
      throw new FlowError(
        "CUSTODY_PROVIDER_NETWORK_ERROR",
        "OutLayer communication failed due to an upstream network error.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Registers a custody wallet container on OutLayer.
   * NOTE: For anonymous wallets, passes empty body `{}`.
   */
  async register(
    input: OutLayerRegisterInput = {},
  ): Promise<OutLayerRegisterResult> {
    this.assertEndpointPermitted("register");
    this.liveRegistrationCount++;
    const body =
      input.accountId && input.pubkey && input.signature && input.message
        ? {
            account_id: input.accountId,
            pubkey: input.pubkey,
            signature: input.signature,
            message: input.message,
            seed: input.seed,
            vault_id: input.vaultId,
          }
        : input.vaultId
          ? { vault_id: input.vaultId }
          : {};

    const response = await this.fetchWithTimeout("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      throw new FlowError(
        "CUSTODY_PROVIDER_RATE_LIMITED",
        "OutLayer registration rate limit exceeded (30 req/min).",
      );
    }

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/register",
      });
      if (sanitized.classification === "GATEWAY_TIMEOUT") {
        throw new FlowError("CUSTODY_PROVIDER_TIMEOUT", sanitized.safeMessage);
      }
      const isDeterministicPreCreationRejection =
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status === 405 ||
        response.status === 422;
      throw new FlowError(
        isDeterministicPreCreationRejection
          ? "CUSTODY_PROVIDER_ERROR"
          : "CUSTODY_PROVIDER_UNAVAILABLE",
        sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer registration.",
      );
    });

    const parsed = registerResponseSchema.safeParse(json);
    if (!parsed.success) {
      const safeFields = parsed.error.issues
        .map((i) => String(i.path[0] ?? "root"))
        .filter((f) => ALLOWED_REGISTER_FIELDS.has(f) || f === "root");
      log("error", "outlayer_register_schema_mismatch", {
        fields: Array.from(new Set(safeFields)),
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer registration response schema mismatch.",
      );
    }

    if (!isValidNearAddress(parsed.data.near_account_id)) {
      throw new FlowError(
        "CUSTODY_INVALID_ADDRESS",
        "OutLayer returned invalid NEAR account ID format.",
      );
    }

    return parsed.data;
  }

  /**
   * Derives the address for a specific chain using the wallet's bearer key.
   * Enforces mandatory correlation check against expectedWalletId and validates
   * chain-specific address format against network rules.
   */
  async getAddress(
    apiKey: string,
    chain: OutLayerChain,
    expectedWalletId?: string,
  ): Promise<OutLayerAddressResult> {
    const validChain = outlayerChainSchema.safeParse(chain);
    if (!validChain.success) {
      throw new FlowError(
        "UNSUPPORTED_CHAIN",
        "Requested blockchain network is unsupported.",
      );
    }

    if (validChain.data === "bitcoin") {
      throw new FlowError(
        "UNSUPPORTED_CHAIN",
        "Bitcoin is unsupported by OutLayer wallet v1.",
      );
    }

    const response = await this.fetchWithTimeout(
      `/wallet/v1/address?chain=${encodeURIComponent(validChain.data)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/address",
        chain: validChain.data,
      });
      throw new FlowError(
        sanitized.classification === "UNSUPPORTED_CHAIN"
          ? "UNSUPPORTED_CHAIN"
          : "CUSTODY_PROVIDER_ERROR",
        sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer address endpoint.",
      );
    });

    const parsed = addressResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        `OutLayer address schema mismatch for chain ${validChain.data}.`,
      );
    }

    // 1. Mandatory correlation check: wallet ID must match
    if (expectedWalletId && parsed.data.wallet_id !== expectedWalletId) {
      throw new FlowError(
        "CUSTODY_PROVIDER_CORRELATION_ERROR",
        `Provider returned wallet ID mismatch for chain ${validChain.data}.`,
      );
    }

    // 2. Mandatory correlation check: chain must match requested chain
    if (parsed.data.chain !== validChain.data) {
      throw new FlowError(
        "CUSTODY_PROVIDER_CORRELATION_ERROR",
        `Provider returned chain mismatch for requested chain ${validChain.data}.`,
      );
    }

    // 3. Network-specific address validation
    const validation = validateAddressForNetwork(
      validChain.data as NetworkId,
      parsed.data.address,
    );
    if (!validation.valid) {
      throw new FlowError(
        "CUSTODY_INVALID_ADDRESS",
        `Provider returned invalid address format for ${validChain.data}.`,
      );
    }

    // 4. Cryptographic public-key-to-address consistency check
    const keyConsistency = verifyPublicKeyMatchesAddress(
      validChain.data as NetworkId,
      parsed.data.address,
      parsed.data.public_key,
      { strict: true },
    );
    if (!keyConsistency.valid) {
      throw new FlowError(
        "CUSTODY_INVALID_ADDRESS",
        `Provider returned public key inconsistent with derived ${validChain.data} address.`,
      );
    }

    // 5. OpenAPI AddressResponse contract: for chain=near, executor_account_id (if present) must equal address
    if (
      validChain.data === "near" &&
      typeof parsed.data.executor_account_id === "string" &&
      parsed.data.executor_account_id.trim().toLowerCase() !==
        parsed.data.address.trim().toLowerCase()
    ) {
      throw new FlowError(
        "CUSTODY_PROVIDER_CORRELATION_ERROR",
        "Provider returned NEAR executor_account_id that does not match derived NEAR address.",
      );
    }

    return parsed.data;
  }

  /**
   * Queries the TEE policy status for a wallet with optional wallet ID correlation.
   */
  async getPolicy(
    apiKey: string,
    expectedWalletId?: string,
    options?: {
      readonly verifiedOnChainController?: string;
      readonly selfWalletAccountId?: string;
    },
  ): Promise<OutLayerPolicyResult> {
    const response = await this.fetchWithTimeout("/wallet/v1/policy", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/policy",
      });
      throw new FlowError("CUSTODY_PROVIDER_ERROR", sanitized.safeMessage);
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer policy endpoint.",
      );
    });

    const parsed = policyResponseSchema.safeParse(json);
    if (!parsed.success) {
      log("error", "outlayer_schema_mismatch", {
        endpoint: "/wallet/v1/policy",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "root",
          code: issue.code,
        })),
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer policy schema mismatch.",
      );
    }

    if (expectedWalletId && parsed.data.wallet_id !== expectedWalletId) {
      throw new FlowError(
        "CUSTODY_PROVIDER_CORRELATION_ERROR",
        "Provider returned wallet ID mismatch on policy query.",
      );
    }

    const normalizedRefunds = parsed.data.refund_addresses
      ? Object.fromEntries(
          Object.entries(parsed.data.refund_addresses).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;

    const rawController = parsed.data.controller?.trim() ?? "";
    const normalizedRawController = /^ed25519:[0-9a-f]{64}$/i.test(
      rawController,
    )
      ? rawController.slice("ed25519:".length).toLowerCase()
      : /^[0-9a-f]{64}$/i.test(rawController)
        ? rawController.toLowerCase()
        : rawController;
    const isUnsetController =
      normalizedRawController.length === 0 ||
      normalizedRawController.toLowerCase() === "none" ||
      normalizedRawController.toLowerCase() === "null";
    const isSelfPlaceholderController =
      Boolean(options?.selfWalletAccountId) &&
      normalizedRawController ===
        options!.selfWalletAccountId!.trim().toLowerCase();
    let effectiveController: string | undefined = isUnsetController
      ? undefined
      : normalizedRawController;
    if (
      (!effectiveController || isSelfPlaceholderController) &&
      options?.verifiedOnChainController &&
      isValidNearAddress(options.verifiedOnChainController)
    ) {
      effectiveController = options.verifiedOnChainController
        .trim()
        .toLowerCase();
      log("info", "outlayer_policy_controller_bound_from_onchain_view", {
        walletId: parsed.data.wallet_id,
        rawControllerType:
          parsed.data.controller === null
            ? "null"
            : typeof parsed.data.controller,
        rawControllerPresent: rawController.length > 0,
      });
    }

    return mintTrustedAdapterPolicyEvidence({
      wallet_id: parsed.data.wallet_id,
      controller: effectiveController,
      frozen: parsed.data.frozen,
      policy: parsed.data.policy ?? undefined,
      rules: parsed.data.rules ?? undefined,
      approval: parsed.data.approval ?? undefined,
      capabilities: parsed.data.capabilities ?? undefined,
      authorized_key_hashes: parsed.data.authorized_key_hashes ?? undefined,
      refund_addresses: normalizedRefunds,
      usage: parsed.data.usage ?? undefined,
    });
  }

  /**
   * Encrypts a default-deny custody policy inside the OutLayer TEE (`POST /wallet/v1/encrypt-policy`).
   * Does not write on-chain or move funds; gated by `assertEndpointPermitted`.
   */
  async encryptPolicy(
    apiKey: string,
    input: {
      readonly walletId: string;
      readonly policy: DefaultDenyCustodyPolicyPayload | Record<string, unknown>;
    },
  ): Promise<OutLayerEncryptPolicyResult> {
    const response = await this.fetchWithTimeout("/wallet/v1/encrypt-policy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        wallet_id: input.walletId,
        ...input.policy,
      }),
    });

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/encrypt-policy",
      });
      throw new FlowError("CUSTODY_PROVIDER_ERROR", sanitized.safeMessage);
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer encrypt-policy endpoint.",
      );
    });
    const parsed = encryptPolicyResponseSchema.safeParse(json);
    if (!parsed.success) {
      log("error", "outlayer_schema_mismatch", {
        endpoint: "/wallet/v1/encrypt-policy",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "root",
          code: issue.code,
        })),
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer encrypt-policy response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Requests a wallet-key signature over `store_wallet_policy:v2:...` bound to the
   * exact NEAR `callerAccountId` (`POST /wallet/v1/sign-policy`).
   */
  async signPolicy(
    apiKey: string,
    input: {
      readonly encryptedData: string;
      readonly callerAccountId: string;
    },
  ): Promise<OutLayerSignPolicyResult> {
    if (!isValidNearAddress(input.callerAccountId)) {
      throw new FlowError(
        "CUSTODY_INVALID_ADDRESS",
        "Policy signing requires a valid NEAR callerAccountId.",
      );
    }

    const response = await this.fetchWithTimeout("/wallet/v1/sign-policy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        encrypted_data: input.encryptedData,
        caller: input.callerAccountId.trim().toLowerCase(),
      }),
    });

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/sign-policy",
      });
      throw new FlowError("CUSTODY_PROVIDER_ERROR", sanitized.safeMessage);
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer sign-policy endpoint.",
      );
    });
    const parsed = signPolicyResponseSchema.safeParse(json);
    if (!parsed.success) {
      log("error", "outlayer_schema_mismatch", {
        endpoint: "/wallet/v1/sign-policy",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "root",
          code: issue.code,
        })),
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer sign-policy response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Drops OutLayer's cached `no-policy` entry so the coordinator re-reads `outlayer.near`
   * immediately after `store_wallet_policy` lands on-chain (`POST /wallet/v1/invalidate-cache`).
   */
  async invalidatePolicyCache(apiKey: string, walletId: string): Promise<void> {
    const response = await this.fetchWithTimeout(
      "/wallet/v1/invalidate-cache",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ wallet_id: walletId }),
      },
    );

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/invalidate-cache",
      });
      throw new FlowError("CUSTODY_PROVIDER_ERROR", sanitized.safeMessage);
    }
  }

  private assertLiveExecutionEnabled(): void {
    if (isFinancialExecutionDisabled()) {
      throw new FlowError(
        "CUSTODY_EXECUTION_BLOCKED",
        "Custody signing and transfer operations are strictly prohibited while FLOW_EXECUTION=disabled.",
      );
    }
  }

  /**
   * Executes a native NEAR transfer via OutLayer (`POST /wallet/v1/transfer`).
   * Strictly gated on FLOW_EXECUTION != disabled.
   */
  async transferNearNative(
    apiKey: string,
    input: {
      readonly to: string;
      readonly amountYocto: string;
      readonly chain?: "near";
    },
  ): Promise<OutLayerTransferOrCallResult> {
    this.assertLiveExecutionEnabled();
    const response = await this.fetchWithTimeout("/wallet/v1/transfer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        chain: input.chain ?? "near",
        to: input.to,
        amount: input.amountYocto,
      }),
    });

    if (!response.ok) {
      const detail = await logSafeOutlayerFailure(
        response,
        "/wallet/v1/transfer",
        "near",
      );
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/transfer",
        chain: "near",
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        detail ? `${sanitized.safeMessage} (${detail})` : sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer transfer endpoint.",
      );
    });
    const parsed = transferOrCallResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer transfer response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Executes a NEAR contract call (e.g. NEP-141 ft_transfer / storage_deposit)
   * via OutLayer (`POST /wallet/v1/call`). Strictly gated on FLOW_EXECUTION != disabled.
   */
  async callNearContract(
    apiKey: string,
    input: {
      readonly receiverId: string;
      readonly methodName: string;
      readonly args?: Record<string, unknown>;
      readonly argsBase64?: string;
      readonly gas?: string;
      readonly deposit?: string;
    },
  ): Promise<OutLayerTransferOrCallResult> {
    this.assertLiveExecutionEnabled();
    const response = await this.fetchWithTimeout("/wallet/v1/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        receiver_id: input.receiverId,
        method_name: input.methodName,
        ...(input.args !== undefined ? { args: input.args } : {}),
        ...(input.argsBase64 !== undefined
          ? { args_base64: input.argsBase64 }
          : {}),
        ...(input.gas !== undefined ? { gas: input.gas } : {}),
        ...(input.deposit !== undefined ? { deposit: input.deposit } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await logSafeOutlayerFailure(
        response,
        "/wallet/v1/call",
        "near",
      );
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/call",
        chain: "near",
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        detail ? `${sanitized.safeMessage} (${detail})` : sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer contract call endpoint.",
      );
    });
    const parsed = transferOrCallResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer contract call response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Signs an unsigned RLP-serialized EVM transaction via OutLayer
   * (`POST /wallet/v1/evm/sign-transaction`).
   */
  async signEvmTransaction(
    apiKey: string,
    input: {
      readonly chain:
        | "ethereum"
        | "base"
        | "polygon"
        | "arbitrum"
        | "optimism"
        | "bsc"
        | "avalanche";
      readonly unsignedTxHex: string;
    },
  ): Promise<OutLayerSignTransactionResult> {
    this.assertLiveExecutionEnabled();
    const response = await this.fetchWithTimeout(
      "/wallet/v1/evm/sign-transaction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          chain: input.chain,
          unsigned_tx: input.unsignedTxHex,
        }),
      },
    );

    if (!response.ok) {
      const detail = await logSafeOutlayerFailure(
        response,
        "/wallet/v1/evm/sign-transaction",
        input.chain,
      );
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/evm/sign-transaction",
        chain: input.chain,
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        detail ? `${sanitized.safeMessage} (${detail})` : sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer EVM sign endpoint.",
      );
    });
    const parsed = signTransactionResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer EVM sign response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Signs an unsigned base64-encoded Solana transaction message via OutLayer
   * (`POST /wallet/v1/solana/sign-transaction`).
   */
  async signSolanaTransaction(
    apiKey: string,
    input: {
      readonly unsignedTxBase64: string;
      readonly chain?: "solana";
    },
  ): Promise<OutLayerSignTransactionResult> {
    this.assertLiveExecutionEnabled();
    const response = await this.fetchWithTimeout(
      "/wallet/v1/solana/sign-transaction",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          chain: input.chain ?? "solana",
          unsigned_tx: input.unsignedTxBase64,
        }),
      },
    );

    if (!response.ok) {
      const detail = await logSafeOutlayerFailure(
        response,
        "/wallet/v1/solana/sign-transaction",
        "solana",
      );
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/solana/sign-transaction",
        chain: "solana",
      });
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        detail ? `${sanitized.safeMessage} (${detail})` : sanitized.safeMessage,
      );
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer Solana sign endpoint.",
      );
    });
    const parsed = signTransactionResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer Solana sign response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * Polls an async OutLayer wallet request status (`GET /wallet/v1/requests/{id}`).
   */
  async getRequestStatus(
    apiKey: string,
    requestId: string,
  ): Promise<OutLayerRequestStatusResult> {
    this.assertLiveExecutionEnabled();
    const response = await this.fetchWithTimeout(
      `/wallet/v1/requests/${encodeURIComponent(requestId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const sanitized = classifyProviderError(response.status, {
        endpoint: "/wallet/v1/requests",
      });
      throw new FlowError("CUSTODY_PROVIDER_ERROR", sanitized.safeMessage);
    }

    const json = await response.json().catch(() => {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid JSON received from OutLayer request status endpoint.",
      );
    });
    const parsed = requestStatusResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "OutLayer request status response schema mismatch.",
      );
    }
    return parsed.data;
  }

  /**
   * PROHIBITED EXECUTION GUARDS:
   * Verification of Requirement 9: Compatibility mode and FLOW_EXECUTION=disabled
   * cannot invoke signing, transaction broadcasting, transfers, swaps, wallet deletion,
   * policy mutation, or payment execution.
   */
  async sign(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Signing operations are strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async broadcastTransaction(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Transaction broadcasting is strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async transfer(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Fund transfers are strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async withdraw(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Fund withdrawals are strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async swap(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Token swaps are strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async deleteWallet(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Wallet deletion is strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }

  async mutatePolicy(): Promise<never> {
    throw new FlowError(
      "CUSTODY_EXECUTION_BLOCKED",
      "Custody policy mutation is strictly prohibited while FLOW_EXECUTION=disabled.",
    );
  }
}

const onChainWalletPolicyViewSchema = z.object({
  owner: z.string().min(2),
  encrypted_data: z.string().min(1),
  frozen: z.boolean(),
  updated_at: z.union([z.number(), z.string()]),
  storage_refund_to: z.string().nullable().optional(),
  storage_deposit: z.string().optional(),
  version: z.number().int(),
  locked: z.boolean(),
});

async function queryNearContractView(params: {
  readonly rpcUrl: string;
  readonly contractId: string;
  readonly methodName: string;
  readonly args: Record<string, unknown>;
  readonly timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 8_000);
  try {
    const response = await fetch(params.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "flow-near-view",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: params.contractId,
          method_name: params.methodName,
          args_base64: Buffer.from(JSON.stringify(params.args), "utf8").toString(
            "base64",
          ),
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new FlowError(
        "CUSTODY_PROVIDER_UNAVAILABLE",
        `NEAR RPC view call failed with HTTP ${response.status}.`,
      );
    }
    const payload = (await response.json()) as {
      error?: unknown;
      result?: { error?: string; result?: number[] };
    };
    if (payload.error || payload.result?.error) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        `NEAR RPC view ${params.methodName} failed on ${params.contractId}.`,
      );
    }
    const bytes = payload.result?.result;
    if (!Array.isArray(bytes)) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        `NEAR RPC view ${params.methodName} returned malformed result bytes.`,
      );
    }
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (err) {
    if (err instanceof FlowError) throw err;
    throw new FlowError(
      "CUSTODY_PROVIDER_NETWORK_ERROR",
      `NEAR RPC view ${params.methodName} failed due to a network error.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read-only NEAR RPC check for `outlayer.near::get_wallet_policy` to verify or
 * reconcile an on-chain policy write without modifying chain or custody state.
 */
export async function readOnChainWalletPolicy(params: {
  readonly walletPubkey: string;
  readonly rpcUrl?: string;
  readonly contractId?: string;
  readonly timeoutMs?: number;
}): Promise<OnChainWalletPolicyView | null> {
  const raw = await queryNearContractView({
    rpcUrl: params.rpcUrl ?? "https://rpc.mainnet.near.org",
    contractId: params.contractId ?? "outlayer.near",
    methodName: "get_wallet_policy",
    args: { wallet_pubkey: params.walletPubkey },
    timeoutMs: params.timeoutMs,
  });
  if (raw === null) {
    return null;
  }
  const parsed = onChainWalletPolicyViewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FlowError(
      "CUSTODY_PROVIDER_ERROR",
      "outlayer.near get_wallet_policy returned an unexpected shape.",
    );
  }
  return parsed.data;
}

/**
 * Read-only NEAR RPC query for `outlayer.near::estimate_wallet_policy_cost` (yoctoNEAR).
 */
export async function estimateOnChainPolicyStorageCost(params: {
  readonly walletPubkey: string;
  readonly encryptedData: string;
  readonly storageRefundTo?: string | null;
  readonly rpcUrl?: string;
  readonly contractId?: string;
  readonly timeoutMs?: number;
}): Promise<string> {
  const raw = await queryNearContractView({
    rpcUrl: params.rpcUrl ?? "https://rpc.mainnet.near.org",
    contractId: params.contractId ?? "outlayer.near",
    methodName: "estimate_wallet_policy_cost",
    args: {
      wallet_pubkey: params.walletPubkey,
      encrypted_data: params.encryptedData,
      storage_refund_to: params.storageRefundTo ?? null,
    },
    timeoutMs: params.timeoutMs,
  });
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new FlowError(
      "CUSTODY_PROVIDER_ERROR",
      "outlayer.near estimate_wallet_policy_cost returned an invalid yoctoNEAR amount.",
    );
  }
  return raw;
}
