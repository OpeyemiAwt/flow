"use client";

import { useEffect, useState } from "react";
import {
  PROFILE_PREFERENCE_EVENT,
  readProfilePreference,
} from "./profile-preferences.ts";

const DEFAULT_AVATAR_SRC = "/assets/amara-avatar.png";

export function UserAvatar({
  profileId,
  className = "h-9 w-9 rounded-full object-cover border border-white/20 shrink-0",
  alt = "Profile",
  defaultSrc = DEFAULT_AVATAR_SRC,
  size,
}: {
  profileId?: string;
  className?: string;
  alt?: string;
  defaultSrc?: string;
  size?: number;
}) {
  const [src, setSrc] = useState(defaultSrc);

  useEffect(() => {
    const sync = () =>
      setSrc(readProfilePreference(profileId, "avatar") || defaultSrc);
    sync();
    window.addEventListener(PROFILE_PREFERENCE_EVENT, sync);
    return () => window.removeEventListener(PROFILE_PREFERENCE_EVENT, sync);
  }, [defaultSrc, profileId]);

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={size ? { width: `${size}px`, height: `${size}px` } : undefined}
      className={className}
      onError={() => setSrc(defaultSrc)}
    />
  );
}
