import { getDashboardSettings, invalidateDashboardSettings } from "@/lib/dashboard-settings";

const mockQuery = jest.fn();
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

describe("getDashboardSettings", () => {
  beforeEach(() => {
    invalidateDashboardSettings();
    mockQuery.mockReset();
  });

  it("retorna defaults quando nenhuma chave existe", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
    expect(s.weekMode).toBe("current");
    expect(s.monthMode).toBe("current");
  });

  it("aplica valores persistidos do banco quando presentes", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 3,
      rows: [
        { key: "dashboard.week_starts_on", value: "0" },
        { key: "dashboard.week_mode", value: "rolling" },
        { key: "dashboard.month_mode", value: "rolling" },
      ],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(0);
    expect(s.weekMode).toBe("rolling");
    expect(s.monthMode).toBe("rolling");
  });

  it("consulta o DB a cada chamada (sem cache)", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await getDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("invalidateDashboardSettings é no-op (mantido por compat)", () => {
    expect(() => invalidateDashboardSettings()).not.toThrow();
  });

  it("query falha → retorna defaults sem jogar", async () => {
    mockQuery.mockRejectedValue(new Error("DB down"));
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
    expect(s.weekMode).toBe("current");
    expect(s.monthMode).toBe("current");
  });

  it("ignora week_starts_on inválido e mantém default", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ key: "dashboard.week_starts_on", value: "99" }],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
  });

  it("aceita week_starts_on=0 (domingo)", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ key: "dashboard.week_starts_on", value: "0" }],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(0);
  });
});
