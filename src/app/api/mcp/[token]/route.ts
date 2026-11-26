import {
  handleMcpDelete,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
} from "../../../../server/mcp-server-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export function OPTIONS() {
  return handleMcpOptions();
}

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  return handleMcpGet(request, token);
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  return handleMcpPost(request, token);
}

export function DELETE() {
  return handleMcpDelete();
}
