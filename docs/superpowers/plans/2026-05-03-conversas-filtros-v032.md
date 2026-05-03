# Conversas Filtros v0.32.0 — Plan (v3 final)

> 9 fixes/features no menu de filtros + export. Status: v3 final (passou por pente fino #1 com 20 achados + pente fino #2 com 8 achados).

**Goal:** redesenhar sistema de filtros (Simples + Avançado) — feature nova Documento, refator schema do where-clause (operador per-par), redesign visual, bug fixes do contador, AlertDialog para troca de tabs, export respeita pipeline client.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind v4 · base-ui.

---

## §0. Histórico double-check

### Pente fino #1 (v1 → v2) — 20 achados

1. F1 `MultiSelectCheckbox` aceita `MetaItem[]` (id: number, name) — mapear "cpf"/"cnpj"/"none" pra ids 1/2/3 via tabela ID_TO_OPTION/OPTION_TO_ID.
2. F1 selecionar todos os 3 = não filtra (consistente com inboxIds vazios = todos).
3. F3 `<AlertDialog>` em `src/components/ui/alert-dialog.tsx` existe ✓.
4. F3 timing: `handleTabClick(target)` — se há dados no atual `mode`, abre AlertDialog; senão troca direto.
5. F4 "Limpar todos" sem AlertDialog (já tem AlertDialog na troca; ação direta no rodapé).
6. F5 `showActions={false}` prop ou render condicional — opto por prop nova `hideActions?: boolean` em `<ConditionalFilters>`.
7. F6 contador: `pendingDiff` usa `diffFilterStates(applied, draft, { ignoreMode: true, ignoreSearch: true })`.
8. F7 schema breaking: `decodeConditionGroup` detecta v1 (presença de `combinator` field) e migra pra v2.
9. F7 evaluate left-associative: `((A op1 B) op2 C) op3 D)`.
10. F7 condition-group-codec.ts encode SEMPRE escreve v2.
11. F8 conector chip clicável: `[E]` ↔ `[OU]` (toggle).
12. F8 grupos com `pl-6 border-l-2 border-violet-500/40 bg-muted/20`.
13. F8 ícones: `<Filter h-3.5>` condição, `<FolderOpen h-3.5 text-violet-500>` grupo.
14. F9 `sortStack` server-side: extrair `compareFn` por chave em arquivo lib server-safe (`src/lib/reports/sort-conversas.ts`).
15. F9 `MAX_EXPORT_ROWS=50_000` mantido — pipeline filtra DEPOIS do fetch.
16. F1 chip Documento via `summarize` com IDs numéricos mapeados.
17. F3 hasDataInTab — Simples: 6 arrays + documentTypes; Avançado: `conditionGroup.items.length > 0`.
18. F8 sub-grupo recursivo via componente interno `<ConditionalFiltersInner>`.
19. F7 backward-compat presets localStorage: codec migra ao ler.
20. F1 mobile UI: seção Documento ocupa espaço extra. Aceitável.

### Pente fino #2 (v2 → v3) — 8 achados

1. F1 `<MultiSelectCheckbox>` opções com label `"Com CPF"` / `"Com CNPJ"` / `"Sem documento"`.
2. F3 AlertDialog focus default no `Confirmar`.
3. F7 `applyConditions` se `items.length === 0` retorna rows (passa todas — grupo vazio = no-op).
4. F7 `applyConditions` se `items.length === 1` avalia só o nó (sem connector).
5. F8 conector chip width fixo `w-9` pra evitar shift quando alterna E↔OU.
6. F9 `sortConversasByStack` server: importa helpers de `src/lib/utils/null-compare.ts` (já server-safe).
7. F9 `documentTypes` server: importa `detectDocument` de `src/lib/utils/format-document.ts` (puro server-safe).
8. F9 ExportButton no `<AdvancedFilters>` recebe props extras do parent (ConversasPageClient já tem todos os states necessários).

---

## §1. Decisões finais

### F1 — Filtro Documento (NEW FEATURE)

`FilterState.documentTypes: Array<"cpf" | "cnpj" | "none">`. Default `[]`. URL `?docTypes=cpf,cnpj,none`.

UI no `<FiltersDialog>` Simples:
```tsx
const DOC_OPTIONS: MetaItem[] = [
  { id: 1, name: "Com CPF" },
  { id: 2, name: "Com CNPJ" },
  { id: 3, name: "Sem documento" },
];
const ID_TO_TYPE: Record<number, "cpf" | "cnpj" | "none"> = {1:"cpf",2:"cnpj",3:"none"};
const TYPE_TO_ID: Record<"cpf"|"cnpj"|"none", number> = {cpf:1,cnpj:2,none:3};

<MultiSelectCheckbox
  label="Documento"
  options={DOC_OPTIONS}
  value={draft.documentTypes.map((t) => TYPE_TO_ID[t])}
  onChange={(ids) => updateDraft({ documentTypes: ids.map((id) => ID_TO_TYPE[id]) })}
/>
```

Helper `src/lib/reports/match-document-types.ts`:
```ts
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import { detectDocument } from "@/lib/utils/format-document";

export type DocumentTypeFilter = "cpf" | "cnpj" | "none";

export function matchDocumentTypes(
  rows: ConversaRow[],
  types: DocumentTypeFilter[] | undefined,
): ConversaRow[] {
  if (!types || types.length === 0) return rows;
  return rows.filter((row) => {
    const detected = detectDocument({
      identifier: row.contact.identifier,
      additional_attributes: row.contact.additional_attributes,
    });
    if (detected?.type === "cpf" && types.includes("cpf")) return true;
    if (detected?.type === "cnpj" && types.includes("cnpj")) return true;
    if (!detected && types.includes("none")) return true;
    return false;
  });
}
```

### F2 — Cursor pointer nos tabs Simples/Avançado

`filters-dialog.tsx` `<Button>` dos tabs ganha `cursor-pointer`.

### F3 — AlertDialog ao trocar de tab

State `pendingTab: FilterMode | null` no `<FiltersDialog>`. Click em tab define `pendingTab`. Effect: se tab atual tem dados E `pendingTab !== mode`, abre AlertDialog.

```tsx
const handleTabClick = (target: FilterMode) => {
  if (target === mode) return;
  if (hasDataInTab(mode, draft)) {
    setPendingTab(target);
  } else {
    setMode(target);
  }
};

const handleConfirmTabSwitch = () => {
  clearTabData(mode); // zera filtros do tab origem
  setMode(pendingTab!);
  setPendingTab(null);
};

const handleCancelTabSwitch = () => setPendingTab(null);

<AlertDialog open={pendingTab !== null} onOpenChange={(o) => { if (!o) setPendingTab(null); }}>
  <AlertDialogContent>
    <AlertDialogTitle>Trocar para filtro {pendingTab === "advanced" ? "Avançado" : "Simples"}?</AlertDialogTitle>
    <AlertDialogDescription>
      Você tem seleções no filtro {mode === "simple" ? "Simples" : "Avançado"}. Trocar descartará essa configuração.
      Você só pode usar um modo por vez.
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={handleCancelTabSwitch}>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleConfirmTabSwitch} className="bg-primary">Confirmar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### F4 — "Limpar todos" respeita só o tab ativo

```tsx
const handleClearActiveTab = () => {
  if (mode === "simple") {
    setDraft((d) => ({
      ...d,
      inboxIds: [], teamIds: [], assigneeIds: [],
      statuses: [], priorities: [], labelIds: [],
      documentTypes: [],
    }));
  } else {
    setDraft((d) => ({ ...d, conditionGroup: undefined }));
  }
};
```

### F5 — Remove botões internos do `<ConditionalFilters>`

Componente em `src/components/ui/conditional-filters.tsx` ganha prop `hideActions?: boolean`. Quando `true`, não renderiza rodapé Aplicar/Limpar. Caller (FiltersDialog) controla apply/cancel.

### F6 BUG — Contador "Aplicar (N)" fantasma

`diffFilterStates` parametrizado:
```ts
export interface DiffOptions {
  ignoreMode?: boolean;
  ignoreSearch?: boolean;
}

export function diffFilterStates(a: FilterState, b: FilterState, opts: DiffOptions = {}): number {
  let diff = 0;
  // ... existing checks
  if (!opts.ignoreSearch && (a.search ?? "") !== (b.search ?? "")) diff++;
  if (!opts.ignoreMode && a.mode !== b.mode) diff++;
  // ...
  return diff;
}
```

`<AdvancedFilters>` `pendingDiffExSearch` chama `diffFilterStates(applied, draft, { ignoreMode: true, ignoreSearch: true })`.

### F7 ARQUITETURAL — Operador E/OU per-par

Schema novo:
```ts
export interface ConditionGroupItem {
  /** Operador relativo ao item ANTERIOR. undefined no primeiro item. */
  connector?: "AND" | "OR";
  node: Condition | ConditionGroup;
}
export interface ConditionGroup {
  items: ConditionGroupItem[];
}
```

`applyConditions` left-associative:
```ts
function evaluateGroup(row, group) {
  if (!group.items || group.items.length === 0) return true;
  const evalNode = (node: Condition | ConditionGroup) =>
    isGroup(node) ? evaluateGroup(row, node) : evaluateCondition(row, node);

  let result = evalNode(group.items[0].node);
  for (let i = 1; i < group.items.length; i++) {
    const item = group.items[i];
    const value = evalNode(item.node);
    result = item.connector === "OR" ? (result || value) : (result && value);
  }
  return result;
}
```

Codec v2 — `decodeConditionGroup`:
```ts
function isV1Schema(parsed: any): boolean {
  return parsed && "combinator" in parsed && Array.isArray(parsed.conditions);
}

function migrateV1ToV2(v1: any): ConditionGroup {
  const items: ConditionGroupItem[] = v1.conditions.map((node: any, idx: number) => ({
    connector: idx === 0 ? undefined : v1.combinator,
    node: isV1Schema(node) ? migrateV1ToV2(node) : node,
  }));
  return { items };
}

export function decodeConditionGroup(s: string): ConditionGroup | null {
  try {
    const json = base64urlDecode(s);
    const parsed = JSON.parse(json);
    if (parsed?.items && Array.isArray(parsed.items)) {
      return parsed as ConditionGroup; // v2
    }
    if (isV1Schema(parsed)) {
      return migrateV1ToV2(parsed); // v1 → v2
    }
    return null;
  } catch {
    return null;
  }
}
```

### F8 VISUAL — Redesign `<ConditionalFilters>`

Item de Condição:
```tsx
<div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 p-3 hover:border-violet-500/30 transition-colors group">
  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
  <CustomSelect ... /> {/* campo */}
  <CustomSelect ... /> {/* operador */}
  <Input ... />        {/* valor */}
  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 cursor-pointer">
    <Trash2 className="h-3.5 w-3.5" />
  </Button>
</div>
```

Item de Grupo (recursivo):
```tsx
<div className="rounded-lg border border-violet-500/30 bg-muted/20 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
  <div className="flex items-center gap-2 mb-2">
    <FolderOpen className="h-3.5 w-3.5 text-violet-500 shrink-0" aria-hidden />
    <span className="text-xs font-semibold text-violet-500 uppercase tracking-wide">Grupo</span>
    <Button variant="ghost" size="icon" className="ml-auto cursor-pointer opacity-50 hover:opacity-100">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
  <div className="pl-4 border-l-2 border-violet-500/30">
    <ConditionalFiltersInner ... />
  </div>
</div>
```

Conector entre items:
```tsx
{idx > 0 && (
  <div className="flex items-center gap-2 my-1 ml-2">
    <div className="w-px h-3 bg-border" />
    <button
      type="button"
      onClick={() => toggleConnector(idx)}
      className="cursor-pointer inline-flex items-center justify-center w-9 h-5 rounded-md border border-border bg-card text-[10px] font-semibold uppercase tracking-wide transition-colors hover:bg-muted hover:border-violet-500/40 hover:text-violet-500"
      aria-label={`Mudar operador para ${connector === "AND" ? "OU" : "E"}`}
    >
      {connector === "AND" ? "E" : "OU"}
    </button>
    <div className="flex-1 h-px bg-border" />
  </div>
)}
```

### F9 — Export respeita pipeline client

`exportConversasAction` ganha args:
```ts
export interface ExportConversasInput {
  filters: ReportFilters;
  accountId?: number;
  searchClient?: string;
  conditionGroup?: ConditionGroup;
  documentTypes?: DocumentTypeFilter[];
  sortStack?: SortRule[];
}
```

Server pipeline (após `conversasList`):
```ts
let rows = result.data.rows;
if (args.searchClient?.trim()) rows = matchSearchClient(rows, args.searchClient);
if (args.conditionGroup) rows = applyConditions(rows, args.conditionGroup);
if (args.documentTypes?.length) rows = matchDocumentTypes(rows, args.documentTypes);
if (args.sortStack?.length) rows = sortConversasByStack(rows, args.sortStack);
const { buffer, droppedAttrCount } = await buildConversasXlsxBuffer(rows);
```

Helper `src/lib/reports/sort-conversas.ts` (extraído de `conversas-table.tsx`):
```ts
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { SortRule } from "@/components/reports/sorting-dialog";
import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";
import { detectDocument } from "@/lib/utils/format-document";

const COMPARE_BY_KEY: Record<string, (a: ConversaRow, b: ConversaRow) => number> = {
  display_id: (a, b) => a.display_id - b.display_id,
  name: (a, b) => nullableStringCompare(a.contact.name, b.contact.name),
  document: (a, b) => nullableStringCompare(
    detectDocument({ identifier: a.contact.identifier, additional_attributes: a.contact.additional_attributes })?.formatted ?? null,
    detectDocument({ identifier: b.contact.identifier, additional_attributes: b.contact.additional_attributes })?.formatted ?? null,
  ),
  inbox: (a, b) => nullableStringCompare(a.inbox.name, b.inbox.name),
  team: (a, b) => nullableStringCompare(a.team.name, b.team.name),
  assignee: (a, b) => nullableStringCompare(a.assignee.name, b.assignee.name),
  status: (a, b) => a.status - b.status,
  priority: (a, b) => nullableNumberCompare(a.priority, b.priority),
  waiting_seconds: (a, b) => nullableNumberCompare(a.waiting_seconds, b.waiting_seconds),
  open_seconds: (a, b) => nullableNumberCompare(a.open_seconds, b.open_seconds),
  created_at: (a, b) => nullableDateCompare(a.created_at, b.created_at),
  last_activity_at: (a, b) => nullableDateCompare(a.last_activity_at, b.last_activity_at),
};

export function sortConversasByStack(rows: ConversaRow[], stack: SortRule[]): ConversaRow[] {
  if (stack.length === 0) return rows;
  const decorated = rows.map((row, idx) => ({ row, idx }));
  decorated.sort((A, B) => {
    for (const rule of stack) {
      const cmp = COMPARE_BY_KEY[rule.key];
      if (!cmp) continue;
      const factor = rule.direction === "asc" ? 1 : -1;
      const diff = cmp(A.row, B.row) * factor;
      if (diff !== 0) return diff;
    }
    return A.idx - B.idx;
  });
  return decorated.map((d) => d.row);
}
```

`<ConversasTable>` substitui inline sort por `sortConversasByStack(filteredRows, sortStack)` (DRY).

---

## §2. Tasks (4 batches sequenciais)

### Batch A — Schema + lib (TDD)

**Files:** `filter-state.ts`, `apply-conditions.ts`, `condition-group-codec.ts`, `match-document-types.ts` (novo), `sort-conversas.ts` (novo), tests.

**Tasks:**
- T1 `match-document-types.ts` + tests TDD.
- T2 `apply-conditions.ts` schema novo + eval left-associative + tests TDD (incluindo migration v1→v2 OR continuação).
- T3 `condition-group-codec.ts` decodeV1→V2 migration + tests.
- T4 `filter-state.ts`: `documentTypes` field + serialize/deserialize URL `?docTypes=` + `diffFilterStates(opts)` + tests.
- T5 `sort-conversas.ts` extraído + tests.
- 5 commits.

### Batch B — FiltersDialog + AdvancedFilters + AppliedFiltersChips

**Pré:** ui-ux-pro-max.

**Files:** `filters-dialog.tsx`, `advanced-filters.tsx`, `applied-filters-chips.tsx`, tests.

**Tasks:**
- T6 F2 cursor-pointer tabs.
- T7 F1 seção Documento no Simples + chip Documento.
- T8 F3 AlertDialog troca de tabs.
- T9 F4 Limpar tab-ativo.
- T10 F6 contador correto (passa `{ ignoreMode: true, ignoreSearch: true }`).
- T11 F5 passa `hideActions={true}` pro `<ConditionalFilters>`.
- 6 commits.

### Batch C — ConditionalFilters refator (F5+F7+F8)

**Pré:** ui-ux-pro-max — redesign visual significativo.

**Files:** `src/components/ui/conditional-filters.tsx`.

**Tasks:**
- T12 prop `hideActions?: boolean` + render condicional do rodapé.
- T13 refator pra novo schema `items`.
- T14 visual redesign: ícones Filter/FolderOpen, conector chip toggle, indentação grupos, animations.
- 3 commits.

### Batch D — Export pipeline (F9)

**Files:** `conversas-export.ts`, `export-button.tsx`, `advanced-filters.tsx` (passa props), `conversas-page-client.tsx` (passa props), tests.

**Tasks:**
- T15 `exportConversasAction` aceita args extras + replica pipeline server.
- T16 `<ExportButton>` recebe props + passa.
- T17 `<AdvancedFilters>` recebe e propaga.
- T18 `<ConversasPageClient>` agrega tudo.
- 4 commits.

### Batch E (controlador) — Release v0.32.0

- Bump 0.30 → 0.32.
- CHANGELOG entry.
- STATUS.md.
- typecheck full + tests scope.
- Commit release.
- Push origin main (após `gh run list` confirmar sem builds em curso de outro agente).
- portainer-fix --field app_version=v0.32.0.
- Monitor /api/health.

---

## §3. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| F7 schema breaking — URLs/presets v1 | Codec v2 auto-migra v1 |
| F8 redesign quebra UX | TDD + ui-ux-pro-max |
| F9 server replica pipeline mal | Tests e2e |
| Multi-agente — release files conflitam com claude-agente-nex-polish-v031 (v0.31) | Bumpando v0.32 (skip 0.31). Verifica `gh run list` antes do push. |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.30.0`.

---

## §4. Self-Review v3 final

- [x] 9 fixes cobertos (4 batches + release).
- [x] TDD em F1, F4, F6, F7, F9 (lib/server) + smokes em F2, F3, F8.
- [x] ui-ux-pro-max em B (UI tabs/dialog), C (redesign), D (Export minor).
- [x] Codec v1→v2 auto-migra (sem usuários órfãos).
- [x] Coordenação multi-agente: v0.32 skip 0.31, escopo distinto verificado.
- [x] `MultiSelectCheckbox` mapping string↔number documentado.
- [x] AlertDialog disponível em `src/components/ui/alert-dialog.tsx`.
- [x] `sortConversasByStack` extraído pra DRY (server + client usam).
