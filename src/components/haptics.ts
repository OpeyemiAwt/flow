"use client";

export type HapticStyle = "light" | "medium" | "success" | "error";

const VIBRATION_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 8,
  medium: 16,
  success: [10, 32, 16],
  error: [22, 40, 22],
};

/**
 * Triggers subtle hardware haptic feedback via the Vibration API when supported.
 * Respects prefers-reduced-motion and silently no-ops on unsupported browsers.
 */
export function triggerHaptic(style: HapticStyle = "light"): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }
  try {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATION_PATTERNS[style]);
    }
  } catch {
    // Ignore unsupported browser errors
  }
}
