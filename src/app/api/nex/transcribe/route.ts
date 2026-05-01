import { auth } from "@/auth";
import { logUsage } from "@/lib/llm/agent/usage-logger";
import { calculateCost } from "@/lib/llm/pricing";
import { transcribeAudio } from "@/lib/nex/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (!user.id) {
    return Response.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  let audio: Blob | null = null;
  let language = "pt";
  try {
    const fd = await req.formData();
    const f = fd.get("audio");
    if (f instanceof Blob) audio = f;
    const lang = fd.get("language");
    if (typeof lang === "string" && lang.length > 0) language = lang;
  } catch {
    return Response.json(
      { ok: false, error: "Payload multipart inválido" },
      { status: 400 },
    );
  }
  if (!audio) {
    return Response.json(
      { ok: false, error: "Campo 'audio' ausente" },
      { status: 400 },
    );
  }

  try {
    const start = Date.now();
    const r = await transcribeAudio(audio, language);
    const cost = calculateCost("whisper-1", 0, 0, {
      durationMs: r.durationSeconds * 1000,
    });
    void logUsage({
      provider: "openai",
      model: "whisper-1",
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: cost,
      promptChars: 0,
      responseChars: r.text.length,
      userId: user.id,
      durationMs: Date.now() - start,
    });
    return Response.json(
      { ok: true, text: r.text, durationSeconds: r.durationSeconds },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
