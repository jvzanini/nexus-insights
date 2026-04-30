import { getInboxesForUser } from "../meta-cache-for-user";

jest.mock("../meta-cache", () => ({
  getInboxes: jest.fn(),
}));
jest.mock("@/lib/reports/matrix-ia-setting", () => ({
  getMatrixIAIncluded: jest.fn(),
}));

const { getInboxes } = jest.requireMock("../meta-cache");
const { getMatrixIAIncluded } = jest.requireMock(
  "@/lib/reports/matrix-ia-setting",
);

const FIXTURE = {
  data: [
    { id: 9, name: "Inbox A" },
    { id: 31, name: "00-Matrix IA" },
    { id: 50, name: "Inbox C" },
  ],
};

describe("getInboxesForUser", () => {
  beforeEach(() => {
    (getInboxes as jest.Mock).mockResolvedValue(FIXTURE);
    (getMatrixIAIncluded as jest.Mock).mockReset();
  });

  it("super_admin sempre vê inbox 31 mesmo com flag OFF", async () => {
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(9, { platformRole: "super_admin" });
    expect(r.data.map((i) => i.id)).toContain(31);
    expect(getMatrixIAIncluded).not.toHaveBeenCalled();
  });

  it("manager + flag ON vê inbox 31", async () => {
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(true);
    const r = await getInboxesForUser(9, { platformRole: "manager" });
    expect(r.data.map((i) => i.id)).toContain(31);
  });

  it("manager + flag OFF NÃO vê inbox 31", async () => {
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(9, { platformRole: "manager" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
    expect(r.data.map((i) => i.id)).toEqual([9, 50]);
  });

  it("admin + flag OFF NÃO vê inbox 31", async () => {
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(9, { platformRole: "admin" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
  });

  it("viewer + flag OFF NÃO vê inbox 31", async () => {
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(9, { platformRole: "viewer" });
    expect(r.data.map((i) => i.id)).not.toContain(31);
  });

  it("preserva flag stale", async () => {
    (getInboxes as jest.Mock).mockResolvedValue({ ...FIXTURE, stale: true });
    (getMatrixIAIncluded as jest.Mock).mockResolvedValue(false);
    const r = await getInboxesForUser(9, { platformRole: "manager" });
    expect(r.stale).toBe(true);
  });
});
