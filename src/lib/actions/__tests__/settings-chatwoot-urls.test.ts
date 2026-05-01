/**
 * Testes para setChatwootAccountUrlAction + listChatwootAccountUrlsAction
 * (T4b plan v0.16.0).
 *
 * Cenários:
 *  1. setChatwoot rejeita não-super_admin (guarda RBAC).
 *  2. setChatwoot 400 quando URL não é HTTPS.
 *  3. setChatwoot UPSERT cria nova quando previous é null.
 *  4. setChatwoot UPSERT atualiza existente, audit logs com previous/next.
 *  5. setChatwoot URL vazia → DELETE row + audit com next:null.
 *  6. listChatwoot retorna lista ordenada.
 */

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    chatwootAccountUrl: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  setChatwootAccountUrlAction,
  listChatwootAccountUrlsAction,
} from "../settings";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;
const mockedFindUnique = prisma.chatwootAccountUrl
  .findUnique as jest.MockedFunction<
  typeof prisma.chatwootAccountUrl.findUnique
>;
const mockedFindMany = prisma.chatwootAccountUrl
  .findMany as jest.MockedFunction<typeof prisma.chatwootAccountUrl.findMany>;
const mockedUpsert = prisma.chatwootAccountUrl.upsert as jest.MockedFunction<
  typeof prisma.chatwootAccountUrl.upsert
>;
const mockedDelete = prisma.chatwootAccountUrl.delete as jest.MockedFunction<
  typeof prisma.chatwootAccountUrl.delete
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
  mockedFindUnique.mockResolvedValue(null);
  mockedFindMany.mockResolvedValue([]);
  mockedUpsert.mockResolvedValue({} as never);
  mockedDelete.mockResolvedValue({} as never);
});

describe("setChatwootAccountUrlAction — guarda RBAC", () => {
  it("rejeita viewer (não super_admin)", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-2", platformRole: "viewer" },
    } as never);
    const r = await setChatwootAccountUrlAction({
      accountId: 1,
      publicUrl: "https://chat.example.com",
    });
    expect(r.ok).toBe(false);
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("rejeita manager", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-3", platformRole: "manager" },
    } as never);
    const r = await setChatwootAccountUrlAction({
      accountId: 1,
      publicUrl: "https://chat.example.com",
    });
    expect(r.ok).toBe(false);
  });
});

describe("setChatwootAccountUrlAction — validação", () => {
  it("rejeita URL não-HTTPS", async () => {
    const r = await setChatwootAccountUrlAction({
      accountId: 1,
      publicUrl: "http://chat.example.com",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HTTPS/i);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it("rejeita URL malformada", async () => {
    const r = await setChatwootAccountUrlAction({
      accountId: 1,
      publicUrl: "isso-nao-eh-url",
    });
    expect(r.ok).toBe(false);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it("rejeita accountId inválido", async () => {
    const r = await setChatwootAccountUrlAction({
      accountId: 0,
      publicUrl: "https://chat.example.com",
    });
    expect(r.ok).toBe(false);
    expect(mockedUpsert).not.toHaveBeenCalled();
  });
});

describe("setChatwootAccountUrlAction — UPSERT criar nova", () => {
  it("cria row quando previous é null e loga audit com previous:null", async () => {
    mockedFindUnique.mockResolvedValueOnce(null);
    const r = await setChatwootAccountUrlAction({
      accountId: 5,
      publicUrl: "https://chat.example.com/",
      label: "Matriz",
    });
    expect(r.ok).toBe(true);
    expect(r.data?.accountId).toBe(5);
    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockedUpsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ accountId: 5 });
    // trailing slash deve ser removido
    expect(upsertArg.create).toMatchObject({
      accountId: 5,
      publicUrl: "https://chat.example.com",
      label: "Matriz",
      updatedById: "u-1",
    });
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.action).toBe("setting_updated");
    expect(audit.targetType).toBe("ChatwootAccountUrl");
    expect(audit.targetId).toBe("5");
    expect(audit.userId).toBe("u-1");
    expect(audit.details).toMatchObject({
      previous: null,
      next: { publicUrl: "https://chat.example.com", label: "Matriz" },
    });
  });
});

describe("setChatwootAccountUrlAction — UPSERT atualizar existente", () => {
  it("atualiza row existente e loga audit com previous + next", async () => {
    mockedFindUnique.mockResolvedValueOnce({
      accountId: 7,
      publicUrl: "https://old.example.com",
      label: "Antigo",
      updatedAt: new Date(),
      updatedById: "u-old",
    } as never);
    const r = await setChatwootAccountUrlAction({
      accountId: 7,
      publicUrl: "https://new.example.com",
      label: "Novo",
    });
    expect(r.ok).toBe(true);
    expect(mockedUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockedUpsert.mock.calls[0][0];
    expect(upsertArg.update).toMatchObject({
      publicUrl: "https://new.example.com",
      label: "Novo",
      updatedById: "u-1",
    });
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.details).toMatchObject({
      previous: { publicUrl: "https://old.example.com", label: "Antigo" },
      next: { publicUrl: "https://new.example.com", label: "Novo" },
    });
  });
});

describe("setChatwootAccountUrlAction — DELETE quando URL vazia", () => {
  it("apaga row quando publicUrl='' e havia previous", async () => {
    mockedFindUnique.mockResolvedValueOnce({
      accountId: 9,
      publicUrl: "https://existing.example.com",
      label: null,
      updatedAt: new Date(),
      updatedById: "u-old",
    } as never);
    const r = await setChatwootAccountUrlAction({
      accountId: 9,
      publicUrl: "",
    });
    expect(r.ok).toBe(true);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete.mock.calls[0][0]).toEqual({
      where: { accountId: 9 },
    });
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockedLogAudit.mock.calls[0][0];
    expect(audit.details).toMatchObject({
      previous: { publicUrl: "https://existing.example.com", label: null },
      next: null,
    });
  });

  it("não chama delete quando previous é null e URL vazia (no-op)", async () => {
    mockedFindUnique.mockResolvedValueOnce(null);
    const r = await setChatwootAccountUrlAction({
      accountId: 11,
      publicUrl: "   ",
    });
    expect(r.ok).toBe(true);
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(mockedLogAudit).not.toHaveBeenCalled();
  });
});

describe("listChatwootAccountUrlsAction", () => {
  it("rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { id: "u-2", platformRole: "viewer" },
    } as never);
    const r = await listChatwootAccountUrlsAction();
    expect(r.ok).toBe(false);
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("retorna lista ordenada por accountId asc", async () => {
    const rows = [
      { accountId: 1, publicUrl: "https://a.example.com", label: "A" },
      { accountId: 2, publicUrl: "https://b.example.com", label: null },
    ];
    mockedFindMany.mockResolvedValueOnce(rows as never);
    const r = await listChatwootAccountUrlsAction();
    expect(r.ok).toBe(true);
    expect(r.data).toEqual(rows);
    expect(mockedFindMany).toHaveBeenCalledTimes(1);
    const arg = mockedFindMany.mock.calls[0][0];
    expect(arg?.orderBy).toEqual({ accountId: "asc" });
    expect(arg?.select).toMatchObject({
      accountId: true,
      publicUrl: true,
      label: true,
    });
  });
});
