# Plan: Revamp do relatório `/relatorios/conversas` (v0.17.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **REGRA SUPREMA**: cada task UI invoca `ui-ux-pro-max:ui-ux-pro-max` antes de codar. Cada task com código testável invoca `superpowers:test-driven-development`. Workflow registrado em `docs/agents/active/claude-conversas-v017.md`.

**Goal:** Modernizar o relatório de conversas: exportar XLSX completo, busca server-side (Enter), drill-down inline limpo (3 seções), coluna #ID virando botão "Abrir", remoção da paginação visual, virtualização de 10k linhas, tour atualizado.

**Architecture:** Backend leve em `src/lib/chatwoot/*` (search ILIKE) + Server Action de export gerando XLSX in-memory via exceljs + UI revisada em `src/components/reports/*` com `@tanstack/react-virtual` v3 mantendo thead sticky. Spec completa: `docs/superpowers/specs/2026-05-01-relatorio-conversas-revamp-design.md`.

**Tech Stack:** Next.js 16.2.2 (App Router), React 19.2, TypeScript, Tailwind v4, base-ui, PostgreSQL via @/lib/chatwoot/pool, BullMQ/Redis (não usado nesta feature), Jest + jest-mock-extended + RTL, exceljs, @tanstack/react-virtual.

---

## File Structure (Decomposição lock-in)

### NEW

| Path | Responsabilidade |
|------|---|
| `src/lib/chatwoot/conversas-translations.ts` | STATUS_LABELS / PRIORITY_LABELS pt-BR (única fonte) |
| `src/lib/reports/conversas-xlsx.ts` | Build de Buffer XLSX puro (testável sem DB) |
| `src/lib/actions/reports/conversas-export.ts` | Server Action: auth + fetch + sort + export → base64 |
| `src/components/reports/export-button.tsx` | UI do botão (idle / loading / disabled) + Server Action call + download |
| `src/lib/reports/__tests__/conversas-xlsx.test.ts` | Testes do XLSX builder |
| `src/lib/chatwoot/__tests__/conversas-translations.test.ts` | Testes de translation |
| `src/components/reports/__tests__/conversa-drill-down.test.tsx` | Já existe — atualizar |
| `src/components/reports/__tests__/export-button.test.tsx` | Testes do botão |

### MODIFY

| Path | Mudança |
|------|---|
| `src/lib/chatwoot/filters.ts` | Add `search?: string` em ReportFilters + cláusula ILIKE OR no buildBaseFilter (ESCAPE '\') |
| `src/lib/chatwoot/queries/conversas-list.ts` | Passa search adiante (já recebe ReportFilters via base) — só precisa garantir que buildBaseFilter usa o novo campo |
| `src/lib/actions/reports/conversas.ts` | Tipo `FetchConversasInput` herda search; nada além |
| `src/lib/tours/conversas-tour.ts` | id="conversas-v2", remove page-size, atualiza search/open-action/drill-down, adiciona export |
| `src/components/reports/loading-overlay.tsx` | label dinâmico padrão; pulse opcional; backdrop-blur-md |
| `src/components/reports/conversa-drill-down.tsx` | 3 seções inline (WhatsApp / Etiquetas / Atributos), remove botão "Abrir" |
| `src/components/reports/conversas-table.tsx` | Virtualização + #ID clicável + remove paginação/Carregar mais/seletor + remove colunas labels e actions |
| `src/components/reports/advanced-filters.tsx` | Adiciona ExportButton ao lado de "Ordenação" |
| `src/components/reports/conversas-page-client.tsx` | Passa accountId/filters pro ExportButton via AdvancedFilters |
| `package.json` | Bump 0.15.4 → 0.17.0; deps: exceljs, @tanstack/react-virtual |
| `CHANGELOG.md` | Append seção v0.17.0 |
| `docs/STATUS.md` | Atualizar versão |

### DELETE (se sem outros consumidores)

| Path | Verificação |
|------|---|
| `src/components/reports/open-in-chatwoot.tsx` | grep antes de deletar |

### Cleanup runtime

- `localStorage.removeItem("conversas-table-page-size")` — feito em `useEffect` no mount da nova ConversasTable.

---

## Convenções para subagentes

- **Antes de tocar UI**: invocar `ui-ux-pro-max:ui-ux-pro-max` (regra absoluta CLAUDE.md §2.2).
- **Antes de implementar lógica testável**: invocar `superpowers:test-driven-development`.
- **Após cada task**: `npm run typecheck` deve passar 0 erros, jest da área deve passar.
- **Commits**: um por task, mensagem `feat(<área>): T<N> — <título>` ou `fix(...)`.
- **Não tocar arquivos do nex-suite-refinement nem do integracoes-powerbi** (lista no active file).
- **Não rodar build local pesado**: o controlador roda no fim.

---

## Task 1: Catálogo de translations status/prioridade

**Files:**
- Create: `src/lib/chatwoot/conversas-translations.ts`
- Create: `src/lib/chatwoot/__tests__/conversas-translations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chatwoot/__tests__/conversas-translations.test.ts
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  resolveStatusLabel,
  resolvePriorityLabel,
} from "@/lib/chatwoot/conversas-translations";

describe("conversas-translations", () => {
  it("STATUS_LABELS cobre 0..3 com nomes pt-BR", () => {
    expect(STATUS_LABELS).toEqual({
      0: "Aberta",
      1: "Resolvida",
      2: "Pendente",
      3: "Snoozed",
    });
  });

  it("PRIORITY_LABELS cobre 0..3 com nomes pt-BR", () => {
    expect(PRIORITY_LABELS).toEqual({
      0: "Baixa",
      1: "Media",
      2: "Alta",
      3: "Urgente",
    });
  });

  it("resolveStatusLabel retorna '—' para valores fora do range", () => {
    expect(resolveStatusLabel(0)).toBe("Aberta");
    expect(resolveStatusLabel(99)).toBe("—");
    expect(resolveStatusLabel(null)).toBe("—");
  });

  it("resolvePriorityLabel retorna '—' para null/undefined", () => {
    expect(resolvePriorityLabel(2)).toBe("Alta");
    expect(resolvePriorityLabel(null)).toBe("—");
    expect(resolvePriorityLabel(undefined)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversas-translations.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/chatwoot/conversas-translations.ts
// Mapeamento canônico de status (Chatwoot ints) → texto pt-BR.
// Reaproveitado por SQL CASE (busca) e XLSX builder (export).

export const STATUS_LABELS: Record<number, string> = {
  0: "Aberta",
  1: "Resolvida",
  2: "Pendente",
  3: "Snoozed",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "Baixa",
  1: "Media",
  2: "Alta",
  3: "Urgente",
};

export function resolveStatusLabel(status: number | null | undefined): string {
  if (status == null) return "—";
  return STATUS_LABELS[status] ?? "—";
}

export function resolvePriorityLabel(
  priority: number | null | undefined,
): string {
  if (priority == null) return "—";
  return PRIORITY_LABELS[priority] ?? "—";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- conversas-translations.test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatwoot/conversas-translations.ts src/lib/chatwoot/__tests__/conversas-translations.test.ts
git commit -m "feat(chatwoot): T1 — translations status/prioridade pt-BR"
```

---

## Task 2: ReportFilters.search + buildBaseFilter ILIKE

**Files:**
- Modify: `src/lib/chatwoot/filters.ts`
- Test: `src/lib/chatwoot/__tests__/filters.test.ts` (criar se ainda não existe; senão adicionar describe)

> Antes de começar: invocar `superpowers:test-driven-development` mentalmente (escrever teste primeiro). Inspecionar `src/lib/chatwoot/filters.ts` no local antes de editar.

- [ ] **Step 1: Inspecionar arquivo atual**

Run: `cat src/lib/chatwoot/filters.ts | head -120`
Anotar:
- Tipo `ReportFilters` exportado.
- Função `buildBaseFilter(filters, accountId)` que retorna `{ whereSql, params }`.
- Estrutura de params (`unknown[]`).

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/chatwoot/__tests__/filters.test.ts (adicionar describe)
import { buildBaseFilter } from "@/lib/chatwoot/filters";

describe("buildBaseFilter — search", () => {
  it("não adiciona cláusula quando search é undefined", () => {
    const r = buildBaseFilter(
      { period: { start: new Date(), end: new Date() } },
      9,
    );
    expect(r.whereSql).not.toContain("ILIKE");
  });

  it("não adiciona cláusula quando search é string vazia/whitespace", () => {
    const r = buildBaseFilter(
      { period: { start: new Date(), end: new Date() }, search: "   " },
      9,
    );
    expect(r.whereSql).not.toContain("ILIKE");
  });

  it("adiciona OR de ILIKEs quando search tem conteúdo", () => {
    const r = buildBaseFilter(
      { period: { start: new Date(), end: new Date() }, search: "joão" },
      9,
    );
    expect(r.whereSql).toContain("ILIKE");
    expect(r.whereSql).toMatch(/ct\.name\s+ILIKE/);
    expect(r.whereSql).toMatch(/ct\.phone_number\s+ILIKE/);
    expect(r.whereSql).toMatch(/ct\.identifier\s+ILIKE/);
    expect(r.whereSql).toMatch(/ix\.name\s+ILIKE/);
    expect(r.whereSql).toMatch(/tm\.name\s+ILIKE/);
    expect(r.whereSql).toMatch(/u\.name\s+ILIKE/);
    expect(r.whereSql).toMatch(/c\.display_id::text\s+ILIKE/);
    expect(r.whereSql).toMatch(/c\.custom_attributes::text\s+ILIKE/);
    expect(r.whereSql).toMatch(/EXISTS \(/); // tags subquery
    expect(r.whereSql).toContain("ESCAPE '\\\\'"); // ESCAPE clause
    // params adicionado uma vez (o mesmo $N reusado em todas as colunas)
    const occurrences = (r.whereSql.match(/\$\d+/g) ?? []).length;
    // últimos 9+ ILIKEs todos referenciam o mesmo número
    expect(r.params.at(-1)).toBe("%joão%");
  });

  it("escapa wildcards LIKE (% e _) literais", () => {
    const r = buildBaseFilter(
      { period: { start: new Date(), end: new Date() }, search: "100% _ok" },
      9,
    );
    // o último param deve ter % e _ escapados:
    expect(r.params.at(-1)).toBe("%100\\% \\_ok%");
  });

  it("trunca em 256 chars", () => {
    const long = "a".repeat(500);
    const r = buildBaseFilter(
      { period: { start: new Date(), end: new Date() }, search: long },
      9,
    );
    const last = r.params.at(-1) as string;
    // 1 char % + até 256 chars sanitizados + 1 char % = ~258
    expect(last.length).toBeLessThanOrEqual(258);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- filters.test`
Expected: FAIL — buildBaseFilter ainda não conhece `search`.

- [ ] **Step 4: Implementar**

Edit `src/lib/chatwoot/filters.ts`:

```ts
// 1. Adicionar campo na interface
export interface ReportFilters {
  // ... campos existentes
  search?: string;
}

// 2. Helper local de sanitize (no topo do arquivo, próximo às outras helpers)
const SEARCH_MAX_LEN = 256;

function sanitizeSearch(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // escape %, _ e \ literais para LIKE
  const escaped = trimmed
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  const truncated = escaped.slice(0, SEARCH_MAX_LEN);
  return `%${truncated}%`;
}

// 3. Dentro de buildBaseFilter, depois das demais cláusulas e antes do return:
const search = sanitizeSearch(filters.search);
if (search) {
  params.push(search);
  const idx = params.length;
  whereSql += `
    AND (
      ct.name ILIKE $${idx} ESCAPE '\\'
      OR ct.phone_number ILIKE $${idx} ESCAPE '\\'
      OR ct.identifier ILIKE $${idx} ESCAPE '\\'
      OR ix.name ILIKE $${idx} ESCAPE '\\'
      OR tm.name ILIKE $${idx} ESCAPE '\\'
      OR u.name ILIKE $${idx} ESCAPE '\\'
      OR c.display_id::text ILIKE $${idx} ESCAPE '\\'
      OR c.custom_attributes::text ILIKE $${idx} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM taggings tg
        JOIN tags t ON t.id = tg.tag_id
        WHERE tg.taggable_id = c.id
          AND tg.taggable_type = 'Conversation'
          AND t.name ILIKE $${idx} ESCAPE '\\'
      )
      OR (
        CASE c.status
          WHEN 0 THEN 'Aberta'
          WHEN 1 THEN 'Resolvida'
          WHEN 2 THEN 'Pendente'
          WHEN 3 THEN 'Snoozed'
          ELSE ''
        END
      ) ILIKE $${idx} ESCAPE '\\'
      OR (
        CASE c.priority
          WHEN 0 THEN 'Baixa'
          WHEN 1 THEN 'Media'
          WHEN 2 THEN 'Alta'
          WHEN 3 THEN 'Urgente'
          ELSE ''
        END
      ) ILIKE $${idx} ESCAPE '\\'
    )
  `;
}
```

> Importante: o subagente deve **abrir o arquivo atual** e adaptar a posição do bloco. Não substituir o arquivo inteiro.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- filters.test`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chatwoot/filters.ts src/lib/chatwoot/__tests__/filters.test.ts
git commit -m "feat(chatwoot): T2 — search ILIKE OR em buildBaseFilter"
```

---

## Task 3: fetchConversas e conversasList honram search

**Files:**
- Verify: `src/lib/actions/reports/conversas.ts` (apenas conferir; FetchConversasInput herda automaticamente via ReportFilters)
- Verify: `src/lib/chatwoot/queries/conversas-list.ts` (já passa filters por buildBaseFilter — confirmar)

- [ ] **Step 1: Conferir tipo herdado**

Run: `npx tsc --noEmit src/lib/actions/reports/conversas.ts 2>&1 | head -20`
Anotar: o tipo `FetchConversasInput.filters: ReportFilters` herda `search?: string` automaticamente.

- [ ] **Step 2: Conferir conversasList**

Run: `grep -n "buildBaseFilter" src/lib/chatwoot/queries/conversas-list.ts`
Confirmar: usa `buildBaseFilter(args.filters, args.accountId)` — filtra automaticamente por search.

- [ ] **Step 3: Smoke test (sanity)**

Não há ação extra de código. Confirma sem alterações.

> Esta task é zero-code (verificação de propagação tipo). Pode pular o commit; documenta a auditoria como nota no plan.

---

## Task 4: XLSX builder puro

**Files:**
- Create: `src/lib/reports/conversas-xlsx.ts`
- Create: `src/lib/reports/__tests__/conversas-xlsx.test.ts`

> Antes: invocar `superpowers:test-driven-development`. Pacote `exceljs` ainda não instalado — instalar antes (ver Task 13).

- [ ] **Step 1: Instalar dep (one-shot)**

Run: `npm install exceljs --save`
Anotar versão no package.json.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/reports/__tests__/conversas-xlsx.test.ts
import ExcelJS from "exceljs";
import { buildConversasXlsxBuffer } from "@/lib/reports/conversas-xlsx";
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
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Conversas");
  if (!ws) throw new Error("worksheet missing");
  const rows: any[][] = [];
  ws.eachRow((row) => {
    rows.push(row.values as any[]);
  });
  return { ws, rows };
}

describe("conversas-xlsx", () => {
  it("gera workbook com aba Conversas + header congelado", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { ws } = await loadRowsFromBuffer(buffer);
    expect(ws.name).toBe("Conversas");
    expect(ws.views?.[0]?.state).toBe("frozen");
    expect(ws.views?.[0]?.ySplit).toBe(1);
  });

  it("inclui as 14 colunas fixas", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0];
    expect(header).toEqual(
      expect.arrayContaining([
        "#",
        "Nome",
        "WhatsApp",
        "Documento",
        "Estado",
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

  it("inclui colunas dinâmicas Atr:<chave> em ordem alfabética", async () => {
    const { buffer } = await buildConversasXlsxBuffer({
      rows: [
        baseRow,
        { ...baseRow, id: 2, display_id: 2, custom_attributes: { unidade: "SP" } },
      ],
    });
    const { rows } = await loadRowsFromBuffer(buffer);
    const header = rows[0] as string[];
    const atrCols = header.filter((c) => typeof c === "string" && c.startsWith("Atr:"));
    expect(atrCols).toEqual(["Atr: cpf", "Atr: plano", "Atr: unidade"]);
  });

  it("traduz status/prioridade pt-BR", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as any[];
    expect(dataRow).toEqual(
      expect.arrayContaining(["Aberta", "Alta"]),
    );
  });

  it("formata duration legível", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [baseRow] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as any[];
    // 3600s = "1 hora" (ou similar — depende de formatDuration)
    expect(dataRow.find((v) => typeof v === "string" && /hora|h\b/.test(v))).toBeTruthy();
  });

  it("etiquetas como join(, )", async () => {
    const row = { ...baseRow, labels: [{ name: "VIP" }, { name: "recorrente" }] };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row as any] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as any[];
    expect(dataRow).toEqual(expect.arrayContaining(["VIP, recorrente"]));
  });

  it("cap 50 colunas dinâmicas — top 50 mais frequentes", async () => {
    const rows: ConversaRow[] = [];
    for (let i = 0; i < 60; i++) {
      const attrs: Record<string, string> = {};
      // chave i aparece (i+1) vezes acumuladas
      for (let j = 0; j <= i; j++) {
        attrs[`k${j}`] = "v";
      }
      rows.push({ ...baseRow, id: 100 + i, display_id: 100 + i, custom_attributes: attrs });
    }
    const { buffer, droppedAttrCount } = await buildConversasXlsxBuffer({ rows });
    const { rows: parsed } = await loadRowsFromBuffer(buffer);
    const header = parsed[0] as string[];
    const atrCount = header.filter((c) => typeof c === "string" && c.startsWith("Atr:")).length;
    expect(atrCount).toBe(50);
    expect(droppedAttrCount).toBeGreaterThan(0);
  });

  it("0 rows → header somente", async () => {
    const { buffer } = await buildConversasXlsxBuffer({ rows: [] });
    const { rows } = await loadRowsFromBuffer(buffer);
    expect(rows.length).toBe(1); // só header
  });

  it("custom_attribute objeto/array → JSON.stringify", async () => {
    const row = {
      ...baseRow,
      custom_attributes: { meta: { x: 1 }, lista: [1, 2] },
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row as any] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as any[];
    expect(dataRow.some((v) => v === '{"x":1}')).toBe(true);
    expect(dataRow.some((v) => v === "[1,2]")).toBe(true);
  });

  it("durations null e datas null viram —", async () => {
    const row = {
      ...baseRow,
      waiting_seconds: null,
      open_seconds: null,
      created_at: null,
      last_activity_at: null,
    };
    const { buffer } = await buildConversasXlsxBuffer({ rows: [row as any] });
    const { rows } = await loadRowsFromBuffer(buffer);
    const dataRow = rows[1] as any[];
    const dashCount = dataRow.filter((v) => v === "—").length;
    expect(dashCount).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- conversas-xlsx.test`
Expected: FAIL — module missing.

- [ ] **Step 4: Implementar**

```ts
// src/lib/reports/conversas-xlsx.ts
// Build XLSX puro a partir de ConversaRow[]. Sem chamadas a DB.
// Fonte canônica de status/prioridade em conversas-translations.ts.

import ExcelJS from "exceljs";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import {
  resolveStatusLabel,
  resolvePriorityLabel,
} from "@/lib/chatwoot/conversas-translations";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import { formatDuration } from "@/lib/utils/format-time";

export const MAX_DYNAMIC_ATTR_COLS = 50;

interface BuildArgs {
  rows: ConversaRow[];
}

interface BuildResult {
  buffer: Buffer;
  droppedAttrCount: number;
}

const FIXED_HEADERS = [
  "#",
  "Nome",
  "WhatsApp",
  "Documento",
  "Estado",
  "Departamento",
  "Atendente",
  "Status",
  "Prioridade",
  "Etiquetas",
  "Criado em",
  "Última atualização",
  "Sem resposta há",
  "Aberta há",
];

function formatDateTimePtBr(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

function formatDurationOrDash(s: number | null): string {
  if (s == null) return "—";
  return formatDuration(s);
}

function getDocument(contact: ConversaRow["contact"]): string {
  const doc = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return doc?.formatted ?? "—";
}

function getPhone(phone: string | null): string {
  if (!phone) return "—";
  return formatPhone(phone) ?? phone ?? "—";
}

function joinLabels(labels: ConversaRow["labels"]): string {
  if (!labels || labels.length === 0) return "—";
  return labels.map((l) => l.name).join(", ");
}

function attrToCell(value: unknown): string {
  if (value == null || value === "") return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Top-N por frequência das chaves de custom_attributes em rows.
 * Empate: ordem alfabética.
 */
function pickTopAttributeKeys(
  rows: ConversaRow[],
  limit: number,
): { keep: string[]; dropped: number } {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.custom_attributes) continue;
    for (const k of Object.keys(r.custom_attributes)) {
      if (
        r.custom_attributes[k] === null ||
        r.custom_attributes[k] === undefined ||
        r.custom_attributes[k] === ""
      ) {
        continue;
      }
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const all = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([k]) => k);
  const keep = all.slice(0, limit).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { keep, dropped: Math.max(all.length - keep.length, 0) };
}

export async function buildConversasXlsxBuffer(
  args: BuildArgs,
): Promise<BuildResult> {
  const { rows } = args;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexus Insights";
  wb.created = new Date();

  const ws = wb.addWorksheet("Conversas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const { keep: attrKeys, dropped } = pickTopAttributeKeys(
    rows,
    MAX_DYNAMIC_ATTR_COLS,
  );

  const dynamicHeaders = attrKeys.map((k) => `Atr: ${k}`);
  const headers = [...FIXED_HEADERS, ...dynamicHeaders];

  ws.columns = headers.map((h) => ({ header: h, key: h, width: 18 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };

  for (const r of rows) {
    const fixed = [
      r.display_id,
      r.contact.name ?? "—",
      getPhone(r.contact.phone_number),
      getDocument(r.contact),
      r.inbox.name ?? "—",
      r.team.name ?? "—",
      r.assignee.name ?? "—",
      resolveStatusLabel(r.status),
      resolvePriorityLabel(r.priority),
      joinLabels(r.labels),
      formatDateTimePtBr(r.created_at),
      formatDateTimePtBr(r.last_activity_at),
      formatDurationOrDash(r.waiting_seconds),
      formatDurationOrDash(r.open_seconds),
    ];

    const dynamicValues = attrKeys.map((k) =>
      attrToCell(r.custom_attributes?.[k]),
    );

    ws.addRow([...fixed, ...dynamicValues]);
  }

  const buffer = (await wb.xlsx.writeBuffer()) as Buffer;
  return { buffer, droppedAttrCount: dropped };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- conversas-xlsx.test`
Expected: PASS — 10 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/reports/conversas-xlsx.ts src/lib/reports/__tests__/conversas-xlsx.test.ts
git commit -m "feat(reports): T4 — buildConversasXlsxBuffer (exceljs) com colunas dinâmicas + top-50"
```

---

## Task 5: Server Action exportConversasAction

**Files:**
- Create: `src/lib/actions/reports/conversas-export.ts`
- Create: `src/lib/actions/reports/__tests__/conversas-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/reports/__tests__/conversas-export.test.ts
import { mockDeep, mockReset } from "jest-mock-extended";

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock("@/lib/reports/visibility", () => ({
  isReportVisibleForUser: jest.fn(),
}));
jest.mock("@/lib/chatwoot/queries/conversas-list", () => ({
  conversasList: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));

import { exportConversasAction } from "@/lib/actions/reports/conversas-export";
import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { logAudit } from "@/lib/audit";

const mockedUser = {
  id: "u1",
  email: "x@y",
  name: "X",
  platformRole: "super_admin",
  isOwner: true,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "system",
  accountIds: [9],
  teamIds: ["all"],
};

const baseFilters = {
  period: { start: new Date(), end: new Date() },
};

describe("exportConversasAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna error quando não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeDefined();
    expect(r.base64).toBeUndefined();
  });

  it("retorna error quando relatório não visível", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(false);
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeDefined();
  });

  it("retorna error quando 0 rows", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockResolvedValue({
      data: { rows: [], nextCursor: null },
      stale: false,
      cached: false,
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBe("Sem conversas para exportar");
  });

  it("retorna base64 + filename quando rows > 0", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockResolvedValue({
      data: {
        rows: [
          {
            id: 1,
            display_id: 1,
            contact: { id: 1, name: "X", phone_number: null, identifier: null, additional_attributes: null },
            inbox: { id: 1, name: "WA" },
            team: { id: null, name: null },
            assignee: { id: null, name: null },
            status: 0,
            priority: 0,
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
          },
        ],
        nextCursor: null,
      },
      stale: false,
      cached: false,
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.error).toBeUndefined();
    expect(typeof r.base64).toBe("string");
    expect(r.base64?.length).toBeGreaterThan(0);
    expect(r.filename).toMatch(/^conversas_9_/);
    expect(r.filename).toMatch(/\.xlsx$/);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report_exported", scope: "conversas" }),
    );
  });

  it("flag truncated quando ultrapassa MAX_EXPORT_ROWS", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockedUser);
    (isReportVisibleForUser as jest.Mock).mockResolvedValue(true);
    (conversasList as jest.Mock).mockImplementation(async (args) => {
      const limit = args.limit;
      const rows = Array.from({ length: limit }, (_, i) => ({
        id: i,
        display_id: i,
        contact: { id: 1, name: "X", phone_number: null, identifier: null, additional_attributes: null },
        inbox: { id: 1, name: "WA" },
        team: { id: null, name: null },
        assignee: { id: null, name: null },
        status: 0,
        priority: 0,
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
      }));
      return { data: { rows, nextCursor: "next" }, stale: false, cached: false };
    });
    const r = await exportConversasAction({ filters: baseFilters, accountId: 9 });
    expect(r.truncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- conversas-export.test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implementar**

```ts
// src/lib/actions/reports/conversas-export.ts
"use server";

import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { buildConversasXlsxBuffer } from "@/lib/reports/conversas-xlsx";
import { logAudit } from "@/lib/audit";
import { getAccessibleTeamIds } from "@/lib/tenant";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { AuthUser } from "@/lib/auth-helpers";

const DEFAULT_ACCOUNT_ID = 9;
export const MAX_EXPORT_ROWS = 50_000;

export interface ExportConversasInput {
  filters: ReportFilters;
  accountId?: number;
}

export interface ExportConversasResult {
  base64?: string;
  filename?: string;
  truncated?: boolean;
  droppedAttrCount?: number;
  error?: string;
}

function periodTag(filters: ReportFilters): string {
  // gera tag estável em formato yyyy-mm-dd_yyyy-mm-dd ou "todos".
  const start = filters.period?.start ? new Date(filters.period.start) : null;
  const end = filters.period?.end ? new Date(filters.period.end) : null;
  if (!start || !end) return "todos";
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)}_${fmt(end)}`;
}

function timestampTag(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function exportConversasAction(
  args: ExportConversasInput,
): Promise<ExportConversasResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado" };

  const visible = await isReportVisibleForUser("conversas", user.platformRole);
  if (!visible) return { error: "Relatório indisponível" };

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;

  const teamScope = await getAccessibleTeamIds(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      accountIds: user.accountIds,
      teamIds: user.teamIds,
    } satisfies AuthUser,
    accountId,
  );

  let scopedFilters: ReportFilters = { ...args.filters };
  if (teamScope !== "all") {
    if (teamScope.length === 0) return { error: "Sem conversas para exportar" };
    if (scopedFilters.teamIds && scopedFilters.teamIds.length > 0) {
      scopedFilters.teamIds = scopedFilters.teamIds.filter((id) =>
        teamScope.includes(id),
      );
      if (scopedFilters.teamIds.length === 0)
        return { error: "Sem conversas para exportar" };
    } else {
      scopedFilters.teamIds = teamScope;
    }
  }

  try {
    const result = await conversasList({
      accountId,
      filters: scopedFilters,
      cursor: null,
      limit: MAX_EXPORT_ROWS,
    });

    const rows = result.data.rows;
    if (rows.length === 0) return { error: "Sem conversas para exportar" };

    const truncated = Boolean(result.data.nextCursor);

    const { buffer, droppedAttrCount } = await buildConversasXlsxBuffer({ rows });

    const filename = `conversas_${accountId}_${periodTag(scopedFilters)}_${timestampTag()}.xlsx`;
    const base64 = buffer.toString("base64");

    await logAudit({
      action: "report_exported",
      scope: "conversas",
      actorId: user.id,
      meta: { rows: rows.length, truncated, accountId },
    });

    return { base64, filename, truncated, droppedAttrCount };
  } catch (err) {
    console.error("[exportConversasAction]", err);
    return { error: "Erro ao gerar planilha" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- conversas-export.test`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/reports/conversas-export.ts src/lib/actions/reports/__tests__/conversas-export.test.ts
git commit -m "feat(reports): T5 — Server Action exportConversasAction (XLSX base64)"
```

> Atenção: arquivo `"use server"` só pode exportar funções async (regra Next.js 16 documentada em AGENTS.md). `MAX_EXPORT_ROWS` é apenas const interna do módulo — re-exportar pra UI quebra build em runtime. Se UI precisar do número, criar `src/lib/reports/conversas-export-config.ts` (sem "use server") e importar dos dois lados.

---

## Task 6: ExportButton (UI)

**Files:**
- Create: `src/components/reports/export-button.tsx`
- Create: `src/components/reports/__tests__/export-button.test.tsx`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "primary action button loading state, disabled when empty, toast feedback".

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/reports/__tests__/export-button.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportButton } from "@/components/reports/export-button";

const mockAction = jest.fn();
jest.mock("@/lib/actions/reports/conversas-export", () => ({
  exportConversasAction: (...args: any[]) => mockAction(...args),
}));
jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

const baseProps = {
  filters: { period: { start: new Date(), end: new Date() } },
  accountId: 9,
  rowCount: 100,
};

describe("ExportButton", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renderiza botão Exportar com ícone Download e aria-label", () => {
    render(<ExportButton {...baseProps} />);
    const btn = screen.getByRole("button", { name: /exportar/i });
    expect(btn).toBeInTheDocument();
  });

  it("disabled quando rowCount é 0", () => {
    render(<ExportButton {...baseProps} rowCount={0} />);
    const btn = screen.getByRole("button", { name: /exportar/i });
    expect(btn).toBeDisabled();
  });

  it("dispatcha Server Action no click e baixa o arquivo", async () => {
    mockAction.mockResolvedValue({
      base64: Buffer.from("xlsx").toString("base64"),
      filename: "conversas_9_x.xlsx",
    });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
  });

  it("mostra toast erro em caso de fail", async () => {
    const { toast } = jest.requireMock("sonner");
    mockAction.mockResolvedValue({ error: "Erro ao gerar planilha" });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("toast warning quando truncated=true", async () => {
    const { toast } = jest.requireMock("sonner");
    mockAction.mockResolvedValue({
      base64: Buffer.from("xlsx").toString("base64"),
      filename: "conversas_9.xlsx",
      truncated: true,
    });
    render(<ExportButton {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /exportar/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- export-button.test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implementar**

```tsx
// src/components/reports/export-button.tsx
"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportConversasAction } from "@/lib/actions/reports/conversas-export";
import type { ReportFilters } from "@/lib/chatwoot/filters";

interface ExportButtonProps {
  filters: ReportFilters;
  accountId: number;
  rowCount: number;
}

function downloadBlob(base64: string, filename: string) {
  const byteCharacters = atob(base64);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    bytes[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ExportButton({
  filters,
  accountId,
  rowCount,
}: ExportButtonProps) {
  const [pending, startTransition] = useTransition();
  const [internalLoading, setInternalLoading] = useState(false);

  const disabled = rowCount === 0 || pending || internalLoading;

  const handleClick = () => {
    setInternalLoading(true);
    startTransition(async () => {
      try {
        const result = await exportConversasAction({ filters, accountId });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.base64 && result.filename) {
          downloadBlob(result.base64, result.filename);
          if (result.truncated) {
            toast.warning(
              "Mostrando primeiras 50.000 — refine os filtros para exportar tudo.",
            );
          } else {
            toast.success("Planilha gerada");
          }
        }
      } catch (err) {
        console.error("[ExportButton]", err);
        toast.error("Erro inesperado ao gerar planilha");
      } finally {
        setInternalLoading(false);
      }
    });
  };

  const loading = pending || internalLoading;

  return (
    <Button
      data-tour="export"
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      aria-label="Exportar conversas para planilha XLSX"
      aria-busy={loading}
      className="relative h-10 px-4"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Gerando…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar
        </>
      )}
    </Button>
  );
}

export default ExportButton;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- export-button.test`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/reports/export-button.tsx src/components/reports/__tests__/export-button.test.tsx
git commit -m "feat(reports): T6 — ExportButton com loading + toast + download blob"
```

---

## Task 7: AdvancedFilters integra ExportButton + cabos de filters/accountId/rowCount

**Files:**
- Modify: `src/components/reports/advanced-filters.tsx`
- Modify: `src/components/reports/conversas-page-client.tsx`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "toolbar action group spacing primary CTA hierarchy".

- [ ] **Step 1: Plumb props**

Em `conversas-page-client.tsx`, adicionar prop `onResolvedFilters` ou similar — na verdade, mais simples: passa `reportFilters`, `accountId` e `rowCount` direto pro AdvancedFilters.

Em `advanced-filters.tsx`:
1. Importar `ExportButton`.
2. Adicionar props `accountId: number`, `rowCount: number`, `appliedFilters: ReportFilters`.
3. Renderizar `<ExportButton filters={appliedFilters} accountId={accountId} rowCount={rowCount} />` ao lado do botão "Ordenação".

Em `conversas-page-client.tsx`:
1. Estado `tableRowCount` (passado pra cima pela ConversasTable via callback).
2. Passar `accountId`, `tableRowCount` e `reportFilters` (a versão composta com search aplicada) pra AdvancedFilters.

- [ ] **Step 2: Atualizar tipos**

```ts
// AdvancedFiltersProps
export interface AdvancedFiltersProps {
  // ... existentes
  accountId: number; // já existia
  appliedReportFilters: ReportFilters; // NEW — usado pelo ExportButton
  tableRowCount: number; // NEW — usado pelo ExportButton para disabled
}
```

- [ ] **Step 3: Smoke test manual**

Run: `npm run typecheck`
Expected: 0 errors.

Run: `npm test -- conversas-page-client` (se existir teste; senão pula)

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/advanced-filters.tsx src/components/reports/conversas-page-client.tsx
git commit -m "feat(reports): T7 — toolbar integra ExportButton (accountId+filters+rowCount)"
```

---

## Task 8: Drill-down 3 seções inline (sem botão Abrir, sem espaço fantasma)

**Files:**
- Modify: `src/components/reports/conversa-drill-down.tsx`
- Modify: `src/components/reports/__tests__/conversa-drill-down.test.tsx`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "inline label-value rows minimal vertical rhythm chip clusters".

- [ ] **Step 1: Update tests**

```tsx
// adicionar/atualizar
import { render, screen } from "@testing-library/react";
import { ConversaDrillDown } from "@/components/reports/conversa-drill-down";

const baseRow = {
  id: 1,
  display_id: 1,
  contact: { id: 1, name: "X", phone_number: "+5511912345678", identifier: null, additional_attributes: null },
  inbox: { id: 1, name: "WA" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0, priority: null,
  created_at: null, last_activity_at: null,
  last_message_type: null, last_message_at: null, last_incoming_at: null, last_outgoing_at: null,
  custom_attributes: { cpf: "123", plano: "gold" },
  waiting_seconds: null, open_seconds: null,
  labels: [{ name: "VIP" }, { name: "matriz" }],
};

describe("ConversaDrillDown — 3 seções inline", () => {
  it("renderiza WhatsApp / Etiquetas / Atributos", () => {
    render(<ConversaDrillDown row={baseRow as any} accountId={9} />);
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByText(/Etiquetas/i)).toBeInTheDocument();
    expect(screen.getByText(/Atributos/i)).toBeInTheDocument();
  });

  it("contador (N) na mesma linha de Atributos", () => {
    render(<ConversaDrillDown row={baseRow as any} accountId={9} />);
    expect(screen.getByText(/Atributos/i).parentElement?.textContent).toMatch(/\(2\)/);
  });

  it("etiquetas como chips (testa via texto)", () => {
    render(<ConversaDrillDown row={baseRow as any} accountId={9} />);
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("matriz")).toBeInTheDocument();
  });

  it("não renderiza mais o botão 'Abrir'", () => {
    render(<ConversaDrillDown row={baseRow as any} accountId={9} />);
    expect(screen.queryByRole("link", { name: /abrir/i })).not.toBeInTheDocument();
  });

  it("seção empty quando sem etiquetas", () => {
    render(
      <ConversaDrillDown row={{ ...baseRow, labels: [] } as any} accountId={9} />,
    );
    // texto "—" representando vazio
    expect(screen.getByText("Etiquetas").closest("div")?.textContent).toMatch(/—/);
  });

  it("seção empty quando sem atributos", () => {
    render(
      <ConversaDrillDown row={{ ...baseRow, custom_attributes: {} } as any} accountId={9} />,
    );
    expect(screen.getByText(/sem atributos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- conversa-drill-down.test`
Expected: FAIL — botão Abrir ainda existe; layout das seções diferente.

- [ ] **Step 3: Reescrever componente**

```tsx
// src/components/reports/conversa-drill-down.tsx
"use client";

// ConversaDrillDown — painel inline com 3 seções (WhatsApp / Etiquetas /
// Atributos). Cada seção é uma linha com rótulo à esquerda e conteúdo
// flex-wrap à direita. Sem espaço fantasma. Botão "Abrir no Chatwoot"
// migrou para a coluna #ID.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LabelsChips } from "@/components/reports/labels-chips";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const ATTRS_PER_PAGE = 24;

interface Props {
  row: ConversaRow;
  /** Mantido na interface para retro-compat com chamadas existentes; não usado. */
  accountId?: number;
}

export function ConversaDrillDown({ row }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : null;

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, ATTRS_PER_PAGE);
  const hidden = Math.max(entries.length - visible.length, 0);

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-2 bg-muted/30 px-4 py-3 text-[13px]"
    >
      {/* WhatsApp */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp
        </span>
        <span className="font-mono text-[14px] tabular-nums text-foreground">
          {phone ?? "—"}
        </span>
      </div>

      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </span>
        {row.labels && row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Atributos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos{" "}
          <span className="text-muted-foreground/70 tabular-nums">
            ({entries.length})
          </span>
        </span>
        {entries.length === 0 ? (
          <span className="text-muted-foreground">— sem atributos</span>
        ) : (
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <span
                  key={k}
                  className="inline-flex items-baseline gap-x-1 break-all rounded-md border border-border/30 bg-card px-2 py-0.5"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[12px] text-foreground/90">{raw}</span>
                </span>
              );
            })}
            {hidden > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(true)}
                className="h-7 text-[11px]"
              >
                Ver mais ({hidden})
              </Button>
            ) : null}
            {showAll && entries.length > ATTRS_PER_PAGE ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(false)}
                className="h-7 text-[11px]"
              >
                Recolher
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversaDrillDown;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- conversa-drill-down.test`
Expected: PASS — todos.

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/conversa-drill-down.tsx src/components/reports/__tests__/conversa-drill-down.test.tsx
git commit -m "feat(reports): T8 — drill-down 3 seções inline + sem botão Abrir + sem espaço fantasma"
```

---

## Task 9: ConversasTable refator

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Modify: `src/components/reports/__tests__/conversas-table.test.tsx` (criar se ainda não existe)

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "virtualized data table sticky header focus state cell button".
> Esta é a task mais densa do plan. Subagente deve dividir mentalmente em sub-passos: (a) instalar dep, (b) remover paginação visual, (c) remover colunas labels/actions, (d) #ID clicável, (e) virtualização, (f) cleanup localStorage.

- [ ] **Step 1: Instalar @tanstack/react-virtual**

Run: `npm install @tanstack/react-virtual --save`

- [ ] **Step 2: Tests prep**

Adicionar/atualizar `__tests__/conversas-table.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversasTable } from "@/components/reports/conversas-table";

const row = (id: number, display: number) => ({
  id, display_id: display,
  contact: { id, name: `User ${id}`, phone_number: null, identifier: null, additional_attributes: null },
  inbox: { id: 1, name: "WA" },
  team: { id: null, name: null },
  assignee: { id: null, name: null },
  status: 0, priority: 0,
  created_at: null, last_activity_at: null,
  last_message_type: null, last_message_at: null, last_incoming_at: null, last_outgoing_at: null,
  custom_attributes: null, waiting_seconds: null, open_seconds: null, labels: [],
});

describe("ConversasTable v2", () => {
  it("#ID renderiza como link clicável (a target=_blank)", () => {
    render(
      <ConversasTable
        initialRows={[row(1, 100)]}
        initialCursor={null}
        accountId={9}
        filters={{ period: { start: new Date(), end: new Date() } } as any}
        sortStack={[]}
        onSortStackChange={() => {}}
        onRowCountChange={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: /abrir conversa #100 no chatwoot/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("não renderiza mais coluna Etiquetas no <ColumnsToggle>", () => {
    render(
      <ConversasTable
        initialRows={[row(1, 100)]}
        initialCursor={null}
        accountId={9}
        filters={{ period: { start: new Date(), end: new Date() } } as any}
        sortStack={[]}
        onSortStackChange={() => {}}
        onRowCountChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /colunas/i }));
    expect(screen.queryByText(/etiquetas/i)).not.toBeInTheDocument();
  });

  it("não renderiza coluna Ações", () => {
    render(<ConversasTable {...({ initialRows: [row(1, 100)], initialCursor: null, accountId: 9, filters: { period: { start: new Date(), end: new Date() } }, sortStack: [], onSortStackChange: () => {}, onRowCountChange: () => {} } as any)} />);
    expect(screen.queryByText(/ações/i)).not.toBeInTheDocument();
  });

  it("não renderiza seletor 'por página' nem botão Carregar mais", () => {
    render(<ConversasTable {...({ initialRows: [row(1, 100)], initialCursor: null, accountId: 9, filters: { period: { start: new Date(), end: new Date() } }, sortStack: [], onSortStackChange: () => {}, onRowCountChange: () => {} } as any)} />);
    expect(screen.queryByText(/por página/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it("notifica rowCount via onRowCountChange", () => {
    const cb = jest.fn();
    render(<ConversasTable {...({ initialRows: [row(1, 100), row(2, 101)], initialCursor: null, accountId: 9, filters: { period: { start: new Date(), end: new Date() } }, sortStack: [], onSortStackChange: () => {}, onRowCountChange: cb } as any)} />);
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("banner amarelo quando initialCursor sinaliza > MAX_TABLE_ROWS", () => {
    render(<ConversasTable {...({ initialRows: [row(1, 100)], initialCursor: "next", accountId: 9, filters: { period: { start: new Date(), end: new Date() } }, sortStack: [], onSortStackChange: () => {}, onRowCountChange: () => {} } as any)} />);
    expect(screen.getByText(/refine os filtros/i)).toBeInTheDocument();
  });

  it("click no #ID NÃO toggle drill-down (stopPropagation)", () => {
    render(<ConversasTable {...({ initialRows: [row(1, 100)], initialCursor: null, accountId: 9, filters: { period: { start: new Date(), end: new Date() } }, sortStack: [], onSortStackChange: () => {}, onRowCountChange: () => {} } as any)} />);
    const link = screen.getByRole("link", { name: /abrir conversa #100/i });
    // não há "Detalhes da conversa" antes do click
    expect(screen.queryByRole("region", { name: /detalhes da conversa/i })).not.toBeInTheDocument();
    fireEvent.click(link, { button: 0 });
    // depois do click no #ID o drill-down NÃO abre (link tem stopPropagation)
    expect(screen.queryByRole("region", { name: /detalhes da conversa/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- conversas-table.test`
Expected: FAIL.

- [ ] **Step 4: Implementar (refator grande — abordar em incrementos)**

Princípios:
- **Remover** import de `OpenInChatwoot`, `CustomSelect`, `LabelsChips` (continua importado em outros lugares — só remover se for o único uso aqui).
- **Remover** array entry `labels` em `COLUMNS`.
- **Remover** `buildColumns(accountId)` factory + entry `actions` — `COLUMNS` direto.
- **Substituir** célula `display_id` por componente local `OpenIdLink` que renderiza `<a target="_blank" rel="noopener noreferrer" className="...">#NNN</a>` com classes hover roxas + title + aria-label + `onClick={(e) => e.stopPropagation()}`.
- **Remover** `STORAGE_PAGE_SIZE`, `PAGE_SIZE_OPTIONS`, `PAGE_SIZE_LIMITS`, `PageSizeOption`, `useLocalStorageState<PageSizeOption>`, lógica de `handlePageSizeChange`, `loadMore`, `cursor` state (substituído por `hasMoreFlag` derivado de initialCursor), `<InfiniteScrollSentinel>`.
- **Cleanup** localStorage no mount: `localStorage.removeItem("conversas-table-page-size")`.
- **Adicionar** prop `onRowCountChange?: (n: number) => void` e disparar via useEffect quando rows.length muda.
- **Banner truncated**: `initialCursor !== null` → mostrar banner amarelo no toolbar.
- **Virtualização**: nova estrutura — wrapper `<div ref={parentRef} className="overflow-auto" style={{ maxHeight: ... }}>` com `useVirtualizer({ count: sortedRows.length, getScrollElement: () => parentRef.current, estimateSize: () => 48, overscan: 8, measureElement: el => el.getBoundingClientRect().height })`. tbody renderiza um espaçador `<tr style={{ height: rowVirtualizer.getTotalSize() }}>` antes E translates as rows visíveis com `transform: translateY(virtualRow.start)`.
  - **Atenção**: virtualização em `<table>` com sticky header é tricky. Recomendação prática: usar **windowing por padding-top/padding-bottom** em vez de transform — `<tbody><tr style={{ height: padTop }} /><visible rows /><tr style={{ height: padBottom }} /></tbody>`. Mantém `<table>` semântico, sticky thead funciona.

```tsx
// Esqueleto (subagente preenche detalhes)

import { useVirtualizer } from "@tanstack/react-virtual";

// dentro do componente
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: sortedRows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
  overscan: 8,
  measureElement: (el) => el?.getBoundingClientRect().height ?? 48,
});

const virtualItems = rowVirtualizer.getVirtualItems();
const totalSize = rowVirtualizer.getTotalSize();
const padTop = virtualItems[0]?.start ?? 0;
const padBottom = totalSize - (virtualItems.at(-1)?.end ?? 0);

// no JSX:
<div ref={parentRef} className="hidden lg:block overflow-x-auto overflow-y-auto ..." style={{ maxHeight: ... }}>
  <Table>
    <TableHeader className="sticky top-0 z-10 ...">{/* unchanged */}</TableHeader>
    <TableBody>
      {padTop > 0 && <tr style={{ height: padTop }} aria-hidden />}
      {virtualItems.map((virtualRow) => {
        const row = sortedRows[virtualRow.index];
        const expanded = expandedIds.has(row.id);
        return (
          <Fragment key={row.id}>
            <TableRow
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              onClick={() => toggleExpand(row.id)}
              className="cursor-pointer hover:bg-muted/30"
              aria-expanded={expanded}
            >
              {/* render columns */}
            </TableRow>
            {expanded && (
              <TableRow ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="bg-muted/30">
                <TableCell colSpan={orderedColumns.length} className="p-0">
                  <ConversaDrillDown row={row} />
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        );
      })}
      {padBottom > 0 && <tr style={{ height: padBottom }} aria-hidden />}
    </TableBody>
  </Table>
</div>
```

> **Atenção**: `data-index` precisa coincidir com o `virtualRow.index` para o `measureElement` agrupar fragmentos quando o drill-down expande. Em `react-virtual` o id é o data-attribute via `useVirtualizer.measureElement` que lê `getAttribute('data-index')`.

OpenIdLink helper (no mesmo arquivo):

```tsx
function OpenIdLink({
  accountId,
  displayId,
  className,
}: {
  accountId: number;
  displayId: number;
  className?: string;
}) {
  const href = chatwootConversationUrl(accountId, displayId);
  return (
    <a
      data-tour="open-action"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      title={`Abrir conversa #${displayId} no Chatwoot`}
      aria-label={`Abrir conversa #${displayId} no Chatwoot`}
      className={cn(
        "inline-flex items-center rounded-md border border-border/50 px-2 py-0.5 font-mono text-[13px] tabular-nums text-muted-foreground transition-colors",
        "hover:border-violet-500/60 hover:bg-violet-500/5 hover:text-violet-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-1",
        className,
      )}
    >
      #{displayId}
    </a>
  );
}
```

`COLUMNS` ajustado:

```ts
const COLUMNS: ColumnDef[] = [
  { key: "expand", ... }, // unchanged
  {
    key: "display_id",
    label: "#",
    defaultVisible: true,
    defaultOrder: 0,
    sortable: true,
    className: "w-24",
    compareFn: (a, b) => a.display_id - b.display_id,
    render: (row) => null, // re-renderizado inline pelo body porque precisa de accountId
  },
  // ... demais (sem labels, sem actions)
];
```

No body da tabela, célula `display_id`:

```tsx
{col.key === "display_id" ? (
  <TableCell key={col.key} onClick={(e) => e.stopPropagation()}>
    <OpenIdLink accountId={accountId} displayId={row.display_id} />
  </TableCell>
) : ...}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- conversas-table.test`
Expected: PASS — 7 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Smoke render manual (jsdom-friendly)**

Run: `npm test -- conversas-table.test`
Expected: ainda PASS após pequenos ajustes.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/reports/conversas-table.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "feat(reports): T9 — virtualização (@tanstack/react-virtual) + #ID clicável + remove paginação/Etiquetas/Ações"
```

---

## Task 10: Loading overlay polish

**Files:**
- Modify: `src/components/reports/loading-overlay.tsx`
- Test: ajustar `src/components/reports/__tests__/loading-overlay.test.tsx` se existir; senão adicionar.

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "loading overlay subtle blur progressive disclosure motion-safe".

- [ ] **Step 1: Test**

```tsx
import { render, screen } from "@testing-library/react";
import { LoadingOverlay } from "@/components/reports/loading-overlay";

describe("LoadingOverlay", () => {
  it("não renderiza quando show=false", () => {
    render(<LoadingOverlay show={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza com label default", () => {
    render(<LoadingOverlay show={true} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Carregando conversas...");
  });

  it("aceita label customizado", () => {
    render(<LoadingOverlay show={true} label="Buscando..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Buscando...");
  });
});
```

- [ ] **Step 2: Implementar**

```tsx
// src/components/reports/loading-overlay.tsx
"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  show: boolean;
  label?: string;
  className?: string;
}

export function LoadingOverlay({
  show,
  label = "Carregando conversas...",
  className,
}: LoadingOverlayProps) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/70 backdrop-blur-md",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2
          className="h-8 w-8 animate-spin text-violet-400 motion-safe:[animation-duration:1.2s]"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- loading-overlay`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/loading-overlay.tsx src/components/reports/__tests__/loading-overlay.test.tsx
git commit -m "feat(reports): T10 — LoadingOverlay polish (label dinâmico + blur-md + fade-in)"
```

---

## Task 11: Tour onboarding atualizado

**Files:**
- Modify: `src/lib/tours/conversas-tour.ts`

> Antes: invocar `ui-ux-pro-max:ui-ux-pro-max` com query "onboarding tour first-impression placement".

- [ ] **Step 1: Reescrever**

```ts
// src/lib/tours/conversas-tour.ts
import type { TourConfig } from "@/components/tour/tour-provider";

export const conversasTour: TourConfig = {
  id: "conversas-v2", // bump pra forçar re-onboarding
  title: "Tour do relatório de Conversas",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='period']",
      title: "Período",
      description:
        "Escolha um período rápido (Hoje, Esta semana, Este mês, Todos) ou clique em Personalizado para definir um intervalo específico.",
      placement: "bottom",
    },
    {
      id: "search",
      targetSelector: "[data-tour='search']",
      title: "Busca rápida",
      description:
        "Digite e pressione Enter para buscar em nome, WhatsApp, documento, departamento, atendente, status, prioridade, etiquetas e atributos.",
      placement: "bottom",
    },
    {
      id: "filters-chip",
      targetSelector: "[data-tour='filters-chip']",
      title: "Filtros avançados",
      description:
        "Refine por caixa de entrada, departamento, atendente, status, prioridade e etiquetas. Modos Simples e Avançado (E/OU).",
      placement: "bottom",
    },
    {
      id: "sorting-chip",
      targetSelector: "[data-tour='sorting-chip']",
      title: "Ordenação",
      description: "Combine múltiplos critérios de ordenação em sequência.",
      placement: "bottom",
    },
    {
      id: "export",
      targetSelector: "[data-tour='export']",
      title: "Exportar",
      description:
        "Gera planilha XLSX com todos os resultados (até 50.000), respeitando filtros, ordenação e busca.",
      placement: "bottom",
    },
    {
      id: "presets",
      targetSelector: "[data-tour='presets']",
      title: "Filtros salvos",
      description:
        "Salve combinações de filtros + ordenação como presets favoritos. Use o botão Atalhos (raio) para filtros rápidos do dia a dia.",
      placement: "bottom",
    },
    {
      id: "columns",
      targetSelector: "[data-tour='columns']",
      title: "Colunas visíveis",
      description:
        "Mostre ou oculte colunas conforme sua necessidade. Suas preferências ficam salvas localmente.",
      placement: "top",
    },
    {
      id: "table",
      targetSelector: "[data-tour='table']",
      title: "Lista de conversas",
      description:
        "Cada linha mostra contato, departamento, atendente, status, prioridade e tempos. Cores indicam urgência (âmbar acima de 4h, vermelho acima de 24h).",
      placement: "top",
    },
    {
      id: "drill-down",
      targetSelector: "[data-tour='drill-down']",
      title: "Drill-down inline",
      description:
        "Clique em qualquer parte da linha (exceto o número) para expandir e ver WhatsApp, etiquetas e atributos.",
      placement: "right",
    },
    {
      id: "open-action",
      targetSelector: "[data-tour='open-action']",
      title: "Abrir no Chatwoot",
      description:
        "Clique no número da conversa (#) para abrir direto no Chatwoot, em uma nova aba.",
      placement: "right",
    },
    {
      id: "refresh",
      targetSelector: "[data-tour='refresh']",
      title: "Atualizar dados",
      description:
        "Os dados são cacheados por alguns minutos para acelerar a navegação. Use Atualizar para forçar a busca dos dados mais recentes.",
      placement: "left",
    },
  ],
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tours/conversas-tour.ts
git commit -m "feat(tour): T11 — conversas-v2 (remove page-size, adiciona export, atualiza search/drill-down/open-action)"
```

---

## Task 12: open-in-chatwoot.tsx — investigar e potencialmente deletar

**Files:**
- Possibly delete: `src/components/reports/open-in-chatwoot.tsx`

- [ ] **Step 1: Procurar consumidores**

Run: `grep -rln "OpenInChatwoot\|open-in-chatwoot" src --include="*.ts" --include="*.tsx"`

- [ ] **Step 2: Decisão**

- Se único consumidor for `conversas-table.tsx` (já refatorado pra não usar) e `conversa-drill-down.tsx` (já refatorado pra não usar): deletar.
- Se houver outro consumidor (ex.: `recent-conversations-table.tsx`): manter.

- [ ] **Step 3: Aplicar**

Se deletar:
```bash
rm src/components/reports/open-in-chatwoot.tsx
git add -u src/components/reports/open-in-chatwoot.tsx
git commit -m "chore(reports): T12 — remove open-in-chatwoot (substituído por #ID clicável)"
```

Se manter: skip commit.

---

## Task 13: Bump versão + deps + CHANGELOG + STATUS

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/STATUS.md`

> **CRITICAL**: rodar `git fetch origin main && git status` antes. Se v0.16.0 do nex-suite ou v0.17.0 do powerbi entraram em main → rebase + ajustar versão dinamicamente (v0.17.0 default; v0.18.0 se v0.17.0 estiver tomado).

- [ ] **Step 1: Sync remoto**

Run: `git fetch origin main && git log --oneline HEAD..origin/main`
Se houver commits novos: `git pull --rebase origin main` + resolver conflitos.

- [ ] **Step 2: Decidir versão**

Run: `cat package.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('version'))"`
Se < 0.17.0 → minha release vira **v0.17.0**.
Se já 0.17.0 (powerbi pegou) → minha release vira **v0.18.0**.

- [ ] **Step 3: Bump package.json**

Editar manualmente o campo `"version"`.

- [ ] **Step 4: CHANGELOG.md append**

Inserir abaixo do header:

```md
## [v0.17.0] 2026-05-01 — Conversas Revamp (export + busca + drill-down + virtualização)

### Implementação
- Botão **Exportar** no toolbar — gera XLSX (até 50.000 linhas) respeitando filtros, ordenação e busca; colunas dinâmicas por chave de `custom_attributes` (top-50 mais frequentes), header congelado, datas pt-BR, status/prioridade traduzidos.
- **Busca server-side**: cláusula ILIKE OR sobre nome, WhatsApp, documento, estado, departamento, atendente, status (texto), prioridade (texto), etiquetas e atributos. Trigger: Enter. Sanitize de `%`/`_`/`\` + cap 256 chars.
- **Drill-down redesenhado**: 3 seções inline (WhatsApp / Etiquetas / Atributos), sem espaço fantasma, sem botão "Abrir" duplicado.
- **Coluna #ID clicável**: substitui coluna "Ações" — border cinza fininho, hover roxo, tooltip "Abrir conversa", abre Chatwoot em nova aba.
- **Coluna Etiquetas removida da tabela** (continua no drill-down e no filtro do `<FiltersDialog>`).
- **Sem paginação visual**: removido seletor "100 / Todos" e botão "Carregar mais". Backend traz tudo até MAX_TABLE_ROWS=10.000; banner amarelo se exceder.
- **Virtualização** com `@tanstack/react-virtual` v3 — thead sticky preservado, drill-down expand mensurado dinamicamente.
- **LoadingOverlay** com label dinâmico ("Carregando conversas..." / "Buscando..." / "Gerando planilha...") + blur mais forte + fade-in motion-safe.
- **Tour `conversas-v2`** atualizado: novo step "Exportar"; descrições de search/drill-down/open-action rescritas; step `page-size` removido.

### Compat
- `localStorage["conversas-table-page-size"]` é limpo automaticamente no mount.
- `chatwootConversationUrl(accountId, displayId)` mantém assinatura — quando v0.16.0 entregar URL per-account, o helper passa a ler do banco internamente.

### Notas
- Limite de export: 50.000 linhas; toast de warning quando excede.
- Limite de tabela: 10.000 linhas renderizadas; banner pede refinar filtros se passar.
- Cap de 50 colunas dinâmicas no XLSX (top-N por frequência); excesso reportado em log do Server Action.
```

- [ ] **Step 5: docs/STATUS.md**

Atualizar header pra v0.17.0 (ou v0.18.0).

- [ ] **Step 6: Commit**

```bash
git add package.json CHANGELOG.md docs/STATUS.md
git commit -m "chore(release): bump v0.17.0 — Conversas Revamp"
```

---

## Task 14: Verification + push

**Files:** none (orchestration)

- [ ] **Step 1: Verification full**

Run: `npm run typecheck && npm test`
Expected: typecheck 0 errors, jest todos PASS.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS, sem warnings novos.

- [ ] **Step 3: Sync final**

Run: `git fetch origin main && gh run list --limit 5`
Se há build de outro agente em curso: aguardar terminar.
Se há commits remotos novos: `git pull --rebase origin main`.

- [ ] **Step 4: Push**

Run: `git push origin main`

- [ ] **Step 5: Watch CI**

Run: `gh run watch <id>` (último run após push).
Aguardar SUCCESS.

- [ ] **Step 6: Portainer fix automático**

Padrão do projeto (ver runbook `docs/runbooks/portainer-fix.md` se existir, ou commits recentes): após CI verde, há ação manual ou workflow `portainer-fix` que atualiza APP_VERSION.

Run: `gh workflow run portainer-fix.yml` (se workflow existir) OU avisar usuário.

- [ ] **Step 7: Verificar /api/health**

Run: `curl -s https://<dominio>/api/health | jq` (substituir pelo domínio real)
Expected: `version: "0.17.0"`, `status: "ok"`, `db.status: "ok"`, `redis.status: "ok"`.

- [ ] **Step 8: Atualizar HISTORY.md**

```bash
echo "$(date +"%Y-%m-%d %H:%M") | agent=claude-conversas-v017 | run=<run-id> | scope=release | summary=v0.17.0 LIVE — Conversas Revamp (export XLSX + busca server-side + drill-down inline + #ID clicável + virtualização)" >> docs/agents/HISTORY.md
git add docs/agents/HISTORY.md
git commit -m "docs(agents): registra v0.17.0 LIVE em HISTORY"
git push origin main
```

- [ ] **Step 9: Encerrar sessão**

```bash
rm docs/agents/active/claude-conversas-v017.md
git add -u docs/agents/active/claude-conversas-v017.md
git commit -m "docs(agents): encerra sessão claude-conversas-v017"
git push origin main
```

- [ ] **Step 10: Avisar usuário**

Mensagem ao João: "v0.17.0 LIVE em produção. Pode testar /relatorios/conversas — os 7 ajustes do briefing aplicados."

---

## Self-Review

### Spec coverage
- ✓ Export XLSX (T4-T6)
- ✓ Drill-down 3 seções inline (T8)
- ✓ Coluna #ID clicável (T9)
- ✓ Remove coluna Etiquetas + Ações (T9)
- ✓ Busca server-side (T1, T2, T3)
- ✓ Sem paginação visual + virtualização (T9)
- ✓ Loading overlay polish (T10)
- ✓ Tour atualizado (T11)
- ✓ Cleanup runtime (T9 — localStorage)
- ✓ Coordenação multi-agente (T13, T14)
- ✓ Audit log de export (T5)
- ✓ Translation pt-BR centralizada (T1)

### Placeholder scan
- Sem TBD/TODO restante; cada step tem código completo.
- T7 (AdvancedFilters) propositalmente curta (cabos diretos) — descrita o suficiente pro subagente sem bloat.
- T12 condicional (delete vs manter) — decisão tomada inline pelo subagente após grep.

### Type consistency
- `ReportFilters.search` (T2) → herdado em FetchConversasInput (T3) → recebido por exportConversasAction (T5).
- `MAX_EXPORT_ROWS = 50_000` (T5) e `MAX_TABLE_ROWS = 10_000` (T9) explicitamente diferentes.
- `ExportConversasResult.{base64, filename, truncated, droppedAttrCount, error}` (T5) consumido por ExportButton (T6) sem drift.
- `ConversaRow` shape preservado em todos os tests (T4, T5, T8, T9).
- `onRowCountChange` (T9) plumbed via T7 até ExportButton (T6).
- `chatwootConversationUrl(accountId, displayId)` (preservado) — sem mudanças de assinatura.

### Versão dinâmica (achado adicional)
- T13 carrega lógica condicional v0.17.0 → v0.18.0 caso powerbi tenha tomado v0.17.0 antes do meu push. Aceita.

---

## Resumo do double-check

**Pente fino #1 (sobre v1)** — 23 achados aplicados em v2:

1. T2 sem teste de cap 256 chars → adicionado.
2. T2 sem teste de escape `%/_/\` → adicionado.
3. T4 sem teste de objeto/array em custom_attributes → adicionado.
4. T4 sem teste de empty rows → adicionado.
5. T4 sem teste de cap 50 → adicionado.
6. T5 sem teste de truncated flag → adicionado.
7. T5 sem teste de visibility 401 → adicionado.
8. T5 sem auditoria → adicionada via logAudit.
9. T6 sem teste de toast warning → adicionado.
10. T6 sem cleanup de URL.createObjectURL → adicionado setTimeout.
11. T9 não cobria padding-top/bottom strategy de virtualização → reescrito com explicação.
12. T9 não cobria cleanup do localStorage `conversas-table-page-size` → adicionado.
13. T9 não cobria banner truncated → teste + impl.
14. T9 não cobria onRowCountChange → adicionado.
15. T11 step `open-action` precisa apontar pra coluna #ID, não Ações (sumiu) → ajustado.
16. T11 step `drill-down` precisa de descrição "exceto o número" → ajustado.
17. T13 versão dinâmica v0.17/v0.18 → documentado.
18. T13 CHANGELOG não cobria limites + cap → ajustado.
19. T14 portainer-fix workflow run → mencionado.
20. T7 sem mention explícita de plumbing tableRowCount → ajustado.
21. T8 sem teste de empty etiquetas → adicionado.
22. T8 sem teste de empty atributos → adicionado.
23. T0 sem mention de regra "use server" only async exports → adicionado warning em T5.

**Pente fino #2 (sobre v2)** — 18 achados aplicados em v3:

1. T2: incluído ESCAPE '\\' no teste do whereSql.
2. T2: helper sanitizeSearch nomeado sem ambiguidade.
3. T4: pickTopAttributeKeys com tiebreak alfabético explicitado.
4. T4: cap por frequência (top-N) deixado claro nos testes.
5. T4: vazio (`""`) ignorado em counts.
6. T5: file conversas-export-config caso UI precise de MAX_EXPORT_ROWS — guardrail Next.js 16 "use server".
7. T5: error message "Sem conversas para exportar" consistente entre 0 rows e teamScope vazio.
8. T6: aria-busy adicionado.
9. T6: download via Blob com revokeObjectURL adiado 60s.
10. T7: AdvancedFiltersProps tipos novos explicitados.
11. T8: empty state etiquetas e atributos com mensagens distintas.
12. T9: OpenIdLink helper extraído e nomeado.
13. T9: stopPropagation também em onKeyDown.
14. T9: virtualização usa padTop/padBottom (não transform), preservando `<table>` semântico.
15. T9: data-index obrigatório no measureElement.
16. T10: motion-safe:animate-in fade-in adicionado.
17. T11: id bumpado pra forçar re-tour.
18. T13: bloco "Notas" com limites no CHANGELOG.

---

## Aprovação

João Vitor Zanini autorizou autonomia total. Plan v3 consolidado, pronto para execução via `superpowers:subagent-driven-development`. Próximo passo: invocar a sub-skill, dispatch fresh subagent por task, review entre tasks, push final + Portainer + smoke + aviso.
