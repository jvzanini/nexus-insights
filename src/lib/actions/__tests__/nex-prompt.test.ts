jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/nex/prompt", () => ({
  getNexPromptConfig: jest.fn(),
  saveNexPromptConfig: jest.fn(),
  composeSystemPrompt: jest.fn(),
}));
jest.mock("@/lib/nex/kb", () => ({
  listKbDocuments: jest.fn(),
  createKbDocument: jest.fn(),
  deleteKbDocument: jest.fn(),
  getKbDocsForPrompt: jest.fn(),
  getKbDocumentById: jest.fn(),
  updateKbDocumentContent: jest.fn(),
  MAX_DOC_FILE_BYTES: 5 * 1024 * 1024,
}));
jest.mock("@/lib/nex/kb-url", () => ({
  assertPublicUrl: jest.fn(),
  fetchKbUrl: jest.fn(),
}));

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import * as promptLib from "@/lib/nex/prompt";
import * as kbLib from "@/lib/nex/kb";
import * as kbUrlLib from "@/lib/nex/kb-url";
import {
  getNexPromptConfigAction,
  saveNexPromptConfigAction,
  previewSystemPromptAction,
  listKbDocumentsAction,
  uploadKbDocumentAction,
  deleteKbDocumentAction,
  addKbUrlAction,
  refreshKbUrlAction,
  saveIdentityBaseAction,
  resetIdentityBaseAction,
} from "../nex-prompt";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;

const baseCfg: promptLib.NexPromptConfig = {
  identityBase: null,
  personality: "calmo",
  tone: "direto",
  guardrails: ["sempre PT-BR"],
  advancedOverride: null,
  audioInputEnabled: false,
  kbEnabled: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
  (promptLib.getNexPromptConfig as jest.Mock).mockResolvedValue(baseCfg);
  (promptLib.saveNexPromptConfig as jest.Mock).mockResolvedValue(undefined);
  (promptLib.composeSystemPrompt as jest.Mock).mockReturnValue("PROMPT-COMPOSTO");
  (kbLib.listKbDocuments as jest.Mock).mockResolvedValue([]);
  (kbLib.getKbDocsForPrompt as jest.Mock).mockResolvedValue([]);
  (kbLib.createKbDocument as jest.Mock).mockResolvedValue(
    "11111111-1111-1111-1111-111111111111",
  );
  (kbLib.deleteKbDocument as jest.Mock).mockResolvedValue(undefined);
});

describe("guarda super_admin", () => {
  it("getNexPromptConfigAction rejeita viewer", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-2", platformRole: "viewer" },
    } as never);
    const r = await getNexPromptConfigAction();
    expect(r.ok).toBe(false);
    expect(promptLib.getNexPromptConfig).not.toHaveBeenCalled();
  });

  it("saveNexPromptConfigAction rejeita manager", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-3", platformRole: "manager" },
    } as never);
    const r = await saveNexPromptConfigAction(baseCfg);
    expect(r.ok).toBe(false);
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
  });

  it("previewSystemPromptAction rejeita admin (não super_admin)", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-4", platformRole: "admin" },
    } as never);
    const r = await previewSystemPromptAction(baseCfg);
    expect(r.ok).toBe(false);
    expect(promptLib.composeSystemPrompt).not.toHaveBeenCalled();
  });

  it("listKbDocumentsAction rejeita viewer", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-5", platformRole: "viewer" },
    } as never);
    const r = await listKbDocumentsAction();
    expect(r.ok).toBe(false);
    expect(kbLib.listKbDocuments).not.toHaveBeenCalled();
  });

  it("uploadKbDocumentAction rejeita viewer", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-6", platformRole: "viewer" },
    } as never);
    const fd = new FormData();
    fd.append("name", "x.txt");
    fd.append(
      "file",
      new Blob(["abc"], { type: "text/plain" }),
      "x.txt",
    );
    const r = await uploadKbDocumentAction(fd);
    expect(r.ok).toBe(false);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("deleteKbDocumentAction rejeita viewer", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-7", platformRole: "viewer" },
    } as never);
    const r = await deleteKbDocumentAction("id-1");
    expect(r.ok).toBe(false);
    expect(kbLib.deleteKbDocument).not.toHaveBeenCalled();
  });
});

describe("getNexPromptConfigAction", () => {
  it("retorna config da lib", async () => {
    const r = await getNexPromptConfigAction();
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(baseCfg);
    expect(promptLib.getNexPromptConfig).toHaveBeenCalledTimes(1);
  });
});

describe("saveNexPromptConfigAction", () => {
  it("persiste e loga audit setting_updated com targetType=nex_prompt", async () => {
    const r = await saveNexPromptConfigAction(baseCfg);
    expect(r.ok).toBe(true);
    expect(promptLib.saveNexPromptConfig).toHaveBeenCalledWith(baseCfg, "u-1");
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const call = mockedLogAudit.mock.calls[0][0];
    expect(call.action).toBe("setting_updated");
    expect(call.targetType).toBe("nex_prompt");
    expect(call.userId).toBe("u-1");
  });
});

describe("previewSystemPromptAction", () => {
  it("retorna composedPrompt sem persistir", async () => {
    (kbLib.getKbDocsForPrompt as jest.Mock).mockResolvedValueOnce([
      { name: "doc.txt", extractedText: "blob" },
    ]);
    (promptLib.composeSystemPrompt as jest.Mock).mockReturnValueOnce(
      "PROMPT-FINAL",
    );
    const r = await previewSystemPromptAction(baseCfg);
    expect(r.ok).toBe(true);
    expect(r.data?.composedPrompt).toBe("PROMPT-FINAL");
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
    expect(mockedLogAudit).not.toHaveBeenCalled();
  });

  it("não busca KB quando kbEnabled=false", async () => {
    const cfg = { ...baseCfg, kbEnabled: false };
    await previewSystemPromptAction(cfg);
    expect(kbLib.getKbDocsForPrompt).not.toHaveBeenCalled();
    expect(promptLib.composeSystemPrompt).toHaveBeenCalledWith(cfg, []);
  });
});

describe("listKbDocumentsAction", () => {
  it("usa lib listKbDocuments", async () => {
    const summaries = [
      {
        id: "id-a",
        name: "manual.pdf",
        mimeType: "application/pdf",
        fileSize: 1234,
        charCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        uploadedById: null,
      },
    ];
    (kbLib.listKbDocuments as jest.Mock).mockResolvedValueOnce(summaries);
    const r = await listKbDocumentsAction();
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(summaries);
    expect(kbLib.listKbDocuments).toHaveBeenCalledTimes(1);
  });
});

describe("uploadKbDocumentAction", () => {
  function makeFormData(blob: Blob, name = "doc.txt"): FormData {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("file", blob, name);
    return fd;
  }

  it("rejeita quando arquivo ausente", async () => {
    const fd = new FormData();
    fd.append("name", "vazio.txt");
    const r = await uploadKbDocumentAction(fd);
    expect(r.ok).toBe(false);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("rejeita mime não suportado", async () => {
    const fd = makeFormData(
      new Blob(["x"], { type: "image/png" }),
      "img.png",
    );
    const r = await uploadKbDocumentAction(fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/PDF|TXT/i);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("rejeita arquivo > 5 MB", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const fd = makeFormData(
      new Blob([big], { type: "text/plain" }),
      "big.txt",
    );
    const r = await uploadKbDocumentAction(fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/5\s*MB|tamanho|máximo/i);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("TXT lê texto direto e cria doc + audit log nex_kb_document", async () => {
    const fd = makeFormData(
      new Blob(["conteudo do txt"], { type: "text/plain" }),
      "ok.txt",
    );
    const r = await uploadKbDocumentAction(fd);
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(r.data?.charCount).toBe("conteudo do txt".length);
    expect(kbLib.createKbDocument).toHaveBeenCalledTimes(1);
    const call = (kbLib.createKbDocument as jest.Mock).mock.calls[0][0];
    expect(call.name).toBe("ok.txt");
    expect(call.mimeType).toBe("text/plain");
    expect(call.extractedText).toBe("conteudo do txt");
    expect(call.uploadedById).toBe("u-1");
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_kb_document");
  });

  it("PDF com pdf-parse falhando retorna erro amigável (review-2 A4)", async () => {
    jest.doMock("pdf-parse", () => ({
      __esModule: true,
      default: jest.fn(async () => {
        throw new Error("parse error");
      }),
    }));
    jest.resetModules();
    // Re-require para pegar mock atualizado.
    const fresh = await import("../nex-prompt");
    // re-aplicar mocks manuais que `resetModules` zerou:
    jest.doMock("@/auth", () => ({ auth: jest.fn() }));
    jest.doMock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
    jest.doMock("@/lib/nex/prompt", () => promptLib);
    jest.doMock("@/lib/nex/kb", () => kbLib);
    const { auth: a2 } = await import("@/auth");
    (a2 as jest.MockedFunction<typeof auth>).mockResolvedValue({
      user: { id: "u-1", platformRole: "super_admin" },
    } as never);

    const fd = new FormData();
    fd.append("name", "doc.pdf");
    fd.append(
      "file",
      new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }),
      "doc.pdf",
    );
    const r = await fresh.uploadKbDocumentAction(fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/PDF/i);
    // Reset modules para não vazar pro próximo teste
    jest.resetModules();
  });
});

describe("deleteKbDocumentAction", () => {
  it("loga audit com targetType=nex_kb_document e targetId", async () => {
    const r = await deleteKbDocumentAction("doc-id-x");
    expect(r.ok).toBe(true);
    expect(kbLib.deleteKbDocument).toHaveBeenCalledWith("doc-id-x");
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_kb_document");
    expect(audit.targetId).toBe("doc-id-x");
    expect(audit.userId).toBe("u-1");
  });
});

// ---------------------------------------------------------------------------
// T4a — addKbUrlAction + refreshKbUrlAction
// ---------------------------------------------------------------------------

describe("addKbUrlAction", () => {
  beforeEach(() => {
    (kbUrlLib.assertPublicUrl as jest.Mock).mockResolvedValue(
      new URL("https://example.com/article"),
    );
    (kbUrlLib.fetchKbUrl as jest.Mock).mockResolvedValue({
      text: "conteudo extraido",
      mimeType: "text/html",
      truncated: false,
    });
    (kbLib.createKbDocument as jest.Mock).mockResolvedValue(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("rejeita sem super_admin (401)", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-9", platformRole: "viewer" },
    } as never);
    const r = await addKbUrlAction({
      name: "doc",
      url: "https://example.com/article",
    });
    expect(r.ok).toBe(false);
    expect(kbUrlLib.assertPublicUrl).not.toHaveBeenCalled();
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("rejeita URL inválida (assertPublicUrl rejeita não-HTTPS)", async () => {
    (kbUrlLib.assertPublicUrl as jest.Mock).mockRejectedValueOnce(
      new Error("URL inválida — use HTTPS."),
    );
    const r = await addKbUrlAction({
      name: "doc",
      url: "http://example.com",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HTTPS/);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("rejeita SSRF (assertPublicUrl rejeita endereço privado)", async () => {
    (kbUrlLib.assertPublicUrl as jest.Mock).mockRejectedValueOnce(
      new Error("URL aponta para endereço privado/local — não permitida."),
    );
    const r = await addKbUrlAction({
      name: "doc",
      url: "https://localhost-fake.example",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/privado|local/i);
    expect(kbLib.createKbDocument).not.toHaveBeenCalled();
  });

  it("OK insere com kind=URL + sourceUrl + texto extraído", async () => {
    const r = await addKbUrlAction({
      name: "Artigo X",
      url: "https://example.com/article",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe("22222222-2222-2222-2222-222222222222");
    expect(r.data?.charCount).toBe("conteudo extraido".length);
    expect(kbLib.createKbDocument).toHaveBeenCalledTimes(1);
    const call = (kbLib.createKbDocument as jest.Mock).mock.calls[0][0];
    expect(call.name).toBe("Artigo X");
    expect(call.kind).toBe("URL");
    expect(call.sourceUrl).toBe("https://example.com/article");
    expect(call.mimeType).toBe("text/html");
    expect(call.extractedText).toBe("conteudo extraido");
    expect(call.uploadedById).toBe("u-1");
  });

  it("loga audit com action=setting_updated e targetType=nex_kb_document", async () => {
    const r = await addKbUrlAction({
      name: "Artigo X",
      url: "https://example.com/article",
    });
    expect(r.ok).toBe(true);
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_kb_document");
    expect(audit.targetId).toBe("22222222-2222-2222-2222-222222222222");
    expect(audit.userId).toBe("u-1");
    expect(audit.details).toMatchObject({
      kind: "URL",
      sourceUrl: "https://example.com/article",
      charCount: "conteudo extraido".length,
    });
  });
});

describe("refreshKbUrlAction", () => {
  beforeEach(() => {
    (kbLib.getKbDocumentById as jest.Mock).mockResolvedValue({
      id: "doc-url-1",
      name: "Artigo X",
      kind: "URL",
      sourceUrl: "https://example.com/article",
      extractedText: "texto antigo",
    });
    (kbUrlLib.assertPublicUrl as jest.Mock).mockResolvedValue(
      new URL("https://example.com/article"),
    );
    (kbUrlLib.fetchKbUrl as jest.Mock).mockResolvedValue({
      text: "texto novo",
      mimeType: "text/html",
      truncated: false,
    });
    (kbLib.updateKbDocumentContent as jest.Mock).mockResolvedValue({
      charCount: "texto novo".length,
    });
  });

  it("OK refaz fetch e atualiza extractedText", async () => {
    const r = await refreshKbUrlAction("doc-url-1");
    expect(r.ok).toBe(true);
    expect(r.data?.charCount).toBe("texto novo".length);
    expect(r.data?.truncated).toBe(false);
    expect(kbLib.updateKbDocumentContent).toHaveBeenCalledWith(
      "doc-url-1",
      "texto novo",
    );
  });

  it("falha de fetch mantém texto antigo (nunca chama UPDATE)", async () => {
    (kbUrlLib.fetchKbUrl as jest.Mock).mockRejectedValueOnce(
      new Error("A página demorou demais para responder. Tente outra fonte ou tente mais tarde."),
    );
    const r = await refreshKbUrlAction("doc-url-1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/demor|demais|responder/i);
    expect(kbLib.updateKbDocumentContent).not.toHaveBeenCalled();
  });

  it("loga audit com action=setting_updated e details.action=refresh", async () => {
    const r = await refreshKbUrlAction("doc-url-1");
    expect(r.ok).toBe(true);
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_kb_document");
    expect(audit.targetId).toBe("doc-url-1");
    expect(audit.userId).toBe("u-1");
    expect(audit.details).toMatchObject({
      action: "refresh",
      charCount: "texto novo".length,
      truncated: false,
    });
  });
});

// ---------------------------------------------------------------------------
// T-E1c (v0.28) — saveIdentityBaseAction + resetIdentityBaseAction
// ---------------------------------------------------------------------------

describe("saveIdentityBaseAction (v0.28)", () => {
  it("super_admin: persiste identity_base no DB com user.id", async () => {
    const result = await saveIdentityBaseAction("Novo prompt customizado");
    expect(result.ok).toBe(true);
    expect(promptLib.saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ identityBase: "Novo prompt customizado" }),
      "u-1",
    );
  });

  it("não-superadmin (viewer): nega com erro de permissão", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-x", platformRole: "viewer" },
    } as never);
    const result = await saveIdentityBaseAction("x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/super_admin|permissão/i);
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
  });

  it("texto vazio (após trim): nega", async () => {
    const result = await saveIdentityBaseAction("   ");
    expect(result.ok).toBe(false);
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
  });

  it("texto > 5000 chars: nega", async () => {
    const tooLong = "a".repeat(5_001);
    const result = await saveIdentityBaseAction(tooLong);
    expect(result.ok).toBe(false);
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
  });

  it("preserva demais campos da config existente", async () => {
    (promptLib.getNexPromptConfig as jest.Mock).mockResolvedValueOnce({
      ...baseCfg,
      personality: "antiga",
      tone: "antigo",
      guardrails: ["existente"],
    });
    const result = await saveIdentityBaseAction("Novo identity");
    expect(result.ok).toBe(true);
    expect(promptLib.saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        identityBase: "Novo identity",
        personality: "antiga",
        tone: "antigo",
        guardrails: ["existente"],
      }),
      "u-1",
    );
  });

  it("loga audit setting_updated com targetType=nex_prompt", async () => {
    const result = await saveIdentityBaseAction("Novo prompt");
    expect(result.ok).toBe(true);
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_prompt");
    expect(audit.userId).toBe("u-1");
  });
});

describe("resetIdentityBaseAction (v0.28)", () => {
  it("super_admin: persiste identityBase=null", async () => {
    (promptLib.getNexPromptConfig as jest.Mock).mockResolvedValueOnce({
      ...baseCfg,
      identityBase: "custom anterior",
    });
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(true);
    expect(promptLib.saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({ identityBase: null }),
      "u-1",
    );
  });

  it("não-superadmin: nega com erro de permissão", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-y", platformRole: "viewer" },
    } as never);
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/super_admin|permissão/i);
    expect(promptLib.saveNexPromptConfig).not.toHaveBeenCalled();
  });

  it("preserva demais campos da config existente", async () => {
    (promptLib.getNexPromptConfig as jest.Mock).mockResolvedValueOnce({
      ...baseCfg,
      identityBase: "custom",
      personality: "p",
      tone: "t",
      guardrails: ["g"],
    });
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(true);
    expect(promptLib.saveNexPromptConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        identityBase: null,
        personality: "p",
        tone: "t",
        guardrails: ["g"],
      }),
      "u-1",
    );
  });

  it("loga audit setting_updated com targetType=nex_prompt", async () => {
    const result = await resetIdentityBaseAction();
    expect(result.ok).toBe(true);
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("nex_prompt");
    expect(audit.userId).toBe("u-1");
  });
});
