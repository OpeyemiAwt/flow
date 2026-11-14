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

const hydratedProfiles = new Set<string>();

export async function hydrateProfilePreferencesOnce(
  profileId: string | undefined,
): Promise<void> {
  if (!profileId || typeof window === "undefined") return;
  if (hydratedProfiles.has(profileId)) return;
  hydratedProfiles.add(profileId);
  try {
    const res = await fetch("/api/me/preferences", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      ok?: boolean;
      profile?: { displayName?: string | null; avatarDataUrl?: string | null };
    };
    if (!data.ok || !data.profile) return;
    if (data.profile.displayName !== undefined) {
      writeProfilePreference(profileId, "name", data.profile.displayName);
    }
    if (data.profile.avatarDataUrl !== undefined) {
      writeProfilePreference(profileId, "avatar", data.profile.avatarDataUrl);
    }
  } catch {
    // Offline or unauthenticated contexts keep local fallback
  }
}
