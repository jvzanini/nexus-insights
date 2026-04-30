jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/reports/visibility", () => ({
  getMatrixIAVisibility: jest.fn(),
}));

import { auth } from "@/auth";
import { getMatrixIAVisibility } from "@/lib/reports/visibility";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedGetVisibility = getMatrixIAVisibility as jest.MockedFunction<
  typeof getMatrixIAVisibility
>;

beforeEach(() => {
  mockedAuth.mockReset();
  mockedGetVisibility.mockReset();
});

function mockSession(role: string | undefined) {
  mockedAuth.mockResolvedValueOnce(
    (role ? { user: { platformRole: role } } : null) as never,
  );
}

describe("shouldExcludeMatrixIA", () => {
  it("super_admin + visibility 'none' → exclui (true)", async () => {
    mockSession("super_admin");
    mockedGetVisibility.mockResolvedValueOnce("none");
    expect(await shouldExcludeMatrixIA()).toBe(true);
  });

  it("super_admin + visibility 'all' → inclui (false)", async () => {
    mockSession("super_admin");
    mockedGetVisibility.mockResolvedValueOnce("all");
    expect(await shouldExcludeMatrixIA()).toBe(false);
  });

  it("super_admin + visibility 'super_admin_only' → inclui (false)", async () => {
    mockSession("super_admin");
    mockedGetVisibility.mockResolvedValueOnce("super_admin_only");
    expect(await shouldExcludeMatrixIA()).toBe(false);
  });

  it("viewer + visibility 'all' → inclui (false)", async () => {
    mockSession("viewer");
    mockedGetVisibility.mockResolvedValueOnce("all");
    expect(await shouldExcludeMatrixIA()).toBe(false);
  });

  it("viewer + visibility 'super_admin_only' → exclui (true)", async () => {
    mockSession("viewer");
    mockedGetVisibility.mockResolvedValueOnce("super_admin_only");
    expect(await shouldExcludeMatrixIA()).toBe(true);
  });

  it("viewer + visibility 'none' → exclui (true)", async () => {
    mockSession("viewer");
    mockedGetVisibility.mockResolvedValueOnce("none");
    expect(await shouldExcludeMatrixIA()).toBe(true);
  });

  it("manager + visibility 'super_admin_only' → exclui (true)", async () => {
    mockSession("manager");
    mockedGetVisibility.mockResolvedValueOnce("super_admin_only");
    expect(await shouldExcludeMatrixIA()).toBe(true);
  });

  it("sem sessão → exclui por segurança (true)", async () => {
    mockSession(undefined);
    expect(await shouldExcludeMatrixIA()).toBe(true);
  });
});
