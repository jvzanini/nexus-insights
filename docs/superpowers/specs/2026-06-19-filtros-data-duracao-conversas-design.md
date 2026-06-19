# Spec — Filtros de Data e Duração no relatório de Conversas

> Data: 2026-06-19 · Autor: sessão autônoma · Status: **v3 (final, pós 2 reviews adversariais)**
> Tela alvo: `/relatorios/conversas` (lista detalhada de conversas)

---

## 1. Problema

Hoje o seletor de **período** das pílulas ("Hoje / Esta semana / Este mês / Todos / Personalizado") sempre observa a coluna `c.last_activity_at` (última movimentação). Consequências:

1. **Não dá para ver "conversas criadas no período"**. "Este mês" traz toda conversa que *se mexeu* em junho, mesmo as criadas há meses. Não existe forma de filtrar por data de **criação**.
2. **Não há filtro amigável por tempo de espera/abertura**. A tela já calcula e exibe as colunas "Sem resposta há" e "Aberta há", mas filtrar por elas só é possível no modo Avançado, digitando **segundos crus** — sem unidades nem operadores claros. No modo Simples não existe.

Esses dois recortes definem *como o usuário enxerga a operação*. Esta spec adiciona ambos, num **bloco fixo no topo do modal de Filtros**, vinculados às pílulas de período.

---

## 2. Escopo

Duas adições ao modal de Filtros na tela de Conversas, ambas como **propriedades globais** (válidas e visíveis nas abas Simples e Avançado, fora do mutex de troca de aba):

- **(A) Filtro de Data** — escolher qual coluna o período observa: **Criado em** (`created_at`) ou **Última atualização em** (`last_activity_at`, default = comportamento atual).
- **(B) Filtro de Duração** — filtrar por um indicador de tempo: **Sem resposta há**, **Aberta há** ou **Parada há**, com **modo** (no mínimo / no máximo / entre), **valor livre** e **unidade** (minuto / hora / dia / mês / ano).

Cada controle traz **descrição embutida** precisa e, onde necessário, **aviso inline** (não só tooltip) para evitar filtro errado.

**Fora de escopo:** outros relatórios, Dashboard, pré-agregação, colunas da tabela. **Não** alterar os campos `waiting_seconds`/`open_seconds` já existentes no condition-builder do Avançado (evita regressão de presets/URLs antigos). Reaproveitar pílulas de período, `ReportFilters.periodColumn`, colunas calculadas e pipeline client-side.

---

## 3. Semântica canônica dos campos (verificada no código-fonte)

Fonte: `src/lib/reports/canonical.ts`, `src/lib/chatwoot/queries/conversas-list.ts`.

### 3.1 Campos de Data

| Opção | Coluna | `periodColumn` | Definição prática |
|---|---|---|---|
| **Criado em** | `c.created_at` | `"created"` | Data/hora em que a conversa nasceu. Imutável. |
| **Última atualização em** (default) | `c.last_activity_at` | `"active"` | Data/hora da última movimentação registrada pelo Chatwoot. Muda a cada interação. |

A escolha altera **apenas** a coluna que a janela do período filtra. É **server-side** via `ReportFilters.periodColumn` (já existente; só "Recebidas" usa `"created"` hoje).

### 3.2 Indicadores de Duração

Todos medem "há quanto tempo", a partir do instante de referência do servidor (`NOW()` da query). **Os dois primeiros zeram em conversas resolvidas** (`CASE WHEN status = RESOLVED THEN NULL`).

| Indicador | Base | Tem valor quando | Vazio (`—`, e some do filtro) quando |
|---|---|---|---|
| **Sem resposta há** (`waiting_seconds`) | `NOW() − última msg pública do cliente` | Última manifestação foi o **cliente** (incoming público) **e** conversa **não resolvida** | Resolvida; atendente foi o último a agir; ou nunca houve incoming público |
| **Aberta há** (`open_seconds`) | `NOW() − última msg do atendente` (pública **ou** nota privada) | Última manifestação foi o **atendente e** conversa **não resolvida** | Resolvida; cliente foi o último a falar; ou nunca houve outgoing |
| **Parada há** (`stalled_seconds`) — **novo, derivado** | `serverNow − c.last_activity_at` | **Sempre** (`last_activity_at` é NOT NULL) | Nunca |

**Nuance crítica (canônica, deve constar na descrição do indicador):** para "Sem resposta há", uma **nota interna/privada do atendente conta como movimento do atendente** — escrever uma nota privada (sem responder o cliente) move a conversa de "Sem resposta há" para "Aberta há". Mantemos esse comportamento canônico para consistência com a coluna exibida; a descrição avisa o usuário explicitamente.

**Relação:** "Parada há" usa a mesma coluna (`last_activity_at`) que o filtro de Data "Última atualização em" — uma vista como duração, a outra como ponto no tempo.

### 3.3 Conversão de unidades (aproximação documentada na UI)

| Unidade | Segundos | Rótulo na UI |
|---|---|---|
| minuto | 60 | minuto |
| hora | 3.600 | hora |
| dia | 86.400 | dia |
| mês | 2.592.000 | **mês (≈30 dias)** |
| ano | 31.536.000 | **ano (≈365 dias)** |

Mês/ano são tempo corrido (30/365 dias), **não** mês de calendário — rotulado na própria opção do select e no tooltip.

### 3.4 Comparação opera sobre o valor EXATO (não o rótulo arredondado)

A coluna usa `formatDuration` (`Math.round`), então "1min 35s" aparece como "2min". **O filtro compara o tempo EXATO em segundos**, não o rótulo. Para evitar a percepção de bug:
- Microcopy no bloco: *"O filtro usa o tempo exato da conversa; a coluna mostra um valor arredondado para leitura."*
- A célula das colunas "Sem resposta há"/"Aberta há"/"Parada há" ganha `title` com o valor exato (ex.: "95 s").

---

## 4. Comportamento

### 4.1 Filtro de Data (A) — server-side

- Novo campo em `FilterState`: `dateField: "created" | "updated"` (default `"updated"`).
- Em `page.tsx`, ao montar `ReportFilters`: `periodColumn = dateField === "created" ? "created" : "active"`. Como `periodColumn` entra no objeto `ReportFilters`, a **cache key (`hashFilters` = sha1 do objeto) já discrimina automaticamente** — sem risco de cache servido errado e **sem necessidade de bumpar** o sufixo `-canonical-v0.42` (não há mudança de semântica de cálculo; `"created"` já existe).
- Quando `period === "todos"`, a janela é epoch→agora e a coluna é irrelevante: o segmented control de Data fica **desabilitado** com tooltip *"A escolha de data só afeta Hoje/Semana/Mês/Personalizado."*

### 4.2 Filtro de Duração (B) — client-side

`waiting_seconds`/`open_seconds` já chegam por linha. `stalled_seconds` é **materializado** (não existe na row crua) a partir de `last_activity_at`, que é **string ISO** (`conversas-list.ts:67`, `.toISOString()` no mapper):

```ts
// serverNow: epoch ms capturado no Server Component no momento do fetch (prop).
function deriveStalledSeconds(row: ConversaRow, serverNow: number): number | null {
  if (!row.last_activity_at) return null;
  const t = Date.parse(row.last_activity_at);
  return Number.isNaN(t) ? null : Math.floor((serverNow - t) / 1000);
}
```

`serverNow` é usado (em vez de `Date.now()`) para alinhar a base temporal com `waiting`/`open` calculados no servidor. No export (server-side), `serverNow = Date.now()` do servidor.

Tipos novos em `FilterState`:

```ts
type DurationIndicator = "waiting" | "open" | "stalled";
type DurationMode = "gte" | "lte" | "between"; // no mínimo / no máximo / entre
type DurationUnit = "minute" | "hour" | "day" | "month" | "year";

interface DurationFilter {
  indicator: DurationIndicator;
  mode: DurationMode;
  value: number;            // > 0. valor (gte/lte) ou início (between).
  unit: DurationUnit;
  valueEnd?: number;        // obrigatório em "between"; (valueEnd×unitEnd) > (value×unit).
  unitEnd?: DurationUnit;    // em "between", unidade do fim (independente — permite "entre 45 min e 3 dias").
}

// FilterState ganha: durationFilter?: DurationFilter;
```

Helper novo `matchDuration(row, filter, serverNow)`:
- Resolve `seconds` do indicador (waiting/open da row; stalled via `deriveStalledSeconds`). Se `null` → linha **não passa**.
- Converte para segundos: `gte`/`lte` por `unit`; `between` por `unit` (início) e `unitEnd` (fim).
- `gte`: `seconds >= a`; `lte`: `seconds <= a`; `between`: `min(a,b) <= seconds <= max(a,b)` (limites inclusivos).
- Compõe com **AND** em relação a todos os outros filtros.

### 4.3 Onde o `durationFilter` e `dateField` vivem (resolve incoerência entre abas)

`dateField` e `durationFilter` são **propriedades globais** do `FilterState`, renderizadas num **bloco fixo no topo do modal**, acima das abas. **Não pertencem a nenhuma aba** e **não são zeradas** pelo `AlertDialog` de troca Simples↔Avançado (que continua zerando só as dimensões específicas da aba). O texto do AlertDialog deve deixar claro que Data e Duração são preservados.

O condition-builder do **Avançado permanece intacto**: mantém `waiting_seconds`/`open_seconds` em segundos crus (zero regressão de presets/`cg`). Adicionar **`stalled_seconds`** ao builder também em segundos crus, materializado na row antes de `applyConditions` (senão `getFieldValue` lê `undefined` → sempre falso). Dica no Avançado ao combinar `waiting_seconds` AND `open_seconds`: *"'Sem resposta há' e 'Aberta há' nunca coexistem na mesma conversa; combiná-las com E resulta em vazio."*

### 4.4 Pipeline (ordem real verificada)

- **Tabela** (`conversas-table.tsx`): hoje `matchSearchClient → matchDocumentTypes → matchLocation → applyConditions → sort → paginate`. Materializar `stalled_seconds` na row e inserir `matchDuration` como estágio adicional (após os demais matches, antes do sort). Como é AND, a posição não muda o conjunto.
- **Export** (`conversas-export.ts`): hoje `search → conditionGroup → documentTypes → location → sort`. Inserir `matchDuration` análogo e materializar `stalled_seconds`. Requer estender o contrato (ver §6).

---

## 5. UI (segue `ui-ux-pro-max` + padrão do projeto)

Padrão visual herdado do Roteador Webhook Meta: `base-ui` (prop `render`, nunca `asChild`), ícones Lucide, tokens existentes. **A UI será desenhada invocando `ui-ux-pro-max:ui-ux-pro-max` antes de codar.**

**Bloco fixo no topo do modal** (acima das abas, em ambas):
- **Linha "Data":** rótulo + segmented control `Criado em` / `Última atualização em` + ícone de ajuda (descrição §3.1). Default em "Última atualização em". Desabilitado quando período = "Todos" (§4.1).
- **Bloco "Filtrar por tempo"** (subtítulo *"Há quanto tempo a conversa está sem resposta, aberta ou parada"*; ícone de relógio):
  - **Indicador** (`Sem resposta há` / `Aberta há` / `Parada há`) — cada opção com sua descrição (§3.2), incluindo a nuance da nota privada em "Sem resposta há".
  - **Modo** (`no mínimo` / `no máximo` / `entre`) — segmented control.
  - **Valor** (input numérico, min 1) + **unidade** (select; mês/ano rotulados com aproximação). Em "entre": dois pares valor+unidade (início e fim), validação `(fim) > (início)` em segundos.
  - **Frase-exemplo viva** sob os controles, recalculada: *"Mostra conversas esperando há **10 min ou mais**."* / *"...há **no máximo** 10 min."* / *"...**entre** 5 min e 1 h."*
  - **Aviso inline** (ícone info, não tooltip) quando indicador ∈ {waiting, open}: *"'Sem resposta há' e 'Aberta há' só existem em conversas não resolvidas — conversas resolvidas não aparecem com este filtro."*
  - **Aviso contextual** quando `statuses` inclui Resolvida **e** indicador ∈ {waiting, open}: *"Resolvida + este filtro se excluem (resultado vazio). Para medir tempo em resolvidas, use 'Parada há'."*
  - Botão "limpar" do bloco.

**Chips (`AppliedFiltersChips`)** — precisa de **ramo novo** (objeto/enum não cabem no esquema id-array atual):
- `Data: Criado em` — só quando `dateField ≠ "updated"` **e** `period ≠ "todos"`.
- Duração, texto alinhado à microcopy (sem `≥`): `Sem resposta há: no mínimo 10 min` · `Aberta há: entre 5 min e 1 h` · `Parada há: no máximo 2 meses (≈60 dias)`.
- Remoção individual zera o respectivo campo.

---

## 6. Persistência (URL searchParams) e contadores

`serializeFilterState`/`deserializeFilterState` (`src/lib/reports/filter-state.ts`) — params novos (não colidem com existentes):

- `dateField`: `date=created` (omitido em `updated`/default).
- `durationFilter`: `dur=<indicator>:<mode>:<value>:<unit>` e, em `between`, `dur=<indicator>:between:<value>:<unit>:<valueEnd>:<unitEnd>`.
  - Ex.: `dur=waiting:gte:10:minute` · `dur=open:between:5:minute:1:hour`.
  - Parsing defensivo: qualquer token inválido → filtro ignorado, página não quebra.
- **`diffFilterStates`** e o memo **`appliedCount`** (`advanced-filters.tsx`) DEVEM passar a considerar `dateField`/`durationFilter`, senão o banner "Aplicar (N)" e o badge "Filtros · N" ficam defasados.
- **`EMPTY_FILTER_STATE`** ganha `dateField: "updated"` e `durationFilter: undefined`; os handlers `handleReset`/`handleResetFiltersOnly` devem limpá-los.
- Presets (`useFilterPresets`, localStorage) salvam os novos campos junto do `FilterState` (transitivo). Presets/URLs antigos sem `date`/`dur` → defaults; o condition-builder antigo (segundos crus) continua válido pois **não é alterado**.

---

## 7. Edge cases / decisões

1. **Resolvidas + waiting/open** → conjunto vazio. Tratado por aviso inline + contextual (§5), não só tooltip.
2. **Valor 0/negativo/vazio** → inválido, ignorado. Input min 1.
3. **"Entre" com fim ≤ início** (comparando em segundos) → bloqueado na UI e ignorado na deserialização.
4. **Period "Todos" + Data** → controle desabilitado; chip de Data oculto (§4.1, §5).
5. **Compatibilidade** → URLs/presets antigos seguem funcionando; condition-builder inalterado.
6. **Export XLSX** → estende `ExportConversasInput` com `durationFilter` (e usa o `periodColumn` que já viaja em `filters`); `ExportButton` recebe `durationFilter` via prop do `ConversasPageClient`; aplica `matchDuration` + materializa `stalled_seconds`.
7. **Um indicador por vez no bloco global**; combinações livres (e seus avisos) ficam no condition-builder do Avançado.
8. **Base temporal** → `stalled` usa `serverNow` (prop) para alinhar com waiting/open do servidor; documentado.

---

## 8. Critérios de sucesso

- "Criado em" + "Este mês" lista **apenas** conversas criadas em junho (validado contra dado real).
- "Sem resposta há: no mínimo 10 minutos" lista apenas conversas não resolvidas com cliente aguardando ≥ 10 min (tempo **exato**), coerente com a coluna (que arredonda para leitura).
- "Parada há: no mínimo 7 dias" lista conversas sem qualquer movimento há ≥ 7 dias.
- Modos "no máximo" e "entre" (com unidades distintas no fim) funcionam.
- Export XLSX reflete exatamente a tela.
- Chips, presets, URL, banner "Aplicar (N)" e badge "Filtros · N" refletem Data/Duração; URLs/presets antigos seguem funcionando.
- `npx tsc --noEmit` e `npm test` da área verdes.

---

## 9. Arquivos impactados

- `src/lib/reports/filter-state.ts` — tipos `DateField`/`DurationFilter`; (de)serialização (`date`/`dur`); `EMPTY_FILTER_STATE`; **`diffFilterStates`**.
- `src/lib/reports/match-duration.ts` — **novo** (`matchDuration` + `deriveStalledSeconds` + conversão de unidades) + testes.
- `src/app/(protected)/relatorios/conversas/page.tsx` — `dateField` → `periodColumn`; capturar `serverNow`; passar `durationFilter`/`serverNow` ao client.
- `src/components/reports/conversas-table.tsx` — materializar `stalled_seconds`; aplicar `matchDuration`; `title` exato nas células de duração.
- `src/components/reports/filters-dialog.tsx` — bloco fixo (Data + "Filtrar por tempo") no topo; `stalled_seconds` no builder; avisos inline/contextual; texto do AlertDialog de troca de aba.
- `src/components/reports/advanced-filters.tsx` — `appliedCount` (incluir Data/Duração); handlers de reset; passar `durationFilter` ao `ExportButton`; definição do campo `stalled_seconds` no builder.
- `src/components/reports/applied-filters-chips.tsx` — ramo novo para Data (enum) e Duração (objeto); textos sem `≥`.
- `src/lib/actions/reports/conversas-export.ts` — `ExportConversasInput.durationFilter`; materializar `stalled_seconds`; aplicar `matchDuration`.
- `src/components/reports/export-button.tsx` — prop `durationFilter`.
- `src/lib/utils/apply-conditions.ts` — (somente leitura; comportamento `null`→exclui confirmado) — materialização de `stalled_seconds` ocorre upstream.
- Constantes de descrição/microcopy reaproveitadas entre tooltip, frase-exemplo e chips.
