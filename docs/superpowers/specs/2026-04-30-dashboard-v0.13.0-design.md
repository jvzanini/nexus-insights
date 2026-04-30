# Spec — Dashboard v0.13.0: Polish & Configurabilidade

**Status:** v3 final pós double-check · **Data:** 2026-04-30 · **Versão alvo:** v0.13.0
**Agente:** `claude-dashboard-v013`

> Esta spec passou por **dois pente-finos reais** após a v1 inicial:
>
> - **Pente #1** — encontrou 12 achados concretos (enum AuditAction não-extensível, gramática de `formatRelativeShort`, divergência donut↔retângulo entre spec/plan, `InteractiveAreaChart` não aceita tooltip per-ponto, `byHour` query não precisa mudar, função `expandFullDay` com hack de offset, §11 não cita Pacote H, ambiguidade em `open_prev`, métrica "< 2s" sem baseline, "hoje" sem mode configurável, cache invalidation cross-container, cap de pageSize). Marcados como `[v2]`.
> - **Pente #2** — análise mais profunda (race conditions, edge cases de virada de mês, granularity="day" com buckets vazios, mobile resize, localStorage residual, acessibilidade). Decisões finais marcadas como `[v3]`.
>
> Marcações `[v2]`/`[v3]` indicam pontos onde a spec mudou após review.

---

## 1. Contexto

A versão **v0.12.1** (em produção) entregou Agente Nex completo, credenciais gerenciáveis, custos em BRL com 3 casas decimais, visibility "none" inclusive para super_admin e fix de overscroll.

Após uso, João reportou (via 10 screenshots e descrição em áudio) **9 problemas no dashboard principal e nos drill-downs dos KPIs**. Esta release endereça todos eles, mais 2 melhorias incidentais identificadas durante a investigação.

### 1.1 Problemas reportados

| # | Onde | Problema | Severidade |
|---|------|----------|------------|
| P1 | KpiClickableCard | Texto "Ver detalhes" sobrepõe o sparkline em todos os cards | UX |
| P2 | KpiClickableCard ("Abertas") | Mostra badge "Novo" em vez de % de variação coerente com período anterior | UX |
| P3 | KpiClickableCard ("Taxa de resolução") | Indicador usa sufixo "pp" (ex.: `+12.0pp`) — usuário quer variação relativa em `%` | UX |
| P4 | DashboardFilters | Pills nomeadas "7 dias" e "30 dias" — usuário quer "Semana" e "Mês" | UX |
| P5 | dashboard.ts / drill-down | Filtro "7 dias" / "30 dias" usa janela rolling fixa (últimos 7 dias) — usuário quer **semana atual** (segunda → hoje) e **mês atual** (dia 1 → hoje) como default | Funcional |
| P6 | configuracoes | Não há onde configurar dia de início da semana, nem alternância entre modo "atual" e "rolling" para semana/mês | Funcional |
| P7 | Drill-down "Recebidas" | Mostra "Últimas 20 conversas" — usuário quer **todas**, paginadas | Funcional |
| P8 | Drill-down "Recebidas" | Tempo relativo "há cerca de 2 horas" / "há cerca de 1 hora" parece desordenado e o "cerca de" deve sair (`há X horas`) | UX |
| P9 | StatusDistributionCard drill-down | Clicar em "Resolvido", "Pendente" ou "Adiado" abre dialog com mensagem "será adicionado em uma versão futura" | Funcional |
| P10 [v3] | Tooltip do gráfico por hora | Não fica claro que `14h` significa `14:00–14:59` | Clareza |
| P11 [v3] | Visibilidade Matrix IA | Já filtrado nas queries (`shouldExcludeMatrixIA`), mas precisa auditoria final em todos os drill-downs novos | Confiança |

---

## 2. Objetivos

1. **Variação coerente em todos os KPIs** — todos os 4 cards mostram `±X.X%` vs período anterior (mesma janela deslocada para trás), sem `pp` e sem badge "Novo".
2. **"Semana" e "Mês" baseadas no calendário atual por default** — segunda → hoje (ou primeiro dia configurado), dia 1 → hoje.
3. **Configurações persistidas para dashboard** — super_admin escolhe dia de início da semana e modo (`atual` ou `rolling`) para semana e mês, com efeito em todo o dashboard e drill-downs.
4. **Drill-down de status completo** — Resolvido, Pendente, Adiado têm a mesma riqueza de "Aberto" (lista paginada + distribuição por inbox + total).
5. **Lista paginada server-side** em `Recebidas` e `Resolvidas`, ordenada por `created_at DESC` ("recebidas") / `last_activity_at DESC` ("resolvidas") com 50 itens/página.
6. **Layout sem overlap** entre "Ver detalhes" e o sparkline.
7. **Tempo relativo enxuto** ("há 2h" em vez de "há cerca de 2 horas").
8. **Auditoria de visibilidade** Matrix IA garantindo zero leakage em qualquer drill-down.
9. **Tooltip clarificando intervalos horários** (formato `HH:00 — HH:59`).

---

## 3. Não-objetivos (YAGNI)

- **Não vamos** redesenhar charts ou trocar a biblioteca de visualização.
- **Não vamos** adicionar novos KPIs nem novas distribuições no dashboard principal.
- **Não vamos** mudar as definições de coorte (created_at no período) já consolidadas em v0.10.0.
- **Não vamos** persistir as configurações de dashboard por usuário — é decisão global do super_admin (alinhada com `polling`, `visibility`, `matrix_ia`).
- **Não vamos** mexer em facts/pré-agregação. O dashboard já consulta direto o Chatwoot DB; janelas custom continuam sendo computadas dinamicamente.
- **Não vamos** tocar Conversas, Distribuição, Origem-IA, Performance, Equipe, Mensagens-Não-Respondidas — feedback é exclusivo do dashboard `/dashboard`.

---

## 4. Decisões de design (com **Why** e **How to apply**)

### D1 — Períodos passam a ser parametrizados por **`mode`** + **`weekStartsOn`**

**Decisão:** introduzir `dashboard-period.ts` (helper puro em `lib/`) que recebe `(period, mode, weekStartsOn, tz)` e devolve `{ current, prev }` em UTC.

- `period`: `"hoje" | "semana" | "mes"` (renomeado de `"today" | "7d" | "30d"`).
- `mode`: `"current" | "rolling"` (apenas para semana e mês).
- `weekStartsOn`: 0–6 (0=domingo, 1=segunda, …, 6=sábado).
- `tz`: timezone da plataforma.

**Why:** o helper `getPeriodInTz` em `datetime-core` cobre `semana_atual`/`mes_atual` mas hardcoda `weekStartsOn=1` e usa fim de semana inteira (`nextWeekStartLocal`) — incompatível com a regra "começo até hoje". Encapsular num único módulo evita a duplicação de `periodRanges` que existe hoje em `actions/dashboard.ts` e `actions/dashboard-drill-down.ts`.

**How to apply:**
- **Default config:** `weekStartsOn=1` (segunda), `weekMode="current"`, `monthMode="current"`.
- **`current`:** `start` = início da semana/mês atual; `end` = `endOfDay(now)`.
- **`rolling`:** `start` = `now - 7d` ou `now - 30d`; `end` = `now`.
- **`prev`:** mesma janela deslocada para trás pelo mesmo intervalo. Ex.: se `current=2026-04-27..2026-04-30 23:59`, `prev=2026-04-20..2026-04-23 23:59`.
- O fallback de `getPeriodInTz` antigo continua funcionando — não vamos quebrar callers fora do dashboard.

### D2 — Variação relativa em **`%`** para todos os KPIs (inclusive taxa de resolução)

**Decisão:** unificar `comparison` para usar `pctDiff(current, previous)` em **todos** os cards (incluindo `resolutionRate`). O suffix exibido é sempre `%` e o subtitle do drill-down de Resolução deixa explícito que é variação relativa.

**Why:** João rejeitou explicitamente `pp` ("não tem nada a ver"). Variação relativa também é mais intuitiva ("a taxa subiu 20%" lê-se direto). A consequência inevitável é que pequenas oscilações em pontos percentuais aparecem amplificadas em variação relativa (ex.: 10% → 12% = +20%, não +2pp), mas é exatamente o que ele pediu.

**How to apply:**
- `dashboardData` ⇒ `comparison.resolutionRate` passa a ser `pctDiff(rate, ratePrev)` em vez de `rate - ratePrev`.
- `getResolutionRateDrillDown` ⇒ campo renomeado `diffPp` → `diffPct`. Subtitle do card no drill-down: `Variação relativa: +12.3% (anterior 8.2% → atual 9.2%)`. **[v2]** Adicionar referência aos valores absolutos para evitar leitura ambígua.
- `KpiClickableCard` ⇒ chamada `trendFor(stats.comparison.resolutionRate, "%")` (sufixo "%").

### D3 — KPI "Abertas" passa a ter comparação coerente

**Decisão:** adicionar `comparison.open` em `dashboardData` calculado como `pctDiff(open_current, open_prev)` onde `open_prev` é a contagem de conversas que satisfazem **simultaneamente** `created_at ∈ período_anterior` **E** `status = 0` no instante exato em que a query roda (não snapshot histórico). **[v2]**

**Why:** snapshot histórico de "abertas em algum momento do passado" é frágil (depende de quando a query rodaria); usar mesma coorte das outras 3 métricas mantém a uniformidade conceitual da v0.10.0 ("a métrica fala da coorte criada no período"). A leitura é "quantas das criadas no período anterior ainda estão abertas hoje, vs. quantas das criadas no período atual estão abertas hoje".

**How to apply:**
- Backend: query `sqlOpenPrev` análoga a `sqlOpen` mas com params do `prev`.
- Frontend: `KpiClickableCard` de "Abertas" passa a receber `trend={trendFor(stats.comparison.open, "%")}`.
- Badge "Novo" some completamente do código (era fallback quando `trend === undefined`).

### D4 — Lista paginada server-side em `Recebidas` e `Resolvidas`

**Decisão:** substituir `LIMIT 20` por paginação `?page=N&pageSize=50` controlada por novo componente `<DrillDownPagination>`.

- Server actions ganham parâmetros opcionais: `getReceivedDrillDownAction({ accountId, period, page, pageSize })`.
- Backend (`getReceivedDrillDown`, `getResolvedDrillDown`) retorna `{ ..., page, pageSize, total }`.
- Frontend mantém estados separados de paginação (não muda estado do filtro de período).

**Why:** João pediu "todas". Mas renderizar tudo causa freeze no browser com volume real (sai 5–15k conversas no mês). Paginação 50/pg é o padrão de outras telas de relatório (ex.: Conversas Poderoso). Mantém UX previsível.

**How to apply:**
- Página inicial = 1, `pageSize = 50`. **[v2] Cap de `pageSize` no backend = 200** para evitar abuso e OFFSET extremo em consultas read-only ao Chatwoot DB (que pode não ter índice ideal).
- Quando volume total fica < `pageSize`, esconder paginador.
- Paginador no rodapé da seção. Componente `<DrillDownPagination page={n} total={t} pageSize={ps} loading={bool} onChange={(p)=>...} />`.
- Spinner local na tabela enquanto a página seguinte carrega (não reload do dialog inteiro).

### D5 — Tempo relativo formatado curto e estável

**Decisão:** trocar `formatDistanceToNow(addSuffix=true)` (ptBR) por uma função `formatRelativeShort(date)` que devolve `agora`, `há 5min`, `há 2h`, `há 3d`, `há 2m` (meses), `há 2a` (anos). **[v2]** Evita gramática esquisita do plural ("há 2 mês" não existe; "há 2 meses" é longo demais para tabelas densas). Padrão é abreviação curta consistente.

**Why:** o "cerca de 2 horas / cerca de 1 hora" é fruto do wording padrão do `date-fns` em ptBR (limiar de 30min arredonda pra cima, então 00:31 → "cerca de 1h" e 02:00 → "cerca de 2h", causando aparência de "fora de ordem"). Texto curto desambígua e diminui ruído visual.

**How to apply:**
- Helper em `src/lib/format/relative-time.ts` (puro).
- Usado em `ConversationTable` (ambos drill-downs Recebidas/Resolvidas) e onde mais aparecer "há cerca de".

### D6 — Drill-down de status genérico (Resolvido/Pendente/Adiado/Aberto unificados)

**Decisão:** generalizar `getOpenDrillDown` em `getStatusDrillDown(args, status)` que aceita 0/1/2/3.

- Hoje, `getOpenDrillDown` filtra `c.status = 0`. Vai virar parametrizado.
- Layout do drill-down: **retângulo central com total grande + label do status** (não donut), porque o drill-down já trata de UM único status — donut com 100% de uma fatia só é cosmético/confuso. **[v2]**
- Distribuição por inbox (top 10) à direita do total.
- Lista paginada de conversas abaixo.
- Frontend: `StatusDrillDownContent({ status })` substitui `OpenDrillDownContent`.

**Why:** João quer paridade entre os 4 status no drill-down de pizza. Replicar 3× o código é trash; um helper único é trivial. Retângulo com número grande é mais legível e elimina o uso questionável de `<DonutWithCenter>` para visualizar uma única categoria.

**How to apply:**
- `dashboard-drill-down.ts` ⇒ rename + adiciona `status: 0|1|2|3` no input.
- Chamadas existentes (`OpenDrillDownContent` no drill-down de "Abertas no período" do KPI) passam `status=0` via wrapper de compat.
- Cache key bump de `dashboard-drill-open-v2` → `dashboard-drill-status-v3`.

### D7 — Configurações de dashboard em `/configuracoes`

**Decisão:** novo card `<DashboardSettingsCard initial={...} />` em `/configuracoes` (super_admin only) com:

- Select "Início da semana" (Domingo, Segunda, …, Sábado).
- Select "Modo da semana" (Semana atual, Últimos 7 dias).
- Select "Modo do mês" (Mês atual, Últimos 30 dias).

**Why:** consistente com `PlatformSettingsCard`, `EnabledReportsCard`, `MatrixIAToggleCard` que já vivem na mesma página. Server Action única que aceita as 3 chaves.

**How to apply:**
- 3 chaves novas em `app_settings`:
  - `dashboard.week_starts_on` — int 0..6, default 1.
  - `dashboard.week_mode` — "current"|"rolling", default "current".
  - `dashboard.month_mode` — "current"|"rolling", default "current".
- Cache pull-through 60s (igual aos outros settings, em `lib/dashboard-settings.ts`).
- Server action `saveDashboardSettings({ weekStartsOn, weekMode, monthMode })` em `lib/actions/settings.ts`.
- **[v2]** **Audit log usa `AuditAction.setting_updated` (enum existente do Prisma)** com `details = { section: "dashboard", weekStartsOn, weekMode, monthMode }`. **NÃO criar novo enum** — exigiria migration Prisma fora de escopo. O enum `AuditAction` é tipo PostgreSQL gerado pelo Prisma e não aceita valores arbitrários.
- Card recebe `initial` lido em SSR via `getDashboardSettings()` chamado dentro da page server component.
- "Hoje" não tem mode configurável (sempre dia atual; `week_mode`/`month_mode` só afetam Semana e Mês). **[v2]**

### D8 — Layout do KpiClickableCard sem overlap

**Decisão:** mover o hint "Ver detalhes" para o **mesmo flex container do trend** (linha do topo, abaixo do trend). O sparkline ocupa todo o final do card sem competir com texto.

**Why:** colocar o hint no canto inferior direito sobre o sparkline é inerentemente conflitante. Movido para o topo, ele convive com o ícone de variação. UI/UX Pro Max também recomenda separar zonas de informação numérica vs gráfica em cards densos.

**How to apply:**
- Remover `<span absolute right-3 bottom-3>` do KpiClickableCard.
- Adicionar `<span>` discreto **abaixo** da linha do ícone+trend, alinhado à direita, com fade-in em hover/focus.
- Sparkline ocupa o container inferior sem ressalvas.
- (Decisão de skill UI/UX Pro Max: aplicar `text-[10px]`, `tracking-wide`, `uppercase`, `text-violet-400`, fade `opacity-0 group-hover:opacity-100`.)

### D9 — Pills renomeadas

`Hoje` (mantém) · `Semana` (era "7 dias") · `Mês` (era "30 dias").

**How to apply:** mudar `label` em `DashboardFilters.periods`. O `value` muda também: `"hoje" | "semana" | "mes"` (era `"today" | "7d" | "30d"`).

**Backward compat:** existe um único caller (DashboardContent) e nenhum URL/localStorage persiste isso (default `useState("hoje")` no remount). **[v2]** Caches Redis com keys derivadas dos antigos `"7d"|"30d"` ficarão stale e expirar em 30s (TTL de `dashboardData`). Nenhum vazamento de schema porque também bumpamos `dashboard-data-v2` → `v3`.

### D10 — Tooltip e ariaLabel do gráfico por hora

**Decisão:** deixar explícito que `14h` cobre a janela `14:00 – 14:59`. **[v2]** Mecanismo difere por componente:

- **`ConversationsLineChart`** (Pacote H — `LineChart` direto do recharts com `<CustomTooltip>`): adicionar `windowLabel` no payload do dado e renderizar no tooltip ("Janela: 14:00 – 14:59"). Eixo X mantém `14:00` curto.
- **`drill-down-contents.tsx` `byHour`** (usa `<InteractiveAreaChart>` genérico que **NÃO aceita** label custom por ponto): usar `name = "14:00 – 14:59"` no próprio dado. Recharts auto-deduplica labels longos quando o eixo fica apertado, então densidade fica aceitável; em mobile, recharts já reduz ticks naturalmente.

**Why:** o `InteractiveAreaChart` é compartilhado por outros relatórios. Estender o `<ChartTooltip>` com prop opcional só pra essa feature do dashboard seria over-engineering. Solução do `name` é puxa-saco mas funcional.

- `aria-label` do gráfico passa a incluir "intervalo de hora cheia (HH:00 a HH:59)".

---

## 5. Arquitetura — mudanças por arquivo

### 5.1 Novos arquivos

| Arquivo | Propósito |
|---------|-----------|
| `src/lib/dashboard-period.ts` | Helper puro `getDashboardPeriod({ period, mode, weekStartsOn, tz })` → `{ current, prev }`. Sem deps de DB. Re-export de helpers de `datetime-core`. |
| `src/lib/dashboard-settings.ts` | Server-only. `getDashboardSettings()` lê 3 chaves com cache 60s. `invalidateDashboardSettings()` exposed. |
| `src/lib/format/relative-time.ts` | Puro. `formatRelativeShort(date)`. |
| `src/components/settings/dashboard-settings-card.tsx` | Client. Form com 3 selects + saveAction. |
| `src/components/dashboard/drill-down-pagination.tsx` | Client. Componente de paginação reusável. |
| `src/lib/format/__tests__/relative-time.test.ts` | Unit. |
| `src/lib/__tests__/dashboard-period.test.ts` | Unit (vital — cobre rolling vs current, semana atual em segunda, virada de mês, DST). |
| `src/lib/__tests__/dashboard-settings.test.ts` | Unit. Lê fallback quando setting ausente. |

### 5.2 Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/components/dashboard/kpi-clickable-card.tsx` | Layout: hint reposicionado (D8). Remove fallback "Novo" badge. |
| `src/components/dashboard/dashboard-filters.tsx` | Pills renomeadas (D9). Tipo `DashboardPeriod` atualizado. |
| `src/components/dashboard/dashboard-content.tsx` | Usa novo tipo `DashboardPeriod = "hoje"\|"semana"\|"mes"`. Passa `comparison.open` no card "Abertas". Sufixo de taxa de resolução muda de `"pp"` → `"%"`. |
| `src/components/dashboard/drill-down-contents.tsx` | `ReceivedDrillDownContent` e `ResolvedDrillDownContent` ganham paginação local. `DropdownStatusContent` (renomeado de `OpenDrillDownContent`) genérico. Usa `formatRelativeShort`. Tooltip do gráfico de hora (D10). Subtitle do drill-down de Resolução muda `pp`→`%`. |
| `src/lib/actions/dashboard.ts` | Substitui `periodRanges` local por chamada a `getDashboardPeriod`. Tipo `DashboardPeriod` atualizado. |
| `src/lib/actions/dashboard-drill-down.ts` | Idem. Aceita `page`/`pageSize` em received/resolved. Aceita `status` em status drill (renomeada de `getOpenDrillDownAction` → `getStatusDrillDownAction`, com wrapper compat para `getOpenDrillDownAction`). |
| `src/lib/chatwoot/queries/dashboard-data.ts` | `comparison.open` adicionado. `comparison.resolutionRate` agora é variação relativa. Cache key bump → `dashboard-data-v3`. |
| `src/lib/chatwoot/queries/dashboard-drill-down.ts` | `getReceivedDrillDown` e `getResolvedDrillDown` retornam `{ items, page, pageSize, total }` no lugar de `recent`. `getOpenDrillDown` → `getStatusDrillDown(args, status)`. `getResolutionRateDrillDown` retorna `diffPct` em vez de `diffPp`. Cache keys bumped. |
| `src/app/(protected)/configuracoes/page.tsx` | Importa `DashboardSettingsCard`. Inclui no Promise.all que carrega settings. |
| `src/lib/actions/settings.ts` | Adiciona `saveDashboardSettings({ weekStartsOn, weekMode, monthMode })`. |

### 5.3 Settings/banco

3 chaves novas, todas com fallback hardcoded. Não há migration Prisma — `app_settings` é uma tabela KV genérica.

```
dashboard.week_starts_on   → int (0..6), default 1
dashboard.week_mode        → "current"|"rolling", default "current"
dashboard.month_mode       → "current"|"rolling", default "current"
```

---

## 6. Mudanças de UI (com referência ao design system)

### 6.1 KpiClickableCard

```
┌─────────────────────────────────┐
│ [icon]                  ↗ +12% │   ← linha topo (ícone + trend)
│                       ver det → │   ← novo: hint discreto, mesma linha
│                                 │
│ 24                              │   ← valor
│ Conversas recebidas             │   ← label
│                                 │
│ ───╱╲────╱╲──╲─                 │   ← sparkline FULL-WIDTH
└─────────────────────────────────┘
```

[v3] Após pente fino: hint na **mesma linha do trend** competiria visualmente. Decisão final: hint vai numa **2ª linha**, alinhada à direita, abaixo da linha do trend. Sparkline ocupa o final do card sem competir.

### 6.2 Drill-down "Recebidas" — paginação

Estrutura atual (Volume + 2 distribuições + tabela "Últimas 20"):
- Última seção rotulada hoje "Últimas 20 conversas recebidas"  
- Vai virar "Conversas recebidas (Total: N)"
- Abaixo da tabela: paginador.

### 6.3 Status drill-down (Resolvido/Pendente/Adiado)

Layout idêntico ao "Aberto":
- Donut central com label do status + total
- Distribuição por inbox (top 10)
- Lista paginada de conversas

### 6.4 DashboardSettingsCard

Card simples seguindo padrão do `PlatformSettingsCard`:

```
┌──────────────────────────────────────────────┐
│ ⚙  Configurações do Dashboard                │
│ Define como semana e mês são calculados.    │
├──────────────────────────────────────────────┤
│ Início da semana                             │
│   [ Segunda ▾ ]                              │
│                                              │
│ Modo da semana                               │
│   [ Semana atual ▾ ]                         │
│                                              │
│ Modo do mês                                  │
│   [ Mês atual ▾ ]                            │
│                                              │
│                                  [ Salvar ]  │
└──────────────────────────────────────────────┘
```

Tooltip ou microcopy explicando:
- "Semana atual": começa no dia configurado, vai até hoje.
- "Últimos 7 dias": rolling 7 dias atrás até agora.
- (idem para mês.)

---

## 7. Plano de testes

### 7.1 Unit (Jest)

- **`dashboard-period.test.ts`** — cobertura crítica:
  - `period="hoje"` → start=00:00, end=fim do dia
  - `period="semana"` + `mode="current"` + dia da semana = segunda → start=segunda 00:00 (mesmo dia), end=hoje 23:59 (mesmo dia)
  - `period="semana"` + `mode="current"` + dia da semana = quinta + weekStartsOn=1 → start=segunda, end=quinta 23:59
  - `period="semana"` + `mode="rolling"` → start=now-7d, end=now
  - `period="mes"` + `mode="current"` + hoje = dia 1 → start=dia 1 00:00, end=dia 1 23:59
  - `period="mes"` + `mode="rolling"` → start=now-30d
  - `prev` para cada caso = janela do mesmo tamanho deslocada para trás
  - DST (caso patológico em zona com DST — América/SP não tem mais desde 2019, mas teste passa por safety)
- **`dashboard-settings.test.ts`** — fallback aplicado quando setting ausente; cache invalidado por `invalidateDashboardSettings`.
- **`relative-time.test.ts`** — agora, há 5min, há 2h, há 3d, há 2 mês.

### 7.2 Integration (Jest com mocks de pg)

- `dashboardData` agora retorna `comparison.open`.
- `getResolutionRateDrillDown` retorna `diffPct` em vez de `diffPp`.
- `getStatusDrillDown(status=1)` filtra apenas resolvidas.
- `getReceivedDrillDown({ page: 2, pageSize: 50 })` retorna registros 51..100 e `total` correto.

### 7.3 E2E manual (no PR)

- Limpar cache do navegador, abrir `/dashboard`:
  - Cards: "Ver detalhes" não sobrepõe sparkline.
  - Card "Abertas" mostra `±%` e não "Novo".
  - Card "Taxa de resolução" mostra `±%`, sem "pp".
  - Pills mostram "Hoje | Semana | Mês".
  - Filtro "Semana" mostra dados de segunda → hoje.
  - Filtro "Mês" mostra dados de dia 1 → hoje.
- Abrir "Recebidas":
  - Tabela mostra paginador no rodapé com 50/pg.
  - "há 2h" em vez de "há cerca de 2 horas".
  - Tooltip do gráfico por hora mostra "14:00 – 14:59".
- Abrir status pie:
  - Clicar em "Resolvido" → mostra drill-down completo.
  - Clicar em "Pendente" → drill-down completo.
- `/configuracoes` (super_admin):
  - Card "Configurações do Dashboard" presente.
  - Mudar para "Domingo" + "Últimos 7 dias" → voltar ao dashboard → semana usa rolling.
  - Mudar para "Mês atual" → voltar → mês usa current.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Mudança de tipo `DashboardPeriod` quebra code paths não vistos | Grep global por `"7d"`, `"30d"`. Há apenas em dashboard.ts, dashboard-drill-down.ts, dashboard-content.tsx, dashboard-filters.tsx. |
| Cache antigo serve dados com schema antigo após deploy | Bump cache keys (`dashboard-data-v3`, `dashboard-drill-status-v3`, `dashboard-drill-rate-v2`). Caches v2 ficam stale e expiram em 30s. |
| Mudança de `diffPp` → `diffPct` no payload do drill-down de resolução quebra o frontend antigo do navegador do user enquanto build sobe | Manter ambos os campos no payload por uma versão (v0.13.0 retorna os dois; v0.14.0 remove `diffPp`). Frontend prioriza `diffPct`. |
| Paginação sem `total` deixa usuário sem orientação | Backend sempre retorna `total`; frontend mostra "Página X de Y". |
| Settings do dashboard ausentes em produção (chaves novas) | `getDashboardSettings()` aplica defaults via fallback. Smoke test: rodar query no app sem `dashboard.week_*` e validar que não falha. |
| Performance da query paginada com `OFFSET` grande | `OFFSET 5000 LIMIT 50` é ~100ms em conversations indexadas por created_at. Aceitável para o caso de uso. Otimizar com keyset pagination apenas se reportado. |
| João atualiza um setting do dashboard e cache pull-through serve dados antigos por até 60s | Aceitável (consistente com outros settings). Documentar em runbook se necessário. |

---

## 9. Migration / compatibilidade

- **Sem migration Prisma.** `app_settings` é KV; chaves novas viram defaults aplicados em runtime.
- **Sem mudança de URL.** Pills do dashboard não persistem em querystring; o estado vive em `useState`.
- **Sem mudança de API pública** (não há endpoint REST público).
- **Compatibilidade no payload do drill-down** durante o deploy: `diffPp` mantido junto com `diffPct` por uma versão.

---

## 10. Métricas de sucesso

1. **Visual**: prints depois do deploy comparados aos prints reportados → todos os 9 problemas visualmente endereçados.
2. **Funcional**: `/api/health` mantém status `ok` (`db < 100ms`, `redis < 50ms`). **[v2]** Sem regressão perceptível na carga inicial do dashboard (sem cronômetro formal, mas o subagent valida via `npm run build` e checagem manual de carga após o deploy).
3. **Tests**: 100% das suites passam (`npm test`). Coverage não regride mais que 1pp.
4. **Build**: GitHub Actions verde + Portainer redeploy registra `version=v0.13.0` em `/api/health`.
5. **Sem incidentes** nas 24h pós-deploy. (Verificação manual pelo João — não há monitoramento automatizado neste projeto.)

---

## 11. Sequência de implementação proposta

(Detalhamento completo vai no plan separado.)

1. **Pacote 1 — settings & helpers** (independent, base): `dashboard-period.ts`, `dashboard-settings.ts`, `relative-time.ts` + tests.
2. **Pacote 2 — UI fix do KpiClickableCard** (rápido, isolado).
3. **Pacote 3 — backend dashboard** (`dashboardData` com `comparison.open` + variação relativa em rate, `periodRanges` substituído).
4. **Pacote 4 — backend drill-down** (`getStatusDrillDown` genérico, paginação received/resolved, rename `diffPp`→`diffPct` mantendo compat).
5. **Pacote 5 — frontend dashboard-content** (consumir mudanças backend, novos tipos, pills renomeadas).
6. **Pacote 6 — frontend drill-down-contents** (paginador, status genérico, formatRelativeShort, `name` enriquecido em `byHour`).
7. **Pacote 7 — Settings UI** (`DashboardSettingsCard` + integração com page).
8. **Pacote H — ConversationsLineChart** **[v2]** (TZ explícita no SQL bucket, eixo cheio 0–24h, scroll horizontal centralizado, sem toggle linha/barra). Vai na sequência **antes** do Pacote 8 para que a auditoria final cubra também esse componente.
9. **Pacote 8 — Polish e auditoria final** (Matrix IA confirmada em todos os queries, double-check de cache keys, full typecheck).
10. **Pacote 9 — Release** (CHANGELOG, STATUS, package.json bump, push, Portainer redeploy, watch, smoke `/api/health`).

---

## 12. Pente fino aplicado nesta spec

- ✅ Não há "TBD" nem placeholders.
- ✅ Cada decisão tem **Why** explícito.
- ✅ Escopo isolado ao dashboard — nenhum risco de "feature creep".
- ✅ Backward compat resolvido (caches, payloads, configs).
- ✅ Plano de testes cobre os edge cases reais (semana com segunda = hoje, mês com dia 1 = hoje, DST).
- ✅ UI mockada textualmente; design tokens herdados do `Roteador Webhook Meta`.
- ✅ Riscos enumerados com mitigação concreta.
- ✅ Definição de pronto: 9 problemas reportados resolvidos + 2 incidentais (P10, P11) + tests verdes.

---

## 13. Adendo — Pacote H: Conversations Line Chart (P12–P16)

Após escrita da spec inicial, João reportou problemas adicionais no `<ConversationsLineChart>` (gráfico "Conversas por hora"):

| # | Problema | Prioridade |
|---|----------|------------|
| P12 | Suspeita de timezone duplicado: `created_at AT TIME ZONE 'America/Sao_Paulo'` retorna `timestamp without time zone`; pg-node parseia como UTC; frontend re-aplica BRT → resultado pode ficar 3h deslocado dependendo da TZ do container Node. Containers do projeto não declaram TZ, então default Linux é UTC ⇒ pipeline pode estar correto **por sorte**. Vamos forçar `timestamptz` explícito no SQL pra eliminar ambiguidade. | **Alta** |
| P13 | Labels do eixo X colados na linha base (zero hora "bem coladinho"). Falta margin entre tick e label. | UX |
| P14 | Recharts está pulando horas no eixo (mostra `00, 04, 10, 12, 13, 14, ...`). Usuário quer **todas as horas de 1 em 1**, com auto-densidade só no display dos labels (mostrar só algumas pra não poluir). | UX |
| P15 | Eixo X termina na última hora **com dado** (19:00). Usuário quer eixo cobrir o **dia inteiro 00:00–23:59** quando filtro = "Hoje", com a hora atual centralizada e scroll horizontal. Em mobile, janela visível menor. | Funcional |
| P16 | Toggle linha/barra (`<ChartLineBarToggle>`) é desnecessário — só linha é suficiente. Remover. | Simplificação |

### Decisões adicionais

**D11 — SQL de bucket retorna `timestamptz` UTC explícito**
- Trocar `date_trunc('hour', c.created_at AT TIME ZONE $tz)::timestamp` por `(date_trunc('hour', c.created_at AT TIME ZONE $tz) AT TIME ZONE $tz)`. O segundo `AT TIME ZONE` reinterpreta o `timestamp without TZ` como horário no `tz` informado e devolve `timestamptz` (UTC). pg-node parseia consistentemente como `Date` UTC. Frontend formata com `Intl.DateTimeFormat({ timeZone })` — uma única conversão.
- Aplicar mesma fix em `dashboard-data.ts` (`sqlChart` hora e dia), `dashboard-drill-down.ts` (`sqlChart` em received/resolved e `sqlHistory` em resolution-rate).
- **[v2]** **NÃO mexer em queries `byHour`** — elas usam `EXTRACT(HOUR FROM c.created_at AT TIME ZONE $tz)::int AS hour` que retorna `int 0..23` puro, sem timestamp ambíguo. Já estão corretas.
- **Why:** elimina dependência da TZ do processo Node.js (atual default UTC, mas frágil — qualquer mudança de container quebra silenciosamente a leitura de hora no frontend).

**D12 — Eixo X cheio e centralizado**
- No filtro "Hoje" (granularity=hour): preencher buckets de 0h a 23h no client (gerar 24 entradas; quando bucket sem dado, `received=0, resolved=0`).
- **[v2]** A função de preenchimento `expandFullDay(data, granularity, tz)` deve usar `date-fns-tz` (`fromZonedTime`) para construir o ISO de cada hora local — **sem hack** com `getTimezoneOffset()` do navegador (que usa TZ local do device, não do tz da plataforma).
- Em mobile (`< 640px`), janela visível = 6h centradas em "agora". Scroll horizontal usando `<div class="overflow-x-auto">` envolvendo o chart com `width` mínimo calculado por `numHours * 60px`.
- Em desktop, janela visível = 12h centradas em "agora"; resto acessível via scroll horizontal.
- Tick `interval={0}` força mostrar todos os ticks; em mobile aplicar `interval="preserveStartEnd"` ou tick custom para reduzir densidade.
- Centralizar via `useEffect` que dispara `scrollLeft = anchor - viewport/2` ao montar.
- **[v3]** Quando `granularity === "day"` (Semana/Mês), eixo X **não preenche dias vazios** — fica como hoje (gaps na linha quando dia sem volume). YAGNI nessa release; pode entrar em v0.14 se reportado.

**D13 — Tick/label spacing**
- Adicionar `tickMargin={12}` ou `dy={8}` na `XAxis` do recharts para descer os labels.

**D14 — Remover toggle linha/barra**
- Apagar `<ChartLineBarToggle>` do CardHeader e o BarChart inteiro do JSX. Mantém só `<LineChart>`.
- `useLineBarStorage` e `ChartLineBarToggle` viram código morto — remover do `chart-type-toggle.tsx` (se ninguém mais usa) ou marcar deprecated.

### Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/dashboard/conversations-line-chart.tsx` | Eixo cheio (24h em "Hoje"), scroll horizontal centralizado, tickMargin maior, sem BarChart, sem toggle. |
| `src/components/dashboard/chart-type-toggle.tsx` | Remover `ChartLineBarToggle` e `useLineBarStorage` (código morto). Manter `ChartTypeToggle` (usado por outros cards). |
| `src/lib/chatwoot/queries/dashboard-data.ts` | SQL bucket retorna `timestamptz`. |
| `src/lib/chatwoot/queries/dashboard-drill-down.ts` | Mesma fix em received/resolved/resolution-rate. |
| `src/lib/utils/format-bucket.ts` | Manter. Trabalha 100% com Date UTC; sem mudança. |
| `src/lib/__tests__/timezone-bucket.test.ts` (novo) | Test que comprova: criação 17:00 UTC (= 14:00 BRT) cai no bucket "14:00" no formatBucketLabel(... "America/Sao_Paulo"). |

### Validação P12 (TZ audit)

Adicionar test integration que mocka pg-node com timestamp specifico e valida o output do bucket no frontend:

```ts
// Conversa criada às 14:30 BRT (= 17:30 UTC)
const createdAtUtc = new Date("2026-04-30T17:30:00.000Z");
// SQL trunca para 14:00 BRT, devolve timestamptz UTC
const bucketUtc = "2026-04-30T17:00:00.000Z";
// formatBucketLabel deve devolver "14:00" em BRT
expect(formatBucketLabel(bucketUtc, "hour", "America/Sao_Paulo")).toBe("14:00");
```

### Riscos do Pacote H

| Risco | Mitigação |
|-------|-----------|
| Mudar o SQL pode invalidar caches que tinham bucket sem TZ | Bump cache key v3 → v4 nas queries afetadas (já bumpado em D11). |
| Container Node em produção pode estar em BRT (não UTC) por config legada — mudar SQL inverte o sentido do shift | Testar em staging antes do push. Como não há staging, validar com curl + comparação de prints depois do deploy. |
| Scroll horizontal pode atrapalhar acessibilidade | Adicionar `tabIndex={0}` no container scrollável + setas-reactivas (default do navegador atende). |

---

## 14. Pente fino #2 — riscos e edge cases adicionais **[v3]**

Após corrigir os 12 achados do pente #1, esta seção captura uma análise mais profunda. Cada item foi avaliado quanto a impacto e mitigação.

### 14.1 Edge cases confirmados

| # | Edge case | Comportamento esperado | Coberto por |
|---|-----------|------------------------|-------------|
| EC1 | Hoje é o 1º dia da semana (segunda) e usuário clica "Semana" | Janela = `00:00 hoje → fim do dia hoje` (igual a "Hoje") | Test em `dashboard-period.test.ts` |
| EC2 | Hoje é o 1º dia do mês (dia 1) e usuário clica "Mês" | Janela = `00:00 hoje → fim do dia hoje` | Test |
| EC3 | Virada de mês na semana (semana atravessa fim/início de mês) | `startOfWeek` do date-fns lida; semana pode começar em 27/abril e cobrir até 3/maio | Inerente ao date-fns |
| EC4 | `weekStartsOn=6` (sábado) e hoje é domingo | Semana começou ontem (sábado); janela = sáb_00:00 → dom 23:59 | Helper trata via date-fns |
| EC5 | `pctDiff(curr, 0)` quando curr > 0 | Retorna `null` (frontend mostra "—") | Já implementado em `pctDiff` |
| EC6 | `comparison.open === null` (período anterior sem volume) | Frontend trata via `trendFor` que retorna `null` → KPI sem trend visual | Já no `KpiClickableCard` |
| EC7 | Drill-down de status com `total === 0` | Mostra retângulo central com "0" + tabela com empty state + paginador escondido (`< pageSize`) | Lógica do `<DrillDownPagination>` |
| EC8 | "Hoje" + `mode = "rolling"` (impossible: hoje não tem mode) | Helper ignora mode; sempre dia atual | `if (period === "hoje")` short-circuita antes de checar mode |
| EC9 | `pageSize > 200` no input | Backend caps em 200 | `Math.min(200, pageSize)` no helper |
| EC10 | Scroll horizontal em desktop com 24h × 64px = 1536px largura, container ~1200px | `overflow-x-auto` ativa scroll; usuário pode arrastar | Implementação direta |

### 14.2 Riscos não-funcionais aceitos

| # | Risco | Decisão |
|---|-------|---------|
| RA1 | Mobile resize (rotacionar celular) não recalcula janela visível do scroll | Aceitável — `useEffect` corre uma vez no mount. v0.14 se reportado. |
| RA2 | localStorage residual `dashboard.chartType.conversations` (preferência antiga linha/barra) | Aceitável — apenas overhead de bytes; sem efeito funcional. |
| RA3 | Cache invalidation cross-container do `getDashboardSettings()` | Aceitável — settings mudam raramente; outros settings (`polling`, `visibility`) têm o mesmo padrão e não causaram problema em produção. |
| RA4 | `OFFSET 5000 LIMIT 50` em paginação muito profunda | Cap de pageSize=200 + UX desencoraja navegar 100+ páginas. Keyset pagination fica para quando reportado. |
| RA5 | Acessibilidade do scroll horizontal para leitores de tela | `tabIndex={0}` + `aria-label` no container. Usuário com leitor pode acessar tabela paginada (alternativa via teclado já cobre). |
| RA6 | i18n hardcoded pt-BR (`"agora"`, `"há Xh"`, `"Janela: …"`) | Plataforma é single-tenant pt-BR; não há requisito de i18n. |

### 14.3 Mudança de contrato — checklist final

Resumo do que muda no payload que clientes (browsers de João e equipe) recebem:

| Endpoint / Server Action | Antes | Depois (v0.13.0) | Compat |
|--------------------------|-------|------------------|--------|
| `getDashboardData → comparison` | `{ received, resolved, resolutionRate }` (rate em pp) | `{ received, resolved, open, resolutionRate }` (todos em %) | ❗ `resolutionRate` semântica muda |
| `getOpenDrillDownAction` payload | `{ total, byStatus[], byInbox[], open[] }` | wrapper para `getStatusDrillDownAction({status:0})` que retorna `{ status, total, byInbox[], items[], page, pageSize }`. **`byStatus` removido** porque a coorte é única (status fixado). | ❗ campo `byStatus` removido. Frontend antigo no browser do user pode quebrar até hard-refresh. Bump de cache key é suficiente (server respeita schema atual; browser carrega novo bundle no hard-refresh). |
| `getResolutionRateDrillDownAction → diffPp` | sempre presente | mantido + `diffPct` adicional | ✅ |
| `getReceivedDrillDownAction` | `{ ..., recent[] }` (até 20) | `{ ..., items[], page, pageSize, total, recent[] (alias) }` | ✅ |

**[v3]** Todo deploy de Next.js 16 com client components serve novos chunks no build; após o redeploy, hard-refresh do browser garante client compatível. Como o ServerAction roda server-side e o payload é JSON, o browser apenas precisa do novo client bundle — caching de assets do Next gerencia automaticamente.

### 14.4 Auditoria final

Ao final da implementação, antes do release, validar:

- [ ] `grep -rn '"7d"\|"30d"\|"today"' src/` retorna apenas comentários ou strings explicitamente literais (nenhum tipo nominal).
- [ ] `grep -rn "diffPp" src/components/dashboard/` retorna 0 (frontend só usa `diffPct`).
- [ ] `grep -rn "useLineBarStorage\|ChartLineBarToggle" src/` retorna 0.
- [ ] `grep -rn "shouldExcludeMatrixIA\|excludeMatrixIA" src/lib/chatwoot/queries/` mostra que toda query relevante respeita o filtro.
- [ ] `npm run typecheck` 0 erros.
- [ ] `npm test` 100% PASS.
- [ ] `npm run build` verde.
- [ ] `/api/health` retorna `version=v0.13.0` após o deploy.
