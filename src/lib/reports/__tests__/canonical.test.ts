import {
  buildActivePeriodClause,
  buildCreatedPeriodClause,
  buildLastClassificationMsgCte,
  buildLastIncomingPublicMsgCte,
  buildLastOutgoingAnyMsgCte,
  chatwootMatrixIaClause,
  chatwootMatrixIaOnlyClause,
  STATUS_OPEN,
  STATUS_RESOLVED,
  STATUS_PENDING,
  STATUS_SNOOZED,
  MSG_INCOMING,
  MSG_OUTGOING,
  MSG_ACTIVITY,
  MSG_TEMPLATE,
} from "../canonical";

describe("canonical", () => {
  test("status constants", () => {
    expect(STATUS_OPEN).toBe(0);
    expect(STATUS_RESOLVED).toBe(1);
    expect(STATUS_PENDING).toBe(2);
    expect(STATUS_SNOOZED).toBe(3);
  });

  test("message type constants", () => {
    expect(MSG_INCOMING).toBe(0);
    expect(MSG_OUTGOING).toBe(1);
    expect(MSG_ACTIVITY).toBe(2);
    expect(MSG_TEMPLATE).toBe(3);
  });

  test("buildActivePeriodClause uses c.last_activity_at without COALESCE (perf — Apêndice A.3)", () => {
    const r = buildActivePeriodClause({ start: 5, end: 6 });
    expect(r).toContain("c.last_activity_at >= $5");
    expect(r).toContain("c.last_activity_at < $6");
    expect(r).not.toContain("COALESCE");
  });

  test("buildCreatedPeriodClause uses c.created_at", () => {
    const r = buildCreatedPeriodClause({ start: 2, end: 3 });
    expect(r).toContain("c.created_at >= $2");
    expect(r).toContain("c.created_at < $3");
  });

  test("chatwootMatrixIaClause(true) excludes inbox 31", () => {
    expect(chatwootMatrixIaClause(true)).toBe("AND c.inbox_id <> 31");
  });

  test("chatwootMatrixIaClause(false) returns empty", () => {
    expect(chatwootMatrixIaClause(false)).toBe("");
  });

  test("chatwootMatrixIaOnlyClause restricts to inbox 31", () => {
    expect(chatwootMatrixIaOnlyClause()).toBe("AND c.inbox_id = 31");
  });

  test("buildLastClassificationMsgCte: incoming público OR outgoing qualquer privacidade", () => {
    const sql = buildLastClassificationMsgCte();
    expect(sql).toMatch(/WITH\s+last_classification_msg\s+AS/);
    expect(sql).toContain("DISTINCT ON (m.conversation_id)");
    expect(sql).toContain("m.message_type IN (0, 1)");
    expect(sql).toContain("NOT (m.message_type = 0 AND m.private = TRUE)");
    expect(sql).toContain("ORDER BY m.conversation_id, m.created_at DESC");
  });

  test("buildLastIncomingPublicMsgCte: somente incoming + private FALSE", () => {
    const sql = buildLastIncomingPublicMsgCte();
    expect(sql).toMatch(/WITH\s+last_incoming_public_msg\s+AS/);
    expect(sql).toContain("m.message_type = 0");
    expect(sql).toContain("m.private = FALSE");
  });

  test("buildLastOutgoingAnyMsgCte: somente outgoing, qualquer privacidade", () => {
    const sql = buildLastOutgoingAnyMsgCte();
    expect(sql).toMatch(/WITH\s+last_outgoing_any_msg\s+AS/);
    expect(sql).toContain("m.message_type = 1");
    expect(sql).not.toContain("m.private = FALSE");
    expect(sql).not.toContain("m.private = TRUE");
  });
});
