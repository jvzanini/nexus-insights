jest.mock("@/lib/tenant", () => ({
  getKnownAccounts: jest.fn(),
  getAccessibleAccountIds: jest.fn(),
  getAccessibleTeamIds: jest.fn(),
  assertAccountAccess: jest.fn(),
}));

import { buildActiveCompanyContext } from "../active-company-context";
import * as tenant from "@/lib/tenant";

const mockedGetKnownAccounts = tenant.getKnownAccounts as jest.MockedFunction<
  typeof tenant.getKnownAccounts
>;

describe("buildActiveCompanyContext", () => {
  beforeEach(() => jest.clearAllMocks());

  it("inclui nome da empresa e accountId", async () => {
    mockedGetKnownAccounts.mockResolvedValue([
      { id: 9, name: "Matrix Fitness Group" },
      { id: 2, name: "Invest Soluções" },
    ]);
    const ctx = await buildActiveCompanyContext(9);
    expect(ctx).toContain("Matrix Fitness Group");
    expect(ctx).toContain("Account ID: 9");
    expect(ctx).toContain("CONTEXTO ATIVO");
  });

  it("fallback gracioso para ID desconhecido", async () => {
    mockedGetKnownAccounts.mockResolvedValue([{ id: 9, name: "Matrix" }]);
    const ctx = await buildActiveCompanyContext(99);
    expect(ctx).toContain("Empresa #99");
    expect(ctx).toContain("Account ID: 99");
  });

  it("inclui linha de user quando user passado", async () => {
    mockedGetKnownAccounts.mockResolvedValue([{ id: 9, name: "Matrix" }]);
    const ctx = await buildActiveCompanyContext(9, {
      name: "João Vitor Zanini",
      platformRole: "super_admin",
    });
    expect(ctx).toContain("João Vitor Zanini");
    expect(ctx).toMatch(/Super Admin|super_admin/i);
  });

  it("não quebra se getKnownAccounts falhar", async () => {
    mockedGetKnownAccounts.mockRejectedValue(new Error("DB down"));
    const ctx = await buildActiveCompanyContext(9);
    expect(ctx).toContain("Empresa #9");
    expect(ctx).toContain("CONTEXTO ATIVO");
  });
});
