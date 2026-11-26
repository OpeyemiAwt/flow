import "server-only";
import type { FlowDb } from "../foundation/prisma.ts";
import type { AssistantMessage } from "./ai-assistant-service.ts";

export interface AiConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiConversationDetail {
  readonly id: string;
  readonly title: string;
  readonly messages: AssistantMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function isMissingConversationsTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("ai_conversations") &&
    (msg.includes("does not exist") || msg.includes("42P01"))
  );
}

function deriveConversationTitle(firstPrompt: string): string {
  const cleaned = firstPrompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  if (cleaned.length <= 56) return cleaned;
  return `${cleaned.slice(0, 55).trimEnd()}…`;
}

function sanitizeStoredMessages(raw: unknown): AssistantMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is AssistantMessage =>
        Boolean(item) &&
        typeof item === "object" &&
        ((item as Record<string, unknown>).role === "user" ||
          (item as Record<string, unknown>).role === "assistant") &&
        typeof (item as Record<string, unknown>).content === "string",
    )
    .slice(-80);
}

export async function listAiConversations(
  db: FlowDb,
  params: { accountId: string; userId: string; limit?: number },
): Promise<AiConversationSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 50);
  try {
    const rows = await db.$queryRaw<
      Array<{
        id: string;
        title: string;
        messages: unknown;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT id::text, title, messages, created_at, updated_at
      FROM flow.ai_conversations
      WHERE account_id = ${params.accountId}::uuid
        AND user_id = ${params.userId}::uuid
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => {
      const msgs = sanitizeStoredMessages(row.messages);
      const lastMsg = msgs[msgs.length - 1];
      const previewRaw = lastMsg?.content?.replace(/\s+/g, " ").trim() ?? "";
      const preview =
        previewRaw.length > 90
          ? `${previewRaw.slice(0, 89).trimEnd()}…`
          : previewRaw;
      return {
        id: row.id,
        title: row.title,
        preview,
        messageCount: msgs.length,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  } catch (err) {
    if (isMissingConversationsTable(err)) return [];
    throw err;
  }
}

export async function getAiConversation(
  db: FlowDb,
  params: { accountId: string; userId: string; conversationId: string },
): Promise<AiConversationDetail | null> {
  if (!isValidUuid(params.conversationId)) return null;
  try {
    const rows = await db.$queryRaw<
      Array<{
        id: string;
        title: string;
        messages: unknown;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT id::text, title, messages, created_at, updated_at
      FROM flow.ai_conversations
      WHERE id = ${params.conversationId}::uuid
        AND account_id = ${params.accountId}::uuid
        AND user_id = ${params.userId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      messages: sanitizeStoredMessages(row.messages),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  } catch (err) {
    if (isMissingConversationsTable(err)) return null;
    throw err;
  }
}

export async function saveAiConversationTurn(
  db: FlowDb,
  params: {
    accountId: string;
    userId: string;
    conversationId?: string | null;
    userMessage: AssistantMessage;
    assistantMessage: AssistantMessage;
  },
): Promise<{
  conversationId: string;
  title: string;
  updatedAt: string;
} | null> {
  try {
    if (isValidUuid(params.conversationId)) {
      const existing = await getAiConversation(db, {
        accountId: params.accountId,
        userId: params.userId,
        conversationId: params.conversationId,
      });
      if (existing) {
        const nextMessages = [
          ...existing.messages,
          params.userMessage,
          params.assistantMessage,
        ].slice(-80);
        const [updated] = await db.$queryRaw<
          Array<{ id: string; title: string; updated_at: Date }>
        >`
          UPDATE flow.ai_conversations
          SET
            messages = ${JSON.stringify(nextMessages)}::jsonb,
            updated_at = now()
          WHERE id = ${existing.id}::uuid
            AND account_id = ${params.accountId}::uuid
            AND user_id = ${params.userId}::uuid
          RETURNING id::text, title, updated_at
        `;
        if (updated) {
          return {
            conversationId: updated.id,
            title: updated.title,
            updatedAt: new Date(updated.updated_at).toISOString(),
          };
        }
      }
    }

    const title = deriveConversationTitle(params.userMessage.content);
    const initialMessages = [params.userMessage, params.assistantMessage];
    const [inserted] = await db.$queryRaw<
      Array<{ id: string; title: string; updated_at: Date }>
    >`
      INSERT INTO flow.ai_conversations (
        account_id,
        user_id,
        title,
        messages
      )
      VALUES (
        ${params.accountId}::uuid,
        ${params.userId}::uuid,
        ${title},
        ${JSON.stringify(initialMessages)}::jsonb
      )
      RETURNING id::text, title, updated_at
    `;
    if (!inserted) return null;
    return {
      conversationId: inserted.id,
      title: inserted.title,
      updatedAt: new Date(inserted.updated_at).toISOString(),
    };
  } catch (err) {
    if (isMissingConversationsTable(err)) return null;
    throw err;
  }
}

export async function markAiConversationCardSent(
  db: FlowDb,
  params: {
    accountId: string;
    userId: string;
    conversationId?: string | null;
    messageId?: string | null;
    patch: Record<string, unknown>;
  },
): Promise<void> {
  if (!isValidUuid(params.conversationId) || !params.messageId) return;
  try {
    const existing = await getAiConversation(db, {
      accountId: params.accountId,
      userId: params.userId,
      conversationId: params.conversationId,
    });
    if (!existing) return;
    let changed = false;
    const updatedMessages = existing.messages.map((msg) => {
      if (msg.id === params.messageId && msg.card) {
        changed = true;
        return {
          ...msg,
          card: {
            ...msg.card,
            data: {
              ...msg.card.data,
              ...params.patch,
            },
          },
        };
      }
      return msg;
    });
    if (!changed) return;
    await db.$executeRaw`
      UPDATE flow.ai_conversations
      SET
        messages = ${JSON.stringify(updatedMessages)}::jsonb,
        updated_at = now()
      WHERE id = ${existing.id}::uuid
        AND account_id = ${params.accountId}::uuid
        AND user_id = ${params.userId}::uuid
    `;
  } catch (err) {
    if (isMissingConversationsTable(err)) return;
    // Non-fatal
  }
}

export async function deleteAiConversation(
  db: FlowDb,
  params: { accountId: string; userId: string; conversationId: string },
): Promise<boolean> {
  if (!isValidUuid(params.conversationId)) return false;
  try {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      DELETE FROM flow.ai_conversations
      WHERE id = ${params.conversationId}::uuid
        AND account_id = ${params.accountId}::uuid
        AND user_id = ${params.userId}::uuid
      RETURNING id::text
    `;
    return rows.length > 0;
  } catch (err) {
    if (isMissingConversationsTable(err)) return false;
    throw err;
  }
}
