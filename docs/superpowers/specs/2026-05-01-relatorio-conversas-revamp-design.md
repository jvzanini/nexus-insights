# Spec: Revamp do relatório `/relatorios/conversas` (v0.17.0)

> **Data**: 2026-05-01
> **Versão alvo**: v0.17.0 (fallback v0.18.0)
> **Sessão**: claude-conversas-v017
> **Workflow**: brainstorming → spec v1→v2→v3 → plan v1→v2→v3 → subagent-driven-development → verification → review → finishing
> **Status**: v3 final

---

## 1. Objetivo

Resolver 7 dores acumuladas no relatório de conversas que comprometem a experiência do super_admin no dia a dia da Matrix Fitness Group:

1. **Não há exportação** para planilha — operacional precisa abrir tabela no Excel pra cruzar com outras fontes.
2. **Drill-down inline** está com layout desalinhado (espaço fantasma embaixo dos atributos, etiquetas ausentes do expand).
3. **Coluna Ações** com botão "Abrir" duplica o `display_id` — desperdiça largura.
4. **Busca avançada** está serializada na URL (`?q=`) mas o backend ignora — usuário digita e nada acontece.
5. **Paginação por página** ("100 por página" / "Todos") + botão "Carregar mais" trava com 5–10k conversas, dá erro intermitente.
6. **Loading invisível** durante transitions: tabela só fica fosca, sem feedback claro.
7. **Tour onboarding** desatualizado em relação à nova organização da página.

Solução consolidada nesta release única (v0.17.0).

---

## 2. Restrições e dependências

### 2.1 Coordenação multi-agente (regra absoluta)

Há 2 agentes paralelos:

- **claude-nex-suite-refinement (v0.16.0)** — em fase spec/plan; toca `prisma/schema.prisma`, `src/app/(protected)/configuracoes/page.tsx`, `src/components/ui/calendar.tsx`, `src/lib/llm/*`, `src/lib/nex/*`, `src/components/agente-nex/**`, `src/lib/reports/cost-detail.ts`, `src/components/reports/usage-table.tsx`, `src/components/reports/usage-charts.tsx`. Inclui **per-account URL do Chatwoot** em `/configuracoes` (account_id → URL pública).
- **claude-integracoes-powerbi (v0.17.0)** — em fase spec/plan, aguardando v0.16.0; toca `prisma/schema.prisma`, `src/app/(protected)/integracoes/**`, `src/components/integracoes/**`, `src/lib/integrations/**`, `src/components/layout/sidebar.tsx`.

**Sobreposição em código fonte**: zero (minha feature vive em `src/components/reports/conversa*` + `src/lib/actions/reports/conversas*` + `src/lib/chatwoot/queries/conversas-list.ts` + `src/lib/chatwoot/filters.ts` + `src/lib/tours/conversas-tour.ts`).

**Sobreposição em arquivos de release** (`package.json`, `CHANGELOG.md`, `docs/STATUS.md`): inevitável; resolvida via rebase + decisão de versão dinâmica (v0.17.0 default, fallback v0.18.0 se powerbi entregar primeiro).

### 2.2 Dependência funcional do nex-suite v0.16.0

Botão de abrir conversa no Chatwoot precisa do **per-account URL** que o nex-suite vai cadastrar em `/configuracoes`. **Acoplamento via `src/lib/chatwoot/deep-link.ts`**: meu código continua chamando `chatwootConversationUrl(accountId, displayId)`. Quando v0.16.0 cair, o helper passa a ler URL do DB internamente — sem mudança no meu código.

Se v0.16.0 cair **depois** do meu deploy: o helper continua usando `process.env.CHATWOOT_BASE_URL` como hoje (zero quebra). Quando v0.16.0 cair, o link passa a ser per-account de graça.

### 2.3 Stack e versões

- Next.js 16.2.2 (App Router), TypeScript 5.x, React 19.2.
- Tailwind v4, base-ui (shadcn-style com prop `render`).
- PostgreSQL via `@/lib/chatwoot/pool` (read-only para o banco do Chatwoot).
- BullMQ + Redis (não usado nesta feature).
- Jest + jest-mock-extended + RTL para testes.

### 2.4 Banco do Chatwoot — somente leitura

Toda escrita via Server Actions; toda leitura na DB do Chatwoot é read-only. Buscas com ILIKE não são otimizadas com `pg_trgm` nesta release (volume baixo: ≤10k conversas filtradas por período + filtros já reduzem dataset; ILIKE plain é aceitável).

---

## 3. Escopo funcional

### 3.1 Exportação XLSX

#### 3.1.1 Botão e gatilho

- **Localização**: toolbar (`AdvancedFilters`), ao lado dos chips "Filtros" e "Ordenação".
- **Aparência**: `<Button variant="outline" size="sm">` com ícone `Download` (lucide). Texto "Exportar".
- **Estados**: idle → loading (Loader2 spin + texto "Gerando…" + disabled) → idle.
- **Erro**: toast vermelho com mensagem; estado idle restaurado.
- **Sucesso**: download iniciado pelo browser (Blob), botão volta a idle.

#### 3.1.2 Conteúdo da planilha

- **Formato**: XLSX (via `exceljs`).
- **Aba única**: "Conversas".
- **Header congelado** (`worksheet.views = [{ state: 'frozen', ySplit: 1 }]`), bold, fundo cinza claro.
- **Colunas fixas** (sempre presentes, nessa ordem):
  | # | Nome da coluna | Tipo | Origem |
  |---|----|----|----|
  | 1 | `#` | número | `display_id` |
  | 2 | `Nome` | texto | `contact.name` |
  | 3 | `WhatsApp` | texto | `formatPhone(contact.phone_number)` |
  | 4 | `Documento` | texto | `detectDocument(contact).formatted` |
  | 5 | `Estado` | texto | `inbox.name` |
  | 6 | `Departamento` | texto | `team.name` |
  | 7 | `Atendente` | texto | `assignee.name` |
  | 8 | `Status` | texto | "Aberta" / "Resolvida" / "Pendente" / "Snoozed" |
  | 9 | `Prioridade` | texto | "—" / "Baixa" / "Média" / "Alta" / "Urgente" |
  | 10 | `Etiquetas` | texto | join(", ") dos `labels.name` |
  | 11 | `Criado em` | texto pt-BR | `formatDateTime(created_at)` |
  | 12 | `Última atualização` | texto pt-BR | `formatDateTime(last_activity_at)` |
  | 13 | `Sem resposta há` | texto | `formatDuration(waiting_seconds)` ou "—" |
  | 14 | `Aberta há` | texto | `formatDuration(open_seconds)` ou "—" |
- **Colunas dinâmicas** (atributos): para cada chave única encontrada em `custom_attributes` de qualquer conversa filtrada, uma coluna extra com nome `Atr: <chave>`. Ordem alfabética. Vazio quando a conversa não tem aquela chave.
  - Exemplo: se o conjunto contém `cpf`, `plano`, `unidade`, viram colunas 15 `Atr: cpf`, 16 `Atr: plano`, 17 `Atr: unidade`.
  - Cap: máximo 50 colunas dinâmicas (defensivo, evitar planilha de 500 colunas se algum atributo é livre). Se exceder, mantém as 50 mais frequentes + linha de footer "Outras: N atributos não exportados".
  - Valores complexos (objetos/arrays): `JSON.stringify`.
  - Valores `null`/`undefined`/`""`: célula vazia.

#### 3.1.3 Filtros e ordenação respeitados

A exportação **DEVE** respeitar:

1. **Período** (range date selecionado).
2. **Filtros simples** (inboxIds, teamIds, assigneeIds, statuses, priorities, labelIds).
3. **Filtros avançados** (`conditionGroup`).
4. **Atalhos rápidos** (mergeados no `composedConditionGroup`).
5. **Busca** (`?q=...` quando aplicada).
6. **Ordenação** (`sortStack`) — comparação executada no servidor antes do export.

A exportação **NÃO** respeita:

- Limite de páginas/visíveis (não há mais paginação).
- Colunas ocultas via `<ColumnsToggle>` — exportação sempre traz todas as 14 + atributos.

#### 3.1.4 Cap de linhas

- **MAX_EXPORT_ROWS** = 50.000 linhas.
- Se filtros retornarem > 50.000: exporta primeiras 50k (já ordenadas), e adiciona linha de header banner — alternativa: incluir linha 1 acima do header com aviso. **Decisão: toast warning** "Mostrando primeiras 50.000 — refine os filtros para exportar tudo." E uma célula vazia rasa abaixo da última linha não é ideal pra Excel; ficamos só com o toast warning + log no servidor.

#### 3.1.5 Filename

`conversas_<accountId>_<periodo-iso>_<timestamp>.xlsx`

Exemplos:
- `conversas_9_2026-04-29_2026-04-29_202605011842.xlsx` (período "Hoje")
- `conversas_9_2026-04-26_2026-05-02_202605011842.xlsx` (período "Esta semana")
- `conversas_9_todos_202605011842.xlsx` (período "Todos")

#### 3.1.6 Performance

- Geração in-memory (Buffer). exceljs aceita stream também, mas pra ≤50k rows, in-memory é mais simples.
- Tempo alvo: < 5s para 10k rows; < 20s para 50k rows.
- Server Action retorna `{ blobBase64: string, filename: string }`. Cliente decodifica + dispara download via `<a download>` ou `URL.createObjectURL`.
- Alternativa rejeitada: Route Handler streaming (mais código, ganho marginal pra esse volume).

#### 3.1.7 Permissão

Mesma do relatório (`isReportVisibleForUser('conversas', user.platformRole)`). Validada na Server Action.

### 3.2 Drill-down inline redesenhado

#### 3.2.1 Layout das 3 seções

Cada seção é uma linha `flex flex-wrap items-baseline gap-x-3 gap-y-1`:

```
WhatsApp           +55 11 9 1234-5678
Etiquetas          [VIP]  [recorrente]  [matriz]
Atributos (3)      [cpf: 123.456.789-00]  [plano: gold]  [unidade: SP-01]
```

- **Rótulo**: `text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`. Largura mínima 100px (alinha tudo).
- **Conteúdo**: chips ou texto inline.
- **WhatsApp**: `font-mono text-[14px] tabular-nums text-foreground`.
- **Etiquetas**: chips no mesmo formato de `<LabelsChips>`. Se vazio: "—".
- **Atributos**: contador `(N)` na mesma linha do rótulo + chips chave:valor. Se vazio: "— sem atributos".

#### 3.2.2 Container

- `<div role="region" className="space-y-2 bg-muted/30 p-4 text-[13px]">`.
- `space-y-2` (era `space-y-3`) — reduz gap entre seções.
- Sem `pt-1` no rodapé (já não existe `<div justify-end>` do botão Abrir).

#### 3.2.3 Atributos overflow

- Cap inicial de 24 chips (igual hoje).
- Botão "Ver mais (N)" e "Recolher" mantidos.

#### 3.2.4 Botão "Abrir no Chatwoot" removido

A função migra para a coluna `#ID` (ver §3.3).

### 3.3 Coluna `#ID` clicável (substitui Ações)

#### 3.3.1 Aparência

- Idle: `<a>` ou `<button>` com `border border-border/50 rounded-md px-2 py-0.5 text-[13px] font-mono tabular-nums text-muted-foreground transition-colors`.
- Hover: `border-violet-500/60 bg-violet-500/5 text-violet-500`.
- Focus-visible: `ring-2 ring-violet-500/40 ring-offset-1`.
- Tooltip nativo: `title="Abrir conversa #N no Chatwoot"`.
- aria-label: `"Abrir conversa #N no Chatwoot"`.

#### 3.3.2 Comportamento

- Click: abre `chatwootConversationUrl(accountId, displayId)` em nova aba (`target="_blank" rel="noopener noreferrer"`).
- `e.stopPropagation()` no click — não toggle drill-down.
- `e.stopPropagation()` no keydown enter/space também.

#### 3.3.3 Touch target

- Padding `px-2 py-0.5` + min-height inerente da `<TableRow>` cobre touch target mínimo de 44px (a row é alta o bastante).

#### 3.3.4 Renderização — element type

Decisão: usar `<a target="_blank" rel="noopener noreferrer">` em vez de `<button onClick>`.

Motivos:
- Browser handles middle-click (abre em nova aba), Cmd+Click (mesma coisa), copy-link.
- Sem precisar de JS pra abrir nova aba.
- Mais acessível (link semântico).

### 3.4 Coluna Etiquetas removida da tabela

- Definição da coluna `labels` sai do array `COLUMNS` em `conversas-table.tsx`.
- Sai do mapping de `<ColumnsToggle>`.
- Etiquetas aparecem **APENAS** no drill-down.
- **Filtro `labelIds` no `FilterState` → mantido**. Continua funcionando em `<FiltersDialog>`, `<AppliedFiltersChips>`, `<QuickFiltersPopover>`. O backend (`buildBaseFilter`) já trata `labelIds`.
- **Sort por etiqueta**: já não existia (`sortable: false`).

### 3.5 Coluna Ações removida

- Função `buildColumns(accountId)` que adicionava coluna `actions` é simplificada/eliminada — `COLUMNS` direto.
- `<OpenInChatwoot>` no body da tabela e no drill-down: removido.
- Em mobile/cards: também remove. Substitui por: `#ID` clicável também na versão mobile.
- Arquivo `src/components/reports/open-in-chatwoot.tsx`: deletar **se** não houver outros consumidores. Verificar uso em `recent-conversations-table.tsx` e onde mais — manter se houver.

### 3.6 Busca server-side

#### 3.6.1 Trigger

Já é Enter (já existe). Mantém.

#### 3.6.2 Backend

Adicionar parâmetro `search?: string` em `ReportFilters` (`src/lib/chatwoot/filters.ts`). Quando presente, `buildBaseFilter` adiciona cláusula `AND (...)` com OR de ILIKEs:

```sql
AND (
  ct.name ILIKE $N
  OR ct.phone_number ILIKE $N
  OR ct.identifier ILIKE $N
  OR ix.name ILIKE $N
  OR tm.name ILIKE $N
  OR u.name ILIKE $N
  OR c.display_id::text ILIKE $N
  OR c.custom_attributes::text ILIKE $N
  OR EXISTS (
    SELECT 1 FROM taggings tg
    JOIN tags t ON t.id = tg.tag_id
    WHERE tg.taggable_id = c.id
      AND tg.taggable_type = 'Conversation'
      AND t.name ILIKE $N
  )
  OR (
    CASE c.status
      WHEN 0 THEN 'Aberta'
      WHEN 1 THEN 'Resolvida'
      WHEN 2 THEN 'Pendente'
      WHEN 3 THEN 'Snoozed'
      ELSE ''
    END
  ) ILIKE $N
  OR (
    CASE c.priority
      WHEN 0 THEN 'Baixa'
      WHEN 1 THEN 'Media'
      WHEN 2 THEN 'Alta'
      WHEN 3 THEN 'Urgente'
      ELSE ''
    END
  ) ILIKE $N
)
```

Com `$N` = `'%' || sanitize(search) || '%'`. `sanitize`: escape de `%` e `_` literais → `\%` `\_`.

#### 3.6.3 Sanitização

- Trim.
- Escape de `%` e `_` (LIKE wildcards) com `\` (e `ESCAPE '\'` no SQL).
- Limit 256 chars.

#### 3.6.4 Comportamento

- User digita → `setDraft({ search })`.
- Enter → `handleApply()` (já existe) que faz `setApplied(draft) + pushUrl(draft)`.
- O Server Component re-renderiza com novo `?q=...`, page passa pra `fetchConversas({ filters: { ..., search } })`.
- Loading via `<ContentLoadingWrapper>` ativo durante transition (já existe).

#### 3.6.5 Status/prioridade — match em pt-BR

Translation map em `src/lib/chatwoot/conversas-translations.ts` (NEW), reusado pelo SQL CASE acima e pelo XLSX builder.

```ts
export const STATUS_LABELS = { 0: 'Aberta', 1: 'Resolvida', 2: 'Pendente', 3: 'Snoozed' };
export const PRIORITY_LABELS = { 0: 'Baixa', 1: 'Media', 2: 'Alta', 3: 'Urgente' };
```

Match por ILIKE → "abert%" filtra status=0. "med%" filtra priority=1. "urg%" filtra priority=3.

### 3.7 Sem paginação visual + sem "Carregar mais" + virtualização

#### 3.7.1 UI removida

- `<CustomSelect value={pageSize}>` (PAGE_SIZE_OPTIONS) → removido.
- `<InfiniteScrollSentinel>` → removido.
- Botão "Carregar mais" → removido.
- Footer com erro → mantém (banner de erro fica).
- `data-tour='page-size'` → removido.

#### 3.7.2 Backend trazendo tudo

`fetchConversas` muda comportamento:
- Sempre passa `limit: MAX_TABLE_ROWS = 10_000` para `conversasList`.
- Cursor sempre null no fetch inicial e único.
- Não há paginação no client.
- Se backend retornar `nextCursor` (significa que > 10k conversas matcheram): banner amarelo no toolbar "Mostrando primeiras 10.000 — refine os filtros".

#### 3.7.3 Virtualização da tabela

Nova lib: `@tanstack/react-virtual` v3+.

Estrutura:
- Wrapper `<div className="relative" style={{ height: ... }}>` controla altura.
- `useVirtualizer({ count: rows.length, estimateSize: () => 48, getScrollElement, overscan: 8 })`.
- `rowVirtualizer.getVirtualItems().map(...)` renderiza só linhas visíveis.
- Linha expandida (drill-down) tem altura variável: usar `measureElement`.
- Thead sticky (`position: sticky; top: 0`) continua funcionando (não-virtualizado).

#### 3.7.4 Mobile/cards

- Lista `<ul>` em mobile também ganha virtualização (mesma lógica, com `estimateSize: () => 200`).
- Alternativa: manter mobile sem virtualização porque dataset menor é raro e cards têm altura variável demais. **Decisão**: manter mobile sem virtualização por simplicidade (o critério de mobile reduz dataset visualmente menos crítico; super_admin testa em desktop).

### 3.8 Loading overlay polish

- `<LoadingOverlay>` ganha prop `label` dinâmico:
  - "Carregando conversas..." (default em mudança de filtros / período).
  - "Buscando..." (transition de busca).
  - "Gerando planilha..." (durante export).
- `Loader2` mantém `animate-spin`. Adiciona `motion-safe:animate-pulse` no container externo (ritmo mais suave).
- `bg-card/80 backdrop-blur-sm` → mantém.
- Container externo: `<div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/70 backdrop-blur-md">` (ligeiramente mais blur).
- Respeita `prefers-reduced-motion` (já que `motion-safe:` aplica).

### 3.9 Tour onboarding atualizado

`src/lib/tours/conversas-tour.ts`:

- **Remover** step `page-size` (componente sumiu).
- **Atualizar** step `open-action`:
  - `targetSelector: "[data-tour='open-action']"` (continua, mas o seletor agora é a coluna `#`).
  - `title: "Abrir no Chatwoot"`.
  - `description: "Clique no número da conversa para abrir direto no Chatwoot, em uma nova aba."`.
  - `placement: "right"`.
- **Atualizar** step `drill-down`:
  - `description: "Clique em qualquer parte da linha (exceto o número) para ver WhatsApp, etiquetas e atributos completos."`.
- **Atualizar** step `search`:
  - `description: "Digite e pressione Enter para buscar em nome, WhatsApp, documento, departamento, etiquetas, atributos e mais."`.
- **Adicionar** step `export` (novo):
  - `targetSelector: "[data-tour='export']"`.
  - `title: "Exportar"`.
  - `description: "Gera planilha XLSX com todos os resultados (até 50.000) respeitando filtros, ordenação e busca."`.
  - `placement: "bottom"`.

---

## 4. Arquitetura

### 4.1 Diagrama de fluxo (busca + tabela)

```
[ user digita "joão" ] ──Enter──▶ AdvancedFilters.handleApply()
                                       │
                                       ▼
                       setApplied + pushUrl(?q=joão)
                                       │
                                       ▼
                          Next.js push transition pendente
                                       │
                                       ▼
[ContentLoadingWrapper]──show:true─▶ <LoadingOverlay label="Buscando..." />
                                       │
                                       ▼
                  Server Component re-render: ConversasPage
                                       │
                                       ▼
        fetchConversas({ filters: { ..., search: 'joão' }, limit: 10000 })
                                       │
                                       ▼
                           conversasList(args)
                                       │
                                       ▼
                  buildBaseFilter (com cláusula ILIKE OR)
                                       │
                                       ▼
                              SQL → pool.query
                                       │
                                       ▼
                  rows[] + nextCursor (se > 10k matcham)
                                       │
                                       ▼
                  ConversasPageClient → ConversasTable
                                       │
                                       ▼
                  useVirtualizer renderiza viewport
                                       │
                                       ▼
            [ContentLoadingWrapper]──show:false──▶ overlay desaparece
```

### 4.2 Diagrama de fluxo (export)

```
[user click "Exportar"] ──▶ ExportButton onClick
                                       │
                                       ▼
                    setLoading(true) + toast.loading("Gerando planilha...")
                                       │
                                       ▼
       exportConversasAction({ filters, conditionGroup, sortStack, accountId })
                                       │
                                       ▼
                     Server Action: getCurrentUser + permissões
                                       │
                                       ▼
                  conversasList(filters, limit=MAX_EXPORT_ROWS)
                                       │
                                       ▼
                       sortRows(rows, sortStack)  (mesma lógica do client)
                                       │
                                       ▼
                       applyConditions(rows, conditionGroup)
                                       │
                                       ▼
                     buildXlsxBuffer(rows, customAttrKeys)
                                       │
                                       ▼
                  return { base64: buffer.toString('base64'), filename }
                                       │
                                       ▼
                Client decodifica + a.download = ... + click
                                       │
                                       ▼
                  toast.success + setLoading(false)
```

### 4.3 Componentes (boundary)

```
src/components/reports/
├── conversas-page-client.tsx          (mantido — wiring)
├── conversas-table.tsx                (REFATOR — virtualização + sem paginação + #ID clicável)
├── conversa-drill-down.tsx            (REFATOR — 3 seções inline)
├── advanced-filters.tsx               (PATCH — botão Exportar próximo a Filtros/Ordenação)
├── loading-overlay.tsx                (PATCH — label dinâmico + pulse)
├── export-button.tsx                  (NEW — encapsula loading + Server Action call + download)
└── open-in-chatwoot.tsx               (DELETE se não há outros consumidores; senão mantém só pra mobile/cards de outros lugares)

src/lib/actions/reports/
├── conversas.ts                        (PATCH — passa search down)
└── conversas-export.ts                 (NEW — Server Action, gera XLSX)

src/lib/reports/
└── conversas-xlsx.ts                   (NEW — buildXlsxBuffer puro testável)

src/lib/chatwoot/
├── queries/conversas-list.ts           (PATCH — search ILIKE)
├── filters.ts                          (PATCH — campo search no ReportFilters + buildBaseFilter)
└── conversas-translations.ts           (NEW — STATUS_LABELS / PRIORITY_LABELS)

src/lib/tours/
└── conversas-tour.ts                   (PATCH — remove page-size, atualiza open-action/drill-down/search, adiciona export)
```

### 4.4 Persistência

- `conversas-table-page-size` localStorage → migrado e ignorado (lia `"100"` ou `"all"`); cleanup automático.
- Demais persistências (cols, sortStack via parent) → mantidas.

### 4.5 Telemetria

Reusar `console.error` já existente. Sem nova telemetria nesta release. Auditoria via `logAudit` para export (action: `report_exported`, scope `conversas`).

---

## 5. Modelo de dados

Sem alterações de schema. Tudo existente.

`ReportFilters` (em `src/lib/chatwoot/filters.ts`) ganha campo opcional:

```ts
export interface ReportFilters {
  // ... existentes
  search?: string;  // NEW
}
```

`FetchConversasInput` herda automaticamente.

---

## 6. Erros, edge cases, defensivos

### 6.1 Export

- **Sem rows** após filtros: gera XLSX só com header + 1 linha vazia "Nenhuma conversa." OU bloqueia o botão. **Decisão**: bloqueia botão (`disabled` + tooltip "Sem conversas para exportar").
- **Erro SQL**: retorna `{ error: "Erro ao gerar planilha" }`; UI mostra toast e botão volta a idle.
- **> 50k rows**: trunca em 50k + toast amarelo "Mostrando primeiras 50.000 — refine os filtros."
- **Permissão negada**: Server Action redirect/throw → UI captura e mostra toast.
- **Memória**: 50k linhas × ~30 colunas = 1.5M células. exceljs in-memory consome ~150-300MB. Aceitável em servidor com 1GB+. Documentar no runbook que pico de RAM ocorre nesta ação.

### 6.2 Busca

- **Empty string**: `search` undefined → cláusula não adicionada (sem mudança).
- **Caracteres especiais**: regex chars não relevantes; `%` e `_` escapados.
- **String muito longa**: cap 256 chars (silencioso).
- **Match sem resultados**: empty state já existe ("Nenhuma conversa encontrada · Limpar filtros").

### 6.3 #ID clicável

- **Conversa sem display_id** (improvável): renderiza apenas `#?` sem link clicável.
- **Mobile**: `target="_blank"` abre nova aba; iOS/Android lidam.
- **accountId inválido**: `chatwootConversationUrl` gera URL malformada — quando v0.16.0 cair, helper passa a retornar fallback (env var). Hoje sempre tem env var.

### 6.4 Virtualização

- **0 rows**: empty state mostrado, virtualizer não monta.
- **Linha expandida no meio**: `measureElement` recalcula altura. Overscan 8 garante que vizinhas estão renderizadas.
- **Resize do viewport**: `useVirtualizer` reage automaticamente.
- **Print**: virtualização quebra print. **Workaround documentado no runbook**: usar Export XLSX em vez de print.

### 6.5 Tour

- Step `export` aparece em quem nunca completou tour. Quem completou tour antes (localStorage `tour-conversas-completed=true`) NÃO vê. Decisão: bumpar `id` do tour pra `conversas-v2` e re-executar pra todos. Aceito ruído de re-onboarding (1 vez).

### 6.6 Coordenação multi-agente

- **Conflito em CHANGELOG.md**: rebase manual, append v0.17.0 abaixo de v0.16.0. Diff isolado.
- **Conflito em package.json**: rebase manual, version + deps adicionais.
- **Conflito em docs/STATUS.md**: rebase manual.
- **Conflito em src/lib/chatwoot/filters.ts**: arquivo NÃO está na lista compartilhada de `AGENTS.md`, mas vou verificar se outro agente declarou tocar — claude-nex-suite NÃO declarou, claude-powerbi NÃO declarou. Posso modificar livremente.

### 6.7 Versão

- Se `claude-integracoes-powerbi` empurrar v0.17.0 antes de mim: rebase, `git status` pega meu working tree, manualmente bumpo para v0.18.0 (renomeio CHANGELOG section + STATUS).
- Decisão tomada **antes do push** (sempre `git fetch` + `gh run list`).

---

## 7. Acessibilidade (a11y)

Quick Reference §1 + §2:

- **#ID button**:
  - Cursor pointer.
  - aria-label completa.
  - focus-visible ring 2px violet/40.
  - Touch target ≥44px (a row é alta).
  - Keyboard: Enter/Space ativa.
- **Export button**:
  - aria-label "Exportar conversas para planilha XLSX".
  - aria-busy quando loading.
  - Disabled state visual + semântico.
- **LoadingOverlay**:
  - role="status" + aria-live="polite" + aria-label dinâmico.
- **Drill-down**:
  - Mantém role="region" + aria-label.
- **Tabela virtualizada**:
  - Mantém aria-sort em `<th>`.
  - Não-virtualizada ainda no mobile.
  - `aria-rowcount` no `<table>` (real total).

Reduced-motion respeitado em `<LoadingOverlay>` (motion-safe:animate-*).

---

## 8. Testes

### 8.1 Unit (Jest)

- **`src/lib/reports/conversas-xlsx.ts`**:
  - Header tem 14 colunas fixas + dinâmicas alfabéticas.
  - Status traduzido pt-BR.
  - Prioridade traduzida.
  - Datas no formato pt-BR.
  - Linha sem atributo X tem célula vazia.
  - 50 chaves dinâmicas → cap 50.
  - >50 chaves → top 50 mais frequentes.
  - Empty rows → header only.
- **`src/lib/chatwoot/filters.ts`**:
  - `buildBaseFilter` com search adiciona cláusula ILIKE com escape `%`/`_`.
  - search vazio/whitespace → não adiciona cláusula.
- **`src/lib/chatwoot/conversas-translations.ts`**:
  - STATUS_LABELS e PRIORITY_LABELS consistentes.

### 8.2 Component (RTL + jsdom)

- **`<ConversaDrillDown>`**:
  - Renderiza 3 seções (WhatsApp / Etiquetas / Atributos).
  - Etiquetas como chips.
  - Atributos com contador `(N)` na mesma linha.
  - Empty state cada seção.
  - Sem botão "Abrir".
- **`<ConversasTable>`**:
  - #ID renderiza como `<a target="_blank">` com tooltip e aria-label.
  - Click no #ID NÃO toggle drill-down (stopPropagation).
  - Coluna Etiquetas NÃO está em `<ColumnsToggle>`.
  - Coluna Ações NÃO existe.
  - Sem `<CustomSelect>` PAGE_SIZE_OPTIONS.
  - Sem botão "Carregar mais".
- **`<ExportButton>`**:
  - Idle → loading → idle.
  - Disabled quando 0 rows.
  - Toast erro em fail.

### 8.3 Server Action

- **`exportConversasAction`**:
  - Auth fail → error.
  - Permissão fail → error.
  - 0 rows → error "Sem conversas para exportar".
  - 1k rows → buffer válido, base64 não-vazio, filename correto.
  - 51k rows → trunca + warning flag retornado pra UI mostrar toast.

### 8.4 Smoke E2E (manual após deploy)

Rodado pelo super_admin:
1. Filtra por período "Hoje" → tabela renderiza, virtualização suave.
2. Digita "joão" + Enter → loading aparece, resultados aparecem.
3. Click no `#1234` → abre Chatwoot em nova aba.
4. Click em outro lugar da row → drill-down expande, mostra WhatsApp + Etiquetas + Atributos.
5. Click "Exportar" → XLSX baixa, abre no Numbers/Excel, header congelado.
6. Filtra por etiqueta no `<FiltersDialog>` → ainda funciona.
7. Tour com botão `?` → mostra novos steps incluindo Exportar.

---

## 9. Plano de release

1. Implementar com `subagent-driven-development` (TDD por task, ui-ux-pro-max em UI).
2. `npm run typecheck && npm test` → PASS.
3. `npm run build` → PASS.
4. `git fetch origin main` antes de cada commit relevante.
5. `gh run list --limit 5` antes do push.
6. Aguardar v0.16.0 do nex-suite cair em main → rebase contra origin/main.
7. Resolver conflitos em package.json/CHANGELOG.md/STATUS.md.
8. Verificar se claude-integracoes-powerbi empurrou v0.17.0 — se sim, bumpar pra v0.18.0.
9. Push → CI → Portainer redeploy → `/api/health` valida v0.17.0/v0.18.0 LIVE.
10. Manual smoke (§8.4).
11. Avisar usuário pra testar.

---

## 10. Resumo do double-check

**Pente fino #1 (sobre v1)** — 27 achados aplicados em v2:

1. v1 falava "XML" do user, deixei explícito XLSX no §1.
2. Adicionei §2.2 cobrindo dependência funcional do nex-suite e fallback.
3. v1 não deixava claro que coluna Etiquetas REMOVIDA mas filtro intacto. Reescrito §3.4 destacando.
4. v1 não cobria sanitize do search. Adicionado §3.6.3.
5. v1 não tinha cap de 50 colunas dinâmicas. Adicionado §3.1.2.
6. v1 não dizia o que fazer com 0 rows no export. Adicionado §6.1.
7. Touch target em #ID — verificação adicionada §3.3.3.
8. Filename — não tinha format claro. Adicionado §3.1.5.
9. Status/prioridade pt-BR — translation centralizada. Adicionado §3.6.5.
10. Cap de export 50k — esclarecido §3.1.4.
11. Virtualização mobile — decisão explícita §3.7.4 (não virtualiza mobile).
12. LoadingOverlay label dinâmico — adicionado §3.8.
13. Reduced motion — confirmado §3.8 + §7.
14. Tour `id` bump pra `conversas-v2` — §6.5.
15. Auditoria de export — adicionado §4.5.
16. Erro SQL no export — captura §6.1.
17. accountId inválido — fallback §6.3.
18. Virtualização + print quebrado — §6.4.
19. open-in-chatwoot.tsx delete condicional — §3.5.
20. Permissão no export — §3.1.7.
21. Memória de exceljs — documentado §6.1.
22. Tour step `search` description atualizada — §3.9.
23. Tour step `drill-down` description atualizada — §3.9.
24. v1 não cobria escape de `%`/`_` no SQL ESCAPE clause — §3.6.2 e §3.6.3.
25. v1 não detalhava banner "Mostrando primeiras 10000" no toolbar — §3.7.2.
26. Coordenação de rebase contra ambos os agentes — §6.6 expandido.
27. Cap de 256 chars na busca — §3.6.3.

**Pente fino #2 (sobre v2)** — 19 achados aplicados em v3:

1. § 3.1.2 — coluna `Etiquetas` no XLSX com formato `join(", ")` clarificado (era ambíguo se traria chips).
2. § 3.1.4 — inclusão de "linha de banner no XLSX" descartada (Excel sem header igual em row 1 confunde); fica só toast.
3. § 3.6.2 — adicionado `ESCAPE '\'` na cláusula SQL.
4. § 3.6.5 — confirmação que translation é compartilhada entre SQL e XLSX builder pra evitar drift.
5. § 4.3 — diagrama da árvore de componentes com PATCH/NEW/DELETE explícito.
6. § 4.4 — cleanup automático do localStorage `conversas-table-page-size`.
7. § 7 — accessibility: aria-rowcount no `<table>` virtualizada (rowcount ≠ rendered count).
8. § 8.1 — adicionado teste pra translation map.
9. § 9 — checklist de release com verificação de versão dinâmica.
10. § 6.1 — decisão final de bloquear botão (disabled) em 0 rows, em vez de gerar XLSX vazio.
11. § 3.3.4 — escolha de `<a>` em vez de `<button>` justificada (middle-click, copy-link, sem JS).
12. § 3.7.3 — mensuração de altura via `measureElement` para drill-down expand.
13. § 3.7.4 — mobile não virtualizado documentado com motivo.
14. § 6.4 — print quebrado documentado no runbook.
15. § 6.7 — versão dinâmica (v0.17 vs v0.18) com decisão antes do push.
16. § 3.8 — `bg-card/70 backdrop-blur-md` (mais forte) ajustado.
17. § 3.5 — open-in-chatwoot.tsx: investigação de outros consumidores antes de delete.
18. § 3.6.2 — exemplo SQL ESCAPE explícito.
19. § 6.6 — verificação de filters.ts overlap entre 3 agentes.

---

## 11. Aprovação

João Vitor Zanini autorizou autonomia total: aplicar minhas recomendações sem perguntar e seguir o workflow rigoroso até deploy LIVE. Spec consolidada e pronta para writing-plans.
