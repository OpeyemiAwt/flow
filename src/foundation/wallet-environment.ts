import { z } from "zod";
import { FlowError } from "./errors.ts";

export const ALLOWED_OUTLAYER_HOSTS = Object.freeze([
  "api.outlayer.ai",
  "testnet-api.outlayer.ai",
  "api.outlayer.fastnear.com",
  "api.testnet.outlayer.fastnear.com",
  "127.0.0.1",
  "localhost",
  "[::1]",
]);

export const OUTLAYER_MAINNET_API_URL = "https://api.outlayer.ai";
export const OUTLAYER_TESTNET_API_URL = "https://testnet-api.outlayer.ai";

const walletConfigSchema = z.object({
  FLOW_WALLET_PROVIDER: z.enum(["outlayer", "mock"]).default("outlayer"),
  FLOW_WALLET_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
  FLOW_WALLET_KEY_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default("v1"),
  FLOW_OUTLAYER_API_URL: z.url().default("https://api.outlayer.ai"),

  // Dedicated fail-closed provider compatibility mode (prohibited by default)
  FLOW_PROVIDER_COMPATIBILITY_MODE: z
    .enum(["disabled", "authorized"])
    .default("disabled"),
  FLOW_PROVIDER_COMPATIBILITY_AUTHORIZATION_ID: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
  FLOW_PROVIDER_COMPATIBILITY_ENVIRONMENT: z
    .enum(["testnet", "mainnet"])
    .default("testnet"),
  FLOW_PROVIDER_COMPATIBILITY_TOKEN: z.string().min(16).max(256).optional(),
  FLOW_PROVIDER_COMPATIBILITY_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
  FLOW_PROVIDER_COMPATIBILITY_MAX_REGISTRATIONS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1)
    .default(1),

  // Optional read-only blockchain JSON-RPC endpoints
  FLOW_NEAR_RPC_URL: z.url().optional(),
  FLOW_BASE_RPC_URL: z.url().optional(),
  FLOW_SOLANA_RPC_URL: z.url().optional(),
  FLOW_ETHEREUM_RPC_URL: z.url().optional(),

  // Optional future NEAR Intents 1Click endpoint
  FLOW_NEAR_INTENTS_API_URL: z.url().optional(),
});

export type WalletEnvironmentInput = Readonly<
  Record<string, string | undefined>
>;

export interface ProviderCompatibilityConfig {
  readonly mode: "disabled" | "authorized";
  readonly authorizationId?: string;
  readonly authorizedToken?: string;
  readonly isolatedAccountId?: string;
  readonly providerEnvironment?: "testnet" | "mainnet";
  readonly allowedMethods?: readonly string[];
  readonly maxRegistrations: number;
}

export function readWalletConfig(
  source: WalletEnvironmentInput,
  authSecrets?: { authSecret?: string; otpKey?: string },
) {
  const normalizedSource: WalletEnvironmentInput = {
    ...source,
    FLOW_OUTLAYER_API_URL:
      source.FLOW_OUTLAYER_API_URL ??
      source.OUTLAYER_BASE_URL ??
      source.OUTLAYER_API_URL,
  };
  const parsed = walletConfigSchema.safeParse(normalizedSource);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new FlowError(
      "INVALID_CONFIGURATION",
      `Invalid wallet configuration: ${names.join(", ")}.`,
    );
  }

  const {
    FLOW_WALLET_PROVIDER,
    FLOW_WALLET_ENCRYPTION_KEY,
    FLOW_WALLET_KEY_ID,
    FLOW_OUTLAYER_API_URL,
    FLOW_PROVIDER_COMPATIBILITY_MODE,
    FLOW_PROVIDER_COMPATIBILITY_AUTHORIZATION_ID,
    FLOW_PROVIDER_COMPATIBILITY_ENVIRONMENT,
    FLOW_PROVIDER_COMPATIBILITY_TOKEN,
    FLOW_PROVIDER_COMPATIBILITY_ACCOUNT_ID,
    FLOW_PROVIDER_COMPATIBILITY_MAX_REGISTRATIONS,
    FLOW_NEAR_RPC_URL,
    FLOW_BASE_RPC_URL,
    FLOW_SOLANA_RPC_URL,
    FLOW_ETHEREUM_RPC_URL,
    FLOW_NEAR_INTENTS_API_URL,
  } = parsed.data;

  const key = FLOW_WALLET_ENCRYPTION_KEY;
  if (
    new Set(key).size < 8 ||
    key.startsWith("replace-") ||
    key === authSecrets?.authSecret ||
    key === authSecrets?.otpKey
  ) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "Wallet encryption key is invalid, placeholder, or reuses authentication secrets.",
    );
  }

  const url = new URL(FLOW_OUTLAYER_API_URL);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1") {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "OutLayer API URL must use HTTPS (or loopback for testing).",
    );
  }

  // Validate Provider Compatibility Mode invariants (fail-closed)
  let compatibilityConfig: ProviderCompatibilityConfig;
  if (FLOW_PROVIDER_COMPATIBILITY_MODE === "authorized") {
    // 1. Financial execution MUST be disabled
    if (
      source.FLOW_EXECUTION !== undefined &&
      source.FLOW_EXECUTION !== "disabled"
    ) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "Provider compatibility mode cannot be authorized unless FLOW_EXECUTION=disabled.",
      );
    }
    // 2. Token must be supplied and not placeholder
    if (
      !FLOW_PROVIDER_COMPATIBILITY_TOKEN ||
      FLOW_PROVIDER_COMPATIBILITY_TOKEN.startsWith("replace-") ||
      FLOW_PROVIDER_COMPATIBILITY_TOKEN.length < 16
    ) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "Provider compatibility mode requires a valid non-placeholder FLOW_PROVIDER_COMPATIBILITY_TOKEN.",
      );
    }
    // 3. Isolated account ID must be explicitly configured
    if (!FLOW_PROVIDER_COMPATIBILITY_ACCOUNT_ID) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "Provider compatibility mode requires an explicit FLOW_PROVIDER_COMPATIBILITY_ACCOUNT_ID.",
      );
    }
    // 4. Endpoint must be in the allowed OutLayer hosts
    if (!ALLOWED_OUTLAYER_HOSTS.includes(url.hostname)) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        `Provider compatibility mode endpoint ${url.hostname} is not in the allowlist.`,
      );
    }
    // 5. Fail-closed environment & coordinator binding (Requirement 7)
    const isLoopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]";
    if (FLOW_PROVIDER_COMPATIBILITY_ENVIRONMENT === "testnet" && !isLoopback) {
      if (url.hostname !== "testnet-api.outlayer.ai") {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "Testnet compatibility rehearsal strictly requires FLOW_OUTLAYER_API_URL to be https://testnet-api.outlayer.ai; mainnet and deprecated endpoints are strictly prohibited.",
        );
      }
    } else if (
      FLOW_PROVIDER_COMPATIBILITY_ENVIRONMENT === "mainnet" &&
      !isLoopback
    ) {
      if (url.hostname !== "api.outlayer.ai") {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "Mainnet compatibility mode requires FLOW_OUTLAYER_API_URL to be https://api.outlayer.ai.",
        );
      }
    }

    compatibilityConfig = {
      mode: "authorized",
      authorizationId: FLOW_PROVIDER_COMPATIBILITY_AUTHORIZATION_ID,
      authorizedToken: FLOW_PROVIDER_COMPATIBILITY_TOKEN,
      isolatedAccountId: FLOW_PROVIDER_COMPATIBILITY_ACCOUNT_ID,
      providerEnvironment: FLOW_PROVIDER_COMPATIBILITY_ENVIRONMENT,
      allowedMethods: [
        "POST /register",
        "GET /wallet/v1/address",
        "GET /wallet/v1/policy",
      ],
      maxRegistrations: FLOW_PROVIDER_COMPATIBILITY_MAX_REGISTRATIONS,
    };
  } else {
    compatibilityConfig = {
      mode: "disabled",
      maxRegistrations: 0,
    };
  }

  return {
    provider: FLOW_WALLET_PROVIDER,
    encryptionKey: key,
    keyId: FLOW_WALLET_KEY_ID,
    apiUrl: url.origin,
    compatibility: compatibilityConfig,
    rpc: {
      nearRpcUrl: FLOW_NEAR_RPC_URL,
      baseRpcUrl: FLOW_BASE_RPC_URL,
      solanaRpcUrl: FLOW_SOLANA_RPC_URL,
      ethereumRpcUrl: FLOW_ETHEREUM_RPC_URL,
      nearIntentsApiUrl: FLOW_NEAR_INTENTS_API_URL,
    },
  };
}

export type WalletConfig = ReturnType<typeof readWalletConfig>;

export const MAX_HARD_PER_WALLET_SPONSOR_YOCTO =
  50_000_000_000_000_000_000_000n; // 0.05 NEAR absolute ceiling
export const DEFAULT_PER_WALLET_SPONSOR_YOCTO =
  30_000_000_000_000_000_000_000n; // 0.03 NEAR
export const DEFAULT_SPONSOR_DAILY_CAP_YOCTO =
  1_000_000_000_000_000_000_000_000n; // 1.00 NEAR / 24h
export const DEFAULT_SPONSOR_MIN_BALANCE_YOCTO =
  100_000_000_000_000_000_000_000n; // 0.10 NEAR operational reserve
export const OUTLAYER_POLICY_CONTRACT_ID = "outlayer.near";

const NEAR_ACCOUNT_ID_REGEX =
  /^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/;

function isValidNearAccountIdentifier(value: string): boolean {
  return (
    value.length >= 2 &&
    value.length <= 64 &&
    (NEAR_ACCOUNT_ID_REGEX.test(value) || /^[0-9a-f]{64}$/.test(value))
  );
}

const policySponsorEnvSchema = z.object({
  FLOW_POLICY_SPONSOR_ENABLED: z
    .enum(["disabled", "enabled"])
    .default("disabled"),
  FLOW_NEAR_NETWORK: z.enum(["mainnet"]).default("mainnet"),
  FLOW_NEAR_SPONSOR_ACCOUNT_ID: z.string().trim().optional(),
  FLOW_NEAR_SPONSOR_PRIVATE_KEY: z.string().trim().optional(),
  FLOW_NEAR_SPONSOR_SIGNER_URL: z.string().trim().optional(),
  FLOW_NEAR_SPONSOR_SIGNER_TOKEN: z.string().trim().optional(),
  FLOW_NEAR_POLICY_CONTRACT_ID: z
    .string()
    .trim()
    .default(OUTLAYER_POLICY_CONTRACT_ID),
  FLOW_NEAR_RPC_URL: z
    .string()
    .trim()
    .default("https://rpc.mainnet.fastnear.com"),
  FLOW_NEAR_SPONSOR_MAX_FEE_PER_WALLET_YOCTO: z
    .string()
    .trim()
    .regex(/^[0-9]+$/)
    .optional(),
  FLOW_NEAR_SPONSOR_DAILY_CAP_YOCTO: z
    .string()
    .trim()
    .regex(/^[0-9]+$/)
    .optional(),
  FLOW_NEAR_SPONSOR_MIN_BALANCE_YOCTO: z
    .string()
    .trim()
    .regex(/^[0-9]+$/)
    .optional(),
  FLOW_NEAR_SPONSOR_CIRCUIT_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  FLOW_POLICY_APPROVAL_ACCOUNT_ID: z.string().trim().optional(),
  FLOW_POLICY_APPROVAL_LOCKED: z
    .enum(["disabled", "enabled"])
    .default("disabled"),
});

export type PolicySponsorConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      nearNetwork: "mainnet";
      sponsorAccountId: string;
      contractId: string;
      rpcUrl: string;
      fallbackRpcUrls: readonly string[];
      signerMode: "local-ed25519" | "remote-signer";
      privateKey?: string;
      remoteSignerUrl?: string;
      remoteSignerToken?: string;
      maxFeePerWalletYocto: bigint;
      dailySpendCapYocto: bigint;
      minBalanceReserveYocto: bigint;
      circuitFailureThreshold: number;
      approvalAccountId?: string;
      lockInitialPolicy: boolean;
    }>;

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]"
  );
}

/**
 * Parses and validates the isolated NEAR policy-storage sponsor configuration.
 * Fails closed whenever sponsorship is enabled without valid sponsor identity,
 * signer credentials, strict outlayer.near contract binding, and spend caps.
 */
export function readPolicySponsorConfig(
  source: WalletEnvironmentInput,
  options?: { allowTestContractOverride?: boolean },
): PolicySponsorConfig {
  const parsed = policySponsorEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "Invalid NEAR policy sponsor environment configuration.",
    );
  }

  const env = parsed.data;
  if (env.FLOW_POLICY_SPONSOR_ENABLED !== "enabled") {
    return { enabled: false };
  }

  const sponsorAccountId = env.FLOW_NEAR_SPONSOR_ACCOUNT_ID?.toLowerCase() ?? "";
  if (!isValidNearAccountIdentifier(sponsorAccountId)) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_SPONSOR_ACCOUNT_ID must be a valid NEAR mainnet account ID.",
    );
  }

  const allowOverride =
    options?.allowTestContractOverride === true ||
    source.NODE_ENV === "test";
  if (
    env.FLOW_NEAR_POLICY_CONTRACT_ID !== OUTLAYER_POLICY_CONTRACT_ID &&
    !allowOverride
  ) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      `Sponsor contract must strictly be ${OUTLAYER_POLICY_CONTRACT_ID}.`,
    );
  }

  let rpcUrl: URL;
  try {
    rpcUrl = new URL(env.FLOW_NEAR_RPC_URL);
  } catch {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_RPC_URL must be a valid URL.",
    );
  }
  if (rpcUrl.protocol !== "https:" && !isLoopbackHost(rpcUrl.hostname)) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_RPC_URL must use HTTPS outside local loopback tests.",
    );
  }

  const hasLocalKey = Boolean(env.FLOW_NEAR_SPONSOR_PRIVATE_KEY);
  const hasRemoteSigner = Boolean(env.FLOW_NEAR_SPONSOR_SIGNER_URL);
  if (hasLocalKey === hasRemoteSigner) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "Configure exactly one sponsor signer: FLOW_NEAR_SPONSOR_PRIVATE_KEY or FLOW_NEAR_SPONSOR_SIGNER_URL.",
    );
  }

  let signerMode: "local-ed25519" | "remote-signer";
  let privateKey: string | undefined;
  let remoteSignerUrl: string | undefined;
  let remoteSignerToken: string | undefined;

  if (hasLocalKey) {
    const rawKey = env.FLOW_NEAR_SPONSOR_PRIVATE_KEY!;
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,100}$/.test(rawKey)) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "FLOW_NEAR_SPONSOR_PRIVATE_KEY must be an ed25519:<base58> NEAR private key.",
      );
    }
    signerMode = "local-ed25519";
    privateKey = rawKey;
  } else {
    let signerUrl: URL;
    try {
      signerUrl = new URL(env.FLOW_NEAR_SPONSOR_SIGNER_URL!);
    } catch {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "FLOW_NEAR_SPONSOR_SIGNER_URL must be a valid URL.",
      );
    }
    if (signerUrl.protocol !== "https:" && !isLoopbackHost(signerUrl.hostname)) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "FLOW_NEAR_SPONSOR_SIGNER_URL must use HTTPS.",
      );
    }
    if (
      !env.FLOW_NEAR_SPONSOR_SIGNER_TOKEN ||
      env.FLOW_NEAR_SPONSOR_SIGNER_TOKEN.length < 32
    ) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "FLOW_NEAR_SPONSOR_SIGNER_TOKEN (minimum 32 chars) is required with remote signer.",
      );
    }
    signerMode = "remote-signer";
    remoteSignerUrl = signerUrl.toString();
    remoteSignerToken = env.FLOW_NEAR_SPONSOR_SIGNER_TOKEN;
  }

  const maxFeePerWalletYocto = env.FLOW_NEAR_SPONSOR_MAX_FEE_PER_WALLET_YOCTO
    ? BigInt(env.FLOW_NEAR_SPONSOR_MAX_FEE_PER_WALLET_YOCTO)
    : DEFAULT_PER_WALLET_SPONSOR_YOCTO;
  if (
    maxFeePerWalletYocto <= 0n ||
    maxFeePerWalletYocto > MAX_HARD_PER_WALLET_SPONSOR_YOCTO
  ) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_SPONSOR_MAX_FEE_PER_WALLET_YOCTO must be between 1 yoctoNEAR and 0.05 NEAR.",
    );
  }

  const dailySpendCapYocto = env.FLOW_NEAR_SPONSOR_DAILY_CAP_YOCTO
    ? BigInt(env.FLOW_NEAR_SPONSOR_DAILY_CAP_YOCTO)
    : DEFAULT_SPONSOR_DAILY_CAP_YOCTO;
  if (dailySpendCapYocto < maxFeePerWalletYocto) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_SPONSOR_DAILY_CAP_YOCTO must be at least MAX_FEE_PER_WALLET_YOCTO.",
    );
  }

  const minBalanceReserveYocto = env.FLOW_NEAR_SPONSOR_MIN_BALANCE_YOCTO
    ? BigInt(env.FLOW_NEAR_SPONSOR_MIN_BALANCE_YOCTO)
    : DEFAULT_SPONSOR_MIN_BALANCE_YOCTO;
  if (minBalanceReserveYocto < 50_000_000_000_000_000_000_000n) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_NEAR_SPONSOR_MIN_BALANCE_YOCTO must be at least 0.05 NEAR.",
    );
  }

  let approvalAccountId: string | undefined;
  if (env.FLOW_POLICY_APPROVAL_ACCOUNT_ID) {
    const candidate = env.FLOW_POLICY_APPROVAL_ACCOUNT_ID.toLowerCase();
    if (
      !isValidNearAccountIdentifier(candidate) ||
      candidate === sponsorAccountId
    ) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "FLOW_POLICY_APPROVAL_ACCOUNT_ID must be a valid NEAR account distinct from sponsor.",
      );
    }
    approvalAccountId = candidate;
  }
  if (env.FLOW_POLICY_APPROVAL_LOCKED === "enabled" && !approvalAccountId) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "FLOW_POLICY_APPROVAL_LOCKED=enabled requires FLOW_POLICY_APPROVAL_ACCOUNT_ID.",
    );
  }

  return {
    enabled: true,
    nearNetwork: env.FLOW_NEAR_NETWORK,
    sponsorAccountId,
    contractId: env.FLOW_NEAR_POLICY_CONTRACT_ID,
    rpcUrl: rpcUrl.origin,
    fallbackRpcUrls: isLoopbackHost(rpcUrl.hostname)
      ? []
      : ["https://free.rpc.fastnear.com"],
    signerMode,
    privateKey,
    remoteSignerUrl,
    remoteSignerToken,
    maxFeePerWalletYocto,
    dailySpendCapYocto,
    minBalanceReserveYocto,
    circuitFailureThreshold: env.FLOW_NEAR_SPONSOR_CIRCUIT_THRESHOLD,
    approvalAccountId,
    lockInitialPolicy: env.FLOW_POLICY_APPROVAL_LOCKED === "enabled",
  };
}
