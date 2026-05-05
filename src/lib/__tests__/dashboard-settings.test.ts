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

  it("v0.42 canônico: ignora valores persistidos e sempre retorna defaults", async () => {
    // Em v0.42, settings de DB são deprecados. Sempre weekStartsOn=1 (segunda).
    mockQuery.mockResolvedValue({
      rowCount: 3,
      rows: [
        { key: "dashboard.week_starts_on", value: "0" },
        { key: "dashboard.week_mode", value: "rolling" },
        { key: "dashboard.month_mode", value: "rolling" },
      ],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
    expect(s.weekMode).toBe("current");
    expect(s.monthMode).toBe("current");
  });

  it("v0.42 canônico: não consulta DB (zero queries)", async () => {
    await getDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(0);
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
});
