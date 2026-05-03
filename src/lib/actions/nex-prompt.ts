"use server";

/**
 * Server Actions do Agente Nex — system prompt + Base de Conhecimento (KB).
 *
 * Apenas super_admin pode ler/editar prompt ou enviar/excluir documentos da
 * KB. Todas as mutações geram audit log com `action="setting_updated"` e
 * `targetType` em ("nex_prompt"|"nex_kb_document").
 *
 * Wrapper `safeAction` (ver llm-credentials.ts §v0.12.1) garante que toda
 * exceção inesperada vire `{ ok:false, error }` em vez de derrubar a sessão
 * Next ("This page couldn't load").
 *
 * Upload de KB recebe FormData com Blob (≤ 5 MB) + name. PDF é extraído via
 * `pdf-parse` dentro de try/catch específico (review-2 A4): falha → mensagem
 * amigável "Tente exportar como TXT".
 */

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  composeSystemPrompt,
  getNexPromptConfig,
  saveNexPromptConfig,
  type NexPromptConfig,
} from "@/lib/nex/prompt";
import {
  createKbDocument,
  deleteKbDocument,
  getKbDocsForPrompt,
  getKbDocumentById,
  listKbDocuments,
  updateKbDocumentContent,
  MAX_DOC_FILE_BYTES,
  type KbSummary,
} from "@/lib/nex/kb";
import { assertPublicUrl, fetchKbUrl } from "@/lib/nex/kb-url";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function safeAction<T>(
  fn: () => Promise<ActionResult<T>>,
  context: string,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[nex-prompt:${context}] erro inesperado:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro inesperado: ${msg.slice(0, 200)}`,
    };
  }
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode editar a configuração do Agente Nex",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

export async function getNexPromptConfigAction(): Promise<
  ActionResult<NexPromptConfig>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    const data = await getNexPromptConfig();
    return { ok: true, data };
  }, "get-config");
}

export async function saveNexPromptConfigAction(
  input: NexPromptConfig,
): Promise<ActionResult> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      await saveNexPromptConfig(input, guard.userId);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao salvar configuração do Agente Nex",
      };
    }
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_prompt",
      details: {
        personalityLength: input.personality.length,
        toneLength: input.tone.length,
        guardrailsCount: input.guardrails.length,
        hasOverride:
          !!input.advancedOverride && input.advancedOverride.trim().length > 0,
        audioInputEnabled: input.audioInputEnabled,
        kbEnabled: input.kbEnabled,
      },
    });
    return { ok: true };
  }, "save-config");
}

export async function previewSystemPromptAction(
  input: NexPromptConfig,
): Promise<ActionResult<{ composedPrompt: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    const docs = input.kbEnabled ? await getKbDocsForPrompt() : [];
    const composedPrompt = composeSystemPrompt(input, docs);
    return { ok: true, data: { composedPrompt } };
  }, "preview");
}

export async function listKbDocumentsAction(): Promise<
  ActionResult<KbSummary[]>
> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    const data = await listKbDocuments();
    return { ok: true, data };
  }, "list-kb");
}

const ACCEPTED_KB_MIMES = new Set(["application/pdf", "text/plain"]);

export async function uploadKbDocumentAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; charCount: number }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const file = formData.get("file");
    const nameRaw = formData.get("name");

    if (!(file instanceof Blob)) {
      return { ok: false, error: "Arquivo ausente no upload" };
    }
    if (file.size === 0) {
      return { ok: false, error: "Arquivo vazio" };
    }
    if (file.size > MAX_DOC_FILE_BYTES) {
      return {
        ok: false,
        error: `Arquivo excede o tamanho máximo de 5 MB (${MAX_DOC_FILE_BYTES} bytes)`,
      };
    }

    const mimeType = file.type || "application/octet-stream";
    if (!ACCEPTED_KB_MIMES.has(mimeType)) {
      return { ok: false, error: "Apenas PDF e TXT são aceitos" };
    }

    const fallbackName =
      file instanceof File && file.name ? file.name : "documento";
    const name =
      typeof nameRaw === "string" && nameRaw.trim().length > 0
        ? nameRaw.trim()
        : fallbackName;

    let extracted: string;
    if (mimeType === "application/pdf") {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const pdfParseModule = (await import("pdf-parse")) as unknown as {
          default: (b: Buffer) => Promise<{ text: string }>;
        };
        const pdfParse = pdfParseModule.default;
        const out = await pdfParse(buf);
        extracted = out.text ?? "";
      } catch (err) {
        console.error("[nex-prompt:upload-kb] pdf-parse falhou:", err);
        return {
          ok: false,
          error:
            "Não foi possível extrair texto do PDF. Tente exportar como TXT.",
        };
      }
    } else {
      // text/plain
      try {
        extracted = await file.text();
      } catch (err) {
        console.error("[nex-prompt:upload-kb] leitura TXT falhou:", err);
        return {
          ok: false,
          error: "Não foi possível ler o arquivo TXT",
        };
      }
    }

    let createdId: string;
    try {
      createdId = await createKbDocument({
        name,
        mimeType,
        fileSize: file.size,
        extractedText: extracted,
        uploadedById: guard.userId,
      });
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao salvar documento de KB",
      };
    }

    // Char count efetivo (após sanitize+truncate de createKbDocument).
    // Recalculamos do texto pré-persistência: sanitize NUL e trunca em
    // 100k apenas pra refletir charCount entregue ao banco.
    const sanitized = extracted.replace(/\x00/g, "");
    const truncated =
      sanitized.length > 100_000 ? sanitized.slice(0, 100_000) : sanitized;
    const charCount = truncated.length;

    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_kb_document",
      targetId: createdId,
      details: {
        name,
        mimeType,
        fileSize: file.size,
        charCount,
      },
    });

    return { ok: true, data: { id: createdId, charCount } };
  }, "upload-kb");
}

export async function deleteKbDocumentAction(
  id: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    if (!id || typeof id !== "string") {
      return { ok: false, error: "ID inválido" };
    }
    try {
      await deleteKbDocument(id);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao excluir documento de KB",
      };
    }
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_kb_document",
      targetId: id,
    });
    return { ok: true };
  }, "delete-kb");
}

// ---------------------------------------------------------------------------
// v0.16.0 — KB URL: addKbUrl + refreshKbUrl (T4a)
// ---------------------------------------------------------------------------

const MAX_KB_URL_NAME = 200;
const MAX_KB_URL_LEN = 2048;

/**
 * Adiciona um documento de KB do tipo URL.
 *
 * Pipeline: super_admin guard → validação tamanho do nome/URL →
 * `assertPublicUrl` (HTTPS + SSRF block via DNS) → `fetchKbUrl`
 * (timeout 10s, cap 5MB, html-to-text) → `createKbDocument(kind="URL",
 * sourceUrl=...)` → audit log.
 *
 * Erros amigáveis em PT-BR vindos de `assertPublicUrl`/`fetchKbUrl`
 * são propagados para a UI via `safeAction`.
 */
export async function addKbUrlAction(input: {
  name: string;
  url: string;
}): Promise<ActionResult<{ id: string; charCount: number }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const name = (input?.name ?? "").trim();
    const rawUrl = (input?.url ?? "").trim();
    if (!name || name.length > MAX_KB_URL_NAME) {
      return { ok: false, error: "Nome inválido (1-200 caracteres)." };
    }
    if (!rawUrl || rawUrl.length > MAX_KB_URL_LEN) {
      return { ok: false, error: "URL inválida — use HTTPS." };
    }

    let parsed: URL;
    try {
      parsed = await assertPublicUrl(rawUrl);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "URL inválida — use HTTPS.",
      };
    }

    let fetched: { text: string; mimeType: string; truncated: boolean };
    try {
      fetched = await fetchKbUrl(parsed);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Não foi possível baixar o conteúdo da URL.",
      };
    }

    let createdId: string;
    try {
      createdId = await createKbDocument({
        name,
        kind: "URL",
        sourceUrl: rawUrl,
        mimeType: fetched.mimeType,
        fileSize: Buffer.byteLength(fetched.text, "utf8"),
        extractedText: fetched.text,
        uploadedById: guard.userId,
      });
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao salvar documento de KB.",
      };
    }

    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_kb_document",
      targetId: createdId,
      details: {
        kind: "URL",
        sourceUrl: rawUrl,
        charCount: fetched.text.length,
        truncated: fetched.truncated,
      },
    });

    return { ok: true, data: { id: createdId, charCount: fetched.text.length } };
  }, "add-kb-url");
}

/**
 * Re-baixa o conteúdo de um KB doc do tipo URL e atualiza
 * `extracted_text`/`char_count`/`file_size`. Em caso de falha (timeout,
 * 5xx, content-type bloqueado, SSRF) o texto antigo é mantido — o UPDATE
 * só ocorre em sucesso.
 */
export async function refreshKbUrlAction(
  docId: string,
): Promise<ActionResult<{ charCount: number; truncated: boolean }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    if (!docId || typeof docId !== "string") {
      return { ok: false, error: "ID inválido" };
    }

    const doc = await getKbDocumentById(docId);
    if (!doc) {
      return { ok: false, error: "Documento não encontrado." };
    }
    if (doc.kind !== "URL" || !doc.sourceUrl) {
      return { ok: false, error: "Documento não é do tipo URL." };
    }

    let parsed: URL;
    try {
      parsed = await assertPublicUrl(doc.sourceUrl);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "URL inválida — use HTTPS.",
      };
    }

    let fetched: { text: string; mimeType: string; truncated: boolean };
    try {
      fetched = await fetchKbUrl(parsed);
    } catch (err) {
      // Falha mantém texto antigo — não chamamos UPDATE.
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Não foi possível baixar o conteúdo da URL.",
      };
    }

    try {
      await updateKbDocumentContent(docId, fetched.text);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao atualizar documento de KB.",
      };
    }

    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_kb_document",
      targetId: docId,
      details: {
        action: "refresh",
        charCount: fetched.text.length,
        truncated: fetched.truncated,
      },
    });

    return {
      ok: true,
      data: { charCount: fetched.text.length, truncated: fetched.truncated },
    };
  }, "refresh-kb-url");
}

// ---------------------------------------------------------------------------
// v0.28.0 — Identity base (T-E1c): saveIdentityBaseAction + resetIdentityBaseAction
// ---------------------------------------------------------------------------

const MAX_IDENTITY_BASE_LEN = 5_000;

/**
 * Persiste um override de `identity_base` na coluna `nex_settings.identity_base`.
 *
 * Apenas super_admin. Trim aplicado; vazio rejeitado. Tamanho > 5000 chars
 * rejeitado. Demais campos da config são preservados (read-modify-write).
 */
export async function saveIdentityBaseAction(
  text: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    const trimmed = (text ?? "").trim();
    if (trimmed.length === 0) {
      return { ok: false, error: "Identity base não pode ficar vazia" };
    }
    if (trimmed.length > MAX_IDENTITY_BASE_LEN) {
      return {
        ok: false,
        error: `Identity base excede ${MAX_IDENTITY_BASE_LEN} caracteres`,
      };
    }
    const current = await getNexPromptConfig();
    try {
      await saveNexPromptConfig(
        { ...current, identityBase: trimmed },
        guard.userId,
      );
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao salvar identity base do Agente Nex",
      };
    }
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_prompt",
      details: {
        identityBaseLength: trimmed.length,
        identityBaseAction: "save",
      },
    });
    return { ok: true };
  }, "save-identity-base");
}

/**
 * Remove o override de `identity_base` (volta para o IDENTITY_BASE hardcoded).
 *
 * Apenas super_admin. Persiste `identityBase: null`, demais campos preservados.
 */
export async function resetIdentityBaseAction(): Promise<ActionResult> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    const current = await getNexPromptConfig();
    try {
      await saveNexPromptConfig(
        { ...current, identityBase: null },
        guard.userId,
      );
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao resetar identity base do Agente Nex",
      };
    }
    await logAudit({
      userId: guard.userId,
      action: "setting_updated",
      targetType: "nex_prompt",
      details: {
        identityBaseAction: "reset",
      },
    });
    return { ok: true };
  }, "reset-identity-base");
}
