export type FlowErrorCode =
  | "INVALID_CONFIGURATION"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_NOT_READY"
  | "UNSUPPORTED_ENVELOPE"
  | "CORRUPTED_ENVELOPE"
  | "DECRYPTION_FAILED"
  | "INVALID_STATE_TRANSITION"
  | "CUSTODY_PROVIDER_ERROR"
  | "CUSTODY_PROVIDER_TIMEOUT"
  | "CUSTODY_PROVIDER_NETWORK_ERROR"
  | "CUSTODY_PROVIDER_RATE_LIMITED"
  | "CUSTODY_PROVIDER_UNAVAILABLE"
  | "UNSUPPORTED_CHAIN"
  | "CUSTODY_INVALID_ADDRESS"
  | "CUSTODY_PROVIDER_CORRELATION_ERROR"
  | "JOB_LEASE_EXPIRED"
  | "STALE_FENCING_TOKEN"
  | "AMBIGUOUS_OUTCOME_QUARANTINE"
  | "WALLET_ACCOUNT_MISMATCH"
  | "INCOMPLETE_WALLET_PROVISIONING"
  | "POLICY_VERIFICATION_FAILED"
  | "INVALID_CAPABILITY_GRANT"
  | "INVALID_FAILURE_CLASSIFICATION"
  | "INVALID_OPERATOR_IDENTITY"
  | "CUSTODY_OPERATOR_AUTHORIZATION_ERROR"
  | "CUSTODY_OPERATOR_AUTHENTICATION_REQUIRED"
  | "CUSTODY_INDEPENDENT_APPROVAL_REQUIRED"
  | "CUSTODY_REGISTRATION_BUDGET_EXCEEDED"
  | "CUSTODY_EXECUTION_BLOCKED"
  | "INVALID_REQUEST_ID"
  | "INVALID_RECOVERY_EVIDENCE"
  | "TWO_PERSON_APPROVAL_REQUIRED"
  | "INVALID_DECIMALS"
  | "INVALID_AMOUNT"
  | "PRECISION_OVERFLOW"
  | "AMOUNT_OVERFLOW"
  | "INSUFFICIENT_FUNDS"
  | "ACCOUNT_NOT_FOUND"
  | "CHAIN_ID_MISMATCH"
  | "UNSUPPORTED_TOKEN"
  | "RPC_RATE_LIMITED"
  | "RPC_TIMEOUT"
  | "RPC_NETWORK_ERROR"
  | "RECIPIENT_ADDRESS_MISMATCH"
  | "ASSET_MISMATCH"
  | "UNDERPAID_AMOUNT"
  | "MEMO_MISMATCH"
  | "NETWORK_MISMATCH"
  | "UNVERIFIED_SOURCE_DEPOSIT"
  | "UNVERIFIED_DESTINATION_DELIVERY"
  | "REORG_DETECTED"
  | "FIXTURE_EVIDENCE_NOT_PERMITTED";

export class FlowError extends Error {
  readonly code: FlowErrorCode;

  constructor(code: FlowErrorCode, message: string) {
    super(message);
    this.name = "FlowError";
    this.code = code;
  }
}

export function errorCode(error: unknown): FlowErrorCode | "INTERNAL_ERROR" {
  return error instanceof FlowError ? error.code : "INTERNAL_ERROR";
}

/**
 * Fixed, non-sensitive categories for correlating unexpected request failures.
 * Never include provider messages, SQL, identifiers, or arbitrary error codes.
 */
export type DiagnosticCategory =
  | "CONFIGURATION"
  | "DATABASE_NOT_READY"
  | "DATABASE_CONNECTION"
  | "DATABASE_SCHEMA"
  | "DATABASE_PERMISSION"
  | "DATABASE_CONSTRAINT"
  | "DATABASE_QUERY"
  | "AUTH_PROVIDER"
  | "UNCLASSIFIED";

export function diagnosticCategory(error: unknown): DiagnosticCategory {
  if (error instanceof FlowError) {
    if (error.code === "INVALID_CONFIGURATION") return "CONFIGURATION";
    if (error.code === "DATABASE_UNAVAILABLE") return "DATABASE_CONNECTION";
    if (error.code === "DATABASE_NOT_READY") return "DATABASE_NOT_READY";
  }
  if (!error || typeof error !== "object") return "UNCLASSIFIED";

  const candidate = error as { code?: unknown; name?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (
    /^(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|P1001|P1002|P1003|P1017)$/.test(
      code,
    )
  ) {
    return "DATABASE_CONNECTION";
  }
  if (/^(?:P2021|P2022|42P01|42703)$/.test(code)) {
    return "DATABASE_SCHEMA";
  }
  if (/^(?:P1010|P1011|42501)$/.test(code)) {
    return "DATABASE_PERMISSION";
  }
  if (/^(?:P2002|P2003|23505|23503)$/.test(code)) {
    return "DATABASE_CONSTRAINT";
  }
  if (/^P\d{4}$/.test(code) || /^08/.test(code)) {
    return "DATABASE_QUERY";
  }
  if (candidate.name === "APIError" || candidate.name === "BetterAuthError") {
    return "AUTH_PROVIDER";
  }
  return "UNCLASSIFIED";
}
