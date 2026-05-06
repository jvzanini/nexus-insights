import { createHash } from "crypto";
import { runNexAgent } from "@/lib/llm/agent/run-nex";
import type { ChatMessage } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MATRIX_ACCOUNT_ID = 9;

function computeExpectedSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return createHash("sha256")
    .update(secret + ":nexus-calibrate-v1")
    .digest("hex");
}

export async function POST(req: Request): Promise<Response> {
  const providedSecret = req.headers.get("x-calibrate-secret") ?? "";
  if (providedSecret !== computeExpectedSecret()) {
    return Response.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }

  let body: { message: string; history?: ChatMessage[]; promptOverride?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Body inválido" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return Response.json({ ok: false, error: "message vazio" }, { status: 400 });
  }

  const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: message },
  ];

  const result = await runNexAgent({
    messages,
    accountId: MATRIX_ACCOUNT_ID,
    platformRole: "super_admin",
    isPlayground: true,
    debugMode: true,
    ...(body.promptOverride ? { promptOverride: body.promptOverride } : {}),
  });

  return Response.json(result);
}
