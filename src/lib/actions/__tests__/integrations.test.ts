jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { integrationProfile: { count: jest.fn() } },
}));
jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import {
  getIntegrationsSummaryAction,
  getDimSnapshotFreshnessAction,
} from "../integrations";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pgPool } from "@/lib/pg-pool";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockCount = prisma.integrationProfile.count as unknown as jest.Mock;
const mockQuery = pgPool.query as unknown as jest.Mock;

describe("getIntegrationsSummaryAction", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockCount.mockReset();
  });

  it("rejeita não-super_admin", async () => {
    mockAuth.mockResolvedValue({
      user: { platformRole: "viewer" },
    } as never);
    const r = await getIntegrationsSummaryAction();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/super_admin/i);
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("retorna counts pra super_admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", platformRole: "super_admin" },
    } as never);
    mockCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const r = await getIntegrationsSummaryAction();
    expect(r.ok).toBe(true);
    expect(r.data?.powerBi).toEqual({ active: 5, disabled: 2, errored: 1 });
  });

  it("captura erro inesperado e devolve envelope", async () => {
    mockAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    } as never);
    mockCount.mockRejectedValueOnce(new Error("db down"));
    const r = await getIntegrationsSummaryAction();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Erro inesperado/i);
  });
});

describe("getDimSnapshotFreshnessAction", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockQuery.mockReset();
  });

  it("rejeita não-super_admin", async () => {
    mockAuth.mockResolvedValue({
      user: { platformRole: "viewer" },
    } as never);
    const r = await getDimSnapshotFreshnessAction();
    expect(r.ok).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("retorna snapshot freshness", async () => {
    mockAuth.mockResolvedValue({
      user: { platformRole: "super_admin" },
    } as never);
    const now = new Date("2026-05-01T10:00:00Z");
    mockQuery.mockResolvedValueOnce({
      rows: [
        { dim: "accounts", max_refreshed: now },
        { dim: "inboxes", max_refreshed: null },
        { dim: "agents", max_refreshed: now },
        { dim: "teams", max_refreshed: now },
      ],
    });
    const r = await getDimSnapshotFreshnessAction();
    expect(r.ok).toBe(true);
    expect(r.data?.accounts).toEqual(now);
    expect(r.data?.inboxes).toBeNull();
    expect(r.data?.agents).toEqual(now);
    expect(r.data?.teams).toEqual(now);
  });
});
