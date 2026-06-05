# Spec — País e Estado/Cidade no Relatório de Conversas

> **Data:** 2026-06-05
> **Status:** v4 (consolidada — arquitetura client-side confirmada no código)
> **Autor:** Claude (brainstorming + investigação no banco real + leitura do pipeline)
> **Escopo:** Relatório de Conversas (`/relatorios/conversas`)

---

## 1. Objetivo

Trazer, para cada conversa, a **localização do contato** (país e estado) que hoje vive
no banco do Chatwoot mas não é exibida nem filtrável na plataforma. Três partes:

1. **Drilldown:** duas linhas novas — `PAÍS` e `ESTADO/CIDADE` — logo após `ATRIBUTOS`.
2. **Normalização canônica:** padronizar os valores sujos (`Brasil`; `UF-Nome`).
3. **Filtros:** dois multi-select novos — `País` e `Estado/Cidade` — após `Documento`,
   no modo **Simples** e no **Avançado**.

Não-objetivo: não alterar a coluna "Estado" da grade (que vem do **nome da inbox**,
fonte independente), nem adicionar colunas novas à tabela.

---

## 2. Origem dos dados (verificado no banco de produção, read-only — 2026-06-05)

Inspeção contra `82.112.245.232/chatwoot` (role `chatwoot_leitura`).

- Dados em **`contacts.additional_attributes`** (JSONB): chaves `country`, `country_code`,
  `city`. A query de conversas já faz `LEFT JOIN contacts ct`.
- **Preenchimento:** account 9 (Matrix) 7.905 contatos ~96% preenchidos; account 2
  (Invest) 16 contatos, todos vazios.
- **`country`:** `Brasil` (7.588), `Brazil` (18), `""` (102). Monovalor na prática.
- **`city` NÃO é cidade — é o estado**, majoritariamente `UF-Nome` (`MG-Minas Gerais`,
  `BA-Bahia`, `SP-São Paulo`…) + bucket `ZZ-Outros Estados`. Cauda suja (ver §4).

### 2.1 Decisões de produto (confirmadas pelo usuário)

- Contato sem dado → linha **vazia (`—`)** no drilldown.
- País sempre `Brasil` (corrigir `Brazil`/variações).
- Estado sempre `UF-Nome`; valor fora do padrão é padronizado (inclui recuperar
  cidade→estado quando reconhecível).
- Não identificável → fallback **`ZZ-Outros Estados`**.
- Filtros: **multi-select de valores existentes** (não texto livre).

---

## 3. Arquitetura (client-side, alinhada ao pipeline existente)

**Premissa confirmada no código:** a página busca um superset (`pageSize: 50_000`) com
os filtros SQL baratos (período, inbox, team, status…), e a `ConversasTable` refina
**em memória**: `matchSearchClient → matchDocumentTypes → applyConditions(conditionGroup)
→ sort → page` (`conversas-table.tsx:644-695`). País/estado entram nesse pipeline —
**sem tocar SQL/WHERE**.

### 3.1 Fonte única de normalização — `src/lib/reports/location.ts` (novo)

Módulo puro, testável, única fonte da verdade.

```ts
export const ESTADOS: ReadonlyArray<{ uf: string; nome: string }>; // 27 estados
export const ESTADO_FALLBACK = "ZZ-Outros Estados";

/** "Brazil"/"brasil"/"BR" → "Brasil". "" / null → null. */
export function normalizeCountry(raw: string | null | undefined): string | null;

/** "" / null → null. Reconhecível → "UF-Nome". Senão → "ZZ-Outros Estados". */
export function normalizeEstado(raw: string | null | undefined): string | null;
```

**Algoritmo de `normalizeEstado` (precedência):**

1. `trim` + colapsa espaços; remove acentos só p/ comparar. Vazio/null → `null`.
2. Já casa `^ZZ-Outros Estados$` → mantém.
3. **Nome de estado** completo presente na string (sem acento, case-insensitive) →
   esse estado. Cobre `Bahia`, `CE-Alagoas` (nome vence o prefixo divergente),
   `Maringá - Paraná`, `ESPÍRITO SANTO`.
4. **Sigla UF** (token de 2 letras como prefixo/sufixo isolado: `Contagem-MG`,
   `Crato-CE`, `Anápolis- Go`, `BA`) com UF válida → esse estado.
5. **Cidade conhecida** (dicionário de 27 capitais + cidades frequentes observadas,
   sem acento: `Brasília`→DF, `Fortaleza`→CE, `Maceió`→AL, `João Pessoa`→PB…) → estado.
6. Nenhum → `ESTADO_FALLBACK`.

> Desempate (passo 3 antes do 4): prefixo UF e nome divergentes (`CE-Alagoas`) → o
> **nome** vence (mais específico). Casos raríssimos (1 contato cada); coberto por teste.
> Dicionário de cidades não é exaustivo — o que escapar cai em `ZZ-Outros Estados`
> (autorizado pelo usuário).

### 3.2 Camada de dados — `conversas-list.ts`

- **SELECT:** adicionar `ct.additional_attributes->>'country' AS contact_country_raw`
  e `ct.additional_attributes->>'city' AS contact_estado_raw`.
- **Mapping → normaliza uma vez** (server, importando `location.ts` — TS puro):
  ```ts
  contact: {
    // … existentes (id, name, phone_number, identifier, additional_attributes)
    country: normalizeCountry(r.contact_country_raw),  // string | null (CANÔNICO)
    estado:  normalizeEstado(r.contact_estado_raw),    // string | null (CANÔNICO)
  }
  ```
- **`ConversaRow.contact`** ganha `country: string | null` e `estado: string | null`
  (**já normalizados**). Um único ponto de normalização serve drilldown, filtro simples
  e filtro avançado (DRY) — e o dot-path `contact.country`/`contact.estado` do
  `applyConditions` resolve direto para o valor canônico, sem hack.

### 3.3 Drilldown — `conversa-drill-down.tsx`

Duas linhas após `ATRIBUTOS` (~linha 134), no mesmo padrão visual (`min-w-[100px]`,
`uppercase`, `text-[11px]`…):

- `PAÍS` → `row.contact.country ?? "—"`.
- `ESTADO/CIDADE` → `row.contact.estado ?? "—"`.

Suporta `HighlightedText` como as demais linhas.
**UI obrigatoriamente via `ui-ux-pro-max` antes de codar.**

### 3.4 Opções de filtro — derivadas das linhas carregadas (sem query nova)

Como o filtro é client-side e cada linha já traz `contact.country`/`contact.estado`
normalizados, as opções saem das próprias `initialRows`:

- Em `ConversasPageClient`, dois `useMemo` produzem as listas distintas e ordenadas de
  `contact.country` e `contact.estado` (não-nulos). Estados ordenados por UF; o bucket
  `ZZ-Outros Estados` por último.
- Essas listas descem para `AdvancedFilters` → `FiltersDialog`.
- **Não** mexemos em `meta-cache.ts` nem adicionamos query/cache — evita uma varredura
  JSONB sem índice no banco read-only do cliente.

> Consequência aceita: as opções refletem o universo do período/filtros SQL já
> aplicados (o superset de 50k). É bom UX (não oferece opção que daria zero resultado).

### 3.5 FilterState + UI dos filtros

- `filter-state.ts`: `FilterState` ganha `countries: string[]` e `estados: string[]`
  (valores **canônicos**). Serialização URL `countries=` / `estados=` (comma-sep, igual
  a `docTypes`); deserialização simétrica; defaults `[]`.
- `filters-dialog.tsx` (Simples): duas `CollapsibleSection` após `Documento` — `País`
  (ícone `Globe`) e `Estado/Cidade` (ícone `MapPin`), via `MultiSelectCheckbox`.
  Como o componente opera com `number[]`, usa-se **mapping estável string↔id** (mesmo
  padrão de `documentTypes`/`ID_TO_DOC_TYPE`): o id de cada estado é sua posição na
  constante canônica `ESTADOS` (+ id fixo para `ZZ-Outros Estados`); país idem. As
  opções exibidas são a interseção entre os canônicos e o que veio das rows (§3.4).
  Atualizar `SimpleSectionKey`, `hasAnyFilter`, `hasDataInSimple`,
  `handleClearOnlyFilters`, `Props`.
- `filters-dialog.tsx` (Avançado): `buildFields()` ganha `contact.country` e
  `contact.estado` (`type: "multi_select"`, mesmas opções), espelhando `inbox.id`.
- Propagação: `page.tsx` → `ConversasPageClient` recebe `filterState.countries/estados`
  e os repassa à `ConversasTable` (filtro) e deriva as opções (§3.4) p/ `FiltersDialog`.

### 3.6 Aplicação do filtro — pipeline client-side

- **Simples:** novo helper `matchLocation(rows, countries, estados)` (em
  `conversas-table.tsx` ou um util irmão de `matchDocumentTypes`), inserido no pipeline
  **após `matchDocumentTypes` e antes de `applyConditions`**. Compara
  `row.contact.country ∈ countries` (se houver) **AND** `row.contact.estado ∈ estados`
  (se houver). Listas vazias = sem filtro. `ConversasTable` recebe `countries`/`estados`
  como props (igual `documentTypes`).
- **Avançado:** `applyConditions` já filtra por `contact.country`/`contact.estado`
  (dot-path → valor canônico) com operador `in` (multi_select). Só requer os campos em
  `buildFields`. Verificar no executor que multi_select emite `in`/`not_in` como em
  `inbox.id`.

> Nenhuma mudança em `buildBaseFilter`/`filters.ts` nem tradução para SQL.

---

## 4. Casos de teste (fixtures reais — TDD obrigatório)

`normalizeCountry`: `Brasil`→`Brasil`; `Brazil`→`Brasil`; `BR`→`Brasil`;
`""`/`null`→`null`.

`normalizeEstado`:

| Entrada (cru)            | Saída esperada          | Regra |
|--------------------------|-------------------------|-------|
| `MG-Minas Gerais`        | `MG-Minas Gerais`       | já canônico |
| `BA-Bahia`               | `BA-Bahia`              | já canônico |
| `Bahia`                  | `BA-Bahia`              | nome |
| `Goias`                  | `GO-Goiás`              | nome sem acento |
| `ESPÍRITO SANTO`         | `ES-Espírito Santo`     | nome caixa-alta |
| `AM Amazonas`            | `AM-Amazonas`           | nome sem hífen |
| `Contagem-MG`            | `MG-Minas Gerais`       | UF sufixo |
| `Crato-CE`               | `CE-Ceará`              | UF sufixo |
| `Anápolis- Go`           | `GO-Goiás`              | UF sufixo c/ espaço |
| `Maringá - Paraná`       | `PR-Paraná`             | nome em cidade-estado |
| `BA`                     | `BA-Bahia`              | UF isolada |
| `Brasília`               | `DF-Distrito Federal`   | cidade (capital) |
| `Fortaleza`              | `CE-Ceará`              | cidade (capital) |
| `Maceió `                | `AL-Alagoas`            | cidade (trim) |
| `João Pessoa`            | `PB-Paraíba`            | cidade (capital) |
| `CE-Alagoas`             | `AL-Alagoas`            | nome>UF (desempate) |
| `Maralhão`               | `ZZ-Outros Estados`     | typo → fallback |
| `ZZ-Outros Estados`      | `ZZ-Outros Estados`     | bucket mantido |
| `""` / `null`            | `null`                  | sem informação |

Testes do pipeline: `matchLocation` filtra por país/estado; listas vazias = no-op;
combinação país+estado é AND; valor `null` da row nunca casa um filtro ativo.

---

## 5. Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `src/lib/reports/location.ts` | **novo** — normalização + ESTADOS + dicionário cidades |
| `src/lib/reports/__tests__/location.test.ts` | **novo** — TDD (tabela §4) |
| `src/lib/chatwoot/queries/conversas-list.ts` | SELECT (2 campos) + `ConversaRow.contact.{country,estado}` (normalizados no mapping) |
| `src/components/reports/conversa-drill-down.tsx` | 2 linhas novas (UI — `ui-ux-pro-max`) |
| `src/lib/reports/filter-state.ts` | `countries`/`estados` + (de)serialização URL |
| `src/components/reports/filters-dialog.tsx` | 2 seções Simples + 2 campos Avançado + mapping string↔id (UI — `ui-ux-pro-max`) |
| `src/components/reports/advanced-filters.tsx` | repassar opções `countries`/`estados` ao `FiltersDialog` |
| `src/components/reports/conversas-page-client.tsx` | derivar opções (useMemo) + repassar props |
| `src/components/reports/conversas-table.tsx` | `matchLocation` no pipeline + props `countries`/`estados` |
| `src/app/(protected)/relatorios/conversas/page.tsx` | repassar `filterState.countries/estados` |
| testes de serialização/tabela existentes | estender |

---

## 6. Edge cases e decisões

- **Account sem dados:** opções derivadas ficam `[]` → seções de filtro mostram
  `emptyLabel`; drilldown mostra `—`.
- **Sem filtrar "vazio":** não há opção "sem país/estado" (consistente com os demais).
- **País monovalor (`Brasil`):** filtro existe por consistência.
- **Acentos:** comparação via forma normalizada (NFD sem diacríticos, lowercase).
- **Versionamento:** ao mudar a normalização, nenhuma chave de cache a invalidar (sem
  cache) — basta o deploy. Testes guardam a semântica.

---

## 7. Riscos

1. **Dicionário de cidades incompleto** → mais itens em `ZZ-Outros Estados`. Aceito;
   fácil estender.
2. **Divergência UF↔nome** (`CE-Alagoas`): decisão (nome vence) testada; volume ínfimo.
3. **Opções dependem do período carregado** (§3.4): aceito como UX; documentado.

---

## 8. Fora de escopo

- Coluna "Estado" da grade (vem da inbox).
- Colunas País/Estado na tabela (grade) — só drilldown + filtros.
- Cidade-município real (não existe; `city` é estado).
- Índices/alterações no banco do Chatwoot (read-only do cliente).
- Backfill/correção na origem — só normalização de leitura.

---

## 9. Workflow de implementação (CLAUDE.md)

`writing-plans` (plan v1→v2→v3) → `subagent-driven-development` com TDD por task
(`location.ts` primeiro) → UI sempre com `ui-ux-pro-max` →
`verification-before-completion` → `requesting-code-review`.
