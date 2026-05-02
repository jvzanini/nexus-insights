---
agent: claude-dashboard-polish-v022
started_at: 2026-05-02T05:30-03:00
target_version: v0.22.0
status: in_progress
---

## Tópico
Polish do Dashboard (v0.22.0): (1) PeriodNavigator maior/tag-style; (2) bugfix gráfico semana/mês inconsistente com dia; (3) KPIs 4-do-topo no padrão consumo (label UPPERCASE/valor 3xl/subtitle "no período"); (4) drill-downs dos 4 KPIs alinhados (renomear "Inbox"→"Estado", "Distribuição por hora" labels só HH:00, yAxisWidth maior pra ver todos os estados, tags âmbar em "Quando", badge destaque em "X no total", coluna Departamento); (5) bugfix drill-down "Conversas sem resposta" — total inconsistente com widget (31 vs 11) por usar created_at sem filtro msg_type; (6) substituir "Resumo / Snapshot atual" por donut "Faixa de espera" 4 buckets; (7) tabela do drill-down sem-resposta: remover coluna "Última msg" duplicada, renomear "Inbox"→"Estado", adicionar "Departamento", tag âmbar em "Esperando há".

Modo autônomo total confirmado pelo João. Volto só após push + deploy + memória.

## Arquivos que provavelmente vou tocar
- src/components/dashboard/period-navigator.tsx (UI tag-style, text-sm)
- src/components/dashboard/conversations-line-chart.tsx (layout do header, possível fix em fillBuckets)
- src/components/dashboard/kpi-clickable-card.tsx (refactor pro padrão consumo)
- src/components/dashboard/drill-down-contents.tsx (renames + tags + colunas)
- src/components/dashboard/no-response-drill-down.tsx (substituir Snapshot por donut, fix tabela)
- src/lib/chatwoot/queries/dashboard-drill-down.ts (alinhar getNoResponseDrillDown com dashboardData.noResponse)
- src/lib/chatwoot/queries/dashboard-data.ts (investigar bug semana/mês — possível ajuste em fillBuckets ou query)
- src/lib/utils/format-bucket.ts ou src/lib/format/relative-time.ts (helper de tag âmbar pro "Quando")
- NEW: src/components/dashboard/__tests__/period-navigator.test.tsx (size assertions)
- NEW: src/components/dashboard/__tests__/no-response-drill-down.test.tsx (faixa de espera)
- NEW: docs/superpowers/specs/2026-05-02-dashboard-polish-v022-design.md (v1, v2, v3)
- NEW: docs/superpowers/plans/2026-05-02-dashboard-polish-v022.md (v1, v2, v3)
- package.json (bump 0.20.0 → 0.22.0 — pulo v0.21 que está com claude-empresa-ativa-global)
- CHANGELOG.md (release notes v0.22.0)
- docs/STATUS.md

## Arquivos compartilhados que VOU modificar
- package.json (bump versão — escolho v0.22.0 pra não colidir com v0.21 em curso)
- CHANGELOG.md
- docs/STATUS.md

## Arquivos NÃO posso tocar (outros agentes ativos)
- claude-empresa-ativa-global: src/app/(protected)/dashboard/page.tsx, src/lib/reports/active-account.ts, src/lib/llm/{tools,agent}/* — não preciso tocar nenhum
- claude-nex-suite-polish-v020: src/components/charts/{area-chart,bar-chart,donut-with-center}.tsx, src/components/agente-nex/*, src/components/llm/*, src/lib/llm/{pricing,catalog}.ts, src/lib/nex/prompt.ts, prisma/schema.prisma — vou usar os charts genéricos como API pública (`<DonutWithCenter>`, `<InteractiveAreaChart>`, `<InteractiveBarChart>`) sem editar os arquivos deles

## Decisões / contexto importante
- **Workflow rigoroso (CLAUDE.md §2.1 + §3)**: spec v1→review#1→v2→review#2→v3 + plan v1→v2→v3 + subagent-driven-development com TDD por task + ui-ux-pro-max em qualquer task UI.
- **Bug 1 (semana/mês inconsistente com dia)**: hipótese principal é alinhamento de bucket-key entre query SQL (`date_trunc('day', created_at AT TIME ZONE tz) AT TIME ZONE tz`) e fillBuckets do client (`Intl.DateTimeFormat en-CA timeZone tz`). Validar em runtime com console.log → identificar qual lado erra → corrigir.
- **Bug 2 (no-response 31 vs 11)**: confirmado por leitura do código. Widget (`dashboard-data.ts:452-508`) usa `last_activity_at >= start AND < end` + `message_type IN (0,1)` no last_msg. Drill-down (`dashboard-drill-down.ts:1118-1226`) usa `created_at` sem filtro de message_type. Fix: alinhar drill-down ao widget.
- **PeriodNavigator alvo**: text-sm font-medium px-3 py-1.5 rounded-lg, border violeta sutil (igual checkboxes), conteúdo "← {label} →" com chevrons maiores (h-4 w-4), label tabular-nums.
- **KPI cards alvo**: refactor de kpi-clickable-card.tsx pra layout do KpiCard (consumo): label UPPERCASE text-xs em cima, valor 3xl font-bold, subtitle "no período" muted text-xs, ícone top-right h-9 w-9, mantém sparkline + hover "ver detalhes" + click handler. Tour data-attrs preservados.
- **Donut "Faixa de espera"**: 4 buckets fixos calculados client-side a partir de `data.items[].waitingSeconds`: 0-4h (text-yellow-400), 4-24h (text-amber-400), 1-3d (text-orange-400), >3d (text-red-400). Mostra fatia + count.
- **Renomear "Inbox" → "Estado"**: estritamente nas tabelas/headers/labels exibidas ao usuário, NÃO em campos internos (`inbox_name`, `inboxId`, etc — refatorar isso seria escopo gigante e sem ganho real).
- **Coluna "Departamento"**: requer enriquecer queries de drill-down com `c.team_id → teams.name`. Adiciona JOIN.
- **Tag âmbar "Quando"**: usa o mesmo helper `formatDuration` + classe `bg-amber-500/10 text-amber-400 px-2 py-1 rounded-md text-xs font-semibold tabular-nums` (consistente com no-response-card).
- **Versão**: target v0.22.0 (pulo v0.21 que está em curso com claude-empresa-ativa-global).
- **Modo autônomo total**: sem aprovação durante o caminho. Notifico só ao final com push + memória atualizada + screenshots.

## Bloqueios
- (nenhum por ora — coordenado com os 2 agentes ativos via files-not-to-touch acima)
