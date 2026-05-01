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
  MAX_DOC_FILE_BYTES: 5 * 1024 * 1024,
}));

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import * as promptLib from "@/lib/nex/prompt";
import * as kbLib from "@/lib/nex/kb";
import {
  getNexPromptConfigAction,
  saveNexPromptConfigAction,
  previewSystemPromptAction,
  listKbDocumentsAction,
  uploadKbDocumentAction,
  deleteKbDocumentAction,
} from "../nex-prompt";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;

const baseCfg: promptLib.NexPromptConfig = {
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
