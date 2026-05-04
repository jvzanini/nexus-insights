jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/chatwoot/queries/conversas-list", () => ({
  conversasList: jest.fn(),
}));
jest.mock("@/lib/tenant", () => ({
  getAccessibleTeamIds: jest.fn().mockResolvedValue("all"),
}));
jest.mock("@/lib/reports/active-connection", () => ({
  getActiveConnectionId: jest
    .fn()
    .mockResolvedValue("11111111-2222-3333-4444-555555555555"),
}));

import { fetchConversas } from "@/lib/actions/reports/conversas";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { getCurrentUser } from "@/lib/auth";

const baseUser = {
  id: "u1",
  email: "x@y",
  name: "X",
  platformRole: "super_admin" as const,
  isOwner: true,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "system" as const,
  accountIds: [9],
  teamIds: [],
};
const baseFilters: any = { period: { start: new Date(), end: new Date() } };

describe("fetchConversas v0.19", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(baseUser);
  });

  it("retorna total/page/pageSize/totalPages calculado", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 1234, page: 2, pageSize: 1000 },
      stale: false,
      cached: false,
    });
    const r = await fetchConversas({
      filters: baseFilters,
      page: 2,
      pageSize: 1000,
      accountId: 9,
    });
    expect(r.total).toBe(1234);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(1000);
    expect(r.totalPages).toBe(2);
  });

  it("totalPages = 0 quando total = 0", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false,
      cached: false,
    });
    const r = await fetchConversas({ filters: baseFilters, accountId: 9 });
    expect(r.totalPages).toBe(0);
  });

  it("default page=1, pageSize=1000 passados pra conversasList", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false,
      cached: false,
    });
    await fetchConversas({ filters: baseFilters, accountId: 9 });
    const call = (conversasList as jest.Mock).mock.calls[0][0];
    expect(call.page).toBe(1);
    expect(call.pageSize).toBe(1000);
  });

  it("propaga connectionId resolvido para conversasList", async () => {
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, page: 1, pageSize: 1000 },
      stale: false,
      cached: false,
    });
    await fetchConversas({ filters: baseFilters, accountId: 9 });
    const call = (conversasList as jest.Mock).mock.calls[0][0];
    expect(call.connectionId).toBe("11111111-2222-3333-4444-555555555555");
  });
});
