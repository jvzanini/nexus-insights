import { describe, it, expect } from "@jest/globals";
import {
  matchSearchClient,
  buildHaystack,
  normalize,
} from "@/lib/reports/match-search-client";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 12345,
  contact: {
    id: 1,
    name: "João Silva",
    phone_number: "+5511987654321",
    identifier: "07041511111",
    additional_attributes: null,
    country: null,
    estado: null,
  },
  inbox: { id: 1, name: "AP-Amapá" },
  team: { id: 1, name: "Comercial" },
  assignee: { id: 1, name: "Allyda Costa" },
  status: 0,
  priority: 1,
  created_at: "2026-04-30T10:00:00Z",
  last_activity_at: "2026-04-30T11:00:00Z",
  last_message_type: 0,
  last_message_at: "2026-04-30T11:00:00Z",
  last_incoming_at: "2026-04-30T11:00:00Z",
  last_outgoing_at: null,
  custom_attributes: { plano: "Gold", obs: "Cliente VIP" },
  waiting_seconds: 3600,
  open_seconds: null,
  labels: [
    { name: "hg", color: "#fff" },
    { name: "vip", color: "#000" },
  ],
};

describe("normalize", () => {
  it("lowercase + remove acentos", () => {
    expect(normalize("João")).toBe("joao");
    expect(normalize("AÇÃO")).toBe("acao");
  });
});

describe("buildHaystack", () => {
  it("inclui todos os 11 campos normalizados", () => {
    const h = buildHaystack(baseRow);
    expect(h).toContain("12345");
    expect(h).toContain("#12345");
    expect(h).toContain("joao silva");
    expect(h).toContain("ap-amapa");
    expect(h).toContain("comercial");
    expect(h).toContain("allyda costa");
    expect(h).toContain("aberta");
    expect(h).toContain("media");
    expect(h).toContain("vip");
    expect(h).toContain("plano");
    expect(h).toContain("gold");
  });
});

describe("matchSearchClient", () => {
  it("vazio/whitespace/undefined retorna todas", () => {
    expect(matchSearchClient([baseRow], "")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "   ")).toHaveLength(1);
    expect(matchSearchClient([baseRow], undefined)).toHaveLength(1);
    expect(matchSearchClient([baseRow], null)).toHaveLength(1);
  });
  it("display_id sem #", () =>
    expect(matchSearchClient([baseRow], "12345")).toHaveLength(1));
  it("display_id com #", () =>
    expect(matchSearchClient([baseRow], "#12345")).toHaveLength(1));
  it("nome com/sem acento + case", () => {
    expect(matchSearchClient([baseRow], "joao")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "João")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "SILVA")).toHaveLength(1);
  });
  it("digits raw bate (haystack tem raw via phoneVariants)", () => {
    expect(matchSearchClient([baseRow], "5511987654321")).toHaveLength(1);
  });
  it("substring contígua do formatPhone bate", () => {
    expect(matchSearchClient([baseRow], "987654321")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "98765-4321")).toHaveLength(1);
  });
  it("phone com máscara divergente (parens entre) NÃO bate (v0.27 respeita ordem)", () => {
    // Comportamento intencional: match agora é substring contígua estrita.
    // "11 98765-4321" não bate "+55 (11) 98765-4321" porque há "(", ")" entre.
    expect(matchSearchClient([baseRow], "11 98765-4321")).toHaveLength(0);
  });
  it("CPF formatted bate", () => {
    expect(matchSearchClient([baseRow], "070.415.111-11")).toHaveLength(1);
  });
  it("CPF raw bate", () => {
    expect(matchSearchClient([baseRow], "07041511111")).toHaveLength(1);
  });
  it("'3380' NÃO bate em row com display_id 3803 (caracteres iguais, ordem diferente — bug v0.25)", () => {
    const r = {
      ...baseRow,
      display_id: 3803,
      contact: { ...baseRow.contact, phone_number: null, identifier: null },
      custom_attributes: null,
      labels: [],
    };
    expect(matchSearchClient([r], "3380")).toHaveLength(0);
  });
  it("'3380' BATE em row com phone '+5511338021234' (substring contígua intencional)", () => {
    const r = {
      ...baseRow,
      display_id: 999,
      contact: {
        ...baseRow.contact,
        phone_number: "+5511338021234",
        identifier: null,
        name: "Test",
      },
      custom_attributes: null,
      labels: [],
    };
    expect(matchSearchClient([r], "3380")).toHaveLength(1);
  });
  it("'#3380' bate em row com display_id 3380 (haystack tem '#3380')", () => {
    const r = { ...baseRow, display_id: 3380 };
    expect(matchSearchClient([r], "#3380")).toHaveLength(1);
  });
  it("inbox/team/assignee com acento", () => {
    expect(matchSearchClient([baseRow], "amapa")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "comercial")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "allyda")).toHaveLength(1);
  });
  it("status pt-BR", () => {
    expect(matchSearchClient([baseRow], "Aberta")).toHaveLength(1);
    expect(
      matchSearchClient([{ ...baseRow, status: 1 }], "Resolvida"),
    ).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Resolvida")).toHaveLength(0);
  });
  it("prioridade pt-BR", () => {
    expect(matchSearchClient([baseRow], "Media")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Urgente")).toHaveLength(0);
  });
  it("label", () =>
    expect(matchSearchClient([baseRow], "vip")).toHaveLength(1));
  it("custom_attributes key e value", () => {
    expect(matchSearchClient([baseRow], "Gold")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "plano")).toHaveLength(1);
    expect(matchSearchClient([baseRow], "Cliente VIP")).toHaveLength(1);
  });
  it("ignora keys com prefixo _", () => {
    const r = { ...baseRow, custom_attributes: { _internal_id: "abc123" } };
    expect(matchSearchClient([r], "abc123")).toHaveLength(0);
  });
  it("não match", () =>
    expect(matchSearchClient([baseRow], "xyz-naoexiste")).toHaveLength(0));
  it("performance: 50k rows < 2000ms (paralelo CI)", () => {
    // Threshold 2s acomoda contenção de CPU quando rodando jest --maxWorkers
    // em paralelo com outras 30+ suites. Isolado mede ~150ms; paralelo pico ~1500ms.
    const big = Array.from({ length: 50_000 }, (_, i) => ({
      ...baseRow,
      id: i,
      display_id: i,
    }));
    const t0 = performance.now();
    matchSearchClient(big, "12345");
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
