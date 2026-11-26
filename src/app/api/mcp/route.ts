import {
  handleMcpDelete,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
} from "../../../server/mcp-server-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return handleMcpOptions();
}

export function GET(request: Request) {
  return handleMcpGet(request);
}

export function POST(request: Request) {
  return handleMcpPost(request);
}

export function DELETE() {
  return handleMcpDelete();
}
