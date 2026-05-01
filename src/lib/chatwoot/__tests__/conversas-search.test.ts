import { buildConversasSearchClause } from "@/lib/chatwoot/conversas-search";

describe("buildConversasSearchClause", () => {
  it("retorna { sql: '', params: [] } quando search é undefined/null", () => {
    expect(buildConversasSearchClause(undefined, 5)).toEqual({
      sql: "",
      params: [],
    });
    expect(buildConversasSearchClause(null, 5)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("retorna { sql: '', params: [] } quando search é vazio/whitespace", () => {
    expect(buildConversasSearchClause("", 5)).toEqual({ sql: "", params: [] });
    expect(buildConversasSearchClause("   ", 5)).toEqual({
      sql: "",
      params: [],
    });
  });

  it("retorna SQL com OR de ILIKEs quando search tem conteúdo", () => {
    const r = buildConversasSearchClause("joão", 5);
    expect(r.sql).toContain("ILIKE");
    expect(r.sql).toMatch(/ct\.name\s+ILIKE/);
    expect(r.sql).toMatch(/ct\.phone_number\s+ILIKE/);
    expect(r.sql).toMatch(/ct\.identifier\s+ILIKE/);
    expect(r.sql).toMatch(/ix\.name\s+ILIKE/);
    expect(r.sql).toMatch(/tm\.name\s+ILIKE/);
    expect(r.sql).toMatch(/u\.name\s+ILIKE/);
    expect(r.sql).toMatch(/c\.display_id::text\s+ILIKE/);
    expect(r.sql).toMatch(/c\.custom_attributes::text\s+ILIKE/);
    expect(r.sql).toMatch(/EXISTS \(/); // tags subquery
    expect(r.sql).toContain("ESCAPE E'\\\\\\\\\'");
    expect(r.params).toEqual(["%joão%"]);
    // todos os ILIKEs referenciam o mesmo placeholder $6 (offset 5 + 1)
    expect(r.sql).toMatch(/\$6/);
    expect(r.sql).not.toMatch(/\$5/); // não usa o offset, só o próximo
  });

  it("respeita o offset informado", () => {
    const r = buildConversasSearchClause("x", 0);
    expect(r.sql).toMatch(/\$1/);
    const r2 = buildConversasSearchClause("x", 10);
    expect(r2.sql).toMatch(/\$11/);
  });

  it("escapa wildcards LIKE (% e _) e barra invertida", () => {
    const r = buildConversasSearchClause("100% _ok\\test", 0);
    expect(r.params[0]).toBe("%100\\% \\_ok\\\\test%");
  });

  it("trunca em 256 chars", () => {
    const long = "a".repeat(500);
    const r = buildConversasSearchClause(long, 0);
    const param = r.params[0] as string;
    expect(param.length).toBeLessThanOrEqual(258); // % + 256 + %
  });

  it("inclui CASE para status (Aberta/Resolvida/Pendente/Snoozed)", () => {
    const r = buildConversasSearchClause("aberta", 0);
    expect(r.sql).toContain("CASE c.status");
    expect(r.sql).toContain("'Aberta'");
    expect(r.sql).toContain("'Resolvida'");
    expect(r.sql).toContain("'Pendente'");
    expect(r.sql).toContain("'Snoozed'");
  });

  it("inclui CASE para prioridade (Baixa/Media/Alta/Urgente)", () => {
    const r = buildConversasSearchClause("alta", 0);
    expect(r.sql).toContain("CASE c.priority");
    expect(r.sql).toContain("'Baixa'");
    expect(r.sql).toContain("'Media'");
    expect(r.sql).toContain("'Alta'");
    expect(r.sql).toContain("'Urgente'");
  });
});
