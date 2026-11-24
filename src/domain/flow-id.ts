const RESERVED_FLOW_HANDLES = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "billing",
  "custody",
  "flow",
  "flowid",
  "help",
  "info",
  "official",
  "owner",
  "pay",
  "payments",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "treasury",
  "wallet",
]);

export const PENDING_SEND_FLOW_ID_COOKIE = "flow_pending_send_to";

export function normalizeFlowIdHandle(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.endsWith("@flow") ? trimmed.slice(0, -5).trim() : trimmed;
}

export function formatFlowId(handle: string): string {
  return `${normalizeFlowIdHandle(handle)}@flow`;
}

export function isFlowIdInput(value: string): boolean {
  return value.trim().toLowerCase().endsWith("@flow");
}

export function buildDirectFlowLink(
  flowId: string,
  origin = "https://flow.devhub.forum",
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/${formatFlowId(flowId)}`;
}

export function parseDirectFlowIdParam(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  if (!isFlowIdInput(decoded)) return null;
  const parsed = validateFlowIdHandle(decoded);
  return parsed.valid ? parsed.flowId : null;
}

export function validateFlowIdHandle(
  raw: string,
):
  | { valid: true; handle: string; flowId: string }
  | { valid: false; reason: string } {
  const handle = normalizeFlowIdHandle(raw);
  if (handle.length < 3 || handle.length > 30) {
    return {
      valid: false,
      reason: "Flow ID must be between 3 and 30 characters before @flow.",
    };
  }
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(handle)) {
    return {
      valid: false,
      reason:
        "Use only lowercase letters, numbers, dots, underscores, or hyphens, starting and ending with a letter or number.",
    };
  }
  if (/(\.\.|--|__|\._|_\.|\.-|-\.|_-|-_)/.test(handle)) {
    return {
      valid: false,
      reason: "Flow ID cannot contain consecutive punctuation characters.",
    };
  }
  if (RESERVED_FLOW_HANDLES.has(handle)) {
    return {
      valid: false,
      reason: "That Flow ID is reserved. Please choose another.",
    };
  }
  return {
    valid: true,
    handle,
    flowId: `${handle}@flow`,
  };
}
