import { createHash, randomBytes } from "node:crypto";
import { MCP_TOKEN_PREFIX } from "../domain/mcp-agents.ts";

export function generateMcpToken(): {
  readonly rawToken: string;
  readonly tokenPrefix: string;
  readonly tokenHash: string;
} {
  const secret = randomBytes(28).toString("hex"); // 224 bits of entropy
  const rawToken = `${MCP_TOKEN_PREFIX}${secret}`;
  return {
    rawToken,
    tokenPrefix: rawToken.slice(0, 16),
    tokenHash: hashMcpToken(rawToken),
  };
}

export function hashMcpToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}
