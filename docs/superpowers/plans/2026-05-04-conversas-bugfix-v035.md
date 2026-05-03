# Conversas Bugfix v0.35.0 — Plan (v3 final)

> 2 bugs urgentes da v0.32 reportados pelo João. Status: v3 final (passou por pente fino #1 com 10 achados + pente fino #2 com 4 achados).

**Goal:** corrigir XLSX gerando rows fantasma + filtro Documento não filtrando na tabela.

---

## §0. Histórico double-check

### Pente fino #1 (v1 → v2) — 10 achados
1. F1 pipeline aplica SEMPRE (não importa modo) — gating já é feito pelo UI/AlertDialog.
2. F2 test usa `actualRowCount` e `rowCount` (ambos) pra capturar bug.
3. F2 `rows.length === 0` ainda gera 1 row (header).
4. F1 search + docTypes combinam: searchedRows → docFilteredRows.
5. F1 export já recebia `documentTypes` (T15 v0.32) — bug é só na tabela visível.
6. F2 ExcelJS `ws.commit()` não necessário com writeBuffer.
7. F1 test usa `baseRow` existente.
8. F2 `views: frozen` mantido.
9. F2 alternativa `ws.columns` sem keys descartada — mais simples usar `addRow(headers)`.
10. F1 `ConversasTable` props change requer atualizar tests existentes que mockam.

### Pente fino #2 (v2 → v3) — 4 achados
1. F1 — `docFilteredRows` dependência inclui `documentTypes` (mesmo undefined). Se prop muda undefined → array, useMemo recalcula.
2. F2 — `headerRow.fill` API ExcelJS aceita objeto direto (já validado em código atual).
3. F2 — `ws.getColumn(i).width = 18` API: i é 1-based em ExcelJS.
4. F1 — quando `documentTypes === undefined`, `matchDocumentTypes` retorna rows sem alteração (helper já trata).

---

## §1. Decisões finais

### F1 — Filtro Documento aplica no pipeline da tabela

`src/components/reports/conversas-table.tsx`:

1. Adicionar prop em `ConversasTableProps`:
```ts
documentTypes?: Array<"cpf" | "cnpj" | "none">;
```

2. Importar:
```ts
import { matchDocumentTypes } from "@/lib/reports/match-document-types";
```

3. Pipeline (entre `searchedRows` e `filteredRows`):
```ts
const docFilteredRows = useMemo(
  () => matchDocumentTypes(searchedRows, documentTypes),
  [searchedRows, documentTypes],
);

const filteredRows = useMemo(() => {
  if (!conditionGroup?.items?.length) return docFilteredRows;
  return applyConditions(docFilteredRows, conditionGroup);
}, [docFilteredRows, conditionGroup]);
```

4. `<ConversasPageClient>` passa `documentTypes={filterState.documentTypes}` pro `<ConversasTable>`.

### F2 — XLSX export sem rows fantasma

`src/lib/reports/conversas-xlsx.ts:134-152` — substituir bloco:
```ts
const ws = wb.addWorksheet("Conversas", {
  views: [{ state: "frozen", ySplit: 1 }],
});

// REMOVE: ws.columns = headers.map((h) => ({ header: h, key: h, width: 18 }));
// REMOVE: ws.getRow(1).font = ...; ws.getRow(1).fill = ...;

// ADD: header row via addRow direto
const headerRow = ws.addRow(headers);
headerRow.font = { bold: true };
headerRow.fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

// ADD: widths individuais (1-based em ExcelJS)
for (let i = 0; i < headers.length; i++) {
  ws.getColumn(i + 1).width = 18;
}
```

Resto do builder (loop de data rows + writeBuffer) inalterado.

---

## §2. Tasks

### Task 1 (F2): Refator XLSX builder

**Files:**
- Modify: `src/lib/reports/conversas-xlsx.ts`
- Modify: `src/lib/reports/__tests__/conversas-xlsx.test.ts`

Steps:
- [ ] **Failing tests** que reproduzem o bug:

```ts
import ExcelJS from "exceljs";

const makeBaseRow = () => ({...}); // reutiliza existente

it("v0.35: 1 row de dados gera EXATAMENTE 2 rows no XLSX (header + 1)", async () => {
  const { buffer } = await buildConversasXlsxBuffer({ rows: [makeBaseRow()] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Conversas")!;
  expect(ws.actualRowCount).toBe(2);
  expect(ws.rowCount).toBe(2);
});

it("v0.35: 3 rows geram 4 rows total (header + 3)", async () => {
  const { buffer } = await buildConversasXlsxBuffer({
    rows: [makeBaseRow(), { ...makeBaseRow(), id: 2 }, { ...makeBaseRow(), id: 3 }],
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Conversas")!;
  expect(ws.actualRowCount).toBe(4);
});

it("v0.35: 0 rows gera só 1 row (header)", async () => {
  const { buffer } = await buildConversasXlsxBuffer({ rows: [] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Conversas")!;
  expect(ws.actualRowCount).toBe(1);
});
```

- [ ] Run → expect FAIL (bug atual reproduzido).

- [ ] Refator builder per §1 F2.

- [ ] Run → expect PASS.

- [ ] typecheck clean.

- [ ] Commit:
```bash
git add src/lib/reports/conversas-xlsx.ts src/lib/reports/__tests__/conversas-xlsx.test.ts
git commit -m "fix(conversas): T1 v0.35 — XLSX export sem rows fantasma (refator builder)

Bug reportado pelo João: exportação com poucas rows (1) gerava rows
em branco extras no arquivo final. Causa: ws.columns = [...] em ExcelJS
combinado com views frozen ySplit:1 pré-aloca rows fantasma.

Fix: refator pra ws.addRow(headers) direto + widths/format aplicados
via ws.getColumn(i).width e headerRow.font/fill (i 1-based ExcelJS).
Frozen pane mantido.

Tests: 3 cenários (0/1/3 rows) validando actualRowCount + rowCount exatos."
```

### Task 2 (F1): Pipeline de Documento na tabela

**Files:**
- Modify: `src/components/reports/conversas-table.tsx`
- Modify: `src/components/reports/conversas-page-client.tsx`
- Modify: `src/components/reports/__tests__/conversas-table.test.tsx`

Steps:
- [ ] Editar `ConversasTableProps` interface — adicionar:
```ts
/**
 * Filtros por tipo de documento detectado (CPF/CNPJ/Sem). Aplicado client-side
 * no pipeline ANTES de applyConditions. v0.32 F1 cabeou só UI; v0.35 cabeia
 * a pipeline.
 */
documentTypes?: Array<"cpf" | "cnpj" | "none">;
```

- [ ] Adicionar import:
```ts
import { matchDocumentTypes } from "@/lib/reports/match-document-types";
```

- [ ] Pipeline (entre linhas 636 e 650 atuais):
```ts
const searchedRows = useMemo(
  () => matchSearchClient(rows, searchClient),
  [rows, searchClient],
);

// v0.35: aplica filtro Documento (F1 v0.32 estava sem cabeamento na pipeline)
const docFilteredRows = useMemo(
  () => matchDocumentTypes(searchedRows, documentTypes),
  [searchedRows, documentTypes],
);

const filteredRows = useMemo(() => {
  if (!conditionGroup?.items?.length) return docFilteredRows;
  return applyConditions(docFilteredRows, conditionGroup);
}, [docFilteredRows, conditionGroup]);
```

- [ ] Adicionar `documentTypes` na desestruturação dos props no início de `ConversasTable`.

- [ ] Editar `conversas-page-client.tsx` — passar prop:
```tsx
<ConversasTable
  // ... existing props
  documentTypes={filterState.documentTypes}
/>
```

- [ ] **Smoke test** em `conversas-table.test.tsx`:
```tsx
it("v0.35: documentTypes=['cpf'] filtra rows com CPF apenas", () => {
  const cpfRow = {
    ...baseRow,
    id: 1,
    display_id: 1,
    contact: { ...baseRow.contact, identifier: "07041511111" },
  };
  const cnpjRow = {
    ...baseRow,
    id: 2,
    display_id: 2,
    contact: { ...baseRow.contact, identifier: "12345678000195" },
  };
  const noneRow = {
    ...baseRow,
    id: 3,
    display_id: 3,
    contact: { ...baseRow.contact, identifier: null },
  };
  render(<ConversasTable {...baseProps} initialRows={[cpfRow, cnpjRow, noneRow]} documentTypes={["cpf"]} />);
  expect(screen.getByText(/Mostrando 1-1 de 1/)).toBeInTheDocument();
});

it("v0.35: documentTypes=undefined ou [] não filtra (passa todas)", () => {
  const rows = [
    { ...baseRow, id: 1, display_id: 1, contact: { ...baseRow.contact, identifier: "07041511111" } },
    { ...baseRow, id: 2, display_id: 2, contact: { ...baseRow.contact, identifier: null } },
  ];
  render(<ConversasTable {...baseProps} initialRows={rows} documentTypes={undefined} />);
  expect(screen.getByText(/Mostrando 1-2 de 2/)).toBeInTheDocument();
});

it("v0.35: documentTypes=['cpf', 'none'] retorna CPF OU Sem documento", () => {
  const cpfRow = { ...baseRow, id: 1, display_id: 1, contact: { ...baseRow.contact, identifier: "07041511111" } };
  const cnpjRow = { ...baseRow, id: 2, display_id: 2, contact: { ...baseRow.contact, identifier: "12345678000195" } };
  const noneRow = { ...baseRow, id: 3, display_id: 3, contact: { ...baseRow.contact, identifier: null } };
  render(<ConversasTable {...baseProps} initialRows={[cpfRow, cnpjRow, noneRow]} documentTypes={["cpf", "none"]} />);
  expect(screen.getByText(/Mostrando 1-2 de 2/)).toBeInTheDocument();
});
```

- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
```bash
git add src/components/reports/conversas-table.tsx src/components/reports/conversas-page-client.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "fix(conversas): T2 v0.35 — filtro Documento aplica no pipeline da tabela (estava só na UI)

Bug reportado pelo João: filtro Documento (CPF/CNPJ/Sem) na v0.32 ficou
visível na UI (chip + dropdown + propagado pro Export) mas a tabela
NÃO aplicava o filtro. Causa: pipeline em conversas-table.tsx não
chamava matchDocumentTypes; ConversasTable nem recebia documentTypes
como prop.

Fix: ConversasTable ganha prop documentTypes; ConversasPageClient passa
filterState.documentTypes; pipeline ganha etapa docFilteredRows entre
searchedRows e applyConditions. Helper matchDocumentTypes (já existente
desde v0.32 batch A) finalmente cabeado.

detectDocument identifica CPF/CNPJ por quantidade de dígitos (11/14)
no identifier ou em additional_attributes (chaves cpf/CPF/cnpj/CNPJ/document)."
```

### Task 3: Release v0.35.0

- [ ] Bump 0.34→0.35 (skip 0.33 multitenant + 0.34 dashboard-chart-fix).
- [ ] CHANGELOG entry.
- [ ] STATUS.md no topo.
- [ ] typecheck full + tests scope.
- [ ] Commit release.
- [ ] Push.
- [ ] portainer-fix --field app_version=v0.35.0.
- [ ] Monitor /api/health.

---

## §3. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| F1 detectDocument falha em formato exótico | Tests cobrem CPF/CNPJ/null. Edge cases extras em release futura. |
| F2 ExcelJS API change | Tests com 0/1/3 rows; refator defensivo. |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.32.0`.

---

## §4. Self-Review v3 final

- [x] 2 bugs cobertos com 2 commits + release.
- [x] TDD em ambos.
- [x] Coordenação multi-agente verificada (skip 0.33/0.34).
- [x] Pipeline correto: search → docTypes → conditionGroup → sort → slice.
- [x] `documentTypes` undefined OK (matchDocumentTypes trata).
