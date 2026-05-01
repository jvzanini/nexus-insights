import {
  POWERBI_SCHEMA,
  buildDerivedViewName,
  buildCreateUserSql,
  buildAlterUserPasswordSql,
  buildAlterUserNoLoginSql,
  buildAlterUserLoginSql,
  buildDropUserSql,
  buildRevokeAllSql,
  buildGrantUsageSql,
  buildGrantSelectSql,
  buildSelectDerivedViewsSql,
  buildDropDerivedViewSql,
  buildKillBackendsSql,
  buildRlsPredicate,
  buildCreateDerivedViewSql,
} from "../sql-builders";

describe("constants", () => {
  it("POWERBI_SCHEMA = 'powerbi'", () => {
    expect(POWERBI_SCHEMA).toBe("powerbi");
  });
});

describe("buildDerivedViewName", () => {
  it("retorna formato pbi_<8hex>_v_<table>", () => {
    const name = buildDerivedViewName("00000000-0000-0000-0000-000000000abc", "chatwoot_facts_daily_by_account");
    expect(name).toMatch(/^pbi_[a-f0-9]{8}_v_chatwoot_facts_daily_by_account$/);
  });

  it("hash determinístico (mesmo profileId → mesmo hash)", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(buildDerivedViewName(id, "dim_accounts")).toBe(buildDerivedViewName(id, "dim_accounts"));
  });

  it("hashes diferentes pra profileIds diferentes", () => {
    const a = buildDerivedViewName("11111111-1111-1111-1111-111111111111", "dim_accounts");
    const b = buildDerivedViewName("22222222-2222-2222-2222-222222222222", "dim_accounts");
    expect(a).not.toBe(b);
  });
});

describe("user sqls", () => {
  it("buildCreateUserSql escapa identifier + literal", () => {
    const sql = buildCreateUserSql("pbi_test_a3f8c2", "Senha!Forte");
    expect(sql).toContain('"pbi_test_a3f8c2"');
    expect(sql).toContain("'Senha!Forte'");
    expect(sql).toContain("CONNECTION LIMIT 5");
    expect(sql).toContain("LOGIN");
  });

  it("escapa apóstrofes na senha", () => {
    const sql = buildCreateUserSql("pbi_x_111111", "a'b");
    expect(sql).toContain("'a''b'");
  });

  it("buildAlterUserPasswordSql idêntico a CREATE mas com ALTER", () => {
    const sql = buildAlterUserPasswordSql("u", "p");
    expect(sql).toMatch(/^ALTER USER/);
    expect(sql).toContain("CONNECTION LIMIT 5");
  });

  it("buildAlterUserNoLoginSql", () => {
    expect(buildAlterUserNoLoginSql("u")).toContain("NOLOGIN");
  });

  it("buildAlterUserLoginSql", () => {
    expect(buildAlterUserLoginSql("u")).toContain("LOGIN");
    expect(buildAlterUserLoginSql("u")).toContain("CONNECTION LIMIT 5");
  });

  it("buildDropUserSql usa IF EXISTS", () => {
    expect(buildDropUserSql("u")).toContain("IF EXISTS");
  });
});

describe("permission sqls", () => {
  it("buildRevokeAllSql", () => {
    const sql = buildRevokeAllSql("pbi_user");
    expect(sql).toContain("REVOKE ALL");
    expect(sql).toContain("\"powerbi\"");
    expect(sql).toContain("\"pbi_user\"");
  });

  it("buildGrantUsageSql", () => {
    const sql = buildGrantUsageSql("pbi_user");
    expect(sql).toContain("GRANT USAGE");
    expect(sql).toContain("\"powerbi\"");
  });

  it("buildGrantSelectSql escapa todos identifiers", () => {
    const sql = buildGrantSelectSql("pbi_user", "pbi_abc_v_dim_accounts");
    expect(sql).toContain("\"powerbi\"");
    expect(sql).toContain("\"pbi_abc_v_dim_accounts\"");
    expect(sql).toContain("\"pbi_user\"");
    expect(sql).toMatch(/GRANT SELECT/);
  });
});

describe("view discovery + drop", () => {
  it("buildSelectDerivedViewsSql usa LIKE com hash do profileId", () => {
    const sql = buildSelectDerivedViewsSql("00000000-0000-0000-0000-000000000abc");
    expect(sql).toContain("pg_views");
    expect(sql).toContain("'powerbi'");
    expect(sql).toContain("LIKE");
    expect(sql).toMatch(/'pbi_[a-f0-9]{8}_v_%'/);
  });

  it("buildDropDerivedViewSql escapa view name + CASCADE", () => {
    const sql = buildDropDerivedViewSql("pbi_abc_v_dim_accounts");
    expect(sql).toContain("DROP VIEW IF EXISTS");
    expect(sql).toContain("\"powerbi\"");
    expect(sql).toContain("\"pbi_abc_v_dim_accounts\"");
    expect(sql).toContain("CASCADE");
  });
});

describe("buildKillBackendsSql", () => {
  it("usa pg_terminate_backend + literal escapado", () => {
    const sql = buildKillBackendsSql("pbi_test");
    expect(sql).toContain("pg_terminate_backend");
    expect(sql).toContain("'pbi_test'");
    expect(sql).toContain("usename");
  });
});

describe("buildRlsPredicate", () => {
  it("retorna string vazia quando nenhum filtro aplica", () => {
    expect(buildRlsPredicate({ hasAccountId: false, hasTeamId: false, accountIdFilter: null, teamIdFilter: null })).toBe("");
  });

  it("retorna string vazia quando hasAccountId=true mas accountIdFilter=null", () => {
    expect(buildRlsPredicate({ hasAccountId: true, hasTeamId: false, accountIdFilter: null, teamIdFilter: null })).toBe("");
  });

  it("retorna account_id IN (...) quando hasAccountId + filter set", () => {
    const pred = buildRlsPredicate({ hasAccountId: true, hasTeamId: false, accountIdFilter: [1, 2, 3], teamIdFilter: null });
    expect(pred).toContain("\"account_id\" IN (1, 2, 3)");
  });

  it("combina account + team com AND", () => {
    const pred = buildRlsPredicate({ hasAccountId: true, hasTeamId: true, accountIdFilter: [1, 2], teamIdFilter: [10, 20] });
    expect(pred).toContain("\"account_id\" IN (1, 2)");
    expect(pred).toContain("AND");
    expect(pred).toContain("\"team_id\" IN (10, 20)");
  });

  it("ignora team se hasTeamId=false mesmo com filter set", () => {
    const pred = buildRlsPredicate({ hasAccountId: false, hasTeamId: false, accountIdFilter: [1], teamIdFilter: [10] });
    expect(pred).toBe("");
  });

  it("filtra valores não-numéricos pra defesa", () => {
    const pred = buildRlsPredicate({ hasAccountId: true, hasTeamId: false, accountIdFilter: [1, NaN as any, 2], teamIdFilter: null });
    expect(pred).toContain("\"account_id\" IN (1, 2)");
  });
});

describe("buildCreateDerivedViewSql", () => {
  it("sem RLS: SQL sem WHERE", () => {
    const sql = buildCreateDerivedViewSql({
      profileId: "00000000-0000-0000-0000-000000000abc",
      table: "dim_accounts",
      columns: ["account_id", "name"],
      hasAccountId: true,
      hasTeamId: false,
      accountIdFilter: null,
      teamIdFilter: null,
    });
    expect(sql).toContain("CREATE VIEW \"powerbi\"");
    expect(sql).toContain("\"account_id\", \"name\"");
    expect(sql).toContain("FROM \"powerbi\".\"dim_accounts\"");
    expect(sql).not.toMatch(/\bWHERE\b/);
  });

  it("com RLS account+team: SQL com WHERE composto", () => {
    const sql = buildCreateDerivedViewSql({
      profileId: "00000000-0000-0000-0000-000000000abc",
      table: "chatwoot_facts_daily_by_team",
      columns: ["account_id", "team_id", "received"],
      hasAccountId: true,
      hasTeamId: true,
      accountIdFilter: [1, 2],
      teamIdFilter: [10],
    });
    expect(sql).toContain("WHERE");
    expect(sql).toContain("\"account_id\" IN (1, 2)");
    expect(sql).toContain("\"team_id\" IN (10)");
  });
});
