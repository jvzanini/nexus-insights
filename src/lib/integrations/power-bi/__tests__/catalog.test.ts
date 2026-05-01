import { POWER_BI_CATALOG, BLOCKED_TABLES_REGEX, validateAllowedTables, getCatalogEntry, getAllCatalogTableNames } from "../catalog";

describe("POWER_BI_CATALOG", () => {
  it("essentialColumns ⊂ allColumns em cada entry", () => {
    const all = { ...POWER_BI_CATALOG.facts, ...POWER_BI_CATALOG.dims } as Record<string, { essentialColumns: readonly string[]; allColumns: readonly string[] }>;
    for (const [name, entry] of Object.entries(all)) {
      for (const c of entry.essentialColumns) {
        expect(entry.allColumns).toContain(c);
      }
    }
  });

  it("pkColumns ⊂ allColumns em cada entry", () => {
    const all = { ...POWER_BI_CATALOG.facts, ...POWER_BI_CATALOG.dims } as Record<string, { pkColumns: readonly string[]; allColumns: readonly string[] }>;
    for (const [name, entry] of Object.entries(all)) {
      for (const c of entry.pkColumns) {
        expect(entry.allColumns).toContain(c);
      }
    }
  });

  it("nenhum nome do catálogo casa BLOCKED_TABLES_REGEX", () => {
    for (const name of getAllCatalogTableNames()) {
      expect(BLOCKED_TABLES_REGEX.test(name)).toBe(false);
    }
  });

  it("BLOCKED_TABLES_REGEX casa tabelas sensíveis", () => {
    expect(BLOCKED_TABLES_REGEX.test("users")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("audit_logs")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("llm_credentials")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("nex_settings")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("integration_profiles")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("password_reset_tokens")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("email_change_tokens")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("app_settings")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("user_account_access")).toBe(true);
    expect(BLOCKED_TABLES_REGEX.test("sessions")).toBe(true);
  });
});

describe("getCatalogEntry", () => {
  it("retorna entry de fact", () => {
    expect(getCatalogEntry("chatwoot_facts_daily_by_account")).toBeDefined();
  });
  it("retorna entry de dim", () => {
    expect(getCatalogEntry("dim_accounts")).toBeDefined();
  });
  it("retorna undefined pra tabela inexistente", () => {
    expect(getCatalogEntry("foobar")).toBeUndefined();
  });
});

describe("validateAllowedTables", () => {
  it("aceita tabelas do catálogo", () => {
    expect(() => validateAllowedTables(["chatwoot_facts_daily_by_account", "dim_accounts"])).not.toThrow();
  });
  it("rejeita tabela em BLOCKED", () => {
    expect(() => validateAllowedTables(["users"])).toThrow(/bloqueada|blocked/i);
  });
  it("rejeita tabela fora do catálogo", () => {
    expect(() => validateAllowedTables(["foobar"])).toThrow(/desconhecida|unknown/i);
  });
});
