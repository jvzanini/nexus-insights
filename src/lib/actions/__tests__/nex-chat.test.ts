jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/llm/agent/run-nex", () => ({ runNexAgent: jest.fn() }));
jest.mock("@/lib/reports/active-account", () => ({
  getActiveAccountId: jest.fn(),
  NoAccessibleAccountError: class extends Error {},
}));

import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";
import { runNexAgent } from "@/lib/llm/agent/run-nex";
import { getActiveAccountId, NoAccessibleAccountError } from "@/lib/reports/active-account";
import { sendNexMessage } from "../nex-chat";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockedRunNexAgent = runNexAgent as jest.MockedFunction<typeof runNexAgent>;
const mockedGetActiveAccountId = getActiveAccountId as jest.MockedFunction<typeof getActiveAccountId>;

describe("sendNexMessage (v0.31)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({
      user: { id: "u-1" },
    } as never);
    mockedGetCurrentUser.mockResolvedValue({
      id: "u-1",
      name: "Test User",
      platformRole: "admin",
    } as never);
    mockedGetActiveAccountId.mockResolvedValue(123);
  });

  it("retorna suggestions array do RunNexResult", async () => {
    mockedRunNexAgent.mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: ["A", "B"],
    } as never);
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result).toEqual({ ok: true, message: "ok", suggestions: ["A", "B"] });
  });

  it("propaga isPlayground=true via options", async () => {
    mockedRunNexAgent.mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: [],
    } as never);
    await sendNexMessage([{ role: "user", content: "x" }], { isPlayground: true });
    expect(mockedRunNexAgent).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: true }),
    );
  });

  it("default isPlayground=false quando options omitido", async () => {
    mockedRunNexAgent.mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: [],
    } as never);
    await sendNexMessage([{ role: "user", content: "x" }]);
    expect(mockedRunNexAgent).toHaveBeenCalledWith(
      expect.objectContaining({ isPlayground: false }),
    );
  });

  it("erro do agent retorna { ok: false, error }", async () => {
    mockedRunNexAgent.mockResolvedValue({
      ok: false,
      error: "boom",
    } as never);
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("não autenticado retorna erro", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/autenticado/i);
  });

  it("getCurrentUser falha retorna erro", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(null as never);
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/autenticado/i);
  });

  it("NoAccessibleAccountError retorna erro específico", async () => {
    mockedGetActiveAccountId.mockRejectedValueOnce(
      new NoAccessibleAccountError("Sem acesso a nenhuma conta"),
    );
    const result = await sendNexMessage([{ role: "user", content: "x" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sem acesso|nenhuma conta/i);
  });

  it("filtra system messages antes de enviar", async () => {
    mockedRunNexAgent.mockResolvedValue({
      ok: true,
      message: "ok",
      suggestions: [],
    } as never);
    await sendNexMessage([
      { role: "system", content: "system" },
      { role: "user", content: "user msg" },
      { role: "system", content: "another system" },
    ]);
    expect(mockedRunNexAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "user msg" }],
      }),
    );
  });

  it("erro quando nenhuma mensagem após filtro", async () => {
    const result = await sendNexMessage([{ role: "system", content: "only system" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nenhuma|vazia/i);
  });

  it("outras exceções são propagadas (não capturadas)", async () => {
    mockedGetActiveAccountId.mockRejectedValueOnce(new Error("DB error"));
    await expect(sendNexMessage([{ role: "user", content: "x" }])).rejects.toThrow("DB error");
  });
});
