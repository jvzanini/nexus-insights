// Testes do builder XLSX puro (sem DB) — TDD por Task 4 do plan
// 2026-05-01-relatorio-conversas-revamp.md.

import ExcelJS from "exceljs";
import {
  buildConversasXlsxBuffer,
  prettifyAttrKey,
} from "@/lib/reports/conversas-xlsx";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const baseRow: ConversaRow = {
  id: 1,
  display_id: 1234,
  contact: {
    id: 1,
    name: "João",
    phone_number: "+55 11 91234-5678",
    identifier: "12345678900",
    additional_attributes: null,
    country: null,
    estado: null,
  },
  inbox: { id: 1, name: "WhatsApp" },
  team: { id: 1, name: "Suporte" },
  assignee: { id: 1, name: "Maria" },
  status: 0,
  priority: 2,
  created_at: "2026-04-29T10:00:00.000Z",
  last_activity_at: "2026-04-30T15:30:00.000Z",
  last_message_type: 0,
  last_message_at: null,
  last_incoming_at: null,
  last_outgoing_at: null,
  custom_attributes: { cpf: "123", plano: "gold" },
  waiting_seconds: 3600,
  open_seconds: null,
  labels: [{ name: "VIP", color: "#0f0" }],
};

async function loadRowsFromBuffer(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  // ExcelJS.xlsx.load aceita ArrayBuffer/Buffer; cast neutraliza a fricção
  // entre Buffer<ArrayBufferLike> global e o tipo aceito pela lib.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Conversas");
  if (!ws) throw new Error("worksheet missing");
  const rows: unknown[][] = [];
  ws.eachRow((row) => {
    rows.push(row.values as unknown[]);
  });
  return { ws, rows };
}

describe("conversas-xlsx", () => {
  it("gera workbook com aba Conversas + header congelado", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { ws } = await loadRowsFromBuffer(buffer);
    expect(ws.name).toBe("Conversas");
    const view = ws.views?.[0] as { state?: string; ySplit?: number };
    expect(view?.state).toBe("frozen");
    expect(view?.ySplit).toBe(1);
  });

  it("inclui as 16 colunas fixas (com País e Estado/Cidade após Documento)", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0];
    expect(header).toEqual(
      expect.arrayContaining([
        "#",
        "Nome",
        "WhatsApp",
        "Documento",
        "País",
        "Estado/Cidade",
        "Caixa de entrada",
        "Departamento",
        "Atendente",
        "Status",
        "Prioridade",
        "Etiquetas",
        "Criado em",
        "Última atualização",
        "Sem resposta há",
        "Aberta há",
      ]),
    );
  });

  it("País e Estado/Cidade ficam logo após Documento e antes de Caixa de entrada (inbox)", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    const docIdx = header.indexOf("Documento");
    expect(header[docIdx + 1]).toBe("País");
    expect(header[docIdx + 2]).toBe("Estado/Cidade");
    expect(header[docIdx + 3]).toBe("Caixa de entrada");
  });

  it("preenche País e Estado/Cidade do contato nas células corretas", async () => {
    const row: ConversaRow = {
      ...baseRow,
      contact: {
        ...baseRow.contact,
        country: "Brasil",
        estado: "MG-Minas Gerais",
      },
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    const dataRow = rows[1] as unknown[];
    const paisIdx = header.indexOf("País");
    const estadoCidadeIdx = header.indexOf("Estado/Cidade");
    expect(dataRow[paisIdx]).toBe("Brasil");
    expect(dataRow[estadoCidadeIdx]).toBe("MG-Minas Gerais");
  });

  it("País/Estado/Cidade null viram — nas células correspondentes", async () => {
    const row: ConversaRow = {
      ...baseRow,
      contact: { ...baseRow.contact, country: null, estado: null },
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    const dataRow = rows[1] as unknown[];
    expect(dataRow[header.indexOf("País")]).toBe("—");
    expect(dataRow[header.indexOf("Estado/Cidade")]).toBe("—");
  });

  it("inclui colunas dinâmicas Atributo: <Nome Legível> em ordem alfabética", async () => {
    const { buffer } = await buildConversasXlsxBuffer({
      rows: [
        baseRow,
        {
          ...baseRow,
          id: 2,
          display_id: 2,
          custom_attributes: { unidade: "SP" },
        },
      ],
    });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    const atrCols = header.filter(
      (c) => typeof c === "string" && c.startsWith("Atributo:"),
    );
    expect(atrCols).toEqual([
      "Atributo: Cpf",
      "Atributo: Plano",
      "Atributo: Unidade",
    ]);
  });

  it("custom_attribute status_atendimento vira header 'Atributo: Status Atendimento' (não 'Atr:')", async () => {
    const row: ConversaRow = {
      ...baseRow,
      custom_attributes: { status_atendimento: "aberto" },
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    expect(header).toContain("Atributo: Status Atendimento");
    expect(
      header.some((c) => typeof c === "string" && c.startsWith("Atr:")),
    ).toBe(false);
  });

  it("traduz status/prioridade pt-BR", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as unknown[];
    expect(dataRow).toEqual(expect.arrayContaining(["Aberta", "Alta"]));
  });

  it("formata duration legível", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as unknown[];
    // 3600s vira "1h" (formatDuration). Aceita "hora" ou "h\b" para futuro.
    expect(
      dataRow.find((v) => typeof v === "string" && /hora|h\b/.test(v)),
    ).toBeTruthy();
  });

  it("etiquetas como join(, )", async () => {
    const row: ConversaRow = {
      ...baseRow,
      labels: [
        { name: "VIP", color: "#0f0" },
        { name: "recorrente", color: "#00f" },
      ],
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as unknown[];
    expect(dataRow).toEqual(expect.arrayContaining(["VIP, recorrente"]));
  });

  it("cap 50 colunas dinâmicas — top 50 mais frequentes", async () => {
    const rows: ConversaRow[] = [];
    for (let i = 0; i < 60; i++) {
      const attrs: Record<string, string> = {};
      // chave kj aparece em todas as rows com índice >= j → kj tem (60 - j) ocorrências
      for (let j = 0; j <= i; j++) {
        attrs[`k${j}`] = "v";
      }
      rows.push({
        ...baseRow,
        id: 100 + i,
        display_id: 100 + i,
        custom_attributes: attrs,
      });
    }
    const { buffer, droppedAttrCount } = await buildConversasXlsxBuffer({
      rows,
    });
    const { rows: parsed } = await loadRowsFromBuffer(buffer);
    const header = parsed[0] as string[];
    const atrCount = header.filter(
      (c) => typeof c === "string" && c.startsWith("Atributo:"),
    ).length;
    expect(atrCount).toBe(50);
    expect(droppedAttrCount).toBeGreaterThan(0);
  });

  it("0 rows → header somente", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [] });
    const { rows } = await loadRowsFromBuffer(buffer);
    expect(rows.length).toBe(1); // só header
  });

  it("custom_attribute objeto/array → JSON.stringify", async () => {
    const row: ConversaRow = {
      ...baseRow,
      custom_attributes: { meta: { x: 1 }, lista: [1, 2] },
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as unknown[];
    expect(dataRow.some((v) => v === '{"x":1}')).toBe(true);
    expect(dataRow.some((v) => v === "[1,2]")).toBe(true);
  });

  it("durations null e datas null viram —", async () => {
    const row: ConversaRow = {
      ...baseRow,
      waiting_seconds: null,
      open_seconds: null,
      created_at: null,
      last_activity_at: null,
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as unknown[];
    const dashCount = dataRow.filter((v) => v === "—").length;
    expect(dashCount).toBeGreaterThanOrEqual(4);
  });
});

describe("prettifyAttrKey", () => {
  it("converte snake_case em Title Case", () => {
    expect(prettifyAttrKey("wpp_id")).toBe("Wpp Id");
    expect(prettifyAttrKey("nome_id")).toBe("Nome Id");
    expect(prettifyAttrKey("status_atendimento")).toBe("Status Atendimento");
  });

  it("converte kebab-case em Title Case", () => {
    expect(prettifyAttrKey("message-api")).toBe("Message Api");
  });

  it("colapsa espaços múltiplos e dá trim", () => {
    expect(prettifyAttrKey("  status__atendimento  ")).toBe(
      "Status Atendimento",
    );
  });

  it("normaliza maiúsculas/minúsculas para Title Case", () => {
    expect(prettifyAttrKey("MESSAGE_API")).toBe("Message Api");
  });
});

describe("buildConversasXlsxBuffer v0.35 — sem rows fantasma", () => {
  it("0 rows gera só 1 row (header)", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Conversas")!;
    expect(ws.actualRowCount).toBe(1);
    expect(ws.rowCount).toBe(1);
  });

  it("1 row de dados gera EXATAMENTE 2 rows (header + 1)", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Conversas")!;
    expect(ws.actualRowCount).toBe(2);
    expect(ws.rowCount).toBe(2);
  });

  it("3 rows geram 4 rows total (header + 3)", async () => {
    const { buffer } = await buildConversasXlsxBuffer({
      rows: [
        baseRow,
        { ...baseRow, id: 2, display_id: 2 },
        { ...baseRow, id: 3, display_id: 3 },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Conversas")!;
    expect(ws.actualRowCount).toBe(4);
  });
});
