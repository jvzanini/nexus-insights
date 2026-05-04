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

  it("period adiciona >= start e < end (default 'active' usa last_activity_at)", () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const end = new Date("2026-04-30T00:00:00Z");
    const { whereSql, params } = buildBaseFilter(
      { period: { start, end } },
      9,
    );
    expect(whereSql).toContain("c.last_activity_at >= $2");
    expect(whereSql).toContain("c.last_activity_at < $3");
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
    expect(whereSql).toContain("c.last_activity_at >= $7");
    expect(whereSql).toContain("c.last_activity_at < $8");
    expect(whereSql).toContain("t.tag_id = ANY($9)");
  });

  // ---- v0.42 canonical period semantics ----

  it("default periodColumn is 'active' — uses c.last_activity_at (sem COALESCE)", () => {
    const r = buildBaseFilter(
      { period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") } },
      123,
    );
    expect(r.whereSql).toContain("c.last_activity_at >= $");
    expect(r.whereSql).toContain("c.last_activity_at < $");
    expect(r.whereSql).not.toContain("COALESCE");
    expect(r.whereSql).not.toMatch(/c\.created_at >= \$/);
  });

  it("periodColumn 'created' uses c.created_at", () => {
    const r = buildBaseFilter(
      {
        period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
        periodColumn: "created",
      },
      123,
    );
    expect(r.whereSql).toMatch(/c\.created_at >= \$/);
    expect(r.whereSql).toMatch(/c\.created_at < \$/);
    expect(r.whereSql).not.toMatch(/c\.last_activity_at/);
  });

  it("excludeMatrixIA default true via canonical helper", () => {
    const r = buildBaseFilter({}, 123);
    expect(r.whereSql).toContain("c.inbox_id <> 31");
  });

  it("excludeMatrixIA explicit false omits clause", () => {
    const r = buildBaseFilter({ excludeMatrixIA: false }, 123);
    expect(r.whereSql).not.toContain("c.inbox_id <> 31");
  });

  it("account_id is always parametrized as $1", () => {
    const r = buildBaseFilter({}, 999);
    expect(r.whereSql).toContain("c.account_id = $1");
    expect(r.params[0]).toBe(999);
  });

  it("period 'active' params still parametrized correctly", () => {
    const r = buildBaseFilter(
      {
        period: { start: new Date("2026-05-01"), end: new Date("2026-05-04") },
        statuses: [0, 2],
      },
      1,
    );
    // params[0]=accountId, params[1]=statuses[], params[2]=start, params[3]=end
    expect(r.params).toHaveLength(4);
    expect(r.params[0]).toBe(1);
  });
});
