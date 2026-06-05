import { describe, it, expect } from "@jest/globals";
import { matchDocumentTypes } from "@/lib/reports/match-document-types";
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

const cpfRow: ConversaRow = {
  ...baseRow,
  contact: { ...baseRow.contact, identifier: "07041511111" },
};
const cnpjRow: ConversaRow = {
  ...baseRow,
  contact: { ...baseRow.contact, identifier: "12345678000195" },
};
const noneRow: ConversaRow = { ...baseRow }; // identifier null + additional_attributes null

describe("matchDocumentTypes", () => {
  it("vazio/undefined retorna todas", () => {
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], undefined)).toHaveLength(3);
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], [])).toHaveLength(3);
  });

  it("'cpf' retorna só rows com CPF", () => {
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], ["cpf"])).toEqual([cpfRow]);
  });

  it("'cnpj' retorna só rows com CNPJ", () => {
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], ["cnpj"])).toEqual([cnpjRow]);
  });

  it("'none' retorna só rows sem documento", () => {
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], ["none"])).toEqual([noneRow]);
  });

  it("['cpf', 'none'] retorna CPF OU sem doc", () => {
    expect(matchDocumentTypes([cpfRow, cnpjRow, noneRow], ["cpf", "none"])).toEqual([
      cpfRow,
      noneRow,
    ]);
  });

  it("['cpf', 'cnpj', 'none'] retorna todas (equivalente a vazio)", () => {
    expect(
      matchDocumentTypes([cpfRow, cnpjRow, noneRow], ["cpf", "cnpj", "none"]),
    ).toHaveLength(3);
  });

  it("detecta CPF via additional_attributes.cpf", () => {
    const row: ConversaRow = {
      ...baseRow,
      contact: {
        ...baseRow.contact,
        identifier: null,
        additional_attributes: { cpf: "070.415.111-11" },
      },
    };
    expect(matchDocumentTypes([row], ["cpf"])).toEqual([row]);
    expect(matchDocumentTypes([row], ["none"])).toEqual([]);
  });
});
