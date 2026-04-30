# Dashboard v0.10 — Redesign "Pulse"

> Spec consolidada (v3). Brainstorm autônomo: João aprovou todas as recomendações em bloco e pediu que eu siga até o deploy.

## Contexto

Em v0.9.x o dashboard tem 3 problemas fundamentais que o tornam inutilizável como ferramenta operacional:

1. **Métricas inconsistentes com o filtro de período** — "Abertas" é sempre snapshot global (ex.: 1.475) mesmo com "Hoje"; "Taxa de resolução" usa coortes diferentes para numerador e denominador (resolvidas por `last_activity_at` ÷ recebidas por `created_at`), gerando 131,6%.
2. **Timezone errada** — chart "Conversas por hora" mostra 15:00 quando o relógio do operador é 13:40 BRT. SQL trunca em `America/Sao_Paulo`, mas a serialização para ISO + render no navegador re-interpreta como UTC.
3. **Informação inútil** — "Departamentos com mais resolvidas" não responde nenhuma pergunta operacional. Não há panorama de "o que precisa de atenção agora?". Drill-downs são side-sheets estreitos. Não há gráfico de pizza/barra clicável. Sem priorização visual de conversas sem resposta.

Além disso, há lixo de UX: seletor de conta duplicado (sidebar e dashboard), avatares "?" em cards top-5, listas onde gráficos seriam melhores.

## Princípios

- **Coorte única**: KPIs do mesmo período compartilham o mesmo recorte. Tudo que respeita período usa `created_at` no período como denominador. Nada de comparar peixe com bicicleta.
- **Snapshot só quando o usuário pediu**: o único elemento explicitamente "agora" é o card de "Sem resposta" (sempre operacional, no momento). Todo o resto segue o filtro.
- **Gráficos > listas**: barras horizontais e donut substituem listas top-5 quando há comparação visual. Listas só ficam onde a ordem é o ponto (atendentes mais rápidos).
- **Tudo clicável é drill-down**: bar/slice/KPI abre modal central grande com a lista filtrada e contexto.
- **Modal central ≠ side-sheet**: drill-down passa a ser um Dialog centralizado de até 1280px (xl) e 90dvh — substitui o side sheet atual.
- **Timezone é da plataforma, sempre**: render em `America/Sao_Paulo` (lido de `app_settings.platform.timezone`). Nada de `new Date(iso)` puro no formatador.
- **Conta global e única**: o seletor de conta vive no sidebar (componente `AccountSwitcher`). Toda página obedece o cookie `active_account`. Dashboard não tem seletor próprio.

## Decisões trancadas

### KPI semântico (v0.10)

| Card | Definição | Consulta |
|------|-----------|----------|
| Recebidas | conversas com `created_at` no período | `COUNT(*) WHERE created_at ∈ período` |
| Resolvidas | conversas que **estão resolvidas agora** E foram criadas no período | `COUNT(*) WHERE created_at ∈ período AND status = 1` |
| Abertas | conversas que **estão `open` agora** E foram criadas no período | `COUNT(*) WHERE created_at ∈ período AND status = 0` |
| Taxa de resolução | `resolvidas / recebidas` na mesma coorte | `resolvidas ÷ recebidas`, sempre ≤ 100% |

Comparação vs período anterior (`prevPeriod`) segue idêntica em estrutura.

> **Nota:** com "Hoje" selecionado às 13:40, "Abertas" deixa de ser 1.475 e passa a ser apenas as criadas hoje que ainda estão abertas (provavelmente algo entre 5–25 dependendo do dia). Esse é o comportamento desejado.

### Card "Sem resposta agora" (novo, hero)

- **Definição**: `status = 0` (apenas `open` — nunca `pending` (2), `snoozed` (3) ou `resolved` (1)) E última mensagem visível da conversa é do **contato** (`message_type = 0`).
- **Ancorado ao filtro de período** (Hoje/7d/30d): o card mostra conversas criadas dentro do período selecionado que estão aberta+sem-resposta. Com "Hoje" → criadas hoje aguardando resposta; com "7 dias" → criadas nos últimos 7 dias aguardando.
- **Reaproveita lógica** de `src/lib/chatwoot/queries/mensagens-nao-respondidas.ts` (CTE `last_msg DISTINCT ON conversation_id` + filtro `message_type = 0`). Adiciono filtro `created_at ∈ período`.
- **Apresentação**: card destaque ocupando coluna larga, ao lado do top atendentes, com:
  - Contador grande (ex.: `12 conversas aguardando resposta`)
  - Tempo da mais antiga em formato humano (ex.: `mais antiga: 1h 23min`)
  - Lista preview com até 5 linhas (contato, inbox, atendente, "esperando há X" via `formatDistanceToNow` pt-BR)
  - Botão "Ver todas" → drill-down central
- **Cor**: âmbar/laranja como acento; sem alarmes vermelhos (operadores não querem dashboards que gritam).
- **Empty state**: ícone `CheckCircle2` esmeralda + "Tudo respondido. Nenhuma conversa aguardando."

### Distribuição por departamento (novo, substitui "Top resolvidas")

- **Coorte**: criadas no período `AND` status ∈ (0, 2, 3) — **open, pending, snoozed**. Resolvidas explicitamente excluídas (já fechadas).
- **Bucket "Sem departamento"**: conversas com `team_id IS NULL` formam a barra "Sem departamento" sempre presente quando count > 0. Não é filtrada nem escondida.
- **Visualização**: bar chart horizontal (default) com toggle para donut (≤ 5 categorias) ou stacked-bar (> 5 categorias, default automático). Click na barra → drill-down central com lista de conversas daquele departamento.
- **Animação**: barras crescem por width-transform (transform-only, GPU-friendly) com stagger 30ms. Hover: barra fica opaca; outras escurecem 40%.
- **Conexão com filtro**: ao mudar período, refaz query e anima a transição.

### Distribuição por inbox (atualizado)

Idêntico ao de departamento, mas:
- **Coorte**: criadas no período AND `status = 0` (apenas em aberto agora — é a leitura "onde está parado, hoje?").
- Toggle bar/donut.
- Click → drill-down filtrado.

### Distribuição por status (substitui top inboxes em aberto + dá visão completa)

- Donut com 4 fatias: Aberto, Pendente, Adiado, Resolvido (cores: âmbar, violeta, slate, esmeralda).
- Coorte: criadas no período.
- Centro do donut mostra total (recebidas).
- Click na fatia → drill-down do status.

### Atendentes mais rápidos (mantém)

- Lista (não vira gráfico). Ordem é o ponto.
- Mantém comportamento atual: `first_response` no período, mín. 3 amostras, top 5.
- Adiciona link "Ver ranking completo" → drill-down com top 20.

### Conversas recentes (mantém)

- Tabela das 10 mais recentes, mantém comportamento atual (já tem `StatusBadge`, sem avatar).
- Sem mudanças visuais. O "?" reportado pelo João aparecia em outra seção (top-5 com avatar de team), que vira chart e não tem mais avatar — o problema deixa de existir naturalmente.

### Drill-down central (substitui DrillDownSheet lateral)

- Componente novo: `<DrillDownDialog>` baseado em `Dialog` do `base-ui`.
- **Tamanho**: `max-w-6xl` (1152px), `max-h-[90dvh]`, centralizado, com backdrop blur sutil.
- **Mobile (< 768px)**: vira full-screen sheet (top-to-bottom). Sem drag-handle (não é bottom sheet).
- **Header**: ícone (44×44 hit area), título, subtítulo, botão fechar. Pode ter `headerExtra` (ex.: filtro adicional).
- **Body**: scroll interno, padding 24px, comporta múltiplas seções (`DrillDownSection`).
- **Movimentação**: scale-fade do trigger (200ms ease-out na entrada, 140ms ease-in na saída). Respeita `prefers-reduced-motion`.
- **Migração**: `DrillDownSheet` é mantido por compatibilidade (outros relatórios usam), mas dashboard adota `DrillDownDialog` exclusivamente. Renomear `DrillDownSheet` → `DrillDownPanel` num passo posterior fica fora desse escopo.

### Toggle bar/donut nos charts comparativos

- Componente novo: `<ChartTypeToggle>` (segmented control, 32px height, dois ícones — `BarChart3` e `PieChart` da lucide).
- Persiste no `localStorage` por chart key (`dashboard.chartType.<key>`).
- Default: bar (mais legível para ranking).
- Donut só é selecionável se categorias ≤ 6; caso contrário, toggle desabilita o donut com tooltip explicando.
- Click na barra/fatia → mesmo drill-down.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Olá, João Zanini                          🟢 Atualizado 1m  │
│ Quinta, 30 de abril 2026                  [Tour] [⟳]        │
├─────────────────────────────────────────────────────────────┤
│ [Hoje] [7 dias] [30 dias]                                   │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐            │
│ │Recebidas ││Resolvidas││Abertas   ││Taxa res. │  ← KPIs    │
│ │   19  ▼  ││   12  ▲  ││    7     ││  63.2%   │  clicáveis │
│ └──────────┘└──────────┘└──────────┘└──────────┘            │
├─────────────────────────────────────────────────────────────┤
│ ╔═══════════════════════════════════════════╗ ┌──────────┐ │
│ ║ 🔔 12 sem resposta agora · mais ant: 1h23 ║ │Atendentes │ │
│ ║                                            ║ │mais ráp.  │ │
│ ║ Ana Paula · SP · Arthur · esperando 1h23  ║ │ 1.Arthur  │ │
│ ║ Bruno Lima · MG · — · esperando 47min     ║ │   5s      │ │
│ ║ ... [ver todas]                            ║ │ 2.Gabriely│ │
│ ╚═══════════════════════════════════════════╝ └──────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Conversas por hora                       [📊][📈]       │ │
│ │ (line/bar toggle, line default)                          │ │
│ │                                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌──────────────────────────┐   │
│ │ Inboxes em aberto       │ │ Departamentos (em abert) │   │
│ │ [📊][🍩]                │ │ [📊][🍩]                 │   │
│ │ ▓▓▓▓▓▓▓▓ Matrix IA  916 │ │ ▓▓▓▓▓▓▓ Comercial    14  │   │
│ │ ▓▓ SP            87     │ │ ▓▓▓▓ Qualidade       8   │   │
│ │ ▓ MG             70     │ │ ▓▓ Sem departamento  3   │   │
│ └─────────────────────────┘ └──────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Distribuição por status (donut)                          │ │
│ │       [Aberto 7][Pendente 4][Adiado 2][Resolvido 12]    │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Conversas recentes                                       │ │
│ │ Quando · Contato · Inbox · Atendente · Status            │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Sem seletor de conta na linha de filtros (mora no sidebar). Refresh continua à direita das pills.

### Cores e hierarquia

- **Violeta** (#8b5cf6 / `violet-500`): primária — KPIs principais, tour, ações.
- **Esmeralda** (#10b981 / `emerald-500`): sucesso — resolvidas, taxa.
- **Âmbar** (#f59e0b / `amber-500`): atenção — abertas, sem resposta.
- **Slate** (#64748b): neutro — adiado, "sem departamento".
- **Vermelho rosa** (#f43f5e): crítico — só usado em sem-resposta > 2h.
- **Background**: `bg-card` em todos os cards; sem hierarquia por elevação (todos cards na mesma altura).

### Microinterações

- KPI hover: scale 1.01, sombra suave, cursor pointer (200ms ease-out).
- Bar/slice hover: outras opções com opacity 0.4, item hover com glow 0 0 8px.
- Click feedback: scale 0.98 por 80ms.
- Stagger entrada: KPIs 80ms cada, charts 120ms.
- Skeleton loading: pulse 1.5s, dimensões idênticas ao conteúdo final (sem CLS).

### Empty states

- KPI sem dados: mostra `0` + "—" no trend.
- Sem resposta: ícone CheckCircle2 verde + "Tudo respondido. Nenhuma conversa aguardando."
- Departamentos sem dados: ícone Users + "Sem conversas em aberto no período."
- Chart sem dados: linha tracejada sutil + texto centralizado "Sem dados no período."

### Acessibilidade

- KPI: `<button>` com `aria-label="Ver detalhes de {kpi}"`.
- Bars/slices: focusable via teclado (Tab), Enter/Space dispara drill-down.
- Drill-down: foco vai para o título ao abrir; ESC fecha; backdrop click fecha.
- Cores: contraste ≥ 4.5:1 em todos os textos. Status dot tem `<span class="sr-only">{label}</span>`.
- Reduced motion: animações reduzem para 80ms (não 0) para preservar feedback de estado.
- Tour atualizado para refletir o novo layout (acréscimo de etapas para "sem resposta", "departamentos novos" e "drill-down central"); número final flexível, mas estimativa 12–13 etapas.

## Mudanças no backend

### `src/lib/chatwoot/queries/dashboard-data.ts`

Reescrita parcial:

1. **Campos novos**: `noResponseCount`, `noResponseOldestSeconds`, `noResponsePreview[]` (top 5).
2. **Stats.open** muda de SQL (não snapshot global; `created_at ∈ período AND status = 0`).
3. **Stats.resolved** muda: `created_at ∈ período AND status = 1` (mesma coorte de recebidas).
4. **Resolution rate** recalcula sem mudar campo (já é `resolved/received`, mas agora com mesma coorte → ≤ 100%).
5. **Top inboxes** muda: `created_at ∈ período AND status = 0` (era snapshot global).
6. **Top teams** vira **byTeam**: `created_at ∈ período AND status IN (0,2,3)`. Inclui bucket `(name = 'Sem departamento', id = null)` via `LEFT JOIN teams` e fallback.
7. **byStatus** novo campo: 4 contadores no período (open, pending, snoozed, resolved).
8. **noResponse**: subquery — última mensagem é do contato (`message_type = 0`) E `status = 0`. Cap 50 itens, ordena por `created_at` ascendente (mais antiga primeiro).

Pull-through cache continua (TTL 30s).

### `src/lib/chatwoot/queries/dashboard-drill-down.ts`

- Novo: `getNoResponseDrillDown(accountId, period)` — lista completa, agrupável por inbox/atendente, paginação 50/página.
- Novo: `getByTeamDrillDown(accountId, period, teamId | null)` — lista por departamento (incluindo `team_id IS NULL`).
- Drill-downs existentes (`open`, `received`, `resolved`, `rate`) ajustam coortes para refletir as novas semânticas (mesma coorte de criação).

### Sanitização de nomes

- `topTeams`/`topInboxes`: `name` é trimmed; emoji prefix mantido (Chatwoot usa); fallback `(sem nome)` quando vazio. Evitamos avatares com initials para teams; use ícone `Users` da lucide.

### Timezone (fix definitivo)

- Server: SQL já trunca em TZ. Manter.
- Server → cliente: bucket é serializado como ISO. **No cliente, render usa `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` explícito** (lido de cookie/setting passado via prop ou contexto). Helper novo: `formatBucketLabel(iso, granularity, tz)`.
- Aplica a `conversations-line-chart.tsx`, `drill-down-contents.tsx` e qualquer formatador novo.

## Componentes

### Novos

- `src/components/ui/drill-down-dialog.tsx` — Dialog centralizado (substitui `DrillDownSheet` no dashboard).
- `src/components/dashboard/no-response-card.tsx` — card hero.
- `src/components/dashboard/department-distribution-card.tsx` — bar/donut com toggle.
- `src/components/dashboard/inbox-distribution-card.tsx` — bar/donut com toggle.
- `src/components/dashboard/status-distribution-card.tsx` — donut.
- `src/components/dashboard/chart-type-toggle.tsx` — segmented control.
- `src/components/dashboard/no-response-drill-down.tsx` — conteúdo do drill.
- `src/components/dashboard/team-drill-down.tsx` — conteúdo do drill por departamento.
- `src/components/ui/status-dot.tsx` — ponto colorido por status (acessível, com sr-only).

### Alterados

- `src/components/dashboard/dashboard-content.tsx` — novo layout, novos componentes.
- `src/components/dashboard/dashboard-filters.tsx` — remove seletor de conta.
- `src/components/dashboard/conversations-line-chart.tsx` — toggle bar/line, formatador TZ-aware.
- `src/components/dashboard/recent-conversations-table.tsx` — substitui avatar circle por status dot.
- `src/components/dashboard/drill-down-contents.tsx` — usar novas semânticas, novos campos.
- `src/lib/tours/dashboard-tour.ts` — 12 etapas (sem-resposta + departamentos novos).
- `src/lib/chatwoot/queries/dashboard-data.ts` — reescrita parcial conforme acima.
- `src/lib/chatwoot/queries/dashboard-drill-down.ts` — novos handlers.
- `src/lib/actions/dashboard.ts` e `dashboard-drill-down.ts` — expor novos campos e endpoints.
- `src/app/(protected)/dashboard/page.tsx` — passa `tz` para o componente cliente.

### Removidos

- Uso de `DrillDownSheet` no dashboard (componente segue existindo p/ outros relatórios).
- `topTeams` no contrato `DashboardData` (substituído por `byTeam`/`byStatus`).
- Avatar com initials nos top-5 (substituído por ícones lucide / status dot).

## Riscos e mitigações

- **Coorte nova de "open" pode quebrar comparação histórica**: o card "abertas" vai mostrar nº muito menor. Adiciono um helper text discreto: "criadas no período e ainda abertas".
- **Click em barra com 0 conversas**: drill-down precisa empty state graceful (não 404).
- **Donut com > 6 categorias**: toggle bloqueia, mantém bar.
- **TZ leitura assíncrona**: passo o `tz` via prop server → client uma vez (page já é server component); sem fetch repetido no cliente.
- **Pré-agregação (v0.8.0) já existe**: as queries do dashboard ainda batem direto no Chatwoot por enquanto. Migração para facts fica para v0.11. Documento isso em runbook.
- **Cache stale após mudança de coorte**: bumpar versão da chave de cache (`dashboard:v2:...`) para invalidar entradas antigas.

## Out of scope

- Migração das queries do dashboard para a camada de pré-agregação (`facts.ts`) — fica para v0.11.
- Custom range no dashboard — manter Hoje/7d/30d. (Já há suporte em outros relatórios.)
- Notificações push de "sem resposta" — fica para versão futura.
- Permissão de visualização do card "sem resposta" por role — assume todos viewers veem.

## Critérios de aceitação

1. KPI "Abertas" com "Hoje" mostra apenas conversas criadas hoje que estão `status=0` agora — não 1.475.
2. Taxa de resolução nunca passa de 100% e é matematicamente coerente com Recebidas/Resolvidas.
3. Chart "Conversas por hora" mostra horários BRT corretos (13:00, 14:00…) independente da TZ do navegador.
4. Sidebar é o único seletor de conta; filtros do dashboard não têm dropdown de empresa/conta.
5. Card "Sem resposta" aparece logo abaixo dos KPIs, mostra contagem, mais antiga e top 5, com botão "Ver todas".
6. "Departamentos" mostra bucket "Sem departamento" sempre que houver conversas elegíveis sem `team_id`. Coorte é open+pending+snoozed do período.
7. Bar charts (inbox, departamento) têm toggle bar/donut, persistem em localStorage.
8. Click em qualquer barra/fatia/KPI abre drill-down central (modal de até 1152px, 90dvh), não side-sheet.
9. Drill-down "Sem resposta" lista todas as conversas, ordenadas por tempo de espera desc.
10. Tour atualizado e funcional para o novo layout (cobrindo todos os blocos).
11. Sem regressão de a11y: keyboard navigation completa, contrast ratios mantidos.
12. Sem regressão visual em outras telas (DrillDownSheet ainda funciona em Conversas/etc).
13. Polling 60s + SSE `facts:refreshed` continuam atualizando o dashboard sem reload.
14. Sem ícones "?" na UI do dashboard.
15. CHANGELOG.md atualizado, design-system MASTER atualizado, memória `project_v0.10.0_release.md` criada.

## Plano de release

- Versão: **v0.10.0**.
- Branch: `main` (autônomo, push direto após verificação completa).
- Migrations: nenhuma (apenas reads novos).
- Cache bump: `dashboard:v2:*` (invalida v1 ao subir).
- Deploy: GitHub Actions → ghcr.io → Portainer redeploy.
- Rollback: revertendo o commit anterior (zero-state migration friendly).
