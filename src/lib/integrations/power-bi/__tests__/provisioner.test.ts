import { provisionProfile, disableProfile, reactivateProfile, deprovisionProfile } from "../provisioner";

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn(() => Promise.resolve(mockClient)),
  on: jest.fn(),
};

jest.mock("../admin-pool", () => ({
  getIntegrationAdminPool: () => mockPool,
}));

describe("provisioner", () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.connect.mockClear();
  });

  describe("provisionProfile", () => {
    it("ordem CREATE USER → CREATE VIEW → GRANT SELECT", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      await provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "Senha!Forte",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["account_id", "name"] },
        accountIdFilter: null,
        teamIdFilter: null,
      });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      const idxCreateUser = calls.findIndex((s: string) => /CREATE USER/i.test(s));
      const idxCreateView = calls.findIndex((s: string) => /CREATE VIEW/i.test(s));
      const idxGrant = calls.findIndex((s: string) => /GRANT SELECT/i.test(s));

      expect(idxCreateUser).toBeGreaterThanOrEqual(0);
      expect(idxCreateView).toBeGreaterThan(idxCreateUser);
      expect(idxGrant).toBeGreaterThan(idxCreateView);
    });

    it("ALTER USER em vez de CREATE quando 42710 (duplicate)", async () => {
      const dup: any = new Error("duplicate role");
      dup.code = "42710";
      let firstCreate = true;
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/CREATE USER/i.test(sql) && firstCreate) {
          firstCreate = false;
          throw dup;
        }
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      await provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "Senha!Forte",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["account_id", "name"] },
        accountIdFilter: null,
        teamIdFilter: null,
      });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(calls.some((s: string) => /ALTER USER/i.test(s))).toBe(true);
    });

    it("rollback Tx 3 quando CREATE VIEW falha", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^CREATE VIEW/i.test(sql)) throw new Error("syntax error in view");
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      await expect(provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "p",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["account_id"] },
        accountIdFilter: null,
        teamIdFilter: null,
      })).rejects.toThrow();

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(calls.some((s: string) => s === "ROLLBACK")).toBe(true);
    });

    it("dropa views existentes antes de criar novas (Tx 2)", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) {
          return { rows: [{ viewname: "pbi_abc_v_dim_old" }] };
        }
        return { rowCount: 0 };
      });

      await provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "p",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["account_id"] },
        accountIdFilter: null,
        teamIdFilter: null,
      });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      const idxDropOld = calls.findIndex((s: string) => /DROP VIEW.*pbi_abc_v_dim_old/i.test(s));
      const idxCreateNew = calls.findIndex((s: string) => /CREATE VIEW/i.test(s));
      expect(idxDropOld).toBeGreaterThanOrEqual(0);
      expect(idxCreateNew).toBeGreaterThan(idxDropOld);
    });

    it("força colunas PK mesmo se não estiverem em allowedColumns", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) return { rows: [] };
        return { rowCount: 0 };
      });

      // dim_accounts tem pkColumns=["account_id"] no catálogo
      await provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "p",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["name"] }, // sem account_id (PK)
        accountIdFilter: null,
        teamIdFilter: null,
      });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      const createViewCall = calls.find((s: string) => /CREATE VIEW/i.test(s)) as string;
      expect(createViewCall).toContain('"account_id"');
      expect(createViewCall).toContain('"name"');
    });

    it("rejeita coluna que não está em allColumns do catálogo", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "p",
        allowedTables: ["dim_accounts"],
        allowedColumns: { dim_accounts: ["nonexistent_col"] },
        accountIdFilter: null,
        teamIdFilter: null,
      })).rejects.toThrow(/coluna inválida/i);
    });

    it("rejeita tabela em BLOCKED via validateAllowedTables", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await expect(provisionProfile({
        id: "00000000-0000-0000-0000-000000000abc",
        pgUsername: "pbi_test_a3f8c2",
        password: "p",
        allowedTables: ["users"],
        allowedColumns: { users: ["id"] },
        accountIdFilter: null,
        teamIdFilter: null,
      })).rejects.toThrow(/bloqueada/i);
    });
  });

  describe("disableProfile", () => {
    it("REVOKE ALL + NOLOGIN + kill backends", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0 });
      await disableProfile({ pgUsername: "pbi_user" });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(calls.some((s: string) => /REVOKE ALL/i.test(s))).toBe(true);
      expect(calls.some((s: string) => /NOLOGIN/i.test(s))).toBe(true);
      expect(calls.some((s: string) => /pg_terminate_backend/i.test(s))).toBe(true);
    });
  });

  describe("reactivateProfile", () => {
    it("ALTER LOGIN + GRANT USAGE + re-GRANT views existentes", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) {
          return { rows: [{ viewname: "pbi_abc_v_dim_accounts" }] };
        }
        return { rowCount: 0 };
      });

      await reactivateProfile({ id: "00000000-0000-0000-0000-000000000abc", pgUsername: "pbi_user" });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      expect(calls.some((s: string) => /ALTER USER.*LOGIN/i.test(s))).toBe(true);
      expect(calls.some((s: string) => /GRANT USAGE/i.test(s))).toBe(true);
      expect(calls.some((s: string) => /GRANT SELECT/i.test(s))).toBe(true);
    });
  });

  describe("deprovisionProfile", () => {
    it("ordem kill → drop view → drop user", async () => {
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/^SELECT viewname/i.test(sql)) {
          return { rows: [{ viewname: "pbi_abc_v_dim_accounts" }] };
        }
        return { rowCount: 1 };
      });

      await deprovisionProfile({ id: "00000000-0000-0000-0000-000000000abc", pgUsername: "pbi_user" });

      const calls = mockClient.query.mock.calls.map((c: any) => c[0]);
      const idxKill = calls.findIndex((s: string) => /pg_terminate_backend/i.test(s));
      const idxDropView = calls.findIndex((s: string) => /DROP VIEW/i.test(s));
      const idxDropUser = calls.findIndex((s: string) => /DROP USER/i.test(s));

      expect(idxKill).toBeLessThan(idxDropView);
      expect(idxDropView).toBeLessThan(idxDropUser);
    });
  });
});
