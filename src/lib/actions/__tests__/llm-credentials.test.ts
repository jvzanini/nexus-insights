jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/llm/credentials", () => ({
  listCredentials: jest.fn(),
  createCredential: jest.fn(),
  updateCredential: jest.fn(),
  deleteCredential: jest.fn(),
  getCredentialApiKey: jest.fn(),
  CREDENTIAL_IN_USE: "CREDENTIAL_IN_USE",
}));
jest.mock("@/lib/llm/providers/test-connection", () => ({
  deepTest: jest.fn(),
  describeErrorKind: jest.fn((_k: string, m: string) => m),
}));

import { auth } from "@/auth";
import {
  listLlmCredentialsAction,
  createLlmCredentialAction,
  updateLlmCredentialAction,
  deleteLlmCredentialAction,
  testLlmCredentialAction,
} from "../llm-credentials";
import * as creds from "@/lib/llm/credentials";
import { logAudit } from "@/lib/audit";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
});

describe("guarda super_admin", () => {
  it("listLlmCredentialsAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await listLlmCredentialsAction();
    expect(r.ok).toBe(false);
    expect(creds.listCredentials).not.toHaveBeenCalled();
  });

  it("createLlmCredentialAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "manager" },
    } as never);
    const r = await createLlmCredentialAction({
      provider: "openai",
      apiKey: "sk-1234567890",
    });
    expect(r.ok).toBe(false);
    expect(creds.createCredential).not.toHaveBeenCalled();
  });

  it("updateLlmCredentialAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await updateLlmCredentialAction("id-1", { label: "X" });
    expect(r.ok).toBe(false);
    expect(creds.updateCredential).not.toHaveBeenCalled();
  });

  it("deleteLlmCredentialAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await deleteLlmCredentialAction("id-1");
    expect(r.ok).toBe(false);
    expect(creds.deleteCredential).not.toHaveBeenCalled();
  });

  it("testLlmCredentialAction rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await testLlmCredentialAction("id-1", "openai", "gpt-4o");
    expect(r.ok).toBe(false);
    expect(creds.getCredentialApiKey).not.toHaveBeenCalled();
  });
});

describe("listLlmCredentialsAction", () => {
  it("retorna lista da lib", async () => {
    (creds.listCredentials as jest.Mock).mockResolvedValueOnce([
      {
        id: "c-1",
        provider: "openai",
        label: "Chave 1",
        last4: "9999",
        createdAt: "2026-04-30T00:00:00Z",
        updatedAt: "2026-04-30T00:00:00Z",
      },
    ]);
    const r = await listLlmCredentialsAction("openai");
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(creds.listCredentials).toHaveBeenCalledWith("openai");
  });
});

describe("createLlmCredentialAction", () => {
  it("cria + audit log + retorna {id, label, last4}", async () => {
    (creds.createCredential as jest.Mock).mockResolvedValueOnce({
      id: "new-1",
      label: "Chave 1",
      last4: "9999",
    });
    const r = await createLlmCredentialAction({
      provider: "openai",
      apiKey: "sk-1234567890",
    });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ id: "new-1", label: "Chave 1", last4: "9999" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "credential_created" }),
    );
  });

  it("propaga mensagem de erro da lib", async () => {
    (creds.createCredential as jest.Mock).mockRejectedValueOnce(
      new Error("Label \"X\" já existe para este provider"),
    );
    const r = await createLlmCredentialAction({
      provider: "openai",
      label: "X",
      apiKey: "sk-1234567890",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/já existe/);
  });
});

describe("updateLlmCredentialAction", () => {
  it("atualiza + audit log com rotated=true quando troca a chave", async () => {
    (creds.updateCredential as jest.Mock).mockResolvedValueOnce({
      provider: "openai",
      label: "Chave 1",
      last4: "abcd",
    });
    const r = await updateLlmCredentialAction("id-1", {
      apiKey: "sk-newkey1234",
    });
    expect(r.ok).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "credential_updated",
        details: expect.objectContaining({ rotated: true }),
      }),
    );
  });
});

describe("deleteLlmCredentialAction", () => {
  it("deleta + audit log", async () => {
    (creds.deleteCredential as jest.Mock).mockResolvedValueOnce(undefined);
    const r = await deleteLlmCredentialAction("id-1");
    expect(r.ok).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "credential_deleted",
        targetId: "id-1",
      }),
    );
  });

  it("traduz CREDENTIAL_IN_USE em mensagem amigável", async () => {
    (creds.deleteCredential as jest.Mock).mockRejectedValueOnce(
      new Error("CREDENTIAL_IN_USE"),
    );
    const r = await deleteLlmCredentialAction("id-1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/em uso/);
  });
});

describe("testLlmCredentialAction", () => {
  it("usa getCredentialApiKey + deepTest", async () => {
    (creds.getCredentialApiKey as jest.Mock).mockResolvedValueOnce("sk-LIVE");
    const { deepTest } = require("@/lib/llm/providers/test-connection");
    (deepTest as jest.Mock).mockResolvedValueOnce({
      reachable: true,
      message: "ok",
      creditOk: true,
    });
    const r = await testLlmCredentialAction("id-1", "openai", "gpt-4o");
    expect(r.ok).toBe(true);
    expect(r.data?.reachable).toBe(true);
    expect(creds.getCredentialApiKey).toHaveBeenCalledWith("id-1");
    expect(deepTest).toHaveBeenCalledWith("openai", "sk-LIVE", "gpt-4o");
  });

  it("retorna erro quando credencial não é encontrada", async () => {
    (creds.getCredentialApiKey as jest.Mock).mockResolvedValueOnce(null);
    const r = await testLlmCredentialAction("missing", "openai", "gpt-4o");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não encontrada|ilegível/i);
  });

  it("registra audit log com reachable", async () => {
    (creds.getCredentialApiKey as jest.Mock).mockResolvedValueOnce("sk-LIVE");
    const { deepTest } = require("@/lib/llm/providers/test-connection");
    (deepTest as jest.Mock).mockResolvedValueOnce({
      reachable: false,
      message: "Auth failed",
      errorKind: "auth",
    });
    await testLlmCredentialAction("id-1", "openai", "gpt-4o");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "credential_tested",
        details: expect.objectContaining({ reachable: false }),
      }),
    );
  });
});
