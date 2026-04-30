import { NEX_TOOLS } from "@/lib/llm/tools/definitions";

describe("NEX_TOOLS", () => {
  it("expõe exatamente 7 tools", () => {
    expect(NEX_TOOLS).toHaveLength(7);
  });

  it("cada tool tem name, description e parameters", () => {
    for (const tool of NEX_TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.parameters).toBe("object");
      expect(tool.parameters).not.toBeNull();
    }
  });

  it("cobre todos os nomes esperados", () => {
    const names = NEX_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "aggregate_conversations",
        "get_dashboard_summary",
        "get_top_agents",
        "query_contacts",
        "query_conversations",
        "query_messages",
        "query_users",
      ].sort(),
    );
  });

  it("não tem nomes duplicados", () => {
    const names = NEX_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
