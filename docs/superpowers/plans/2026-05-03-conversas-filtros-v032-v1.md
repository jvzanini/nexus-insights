# Conversas Filtros v0.32.0 — Plan (v1)

> 9 fixes/features no menu de filtros de /relatorios/conversas após feedback do João.

**Goal:** redesenhar o sistema de filtros (Simples + Avançado) com features novas, bug fixes e refator arquitetural do where-clause builder.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 · base-ui.

---

## §1. Fixes (9 itens)

### F1 NEW FEATURE — Filtro "Documento" no Simples
- Adicionar seção `Documento` no `<FiltersDialog>` Simples (após `Etiquetas`).
- 3 opções multi-select binárias: `Com CPF`, `Com CNPJ`, `Sem documento`.
- Schema: `FilterState.documentTypes: Array<"cpf" | "cnpj" | "none">`.
- Lógica: usa `detectDocument()` existente em `src/lib/utils/format-document.ts`. OR entre opções selecionadas.
- Helper novo: `src/lib/reports/match-document-types.ts` (`matchDocumentTypes(rows, types)`).
- Chip aplicado: "Documento: CPF +1" via `summarize()` padrão.
- URL: `?docTypes=cpf,cnpj,none`.

### F2 — Cursor pointer nos tabs Simples/Avançado
- Tabs `<Button>` em `filters-dialog.tsx` ganham `cursor-pointer`.

### F3 — AlertDialog ao trocar de tab quando há dados
- Tab clicável sempre.
- Se trocar de Simples→Avançado COM seleções no Simples → AlertDialog "Você selecionou filtros no Simples. Trocar para Avançado descartará essa seleção. Confirma?". Botões: `Confirmar` / `Cancelar` / `X`.
- Mesma lógica inverso (Avançado→Simples com `conditionGroup` não-vazio).
- Confirmar: limpa tab origem + ativa destino. Cancelar/X: mantém origem.
- Componente: usa `<AlertDialog>` de base-ui ou shadcn (verificar disponível em `src/components/ui/alert-dialog.tsx`).

### F4 — "Limpar todos" respeita só o tab ativo
- Atual: zera Simples + Avançado.
- Desejado: se tab ativo é Simples → limpa só inboxIds/teamIds/etc + documentTypes; se Avançado → limpa só conditionGroup.

### F5 — Remove botões internos `<Aplicar>` / `<Limpar>` do `<ConditionalFilters>`
- Componente em `src/components/ui/conditional-filters.tsx` tem rodapé com Aplicar/Limpar.
- Remove esses botões — só os do `<FiltersDialog>` rodapé prevalecem.
- `<ConditionalFilters>` emite `onChange(group)` continuamente; o caller (FiltersDialog) controla apply/cancel.

### F6 BUG — Contador "Aplicar (N)" mostra valores fantasmas
- **Causa identificada:** `diffFilterStates` em `filter-state.ts:147` inclui `if (a.mode !== b.mode) diff++` — quando user muda tab Simples↔Avançado, `mode` muda, `diff` pula +1 (mesmo sem outros filtros).
- **Fix:** pendingDiff ignora `mode` — se as tabs forem trocadas sem mudança real de filtros, contador fica 0.
- Implementação: criar `diffFilterStatesIgnoringMode` ou parametrizar `diffFilterStates({ ignoreMode: true })`.
- `pendingDiffExSearch` em `advanced-filters.tsx:178-181` chama o novo (ignoreMode + ignoreSearch).

### F7 ARQUITETURAL — Operador E/OU per-par no Avançado (refator schema)
- Atual: `ConditionGroup { combinator: "AND" | "OR", conditions: [...] }` — operador GLOBAL.
- Desejado: cada par de irmãos tem operador próprio.
- Novo schema:
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
- Avaliação: left-associative. `(((A op1 B) op2 C) op3 D)`. Documentar.
- `applyConditions` reescrito.
- `condition-group-codec.ts` ganha versão `v2` (codec migra `combinator`+`conditions` legacy → `items` no decode quando detecta v1).
- BREAKING: URLs `?cg=...` antigas com schema v1 são auto-migradas; presets em localStorage idem.

### F8 VISUAL — Redesign do `<ConditionalFilters>`
- Ícones distinguindo:
  - Condição: `<Filter className="h-3.5 w-3.5">` ou similar.
  - Grupo: `<FolderOpen className="h-3.5 w-3.5 text-violet-500">`.
- Conector visual entre items: linha vertical conectando + chip pequeno do operador `[E]` ou `[OU]` clicável (toggle).
- Hover effects: items destacam com border-violet sutil.
- Grupos têm `bg-muted/30 border-l-2 border-violet-500/40` pra diferenciar.
- Animations sutis (motion-safe fade-in ao adicionar/remover).
- Indentação clara em sub-grupos.
- Estados:
  - Empty: "Nenhuma condição. Adicione uma condição ou um grupo para começar."
  - 1 item: sem conector visível.
  - 2+ items: conectores entre cada par.
- "Adicionar condição"/"Adicionar grupo" mantém botões.

### F9 NEW — Export respeita searchClient + conditionGroup + documentTypes + sortStack
- Atual: `exportConversasAction` usa só `ReportFilters` server-side.
- Desejado: export = tabela visível.
- Server Action ganha:
  ```ts
  exportConversasAction({
    filters: ReportFilters;
    accountId?: number;
    searchClient?: string;
    conditionGroup?: ConditionGroup;
    documentTypes?: Array<"cpf" | "cnpj" | "none">;
    sortStack?: SortRule[];
  })
  ```
- Server replica pipeline:
  1. `conversasList(...)` busca rows.
  2. `matchSearchClient(rows, searchClient)` se searchClient.
  3. `applyConditions(rows, conditionGroup)` se mode=advanced.
  4. `matchDocumentTypes(rows, documentTypes)` se documentTypes.
  5. Sort com `sortStack` (replica lógica de `conversas-table.tsx`).
  6. `buildConversasXlsxBuffer(rows)`.
- `<ExportButton>` recebe novos props + passa.
- `<AdvancedFilters>` passa do parent (`ConversasPageClient` tem todos esses states).

---

## §2. File Structure

| Arquivo | Mudança |
|---|---|
| `src/lib/reports/filter-state.ts` | F1 + F6: `documentTypes` + `diffFilterStates(opts)` ignoreMode/ignoreSearch. |
| `src/lib/utils/apply-conditions.ts` | F7: schema novo `ConditionGroup { items[] }` + eval left-associative. |
| `src/lib/reports/condition-group-codec.ts` | F7: v2 codec + auto-migrate v1. |
| `src/lib/reports/match-document-types.ts` (novo) | F1: helper. |
| `src/lib/reports/__tests__/match-document-types.test.ts` (novo) | F1 TDD. |
| `src/lib/utils/__tests__/apply-conditions.test.ts` | F7: tests novos schema. |
| `src/lib/reports/__tests__/filter-state.test.ts` | F1+F6+F7 tests. |
| `src/components/reports/filters-dialog.tsx` | F1 + F2 + F3 + F4 + F6 (parcial). |
| `src/components/reports/advanced-filters.tsx` | F6 contador correto + passa documentTypes. |
| `src/components/reports/applied-filters-chips.tsx` | F1 chip Documento. |
| `src/components/reports/conversas-page-client.tsx` | F9 passa props extras pro Export + passa documentTypes pro pipeline. |
| `src/components/reports/conversas-table.tsx` | F1 documentTypes na pipeline + F9 (nada — pipeline já passa). |
| `src/components/ui/conditional-filters.tsx` | F5 + F7 + F8. |
| `src/lib/actions/reports/conversas-export.ts` | F9 server action. |
| `src/components/reports/export-button.tsx` | F9 passa props. |
| `package.json` | Bump 0.30→0.32. |
| `CHANGELOG.md` | Entrada v0.32. |
| `docs/STATUS.md` | Release v0.32 no topo. |

---

## §3. Tasks (4 batches sequenciais)

### Batch A: Schema + lib (F1 schema, F6 diff, F7 schema + codec, F1 helper)

**Files:**
- `src/lib/reports/filter-state.ts`
- `src/lib/utils/apply-conditions.ts`
- `src/lib/reports/condition-group-codec.ts`
- `src/lib/reports/match-document-types.ts` (novo)
- Tests correspondentes.

**Tarefas:**
1. F1 schema: `FilterState.documentTypes: Array<"cpf" | "cnpj" | "none">` (default `[]`); serialize/deserialize URL `?docTypes=cpf,cnpj,none`; diff inclui.
2. F6: `diffFilterStates(a, b, opts?: { ignoreMode?: boolean; ignoreSearch?: boolean })`. `ignoreMode` pula linha 147; `ignoreSearch` pula linha 146.
3. F7 schema: `ConditionGroup { items: ConditionGroupItem[] }` com `ConditionGroupItem { connector?, node }`. `applyConditions` left-associative.
4. F7 codec v2: `encodeConditionGroup(group, version=2)` + `decodeConditionGroup(s)` detecta v1 (presença de `combinator`/`conditions`) e migra: cada item antigo vira `{ connector: prevCombinator, node }` (onde `prevCombinator` é o `combinator` global do grupo, undefined no primeiro item).
5. F1 helper `matchDocumentTypes(rows, types)`: filtra rows por tipo de documento detectado via `detectDocument()`.
6. Tests TDD em todos.
7. Commits separados por arquivo.

### Batch B: FiltersDialog (F1 UI, F2 cursor, F3 AlertDialog, F4 limpar tab, F5 remove botões internos, F6 contador)

**Pré:** ui-ux-pro-max obrigatória.

**Files:**
- `src/components/reports/filters-dialog.tsx`
- `src/components/reports/advanced-filters.tsx` (contador correto + passa documentTypes pro `<FiltersDialog>` e pro `<AppliedFiltersChips>`)
- `src/components/reports/applied-filters-chips.tsx` (chip Documento)

**Tarefas:**
1. F2: `cursor-pointer` nos `<Button>` dos tabs Simples/Avançado.
2. F3: AlertDialog quando trocar tab com dados:
   - State `pendingTab: FilterMode | null`. Click em tab define `pendingTab`.
   - Effect: se `pendingTab !== mode` E `hasDataInCurrentTab(mode)`, abre AlertDialog. Senão troca direto.
   - Confirmar: `clearTab(mode); setMode(pendingTab); setPendingTab(null)`.
   - Cancelar/X: `setPendingTab(null)`.
3. F4: `handleClear` (rodapé) limpa só o tab ativo:
   - Se `mode === "simple"`: zera `inboxIds/teamIds/assigneeIds/statuses/priorities/labelIds/documentTypes`.
   - Se `mode === "advanced"`: zera `conditionGroup`.
4. F5: passa `showActions={false}` (prop nova) pro `<ConditionalFilters>` ou rendererização condicional dos botões internos. Refator do `<ConditionalFilters>` no Batch C.
5. F1: nova seção "Documento" no Simples, multi-select de 3 opções:
   - `<MultiSelectCheckbox>` com `[{ value: "cpf", label: "Com CPF" }, { value: "cnpj", label: "Com CNPJ" }, { value: "none", label: "Sem documento" }]`.
6. F6: contador "Aplicar (N)" usa `diffFilterStates(applied, draft, { ignoreMode: true, ignoreSearch: true })` — não pula +1 ao trocar tab sem mudanças.
7. TDD para F2, F3, F4, F6.
8. Commits separados por F#.

### Batch C: ConditionalFilters refator (F5 remove botões internos, F7 operador per-par, F8 visual redesign)

**Pré:** ui-ux-pro-max obrigatória — redesign visual significativo.

**Files:**
- `src/components/ui/conditional-filters.tsx`

**Tarefas:**
1. F5: remove rodapé com Aplicar/Limpar (delegado ao caller).
2. F7: refator pra usar novo schema `ConditionGroup { items[] }`:
   - Render: lista de items com conector entre cada par.
   - Conector: chip pequeno `[E]` ou `[OU]` clicável (toggle).
   - "Adicionar condição"/"Adicionar grupo" criam item com `connector: "AND"` (default) — undefined no primeiro item.
3. F8 visual:
   - Conector visual: linha vertical 1px de altura entre items + chip operador no centro. Click no chip alterna E↔OU.
   - Item de Condição: `<Filter className="h-3.5 w-3.5 text-muted-foreground">` à esquerda + 3 selects (campo, operador, valor) + lixeira à direita.
   - Item de Grupo: `<FolderOpen className="h-3.5 w-3.5 text-violet-500">` no header + sub-`<ConditionalFiltersInner>` indentado em `pl-6 border-l-2 border-violet-500/40 bg-muted/20`.
   - Botões "+ Adicionar condição/grupo" com `cursor-pointer` + hover bg-muted.
   - Animations: `motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200` ao adicionar item.
4. TDD onde aplicável (visual smokes).
5. Commits separados.

### Batch D: Export pipeline (F9)

**Files:**
- `src/lib/actions/reports/conversas-export.ts`
- `src/components/reports/export-button.tsx`
- `src/components/reports/advanced-filters.tsx` (passa props)
- `src/components/reports/conversas-page-client.tsx` (passa props)

**Tarefas:**
1. `exportConversasAction` ganha args extras:
   ```ts
   interface ExportConversasInput {
     filters: ReportFilters;
     accountId?: number;
     searchClient?: string;
     conditionGroup?: ConditionGroup;
     documentTypes?: Array<"cpf" | "cnpj" | "none">;
     sortStack?: SortRule[];
   }
   ```
2. Server: após `conversasList`, replica pipeline:
   - `matchSearchClient(rows, searchClient)`.
   - `applyConditions(rows, conditionGroup)`.
   - `matchDocumentTypes(rows, documentTypes)`.
   - Sort com `sortStack` (helper `sortConversasByStack(rows, sortStack)`).
   - `buildConversasXlsxBuffer(rows)`.
3. `<ExportButton>` recebe novos props + passa pro action.
4. `<AdvancedFilters>` recebe esses props do parent + passa pro Export.
5. `<ConversasPageClient>` agrega tudo (tem `searchClient`, `sortStack`, `conditionGroup`, `documentTypes`) e passa.
6. TDD em pipeline server.
7. Commits.

### Batch E (controlador): Release v0.32.0

- Bump 0.30 → 0.32.
- CHANGELOG entry.
- STATUS.md.
- typecheck full + tests.
- Commit release.
- Push.
- portainer-fix --field app_version=v0.32.0.
- Monitor /api/health.

---

## §4. Riscos & Rollback

| Risco | Mitigação |
|---|---|
| F7 schema breaking — URLs antigas com `?cg=` v1 | Codec v2 auto-migra v1 no decode. |
| F7 presets localStorage v1 | Codec migra ao ler. |
| F8 redesign visual quebra UX | TDD smoke + ui-ux-pro-max guidance. |
| F9 server-side replica pipeline mal | Tests de pipeline e-2-e. |
| Coordenação multi-agente: claude-agente-nex-polish-v031 está ativo em escopo distinto | Sem conflito de código fonte; release files mesclados via rebase. Bumpando v0.32 (pula 0.31). |

Rollback: `git revert <SHA release>` + push + portainer-fix com `app_version=v0.30.0`.

---

## §5. Self-Review v1

- [ ] 9 fixes cobertos com 4 batches + release.
- [ ] TDD em F1, F4, F6, F7, F9 (lib/server) + smokes em F2, F3, F8.
- [ ] ui-ux-pro-max em B (F1+F2+F3+F4+F5+F6 UI tabs/dialog), C (F7+F8 redesign), D (F9 ExportButton minor).
- [ ] CHANGELOG entry inclui as 9 mudanças.
- [ ] Coordenação multi-agente verificada.
- [ ] Codec v1→v2 auto-migra (não deixa usuário órfão).
