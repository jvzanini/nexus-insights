import { buildBaseFilter } from "@/lib/chatwoot/filters";

describe("buildBaseFilter", () => {
  it("filters vazios resultam em account_id + exclusão Matrix IA", () => {
    const { whereSql, params } = buildBaseFilter({}, 9);
    expect(whereSql).toBe("c.account_id = $1 AND c.inbox_id <> 31");
    expect(params).toEqual([9]);
  });

  it("excludeMatrixIA=false não adiciona o `inbox_id <> 31`", () => {
    const { whereSql, params } = buildBaseFilter(
      { excludeMatrixIA: false },
      9,
    );
    expect(whereSql).toBe("c.account_id = $1");
    expect(whereSql).not.toContain("31");
    expect(params).toEqual([9]);
  });

  it("inboxIds adiciona ANY clause com índice correto", () => {
    const { whereSql, params } = buildBaseFilter({ inboxIds: [1, 2] }, 9);
    expect(whereSql).toContain("c.inbox_id = ANY($2)");
    expect(params).toEqual([9, [1, 2]]);
  });

  it("teamIds adiciona ANY clause", () => {
    const { whereSql, params } = buildBaseFilter({ teamIds: [22, 26] }, 9);
    expect(whereSql).toContain("c.team_id = ANY($2)");
    expect(params).toEqual([9, [22, 26]]);
  });

  it("assigneeIds adiciona ANY clause", () => {
    const { whereSql, params } = buildBaseFilter({ assigneeIds: [10] }, 9);
    expect(whereSql).toContain("c.assignee_id = ANY($2)");
    expect(params).toEqual([9, [10]]);
  });

  it("statuses adiciona ANY clause", () => {
    const { whereSql, params } = buildBaseFilter({ statuses: [0, 1] }, 9);
    expect(whereSql).toContain("c.status = ANY($2)");
    expect(params).toEqual([9, [0, 1]]);
  });

  it("priorities adiciona ANY clause", () => {
    const { whereSql, params } = buildBaseFilter({ priorities: [2, 3] }, 9);
    expect(whereSql).toContain("c.priority = ANY($2)");
    expect(params).toEqual([9, [2, 3]]);
  });

  it("period adiciona >= start e < end", () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const end = new Date("2026-04-30T00:00:00Z");
    const { whereSql, params } = buildBaseFilter(
      { period: { start, end } },
      9,
    );
    expect(whereSql).toContain("c.created_at >= $2");
    expect(whereSql).toContain("c.created_at < $3");
    expect(params).toEqual([9, start, end]);
  });

  it("labelIds adiciona EXISTS subquery em taggings", () => {
    const { whereSql, params } = buildBaseFilter({ labelIds: [1, 2] }, 9);
    expect(whereSql).toContain("EXISTS");
    expect(whereSql).toContain("FROM taggings t");
    expect(whereSql).toContain("t.taggable_type = 'Conversation'");
    expect(whereSql).toContain("t.tag_id = ANY($2)");
    expect(params).toEqual([9, [1, 2]]);
  });

  it("listas vazias não adicionam cláusulas", () => {
    const { whereSql, params } = buildBaseFilter(
      {
        inboxIds: [],
        teamIds: [],
        assigneeIds: [],
        statuses: [],
        priorities: [],
        labelIds: [],
      },
      9,
    );
    expect(whereSql).toBe("c.account_id = $1 AND c.inbox_id <> 31");
    expect(params).toEqual([9]);
  });

  it("combinação completa mantém ordem dos params e índices crescentes", () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const end = new Date("2026-04-30T00:00:00Z");
    const { whereSql, params } = buildBaseFilter(
      {
        inboxIds: [1, 2],
        teamIds: [22],
        assigneeIds: [10],
        statuses: [0],
        priorities: [3],
        period: { start, end },
        labelIds: [7],
      },
      9,
    );
    expect(params).toEqual([
      9,
      [1, 2],
      [22],
      [10],
      [0],
      [3],
      start,
      end,
      [7],
    ]);
    expect(whereSql).toContain("c.account_id = $1");
    expect(whereSql).toContain("c.inbox_id = ANY($2)");
    expect(whereSql).toContain("c.team_id = ANY($3)");
    expect(whereSql).toContain("c.assignee_id = ANY($4)");
    expect(whereSql).toContain("c.status = ANY($5)");
    expect(whereSql).toContain("c.priority = ANY($6)");
    expect(whereSql).toContain("c.created_at >= $7");
    expect(whereSql).toContain("c.created_at < $8");
    expect(whereSql).toContain("t.tag_id = ANY($9)");
  });
});
