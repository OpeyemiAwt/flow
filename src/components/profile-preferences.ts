export const PROFILE_PREFERENCE_EVENT = "flow-profile-preference-change";
export const BALANCE_VISIBILITY_EVENT = "flow-balance-visibility-change";
export const THEME_CHANGE_EVENT = "flow-theme-change";

export function readBalanceHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("flow-hide-balance") === "true";
  } catch {
    return false;
  }
}

export function writeBalanceHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("flow-hide-balance", hidden ? "true" : "false");
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(BALANCE_VISIBILITY_EVENT));
}

export function readIsDarkTheme(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      document.documentElement.classList.contains("dark") ||
      window.localStorage.getItem("flow-theme") === "dark"
    );
  } catch {
    return document.documentElement.classList.contains("dark");
  }
}

export function applyDarkTheme(next: boolean): void {
  if (typeof window === "undefined") return;
  document.documentElement.classList.toggle("dark", next);
  try {
    window.localStorage.setItem("flow-theme", next ? "dark" : "light");
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

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
