import { validateEcosystemAddress } from "./supported-assets-catalog.ts";

export interface QuoteNetwork {
  readonly networkKey: string;
  readonly networkName: string;
  readonly ecosystem: "evm" | "solana" | "near" | "other";
}

export function supportsQuoteAddress(network: QuoteNetwork): boolean {
  return (
    network.ecosystem !== "other" ||
    network.networkKey === "sui-mainnet" ||
    network.networkKey === "tron-mainnet"
  );
}

export function validateQuoteAddress(
  network: QuoteNetwork,
  address: string,
): { valid: boolean; reason?: string } {
  const value = address.trim();
  if (!supportsQuoteAddress(network)) {
    return {
      valid: false,
      reason: `FLOW does not support the refund address format for ${network.networkName}.`,
    };
  }
  if (!value) {
    return {
      valid: false,
      reason: `Enter a ${network.networkName} address.`,
    };
  }
  if (network.ecosystem === "evm") {
    return /^0x[0-9a-f]{40}$/i.test(value)
      ? { valid: true }
      : {
          valid: false,
          reason: `${network.networkName} requires an EVM address starting with 0x.`,
        };
  }
  if (network.networkKey === "sui-mainnet") {
    return /^0x[0-9a-f]{64}$/i.test(value)
      ? { valid: true }
      : {
          valid: false,
          reason:
            "Sui requires a 32-byte hexadecimal address starting with 0x.",
        };
  }
  if (network.networkKey === "tron-mainnet") {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)
      ? { valid: true }
      : {
          valid: false,
          reason: "Tron requires a Base58Check address starting with T.",
        };
  }
  if (network.ecosystem === "solana" || network.ecosystem === "near") {
    return validateEcosystemAddress(network.ecosystem, value);
  }
  return { valid: false };
}
