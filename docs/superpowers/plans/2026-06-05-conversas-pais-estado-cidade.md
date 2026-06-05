# País e Estado/Cidade no Relatório de Conversas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Qualquer task de UI DEVE invocar `ui-ux-pro-max:ui-ux-pro-max` antes de codar.**

**Goal:** Exibir país e estado do contato no drilldown de cada conversa e permitir filtrar por eles (Simples + Avançado), com normalização canônica dos dados sujos do Chatwoot.

**Architecture:** Normalização pura em `location.ts` (única fonte da verdade), aplicada uma vez no mapping de `conversas-list.ts` → `ConversaRow.contact.{country,estado}` canônicos. Drilldown e filtros são 100% client-side, plugando no pipeline existente da `ConversasTable` (`matchSearchClient → matchDocumentTypes → applyConditions → sort → page`). Sem mudanças em SQL/WHERE.

**Tech Stack:** Next.js 16, React 19, TypeScript, Jest. Spec: `docs/superpowers/specs/2026-06-05-conversas-pais-estado-cidade-design.md`.

---

## Task 1: `location.ts` — normalização canônica (núcleo, TDD)

**Files:**
- Create: `src/lib/reports/location.ts`
- Test: `src/lib/reports/__tests__/location.test.ts`

- [ ] **Step 1: Escrever os testes (tabela §4 da spec)** cobrindo `normalizeCountry` e `normalizeEstado` com TODOS os casos da tabela de fixtures, incluindo: já-canônico, nome com/sem acento, caixa-alta, sem hífen (`AM Amazonas`), UF sufixo (`Contagem-MG`, `Crato-CE`, `Anápolis- Go`), nome em cidade-estado (`Maringá - Paraná`), UF isolada (`BA`), capitais (`Brasília`→DF, `Fortaleza`→CE, `Maceió `→AL com trim, `João Pessoa`→PB), desempate nome>UF (`CE-Alagoas`→`AL-Alagoas`), typo→fallback (`Maralhão`→`ZZ-Outros Estados`), bucket mantido, vazio/null→null. Para `normalizeCountry`: Brasil/Brazil/BR→"Brasil", ""/null→null.

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- location.test` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `location.ts`:**
  - `ESTADOS`: array readonly dos 27 estados `{ uf, nome }` (AC-Acre … TO-Tocantins, DF-Distrito Federal).
  - `ESTADO_FALLBACK = "ZZ-Outros Estados"`.
  - Helper interno `deburr(s)`: `s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim()`.
  - `canonicalEstado(uf)`: retorna `"${uf}-${nome}"` a partir de ESTADOS.
  - `CIDADES`: `Record<string, uf>` (chave = `deburr(cidade)`) com as 27 capitais + cidades observadas (Brasília→DF, Fortaleza→CE, Maceió→AL, João Pessoa→PB, Goiânia→GO, Maracanaú→CE, Anápolis→GO, Contagem→MG, Juiz de Fora→MG, Mariana→MG, Crato→CE, Itabuna→BA, Arraial da Ajuda→BA, Cidade Ocidental→GO, Lucas do Rio Verde→MT).
  - `normalizeCountry(raw)`: trim; vazio→null; `deburr` casa "brasil"/"brazil"/"br"→"Brasil"; senão retorna o trim original (defensivo) — mas para os dados atuais sempre Brasil.
  - `normalizeEstado(raw)`: implementa a precedência §3.1 (já-ZZ → nome de estado completo via deburr-substring → sigla UF token → cidade conhecida → fallback). Vazio/null→null.

- [ ] **Step 4: Rodar e ver passar** — `npm test -- location.test` → PASS (todos os casos).

- [ ] **Step 5: Commit** — `git add src/lib/reports/location.ts src/lib/reports/__tests__/location.test.ts && git commit -m "feat(reports): location.ts — normalização canônica país/estado"`

---

## Task 2: `conversas-list.ts` — expor país/estado normalizados

**Files:**
- Modify: `src/lib/chatwoot/queries/conversas-list.ts` (interface `ConversaRow`, SELECT ~258-300, mapping ~343-351)

- [ ] **Step 1:** Importar `normalizeCountry, normalizeEstado` de `@/lib/reports/location`.
- [ ] **Step 2:** No SELECT, após `ct.identifier`/`ct.additional_attributes`, adicionar:
  `ct.additional_attributes->>'country' AS contact_country_raw,` e
  `ct.additional_attributes->>'city' AS contact_estado_raw,`. Garantir que a query usa o alias `ct` para contacts (já usa).
- [ ] **Step 3:** Na interface `ConversaRow.contact`, adicionar `country: string | null;` e `estado: string | null;` (mantendo os campos existentes).
- [ ] **Step 4:** No mapping `sliced.map((r) => ...)`, no objeto `contact`, adicionar:
  `country: normalizeCountry(r.contact_country_raw as string | null),`
  `estado: normalizeEstado(r.contact_estado_raw as string | null),`
  (ajustar o tipo da row interna do `queryNexusChat<...>` para incluir `contact_country_raw`/`contact_estado_raw`).
- [ ] **Step 5:** `npx tsc --noEmit` → 0 erros. Rodar testes existentes de conversas-list se houver (`npm test -- conversas-list`).
- [ ] **Step 6: Commit** — `git commit -am "feat(conversas): SELECT country/city do contato + ConversaRow.contact.{country,estado} normalizados"`

---

## Task 3: `filter-state.ts` — countries/estados + URL

**Files:**
- Modify: `src/lib/reports/filter-state.ts` (interface, serialize, deserialize)
- Test: arquivo de teste existente do filter-state (se houver) ou criar caso novo.

- [ ] **Step 1 (teste):** Adicionar/estender teste de round-trip: `serialize({...countries:["Brasil"], estados:["MG-Minas Gerais","ZZ-Outros Estados"]})` produz `countries=Brasil` e `estados=MG-Minas Gerais,ZZ-Outros Estados`; `deserialize` reconstrói os arrays. Caso vazio não emite o param.
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Na interface `FilterState`, adicionar `countries: string[];` e `estados: string[];` (defaults `[]` onde o estado default é construído). Na serialização, espelhar `documentTypes`: `if (state.countries?.length) p.set("countries", state.countries.join(","))` e idem `estados`. Na deserialização: `const countries = params.get("countries")?.split(",").map(s=>s.trim()).filter(Boolean) ?? []` e idem `estados`. Atualizar o default state (onde `documentTypes: []` é inicializado) com `countries: [], estados: []`.
- [ ] **Step 4:** Ver passar (`npm test -- filter-state`).
- [ ] **Step 5: Commit** — `git commit -am "feat(filters): FilterState.countries/estados + serialização URL"`

---

## Task 4: Drilldown — linhas PAÍS e ESTADO/CIDADE (UI)

**Files:**
- Modify: `src/components/reports/conversa-drill-down.tsx` (após a seção Atributos, ~linha 134)

- [ ] **Step 1:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** para validar o padrão das 2 linhas (alinhamento com WHATSAPP/ETIQUETAS/ATRIBUTOS, label uppercase `min-w-[100px]`, fallback `—`, dark theme, `HighlightedText`).
- [ ] **Step 2:** Inserir, após o bloco Atributos, dois blocos irmãos seguindo exatamente o padrão visual existente:
  - `PAÍS` → `row.contact.country ? <HighlightedText text={row.contact.country} term={searchTerm}/> : "—"`.
  - `ESTADO/CIDADE` → `row.contact.estado ? <HighlightedText .../> : "—"`.
  Usar as MESMAS classes das outras linhas (`flex flex-wrap items-baseline gap-x-3 gap-y-1`, label `min-w-[100px] pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`, valor `text-[12px] text-foreground/90` ou equivalente ao padrão aprovado).
- [ ] **Step 3:** `npx tsc --noEmit` → 0. Conferir visualmente o padrão (descrição), sem inventar tokens novos.
- [ ] **Step 4: Commit** — `git commit -am "feat(conversas): drilldown exibe PAÍS e ESTADO/CIDADE do contato"`

---

## Task 5: Pipeline client-side — `matchLocation` na tabela (TDD)

**Files:**
- Modify: `src/components/reports/conversas-table.tsx` (props + pipeline ~644-695)
- Create (ou inline + test): `src/lib/reports/match-location.ts` + `src/lib/reports/__tests__/match-location.test.ts`

> Extrair `matchLocation` para `src/lib/reports/match-location.ts` (função pura testável), análogo a `matchDocumentTypes`. A tabela importa e usa.

- [ ] **Step 1 (teste):** `matchLocation(rows, countries, estados)`:
  - listas vazias → retorna rows inalteradas;
  - só `countries=["Brasil"]` → mantém rows cujo `contact.country === "Brasil"`;
  - só `estados=["MG-Minas Gerais"]` → mantém rows cujo `contact.estado === "MG-Minas Gerais"`;
  - ambos → AND;
  - row com `contact.estado === null` é excluída quando `estados` está ativo.
  Usar fixtures mínimas de `ConversaRow` (só `contact.country/estado`).
- [ ] **Step 2:** Ver falhar.
- [ ] **Step 3:** Implementar `matchLocation(rows, countries, estados)`: se ambos vazios retorna rows; senão `rows.filter(r => (!countries.length || (r.contact.country!=null && countries.includes(r.contact.country))) && (!estados.length || (r.contact.estado!=null && estados.includes(r.contact.estado))))`.
- [ ] **Step 4:** Ver passar (`npm test -- match-location`).
- [ ] **Step 5:** Na `ConversasTable`: adicionar props `countries?: string[]` e `estados?: string[]`. Inserir estágio no pipeline **entre `docFilteredRows` e `filteredRows`**:
  ```ts
  const locFilteredRows = useMemo(
    () => matchLocation(docFilteredRows, countries ?? [], estados ?? []),
    [docFilteredRows, countries, estados],
  );
  ```
  e trocar a entrada de `applyConditions` para `locFilteredRows` (a `filteredRows` passa a usar `locFilteredRows`).
- [ ] **Step 6:** `npx tsc --noEmit` → 0. Rodar testes da tabela existentes.
- [ ] **Step 7: Commit** — `git commit -am "feat(conversas): matchLocation no pipeline client-side (filtro país/estado simples)"`

---

## Task 6: `filters-dialog.tsx` — UI Simples + Avançado (UI)

**Files:**
- Modify: `src/components/reports/filters-dialog.tsx`

- [ ] **Step 1:** **Invocar `ui-ux-pro-max:ui-ux-pro-max`** para as 2 novas seções (ícones `Globe`/`MapPin`, posição após `Documento`, contadores, estados vazios).
- [ ] **Step 2:** Adicionar mapping estável string↔id em `location.ts` ou no próprio dialog: para estados, `id = índice em ESTADOS + 1` e `ZZ-Outros Estados` = id fixo (ex. 99); país `Brasil` = 1. Exportar helpers `estadoToId/idToEstado`, `countryToId/idToCountry` (preferir em `location.ts` para reuso/teste). **Adicionar testes** desses helpers em `location.test.ts` (round-trip).
- [ ] **Step 3:** Estender `Props` com `countries: MetaItem[]` e `estados: MetaItem[]` (já no formato `{id,name}` derivado — ver Task 7). Estender `SimpleSectionKey` com `"countries" | "estados"`.
- [ ] **Step 4:** Inserir 2 `CollapsibleSection` após a de `Documento`, usando `MultiSelectCheckbox` com `options={countries}`/`{estados}`, `value` mapeado de `draft.countries`/`draft.estados` (strings) → ids via helpers, `onChange` revertendo ids → strings. `emptyLabel` apropriado.
- [ ] **Step 5:** Atualizar `hasAnyFilter`, `hasDataInSimple`, `handleClearOnlyFilters` para incluir `countries`/`estados`.
- [ ] **Step 6 (Avançado):** Em `buildFields(...)`, receber `countries`/`estados` e adicionar 2 `ConditionFieldDef`: `{key:"contact.country", label:"País", type:"multi_select", options: countries.map(c=>({value:c.name,label:c.name}))}` e `{key:"contact.estado", label:"Estado/Cidade", type:"multi_select", options: estados.map(e=>({value:e.name,label:e.name}))}`. (Valores = strings canônicas, pois `applyConditions` compara `contact.estado` string.) Atualizar a chamada de `buildFields`.
- [ ] **Step 7:** `npx tsc --noEmit` → 0. Confirmar que o operador emitido para multi_select casa com `applyConditions` (`in`). Se o executor usar ids numéricos para multi_select, alinhar para usar `value:c.name` (string) — validar com um teste manual/inspeção do executor.
- [ ] **Step 8: Commit** — `git commit -am "feat(filters): País e Estado/Cidade no dialog (Simples + Avançado)"`

---

## Task 7: Wiring — derivar opções e propagar props

**Files:**
- Modify: `src/components/reports/conversas-page-client.tsx`, `src/components/reports/advanced-filters.tsx`, `src/app/(protected)/relatorios/conversas/page.tsx`

- [ ] **Step 1:** Em `ConversasPageClient`: dois `useMemo` derivando opções de `initialRows`:
  ```ts
  const countryOptions = useMemo(() => buildLocationOptions(initialRows, "country"), [initialRows]);
  const estadoOptions  = useMemo(() => buildLocationOptions(initialRows, "estado"),  [initialRows]);
  ```
  Criar `buildLocationOptions(rows, key)` em `location.ts` (ou util): coleta valores distintos não-nulos de `contact[key]`, ordena (estados por ordem de `ESTADOS` + ZZ por último; país alfabético), retorna `MetaItem[]` (`id` via mapping da Task 6, `name` = canônico). **Adicionar teste**.
- [ ] **Step 2:** Passar `countries={countryOptions}` e `estados={estadoOptions}` para `<AdvancedFilters>`, e `countries={filterState.countries}` / `estados={filterState.estados}` para `<ConversasTable>`.
- [ ] **Step 3:** Em `AdvancedFilters`: aceitar e repassar `countries`/`estados` (options) ao `<FiltersDialog>`.
- [ ] **Step 4:** `page.tsx`: nada novo a buscar (opções derivadas no client). Garantir que `filterState` (com `countries`/`estados`) já flui para `ConversasPageClient` (vem do `parseFilterState` existente). Confirmar que o `ConversasPageClient` recebe `filterState` completo.
- [ ] **Step 5:** `npx tsc --noEmit` → 0.
- [ ] **Step 6: Commit** — `git commit -am "feat(conversas): deriva opções de país/estado e propaga filtros até a tabela"`

---

## Task 8: Verificação final

- [ ] **Step 1:** `npx tsc --noEmit` → 0 erros.
- [ ] **Step 2:** `npm test` → suíte verde (novos testes de `location`/`match-location`/`filter-state` passam; sem regressões).
- [ ] **Step 3:** `npm run build` → sucesso (SSR da página protegida valida).
- [ ] **Step 4:** `superpowers:verification-before-completion` — checklist com evidência (saídas reais coladas).
- [ ] **Step 5:** `superpowers:requesting-code-review`.
- [ ] **Step 6: Commit** de docs (CHANGELOG/HISTORY) se aplicável; **NÃO pushar** — aguardar "ok" do usuário (push dispara deploy prod).

---

## Self-Review (do plano vs spec)

- **Cobertura:** drilldown (T4), normalização (T1), filtros simples (T3/T5/T6/T7) e avançado (T6), exibição (T2/T4). ✅
- **Tipos consistentes:** `contact.country`/`contact.estado` (string|null) definidos na T2 e usados em T4/T5/T6/T7; `matchLocation` assinatura única; helpers de mapping em `location.ts`. ✅
- **Risco a validar em execução:** operador do modo Avançado para multi_select (T6 Step 7) — se o executor de condições usar comparação de igualdade simples por string em `in`, ok; caso contrário ajustar. Mantém-se TDD onde há lógica pura.
- **Sem placeholders de implementação:** cada task tem arquivos exatos e a forma do código. Detalhes finos (classes Tailwind exatas) resolvidos via `ui-ux-pro-max` nas tasks de UI, conforme regra do projeto.
