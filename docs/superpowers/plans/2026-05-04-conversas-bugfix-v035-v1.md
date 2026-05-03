# Conversas Bugfix v0.35.0 — Plan (v1)

> 2 bugs urgentes da v0.32 reportados pelo João em produção.

**Goal:** corrigir XLSX gerando rows fantasma + filtro Documento não filtrando.

---

## §1. Fixes

### F1. Filtro Documento aplica no pipeline da tabela

**Causa:** `conversas-table.tsx:636-650` pipeline não chama `matchDocumentTypes`. Helper existe (`src/lib/reports/match-document-types.ts`) mas não está cabeado na tabela.

**Solução:**
- `<ConversasTable>` recebe nova prop `documentTypes?: Array<"cpf"|"cnpj"|"none">`.
- Adicionar etapa no pipeline `useMemo` ANTES de `applyConditions`:
  ```ts
  const docFilteredRows = useMemo(
    () => matchDocumentTypes(searchedRows, documentTypes),
    [searchedRows, documentTypes],
  );
  // depois:
  const filteredRows = useMemo(() => {
    if (!conditionGroup?.items?.length) return docFilteredRows;
    return applyConditions(docFilteredRows, conditionGroup);
  }, [docFilteredRows, conditionGroup]);
  ```
- `<ConversasPageClient>` passa `documentTypes={filterState.documentTypes}` pro `<ConversasTable>`.

### F2. XLSX export sem rows fantasma

**Causa:** `ws.columns = headers.map(...)` pode causar rows fantasma em algumas configurações do ExcelJS (especialmente com `views: frozen ySplit: 1`).

**Solução:** refator pra usar `ws.addRow(headers)` direto + aplicar widths/format manualmente:
```ts
const ws = wb.addWorksheet("Conversas", {
  views: [{ state: "frozen", ySplit: 1 }],
});

// Header row via addRow direto
const headerRow = ws.addRow(headers);
headerRow.font = { bold: true };
headerRow.fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

// Widths por coluna
headers.forEach((_, idx) => {
  ws.getColumn(idx + 1).width = 18;
});

// Data rows via addRow (igual antes)
for (const r of rows) {
  ws.addRow([...fixed, ...dynamicValues]);
}
```

---

## §2. Tasks

### Task 1 (F2): Refator XLSX builder

**Files:**
- Modify: `src/lib/reports/conversas-xlsx.ts`
- Modify: `src/lib/reports/__tests__/conversas-xlsx.test.ts`

Steps:
- [ ] Failing test que reproduz o bug (1 row de dados → exatamente 2 rows total no buffer):
```ts
it("v0.35: 1 row de dados gera EXATAMENTE 2 rows no XLSX (header + 1)", async () => {
  const { buffer } = await buildConversasXlsxBuffer({ rows: [makeRow()] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Conversas")!;
  expect(ws.actualRowCount).toBe(2);
  expect(ws.rowCount).toBe(2); // sem rows fantasma alocados
});

it("v0.35: 3 rows geram 4 rows total (header + 3)", async () => {
  const { buffer } = await buildConversasXlsxBuffer({ rows: [makeRow(), makeRow(), makeRow()] });
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
- [ ] Refator builder substituindo `ws.columns = ...` por `ws.addRow(headers)` + widths individuais. Frozen pane mantém.
- [ ] Run tests → expect PASS.
- [ ] typecheck clean.
- [ ] Commit:
```bash
git add src/lib/reports/conversas-xlsx.ts src/lib/reports/__tests__/conversas-xlsx.test.ts
git commit -m "fix(conversas): T1 v0.35 — XLSX export sem rows fantasma (refator builder)

Bug reportado pelo João: exportação com poucas rows (1) gerava rows
em branco extras no arquivo final. Causa: ws.columns = [...] em ExcelJS
com views frozen ySplit:1 pode pré-alocar rows fantasma.

Fix: refator pra ws.addRow(headers) direto + widths/format aplicados
manualmente via ws.getColumn(i).width e headerRow.font/fill.

Tests: 3 cenários (0/1/3 rows) validando actualRowCount exato."
```

### Task 2 (F1): Pipeline de Documento na tabela

**Files:**
- Modify: `src/components/reports/conversas-table.tsx` (interface + pipeline)
- Modify: `src/components/reports/conversas-page-client.tsx` (passa prop)
- Modify: `src/components/reports/__tests__/conversas-table.test.tsx` (smoke test do filtro)

Steps:
- [ ] Adicionar prop em `ConversasTableProps`:
```ts
documentTypes?: Array<"cpf" | "cnpj" | "none">;
```

- [ ] Importar:
```ts
import { matchDocumentTypes } from "@/lib/reports/match-document-types";
```

- [ ] Adicionar etapa no pipeline (entre `searchedRows` e `filteredRows`):
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

- [ ] `conversas-page-client.tsx` adiciona prop `documentTypes={filterState.documentTypes}` no `<ConversasTable>`.

- [ ] Test smoke:
```tsx
it("v0.35: documentTypes ['cpf'] filtra rows com CPF apenas", () => {
  const cpfRow = { ...baseRow, contact: { ...baseRow.contact, identifier: "07041511111" } };
  const cnpjRow = { ...baseRow, id: 2, contact: { ...baseRow.contact, identifier: "12345678000195" } };
  render(<ConversasTable {...baseProps} initialRows={[cpfRow, cnpjRow]} documentTypes={["cpf"]} />);
  // Apenas 1 row visível
  expect(screen.getByText(/Mostrando 1-1 de 1/)).toBeInTheDocument();
});
```

- [ ] typecheck + tests verde.
- [ ] Commit:
```bash
git add src/components/reports/conversas-table.tsx src/components/reports/conversas-page-client.tsx src/components/reports/__tests__/conversas-table.test.tsx
git commit -m "fix(conversas): T2 v0.35 — filtro Documento aplica no pipeline da tabela (estava só na UI)

Bug reportado pelo João: filtro Documento (CPF/CNPJ/Sem) na v0.32 ficou
visível na UI (chip + dropdown) mas a tabela NÃO aplicava o filtro.
Causa: pipeline em conversas-table.tsx não chamava matchDocumentTypes;
ConversasTable nem recebia documentTypes como prop.

Fix: ConversasTable ganha prop documentTypes; ConversasPageClient passa
filterState.documentTypes; pipeline ganha etapa docFilteredRows entre
searchedRows e applyConditions. Helper matchDocumentTypes (já existente
desde v0.32 batch A) finalmente cabeado.

detectDocument já identifica CPF/CNPJ por quantidade de dígitos (11/14)
no identifier ou em additional_attributes (chaves cpf/CPF/cnpj/CNPJ/document)."
```

### Task 3: Release v0.35.0

- [ ] Bump 0.34→0.35 (skip 0.33/0.34 dos paralelos).
- [ ] CHANGELOG entry.
- [ ] STATUS.md no topo.
- [ ] typecheck full + tests scope.
- [ ] Commit release.
- [ ] Push.
- [ ] portainer-fix --field app_version=v0.35.0.
- [ ] Monitor /api/health.

---

## §3. Riscos

| Risco | Mitigação |
|---|---|
| F1 detectDocument não pega documentos em formato exótico | Tests cobrem 11/14 dígitos. Edge cases extras ficam pra release futura se reportados. |
| F2 ExcelJS API change quebra | Tests cobrem 0/1/3 rows; refator é defensivo (API estável). |

---

## §4. Self-Review v1
- [ ] 2 bugs cobertos com 2 commits + release.
- [ ] TDD em ambos.
- [ ] Coordenação multi-agente verificada (skip 0.33/0.34).
