jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock("@/lib/reports/visibility", () => ({
  isReportVisibleForUser: jest.fn(),
}));
jest.mock("@/lib/chatwoot/queries/conversas-list", () => ({
  conversasList: jest.fn(),
}));
jest.mock("@/lib/tenant", () => ({
  getAccessibleTeamIds: jest.fn().mockResolvedValue("all"),
}));

import { exportConversasAction } from "@/lib/actions/reports/conversas-export";
import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";

const mockedUser = {
  id: "u1",
  email: "x@y",
  name: "X",
  platformRole: "super_admin" as const,
  isOwner: true,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "system" as const,
  accountIds: [9],
  teamIds: [] as number[],
};

const baseFilters = {
  period: { start: new Date("2026-04-29"), end: new Date("2026-04-30") },
};

const fixtureRow = (id: number) => ({
  id,
  display_id: id,
  contact: {
    id,
    name: "X",
    phone_number: null,
    identifier: null,
    additional_attributes: null,
  },
  inbox: { id: 1, name: "WA" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0,
  priority: 0,
  created_at: null,
  last_activity_at: null,
  last_message_type: null,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: null,
  waiting_seconds: null,
  open_seconds: null,
  labels: [],
});

describe("exportConversasAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna error quando não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeDefined();
    expect(r.base64).toBeUndefined();
  });

  it("retorna error quando relatório não visível", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeDefined();
  });

  it("retorna error quando 0 rows", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null },
      stale: false,
      cached: false,
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBe("Sem conversas para exportar");
  });

  it("retorna base64 + filename quando rows > 0", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [fixtureRow(1)], nextCursor: null },
      stale: false,
      cached: false,
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeUndefined();
    expect(typeof r.base64).toBe("string");
    expect((r.base64 ?? "").length).toBeGreaterThan(0);
    expect(r.filename).toMatch(/^conversas_9_/);
    expect(r.filename).toMatch(/\.xlsx$/);
    expect(r.truncated).toBe(false);
  });

  it("flag truncated quando ultrapassa MAX_EXPORT_ROWS (nextCursor não-null)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [fixtureRow(1), fixtureRow(2)], nextCursor: "next" },
      stale: false,
      cached: false,
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.truncated).toBe(true);
  });
});
