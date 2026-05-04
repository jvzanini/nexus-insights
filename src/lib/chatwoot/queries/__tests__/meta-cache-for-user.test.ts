import { getInboxesForUser } from "../meta-cache-for-user";

jest.mock("../meta-cache", () => ({
  getInboxes: jest.fn(),
}));
jest.mock("@/lib/reports/visibility", () => ({
  isMatrixIAVisibleForUser: jest.fn(),
}));

const { getInboxes } = jest.requireMock("../meta-cache");
const { isMatrixIAVisibleForUser } = jest.requireMock(
  "@/lib/reports/visibility",
);

const FIXTURE = {
  data: [
    { id: 9, name: "Inbox A" },
    { id: 31, name: "00-Matrix IA" },
    { id: 50, name: "Inbox C" },
  ],
};

const CONN = "11111111-2222-3333-4444-555555555555";

describe("getInboxesForUser (multi-tenant)", () => {
  beforeEach(() => {
    (getInboxes as jest.Mock).mockResolvedValue(FIXTURE);
    (isMatrixIAVisibleForUser as jest.Mock).mockReset();
  });

  it("super_admin com visibility ALL vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(true);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "super_admin" });
    expect(r.data.map((i) => i.id)).toContain(31);
    expect(isMatrixIAVisibleForUser).toHaveBeenCalledWith("super_admin");
  });

  it("manager com visibility ALL vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(true);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "manager" });
    expect(r.data.map((i) => i.id)).toContain(31);
  });

  it("manager com visibility SUPER_ADMIN_ONLY NÃO vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "manager" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
    expect(r.data.map((i) => i.id)).toEqual([9, 50]);
  });

  it("admin com visibility SUPER_ADMIN_ONLY NÃO vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "admin" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
  });

  it("viewer com visibility SUPER_ADMIN_ONLY NÃO vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "viewer" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
  });

  it("super_admin com visibility NONE NÃO vê inbox 31", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "super_admin" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
  });

  it("aceita role string direta (sem objeto user)", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, "manager");
    expect(r.data.map((i) => i.id)).not.toContain(31);
    expect(isMatrixIAVisibleForUser).toHaveBeenCalledWith("manager");
  });

  it("aceita null/undefined role e trata como não-super-admin", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, null);
    expect(r.data.map((i) => i.id)).not.toContain(31);
    expect(isMatrixIAVisibleForUser).toHaveBeenCalledWith(null);
  });

  it("preserva flag stale", async () => {
    (getInboxes as jest.Mock).mockResolvedValue({ ...FIXTURE, stale: true });
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(CONN, 9, { platformRole: "manager" });
    expect(r.stale).toBe(true);
  });

  it("repassa connectionId + accountId para getInboxes", async () => {
    (isMatrixIAVisibleForUser as jest.Mock).mockResolvedValue(true);
    await getInboxesForUser(CONN, 9, { platformRole: "manager" });
    expect(getInboxes).toHaveBeenCalledWith(CONN, 9);
  });
});
