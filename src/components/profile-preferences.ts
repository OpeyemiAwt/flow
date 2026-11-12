export const PROFILE_PREFERENCE_EVENT = "flow-profile-preference-change";

export type ProfilePreference =
  | "name"
  | "avatar"
  | "incomingPayments"
  | "paymentLinkActivity"
  | "securityAlerts";

export function readProfilePreference(
  profileId: string | undefined,
  preference: ProfilePreference,
): string | null {
  if (!profileId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(
      "flow-profile:" + profileId + ":" + preference,
    );
  } catch {
    return null;
  }
}

export function writeProfilePreference(
  profileId: string,
  preference: ProfilePreference,
  value: string | null,
): void {
  const key = "flow-profile:" + profileId + ":" + preference;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(PROFILE_PREFERENCE_EVENT));
}

export function isInAppNotificationEnabled(
  profileId: string | undefined,
  type: string,
): boolean {
  const preference =
    type === "PAYMENT_RECEIVED" ||
    type === "PAYMENT_COMPLETED" ||
    type === "DEPOSIT_DETECTED"
      ? "incomingPayments"
      : type === "PAYMENT_LINK_CREATED"
        ? "paymentLinkActivity"
        : type === "SECURITY_NOTICE"
          ? "securityAlerts"
          : null;
  return (
    !preference || readProfilePreference(profileId, preference) !== "false"
  );
}
