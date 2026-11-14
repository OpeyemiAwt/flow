"use client";

import { useEffect, useState } from "react";
import {
  hydrateProfilePreferencesOnce,
  PROFILE_PREFERENCE_EVENT,
  readProfilePreference,
} from "./profile-preferences.ts";

function sanitizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return null;
}

function deriveInitial(
  email?: string | null,
  name?: string | null,
  alt?: string,
): string {
  const candidate = (email?.trim() || name?.trim() || alt?.trim() || "F")
    .replace(/[^a-zA-Z0-9]/g, " ")
    .trim();
  const ch = candidate.charAt(0).toUpperCase();
  return ch || "F";
}

export function UserAvatar({
  profileId,
  className = "h-9 w-9 rounded-full object-cover border border-white/20 shrink-0",
  alt = "Profile",
  fallbackImage,
  email,
  name,
  size,
}: {
  profileId?: string;
  className?: string;
  alt?: string;
  fallbackImage?: string | null;
  email?: string | null;
  name?: string | null;
  size?: number;
}) {
  const safeFallback = sanitizeImageUrl(fallbackImage);
  const [src, setSrc] = useState<string | null>(safeFallback);

  useEffect(() => {
    const sync = () => {
      const custom = sanitizeImageUrl(
        readProfilePreference(profileId, "avatar"),
      );
      setSrc(custom ?? safeFallback);
    };
    sync();
    hydrateProfilePreferencesOnce(profileId);
    window.addEventListener(PROFILE_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PROFILE_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profileId, safeFallback]);

  const style = size ? { width: size, height: size } : undefined;
  const initial = deriveInitial(email, name, alt);
  const fontSize = size ? Math.max(12, Math.round(size * 0.42)) : 14;

  if (!src) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`inline-flex items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-display font-bold select-none shrink-0 ${className}`}
        style={{ ...style, fontSize }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={style}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (src !== safeFallback && safeFallback) {
          setSrc(safeFallback);
        } else {
          setSrc(null);
        }
      }}
    />
  );
}
