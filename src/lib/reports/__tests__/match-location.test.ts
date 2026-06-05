import { describe, it, expect } from "@jest/globals";
import { matchLocation } from "@/lib/reports/match-location";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 1,
  contact: {
    id: 1,
    name: "Test",
    phone_number: null,
    identifier: null,
    additional_attributes: null,
    country: null,
    estado: null,
  },
  inbox: { id: 1, name: "X" },
  team: { id: 1, name: "Y" },
  assignee: { id: 1, name: "Z" },
  status: 0,
  priority: 1,
  created_at: null,
  last_activity_at: null,
  last_message_type: null,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: null,
  waiting_seconds: null,
  open_seconds: null,
  labels: [],
};

const brMg: ConversaRow = {
  ...baseRow,
  contact: { ...baseRow.contact, country: "Brasil", estado: "MG-Minas Gerais" },
};
const brSp: ConversaRow = {
  ...baseRow,
  contact: { ...baseRow.contact, country: "Brasil", estado: "SP-São Paulo" },
};
const portugal: ConversaRow = {
  ...baseRow,
  contact: { ...baseRow.contact, country: "Portugal", estado: null },
};
const nullBoth: ConversaRow = { ...baseRow }; // country null + estado null

describe("matchLocation", () => {
  it("listas vazias retorna todas as rows inalteradas", () => {
    const rows = [brMg, brSp, portugal, nullBoth];
    const result = matchLocation(rows, [], []);
    expect(result).toBe(rows);
    expect(result).toHaveLength(4);
  });

  it("só countries=['Brasil'] mantém apenas rows com country === 'Brasil'", () => {
    expect(matchLocation([brMg, brSp, portugal, nullBoth], ["Brasil"], [])).toEqual([
      brMg,
      brSp,
    ]);
  });

  it("só estados=['MG-Minas Gerais'] mantém apenas rows com estado === 'MG-Minas Gerais'", () => {
    expect(
      matchLocation([brMg, brSp, portugal, nullBoth], [], ["MG-Minas Gerais"]),
    ).toEqual([brMg]);
  });

  it("ambos preenchidos aplica AND", () => {
    expect(
      matchLocation([brMg, brSp, portugal, nullBoth], ["Brasil"], ["MG-Minas Gerais"]),
    ).toEqual([brMg]);
  });

  it("row com estado null é excluída quando estados está ativo", () => {
    expect(matchLocation([brMg, portugal, nullBoth], [], ["MG-Minas Gerais"])).toEqual([
      brMg,
    ]);
  });

  it("row com country null é excluída quando countries está ativo", () => {
    expect(matchLocation([brMg, nullBoth], ["Brasil"], [])).toEqual([brMg]);
  });
});
