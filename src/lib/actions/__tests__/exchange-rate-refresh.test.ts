jest.mock("@/lib/llm/exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
  __resetUsdBrlCache: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

import { getCurrentUsdBrlRateAction } from "../exchange-rate-refresh";
import { getUsdBrlRate, __resetUsdBrlCache } from "@/lib/llm/exchange-rate";
import { getCurrentUser } from "@/lib/auth";

const mockedGetCurrentUser = getCurrentUser as unknown as jest.Mock;
const mockedGetUsdBrlRate = getUsdBrlRate as unknown as jest.Mock;
const mockedResetUsdBrlCache = __resetUsdBrlCache as unknown as jest.Mock;

describe("getCurrentUsdBrlRateAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("super_admin: invalida memo e retorna rate atual", async () => {
    mockedGetCurrentUser.mockResolvedValue({ platformRole: "super_admin" });
    mockedGetUsdBrlRate.mockResolvedValue({
      rate: 6.05,
      commercial: 5.5,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date("2026-05-03T14:00:00Z"),
    });

    const result = await getCurrentUsdBrlRateAction();

    expect(mockedResetUsdBrlCache).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rate).toBe(6.05);
      expect(result.data.source).toBe("live");
    }
  });

  it("não-superadmin: nega acesso", async () => {
    mockedGetCurrentUser.mockResolvedValue({ platformRole: "viewer" });
    const result = await getCurrentUsdBrlRateAction();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/permissão/i);
    }
  });

  it("não autenticado: nega", async () => {
    mockedGetCurrentUser.mockResolvedValue(null);
    const result = await getCurrentUsdBrlRateAction();
    expect(result.ok).toBe(false);
  });
});
