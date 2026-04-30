jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock("@/lib/llm/exchange-rate", () => ({
  getUsdBrlRate: jest.fn(),
  setCardSpread: jest.fn(),
}));

import { auth } from "@/auth";
import {
  getCurrentRateAction,
  setCardSpreadAction,
} from "../exchange-rate";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockResolvedValue({
    user: { id: "u-1", platformRole: "super_admin" },
  } as never);
});

describe("getCurrentRateAction", () => {
  it("retorna rate atual", async () => {
    const { getUsdBrlRate } = require("@/lib/llm/exchange-rate");
    (getUsdBrlRate as jest.Mock).mockResolvedValueOnce({
      rate: 5.61,
      commercial: 5.1,
      spread: 1.1,
      source: "live",
      fetchedAt: new Date("2026-04-30T12:00:00Z"),
    });
    const r = await getCurrentRateAction();
    expect(r.ok).toBe(true);
    expect(r.data?.rate).toBeCloseTo(5.61);
  });
});

describe("setCardSpreadAction", () => {
  it("rejeita spread ≤ 0", async () => {
    const r = await setCardSpreadAction(0);
    expect(r.ok).toBe(false);
    const r2 = await setCardSpreadAction(-1);
    expect(r2.ok).toBe(false);
  });
  it("rejeita NaN", async () => {
    const r = await setCardSpreadAction(Number.NaN);
    expect(r.ok).toBe(false);
  });
  it("aceita 1.10", async () => {
    const r = await setCardSpreadAction(1.1);
    expect(r.ok).toBe(true);
  });
  it("aceita 2.50 (sem upper bound)", async () => {
    const r = await setCardSpreadAction(2.5);
    expect(r.ok).toBe(true);
  });
  it("rejeita não-super_admin", async () => {
    mockedAuth.mockResolvedValueOnce({
      user: { platformRole: "viewer" },
    } as never);
    const r = await setCardSpreadAction(1.1);
    expect(r.ok).toBe(false);
  });
});
