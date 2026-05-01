import { generateMSnippet, generateMSnippetsForProfile } from "../m-snippet-generator";

describe("generateMSnippet", () => {
  it("inclui host:porta no formato correto", () => {
    const s = generateMSnippet({
      host: "db.insights.nexusai360.com",
      port: 5432,
      database: "nexus_insights",
      viewName: "pbi_abc12345_v_dim_accounts",
    });
    expect(s).toContain('"db.insights.nexusai360.com:5432"');
  });

  it("inclui database name", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "nexus_insights",
      viewName: "v",
    });
    expect(s).toContain('"nexus_insights"');
  });

  it("inclui FROM powerbi.<viewName>", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "d",
      viewName: "pbi_abc12345_v_dim_accounts",
    });
    expect(s).toContain("powerbi.pbi_abc12345_v_dim_accounts");
  });

  it("usa PostgreSQL.Database como source", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "d", viewName: "v",
    });
    expect(s).toContain("PostgreSQL.Database");
  });

  it("não inclui senha inline (defesa)", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "d", viewName: "v",
    });
    expect(s).not.toMatch(/PASSWORD|password|senha/i);
  });

  it("escapa quotes no view name (defensivo)", () => {
    const s = generateMSnippet({
      host: "h", port: 5432, database: "d",
      viewName: 'pbi_"abc"',
    });
    expect(s).toContain('pbi_""abc""');
  });

  it("escapa quotes no host (defensivo)", () => {
    const s = generateMSnippet({
      host: 'h"x', port: 5432, database: "d", viewName: "v",
    });
    expect(s).toContain('h""x');
  });
});

describe("generateMSnippetsForProfile", () => {
  it("retorna 1 snippet por view", () => {
    const result = generateMSnippetsForProfile({
      host: "h", port: 5432, database: "d",
      views: ["pbi_abc_v_dim_accounts", "pbi_abc_v_dim_inboxes"],
    });
    expect(result).toHaveLength(2);
    expect(result[0].viewName).toBe("pbi_abc_v_dim_accounts");
    expect(result[1].viewName).toBe("pbi_abc_v_dim_inboxes");
  });

  it("cada snippet usa o respectivo viewName", () => {
    const result = generateMSnippetsForProfile({
      host: "h", port: 5432, database: "d",
      views: ["pbi_abc_v_dim_accounts", "pbi_abc_v_dim_teams"],
    });
    expect(result[0].snippet).toContain("powerbi.pbi_abc_v_dim_accounts");
    expect(result[1].snippet).toContain("powerbi.pbi_abc_v_dim_teams");
  });

  it("array vazio retorna array vazio", () => {
    const result = generateMSnippetsForProfile({
      host: "h", port: 5432, database: "d", views: [],
    });
    expect(result).toEqual([]);
  });
});
