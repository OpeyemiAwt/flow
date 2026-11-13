export interface OnboardingAccountState {
  readonly id: string;
  readonly kind: "PERSONAL" | "BUSINESS";
  readonly provisioningComplete: boolean;
}

/** Wallet-dependent pages are available only after an ACTIVE wallet is verified. */
export function authenticatedEntryPath(
  accounts: readonly OnboardingAccountState[],
): string {
  const personal = accounts.find((account) => account.kind === "PERSONAL");
  if (personal?.provisioningComplete) return `/accounts/${personal.id}`;
  return "/onboarding";
}
