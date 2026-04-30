jest.mock("@/lib/pg-pool", () => ({ pgPool: { query: jest.fn() } }));

import { pgPool } from "@/lib/pg-pool";
import {
  resolveVisibility,
  getReportVisibility,
  getMatrixIAVisibility,
  getVisibleReportKeys,
  isReportVisibleForUser,
  isMatrixIAVisibleForUser,
  invalidateVisibilityCache,
  type Visibility,
} from "@/lib/reports/visibility";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  mockedQuery.mockReset();
  invalidateVisibilityCache();
});

describe("resolveVisibility (puro)", () => {
  it("none → false sempre", () => {
    expect(resolveVisibility("none", "super_admin")).toBe(false);
    expect(resolveVisibility("none", "viewer")).toBe(false);
    expect(resolveVisibility("none", null)).toBe(false);
  });

  it("super_admin_only → true só pra super_admin", () => {
    expect(resolveVisibility("super_admin_only", "super_admin")).toBe(true);
    expect(resolveVisibility("super_admin_only", "manager")).toBe(false);
    expect(resolveVisibility("super_admin_only", "viewer")).toBe(false);
    expect(resolveVisibility("super_admin_only", null)).toBe(false);
  });

  it("all → true para qualquer role definida", () => {
    expect(resolveVisibility("all", "viewer")).toBe(true);
    expect(resolveVisibility("all", "manager")).toBe(true);
    expect(resolveVisibility("all", "super_admin")).toBe(true);
  });

  it("undefined cai em fallback all (default)", () => {
    expect(resolveVisibility(undefined, "viewer")).toBe(true);
  });

  it("usa fallback custom quando informado", () => {
    expect(resolveVisibility(undefined, "viewer", "none")).toBe(false);
  });
});

describe("getReportVisibility (com DB)", () => {
  it("lê chave nova quando existe", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "super_admin_only" }],
    } as never);
    const v = await getReportVisibility("conversas");
    expect(v).toBe("super_admin_only");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][1]).toEqual([
      "reports.visibility.conversas",
    ]);
  });

  it("backward-compat: lê platform.enabled_reports e infere all/none", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never); // chave nova ausente
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: ["visao-geral", "performance"] }],
    } as never);
    expect(await getReportVisibility("visao-geral")).toBe("all");
    invalidateVisibilityCache();
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: ["performance"] }],
    } as never);
    expect(await getReportVisibility("conversas")).toBe("none");
  });

  it("default all quando nada existe", async () => {
    mockedQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);
    expect(await getReportVisibility("conversas")).toBe("all");
  });
});

describe("getMatrixIAVisibility (com DB)", () => {
  it("lê chave nova quando existe", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: "none" }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("none");
  });

  it("backward-compat: legacy include=false → none", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: false }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("none");
  });

  it("backward-compat: legacy super_admin_only=true → super_admin_only", async () => {
    mockedQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);
    mockedQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: true }],
    } as never);
    expect(await getMatrixIAVisibility()).toBe("super_admin_only");
  });

  it("default all quando nada existe", async () => {
    mockedQuery.mockResolvedValue({ rowCount: 0, rows: [] } as never);
    expect(await getMatrixIAVisibility()).toBe("super_admin_only"); // default histórico
  });
});

describe("getVisibleReportKeys", () => {
  it("retorna apenas keys com visibility resolvida true para o role", async () => {
    // Mocka 7 chaves. Padrão: visao-geral=all, conversas=super_admin_only, equipe=none.
    mockedQuery.mockImplementation(((sql: string, params: unknown[]) => {
      const key = (params as string[])[0];
      const map: Record<string, string | null> = {
        "reports.visibility.visao-geral": "all",
        "reports.visibility.performance": "all",
        "reports.visibility.equipe": "none",
        "reports.visibility.distribuicao": "all",
        "reports.visibility.origem-ia": "all",
        "reports.visibility.conversas": "super_admin_only",
        "reports.visibility.mensagens-nao-respondidas": "all",
      };
      const v = map[key as string] ?? null;
      return Promise.resolve(
        v
          ? ({ rowCount: 1, rows: [{ value: v }] } as never)
          : ({ rowCount: 0, rows: [] } as never),
      );
    }) as never);

    const visibleViewer = await getVisibleReportKeys("viewer");
    expect(visibleViewer).toEqual(
      new Set([
        "visao-geral",
        "performance",
        "distribuicao",
        "origem-ia",
        "mensagens-nao-respondidas",
      ]),
    );

    invalidateVisibilityCache();
    mockedQuery.mockClear();
    const visibleSuperAdmin = await getVisibleReportKeys("super_admin");
    expect(visibleSuperAdmin).toEqual(
      new Set([
        "visao-geral",
        "performance",
        "distribuicao",
        "origem-ia",
        "conversas",
        "mensagens-nao-respondidas",
      ]),
    );
  });
});

describe("isReportVisibleForUser e isMatrixIAVisibleForUser", () => {
  it("isReportVisibleForUser usa getReportVisibility + role", async () => {
    mockedQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ value: "super_admin_only" }],
    } as never);
    expect(await isReportVisibleForUser("conversas", "viewer")).toBe(false);
    expect(await isReportVisibleForUser("conversas", "super_admin")).toBe(true);
  });
});
