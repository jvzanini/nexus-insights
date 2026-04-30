jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/pg-pool", () => ({
  pgPool: {
    query: jest.fn(),
  },
}));

jest.mock("@/lib/tenant", () => ({
  getKnownAccounts: jest.fn(),
}));

import { auth } from "@/auth";
import { pgPool } from "@/lib/pg-pool";
import { getKnownAccounts } from "@/lib/tenant";
import { globalSearch } from "@/lib/actions/global-search";

const mockedAuth = auth as unknown as jest.Mock;
const mockedPgQuery = (pgPool.query as unknown) as jest.Mock;
const mockedGetKnownAccounts = getKnownAccounts as unknown as jest.Mock;

const ACCOUNTS = [
  { id: 9, name: "Matrix Fitness Group" },
  { id: 2, name: "Invest Soluções" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetKnownAccounts.mockResolvedValue(ACCOUNTS);
  mockedPgQuery.mockResolvedValue({ rows: [] });
});

describe("globalSearch", () => {
  it("retorna empty quando não há sessão", async () => {
    mockedAuth.mockResolvedValue(null);
    const r = await globalSearch("invest");
    expect(r.total).toBe(0);
    expect(r.empresas).toEqual([]);
    expect(r.usuarios).toEqual([]);
    expect(r.paginas).toEqual([]);
  });

  it("retorna empty quando query tem menos de 2 caracteres", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    });
    const r1 = await globalSearch("");
    const r2 = await globalSearch("a");
    const r3 = await globalSearch(" b ");
    expect(r1.total).toBe(0);
    expect(r2.total).toBe(0);
    expect(r3.total).toBe(0);
    expect(mockedGetKnownAccounts).not.toHaveBeenCalled();
    expect(mockedPgQuery).not.toHaveBeenCalled();
  });

  it("filtra empresas por nome (case-insensitive)", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "viewer" },
    });
    const r = await globalSearch("invest");
    expect(r.empresas).toHaveLength(1);
    expect(r.empresas[0]).toMatchObject({
      type: "company",
      title: "Invest Soluções",
      href: "/dashboard?account=2",
      iconKey: "Building2",
    });
  });

  it("não busca usuários para roles abaixo de admin", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "manager" },
    });
    const r = await globalSearch("joao");
    expect(r.usuarios).toEqual([]);
    expect(mockedPgQuery).not.toHaveBeenCalled();
  });

  it("busca usuários para super_admin com badge de role", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    });
    mockedPgQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "u1",
          name: "João Zanini",
          email: "joao@nexus.ai",
          platform_role: "super_admin",
        },
      ],
    });
    const r = await globalSearch("joao");
    expect(mockedPgQuery).toHaveBeenCalledTimes(1);
    expect(r.usuarios).toHaveLength(1);
    expect(r.usuarios[0]).toMatchObject({
      type: "user",
      title: "João Zanini",
      subtitle: "joao@nexus.ai",
      badge: "Super Admin",
      href: "/usuarios?highlight=u1",
      iconKey: "User",
    });
  });

  it("filtra páginas por título e oculta páginas restritas para roles inferiores", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "viewer" },
    });
    const r = await globalSearch("config");
    // /configuracoes é superAdminOnly → não aparece para viewer
    expect(r.paginas.find((p) => p.href === "/configuracoes")).toBeUndefined();
  });

  it("super_admin vê páginas restritas", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    });
    const r = await globalSearch("config");
    expect(
      r.paginas.find((p) => p.href === "/configuracoes"),
    ).toBeDefined();
  });

  it("total é a soma das três seções", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    });
    mockedPgQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "u1",
          name: "Joana",
          email: "joana@nexus.ai",
          platform_role: "admin",
        },
      ],
    });
    const r = await globalSearch("invest");
    // empresa "Invest Soluções" + usuário "Joana" (não bate com 'invest' mas mock retorna)
    // + páginas que casam com "invest" → 0 páginas
    expect(r.total).toBe(r.empresas.length + r.usuarios.length + r.paginas.length);
    expect(r.empresas.length).toBe(1);
    expect(r.usuarios.length).toBe(1);
  });

  it("retorna empty quando trim resulta em <2 chars", async () => {
    mockedAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    });
    const r = await globalSearch("   ");
    expect(r.total).toBe(0);
  });
});
