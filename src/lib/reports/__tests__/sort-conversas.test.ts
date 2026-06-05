import { describe, it, expect } from "@jest/globals";
import { sortConversasByStack } from "@/lib/reports/sort-conversas";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 0,
  display_id: 0,
  contact: {
    id: 0,
    name: null,
    phone_number: null,
    identifier: null,
    additional_attributes: null,
    country: null,
    estado: null,
  },
  inbox: { id: 0, name: null },
  team: { id: 0, name: null },
  assignee: { id: 0, name: null },
  status: 0,
  priority: null,
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

const r1: ConversaRow = {
  ...baseRow,
  display_id: 3,
  contact: { ...baseRow.contact, name: "Ana" },
};
const r2: ConversaRow = {
  ...baseRow,
  display_id: 1,
  contact: { ...baseRow.contact, name: "Beto" },
};
const r3: ConversaRow = {
  ...baseRow,
  display_id: 2,
  contact: { ...baseRow.contact, name: "Carlos" },
};

describe("sortConversasByStack", () => {
  it("stack vazia retorna rows sem alteração (mesma referência)", () => {
    const arr = [r1, r2, r3];
    expect(sortConversasByStack(arr, [])).toBe(arr);
  });

  it("sort por display_id ascending", () => {
    const result = sortConversasByStack([r1, r2, r3], [
      { key: "display_id", direction: "asc" },
    ]);
    expect(result.map((r) => r.display_id)).toEqual([1, 2, 3]);
  });

  it("sort por display_id descending", () => {
    const result = sortConversasByStack([r1, r2, r3], [
      { key: "display_id", direction: "desc" },
    ]);
    expect(result.map((r) => r.display_id)).toEqual([3, 2, 1]);
  });

  it("sort por name asc", () => {
    const result = sortConversasByStack([r3, r1, r2], [
      { key: "name", direction: "asc" },
    ]);
    expect(result.map((r) => r.contact.name)).toEqual(["Ana", "Beto", "Carlos"]);
  });

  it("sort estável: rules empatadas mantém ordem original", () => {
    const a: ConversaRow = { ...baseRow, display_id: 1, status: 1 };
    const b: ConversaRow = { ...baseRow, display_id: 2, status: 1 };
    const c: ConversaRow = { ...baseRow, display_id: 3, status: 1 };
    // Ordena por status (todos = 1) → mantém ordem original [a, b, c].
    const result = sortConversasByStack([a, b, c], [
      { key: "status", direction: "asc" },
    ]);
    expect(result.map((r) => r.display_id)).toEqual([1, 2, 3]);
  });

  it("sort encadeado: status asc + display_id desc", () => {
    const a: ConversaRow = { ...baseRow, display_id: 5, status: 1 };
    const b: ConversaRow = { ...baseRow, display_id: 2, status: 0 };
    const c: ConversaRow = { ...baseRow, display_id: 3, status: 1 };
    const d: ConversaRow = { ...baseRow, display_id: 1, status: 0 };
    const result = sortConversasByStack([a, b, c, d], [
      { key: "status", direction: "asc" },
      { key: "display_id", direction: "desc" },
    ]);
    // status 0 antes de 1; dentro de cada bucket display_id desc.
    expect(result.map((r) => r.display_id)).toEqual([2, 1, 5, 3]);
  });

  it("sort por document detecta CPF/CNPJ", () => {
    const cpfRow: ConversaRow = {
      ...baseRow,
      display_id: 1,
      contact: { ...baseRow.contact, identifier: "07041511111" },
    };
    const cnpjRow: ConversaRow = {
      ...baseRow,
      display_id: 2,
      contact: { ...baseRow.contact, identifier: "12345678000195" },
    };
    const noneRow: ConversaRow = { ...baseRow, display_id: 3 };
    const result = sortConversasByStack([noneRow, cnpjRow, cpfRow], [
      { key: "document", direction: "asc" },
    ]);
    // CNPJ formatado começa com '12.', CPF com '070.'. CNPJ vem antes (asc).
    // null/sem-doc vai pro fim (asc).
    expect(result.map((r) => r.display_id)).toEqual([2, 1, 3]);
  });

  it("sort por waiting_seconds com nulls vai pro início (asc)", () => {
    const a: ConversaRow = { ...baseRow, display_id: 1, waiting_seconds: 100 };
    const b: ConversaRow = { ...baseRow, display_id: 2, waiting_seconds: null };
    const c: ConversaRow = { ...baseRow, display_id: 3, waiting_seconds: 50 };
    const result = sortConversasByStack([a, b, c], [
      { key: "waiting_seconds", direction: "asc" },
    ]);
    // null = mínimo no asc.
    expect(result.map((r) => r.display_id)).toEqual([2, 3, 1]);
  });

  it("sort por created_at asc", () => {
    const a: ConversaRow = {
      ...baseRow,
      display_id: 1,
      created_at: "2026-04-15T00:00:00Z",
    };
    const b: ConversaRow = {
      ...baseRow,
      display_id: 2,
      created_at: "2026-01-10T00:00:00Z",
    };
    const c: ConversaRow = {
      ...baseRow,
      display_id: 3,
      created_at: "2026-03-01T00:00:00Z",
    };
    const result = sortConversasByStack([a, b, c], [
      { key: "created_at", direction: "asc" },
    ]);
    expect(result.map((r) => r.display_id)).toEqual([2, 3, 1]);
  });

  it("rule com key inexistente é ignorada (não crasha)", () => {
    const result = sortConversasByStack([r1, r2, r3], [
      { key: "campo_que_nao_existe", direction: "asc" },
    ]);
    // Sem comparator efetivo, mantém ordem original.
    expect(result.map((r) => r.display_id)).toEqual([3, 1, 2]);
  });
});
