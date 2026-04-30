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

  it("respeita valores persistidos", async () => {
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

  it("ignora weekStartsOn fora do range 0..6", async () => {
    mockQuery.mockResolvedValue({
      rowCount: 1,
      rows: [{ key: "dashboard.week_starts_on", value: "9" }],
    });
    const s = await getDashboardSettings();
    expect(s.weekStartsOn).toBe(1);
  });

  it("cache: 2ª chamada não consulta banco", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await getDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("invalidate força nova leitura", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await getDashboardSettings();
    invalidateDashboardSettings();
    await getDashboardSettings();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
